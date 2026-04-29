import uuid
from django.db import models
from apps.entites.models import PersonnePhysique, PersonneMorale, Succursale
from apps.parametrage.models import Localite
from apps.utilisateurs.models import Utilisateur


# ── Déclarant (personne présentant les actes au greffe) ───────────────────────

CIVILITE_CHOICES = [('MR','M.'),('MME','Mme'),('MLLE','Mlle')]


class Declarant(models.Model):
    """
    Représente la personne physique qui dépose un acte au greffe.
    Stocké une seule fois ; réutilisé par plusieurs RegistreChronologique.
    """
    civilite       = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True, verbose_name='Civilité')
    nom            = models.CharField(max_length=200, verbose_name='Nom')
    prenom         = models.CharField(max_length=200, blank=True, verbose_name='Prénom(s)')
    nni            = models.CharField(max_length=20,  blank=True, db_index=True, verbose_name='NNI')
    num_passeport  = models.CharField(max_length=30,  blank=True, verbose_name='N° Passeport')
    date_naissance = models.DateField(null=True, blank=True, verbose_name='Date de naissance')
    lieu_naissance = models.CharField(max_length=200, blank=True, verbose_name='Lieu de naissance')
    nationalite    = models.ForeignKey(
        'parametrage.Nationalite',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        verbose_name='Nationalité',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'declarant'
        verbose_name        = 'Déclarant'
        verbose_name_plural = 'Déclarants'
        ordering            = ['nom', 'prenom']

    def __str__(self):
        parts = [self.nom, self.prenom]
        label = ' '.join(p for p in parts if p)
        if self.nni:
            label += f' (NNI : {self.nni})'
        return label

    @property
    def identite_display(self):
        """Chaîne courte pour l'affichage dans les certificats."""
        parts = [self.nom, self.prenom]
        label = ' '.join(p for p in parts if p)
        if self.nni:
            label += f' — NNI : {self.nni}'
        elif self.num_passeport:
            label += f' — Passeport : {self.num_passeport}'
        return label


class RegistreAnalytique(models.Model):
    TYPE_CHOICES   = [('PH','Personne Physique'),('PM','Personne Morale'),('SC','Succursale')]
    STATUT_CHOICES = [
        ('BROUILLON',              'Brouillon'),
        ('EN_INSTANCE_VALIDATION', 'En instance de validation'),
        ('RETOURNE',               'Retourné'),
        ('EN_COURS',               'En cours'),          # conservé pour compatibilité
        ('IMMATRICULE',            'Immatriculé'),
        ('RADIE',                  'Radié'),
        ('SUSPENDU',               'Suspendu'),
        ('ANNULE',                 'Annulé'),
    ]
    STATUT_BE_CHOICES = [
        ('NON_DECLARE', 'Non déclaré'),
        ('EN_ATTENTE',  'En attente (délai 15 jours)'),
        ('DECLARE',     'Déclaré'),
        ('EN_RETARD',   'En retard'),
    ]

    uuid                  = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_ra             = models.CharField(max_length=30, unique=True, null=True, blank=True, verbose_name='N° analytique')
    type_entite           = models.CharField(max_length=5, choices=TYPE_CHOICES)
    ph                    = models.ForeignKey(PersonnePhysique, null=True, blank=True, on_delete=models.PROTECT, related_name='registres')
    pm                    = models.ForeignKey(PersonneMorale,   null=True, blank=True, on_delete=models.PROTECT, related_name='registres')
    sc                    = models.ForeignKey(Succursale,        null=True, blank=True, on_delete=models.PROTECT, related_name='registres')
    numero_rc             = models.CharField(max_length=30, blank=True, verbose_name='N° RC', db_index=True)
    date_immatriculation  = models.DateField(null=True, blank=True)
    statut                = models.CharField(max_length=30, choices=STATUT_CHOICES, default='BROUILLON', db_index=True)
    date_radiation        = models.DateField(null=True, blank=True)
    motif_radiation       = models.TextField(blank=True)
    localite              = models.ForeignKey(Localite, null=True, blank=True, on_delete=models.SET_NULL, verbose_name='Greffe')
    observations          = models.TextField(blank=True)
    observations_greffier = models.TextField(blank=True, verbose_name='Observations greffier')
    # ── Bénéficiaire effectif ──────────────────────────────────────────────────
    statut_be             = models.CharField(
        max_length=20, choices=STATUT_BE_CHOICES, default='NON_DECLARE',
        db_index=True, verbose_name='Statut bénéficiaire effectif',
    )
    date_declaration_be   = models.DateTimeField(null=True, blank=True, verbose_name='Date de déclaration BE')
    date_limite_be        = models.DateField(null=True, blank=True, verbose_name='Date limite déclaration BE')
    created_at            = models.DateTimeField(auto_now_add=True)
    updated_at            = models.DateTimeField(auto_now=True)
    validated_at          = models.DateTimeField(null=True, blank=True)
    validated_by          = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='ra_valides')
    created_by            = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='ra_crees')

    class Meta:
        db_table            = 'registre_analytique'
        ordering            = ['-created_at']
        verbose_name        = 'Registre analytique'
        verbose_name_plural = 'Registre analytique'

    def __str__(self): return f'RA {self.numero_ra or "(en attente)"}'

    @property
    def entite(self):
        if self.type_entite == 'PH': return self.ph
        if self.type_entite == 'PM': return self.pm
        if self.type_entite == 'SC': return self.sc
        return None

    @property
    def est_sa(self):
        """True si la forme juridique est Société Anonyme (code 'SA') — détermine l'affichage CA/CAC."""
        return (
            self.type_entite == 'PM'
            and self.pm is not None
            and getattr(getattr(self.pm, 'forme_juridique', None), 'code', '') == 'SA'
        )

    @property
    def denomination(self):
        e = self.entite
        if not e: return ''
        if self.type_entite == 'PH': return e.nom_complet
        return e.denomination

    @property
    def denomination_ar(self):
        if self.type_entite == 'PH' and self.ph:
            return f"{self.ph.nom_ar or ''} {self.ph.prenom_ar or ''}".strip()
        if self.type_entite == 'PM' and self.pm:
            return self.pm.denomination_ar or ''
        if self.type_entite == 'SC' and self.sc:
            return self.sc.denomination_ar or ''
        return ''


