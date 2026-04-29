import json as _json
from django.utils import timezone
from django.db import transaction
from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from .models import RegistreAnalytique, RegistreChronologique, ActionHistorique, Declarant
from .serializers import (
    RegistreAnalytiqueListSerializer, RegistreAnalytiqueDetailSerializer,
    RegistreChronologiqueSerializer, RegistreChronologiqueDetailSerializer,
    ActionHistoriqueSerializer, DeclarantSerializer,
)
from apps.core.permissions import (
    EstAgentOuGreffier, EstAgentTribunalOuGreffier, EstGreffier,
    est_greffier, est_agent_gu, filtrer_par_auteur, get_authorized_ra_ids,
)


# ── Numérotation ─────────────────────────────────────────────────────────────

def _next_numero_chrono():
    """
    Génère le prochain numéro d'enregistrement chronologique.

    Règle RCCM (non négociable) : numérotation ANNUELLE.
    Le compteur est remis à 1 au 1er janvier de chaque nouvelle année.
    L'identifiant juridique d'un acte est le COUPLE (annee_chrono, numero_chrono).

    Format du numéro séquentiel : 4 chiffres minimum (0001, 0002 … 9999, 10000 …)

    Retourne : tuple (numero_str, annee_int)
    """
    from django.db import connection
    annee = timezone.now().year
    with connection.cursor() as c:
        c.execute("""
            INSERT INTO sequences_numerotation (code, prefixe, annee, dernier_num, nb_chiffres)
            VALUES ('CHRONO', '', %s, 1, 4)
            ON CONFLICT (code) DO UPDATE
            SET dernier_num = CASE
                    -- Nouvelle année → reset à 1 (règle RCCM annuelle)
                    WHEN sequences_numerotation.annee != EXCLUDED.annee THEN 1
                    ELSE sequences_numerotation.dernier_num + 1
                END,
                annee      = EXCLUDED.annee,
                updated_at = NOW()
            RETURNING annee, dernier_num
        """, [annee])
        row = c.fetchone()
    return str(row[1]).zfill(4), int(row[0])


def _next_numero_ra(type_entite):
    """
    Génère le prochain numéro analytique selon la règle de parité RCCM (non négociable) :
      • Personne physique  (PH) → PAIR   (2, 4, 6, 8 …)   séquence RA_PP
      • Personne morale    (PM) → IMPAIR (1, 3, 5, 7 …)   séquence RA_PM
      • Succursale         (SC) → IMPAIR (1, 3, 5, 7 …)   séquence RA_PM

    La numérotation est continue, non liée à l'année, jamais réinitialisée.
    Format zéro-padé sur 6 chiffres : 000002, 000004 … / 000001, 000003 …

    Paramètre :
      type_entite — valeur du champ RegistreAnalytique.type_entite ('PH', 'PM' ou 'SC')

    Lève ValueError si la parité produite est incorrecte (verrou bloquant).
    """
    if type_entite == 'PH':
        code     = 'RA_PP'
        init_val = 2    # premier numéro pair
        step     = 2
    elif type_entite in ('PM', 'SC'):
        code     = 'RA_PM'
        init_val = 1    # premier numéro impair
        step     = 2
    else:
        raise ValueError(
            f"RCCM — type_entite inconnu : {type_entite!r}. Attendu : PH, PM ou SC."
        )

    from django.db import connection
    with connection.cursor() as c:
        c.execute("""
            INSERT INTO sequences_numerotation (code, prefixe, annee, dernier_num, nb_chiffres)
            VALUES (%s, '', 0, %s, 6)
            ON CONFLICT (code) DO UPDATE
            SET dernier_num = CASE
                    -- Si le compteur a été remis à 0 manuellement, repartir de init_val
                    WHEN sequences_numerotation.dernier_num = 0 THEN EXCLUDED.dernier_num
                    ELSE sequences_numerotation.dernier_num + %s
                END,
                prefixe    = '',
                updated_at = NOW()
            RETURNING dernier_num, nb_chiffres
        """, [code, init_val, step])
        row = c.fetchone()

    generated   = int(row[0])
    nb_chiffres = int(row[1])

    # ── Verrou de parité — bloquant (règle RCCM) ──────────────────────────────
    if type_entite == 'PH' and generated % 2 != 0:
        raise ValueError(
            f"RCCM — Violation règle de parité : le N° analytique PP doit être PAIR. "
            f"Séquence {code!r} a produit {generated} (IMPAIR). "
            f"Corriger le compteur via PUT /parametrage/numerotation/{code}/."
        )
    if type_entite in ('PM', 'SC') and generated % 2 == 0:
        raise ValueError(
            f"RCCM — Violation règle de parité : le N° analytique PM/SC doit être IMPAIR. "
            f"Séquence {code!r} a produit {generated} (PAIR). "
            f"Corriger le compteur via PUT /parametrage/numerotation/{code}/."
        )

    return str(generated).zfill(nb_chiffres)


# ── Registre Analytique ───────────────────────────────────────────────────────

class RegistreAnalytiqueFilter(django_filters.FilterSet):
    """Filtre étendu : type_entite, statut, localite, statut_be + forme_juridique (code)."""
    type_entite      = django_filters.CharFilter()
    statut           = django_filters.CharFilter()
    localite         = django_filters.NumberFilter()
    statut_be        = django_filters.CharFilter()
    # Filtre par code de forme juridique (ex: SARL, SA, GIE, PH…)
    # Recherche sur PersonneMorale.forme_juridique.code (case-insensitive)
    forme_juridique  = django_filters.CharFilter(
        field_name='pm__forme_juridique__code',
        lookup_expr='iexact',
        label='Forme juridique (code)',
    )

    class Meta:
        model  = RegistreAnalytique
        fields = ['type_entite', 'statut', 'localite', 'statut_be', 'forme_juridique']


