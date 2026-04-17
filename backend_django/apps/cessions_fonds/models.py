import uuid
from django.db import models
from apps.utilisateurs.models import Utilisateur


class CessionFonds(models.Model):
    STATUT = [
        ('BROUILLON',       'Brouillon'),
        ('EN_INSTANCE',     'En instance de validation'),
        ('RETOURNE',        'Retourné'),
        ('VALIDE',          'Validé'),
        ('ANNULE',          'Annulé'),
        ('ANNULE_GREFFIER', 'Annulé par le greffier'),
    ]
    TYPE_ACTE = [
        ('NOTARIE',     'Acte notarié'),
        ('SEING_PRIVE', 'Acte sous seing privé'),
    ]

    uuid                   = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_cession_fonds   = models.CharField(max_length=30, unique=True)
    ra                     = models.ForeignKey(
        'registres.RegistreAnalytique',
        on_delete=models.PROTECT,
        related_name='cessions_fonds',
    )
    chrono                 = models.ForeignKey(
        'registres.RegistreChronologique',
        null=True, blank=True,
        on_delete=models.SET_NULL,
    )

    # Informations de la cession
    date_cession           = models.DateTimeField(verbose_name='Date et heure de cession')
    type_acte              = models.CharField(max_length=20, choices=TYPE_ACTE)
    observations           = models.TextField(blank=True)
    demandeur              = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')

    # Cessionnaire — données complètes (nouveau titulaire)
    # Keys: nom, prenom, nom_ar, prenom_ar, nationalite_id, date_naissance,
    #       lieu_naissance, nni, num_passeport, adresse, telephone, email
    cessionnaire_data      = models.JSONField(default=dict, blank=True)

    # Snapshot de l'ancien titulaire (avant application)
    # Keys: ph_id, nom, prenom, nom_ar, prenom_ar, nationalite, date_naissance,
    #       lieu_naissance, nni, num_passeport, adresse, telephone, email
    snapshot_cedant        = models.JSONField(default=dict, blank=True)

    # ID du nouveau PersonnePhysique créé pour le cessionnaire (pour restauration)
    cessionnaire_ph_id     = models.IntegerField(null=True, blank=True)

    statut                 = models.CharField(max_length=20, choices=STATUT,
                                              default='BROUILLON', db_index=True)
    langue_acte            = models.CharField(
        max_length=2, choices=[('fr', 'Français'), ('ar', 'Arabe')], default='fr',
        verbose_name="Langue de l'acte",
    )
    corrections            = models.JSONField(default=list, blank=True)

    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    validated_at  = models.DateTimeField(null=True, blank=True)
    validated_by  = models.ForeignKey(
        Utilisateur, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='cessions_fonds_validees',
    )
    created_by    = models.ForeignKey(
        Utilisateur, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='cessions_fonds_creees',
    )

    class Meta:
        db_table            = 'cessions_fonds'
        ordering            = ['-created_at']
        verbose_name        = 'Cession de fonds de commerce'
        verbose_name_plural = 'Cessions de fonds de commerce'

    def __str__(self):
        return f'{self.numero_cession_fonds} – RA {self.ra.numero_ra}'

    def appliquer(self):
        """
        Remplace le titulaire (PersonnePhysique) du RA par le cessionnaire.
        Crée un nouveau PH à partir de cessionnaire_data et met à jour RA.ph.
        L'ancien PH est conservé pour l'historique.
        Retourne l'ID du nouveau PH créé.
        """
        from apps.entites.models import PersonnePhysique

        ra   = self.ra
        data = self.cessionnaire_data or {}

        # ── Résolution de la nationalité ─────────────────────────────────────
        nationalite_id = data.get('nationalite_id') or None

        # ── Gestion NNI unique ────────────────────────────────────────────────
        # Si le NNI fourni existe déjà, on réutilise le PH existant.
        nni = (data.get('nni') or '').strip() or None
        ph_new = None
        if nni:
            ph_new = PersonnePhysique.objects.filter(nni=nni).first()

        if ph_new is None:
            # Créer un nouveau PersonnePhysique pour le cessionnaire
            ph_new = PersonnePhysique.objects.create(
                nom               = (data.get('nom')    or '').strip(),
                prenom            = (data.get('prenom') or '').strip(),
                nom_ar            = (data.get('nom_ar') or '').strip(),
                prenom_ar         = (data.get('prenom_ar') or '').strip(),
                nationalite_id    = nationalite_id,
                date_naissance    = data.get('date_naissance') or None,
                lieu_naissance    = (data.get('lieu_naissance') or '').strip(),
                nni               = nni,
                num_passeport     = (data.get('num_passeport') or '').strip(),
                adresse           = (data.get('adresse')    or '').strip(),
                telephone         = (data.get('telephone')  or '').strip(),
                email             = (data.get('email')      or '').strip(),
            )

        # ── Remplacement du titulaire dans le RA ─────────────────────────────
        ra.ph = ph_new
        ra.save(update_fields=['ph', 'updated_at'])

        return ph_new.id
