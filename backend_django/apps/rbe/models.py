import uuid
from datetime import date, timedelta
from django.conf import settings
from django.db import models


# ─────────────────────────────────────────────────────────────────────────────
# ENTITE JURIDIQUE  —  Table centrale (RC et hors RC)
# ─────────────────────────────────────────────────────────────────────────────

class EntiteJuridique(models.Model):
    """
    Entité juridique soumise à l'obligation de déclaration du BE.
    Couvre aussi bien les sociétés du RC que les entités hors RC
    (associations, ONG, fondations, fiducies…).
    """
    TYPE_ENTITE_CHOICES = [
        ('SOCIETE',      'Société commerciale'),
        ('SUCCURSALE',   'Succursale de société étrangère'),
        ('ASSOCIATION',  'Association'),
        ('ONG',          'ONG'),
        ('FONDATION',    'Fondation'),
        ('FIDUCIE',      'Fiducie / Construction juridique'),
    ]
    SOURCE_CHOICES = [
        ('RC',      'Registre du Commerce'),
        ('HORS_RC', 'Hors Registre du Commerce'),
    ]
    AUTORITE_CHOICES = [
        ('RC',        'Registre du Commerce'),
        ('MINISTERE', 'Ministère'),
        ('TRIBUNAL',  'Tribunal'),
        ('AUTRE',     'Autre autorité'),
    ]

    uuid                   = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    type_entite            = models.CharField(max_length=20, choices=TYPE_ENTITE_CHOICES, db_index=True)
    denomination           = models.CharField(max_length=300, verbose_name='Dénomination (FR)')
    denomination_ar        = models.CharField(max_length=300, blank=True, verbose_name='Dénomination (AR)')
    source_entite          = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='HORS_RC', db_index=True)

    # Lien RC (uniquement si source_entite = RC)
    ra = models.ForeignKey(
        'registres.RegistreAnalytique', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='entite_juridique',
        verbose_name='Registre analytique lié',
    )
    numero_rc              = models.CharField(max_length=50, blank=True, verbose_name='N° RC')

    # Informations d'enregistrement
    autorite_enregistrement = models.CharField(
        max_length=20, choices=AUTORITE_CHOICES, default='AUTRE',
        verbose_name='Autorité d\'enregistrement',
    )
    numero_enregistrement  = models.CharField(max_length=100, blank=True, verbose_name='N° d\'enregistrement')
    date_creation          = models.DateField(null=True, blank=True, verbose_name='Date de création')
    pays                   = models.CharField(max_length=100, default='Mauritanie', verbose_name='Pays')
    siege_social           = models.TextField(blank=True, verbose_name='Siège social / Adresse')

    # Audit
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='entites_juridiques_creees',
    )

    class Meta:
        db_table            = 'rbe_entites_juridiques'
        ordering            = ['-created_at']
        verbose_name        = 'Entité juridique'
        verbose_name_plural = 'Entités juridiques'

    def __str__(self):
        return f"{self.denomination} ({self.get_type_entite_display()})"

    @property
    def denomination_display(self):
        if self.ra:
            return self.ra.denomination or self.denomination
        return self.denomination


# ─────────────────────────────────────────────────────────────────────────────
# REGISTRE BE  —  Déclaration (inchangé structurellement + nouveaux champs)
# ─────────────────────────────────────────────────────────────────────────────

