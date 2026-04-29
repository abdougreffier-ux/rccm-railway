"""
apps.interop.models — Modèles pour l'interopérabilité RCCM

Architecture API inter-administrations RCCM :

  ┌──────────────────────────────────────────────────────────────┐
  │                       CŒUR RCCM                              │
  │   (registres, workflow, documents — autorité juridique)      │
  └──────────────────┬───────────────────────────────────────────┘
                     │ API KEY + IP WHITELIST + JOURNAL
          ┌──────────┴──────────────────────────┐
          │        API inter-administrations      │
          │  /api/v1/interop/*                    │
          └──┬──────────┬──────────┬─────────────┘
             │          │          │
         KHIDMATY    ANRPTS       DGI / CNSS / APIM
         (portail)   (identité)   (fiscalité / social)

Principes non négociables :
  • Le RCCM est l'autorité juridique — les systèmes externes sont consommateurs.
  • Tout échange est journalisé (JournalAppelExterne).
  • Aucune dépendance bloquante : si un système externe est indisponible,
    le workflow interne RCCM continue sans interruption.
"""
import hashlib
import secrets
from django.db import models
from django.utils import timezone


# ── Systèmes externes autorisés ────────────────────────────────────────────────

TYPE_SYSTEME_CHOICES = [
    ('KHIDMATY',         'Portail usager KHIDMATY'),
    ('ANRPTS',           "ANRPTS — Autorité Nationale d'État Civil"),
    ('DGI',              'Direction Générale des Impôts'),
    ('CNSS',             'Caisse Nationale de Sécurité Sociale'),
    ('APIM',             'APIM — Guichet Unique des Entreprises'),
    ('REGISTRE_CENTRAL', 'Registre Central du Commerce (consolidation nationale)'),
    ('AUTRE',            'Autre administration / partenaire'),
]


class SystemeExterne(models.Model):
    """
    Représente une administration ou un système partenaire autorisé à
    consommer les API RCCM inter-administrations.

    Chaque système a :
      - un code unique lisible (ex : 'ANRPTS', 'KHIDMATY')
      - une liste blanche d'adresses IP autorisées (optionnelle)
      - un ou plusieurs couples de clés API (CleAPIExterne)
    """
    code         = models.CharField(max_length=50, unique=True, verbose_name='Code système')
    libelle      = models.CharField(max_length=200, verbose_name='Libellé')
    libelle_ar   = models.CharField(max_length=200, blank=True, verbose_name='Libellé (arabe)')
    type_systeme = models.CharField(
        max_length=30, choices=TYPE_SYSTEME_CHOICES, default='AUTRE',
        verbose_name='Type de système',
    )
    actif        = models.BooleanField(default=True, verbose_name='Actif')
    # Liste blanche IP : liste JSON de chaînes CIDR/IPv4/IPv6
    # Exemple : ["41.222.10.0/24", "196.200.35.5"]
    # Si vide → pas de filtrage IP (déconseillé en production).
    ip_autorises = models.JSONField(
        default=list, blank=True,
        verbose_name='IPs autorisées (whitelist CIDR/IPv4)',
        help_text='Laisser vide pour désactiver le filtrage IP (non recommandé en production).',
    )
    # Scopes autorisés globalement pour ce système (hérités par toutes ses clés)
    # Ex : ["lecture_rc", "verification_statut", "recherche_entreprise"]
    scopes       = models.JSONField(default=list, blank=True, verbose_name='Scopes autorisés')
    description  = models.TextField(blank=True)
    contact_technique = models.EmailField(blank=True, verbose_name='Contact technique')
    url_documentation = models.URLField(blank=True, verbose_name='URL documentation API partenaire')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table            = 'interop_systeme_externe'
        ordering            = ['code']
        verbose_name        = 'Système externe'
        verbose_name_plural = 'Systèmes externes'

    def __str__(self):
        etat = '✓' if self.actif else '✗'
        return f'[{etat}] {self.code} — {self.libelle}'