class RegistreAnalytiqueListCreate(generics.ListAPIView):
    """
    Liste uniquement — la création directe est INTERDITE.
    Tout dossier RA doit être créé via l'enregistrement initial (RC → RA).
    Endpoint : POST /registres/enregistrement-initial/

    Règles d'accès (CDC §3) :
      • AGENT_GU      : accès interdit (le GU n'a pas accès au registre analytique)
      • AGENT_TRIBUNAL : uniquement ses propres dossiers (created_by)
      • GREFFIER      : tous les dossiers
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class  = RegistreAnalytiqueFilter
    search_fields    = ['numero_ra', 'numero_rc', 'ph__nom', 'pm__denomination', 'sc__denomination']
    ordering_fields  = ['created_at', 'numero_ra']
    ordering         = ['-created_at']
    serializer_class = RegistreAnalytiqueListSerializer

    def get_queryset(self):
        qs = (RegistreAnalytique.objects
              .select_related('ph', 'pm', 'pm__forme_juridique', 'sc', 'localite', 'created_by')
              .prefetch_related('chronos')
              .all())
        if est_greffier(self.request.user):
            return qs
        # Pour les agents : dossiers propres + dossiers autorisés par le greffier
        # (DemandeAutorisation CORRECTION ou IMPRESSION non expirée).
        from django.db.models import Q
        authorized_ids = get_authorized_ra_ids(self.request.user)
        if authorized_ids:
            return qs.filter(
                Q(created_by=self.request.user) | Q(pk__in=authorized_ids)
            )
        return qs.filter(created_by=self.request.user)


class RegistreAnalytiqueDetail(generics.RetrieveUpdateAPIView):
    # CDC : lecture accessible aux agents + greffier ; écriture réservée au greffier.
    queryset = RegistreAnalytique.objects.prefetch_related(
        'associes__ph', 'associes__pm', 'associes__nationalite',
        'gerants__ph', 'gerants__pm', 'gerants__fonction', 'gerants__nationalite',
        'administrateurs__nationalite',   # SA : conseil d'administration
        'commissaires__nationalite',      # SA : commissaires aux comptes
        'domaines__domaine',
        'historique__created_by',
        'documents__type_doc',
        'chronos__created_by',
        'modifications__created_by',
        'cessions__created_by',
        'radiations__created_by',
        'cessions_fonds__created_by',
    ).select_related('ph', 'pm', 'sc', 'localite', 'ph__nationalite',
                     'pm__forme_juridique', 'sc__pm_mere').all()
    serializer_class = RegistreAnalytiqueDetailSerializer

    def get_permissions(self):
        """Lecture (GET) : agents + greffier. Écriture (PATCH/PUT) : greffier uniquement."""
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [EstAgentTribunalOuGreffier()]
        return [EstGreffier()]

    def get_object(self):
        """
        Cloisonnement renforcé (CDC §3) :
        ─ Greffier     : accès illimité à tous les dossiers.
        ─ Agent        : accès uniquement aux dossiers qu'il a créés (created_by = user).
                         Exception : si une autorisation valide (IMPRESSION non expirée
                         ou CORRECTION) a été accordée par le greffier pour ce dossier
                         précis, l'accès en lecture est autorisé.
        Toute tentative d'accès sans droit retourne HTTP 403 bilingue FR / AR.
        """
        obj  = super().get_object()   # récupère via queryset complet + check_object_permissions
        user = self.request.user

        # ── Greffier : accès total ────────────────────────────────────────────
        if est_greffier(user):
            return obj

        # ── Propriétaire direct ───────────────────────────────────────────────
        if obj.created_by_id == user.pk:
            return obj

        # ── Autorisation greffier valide pour ce dossier ──────────────────────
        # Type IMPRESSION : valide tant que date_expiration n'est pas dépassée.
        # Type CORRECTION : pas d'expiration — le dossier est retourné à l'agent.
        from apps.autorisations.models import DemandeAutorisation
        from django.utils import timezone as _tz
        from django.db.models import Q
        now = _tz.now()
        if DemandeAutorisation.objects.filter(
            demandeur=user,
            type_dossier='RA',
            dossier_id=obj.pk,
            statut='AUTORISEE',
        ).filter(
            Q(type_demande='CORRECTION') |
            Q(type_demande='IMPRESSION', date_expiration__gt=now)
        ).exists():
            return obj

        # ── Accès refusé ──────────────────────────────────────────────────────
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied({
            'detail':    "Accès non autorisé. Ce dossier ne vous appartient pas. "
                         "Soumettez une demande d'autorisation au greffier.",
            'detail_ar': 'الوصول غير مصرح به. هذا الملف لا يخصك. '
                         'يرجى تقديم طلب إذن إلى كاتب الضبط.',
        })


# ── Workflow : Envoyer au greffier ────────────────────────────────────────────

class EnvoyerRAView(APIView):
    """
    Agent (ou greffier) → envoie le dossier au greffier pour validation.
    Transitions autorisées : BROUILLON → EN_INSTANCE_VALIDATION
                              RETOURNE  → EN_INSTANCE_VALIDATION
    CDC §3 : tout le personnel (AGENT_GU, AGENT_TRIBUNAL, GREFFIER).
    """
    permission_classes = [EstAgentOuGreffier]

    def patch(self, request, pk):
        ra = generics.get_object_or_404(RegistreAnalytique, pk=pk)
        if ra.statut not in ('BROUILLON', 'RETOURNE', 'EN_COURS'):
            return Response(
                {'detail': f'Impossible d\'envoyer depuis l\'état « {ra.statut} ».'},
                status=400,
            )
        ra.statut = 'EN_INSTANCE_VALIDATION'
        ra.save(update_fields=['statut', 'updated_at'])
        ActionHistorique.objects.create(
            ra=ra, action='ENVOI', created_by=request.user,
            commentaire=request.data.get('commentaire', ''),
        )
        return Response({'message': 'Dossier envoyé au greffier.', 'statut': ra.statut})


# ── Workflow : Retourner à l'agent ────────────────────────────────────────────

class RetournerRAView(APIView):
    """
    Greffier → renvoie le dossier à l'agent pour correction.
    Transition : EN_INSTANCE_VALIDATION → RETOURNE
    CDC §3.3 : réservé au greffier.
    """
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        ra = generics.get_object_or_404(RegistreAnalytique, pk=pk)
        if ra.statut != 'EN_INSTANCE_VALIDATION':
            return Response(
                {'detail': f'Impossible de retourner depuis l\'état « {ra.statut} ».'},
                status=400,
            )
        observations = (request.data.get('observations_greffier') or '').strip()
        if not observations:
            return Response(
                {'detail': 'Les observations du greffier sont obligatoires pour retourner un dossier.'},
                status=400,
            )
        ra.statut = 'RETOURNE'
        ra.observations_greffier = observations
        ra.save(update_fields=['statut', 'observations_greffier', 'updated_at'])
        ActionHistorique.objects.create(
            ra=ra, action='RETOUR', created_by=request.user,
            commentaire=observations,
        )

        # ── Synchronisation RC ────────────────────────────────────────────────
        # TOUS les RC liés (quel que soit leur statut, sauf REJETE/ANNULE)
        # repassent à RETOURNE pour que l'agent puisse les voir et les corriger.
        #
        # Cas courant : le RC est VALIDE (validé par le greffier avant que
        # celui-ci retourne le RA). Sans cette inclusion, le filtre revenait
        # à 0 résultat et le dossier restait invisible pour l'agent.
        STATUTS_RETOURNABLES = ('BROUILLON', 'EN_INSTANCE', 'VALIDE', 'RETOURNE')
        rc_a_retourner = list(
            RegistreChronologique.objects.filter(ra=ra, statut__in=STATUTS_RETOURNABLES)
        )
        for rc in rc_a_retourner:
            obs_rc          = (rc.observations + '\n' + observations).strip() if rc.observations else observations
            rc.statut       = 'RETOURNE'
            rc.observations = obs_rc
            rc.save(update_fields=['statut', 'observations', 'updated_at'])

        return Response({
            'message':      'Dossier retourné à l\'agent.',
            'statut':       ra.statut,
            'rc_retournes': len(rc_a_retourner),
        })


# ── Workflow : Valider (Greffier) ─────────────────────────────────────────────

class ValiderRAView(APIView):
    """
    Greffier → valide et immatricule définitivement.
    Transition : EN_INSTANCE_VALIDATION (ou EN_COURS legacy) → IMMATRICULE
    CDC §3.3 : réservé au greffier.
    """
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        ra = generics.get_object_or_404(RegistreAnalytique, pk=pk)
        if ra.statut not in ('EN_INSTANCE_VALIDATION', 'EN_COURS'):
            return Response(
                {'detail': f'Ce dossier ne peut pas être validé dans son état « {ra.statut} ».'},
                status=400,
            )
        # Génération du numéro analytique — attribué uniquement à l'immatriculation.
        # La règle de parité RCCM est appliquée ici (PP → pair, PM/SC → impair).
        if not ra.numero_ra:
            try:
                ra.numero_ra = _next_numero_ra(ra.type_entite)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        ra.statut            = 'IMMATRICULE'
        ra.validated_at      = timezone.now()
        ra.validated_by      = request.user
        ra.date_immatriculation = ra.date_immatriculation or timezone.now().date()
        ra.save(update_fields=['numero_ra', 'statut', 'validated_at', 'validated_by', 'date_immatriculation'])

        # Valider aussi le RC chrono lié — quel que soit son statut courant.
        # Cas couverts :
        #   • EN_INSTANCE  : agent a envoyé le RC via EnvoyerRChronoView (flux standard)
        #   • BROUILLON    : agent a envoyé le RA directement via EnvoyerRAView sans
        #                    passer par EnvoyerRChronoView (flux alternatif légitime)
        #   • RETOURNE     : greffier avait retourné le RC, puis valide le RA sans attendre
        #                    la re-soumission (cas exceptionnel)
        # Sans cette correction, les RCs en BROUILLON restaient indéfiniment BROUILLON
        # après immatriculation, et n'apparaissaient jamais dans le filtre « Validé »
        # de l'agent — bug bloquant signalé le 2026-04-28.
        RegistreChronologique.objects.filter(
            ra=ra,
            type_acte='IMMATRICULATION',
            statut__in=('BROUILLON', 'EN_INSTANCE', 'RETOURNE'),
        ).update(statut='VALIDE', validated_at=timezone.now(), validated_by=request.user)

        ActionHistorique.objects.create(
            ra=ra, action='VALIDATION', created_by=request.user,
            commentaire=request.data.get('commentaire', ''),
        )
        return Response({'message': 'Dossier validé et immatriculé.', 'statut': ra.statut})


# ── Historique d'un RA ────────────────────────────────────────────────────────

class HistoriqueRAView(APIView):
    """Historique d'un RA — agents tribunal + greffier."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, pk):
        ra = generics.get_object_or_404(RegistreAnalytique, pk=pk)
        qs = ra.historique.select_related('created_by').all()
        return Response(ActionHistoriqueSerializer(qs, many=True).data)