class RegistreChronologique(models.Model):
    STATUT_CHOICES = [
        ('BROUILLON',   'Brouillon'),
        ('EN_INSTANCE', 'En instance'),
        ('RETOURNE',    'Retourné'),
        ('VALIDE',      'Validé'),
        ('REJETE',      'Rejeté'),
        ('ANNULE',      'Annulé'),
    ]
    LANGUE_CHOICES = [('fr', 'Français'), ('ar', 'Arabe')]

    uuid                 = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    # ── Numérotation chronologique ─────────────────────────────────────────────
    # Règle RCCM : numérotation ANNUELLE, remise à zéro chaque 1er janvier.
    # L'identifiant juridique d'un acte est le COUPLE (annee_chrono / numero_chrono).
    # La contrainte d'unicité porte sur ce couple ; le numéro seul peut se répéter
    # d'une année à l'autre (ex : 0001 existe en 2026 ET en 2027 — ce sont deux
    # actes distincts).
    numero_chrono        = models.CharField(max_length=30, verbose_name='N° chronologique', db_index=True)
    annee_chrono         = models.IntegerField(null=True, blank=True, verbose_name='Année chronologique', db_index=True)
    ra                   = models.ForeignKey(RegistreAnalytique, null=True, blank=True, on_delete=models.PROTECT, related_name='chronos')
    declarant            = models.ForeignKey(
        Declarant, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='registres',
        verbose_name='Déclarant',
    )
    type_acte            = models.CharField(max_length=30)
    date_acte            = models.DateTimeField(verbose_name='Date et heure de l\'acte')
    date_enregistrement  = models.DateTimeField(auto_now_add=True, verbose_name='Date et heure d\'enregistrement')
    description          = models.TextField(blank=True)
    description_ar       = models.TextField(blank=True)
    langue_acte          = models.CharField(
        max_length=2, choices=LANGUE_CHOICES, default='fr',
        verbose_name="Langue de l'acte",
        help_text="Langue utilisée lors de la création de l'acte (fr/ar). "
                  "Détermine la langue des documents PDF générés.",
    )
    statut               = models.CharField(max_length=20, choices=STATUT_CHOICES, default='BROUILLON', db_index=True)
    observations         = models.TextField(blank=True)
    created_at           = models.DateTimeField(auto_now_add=True)
    updated_at           = models.DateTimeField(auto_now=True)
    validated_at         = models.DateTimeField(null=True, blank=True)
    validated_by         = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='chrono_valides')
    created_by           = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='chrono_crees')

    class Meta:
        db_table            = 'registre_chronologique'
        ordering            = ['-date_acte']
        verbose_name        = 'Registre chronologique'
        verbose_name_plural = 'Registre chronologique'
        # Unicité sur le couple (annee_chrono, numero_chrono) — règle RCCM :
        # le même numéro séquentiel peut exister dans deux années différentes.
        unique_together     = [('annee_chrono', 'numero_chrono')]

    def __str__(self): return f'RC {self.annee_chrono}/{self.numero_chrono}' if self.annee_chrono else f'RC {self.numero_chrono}'


