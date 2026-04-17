from django.db import models


class Nationalite(models.Model):
    code       = models.CharField(max_length=5,   unique=True)
    libelle_fr = models.CharField(max_length=100)
    libelle_ar = models.CharField(max_length=100, blank=True)
    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'nationalites'
        ordering            = ['libelle_fr']
        verbose_name        = 'Nationalité'
        verbose_name_plural = 'Nationalités'

    def __str__(self): return self.libelle_fr


class FormeJuridique(models.Model):
    TYPE_CHOICES = [('PH','Personne Physique'),('PM','Personne Morale'),('SC','Succursale'),('ALL','Tous')]
    code        = models.CharField(max_length=20, unique=True)
    libelle_fr  = models.CharField(max_length=150)
    libelle_ar  = models.CharField(max_length=150, blank=True)
    type_entite = models.CharField(max_length=5, choices=TYPE_CHOICES, default='ALL')
    actif       = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'formes_juridiques'
        ordering            = ['libelle_fr']
        verbose_name        = 'Forme juridique'
        verbose_name_plural = 'Formes juridiques'

    def __str__(self): return f'{self.code} – {self.libelle_fr}'


class DomaineActivite(models.Model):
    code       = models.CharField(max_length=20,  unique=True)
    libelle_fr = models.CharField(max_length=200)
    libelle_ar = models.CharField(max_length=200, blank=True)
    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'domaines_activites'
        ordering            = ['libelle_fr']
        verbose_name        = "Domaine d'activité"
        verbose_name_plural = "Domaines d'activités"

    def __str__(self): return self.libelle_fr


class Fonction(models.Model):
    TYPE_CHOICES = [('PH','PH'),('PM','PM'),('SC','SC'),('ALL','Tous')]
    code        = models.CharField(max_length=20, unique=True)
    libelle_fr  = models.CharField(max_length=100)
    libelle_ar  = models.CharField(max_length=100, blank=True)
    type_entite = models.CharField(max_length=5, choices=TYPE_CHOICES, default='ALL')
    actif       = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'fonctions'
        ordering            = ['libelle_fr']
        verbose_name        = 'Fonction'
        verbose_name_plural = 'Fonctions'

    def __str__(self): return self.libelle_fr


class TypeDocument(models.Model):
    code         = models.CharField(max_length=30, unique=True)
    libelle_fr   = models.CharField(max_length=200)
    libelle_ar   = models.CharField(max_length=200, blank=True)
    type_demande = models.CharField(max_length=20, blank=True)
    obligatoire  = models.BooleanField(default=False)
    actif        = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'types_documents'
        ordering            = ['libelle_fr']
        verbose_name        = 'Type de document'
        verbose_name_plural = 'Types de documents'

    def __str__(self): return self.libelle_fr


class TypeDemande(models.Model):
    TYPE_CHOICES = [('PH','PH'),('PM','PM'),('SC','SC'),('ALL','Tous')]
    code             = models.CharField(max_length=30, unique=True)
    libelle_fr       = models.CharField(max_length=200)
    libelle_ar       = models.CharField(max_length=200, blank=True)
    type_entite      = models.CharField(max_length=5, choices=TYPE_CHOICES, default='ALL')
    delai_traitement = models.IntegerField(default=5)
    actif            = models.BooleanField(default=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'types_demandes'
        ordering            = ['libelle_fr']
        verbose_name        = 'Type de demande'
        verbose_name_plural = 'Types de demandes'

    def __str__(self): return self.libelle_fr


class Localite(models.Model):
    TYPE_CHOICES = [('WILAYA','Wilaya'),('MOUGHATAA','Moughataa'),('COMMUNE','Commune')]
    code       = models.CharField(max_length=20, unique=True)
    libelle_fr = models.CharField(max_length=150)
    libelle_ar = models.CharField(max_length=150, blank=True)
    type       = models.CharField(max_length=20, choices=TYPE_CHOICES, default='WILAYA')
    parent     = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='enfants')
    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'localites'
        ordering            = ['libelle_fr']
        verbose_name        = 'Localité'
        verbose_name_plural = 'Localités'

    def __str__(self): return self.libelle_fr


class Tarif(models.Model):
    code         = models.CharField(max_length=30, unique=True)
    libelle_fr   = models.CharField(max_length=200)
    type_demande = models.CharField(max_length=30, blank=True)
    montant      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    devise       = models.CharField(max_length=5, default='MRU')
    date_effet   = models.DateField(auto_now_add=True)
    date_fin     = models.DateField(null=True, blank=True)
    actif        = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'tarifs'
        ordering            = ['libelle_fr']
        verbose_name        = 'Tarif'
        verbose_name_plural = 'Tarifs'

    def __str__(self): return f'{self.libelle_fr} – {self.montant} {self.devise}'


class Signataire(models.Model):
    """Signataire des documents officiels (certificats, extraits…)."""
    nom        = models.CharField(max_length=200, verbose_name='Nom du signataire')
    nom_ar     = models.CharField(max_length=200, blank=True, verbose_name='Nom (arabe)')
    qualite    = models.CharField(max_length=200, verbose_name='Qualité / Titre')
    qualite_ar = models.CharField(max_length=200, blank=True, verbose_name='Qualité (arabe)')
    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'signataires'
        verbose_name        = 'Signataire'
        verbose_name_plural = 'Signataires'

    def __str__(self): return f'{self.nom} – {self.qualite}'
