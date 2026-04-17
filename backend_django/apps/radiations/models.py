import uuid
from django.db import models
from apps.registres.models import RegistreAnalytique, RegistreChronologique
from apps.demandes.models import Demande
from apps.utilisateurs.models import Utilisateur


class Radiation(models.Model):
    STATUT_CHOICES = [('EN_COURS','En cours'),('VALIDEE','Validée'),('REJETEE','Rejetée'),('ANNULEE','Annulée')]
    MOTIF_CHOICES = [
        ('CESSATION','Cessation d\'activité'),('DISSOLUTION','Dissolution'),
        ('LIQUIDATION','Liquidation'),('FUSION','Fusion'),('FAILLITE','Faillite'),
        ('AUTRE','Autre')
    ]

    uuid            = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_radia    = models.CharField(max_length=30, unique=True)
    ra              = models.ForeignKey(RegistreAnalytique, on_delete=models.PROTECT, related_name='radiations')
    chrono          = models.ForeignKey(RegistreChronologique, null=True, blank=True, on_delete=models.SET_NULL)
    demande         = models.ForeignKey(Demande, null=True, blank=True, on_delete=models.SET_NULL)
    date_radiation  = models.DateTimeField(auto_now_add=True, verbose_name='Date et heure de la radiation')
    motif           = models.CharField(max_length=30, choices=MOTIF_CHOICES, blank=True)
    description     = models.TextField(blank=True)
    demandeur       = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')
    statut          = models.CharField(max_length=20, choices=STATUT_CHOICES, default='EN_COURS', db_index=True)
    langue_acte     = models.CharField(
        max_length=2, choices=[('fr', 'Français'), ('ar', 'Arabe')], default='fr',
        verbose_name="Langue de l'acte",
    )
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)
    validated_at    = models.DateTimeField(null=True, blank=True)
    validated_by    = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='radiations_validees')
    created_by      = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='radiations_creees')

    class Meta:
        db_table   = 'radiations'
        ordering   = ['-created_at']
        verbose_name        = 'Radiation'
        verbose_name_plural = 'Radiations'

    def __str__(self): return f'RAD {self.numero_radia}'