# ── Journal d'audit global (toutes actions du greffier) ──────────────────────

class JournalAuditView(generics.ListAPIView):
    """
    Journal d'audit consultable avec filtres :
    date_debut, date_fin, action, ra_numero, greffier (recherche textuelle)
    Accès réservé au greffier (CDC §3.3 + §4).
    """
    permission_classes = [EstGreffier]
    serializer_class = ActionHistoriqueSerializer
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = ActionHistorique.objects.select_related('ra', 'created_by').all()
        p  = self.request.query_params

        date_debut = p.get('date_debut')
        date_fin   = p.get('date_fin')
        action     = p.get('action')
        ra_numero  = p.get('ra_numero', '').strip()
        greffier   = p.get('greffier', '').strip()

        if date_debut:
            qs = qs.filter(created_at__date__gte=date_debut)
        if date_fin:
            qs = qs.filter(created_at__date__lte=date_fin)
        if action:
            qs = qs.filter(action=action)
        if ra_numero:
            qs = qs.filter(ra__numero_ra__icontains=ra_numero)
        if greffier:
            from django.db.models import Q
            qs = qs.filter(
                Q(created_by__login__icontains=greffier) |
                Q(created_by__nom__icontains=greffier) |
                Q(created_by__prenom__icontains=greffier)
            )
        return qs.order_by('-created_at')


# ── Registre Chronologique ────────────────────────────────────────────────────

class RegistreChronologiqueListCreate(generics.ListCreateAPIView):
    """
    Liste / création des actes chronologiques.

    Le filtre `statut` utilise un CharFilter (et non un ChoiceFilter auto-généré)
    pour accepter toutes les valeurs, y compris BROUILLON et RETOURNE qui ont été
    ajoutés au modèle après la création initiale des données.

    Règles d'accès (CDC §3) :
      • AGENT_GU / AGENT_TRIBUNAL : uniquement leurs propres dossiers (created_by)
      • GREFFIER                  : tous les dossiers
    """
    permission_classes = [EstAgentOuGreffier]
    serializer_class = RegistreChronologiqueSerializer
    filter_backends  = [filters.SearchFilter, filters.OrderingFilter]
    search_fields    = ['numero_chrono', 'ra__numero_ra', 'ra__numero_rc']
    ordering         = ['-date_acte']

    def get_queryset(self):
        qs = RegistreChronologique.objects.select_related('ra').all()

        # ── Cloisonnement + autorisations ─────────────────────────────────────
        # Agents : dossiers propres (created_by) + dossiers dont le RA a été
        # autorisé par le greffier via DemandeAutorisation.
        if not est_greffier(self.request.user):
            from django.db.models import Q
            authorized_ra_ids = get_authorized_ra_ids(self.request.user)
            if authorized_ra_ids:
                qs = qs.filter(
                    Q(created_by=self.request.user) | Q(ra_id__in=authorized_ra_ids)
                )
            else:
                qs = qs.filter(created_by=self.request.user)

        p  = self.request.query_params

        # Filtre statut — accepte une valeur simple OU une liste séparée par virgule.
        # Exemple mono-valeur : ?statut=VALIDE
        # Exemple multi-valeur : ?statut=BROUILLON,RETOURNE  (bouton "À traiter")
        statut = p.get('statut', '').strip()
        if statut:
            statuts = [s.strip() for s in statut.split(',') if s.strip()]
            if len(statuts) > 1:
                qs = qs.filter(statut__in=statuts)
            else:
                qs = qs.filter(statut=statuts[0])

        # Filtre type_acte
        type_acte = p.get('type_acte', '').strip()
        if type_acte:
            qs = qs.filter(type_acte=type_acte)

        # Filtre RA
        ra = p.get('ra', '').strip()
        if ra:
            qs = qs.filter(ra_id=ra)

        # ── Filtre par plage de dates (date_acte) ─────────────────────────────
        # Utilisé pour l'affichage « dossiers du jour » par défaut dans le frontend.
        # Format attendu : YYYY-MM-DD (ISO 8601).
        date_debut = p.get('date_debut', '').strip()
        date_fin   = p.get('date_fin',   '').strip()
        if date_debut:
            qs = qs.filter(date_acte__date__gte=date_debut)
        if date_fin:
            qs = qs.filter(date_acte__date__lte=date_fin)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class RegistreChronologiqueDetail(generics.RetrieveUpdateAPIView):
    """
    Détail/mise à jour RC — agents + greffier.
    CDC §3 : cloisonnement par created_by — un agent ne voit que ses propres actes.
    Le greffier a accès à tous les actes.
    """
    permission_classes = [EstAgentOuGreffier]
    serializer_class = RegistreChronologiqueDetailSerializer

    def get_queryset(self):
        """Cloisonnement : agents ne voient que leurs propres actes chronologiques."""
        qs = RegistreChronologique.objects.select_related(
            'ra', 'ra__ph', 'ra__pm', 'ra__sc', 'ra__localite',
        ).prefetch_related(
            'documents__type_doc',
            'ra__gerants', 'ra__associes', 'ra__domaines',
        )
        return filtrer_par_auteur(qs, self.request.user)


class ValiderRChronoView(APIView):
    """
    Valide un acte du registre chronologique.

    Règle métier :
      RC (EN_INSTANCE) → VALIDE
      RA lié (BROUILLON | RETOURNE | EN_COURS) → EN_INSTANCE_VALIDATION  [automatique]

    Le select_related('ra') garantit qu'aucune requête lazy n'est émise sur rc.ra.
    CDC §3.3 : réservé au greffier.
    """
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        # Chargement avec select_related pour éviter la requête lazy sur rc.ra
        rc = (
            RegistreChronologique.objects
            .select_related('ra')
            .filter(pk=pk)
            .first()
        )
        if rc is None:
            return Response({'detail': 'Acte chronologique introuvable.'}, status=404)

        if rc.statut != 'EN_INSTANCE':
            return Response(
                {'detail': f'Impossible de valider depuis l\'état « {rc.statut} ».'},
                status=400,
            )

        # ── Valider le RC ─────────────────────────────────────────────────────
        rc.statut       = 'VALIDE'
        rc.validated_at = timezone.now()
        rc.validated_by = request.user
        rc.save(update_fields=['statut', 'validated_at', 'validated_by'])

        # ── Transition automatique RC → RA ────────────────────────────────────
        # Statuts RA autorisés pour la transition (inclut EN_COURS pour la
        # compatibilité avec les dossiers anciens)
        STATUTS_TRANSITABLES = ('BROUILLON', 'RETOURNE', 'EN_COURS')
        ra_transfere = False

        if rc.ra_id and rc.ra.statut in STATUTS_TRANSITABLES:
            rc.ra.statut = 'EN_INSTANCE_VALIDATION'
            rc.ra.save(update_fields=['statut', 'updated_at'])
            ActionHistorique.objects.create(
                ra=rc.ra,
                action='ENVOI',
                created_by=request.user,
                commentaire=(
                    f'Passage automatique en instance de validation '
                    f'suite à la validation du RC {rc.numero_chrono}.'
                ),
            )
            ra_transfere = True

        return Response({
            'message':      'Acte chronologique validé.',
            'statut':       rc.statut,
            'ra_id':        rc.ra_id,
            'ra_statut':    rc.ra.statut if rc.ra_id else None,
            'ra_transfere': ra_transfere,
        })


# ── Workflow RC : Envoyer au greffier ─────────────────────────────────────────

