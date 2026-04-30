"""
ReleveGuichetUnique — relevé mensuel officiel des immatriculations du Guichet unique.

Règle de filtrage (non négociable, CDC §3) :
  Seules les immatriculations qui satisfont SIMULTANÉMENT les quatre critères
  suivants sont incluses :
    1. type_acte = 'IMMATRICULATION'        — hors modification, cession, radiation…
    2. statut    = 'VALIDE'                 — hors brouillons, en instance, rejetés
    3. validated_at dans (annee, mois)      — date de validation greffier, pas de création
    4. created_by.role.code = 'AGENT_GU'   — hors GREFFIER et AGENT_TRIBUNAL

Données figées dans contenu_json après passage au statut FINALISE.
Non modifiable après finalisation.
"""
from django.db import models
from apps.utilisateurs.models import Utilisateur


class ReleveGuichetUnique(models.Model):
    STATUT_CHOICES = [
        ('BROUILLON', 'Brouillon'),
        ('FINALISE',  'Finalisé'),
    ]

    annee        = models.IntegerField(verbose_name='Année')
    mois         = models.IntegerField(verbose_name='Mois')   # 1-12

    statut       = models.CharField(
        max_length=20, choices=STATUT_CHOICES, default='BROUILLON', db_index=True,
    )

    # ── Statistiques figées au moment de la génération ────────────────────────
    nb_ph    = models.IntegerField(default=0, verbose_name='Immatriculations PH')
    nb_pm    = models.IntegerField(default=0, verbose_name='Immatriculations PM')
    nb_sc    = models.IntegerField(default=0, verbose_name='Immatriculations SC')
    nb_total = models.IntegerField(default=0, verbose_name='Total immatriculations')

    # ── Données détaillées figées ─────────────────────────────────────────────
    # Structure : {"ph": [...], "pm": [...], "sc": [...], "nb_ph": int, ...}
    # Chaque entrée : {rc_id, annee_chrono, numero_chrono, numero_ra,
    #                  type_entite, denomination, denomination_ar,
    #                  forme_juridique, date_immatriculation, validated_at}
    contenu_json = models.JSONField(default=dict, verbose_name='Contenu figé (JSON)')

    # ── Traçabilité ───────────────────────────────────────────────────────────
    genere_le    = models.DateTimeField(auto_now_add=True)
    genere_par   = models.ForeignKey(
        Utilisateur, null=True, on_delete=models.SET_NULL,
        related_name='releves_gu_generes',
    )
    finalise_le  = models.DateTimeField(null=True, blank=True)
    finalise_par = models.ForeignKey(
        Utilisateur, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='releves_gu_finalises',
    )

    class Meta:
        db_table            = 'releves_guichet_unique'
        unique_together     = [('annee', 'mois')]
        ordering            = ['-annee', '-mois']
        verbose_name        = 'Relevé mensuel Guichet unique'
        verbose_name_plural = 'Relevés mensuels Guichet unique'

    def __str__(self):
        return f'Relevé GU {self.annee}/{str(self.mois).zfill(2)} — {self.statut}'