class RegistreBE(models.Model):
    TYPE_ENTITE_CHOICES = [
        ('SOCIETE',                  'Société commerciale'),
        ('SUCCURSALE',               'Succursale de société étrangère'),
        ('ASSOCIATION',              'Association'),
        ('ONG',                      'ONG'),
        ('FONDATION',                'Fondation'),
        ('FIDUCIE',                  'Fiducie / Construction juridique'),
        # Valeur legacy (compatibilité)
        ('CONSTRUCTION_JURIDIQUE',   'Construction juridique / Fiducie'),
    ]
    TYPE_DECLARATION_CHOICES = [
        ('INITIALE',      'Déclaration initiale'),
        ('MODIFICATION',  'Modification'),
        ('RADIATION',     'Radiation'),
    ]
    STATUT_CHOICES = [
        ('BROUILLON',    'Brouillon'),
        ('EN_ATTENTE',   'En attente de validation'),
        ('RETOURNE',     'Retourné pour correction'),
        ('VALIDE',       'Validé'),
        ('MODIFIE',      'Modifié'),
        ('RADIE',        'Radié'),
    ]
    MODE_DECLARATION_CHOICES = [
        ('IMMEDIATE',  'Déclaration immédiate'),
        ('DIFFEREE',   'Déclaration différée (15 jours)'),
    ]

    uuid       = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_rbe = models.CharField(max_length=30, unique=True, blank=True)

    # ── Entité (nouvelle architecture) ────────────────────────────────────────
    entite = models.ForeignKey(
        EntiteJuridique, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='declarations',
        verbose_name='Entité juridique',
    )

    # ── Rétrocompatibilité : lien direct RA + dénomination ────────────────────
    type_entite            = models.CharField(max_length=30, choices=TYPE_ENTITE_CHOICES)
    ra                     = models.ForeignKey(
        'registres.RegistreAnalytique', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='declarations_rbe',
    )
    denomination_entite    = models.CharField(max_length=300, blank=True)
    denomination_entite_ar = models.CharField(max_length=300, blank=True)

    # ── Mode et délai ─────────────────────────────────────────────────────────
    mode_declaration = models.CharField(
        max_length=20, choices=MODE_DECLARATION_CHOICES,
        default='IMMEDIATE', blank=True,
        verbose_name='Mode de déclaration',
    )
    date_limite = models.DateField(
        null=True, blank=True,
        verbose_name='Date limite de déclaration',
    )

    # ── Type de déclaration et statut ─────────────────────────────────────────
    type_declaration     = models.CharField(max_length=20, choices=TYPE_DECLARATION_CHOICES, default='INITIALE')
    statut               = models.CharField(max_length=20, choices=STATUT_CHOICES, default='BROUILLON', db_index=True)
    declaration_initiale = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='suites',
    )

    # ── Déclarant ─────────────────────────────────────────────────────────────
    declarant_civilite   = models.CharField(max_length=5, choices=[('MR','M.'),('MME','Mme'),('MLLE','Mlle')], blank=True, verbose_name='Civilité du déclarant')
    declarant_nom        = models.CharField(max_length=200, blank=True)
    declarant_prenom     = models.CharField(max_length=200, blank=True)
    declarant_nom_ar     = models.CharField(max_length=200, blank=True)
    declarant_qualite    = models.CharField(max_length=200, blank=True)
    declarant_qualite_ar = models.CharField(max_length=200, blank=True)
    declarant_adresse    = models.TextField(blank=True)
    declarant_telephone  = models.CharField(max_length=50, blank=True)
    declarant_email      = models.EmailField(blank=True)

    # ── Date et lieu ──────────────────────────────────────────────────────────
    date_declaration = models.DateField(null=True, blank=True)
    localite         = models.ForeignKey(
        'parametrage.Localite', null=True, blank=True,
        on_delete=models.SET_NULL,
    )

    # ── Motif et observations ─────────────────────────────────────────────────
    motif                  = models.TextField(blank=True)
    observations           = models.TextField(blank=True)
    observations_greffier  = models.TextField(blank=True)
    demandeur              = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    created_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='rbe_crees',
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='rbe_valides',
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table            = 'rbe_declarations'
        ordering            = ['-created_at']
        verbose_name        = 'Déclaration RBE'
        verbose_name_plural = 'Déclarations RBE'

    def __str__(self):
        return f"{self.numero_rbe or 'RBE-?'} – {self.denomination_entite or '—'}"

    @staticmethod
    def get_next_numero():
        year   = date.today().year
        prefix = f'RBE{year}'
        last   = RegistreBE.objects.filter(
            numero_rbe__startswith=prefix
        ).order_by('numero_rbe').last()
        if last and last.numero_rbe:
            try:
                seq = int(last.numero_rbe[len(prefix):]) + 1
            except (ValueError, IndexError):
                seq = 1
        else:
            seq = 1
        return f'{prefix}{seq:06d}'

    def save(self, *args, **kwargs):
        if not self.numero_rbe:
            self.numero_rbe = RegistreBE.get_next_numero()
        # Calculer date_limite automatiquement pour mode différé
        if self.mode_declaration == 'DIFFEREE' and not self.date_limite and self.date_declaration:
            self.date_limite = self.date_declaration + timedelta(days=15)
        super().save(*args, **kwargs)

    @property
    def denomination(self):
        if self.entite:
            return self.entite.denomination_display
        if self.ra:
            return self.ra.denomination or self.denomination_entite
        return self.denomination_entite

    @property
    def source_entite(self):
        """RC si lié à un RA, sinon HORS_RC."""
        if self.entite:
            return self.entite.source_entite
        return 'RC' if self.ra_id else 'HORS_RC'