class EnvoyerRChronoView(APIView):
    """
    Agent → envoie l'acte chronologique au greffier pour validation.
    Transitions autorisées : BROUILLON → EN_INSTANCE
                             RETOURNE  → EN_INSTANCE
    CDC §3 : agents + greffier.
    """
    permission_classes = [EstAgentOuGreffier]

    def patch(self, request, pk):
        rc = generics.get_object_or_404(
            RegistreChronologique.objects.select_related('ra'), pk=pk
        )
        if rc.statut not in ('BROUILLON', 'RETOURNE'):
            return Response(
                {'detail': f"Impossible d'envoyer depuis l'état « {rc.statut} »."},
                status=400,
            )
        rc.statut = 'EN_INSTANCE'
        rc.save(update_fields=['statut', 'updated_at'])

        # Transition automatique du RA associé : BROUILLON/RETOURNE/EN_COURS → EN_INSTANCE_VALIDATION
        # Cela garantit que le dossier apparaît immédiatement dans l'onglet "À traiter" du RA.
        if rc.ra_id:
            ra = rc.ra
            if ra.statut in ('BROUILLON', 'RETOURNE', 'EN_COURS'):
                ra.statut = 'EN_INSTANCE_VALIDATION'
                ra.save(update_fields=['statut', 'updated_at'])
                ActionHistorique.objects.create(
                    ra=ra, action='ENVOI', created_by=request.user,
                    commentaire='Transmis au greffier via le registre chronologique.',
                )

        return Response({'message': 'Acte envoyé au greffier.', 'statut': rc.statut})


# ── Workflow RC : Retourner à l'agent ─────────────────────────────────────────

class RetournerRChronoView(APIView):
    """
    Greffier → retourne l'acte à l'agent pour correction.
    Transition : EN_INSTANCE → RETOURNE
    CDC §3.3 : réservé au greffier.
    """
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        rc = generics.get_object_or_404(RegistreChronologique, pk=pk)
        if rc.statut != 'EN_INSTANCE':
            return Response(
                {'detail': f"Impossible de retourner depuis l'état « {rc.statut} »."},
                status=400,
            )
        observations = (request.data.get('observations') or '').strip()
        if not observations:
            return Response(
                {'detail': 'Les observations sont obligatoires pour retourner un acte.'},
                status=400,
            )
        rc.statut = 'RETOURNE'
        rc.observations = (rc.observations + '\n' + observations).strip() if rc.observations else observations
        rc.save(update_fields=['statut', 'observations', 'updated_at'])

        # ── Réinitialiser le RA associé ──────────────────────────────────────
        # EN_INSTANCE_VALIDATION → RETOURNE : permet à EnvoyerRChronoView de
        # créer un ActionHistorique lors du ré-envoi et d'informer le greffier.
        if rc.ra_id:
            ra = rc.ra
            if ra.statut == 'EN_INSTANCE_VALIDATION':
                ra.statut = 'RETOURNE'
                ra.save(update_fields=['statut', 'updated_at'])
            ActionHistorique.objects.create(
                ra=ra,
                action='RETOUR',
                created_by=request.user,
                commentaire=observations,
            )

        return Response({'message': 'Acte retourné à l\'agent.', 'statut': rc.statut})


# ── Workflow RC : Rectifier (agent) ──────────────────────────────────────────

