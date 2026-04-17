import uuid
from django.db import models
from apps.registres.models import RegistreAnalytique
from apps.entites.models import PersonnePhysique, PersonneMorale, Succursale
from apps.parametrage.models import TypeDemande, TypeDocument
from apps.utilisateurs.models import Utilisateur


class Demande(models.Model):
    STATUT_CHOICES = [
        ('SAISIE','Saisie'),('SOUMISE','Soumise'),('EN_TRAITEMENT','En traitement'),
        ('VALIDEE','Validée'),('REJETEE','Rejetée'),('ANNULEE','Annulée')
    ]
    CANAL_CHOICES = [('GUICHET','Guichet'),('EN_LIGNE','En ligne')]
    TYPE_ENTITE   = [('PH','PH'),('PM','PM'),('SC','SC')]

    uuid              = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_dmd        = models.CharField(max_length=30, unique=True, verbose_name='N° demande')
    type_demande      = models.ForeignKey(TypeDemande, null=True, blank=True, on_delete=models.SET_NULL)
    ra                = models.ForeignKey(RegistreAnalytique, null=True, blank=True, on_delete=models.SET_NULL, related_name='demandes')
    type_entite       = models.CharField(max_length=5, choices=TYPE_ENTITE, blank=True)
    ph                = models.ForeignKey(PersonnePhysique, null=True, blank=True, on_delete=models.SET_NULL)
    pm                = models.ForeignKey(PersonneMorale,   null=True, blank=True, on_delete=models.SET_NULL)
    sc                = models.ForeignKey(Succursale,        null=True, blank=True, on_delete=models.SET_NULL)
    date_demande      = models.DateField(auto_now_add=True)
    date_limite       = models.DateField(null=True, blank=True)
    statut            = models.CharField(max_length=20, choices=STATUT_CHOICES, default='SAISIE', db_index=True)
    motif_rejet       = models.TextField(blank=True)
    observations      = models.TextField(blank=True)
    canal             = models.CharField(max_length=20, choices=CANAL_CHOICES, default='GUICHET')
    montant_paye      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_paiement = models.CharField(max_length=100, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)
    submitted_at      = models.DateTimeField(null=True, blank=True)
    validated_at      = models.DateTimeField(null=True, blank=True)
    validated_by      = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='demandes_validees')
    created_by        = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='demandes_creees')

    class Meta:
        db_table   = 'demandes'
        ordering   = ['-created_at']
        verbose_name        = 'Demande'
        verbose_name_plural = 'Demandes'

    def __str__(self): return f'DMD {self.numero_dmd}'


class LigneDemande(models.Model):
    demande      = models.ForeignKey(Demande, on_delete=models.CASCADE, related_name='lignes')
    type_doc     = models.ForeignKey(TypeDocument, null=True, blank=True, on_delete=models.SET_NULL)
    libelle      = models.CharField(max_length=200, blank=True)
    present      = models.BooleanField(default=False)
    conforme     = models.BooleanField(default=False)
    observations = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table   = 'lignes_demande'
        verbose_name        = 'Ligne de demande'
        verbose_name_plural = 'Lignes de demande'