# ─────────────────────────────────────────────────────────────────────────────
# BENEFICIAIRE EFFECTIF  —  Personne physique uniquement
# ─────────────────────────────────────────────────────────────────────────────

class BeneficiaireEffectif(models.Model):
    """
    ⚠️ Uniquement personne physique.
    """
    NATURE_CONTROLE_CHOICES = [
        # Société / Succursale
        ('DETENTION_DIRECTE',     'Détention directe (≥ 20 % des parts / droits de vote)'),
        ('DETENTION_INDIRECTE',   'Détention indirecte'),
        ('CONTROLE',              'Contrôle (autre mécanisme)'),
        ('DIRIGEANT_PAR_DEFAUT',  'Dirigeant par défaut (aucun autre BE identifié)'),
        # Association
        ('BENEFICIAIRE_BIENS',    'Bénéficiaire des biens (≥ 20 %)'),
        ('GROUPE_BENEFICIAIRE',   'Appartenance à un groupe de bénéficiaires'),
        ('CONTROLEUR_ASSO',       'Contrôleur de l\'association'),
        # Fiducie / Trust
        ('BENEFICIAIRE_ACTUEL',   'Bénéficiaire actuel de la fiducie'),
        ('BENEFICIAIRE_CATEGORIE','Appartenance à une catégorie de bénéficiaires'),
        ('CONTROLEUR_FINAL',      'Contrôleur final de la fiducie'),
        # Fondation
        ('CONTROLE_DERNIER_RESSORT', 'Contrôle en dernier ressort (fondation)'),
        # Générique
        ('REPRESENTANT_LEGAL',    'Représentant légal'),
        ('AUTRE',                 'Autre'),
    ]
    TYPE_DOCUMENT_CHOICES = [
        ('NNI',       "Carte Nationale d'Identité (NNI)"),
        ('PASSEPORT', 'Passeport'),
        ('AUTRE',     'Autre document'),
    ]

    CIVILITE_CHOICES = [('MR','M.'),('MME','Mme'),('MLLE','Mlle')]

    rbe = models.ForeignKey(RegistreBE, on_delete=models.CASCADE, related_name='beneficiaires')

    # Identité
    civilite  = models.CharField(max_length=5, choices=CIVILITE_CHOICES, blank=True, verbose_name='Civilité')
    nom       = models.CharField(max_length=200)
    prenom    = models.CharField(max_length=200, blank=True)
    nom_ar    = models.CharField(max_length=200, blank=True)
    prenom_ar = models.CharField(max_length=200, blank=True)

    # Naissance
    date_naissance    = models.DateField(null=True, blank=True)
    lieu_naissance    = models.CharField(max_length=200, blank=True)
    lieu_naissance_ar = models.CharField(max_length=200, blank=True)

    # Nationalité
    nationalite       = models.ForeignKey(
        'parametrage.Nationalite', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    nationalite_autre = models.CharField(max_length=100, blank=True)

    # Document d'identification
    type_document   = models.CharField(max_length=20, choices=TYPE_DOCUMENT_CHOICES, blank=True)
    numero_document = models.CharField(max_length=100, blank=True)

    # Adresse et contact
    adresse    = models.TextField(blank=True)
    adresse_ar = models.TextField(blank=True)
    telephone  = models.CharField(max_length=50, blank=True)
    email      = models.EmailField(blank=True)
    domicile   = models.TextField(blank=True, verbose_name='Domicile')

    # Nature du contrôle
    nature_controle        = models.CharField(max_length=30, choices=NATURE_CONTROLE_CHOICES, blank=True)
    nature_controle_detail = models.TextField(blank=True)
    pourcentage_detention  = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    date_prise_effet       = models.DateField(null=True, blank=True)

    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'rbe_beneficiaires'
        ordering            = ['-actif', 'nom', 'prenom']
        verbose_name        = 'Bénéficiaire effectif'
        verbose_name_plural = 'Bénéficiaires effectifs'

    def __str__(self):
        return f"{self.nom} {self.prenom}".strip()

    @property
    def nom_complet(self):
        return f"{self.nom} {self.prenom}".strip()


# ─────────────────────────────────────────────────────────────────────────────
# NATURE CONTROLE  —  Détail du lien bénéficiaire ↔ déclaration
# ─────────────────────────────────────────────────────────────────────────────

class NatureControle(models.Model):
    """
    Détail du lien de contrôle entre un bénéficiaire effectif et la déclaration.
    Permet de gérer plusieurs types de contrôle pour un même bénéficiaire.
    """
    TYPE_CONTROLE_CHOICES = [
        ('DETENTION_DIRECTE',    'Détention directe (≥ 20 %)'),
        ('DETENTION_INDIRECTE',  'Détention indirecte'),
        ('CONTROLE',             'Contrôle (autre mécanisme)'),
        ('DIRIGEANT_PAR_DEFAUT', 'Dirigeant par défaut'),
    ]

    beneficiaire  = models.ForeignKey(
        BeneficiaireEffectif, on_delete=models.CASCADE,
        related_name='natures_controle',
    )
    type_controle = models.CharField(max_length=30, choices=TYPE_CONTROLE_CHOICES)
    pourcentage   = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    description   = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'rbe_natures_controle'
        verbose_name        = 'Nature de contrôle'
        verbose_name_plural = 'Natures de contrôle'

    def __str__(self):
        return f"{self.get_type_controle_display()} — {self.beneficiaire}"


# ─────────────────────────────────────────────────────────────────────────────
# HISTORIQUE BE  —  Journal d'audit complet
# ─────────────────────────────────────────────────────────────────────────────

class ActionHistoriqueRBE(models.Model):
    ACTION_CHOICES = [
        ('CREATION',     'Création'),
        ('MODIFICATION', 'Modification'),
        ('ENVOI',        'Envoi au greffier'),
        ('RETOUR',       'Retour pour correction'),
        ('VALIDATION',   'Validation'),
        ('RADIATION',    'Radiation'),
        ('MAJ_STATUT',   'Mise à jour du statut'),
    ]

    rbe         = models.ForeignKey(RegistreBE, on_delete=models.CASCADE, related_name='historique')
    action      = models.CharField(max_length=20, choices=ACTION_CHOICES)
    commentaire = models.TextField(blank=True)
    ancien_etat = models.JSONField(null=True, blank=True, verbose_name='État avant')
    nouvel_etat = models.JSONField(null=True, blank=True, verbose_name='État après')
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'rbe_historique'
        ordering            = ['-created_at']
        verbose_name        = 'Historique RBE'
        verbose_name_plural = 'Historique RBE'

    def __str__(self):
        return f"{self.get_action_display()} – {self.rbe}"