class RectifierRChronoView(APIView):
    """
    Agent → rectifie un acte RC en état BROUILLON ou RETOURNE.

    Le payload accepté est identique à celui de l'enregistrement initial :
    les deux opérations partagent la même structure de données. La vue met
    à jour simultanément :
      • le RC (date_acte, observations, description JSON)
      • le RA (localite, observations)
      • l'entité liée (PH / PM / SC)
      • les gérants / directeurs (remplacement complet)
      • les associés (remplacement complet)
      • les domaines (remplacement complet)
    CDC §7 : tout le personnel (agents GU + tribunal + greffier) peut rectifier
    un dossier BROUILLON/RETOURNÉ qu'il a créé.
    """
    permission_classes = [EstAgentOuGreffier]

    @transaction.atomic
    def patch(self, request, pk):
        from apps.entites.models import PersonnePhysique, PersonneMorale, Succursale
        from .models import Gerant, Associe, RADomaine

        rc = generics.get_object_or_404(RegistreChronologique, pk=pk)

        # Le greffier peut modifier un dossier EN_INSTANCE (avant validation finale).
        # Les agents sont limités à BROUILLON ou RETOURNE (avant transmission).
        if est_greffier(request.user):
            statuts_autorises = ('BROUILLON', 'RETOURNE', 'EN_INSTANCE')
        else:
            statuts_autorises = ('BROUILLON', 'RETOURNE')

        if rc.statut not in statuts_autorises:
            if est_greffier(request.user):
                detail = (
                    'La modification n\'est autorisée que sur un dossier en état '
                    'Brouillon, Retourné ou En instance.'
                )
            else:
                detail = (
                    'La rectification n\'est autorisée que sur un dossier en état '
                    'Brouillon ou Retourné.'
                )
            return Response({'detail': detail}, status=400)

        ra = rc.ra
        if not ra:
            return Response({'detail': 'Aucun RA associé à cet acte.'}, status=400)

        d = request.data

        # ── 1. Mise à jour du RC ───────────────────────────────────────────────
        rc_update_fields = ['updated_at']
        if 'date_acte' in d:
            rc.date_acte = d['date_acte'] or None
            rc_update_fields.append('date_acte')
        if 'observations' in d:
            rc.observations = d['observations']
            rc_update_fields.append('observations')

        # ── Déclarant (find-or-create) ────────────────────────────────────────
        declarant = _find_or_create_declarant(d.get('declarant_data'))
        if declarant is not None:
            rc.declarant = declarant
            rc_update_fields.append('declarant')
        elif 'declarant_data' in d:
            # Payload envoyé mais vide → effacer le déclarant précédent
            rc.declarant = None
            rc_update_fields.append('declarant')

        # Reconstruction du JSON de description (structure identique à l'enregistrement initial)
        identite_declarant_str = (
            declarant.identite_display if declarant
            else (rc.declarant.identite_display if rc.declarant else d.get('identite_declarant', ''))
        )
        extra = {
            'denomination_commerciale': d.get('denomination', ''),
            'activite':                 d.get('activite', ''),
            'origine_fonds':            d.get('origine_fonds', ''),
            'identite_declarant':       identite_declarant_str,
            'identite_representant':    d.get('identite_representant', ''),
            'objet_social':             d.get('objet_social', ''),
            'gerant_lui_meme':          d.get('gerant_lui_meme', False),
            'choix_be':                 d.get('choix_be', ''),
        }
        if ra.type_entite == 'SC' and d.get('maison_mere'):
            extra['maison_mere'] = d['maison_mere']
        rc.description = _json.dumps(extra, ensure_ascii=False)
        rc_update_fields.append('description')
        rc.save(update_fields=rc_update_fields)

        # ── 2. Mise à jour du RA ───────────────────────────────────────────────
        ra_update_fields = ['updated_at']
        if 'localite_id' in d:
            ra.localite_id = d['localite_id'] or None
            ra_update_fields.append('localite')
        if 'observations' in d:
            ra.observations = d.get('observations', '')
            ra_update_fields.append('observations')
        ra.save(update_fields=ra_update_fields)

        # ── 3. Mise à jour de l'entité ─────────────────────────────────────────
        if ra.type_entite == 'PH' and ra.ph:
            ph = ra.ph
            if 'nom'               in d: ph.nom                     = d['nom']
            if 'prenom'            in d: ph.prenom                  = d.get('prenom', '')
            if 'nationalite_id'    in d: ph.nationalite_id          = d['nationalite_id'] or None
            if 'date_naissance'    in d: ph.date_naissance          = d['date_naissance'] or None
            if 'lieu_naissance'    in d: ph.lieu_naissance          = d.get('lieu_naissance', '')
            if 'regime_matrimonial' in d: ph.situation_matrimoniale = d.get('regime_matrimonial', '')
            if 'adresse_siege'     in d: ph.adresse                 = d.get('adresse_siege', '')
            if 'contact'           in d: ph.telephone               = d.get('contact', '')
            if 'num_passeport'     in d: ph.num_passeport           = d.get('num_passeport', '')
            if d.get('nni'):             ph.nni                     = d['nni']
            ph.save()

        elif ra.type_entite == 'PM' and ra.pm:
            pm = ra.pm
            if 'denomination'       in d: pm.denomination       = d['denomination']
            if 'forme_juridique_id' in d: pm.forme_juridique_id = d['forme_juridique_id'] or None
            if 'date_depot_statuts' in d: pm.date_constitution  = d['date_depot_statuts'] or None
            if 'capital_social'     in d: pm.capital_social     = d['capital_social'] or None
            if 'devise_capital'     in d: pm.devise_capital     = (d['devise_capital'] or 'MRU').strip()
            if 'duree_societe'      in d: pm.duree_societe      = d['duree_societe'] or None
            if 'contact'            in d: pm.telephone          = d.get('contact', '')
            if 'email'              in d: pm.email              = d.get('email', '')
            if 'adresse_siege'      in d: pm.siege_social       = d.get('adresse_siege', '')
            pm.save()

        elif ra.type_entite == 'SC' and ra.sc:
            sc = ra.sc
            if 'denomination'  in d: sc.denomination = d['denomination']
            if 'contact'       in d: sc.telephone    = d.get('contact', '')
            if 'email'         in d: sc.email        = d.get('email', '')
            if 'adresse_siege' in d: sc.siege_social = d.get('adresse_siege', '')
            sc.save()
            # Mise à jour de la maison mère si elle existe déjà
            mm_data = d.get('maison_mere') or {}
            if mm_data and sc.pm_mere:
                pm_m = sc.pm_mere
                if 'denomination_sociale' in mm_data: pm_m.denomination       = mm_data['denomination_sociale']
                if 'forme_juridique_id'   in mm_data: pm_m.forme_juridique_id = mm_data['forme_juridique_id'] or None
                if 'capital_social'       in mm_data: pm_m.capital_social     = mm_data['capital_social'] or None
                if 'devise_capital'       in mm_data: pm_m.devise_capital     = (mm_data['devise_capital'] or 'MRU').strip()
                if 'date_depot_statuts'   in mm_data: pm_m.date_constitution  = mm_data['date_depot_statuts'] or None
                if 'siege_social'         in mm_data: pm_m.siege_social       = mm_data.get('siege_social', '')
                pm_m.save()

        # ── 4. Remplacement complet des gérants / directeurs ───────────────────
        if 'gerants' in d:
            Gerant.objects.filter(ra=ra).delete()
            for g in (d['gerants'] or []):
                Gerant.objects.create(
                    ra=ra,
                    nom_gerant=g.get('nom', ''),
                    nationalite_id=g.get('nationalite_id') or None,
                    fonction_id=g.get('fonction_id') or None,
                    date_debut=g.get('date_debut') or None,
                    pouvoirs=g.get('pouvoirs', ''),
                    actif=True,
                    donnees_ident={
                        'prenom':         g.get('prenom', ''),
                        'date_naissance': g.get('date_naissance') or None,
                        'lieu_naissance': g.get('lieu_naissance', ''),
                        'type_document':  g.get('type_document', ''),
                        'nni':            g.get('nni', ''),
                        'num_passeport':  g.get('num_passeport', ''),
                        'telephone':      g.get('telephone', ''),
                        'domicile':       g.get('domicile', ''),
                    },
                )

        # ── 5. Remplacement complet des associés ───────────────────────────────
        if 'associes' in d:
            Associe.objects.filter(ra=ra).delete()
            for a in (d['associes'] or []):
                Associe.objects.create(
                    ra=ra,
                    type_associe=a.get('type_associe', 'PH'),
                    nom_associe=a.get('nom', ''),
                    nationalite_id=a.get('nationalite_id') or None,
                    nombre_parts=a.get('nombre_parts', 0),
                    valeur_parts=a.get('valeur_parts', 0),
                    pourcentage=a.get('pourcentage') or None,
                    type_part=a.get('type_part', ''),
                    actif=True,
                    donnees_ident={
                        # Personne Physique
                        'prenom':              a.get('prenom', ''),
                        'date_naissance':      a.get('date_naissance') or None,
                        'lieu_naissance':      a.get('lieu_naissance', ''),
                        'nni':                 a.get('nni', ''),
                        'num_passeport':       a.get('num_passeport', ''),
                        # Personne Morale
                        'numero_rc':           a.get('numero_rc', ''),
                        'date_immatriculation': a.get('date_immatriculation') or None,
                    },
                )

        # ── 6. Remplacement complet des domaines ───────────────────────────────
        if 'domaines' in d:
            RADomaine.objects.filter(ra=ra).delete()
            for dom_id in (d['domaines'] or []):
                try:
                    RADomaine.objects.create(ra=ra, domaine_id=dom_id, principal=False)
                except Exception:
                    pass

        # ── 7. Remplacement complet des administrateurs SA ─────────────────────
        if 'administrateurs' in d:
            from .models import Administrateur as _Administrateur
            _Administrateur.objects.filter(ra=ra).delete()
            for _admin in (d['administrateurs'] or []):
                if not _admin.get('nom'):
                    continue
                _Administrateur.objects.create(
                    ra=ra,
                    nom=_admin.get('nom', ''),
                    prenom=_admin.get('prenom', ''),
                    nom_ar=_admin.get('nom_ar', ''),
                    prenom_ar=_admin.get('prenom_ar', ''),
                    nationalite_id=_admin.get('nationalite_id') or None,
                    date_naissance=_admin.get('date_naissance') or None,
                    lieu_naissance=_admin.get('lieu_naissance', ''),
                    nni=_admin.get('nni', ''),
                    num_passeport=_admin.get('num_passeport', ''),
                    adresse=_admin.get('adresse', ''),
                    telephone=_admin.get('telephone', ''),
                    email=_admin.get('email', ''),
                    fonction=_admin.get('fonction', ''),
                    date_debut=_admin.get('date_debut') or None,
                    date_fin=_admin.get('date_fin') or None,
                    actif=True,
                )

        # ── 8. Remplacement complet des commissaires aux comptes SA ────────────
        if 'commissaires' in d:
            from .models import CommissaireComptes as _CommissaireComptes
            _CommissaireComptes.objects.filter(ra=ra).delete()
            for _comm in (d['commissaires'] or []):
                if not _comm.get('nom'):
                    continue
                _CommissaireComptes.objects.create(
                    ra=ra,
                    type_commissaire=_comm.get('type_commissaire', 'PH'),
                    role=_comm.get('role', 'TITULAIRE'),
                    nom=_comm.get('nom', ''),
                    prenom=_comm.get('prenom', ''),
                    nom_ar=_comm.get('nom_ar', ''),
                    nationalite_id=_comm.get('nationalite_id') or None,
                    date_naissance=_comm.get('date_naissance') or None,
                    lieu_naissance=_comm.get('lieu_naissance', ''),
                    nni=_comm.get('nni', ''),
                    num_passeport=_comm.get('num_passeport', ''),
                    adresse=_comm.get('adresse', ''),
                    telephone=_comm.get('telephone', ''),
                    email=_comm.get('email', ''),
                    date_debut=_comm.get('date_debut') or None,
                    date_fin=_comm.get('date_fin') or None,
                    actif=True,
                )

        from .serializers import RegistreChronologiqueDetailSerializer
        return Response(RegistreChronologiqueDetailSerializer(rc).data)


# ── Helpers : contrôle doublons ───────────────────────────────────────────────

_STATUTS_ACTIFS = frozenset([
    'BROUILLON', 'EN_INSTANCE', 'EN_INSTANCE_VALIDATION', 'RETOURNE', 'IMMATRICULE',
])


def _check_doublon_ph(nni, nom, prenom, date_naissance, lieu_naissance):
    """
    Contrôle de doublon pour une Personne Physique.
    Retourne (blocking: bool, warnings: list[str], ra_existant: dict|None).
      • blocking=True  → doublon confirmé   (même NNI, immatriculation active)
      • blocking=False → doublon potentiel ou RAS
    """
    from apps.entites.models import PersonnePhysique

    # Étape 1 — NNI (bloquant) ────────────────────────────────────────────────
    if nni:
        ph_qs = PersonnePhysique.objects.filter(nni=nni)
        if ph_qs.exists():
            ph = ph_qs.first()
            ra_qs = RegistreAnalytique.objects.filter(
                ph=ph, statut__in=_STATUTS_ACTIFS,
            ).order_by('-created_at')
            if ra_qs.exists():
                ra = ra_qs.first()
                return True, [], {
                    'id':       ra.id,
                    'numero_ra': ra.numero_ra,
                    'statut':   ra.statut,
                    'nom':      ph.nom,
                    'prenom':   ph.prenom,
                    'nni':      ph.nni,
                }

    # Étape 2 — État civil, nom+prénom (non bloquant) ─────────────────────────
    warnings = []
    if nom and prenom:
        from django.db.models import Q
        qs = PersonnePhysique.objects.filter(
            Q(nom__iexact=nom) & Q(prenom__iexact=prenom)
        )
        if date_naissance:
            qs = qs.filter(date_naissance=date_naissance)
        if qs.exists():
            ph = qs.first()
            if RegistreAnalytique.objects.filter(ph=ph, statut__in=_STATUTS_ACTIFS).exists():
                msg = f"Une personne nommée « {nom} {prenom} »"
                if date_naissance:
                    msg += f" née le {date_naissance}"
                if lieu_naissance:
                    msg += f" à {lieu_naissance}"
                msg += " est déjà enregistrée dans le RCCM (doublon potentiel)."
                warnings.append(msg)

    return False, warnings, None


