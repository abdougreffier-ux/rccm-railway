import uuid
from django.db import models
from apps.parametrage.models import Nationalite, FormeJuridique, Localite, Fonction, DomaineActivite
from apps.utilisateurs.models import Utilisateur


class PersonnePhysique(models.Model):
    CIVILITE_CHOICES    = [('MR','M.'),('MME','Mme'),('MLLE','Mlle')]
    SEXE_CHOICES        = [('M','Masculin'),('F','Féminin')]
    MATRIMONIAL_CHOICES = [('CELIBATAIRE','Célibataire'),('MARIE','Marié(e)'),('DIVORCE','Divorcé(e)'),('VEUF','Veuf/Veuve')]

    uuid                = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    nni                 = models.CharField(max_length=20, unique=True, null=True, blank=True, verbose_name='NNI')
    civilite            = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True, verbose_name='Civilité')
    nom                 = models.CharField(max_length=150, verbose_name='Nom')
    prenom              = models.CharField(max_length=150, blank=True, verbose_name='Prénom')
    nom_ar              = models.CharField(max_length=150, blank=True, verbose_name='Nom (arabe)')
    prenom_ar           = models.CharField(max_length=150, blank=True, verbose_name='Prénom (arabe)')
    date_naissance      = models.DateField(null=True, blank=True, verbose_name='Date de naissance')
    lieu_naissance      = models.CharField(max_length=200, blank=True, verbose_name='Lieu de naissance')
    sexe                = models.CharField(max_length=1, choices=SEXE_CHOICES, blank=True)
    nationalite         = models.ForeignKey(Nationalite, null=True, blank=True, on_delete=models.SET_NULL)
    adresse             = models.TextField(blank=True, verbose_name='Adresse')
    adresse_ar          = models.TextField(blank=True, verbose_name='Adresse (arabe)')
    ville               = models.CharField(max_length=100, blank=True)
    localite            = models.ForeignKey(Localite, null=True, blank=True, on_delete=models.SET_NULL)
    telephone           = models.CharField(max_length=20, blank=True)
    email               = models.EmailField(blank=True)
    profession          = models.TextField(blank=True)
    situation_matrimoniale = models.CharField(max_length=20, choices=MATRIMONIAL_CHOICES, blank=True)
    nom_pere            = models.CharField(max_length=150, blank=True)
    nom_mere            = models.CharField(max_length=150, blank=True)
    num_passeport       = models.CharField(max_length=50, blank=True)
    num_carte_identite  = models.CharField(max_length=50, blank=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)
    created_by          = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table   = 'personnes_physiques'
        ordering   = ['nom', 'prenom']
        verbose_name        = 'Personne physique'
        verbose_name_plural = 'Personnes physiques'

    _CIV_DISPLAY = {'MR': 'M.', 'MME': 'Mme', 'MLLE': 'Mlle'}

    def __str__(self):
        civ = self._CIV_DISPLAY.get(self.civilite, '')
        parts = [p for p in [civ, self.prenom, self.nom] if p]
        return ' '.join(parts)

    @property
    def nom_complet(self):
        civ = self._CIV_DISPLAY.get(self.civilite, '')
        parts = [p for p in [civ, self.prenom, self.nom] if p]
        return ' '.join(parts)


class PersonneMorale(models.Model):
    uuid                = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    denomination        = models.CharField(max_length=300, verbose_name='Dénomination')
    denomination_ar     = models.CharField(max_length=300, blank=True, verbose_name='Dénomination (arabe)')
    sigle               = models.CharField(max_length=50, blank=True)
    forme_juridique     = models.ForeignKey(FormeJuridique, null=True, blank=True, on_delete=models.SET_NULL)
    capital_social      = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    devise_capital      = models.CharField(max_length=5, default='MRU')
    duree_societe       = models.IntegerField(null=True, blank=True, verbose_name='Durée (ans)')
    date_constitution   = models.DateField(null=True, blank=True)
    date_ag             = models.DateField(null=True, blank=True, verbose_name='Date AG')
    siege_social        = models.TextField(blank=True, verbose_name='Siège social')
    siege_social_ar     = models.TextField(blank=True)
    ville               = models.CharField(max_length=100, blank=True)
    localite            = models.ForeignKey(Localite, null=True, blank=True, on_delete=models.SET_NULL)
    telephone           = models.CharField(max_length=20, blank=True)
    fax                 = models.CharField(max_length=20, blank=True)
    email               = models.EmailField(blank=True)
    site_web            = models.URLField(blank=True)
    bp                  = models.CharField(max_length=50, blank=True, verbose_name='Boîte postale')
    nb_associes         = models.IntegerField(default=0)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)
    created_by          = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table   = 'personnes_morales'
        ordering   = ['denomination']
        verbose_name        = 'Personne morale'
        verbose_name_plural = 'Personnes morales'

    def __str__(self): return self.denomination


class Succursale(models.Model):
    uuid             = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    pm_mere          = models.ForeignKey(PersonneMorale, null=True, blank=True, on_delete=models.SET_NULL, related_name='succursales')
    denomination     = models.CharField(max_length=300)
    denomination_ar  = models.CharField(max_length=300, blank=True)
    pays_origine     = models.CharField(max_length=100, blank=True)
    capital_affecte  = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    devise           = models.CharField(max_length=5, default='MRU')
    siege_social     = models.TextField(blank=True)
    ville            = models.CharField(max_length=100, blank=True)
    localite         = models.ForeignKey(Localite, null=True, blank=True, on_delete=models.SET_NULL)
    telephone        = models.CharField(max_length=20, blank=True)
    email            = models.EmailField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)
    created_by       = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table   = 'succursales'
        ordering   = ['denomination']
        verbose_name        = 'Succursale'
        verbose_name_plural = 'Succursales'

    def __str__(self): return self.denomination
