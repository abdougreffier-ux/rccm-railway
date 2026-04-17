import uuid as uuid_module
from django.db import models
from django.utils import timezone
from apps.utilisateurs.models import Utilisateur
from apps.parametrage.models import Localite


class ImmatriculationHistorique(models.Model):
    """
    Demande d'immatriculation historique : reprise de dossiers anciens
    sans passage par le workflow classique RC.
    """
    STATUT_CHOICES = [
        ('BROUILLON',   'Brouillon'),
        ('EN_INSTANCE', 'En instance'),
        ('RETOURNE',    'Retourné'),
        ('VALIDE',      'Validé'),
        ('REJETE',      'Rejeté'),
        ('ANNULE',      'Annulé'),
    ]
    TYPE_CHOICES = [
        ('PH', 'Personne physique'),
        ('PM', 'Personne morale'),
        ('SC', 'Succursale'),
    ]

    uuid           = models.UUIDField(default=uuid_module.uuid4, unique=True, editable=False)
    numero_demande = models.CharField(max_length=20, unique=True, verbose_name='N° demande')
    statut         = models.CharField(max_length=20, choices=STATUT_CHOICES, default='BROUILLON', db_index=True)
    type_entite    = models.CharField(max_length=2, choices=TYPE_CHOICES)

    # ── Données historiques (saisies manuellement) ────────────────────────────
    numero_ra            = models.CharField(max_length=30, unique=True, verbose_name='N° analytique')
    numero_chrono        = models.IntegerField(verbose_name='N° chronologique')
    annee_chrono         = models.IntegerField(verbose_name='Année du chrono')
    date_immatriculation = models.DateTimeField(verbose_name="Date et heure d'immatriculation")
    localite             = models.ForeignKey(Localite, null=True, blank=True,
                                             on_delete=models.SET_NULL, verbose_name='Greffe')

    # ── Données entreprise (JSON) ─────────────────────────────────────────────
    donnees = models.JSONField(default=dict, blank=True)

    # ── Workflow ──────────────────────────────────────────────────────────────
    observations = models.TextField(blank=True)
    demandeur    = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')
    validated_at = models.DateTimeField(null=True, blank=True)
    created_by   = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='hist_crees')
    validated_by = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='hist_valides')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    # ── Import batch ──────────────────────────────────────────────────────────
    import_batch = models.CharField(max_length=50, blank=True)
    import_row   = models.IntegerField(null=True, blank=True)

    # ── Lien vers le RA créé après validation ─────────────────────────────────
    ra = models.OneToOneField(
        'registres.RegistreAnalytique', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='immatriculation_historique',
    )

    class Meta:
        db_table        = 'immatriculations_historiques'
        unique_together = [('numero_chrono', 'annee_chrono')]
        ordering        = ['-created_at']
        verbose_name        = 'Immatriculation historique'
        verbose_name_plural = 'Immatriculations historiques'

    def __str__(self):
        return f'IH {self.numero_demande} — {self.numero_ra}'

    # ── Création des entités réelles après validation ─────────────────────────
    def appliquer(self):
        """Crée les entités (PH/PM/SC) + RA à partir de `donnees`. Retourne le RA."""
        from apps.registres.models import RegistreAnalytique, Associe, Gerant, RADomaine
        from apps.entites.models import PersonnePhysique, PersonneMorale, Succursale

        d             = self.donnees
        numero_rc_ref = f"{self.annee_chrono}/{self.numero_chrono}"
        now           = self.validated_at or timezone.now()

        # ── Bénéficiaire effectif ─────────────────────────────────────────────
        from datetime import timedelta
        choix_be       = d.get('choix_be', '')
        statut_be      = 'NON_DECLARE'
        date_decl_be   = None
        date_limite_be = None
        # date_immatriculation est un DateTimeField ; RA.date_immatriculation est un DateField
        _date_immat_date = (
            self.date_immatriculation.date()
            if self.date_immatriculation
            else None
        )
        if choix_be == 'immediat':
            statut_be    = 'DECLARE'
            date_decl_be = now
        elif choix_be == '15_jours':
            statut_be      = 'EN_ATTENTE'
            date_limite_be = _date_immat_date + timedelta(days=15) if _date_immat_date else None

        ra_kwargs = dict(
            numero_ra=self.numero_ra,
            numero_rc=numero_rc_ref,
            date_immatriculation=_date_immat_date,
            statut='IMMATRICULE',
            localite=self.localite,
            created_by=self.created_by,
            validated_by=self.validated_by,
            validated_at=now,
            statut_be=statut_be,
            date_declaration_be=date_decl_be,
            date_limite_be=date_limite_be,
        )

        # ── Personne physique ─────────────────────────────────────────────────
        if self.type_entite == 'PH':
            ph = PersonnePhysique.objects.create(
                nom=d.get('nom', ''),
                prenom=d.get('prenom', ''),
                nom_ar='',
                prenom_ar='',
                nni=d.get('nni') or None,
                num_passeport=d.get('num_passeport', ''),
                nationalite_id=d.get('nationalite_id') or None,
                date_naissance=d.get('date_naissance') or None,
                lieu_naissance=d.get('lieu_naissance', ''),
                adresse=d.get('adresse', ''),
                ville='',
                telephone=d.get('telephone', ''),
                email='',
                profession='',
                created_by=self.created_by,
            )
            ra = RegistreAnalytique.objects.create(type_entite='PH', ph=ph, **ra_kwargs)

            # Créer le gérant si ce n'est pas elle/lui-même
            gerant_data = d.get('gerant', {})
            if gerant_data.get('type') == 'other':
                # Stocker NOM seul dans nom_gerant, prénom dans donnees_ident
                # pour respecter la règle d'affichage RCCM : PRÉNOM puis NOM
                _nom_g_ph    = (gerant_data.get('nom_gerant', '') or '').strip()
                _prenom_g_ph = (gerant_data.get('prenom_gerant', '') or '').strip()
                if _nom_g_ph or _prenom_g_ph:
                    Gerant.objects.create(
                        ra=ra,
                        nom_gerant=_nom_g_ph,
                        nationalite_id=gerant_data.get('nationalite_id') or None,
                        fonction_id=gerant_data.get('fonction_id') or None,
                        date_debut=_date_immat_date,
                        actif=True,
                        donnees_ident={'prenom': _prenom_g_ph} if _prenom_g_ph else {},
                    )

        # ── Personne morale ───────────────────────────────────────────────────
        elif self.type_entite == 'PM':
            # Sync dénomination bilingue — déclaration juridique libre, mixte AR/FR autorisé
            _denom_pm    = d.get('denomination', '') or ''
            _denom_ar_pm = d.get('denomination_ar', '') or ''
            if _denom_pm and not _denom_ar_pm:
                _denom_ar_pm = _denom_pm
            elif _denom_ar_pm and not _denom_pm:
                _denom_pm = _denom_ar_pm
            pm = PersonneMorale.objects.create(
                denomination=_denom_pm,
                denomination_ar=_denom_ar_pm,
                sigle=d.get('sigle', ''),
                forme_juridique_id=d.get('forme_juridique_id') or None,
                capital_social=d.get('capital_social') or None,
                devise_capital=d.get('devise_capital', 'MRU'),
                duree_societe=d.get('duree_societe') or None,
                siege_social=d.get('siege_social', ''),
                ville=d.get('ville', ''),
                telephone=d.get('telephone', ''),
                fax=d.get('fax', ''),
                email=d.get('email', ''),
                site_web=d.get('site_web', ''),
                bp=d.get('bp', ''),
                created_by=self.created_by,
            )
            ra = RegistreAnalytique.objects.create(type_entite='PM', pm=pm, **ra_kwargs)

            for a in d.get('associes', []):
                a_type = a.get('type', 'PH')
                if a_type == 'PM':
                    denom = a.get('denomination', '') or a.get('nom_associe', '')
                    if denom:
                        Associe.objects.create(
                            ra=ra,
                            type_associe='PM',
                            nom_associe=denom,
                            nationalite_id=a.get('nationalite_id') or None,
                            nombre_parts=0,
                            pourcentage=a.get('part_sociale') or a.get('pourcentage') or None,
                            date_entree=_date_immat_date,
                            actif=True,
                            donnees_ident={
                                'denomination':        denom,
                                'numero_rc':           a.get('numero_rc', ''),
                                'siege_social':        a.get('siege_social', ''),
                                'date_immatriculation': a.get('date_immatriculation'),
                            },
                        )
                else:  # PH (default)
                    # Stocker NOM seul dans nom_associe, prénom dans donnees_ident
                    # pour respecter la règle d'affichage RCCM : PRÉNOM puis NOM
                    nom = (a.get('nom', '') or '').strip() or (a.get('nom_associe', '') or '').strip()
                    if nom:
                        Associe.objects.create(
                            ra=ra,
                            type_associe='PH',
                            nom_associe=nom,
                            nationalite_id=a.get('nationalite_id') or None,
                            nombre_parts=0,
                            pourcentage=a.get('part_sociale') or a.get('pourcentage') or None,
                            date_entree=_date_immat_date,
                            actif=True,
                            donnees_ident={
                                'prenom':        a.get('prenom', ''),
                                'nni':           a.get('nni', ''),
                                'num_passeport': a.get('num_passeport', ''),
                                'date_naissance': a.get('date_naissance'),
                                'lieu_naissance': a.get('lieu_naissance', ''),
                                'telephone':     a.get('telephone', ''),
                                'domicile':      a.get('domicile', ''),
                            },
                        )

            for g in d.get('gerants', []):
                # Stocker NOM seul dans nom_gerant, prénom dans donnees_ident
                # pour respecter la règle d'affichage RCCM : PRÉNOM puis NOM
                nom_g = (g.get('nom', '') or '').strip() or (g.get('nom_gerant', '') or '').strip()
                if nom_g:
                    Gerant.objects.create(
                        ra=ra,
                        nom_gerant=nom_g,
                        nationalite_id=g.get('nationalite_id') or None,
                        fonction_id=g.get('fonction_id') or None,
                        date_debut=_date_immat_date,
                        actif=True,
                        donnees_ident={
                            'prenom':        g.get('prenom', ''),
                            'nni':           g.get('nni', ''),
                            'num_passeport': g.get('num_passeport', ''),
                            'date_naissance': g.get('date_naissance'),
                            'lieu_naissance': g.get('lieu_naissance', ''),
                            'telephone':     g.get('telephone', ''),
                            'domicile':      g.get('domicile', ''),
                        },
                    )

        # ── Succursale ────────────────────────────────────────────────────────
        elif self.type_entite == 'SC':
            # Sync dénomination bilingue — déclaration juridique libre, mixte AR/FR autorisé
            _denom_sc    = d.get('denomination', '') or ''
            _denom_ar_sc = d.get('denomination_ar', '') or _denom_sc
            sc = Succursale.objects.create(
                denomination=_denom_sc,
                denomination_ar=_denom_ar_sc,
                pays_origine='',
                capital_affecte=None,
                devise='MRU',
                # Support old format (siege_social/telephone) and new (adresse_siege/contact)
                siege_social=d.get('adresse_siege', '') or d.get('siege_social', ''),
                telephone=d.get('contact', '') or d.get('telephone', ''),
                email=d.get('email', ''),
                created_by=self.created_by,
            )
            ra = RegistreAnalytique.objects.create(type_entite='SC', sc=sc, **ra_kwargs)

            # ── Directeurs ────────────────────────────────────────────────────
            for dir_data in d.get('directeurs', []):
                # Stocker NOM seul dans nom_gerant, prénom dans donnees_ident
                # pour respecter la règle d'affichage RCCM : PRÉNOM puis NOM
                nom_dir = (dir_data.get('nom', '') or '').strip() or (dir_data.get('nom_gerant', '') or '').strip()
                if nom_dir:
                    Gerant.objects.create(
                        ra=ra,
                        nom_gerant=nom_dir,
                        nationalite_id=dir_data.get('nationalite_id') or None,
                        fonction_id=dir_data.get('fonction_id') or None,
                        date_debut=_date_immat_date,
                        actif=True,
                        donnees_ident={
                            'prenom':         dir_data.get('prenom', ''),
                            'nni':            dir_data.get('nni', ''),
                            'num_passeport':  dir_data.get('num_passeport', ''),
                            'date_naissance': dir_data.get('date_naissance'),
                            'lieu_naissance': dir_data.get('lieu_naissance', ''),
                            'telephone':      dir_data.get('telephone', ''),
                            'domicile':       dir_data.get('domicile', ''),
                        },
                    )

        else:
            raise ValueError(f"Type entité inconnu : {self.type_entite}")

        # ── Domaines d'activité ───────────────────────────────────────────────
        for dom_id in d.get('domaines', []):
            try:
                RADomaine.objects.get_or_create(ra=ra, domaine_id=dom_id)
            except Exception:
                pass

        # ── Lier le RA à cette demande ────────────────────────────────────────
        self.ra = ra
        self.save(update_fields=['ra'])
        return ra
