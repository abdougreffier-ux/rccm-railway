import uuid
from django.db import models
from apps.utilisateurs.models import Utilisateur


class Depot(models.Model):
    uuid               = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_depot       = models.CharField(max_length=30, unique=True, verbose_name='N° dépôt')
    date_depot         = models.DateField(auto_now_add=True, verbose_name='Date de dépôt')
    # Déposant
    CIVILITE_CHOICES   = [('MR','M.'),('MME','Mme'),('MLLE','Mlle')]
    civilite_deposant  = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True, verbose_name='Civilité du déposant')
    prenom_deposant    = models.CharField(max_length=150, verbose_name='Prénom du déposant')
    nom_deposant       = models.CharField(max_length=150, verbose_name='Nom du déposant')
    telephone_deposant = models.CharField(max_length=30, blank=True, verbose_name='Téléphone')
    # Entité déposée
    denomination       = models.CharField(max_length=300, verbose_name='Dénomination')
    forme_juridique    = models.ForeignKey(
        'parametrage.FormeJuridique',
        null=True, blank=True, on_delete=models.SET_NULL,
        verbose_name='Forme juridique',
    )
    objet_social       = models.TextField(blank=True, verbose_name='Objet social')
    capital            = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        verbose_name='Capital (MRU)',
    )
    siege_social       = models.TextField(blank=True, verbose_name='Siège social')
    observations       = models.TextField(blank=True)
    # Méta
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)
    created_by         = models.ForeignKey(
        Utilisateur, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='depots_crees',
    )

    class Meta:
        db_table            = 'depots'
        ordering            = ['-created_at']
        verbose_name        = 'Dépôt'
        verbose_name_plural = 'Dépôts'

    def __str__(self):
        return f'DEP {self.numero_depot} — {self.denomination}'