def _check_doublon_pm(denomination, numero_rc=None):
    """
    Contrôle de doublon pour une Personne Morale ou Succursale.
    Retourne (blocking: bool, warnings: list[str], ra_existant: dict|None).
    """
    from apps.entites.models import PersonneMorale

    # Étape 1 — Numéro RCCM (bloquant) ───────────────────────────────────────
    if numero_rc:
        rc_qs = RegistreChronologique.objects.filter(
            numero_chrono=numero_rc,
        ).select_related('ra').order_by('-created_at')
        if rc_qs.exists():
            rc = rc_qs.first()
            ra_info = None
            if rc.ra_id:
                ra = rc.ra
                ra_info = {
                    'id':        ra.id,
                    'numero_ra': ra.numero_ra,
                    'numero_rc': rc.numero_chrono,
                    'statut':    ra.statut,
                }
            return True, [], ra_info

    # Étape 2 — Dénomination sociale (non bloquant) ───────────────────────────
    warnings = []
    if denomination:
        pm_qs = PersonneMorale.objects.filter(denomination__iexact=denomination)
        if pm_qs.exists():
            pm = pm_qs.first()
            ra_qs = RegistreAnalytique.objects.filter(
                pm=pm, statut__in=_STATUTS_ACTIFS,
            )
            if ra_qs.exists():
                warnings.append(
                    f"Une personne morale portant la dénomination « {denomination} » "
                    f"est déjà enregistrée dans le RCCM (doublon potentiel)."
                )

    return False, warnings, None


# ── Gestion des Déclarants ────────────────────────────────────────────────────

def _find_or_create_declarant(declarant_data):
    """
    Recherche un déclarant existant (par NNI si disponible, sinon par nom+prénom+date_naissance).
    Met à jour ses informations si nécessaire et retourne l'instance.
    Retourne None si aucune donnée significative n'est fournie.
    """
    if not declarant_data:
        return None
    nom   = (declarant_data.get('nom') or '').strip()
    prenom = (declarant_data.get('prenom') or '').strip()
    if not nom:
        return None

    nni          = (declarant_data.get('nni') or '').strip()
    num_passeport = (declarant_data.get('num_passeport') or '').strip()
    date_naiss   = declarant_data.get('date_naissance') or None
    lieu_naiss   = (declarant_data.get('lieu_naissance') or '').strip()
    nat_id       = declarant_data.get('nationalite_id') or None

    declarant = None

    # Recherche d'abord par NNI (identifiant unique fort)
    if nni:
        declarant = Declarant.objects.filter(nni=nni).first()

    # Sinon par nom + prénom + date de naissance
    if declarant is None and nom and date_naiss:
        declarant = Declarant.objects.filter(
            nom__iexact=nom,
            prenom__iexact=prenom,
            date_naissance=date_naiss,
        ).first()

    if declarant:
        # Mise à jour des champs si de nouvelles informations sont disponibles
        changed = False
        if nni and not declarant.nni:
            declarant.nni = nni; changed = True
        if num_passeport and not declarant.num_passeport:
            declarant.num_passeport = num_passeport; changed = True
        if date_naiss and not declarant.date_naissance:
            declarant.date_naissance = date_naiss; changed = True
        if lieu_naiss and not declarant.lieu_naissance:
            declarant.lieu_naissance = lieu_naiss; changed = True
        if nat_id and not declarant.nationalite_id:
            declarant.nationalite_id = nat_id; changed = True
        if changed:
            declarant.save()
    else:
        declarant = Declarant.objects.create(
            nom=nom,
            prenom=prenom,
            nni=nni,
            num_passeport=num_passeport,
            date_naissance=date_naiss or None,
            lieu_naissance=lieu_naiss,
            nationalite_id=nat_id,
        )
    return declarant