class Associe(models.Model):
    TYPE_CHOICES = [('PH','Personne Physique'),('PM','Personne Morale')]
    ra           = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE, related_name='associes')
    type_associe = models.CharField(max_length=5, choices=TYPE_CHOICES, default='PH')
    ph           = models.ForeignKey(PersonnePhysique, null=True, blank=True, on_delete=models.PROTECT)
    pm           = models.ForeignKey(PersonneMorale,   null=True, blank=True, on_delete=models.PROTECT)
    nom_associe  = models.CharField(max_length=200, blank=True)
    nationalite  = models.ForeignKey('parametrage.Nationalite', null=True, blank=True, on_delete=models.SET_NULL)
    nombre_parts = models.IntegerField(default=0)
    valeur_parts = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pourcentage  = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    type_part    = models.CharField(max_length=50, blank=True)
    date_entree  = models.DateField(null=True, blank=True)
    date_sortie  = models.DateField(null=True, blank=True)
    actif          = models.BooleanField(default=True)
    donnees_ident  = models.JSONField(default=dict, blank=True,
                                      verbose_name='Données identité complémentaires')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'associes'
        verbose_name        = 'Associé'
        verbose_name_plural = 'Associés'


class Gerant(models.Model):
    TYPE_CHOICES = [('PH','Personne Physique'),('PM','Personne Morale')]
    ra           = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE, related_name='gerants')
    type_gerant  = models.CharField(max_length=5, choices=TYPE_CHOICES, default='PH')
    ph           = models.ForeignKey(PersonnePhysique, null=True, blank=True, on_delete=models.PROTECT)
    pm           = models.ForeignKey(PersonneMorale,   null=True, blank=True, on_delete=models.PROTECT)
    nom_gerant   = models.CharField(max_length=200, blank=True)
    nationalite  = models.ForeignKey('parametrage.Nationalite', null=True, blank=True, on_delete=models.SET_NULL)
    fonction     = models.ForeignKey('parametrage.Fonction', null=True, blank=True, on_delete=models.SET_NULL)
    date_debut   = models.DateField(null=True, blank=True)
    date_fin     = models.DateField(null=True, blank=True)
    pouvoirs      = models.TextField(blank=True)
    motif_fin     = models.CharField(max_length=20,  blank=True,
                                     verbose_name='Motif de fin',
                                     help_text='DEMISSION | REVOCATION | FIN_MANDAT')
    ref_decision  = models.CharField(max_length=200, blank=True,
                                     verbose_name='Référence de la décision')
    actif          = models.BooleanField(default=True)
    donnees_ident  = models.JSONField(default=dict, blank=True,
                                      verbose_name='Données identité complémentaires')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'gerants'
        verbose_name        = 'Gérant'
        verbose_name_plural = 'Gérants'


