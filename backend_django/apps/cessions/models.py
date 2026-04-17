import uuid
from django.db import models
from apps.utilisateurs.models import Utilisateur


class Cession(models.Model):
    STATUT = [
        ('BROUILLON',       'Brouillon'),
        ('EN_INSTANCE',     'En instance de validation'),
        ('RETOURNE',        'Retourné'),
        ('VALIDE',          'Validé'),
        ('ANNULE',          'Annulé'),
        ('ANNULE_GREFFIER', 'Annulé par le greffier'),
    ]
    TYPE_CESSION_PARTS = [
        ('TOTALE',    'Cession totale'),
        ('PARTIELLE', 'Cession partielle'),
    ]
    BENEFICIAIRE_TYPE = [
        ('EXISTANT', 'Associé existant'),
        ('NOUVEAU',  'Nouvel associé'),
    ]

    uuid                = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_cession      = models.CharField(max_length=30, unique=True)
    ra                  = models.ForeignKey('registres.RegistreAnalytique', on_delete=models.PROTECT, related_name='cessions')
    chrono              = models.ForeignKey('registres.RegistreChronologique', null=True, blank=True, on_delete=models.SET_NULL)
    date_cession        = models.DateTimeField(auto_now_add=True, verbose_name='Date et heure de la cession')
    statut              = models.CharField(max_length=20, choices=STATUT, default='BROUILLON', db_index=True)
    langue_acte         = models.CharField(
        max_length=2, choices=[('fr', 'Français'), ('ar', 'Arabe')], default='fr',
        verbose_name="Langue de l'acte",
    )
    observations        = models.TextField(blank=True)
    demandeur           = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')

    # Cedant
    associe_cedant      = models.ForeignKey('registres.Associe', null=True, blank=True,
                                            on_delete=models.SET_NULL, related_name='cessions_cedant')
    type_cession_parts  = models.CharField(max_length=20, choices=TYPE_CESSION_PARTS, blank=True)
    nombre_parts_cedees = models.IntegerField(null=True, blank=True)

    # Bénéficiaire
    beneficiaire_type   = models.CharField(max_length=20, choices=BENEFICIAIRE_TYPE, default='EXISTANT')
    beneficiaire_associe = models.ForeignKey('registres.Associe', null=True, blank=True,
                                             on_delete=models.SET_NULL, related_name='cessions_beneficiaire')
    beneficiaire_data   = models.JSONField(default=dict, blank=True)  # Used when beneficiaire_type='NOUVEAU'
    snapshot_avant        = models.JSONField(default=dict, blank=True)   # état des associés avant application
    nouveau_associe_id    = models.IntegerField(null=True, blank=True)   # ID de l'associé créé si NOUVEAU (legacy)
    corrections           = models.JSONField(default=list, blank=True)   # historique des corrections

    # ── Cession lignes élémentaires (modèle canonique RCCM) ──────────────────
    # Chaque ligne : {cedant_associe_id, cedant_nom,
    #                 cessionnaire_type, cessionnaire_associe_id,
    #                 cessionnaire_prenom, cessionnaire_nom, cessionnaire_nationalite_id,
    #                 nombre_parts}
    # Un même cédant peut apparaître dans plusieurs lignes (vers des cessionnaires différents).
    lignes                = models.JSONField(default=list, blank=True)
    nouveaux_associes_ids = models.JSONField(default=list, blank=True)  # IDs des associés créés (NOUVEAU)

    # ── Champs de transition (mode multi N+M pré-lignes — backward compat) ───
    cedants               = models.JSONField(default=list, blank=True)
    cessionnaires         = models.JSONField(default=list, blank=True)

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    validated_by = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='cessions_validees')
    created_by   = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='cessions_creees')

    class Meta:
        db_table            = 'cessions'
        ordering            = ['-created_at']
        verbose_name        = 'Cession'
        verbose_name_plural = 'Cessions'

    def __str__(self):
        return f'{self.numero_cession} – {self.ra.numero_ra}'

    def appliquer(self):
        """Apply the cession to Associé records. Called only on validation.
        Returns list of newly created Associé IDs (empty list if none).

        Priority: lignes (RCCM canonical) > cedants/cessionnaires (compat) > legacy 1+1.
        """
        from datetime import date as _date
        from apps.registres.models import Associe
        from collections import defaultdict

        ra = self.ra
        nouveaux_ids = []
        lignes = self.lignes or []
        cedants_data = self.cedants or []

        if lignes:
            # ── Mode lignes élémentaires RCCM ─────────────────────────────────
            # 1. Aggregate parts to subtract per cedant
            parts_cedees_by = defaultdict(int)
            for l in lignes:
                parts_cedees_by[l['cedant_associe_id']] += l['nombre_parts']

            for assoc_id, total in parts_cedees_by.items():
                cedant = Associe.objects.get(id=assoc_id)
                if total >= cedant.nombre_parts:
                    cedant.nombre_parts = 0
                    cedant.pourcentage  = 0
                    cedant.actif        = False
                    cedant.date_sortie  = _date.today()
                else:
                    cedant.nombre_parts = max(0, cedant.nombre_parts - total)
                cedant.save()

            # 2. Aggregate parts to add per EXISTANT cessionnaire
            parts_acquises_by = defaultdict(int)
            for l in lignes:
                if l['cessionnaire_type'] == 'EXISTANT' and l.get('cessionnaire_associe_id'):
                    parts_acquises_by[l['cessionnaire_associe_id']] += l['nombre_parts']

            for assoc_id, total in parts_acquises_by.items():
                benef = Associe.objects.get(id=assoc_id)
                benef.nombre_parts += total
                benef.actif = True
                benef.save()

            # 3. Create NOUVEAU cessionnaires (aggregate identical persons)
            # Keys differ by type_personne to avoid PH/PM collision
            nouveaux_parts  = defaultdict(int)
            nouveaux_meta   = {}
            for l in lignes:
                if l['cessionnaire_type'] == 'NOUVEAU':
                    _tp = l.get('cessionnaire_type_personne', 'PH')
                    if _tp == 'PM':
                        key = ('PM', (l.get('cessionnaire_denomination') or '').strip())
                    else:
                        key = (
                            'PH',
                            (l.get('cessionnaire_prenom') or '').strip(),
                            (l.get('cessionnaire_nom') or '').strip(),
                            l.get('cessionnaire_nationalite_id'),
                        )
                    nouveaux_parts[key] += l['nombre_parts']
                    if key not in nouveaux_meta:
                        nouveaux_meta[key] = l

            for key, total_parts in nouveaux_parts.items():
                meta = nouveaux_meta[key]
                _tp  = key[0]
                if _tp == 'PM':
                    denomination = key[1]
                    new_assoc = Associe.objects.create(
                        ra=ra,
                        nom_associe=denomination or '—',
                        type_associe='PM',
                        nombre_parts=total_parts,
                        nationalite_id=None,
                        actif=True,
                        date_entree=_date.today(),
                        donnees_ident={
                            'forme_juridique':     meta.get('cessionnaire_forme_juridique', ''),
                            'num_identification':  meta.get('cessionnaire_num_identification', ''),
                            'nationalite_pm':      meta.get('cessionnaire_nationalite_pm', ''),
                            'siege_social':        meta.get('cessionnaire_siege_social', ''),
                        },
                    )
                else:
                    prenom  = key[1]
                    nom_val = key[2]
                    nat_id  = key[3]
                    new_assoc = Associe.objects.create(
                        ra=ra,
                        nom_associe=f"{prenom} {nom_val}".strip() or nom_val or prenom,
                        type_associe='PH',
                        nombre_parts=total_parts,
                        nationalite_id=nat_id or None,
                        actif=True,
                        date_entree=_date.today(),
                        donnees_ident={
                            'civilite': meta.get('cessionnaire_civilite', ''),
                            'prenom':   prenom,
                            'nni':      meta.get('cessionnaire_nni', ''),
                        },
                    )
                nouveaux_ids.append(new_assoc.id)

        elif cedants_data:
            # ── Mode cedants/cessionnaires (rétrocompatibilité) ───────────────
            for cedant_data in cedants_data:
                assoc_id = cedant_data.get('associe_id')
                if not assoc_id:
                    continue
                cedant = Associe.objects.get(id=assoc_id)
                type_cess = cedant_data.get('type_cession', 'TOTALE')
                if type_cess == 'TOTALE':
                    cedant.nombre_parts = 0
                    cedant.pourcentage  = 0
                    cedant.actif        = False
                    cedant.date_sortie  = _date.today()
                    cedant.save()
                else:
                    parts = cedant_data.get('nombre_parts', 0)
                    cedant.nombre_parts = max(0, cedant.nombre_parts - parts)
                    cedant.save()

            for cess_data in (self.cessionnaires or []):
                parts_acquises = cess_data.get('nombre_parts', 0)
                if cess_data.get('type', 'EXISTANT') == 'EXISTANT':
                    assoc_id = cess_data.get('associe_id')
                    if assoc_id:
                        benef = Associe.objects.get(id=assoc_id)
                        benef.nombre_parts += parts_acquises
                        benef.actif = True
                        benef.save()
                else:
                    new_assoc = Associe.objects.create(
                        ra=ra,
                        nom_associe=f"{cess_data.get('prenom', '')} {cess_data.get('nom', '')}".strip()
                                    or cess_data.get('nom', ''),
                        type_associe='PH',
                        nombre_parts=parts_acquises,
                        nationalite_id=cess_data.get('nationalite_id') or None,
                        actif=True,
                        date_entree=_date.today(),
                    )
                    nouveaux_ids.append(new_assoc.id)

        else:
            # ── Mode héritage 1 cédant + 1 bénéficiaire ──────────────────────
            cedant = self.associe_cedant
            if not cedant:
                raise ValueError('Aucun associé cédant défini.')

            if self.type_cession_parts == 'TOTALE':
                parts_cedees = cedant.nombre_parts
                cedant.nombre_parts = 0
                cedant.pourcentage  = 0
                cedant.actif        = False
                cedant.date_sortie  = _date.today()
                cedant.save()
            else:
                parts_cedees = self.nombre_parts_cedees or 0
                cedant.nombre_parts = max(0, cedant.nombre_parts - parts_cedees)
                cedant.save()

            if self.beneficiaire_type == 'EXISTANT' and self.beneficiaire_associe:
                benef = self.beneficiaire_associe
                benef.nombre_parts += parts_cedees
                benef.actif = True
                benef.save()
            elif self.beneficiaire_type == 'NOUVEAU':
                data = self.beneficiaire_data or {}
                new_assoc = Associe.objects.create(
                    ra=ra,
                    nom_associe=f"{data.get('prenom', '')} {data.get('nom', '')}".strip()
                                or data.get('nom', ''),
                    type_associe='PH',
                    nombre_parts=parts_cedees,
                    nationalite_id=data.get('nationalite_id') or None,
                    actif=True,
                    date_entree=_date.today(),
                )
                nouveaux_ids.append(new_assoc.id)

        # Recalculate pourcentages for all active associés
        actifs = list(ra.associes.filter(actif=True))
        total_parts = sum(a.nombre_parts for a in actifs)
        if total_parts > 0:
            for a in actifs:
                a.pourcentage = round((a.nombre_parts / total_parts) * 100, 2)
                a.save()

        return nouveaux_ids