class DeclarantSearchView(APIView):
    """
    GET /api/registres/declarants/?q=<texte>&field=nom|nni
    Recherche de déclarants existants pour l'auto-complétion.
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request):
        q     = (request.query_params.get('q') or '').strip()
        field = (request.query_params.get('field') or 'nom').lower()
        if not q or len(q) < 2:
            return Response([])

        if field == 'nni':
            qs = Declarant.objects.filter(nni__icontains=q)
        else:
            from django.db.models import Q
            qs = Declarant.objects.filter(
                Q(nom__icontains=q) | Q(prenom__icontains=q)
            )

        qs = qs.select_related('nationalite').order_by('nom', 'prenom')[:20]
        return Response(DeclarantSerializer(qs, many=True).data)


# ── Enregistrement Initial Complet ────────────────────────────────────────────

class EnregistrementInitialView(APIView):
    """
    Étape 1 du workflow : enregistrement initial.
    Crée simultanément :
      • l'entité (PH / PM / SC)
      • le Registre Analytique (statut BROUILLON)
      • les gérants, associés, domaines
      • le Registre Chronologique (statut BROUILLON)
    Numérotation RA : impaire continue (1, 3, 5…)
    Numérotation RC : annuelle reset (RC2025000001, RC2025000002…)
    CDC §3 : tout le personnel peut créer un enregistrement initial.
    """
    permission_classes = [EstAgentOuGreffier]

    @transaction.atomic
    def post(self, request):
        from apps.entites.models import PersonnePhysique, PersonneMorale, Succursale
        from apps.demandes.views import _next_numero
        from .models import Gerant, Associe, RADomaine

        d = request.data
        type_entite = d.get('type_entite')
        if type_entite not in ('PH', 'PM', 'SC'):
            return Response(
                {'detail': 'type_entite invalide (PH, PM ou SC)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Contrôle doublons (hors immatriculations historiques) ─────────────
        # est_historique=true → bypass total des contrôles
        # force=true          → bypass des avertissements (doublon potentiel)
        est_historique = str(d.get('est_historique', '')).lower() in ('true', '1', 'yes')
        force          = str(d.get('force', '')).lower()          in ('true', '1', 'yes')

        # ── Règles métier (bloquantes, avant toute écriture en base) ─────────
        import datetime as _dt

        def _calcul_age(dob_str):
            """Retourne l'âge en années ou None si la date est invalide."""
            try:
                dob   = _dt.date.fromisoformat(str(dob_str))
                today = _dt.date.today()
                return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            except Exception:
                return None

        # 1 — PH mineure
        if type_entite == 'PH' and d.get('date_naissance'):
            age = _calcul_age(d['date_naissance'])
            if age is not None and age < 18:
                return Response({
                    'detail': 'Une personne physique mineure (moins de 18 ans) ne peut pas être immatriculée au RCCM.',
                    'code':   'MINEUR_BLOQUE',
                    'age':    age,
                }, status=status.HTTP_400_BAD_REQUEST)

        # 2 — NNI : exactement 10 chiffres
        nni_raw = d.get('nni', '') or ''
        if nni_raw:
            import re as _re
            if not _re.fullmatch(r'[0-9]{10}', str(nni_raw).strip()):
                return Response({
                    'detail': 'Le NNI doit comporter exactement 10 chiffres (chiffres uniquement).',
                    'code':   'NNI_INVALIDE',
                }, status=status.HTTP_400_BAD_REQUEST)

        # 3 — Gérant mineur (validation avant toute création)
        for _g in (d.get('gerants') or []):
            _dob_g = _g.get('date_naissance')
            if _dob_g:
                _age_g = _calcul_age(_dob_g)
                if _age_g is not None and _age_g < 18:
                    return Response({
                        'detail': (
                            f"Le gérant « {_g.get('nom', '')} {_g.get('prenom', '')} » est mineur "
                            f"({_age_g} ans) et ne peut pas être désigné gérant."
                        ),
                        'code':   'GERANT_MINEUR',
                    }, status=status.HTTP_400_BAD_REQUEST)

        if not est_historique:
            if type_entite == 'PH':
                _blocking, _warnings, _ra_exist = _check_doublon_ph(
                    nni=d.get('nni') or None,
                    nom=d.get('nom', ''),
                    prenom=d.get('prenom', ''),
                    date_naissance=d.get('date_naissance') or None,
                    lieu_naissance=d.get('lieu_naissance', ''),
                )
            else:  # PM ou SC
                _blocking, _warnings, _ra_exist = _check_doublon_pm(
                    denomination=d.get('denomination', ''),
                    numero_rc=d.get('numero_rc') or None,
                )

            if _blocking:
                return Response({
                    'doublon':    True,
                    'type':       'DOUBLON_CONFIRME',
                    'motif':      (
                        'Un NNI identique est déjà immatriculé au RCCM.'
                        if type_entite == 'PH'
                        else 'Un numéro RCCM identique existe déjà dans le système.'
                    ),
                    'ra_existant': _ra_exist,
                }, status=status.HTTP_409_CONFLICT)

            if _warnings and not force:
                return Response({
                    'doublon_potentiel': True,
                    'type':              'DOUBLON_POTENTIEL',
                    'warnings':          _warnings,
                    'created':           False,
                }, status=status.HTTP_200_OK)

        # ── Créer l'entité ────────────────────────────────────────────────────
        if type_entite == 'PH':
            _nni = d.get('nni') or None
            _ph_fields = dict(
                nom=d.get('nom', ''),
                prenom=d.get('prenom', ''),
                nom_ar=d.get('nom_ar', ''),
                prenom_ar=d.get('prenom_ar', ''),
                num_passeport=d.get('num_passeport', ''),
                num_carte_identite=d.get('num_carte_identite', ''),
                nationalite_id=d.get('nationalite_id') or None,
                date_naissance=d.get('date_naissance') or None,
                lieu_naissance=d.get('lieu_naissance', ''),
                sexe=d.get('sexe', ''),
                situation_matrimoniale=d.get('regime_matrimonial', ''),
                adresse=d.get('adresse_siege', ''),
                telephone=d.get('contact', ''),
                profession=d.get('activite', ''),
                nom_pere=d.get('nom_pere', ''),
                nom_mere=d.get('nom_mere', ''),
            )
            if _nni:
                # Réutilise la fiche existante si le NNI est déjà connu
                entite, _ = PersonnePhysique.objects.update_or_create(
                    nni=_nni,
                    defaults=_ph_fields,
                )
            else:
                entite = PersonnePhysique.objects.create(
                    **_ph_fields,
                    nni=None,
                    created_by=request.user,
                )
            ra_kwargs = {'ph': entite}

        elif type_entite == 'PM':
            # Sync dénomination bilingue — déclaration juridique libre, mixte AR/FR autorisé
            _denom_pm    = d.get('denomination', '') or ''
            _denom_ar_pm = d.get('denomination_ar', '') or ''
            if _denom_pm and not _denom_ar_pm:
                _denom_ar_pm = _denom_pm
            elif _denom_ar_pm and not _denom_pm:
                _denom_pm = _denom_ar_pm
            entite = PersonneMorale.objects.create(
                denomination=_denom_pm,
                denomination_ar=_denom_ar_pm,
                forme_juridique_id=d.get('forme_juridique_id') or None,
                capital_social=d.get('capital_social') or None,
                devise_capital=(d.get('devise_capital') or 'MRU').strip(),
                duree_societe=d.get('duree_societe') or None,
                date_constitution=d.get('date_depot_statuts') or None,
                siege_social=d.get('adresse_siege', ''),
                telephone=d.get('contact', ''),
                email=d.get('email', ''),
                created_by=request.user,
            )
            ra_kwargs = {'pm': entite}

        else:  # SC
            mm = d.get('maison_mere', {})
            pm_mere = None
            if mm.get('denomination_sociale'):
                pm_mere = PersonneMorale.objects.create(
                    denomination=mm.get('denomination_sociale', ''),
                    forme_juridique_id=mm.get('forme_juridique_id') or None,
                    capital_social=mm.get('capital_social') or None,
                    devise_capital=(mm.get('devise_capital') or 'MRU').strip(),
                    date_constitution=mm.get('date_depot_statuts') or None,
                    siege_social=mm.get('siege_social', ''),
                    created_by=request.user,
                )
            # Sync dénomination bilingue — déclaration juridique libre, mixte AR/FR autorisé
            _denom_sc    = d.get('denomination', '') or ''
            _denom_ar_sc = d.get('denomination_ar', '') or ''
            if _denom_sc and not _denom_ar_sc:
                _denom_ar_sc = _denom_sc
            elif _denom_ar_sc and not _denom_sc:
                _denom_sc = _denom_ar_sc
            entite = Succursale.objects.create(
                denomination=_denom_sc,
                denomination_ar=_denom_ar_sc,
                pm_mere=pm_mere,
                siege_social=d.get('adresse_siege', ''),
                telephone=d.get('contact', ''),
                email=d.get('email', ''),
                created_by=request.user,
            )
            ra_kwargs = {'sc': entite}

        # ── Bénéficiaire effectif ─────────────────────────────────────────────
        # La déclaration BE ne s'applique qu'aux personnes morales (PM) et succursales (SC).
        # Pour les personnes physiques (PH), le statut reste NON_DECLARE et aucun délai n'est fixé.
        statut_be          = 'NON_DECLARE'
        date_decl_be       = None
        date_limite_be_val = None
        choix_be           = ''
        if type_entite != 'PH':
            choix_be = d.get('choix_be', '')   # 'immediat' | '15_jours' | ''
            if choix_be == 'immediat':
                statut_be    = 'DECLARE'
                date_decl_be = timezone.now()
            elif choix_be == '15_jours':
                statut_be = 'EN_ATTENTE'
                ref_date  = d.get('date_acte')
                if ref_date:
                    try:
                        from datetime import timedelta
                        # Accepte date-only ('2026-04-13') ET datetime ('2026-04-13T09:30:00')
                        date_limite_be_val = _dt.date.fromisoformat(str(ref_date)[:10]) + timedelta(days=15)
                    except Exception:
                        pass

        # ── Créer le RA (statut BROUILLON) ────────────────────────────────────
        # Le numéro analytique (numero_ra) n'est PAS attribué à ce stade.
        # Il sera généré lors de la validation / immatriculation par le greffier.
        ra = RegistreAnalytique.objects.create(
            numero_ra=None,
            type_entite=type_entite,
            statut='BROUILLON',
            localite_id=d.get('localite_id') or None,
            observations=d.get('observations', ''),
            created_by=request.user,
            statut_be=statut_be,
            date_declaration_be=date_decl_be,
            date_limite_be=date_limite_be_val,
            **ra_kwargs,
        )

        # ── Historique création ───────────────────────────────────────────────
        ActionHistorique.objects.create(
            ra=ra, action='CREATION', created_by=request.user,
            commentaire='Enregistrement initial',
        )

        # ── Domaines d'activité ───────────────────────────────────────────────
        for dom_id in (d.get('domaines') or []):
            try:
                RADomaine.objects.create(ra=ra, domaine_id=dom_id, principal=False)
            except Exception:
                pass

        # ── Gérants ───────────────────────────────────────────────────────────
        for g in (d.get('gerants') or []):
            Gerant.objects.create(
                ra=ra,
                nom_gerant=g.get('nom', ''),
                nationalite_id=g.get('nationalite_id') or None,
                fonction_id=g.get('fonction_id') or None,
                date_debut=g.get('date_debut') or None,
                pouvoirs=g.get('pouvoirs', ''),
                actif=True,
                donnees_ident={
                    'prenom':         g.get('prenom', ''),
                    'date_naissance': g.get('date_naissance') or None,
                    'lieu_naissance': g.get('lieu_naissance', ''),
                    'type_document':  g.get('type_document', ''),
                    'nni':            g.get('nni', ''),
                    'num_passeport':  g.get('num_passeport', ''),
                    'telephone':      g.get('telephone', ''),
                    'domicile':       g.get('domicile', ''),
                },
            )

        # ── Associés (PM) ─────────────────────────────────────────────────────
        for a in (d.get('associes') or []):
            Associe.objects.create(
                ra=ra,
                type_associe=a.get('type_associe', 'PH'),
                nom_associe=a.get('nom', ''),
                nationalite_id=a.get('nationalite_id') or None,
                nombre_parts=a.get('nombre_parts', 0),
                valeur_parts=a.get('valeur_parts', 0),
                pourcentage=a.get('pourcentage') or None,
                type_part=a.get('type_part', ''),
                actif=True,
                donnees_ident={
                    # Personne Physique
                    'prenom':              a.get('prenom', ''),
                    'date_naissance':      a.get('date_naissance') or None,
                    'lieu_naissance':      a.get('lieu_naissance', ''),
                    'nni':                 a.get('nni', ''),
                    'num_passeport':       a.get('num_passeport', ''),
                    # Personne Morale
                    'numero_rc':           a.get('numero_rc', ''),
                    'date_immatriculation': a.get('date_immatriculation') or None,
                },
            )

        # ── Administrateurs SA (Conseil d'administration) ─────────────────────
        for _admin in (d.get('administrateurs') or []):
            if not _admin.get('nom'):
                continue
            from .models import Administrateur as _Administrateur
            _Administrateur.objects.create(
                ra=ra,
                nom=_admin.get('nom', ''),
                prenom=_admin.get('prenom', ''),
                nom_ar=_admin.get('nom_ar', ''),
                prenom_ar=_admin.get('prenom_ar', ''),
                nationalite_id=_admin.get('nationalite_id') or None,
                date_naissance=_admin.get('date_naissance') or None,
                lieu_naissance=_admin.get('lieu_naissance', ''),
                nni=_admin.get('nni', ''),
                num_passeport=_admin.get('num_passeport', ''),
                adresse=_admin.get('adresse', ''),
                telephone=_admin.get('telephone', ''),
                email=_admin.get('email', ''),
                fonction=_admin.get('fonction', ''),
                date_debut=_admin.get('date_debut') or None,
                date_fin=_admin.get('date_fin') or None,
                actif=True,
            )

        # ── Commissaires aux comptes SA ────────────────────────────────────────
        for _comm in (d.get('commissaires') or []):
            if not _comm.get('nom'):
                continue
            from .models import CommissaireComptes as _CommissaireComptes
            _CommissaireComptes.objects.create(
                ra=ra,
                type_commissaire=_comm.get('type_commissaire', 'PH'),
                role=_comm.get('role', 'TITULAIRE'),
                nom=_comm.get('nom', ''),
                prenom=_comm.get('prenom', ''),
                nom_ar=_comm.get('nom_ar', ''),
                nationalite_id=_comm.get('nationalite_id') or None,
                date_naissance=_comm.get('date_naissance') or None,
                lieu_naissance=_comm.get('lieu_naissance', ''),
                nni=_comm.get('nni', ''),
                num_passeport=_comm.get('num_passeport', ''),
                adresse=_comm.get('adresse', ''),
                telephone=_comm.get('telephone', ''),
                email=_comm.get('email', ''),
                date_debut=_comm.get('date_debut') or None,
                date_fin=_comm.get('date_fin') or None,
                actif=True,
            )

        # ── Déclarant (find-or-create) ─────────────────────────────────────────
        declarant = _find_or_create_declarant(d.get('declarant_data'))

        # ── Données complémentaires dans description JSON ─────────────────────
        # identite_declarant : chaîne lisible pour les certificats (compatibilité)
        identite_declarant_str = declarant.identite_display if declarant else d.get('identite_declarant', '')
        extra = {
            'denomination_commerciale':  d.get('denomination', ''),
            'activite':                  d.get('activite', ''),
            'origine_fonds':             d.get('origine_fonds', ''),
            'identite_declarant':        identite_declarant_str,
            'identite_representant':     d.get('identite_representant', ''),  # SC : représentant local
            'objet_social':              d.get('objet_social', ''),
            'gerant_lui_meme':           d.get('gerant_lui_meme', False),
            'choix_be':                  choix_be,
        }
        if type_entite == 'SC' and d.get('maison_mere'):
            extra['maison_mere'] = d['maison_mere']

        # ── Créer le RC Chrono (statut BROUILLON — l'agent devra envoyer au greffier) ─
        # ── Langue de l'acte : persistée à la création, utilisée pour tous les PDF ──
        _langue = d.get('langue_acte', 'fr')
        if _langue not in ('fr', 'ar'):
            _langue = 'fr'

        # Numérotation chronologique annuelle : le tuple (annee_chrono, numero_chrono)
        # constitue l'identifiant juridique de l'acte (règle RCCM non négociable).
        _num_chrono, _annee_chrono = _next_numero_chrono()
        chrono = RegistreChronologique.objects.create(
            numero_chrono=_num_chrono,
            annee_chrono=_annee_chrono,
            ra=ra,
            declarant=declarant,
            type_acte='IMMATRICULATION',
            date_acte=d.get('date_acte'),
            description=_json.dumps(extra, ensure_ascii=False),
            observations=d.get('observations', ''),
            statut='BROUILLON',
            langue_acte=_langue,
            created_by=request.user,
        )

        return Response(RegistreChronologiqueSerializer(chrono).data, status=status.HTTP_201_CREATED)