class Administrateur(models.Model):
    """
    Membre du conseil d'administration – Société Anonyme (SA) uniquement.
    Restriction métier : ne doit être créé que lorsque ra.est_sa is True.
    """
    ra             = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE,
                                       related_name='administrateurs')
    civilite       = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True, verbose_name='Civilité')
    nom            = models.CharField(max_length=200)
    prenom         = models.CharField(max_length=200, blank=True)
    nom_ar         = models.CharField(max_length=200, blank=True, verbose_name='Nom (arabe)')
    prenom_ar      = models.CharField(max_length=200, blank=True, verbose_name='Prénom (arabe)')
    nationalite    = models.ForeignKey('parametrage.Nationalite', null=True, blank=True,
                                       on_delete=models.SET_NULL)
    date_naissance = models.DateField(null=True, blank=True)
    lieu_naissance = models.CharField(max_length=200, blank=True)
    nni            = models.CharField(max_length=20,  blank=True, verbose_name='NNI')
    num_passeport  = models.CharField(max_length=50,  blank=True)
    adresse        = models.TextField(blank=True)
    telephone      = models.CharField(max_length=20,  blank=True)
    email          = models.EmailField(blank=True)
    fonction       = models.CharField(max_length=100, blank=True,
                                      verbose_name='Fonction au CA',
                                      help_text='Ex. : Président, Vice-président, Administrateur délégué')
    date_debut     = models.DateField(null=True, blank=True, verbose_name='Date de prise de fonction')
    date_fin       = models.DateField(null=True, blank=True, verbose_name='Date de fin de mandat')
    motif_fin      = models.CharField(max_length=20,  blank=True,
                                      verbose_name='Motif de fin',
                                      help_text='DEMISSION | REVOCATION | FIN_MANDAT')
    ref_decision   = models.CharField(max_length=200, blank=True,
                                      verbose_name='Référence de la décision')
    actif          = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'administrateurs_sa'
        ordering            = ['nom', 'prenom']
        verbose_name        = 'Administrateur SA'
        verbose_name_plural = 'Administrateurs SA'

    def __str__(self): return f'{self.nom} {self.prenom}'.strip()

    @property
    def nom_complet(self): return f'{self.nom} {self.prenom}'.strip()


class CommissaireComptes(models.Model):
    """
    Commissaire aux comptes – Société Anonyme (SA) uniquement.
    Peut être personne physique (PH) ou morale (cabinet d'audit, PM).
    Restriction métier : ne doit être créé que lorsque ra.est_sa is True.
    """
    TYPE_CHOICES = [('PH', 'Personne physique'), ('PM', 'Personne morale')]
    ROLE_CHOICES = [('TITULAIRE', 'Titulaire'), ('SUPPLEANT', 'Suppléant')]

    ra               = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE,
                                         related_name='commissaires')
    type_commissaire = models.CharField(max_length=2, choices=TYPE_CHOICES, default='PH',
                                        verbose_name='Type')
    role             = models.CharField(max_length=20, choices=ROLE_CHOICES, default='TITULAIRE',
                                        verbose_name='Rôle')
    civilite         = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True,
                                        verbose_name='Civilité',
                                        help_text='Applicable uniquement aux personnes physiques (PH)')
    nom              = models.CharField(max_length=200,
                                        help_text='Nom (PH) ou dénomination sociale (PM)')
    prenom           = models.CharField(max_length=200, blank=True)
    nom_ar           = models.CharField(max_length=200, blank=True, verbose_name='Nom (arabe)')
    nationalite      = models.ForeignKey('parametrage.Nationalite', null=True, blank=True,
                                         on_delete=models.SET_NULL)
    date_naissance   = models.DateField(null=True, blank=True)
    lieu_naissance   = models.CharField(max_length=200, blank=True)
    nni              = models.CharField(max_length=20, blank=True, verbose_name='NNI')
    num_passeport    = models.CharField(max_length=50, blank=True)
    adresse          = models.TextField(blank=True)
    telephone        = models.CharField(max_length=20, blank=True)
    email            = models.EmailField(blank=True)
    date_debut       = models.DateField(null=True, blank=True, verbose_name='Date de nomination')
    date_fin         = models.DateField(null=True, blank=True, verbose_name='Date de fin de mandat')
    motif_fin        = models.CharField(max_length=20,  blank=True,
                                        verbose_name='Motif de fin',
                                        help_text='DEMISSION | REVOCATION | FIN_MANDAT')
    ref_decision     = models.CharField(max_length=200, blank=True,
                                        verbose_name='Référence de la décision')
    actif            = models.BooleanField(default=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'commissaires_comptes_sa'
        ordering            = ['role', 'nom']
        verbose_name        = 'Commissaire aux comptes'
        verbose_name_plural = 'Commissaires aux comptes'

    def __str__(self):
        role_lbl = 'Titulaire' if self.role == 'TITULAIRE' else 'Suppléant'
        return f'{role_lbl} — {self.nom} {self.prenom}'.strip()

    @property
    def nom_complet(self): return f'{self.nom} {self.prenom}'.strip()


class RADomaine(models.Model):
    ra        = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE, related_name='domaines')
    domaine   = models.ForeignKey('parametrage.DomaineActivite', on_delete=models.CASCADE)
    principal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'ra_domaines'
        unique_together = ('ra', 'domaine')


