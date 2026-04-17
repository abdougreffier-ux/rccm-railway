from django.db import models
from django.conf import settings


class DemandeAutorisation(models.Model):
    """
    Demande d'autorisation soumise par un agent (GU ou Tribunal) au greffier
    pour imprimer un document validé ou corriger un dossier validé.

    Workflow :
        Agent crée  →  EN_ATTENTE
        Greffier    →  AUTORISEE  (+ effets secondaires selon type_demande)
                    →  REFUSEE
        Système     →  EXPIREE    (impression uniquement, après date_expiration)

    Durée d'impression autorisée : EXPIRATION_IMPRESSION_MINUTES (20 min).
    """

    # ── Durée de validité de l'autorisation d'impression ─────────────────────
    EXPIRATION_IMPRESSION_MINUTES = 20

    # ── Choix ─────────────────────────────────────────────────────────────────
    TYPE_DEMANDE_CHOICES = [
        ('IMPRESSION', 'Impression'),
        ('CORRECTION', 'Correction'),
    ]
    STATUT_CHOICES = [
        ('EN_ATTENTE', 'En attente'),
        ('AUTORISEE',  'Autorisée'),
        ('REFUSEE',    'Refusée'),
        ('EXPIREE',    'Expirée'),
    ]
    TYPE_DOSSIER_CHOICES = [
        ('RA',         'Registre Analytique'),
        ('HISTORIQUE', 'Immatriculation Historique'),
    ]
    DOCUMENT_TYPE_CHOICES = [
        ('EXTRAIT_RA',         'Extrait d\'immatriculation (RA)'),
        ('EXTRAIT_RC_COMPLET', 'Extrait RC complet'),
        ('',                   'N/A — Correction'),
    ]

    # ── Champs principaux ────────────────────────────────────────────────────
    type_demande   = models.CharField(max_length=20,  choices=TYPE_DEMANDE_CHOICES)
    type_dossier   = models.CharField(max_length=20,  choices=TYPE_DOSSIER_CHOICES)
    dossier_id     = models.IntegerField(help_text='PK du dossier concerné (RA ou Historique)')
    document_type  = models.CharField(
        max_length=30, choices=DOCUMENT_TYPE_CHOICES, blank=True, default='',
        help_text='Renseigné uniquement pour les demandes de type IMPRESSION',
    )
    motif          = models.TextField(help_text='Motif obligatoire fourni par l\'agent')

    # ── Statut & décision ────────────────────────────────────────────────────
    statut          = models.CharField(max_length=20, choices=STATUT_CHOICES,
                                       default='EN_ATTENTE', db_index=True)
    motif_decision  = models.TextField(blank=True, default='',
                                       help_text='Commentaire du greffier lors de sa décision')

    # ── Acteurs ───────────────────────────────────────────────────────────────
    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='demandes_autorisation',
    )
    decideur  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='decisions_autorisation',
    )

    # ── Horodatage ────────────────────────────────────────────────────────────
    date_demande    = models.DateTimeField(auto_now_add=True)
    date_decision   = models.DateTimeField(null=True, blank=True)
    date_expiration = models.DateTimeField(
        null=True, blank=True,
        help_text='Pour IMPRESSION : timestamp d\'expiration (date_decision + 20 min)',
    )

    class Meta:
        ordering = ['-date_demande']
        verbose_name = 'Demande d\'autorisation'
        verbose_name_plural = 'Demandes d\'autorisation'
        indexes = [
            models.Index(fields=['demandeur', 'type_dossier', 'dossier_id', 'statut']),
        ]

    def __str__(self):
        return (
            f"[{self.get_type_demande_display()}] "
            f"{self.get_type_dossier_display()} #{self.dossier_id} "
            f"— {self.demandeur} — {self.get_statut_display()}"
        )

    @property
    def est_valide(self):
        """Vrai si l'autorisation est accordée et non expirée."""
        from django.utils import timezone
        if self.statut != 'AUTORISEE':
            return False
        if self.date_expiration and timezone.now() > self.date_expiration:
            return False
        return True