class CleAPIExterne(models.Model):
    """
    Clé API émise par le RCCM pour un système externe.

    Sécurité :
      - La clé brute n'est jamais stockée en clair.
      - Seul le hachage SHA-256 est persisté (cle_hachee).
      - Le préfixe public (8 caractères) permet d'identifier la clé en UI
        sans révéler sa valeur.
      - La clé brute est générée via secrets.token_urlsafe(48) et affichée
        UNE SEULE FOIS lors de la création.

    Cycle de vie :
      - Une clé peut être désactivée (actif=False) sans suppression.
      - Une clé peut avoir une date d'expiration.
      - Chaque utilisation met à jour derniere_utilisation.
    """
    systeme              = models.ForeignKey(
        SystemeExterne, on_delete=models.PROTECT,
        related_name='cles', verbose_name='Système',
    )
    cle_hachee           = models.CharField(
        max_length=64, unique=True,
        verbose_name='Clé hachée (SHA-256, 64 hex chars)',
    )
    prefixe              = models.CharField(
        max_length=12, verbose_name='Préfixe public',
        help_text='8 premiers caractères de la clé brute — affichage uniquement.',
    )
    libelle              = models.CharField(max_length=200, blank=True, verbose_name='Libellé')
    actif                = models.BooleanField(default=True, verbose_name='Active')
    # Scopes spécifiques à cette clé (surcharge ou sous-ensemble des scopes système)
    scopes               = models.JSONField(
        default=list, blank=True,
        verbose_name='Scopes spécifiques à cette clé',
    )
    date_expiration      = models.DateTimeField(
        null=True, blank=True, verbose_name='Date d\'expiration',
    )
    derniere_utilisation = models.DateTimeField(
        null=True, blank=True, verbose_name='Dernière utilisation',
    )
    nb_appels_total      = models.BigIntegerField(default=0, verbose_name='Nb appels total')
    created_by           = models.ForeignKey(
        'utilisateurs.Utilisateur', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='cles_api_creees',
        verbose_name='Créée par',
    )
    created_at           = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = 'interop_cle_api_externe'
        ordering            = ['systeme__code', 'prefixe']
        verbose_name        = 'Clé API externe'
        verbose_name_plural = 'Clés API externes'

    def __str__(self):
        etat = '✓' if self.actif else '✗'
        return f'[{etat}] {self.systeme.code} / {self.prefixe}… ({self.libelle or "sans libellé"})'

    def est_valide(self):
        """Vérifie que la clé est active et non expirée."""
        if not self.actif:
            return False
        if self.date_expiration and self.date_expiration < timezone.now():
            return False
        return True

    @classmethod
    def creer_cle(cls, systeme, libelle='', scopes=None, date_expiration=None, created_by=None):
        """
        Crée une nouvelle clé API et retourne le tuple (instance, cle_brute).
        La cle_brute n'est JAMAIS stockée — l'afficher une seule fois puis l'oublier.
        """
        cle_brute = secrets.token_urlsafe(48)           # 48 octets → 64 chars base64url
        cle_hachee = hashlib.sha256(cle_brute.encode()).hexdigest()
        instance = cls.objects.create(
            systeme=systeme,
            cle_hachee=cle_hachee,
            prefixe=cle_brute[:8],
            libelle=libelle,
            scopes=scopes or [],
            date_expiration=date_expiration,
            created_by=created_by,
        )
        return instance, cle_brute


# ── Journal des appels entrants ────────────────────────────────────────────────

class JournalAppelExterne(models.Model):
    """
    Journal de traçabilité de chaque appel entrant via l'API inter-administrations.

    Garantit :
      - Non répudiation (qui a appelé quoi et quand)
      - Audit en cas de litige
      - Supervision des volumes et erreurs par système
    """
    systeme      = models.ForeignKey(
        SystemeExterne, null=True, on_delete=models.SET_NULL,
        related_name='appels', verbose_name='Système appelant',
    )
    cle          = models.ForeignKey(
        CleAPIExterne, null=True, on_delete=models.SET_NULL,
        related_name='appels', verbose_name='Clé API utilisée',
    )
    methode      = models.CharField(max_length=10, verbose_name='Méthode HTTP')
    endpoint     = models.CharField(max_length=500, verbose_name='Endpoint appelé')
    ip_appelant  = models.GenericIPAddressField(null=True, blank=True, verbose_name='IP appelant')
    statut_http  = models.IntegerField(verbose_name='Code HTTP réponse')
    duree_ms     = models.IntegerField(null=True, blank=True, verbose_name='Durée traitement (ms)')
    # Résumé non-sensible des paramètres (sans données personnelles)
    parametres   = models.JSONField(default=dict, blank=True, verbose_name='Paramètres requête (résumé)')
    erreur       = models.TextField(blank=True, verbose_name='Détail erreur')
    created_at   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table            = 'interop_journal_appel_externe'
        ordering            = ['-created_at']
        verbose_name        = 'Journal appel externe'
        verbose_name_plural = 'Journal appels externes'
        indexes = [
            models.Index(fields=['systeme', 'created_at']),
            models.Index(fields=['statut_http', 'created_at']),
        ]

    def __str__(self):
        sys_code = self.systeme.code if self.systeme else '?'
        return f'{self.created_at:%Y-%m-%d %H:%M} | {sys_code} | {self.methode} {self.endpoint} → {self.statut_http}'
