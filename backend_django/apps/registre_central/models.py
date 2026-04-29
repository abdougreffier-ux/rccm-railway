"""
apps.registre_central.models — Modèles pour la transmission au Registre Central

Architecture de transmission :

  RCCM local (tribunal) → [génère relevé mensuel] → ReleveActesMensuels
                        → [transmet] → TransmissionReleveActes → Registre Central national

Principes non négociables (RCCM) :
  1. Seuls les actes VALIDÉS par le greffier sont inclus dans un relevé.
  2. Le registre local est l'autorité juridique — le central est consolidation uniquement.
  3. Aucune modification rétroactive depuis le central n'est possible.
  4. Aucune dépendance bloquante : si le central est indisponible, le local continue.
  5. Chaque transmission est intégralement journalisée.
"""
from django.db import models


STATUT_RELEVE_CHOICES = [
    ('BROUILLON',  'Brouillon — en cours de génération'),
    ('FINALISE',   'Finalisé — prêt pour transmission'),
    ('TRANSMIS',   'Transmis au Registre Central'),
    ('ACQUITTE',   'Acquitté — réception confirmée par le central'),
    ('ERREUR',     'Erreur de transmission'),
    ('ANNULE',     'Annulé'),
]

STATUT_TRANSMISSION_CHOICES = [
    ('EN_COURS',   'En cours'),
    ('SUCCES',     'Succès'),
    ('ECHEC',      'Échec'),
    ('TIMEOUT',    'Timeout'),
    ('REJETE',     'Rejeté par le central'),
]


class ReleveActesMensuels(models.Model):
    """
    Relevé mensuel des actes validés, destiné à la transmission au Registre Central.

    Un relevé couvre exactement un mois (annee + mois).
    Il est unique par période (contrainte unique_together).

    Cycle de vie :
      BROUILLON → FINALISE → TRANSMIS → ACQUITTE
                                      ↘ ERREUR (retry possible)

    Le contenu (actes_json) est sérialisé au format RCCM standard.
    Il ne peut être modifié une fois le relevé FINALISE.
    """
    annee   = models.IntegerField(verbose_name='Année', db_index=True)
    mois    = models.IntegerField(verbose_name='Mois (1–12)', db_index=True)

    # ── Statistiques de surface ────────────────────────────────────────────────
    nb_immatriculations = models.IntegerField(default=0, verbose_name='Nb immatriculations')
    nb_modifications    = models.IntegerField(default=0, verbose_name='Nb modifications')
    nb_cessions         = models.IntegerField(default=0, verbose_name='Nb cessions')
    nb_radiations       = models.IntegerField(default=0, verbose_name='Nb radiations')

    # ── Contenu sérialisé ─────────────────────────────────────────────────────
    # Format JSON : { "immatriculations": [...], "modifications": [...],
    #                 "cessions": [...], "radiations": [...] }
    actes_json = models.JSONField(
        default=dict,
        verbose_name='Actes sérialisés (format RCCM standard)',
    )

    # ── Workflow ───────────────────────────────────────────────────────────────
    statut     = models.CharField(
        max_length=20, choices=STATUT_RELEVE_CHOICES, default='BROUILLON', db_index=True,
    )
    genere_le  = models.DateTimeField(auto_now_add=True, verbose_name='Généré le')
    genere_par = models.ForeignKey(
        'utilisateurs.Utilisateur', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='releves_generes',
        verbose_name='Généré par',
    )
    finalise_le  = models.DateTimeField(null=True, blank=True, verbose_name='Finalisé le')
    finalise_par = models.ForeignKey(
        'utilisateurs.Utilisateur', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='releves_finalises',
        verbose_name='Finalisé par',
    )
    observations = models.TextField(blank=True)

    class Meta:
        db_table            = 'registre_central_releve'
        unique_together     = [('annee', 'mois')]
        ordering            = ['-annee', '-mois']
        verbose_name        = 'Relevé actes mensuel'
        verbose_name_plural = 'Relevés actes mensuels'

    def __str__(self):
        return f'Relevé {self.annee}/{self.mois:02d} — {self.get_statut_display()}'

    @property
    def periode_label(self):
        import calendar
        return f'{calendar.month_name[self.mois]} {self.annee}'

    @property
    def nb_actes_total(self):
        return (self.nb_immatriculations + self.nb_modifications +
                self.nb_cessions + self.nb_radiations)


class TransmissionReleveActes(models.Model):
    """
    Journalise chaque tentative de transmission d'un relevé au Registre Central.

    Garanties :
      - Chaque tentative est enregistrée indépendamment (tentative N° X).
      - La réponse brute du central (JSON) est conservée intégralement.
      - En cas d'acquittement, la référence attribuée par le central est stockée.
      - Le journal est immuable — aucune entrée ne peut être modifiée après création.
    """
    releve       = models.ForeignKey(
        ReleveActesMensuels, on_delete=models.PROTECT,
        related_name='transmissions', verbose_name='Relevé',
    )
    tentative    = models.IntegerField(default=1, verbose_name='N° tentative')

    # ── Paramètres de la transmission ──────────────────────────────────────────
    url_cible    = models.URLField(
        blank=True, max_length=500,
        verbose_name='URL endpoint Registre Central',
    )

    # ── Résultat ───────────────────────────────────────────────────────────────
    statut       = models.CharField(
        max_length=20, choices=STATUT_TRANSMISSION_CHOICES,
        default='EN_COURS', verbose_name='Statut transmission',
    )
    http_status  = models.IntegerField(null=True, blank=True, verbose_name='Code HTTP reçu')
    # Référence attribuée par le Registre Central à la réception (acquittement)
    reference_centrale = models.CharField(
        max_length=100, blank=True,
        verbose_name='Référence Registre Central',
    )
    reponse_json = models.JSONField(
        null=True, blank=True,
        verbose_name='Réponse JSON du Registre Central',
    )
    erreur_detail = models.TextField(blank=True, verbose_name='Détail erreur')

    # ── Traçabilité ────────────────────────────────────────────────────────────
    transmis_le  = models.DateTimeField(auto_now_add=True, verbose_name='Transmis le')
    transmis_par = models.ForeignKey(
        'utilisateurs.Utilisateur', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='transmissions_rc',
        verbose_name='Transmis par',
    )
    duree_ms     = models.IntegerField(null=True, blank=True, verbose_name='Durée transmission (ms)')

    class Meta:
        db_table            = 'registre_central_transmission'
        ordering            = ['-transmis_le']
        verbose_name        = 'Transmission relevé'
        verbose_name_plural = 'Transmissions relevés'

    def __str__(self):
        return (
            f'Transmission {self.releve} — tentative {self.tentative} '
            f'— {self.get_statut_display()}'
        )