class ActionHistorique(models.Model):
    """Journal d'audit des actions sur un dossier RA (traçabilité complète)."""
    ACTION_CHOICES = [
        # Actions RA / immatriculation
        ('CREATION',                 'Création'),
        ('COMPLETION',               'Complétion'),
        ('ENVOI',                    'Envoi au greffier'),
        ('RETOUR',                   "Retour à l'agent"),
        ('VALIDATION',               'Validation / Immatriculation'),
        # Modifications
        ('VALIDATION_MODIFICATION',  'Validation de modification'),
        ('RETOUR_MODIFICATION',      'Retour de modification'),
        ('ANNULATION_MODIFICATION',  'Annulation de modification'),
        ('MODIFICATION_CORRECTIVE',  'Modification corrective'),
        # Cessions (parts)
        ('VALIDATION_CESSION',       'Validation de cession'),
        ('RETOUR_CESSION',           'Retour de cession'),
        ('ANNULATION_CESSION',       'Annulation de cession'),
        ('CESSION_CORRECTIVE',       'Cession corrective'),
        # Cessions de fonds de commerce
        ('VALIDATION_CESSION_FONDS', 'Validation de cession de fonds'),
        ('RETOUR_CESSION_FONDS',     'Retour de cession de fonds'),
        ('ANNULATION_CESSION_FONDS', 'Annulation de cession de fonds'),
        ('CESSION_FONDS_CORRECTIVE', 'Cession de fonds corrective'),
        # Radiations
        ('CREATION_RADIATION',       'Création de radiation'),
        ('VALIDATION_RADIATION',     'Validation de radiation'),
        ('REJET_RADIATION',          'Rejet de radiation'),
        ('ANNULATION_RADIATION',     'Annulation de radiation'),
        # Historique
        ('IMMATRICULATION_HISTORIQUE', 'Immatriculation historique'),
    ]
    ra                  = models.ForeignKey(RegistreAnalytique, on_delete=models.CASCADE, related_name='historique')
    action              = models.CharField(max_length=30, choices=ACTION_CHOICES)
    commentaire         = models.TextField(blank=True)
    reference_operation = models.CharField(max_length=50, blank=True, default='')
    etat_avant          = models.JSONField(null=True, blank=True, default=None)
    etat_apres          = models.JSONField(null=True, blank=True, default=None)
    created_by          = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL)
    created_at          = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'ra_historique'
        ordering            = ['-created_at']
        verbose_name        = 'Action historique'
        verbose_name_plural = 'Historique des actions'

    def __str__(self): return f'{self.action} – RA {self.ra.numero_ra}'