# ── Déclaration BE sur un RA existant ─────────────────────────────────────────

class DeclarerBEView(APIView):
    """
    PATCH /registres/analytique/<pk>/declarer-be/
    Permet de déclarer manuellement le bénéficiaire effectif d'un RA.
    Transitions autorisées : NON_DECLARE / EN_ATTENTE / EN_RETARD → DECLARE
    CDC §3.2 : agents tribunal + greffier.
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    def patch(self, request, pk):
        ra = generics.get_object_or_404(RegistreAnalytique, pk=pk)
        if ra.statut not in ('IMMATRICULE',):
            return Response(
                {'detail': 'La déclaration BE n\'est possible que sur un RA immatriculé.'},
                status=400,
            )
        if ra.statut_be == 'DECLARE':
            return Response(
                {'detail': 'Le bénéficiaire effectif est déjà déclaré.'},
                status=400,
            )
        ra.statut_be          = 'DECLARE'
        ra.date_declaration_be = timezone.now()
        ra.save(update_fields=['statut_be', 'date_declaration_be', 'updated_at'])
        ActionHistorique.objects.create(
            ra=ra, action='COMPLETION', created_by=request.user,
            commentaire='Déclaration du bénéficiaire effectif.',
        )
        return Response({
            'message':              'Bénéficiaire effectif déclaré.',
            'statut_be':            ra.statut_be,
            'date_declaration_be':  ra.date_declaration_be,
        })


# ── Vérification doublon en temps réel ───────────────────────────────────────

class CheckDoublonView(APIView):
    """
    GET /registres/check-doublon/
    Vérification légère et rapide des doublons pendant la saisie du formulaire.
    Accessible à tout le personnel pour les formulaires de saisie.
    Paramètres (query string) :
      - type_entite  : PH | PM | SC
      - nni          : NNI (PH uniquement)
      - nom          : nom de famille (PH)
      - prenom       : prénom (PH)
      - date_naissance : YYYY-MM-DD (PH, optionnel)
      - lieu_naissance : str (PH, optionnel)
      - denomination : dénomination sociale (PM/SC)
      - numero_rc    : numéro RCCM existant (PM/SC)
    Réponse :
      { type: "DOUBLON_CONFIRME"|"DOUBLON_POTENTIEL"|null,
        motif, ra_existant, warnings }
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request):
        p           = request.query_params
        type_entite = p.get('type_entite', '').upper()

        if type_entite == 'PH':
            blocking, warnings, ra_existant = _check_doublon_ph(
                nni=p.get('nni') or None,
                nom=p.get('nom', ''),
                prenom=p.get('prenom', ''),
                date_naissance=p.get('date_naissance') or None,
                lieu_naissance=p.get('lieu_naissance', ''),
            )
            motif = 'Un NNI identique est déjà immatriculé au RCCM.' if blocking else None

        elif type_entite in ('PM', 'SC'):
            blocking, warnings, ra_existant = _check_doublon_pm(
                denomination=p.get('denomination', ''),
                numero_rc=p.get('numero_rc') or None,
            )
            motif = 'Un numéro RCCM identique existe déjà dans le système.' if blocking else None

        else:
            return Response(
                {'detail': 'type_entite invalide (PH, PM ou SC)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result_type = 'DOUBLON_CONFIRME' if blocking else ('DOUBLON_POTENTIEL' if warnings else None)

        return Response({
            'type':        result_type,
            'doublon':     blocking,
            'motif':       motif,
            'ra_existant': ra_existant,
            'warnings':    warnings,
        })

