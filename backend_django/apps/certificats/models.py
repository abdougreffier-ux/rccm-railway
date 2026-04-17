from django.db import models
from django.utils import timezone


class CertificatGreffier(models.Model):
    """
    Certificats déclaratifs délivrés par le greffier (non faillite, non litige, etc.).

    Règle juridique RCCM :
      Un certificat est délivré dans une seule langue, figée au moment de la délivrance.
      Il est interdit d'en produire une version dans une autre langue sans délivrer
      un nouveau certificat distinct, avec son propre numéro et sa propre traçabilité.
    """

    TYPE_CHOICES = [
        ('NON_FAILLITE',              'Certificat de non faillite'),
        ('NON_LITIGE',                'Certificat de non litige'),
        ('NEG_PRIVILEGES',            'Certificat négatif de privilèges et de nantissements'),
        ('ABS_PROCEDURE_COLLECTIVE',  "Certificat d'absence de procédure collective"),
        ('NON_LIQUIDATION',           'Certificat de non liquidation judiciaire'),
    ]

    LANGUE_CHOICES = [
        ('FR', 'Français'),
        ('AR', 'Arabe / عربي'),
    ]

    # ── Identification ────────────────────────────────────────────────────────
    numero          = models.CharField(max_length=30, unique=True, editable=False,
                                       verbose_name='Numéro de certificat')
    type_certificat = models.CharField(max_length=30, choices=TYPE_CHOICES,
                                       verbose_name='Type de certificat')

    # ── Langue — figée à la délivrance, immuable ──────────────────────────────
    langue          = models.CharField(
        max_length=2,
        choices=LANGUE_CHOICES,
        default='FR',
        editable=False,          # interdit la modification via l'ORM admin
        verbose_name='Langue du certificat',
        help_text=(
            'Langue figée à la délivrance. '
            'Un nouveau certificat doit être délivré pour obtenir une version '
            'dans l\'autre langue.'
        ),
    )

    # ── Entité concernée ──────────────────────────────────────────────────────
    ra              = models.ForeignKey(
        'registres.RegistreAnalytique',
        on_delete=models.PROTECT,
        related_name='certificats_greffier',
        verbose_name='Entité (RA)',
    )

    # ── Délivrance ────────────────────────────────────────────────────────────
    delivre_par     = models.ForeignKey(
        'utilisateurs.Utilisateur',
        on_delete=models.PROTECT,
        related_name='certificats_delivres',
        verbose_name='Délivré par (greffier)',
    )
    date_delivrance = models.DateTimeField(auto_now_add=True, verbose_name='Date de délivrance')
    observations    = models.TextField(blank=True, verbose_name='Observations')

    class Meta:
        db_table            = 'certificats_greffier'
        ordering            = ['-date_delivrance']
        verbose_name        = 'Certificat greffier'
        verbose_name_plural = 'Certificats greffier'

    def __str__(self):
        return f"{self.numero} — {self.get_type_certificat_display()}"

    def save(self, *args, **kwargs):
        if not self.numero:
            now    = timezone.now()
            count  = CertificatGreffier.objects.filter(
                date_delivrance__year=now.year,
                date_delivrance__month=now.month,
            ).count() + 1
            self.numero = f"CERT-{now.year}{now.month:02d}-{count:04d}"
        super().save(*args, **kwargs)
