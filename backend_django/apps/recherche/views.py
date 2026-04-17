from datetime import date as _date
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from apps.registres.models import RegistreAnalytique
from apps.registres.serializers import RegistreAnalytiqueListSerializer
from apps.core.permissions import EstGreffier


def _fmt_chrono(val):
    """Normalise un numéro chronologique sur 4 chiffres minimum (CDC)."""
    if val is None:
        return None
    try:
        return str(int(str(val).strip())).zfill(4)
    except (ValueError, TypeError):
        return str(val)


# ── Vues existantes (inchangées) ──────────────────────────────────────────────

class RechercheGlobaleView(APIView):
    """Recherche globale — accès réservé au greffier (CDC §4.2)."""
    permission_classes = [EstGreffier]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response({'data': [], 'total': 0})

        qs = RegistreAnalytique.objects.select_related('ph', 'pm', 'sc', 'localite').filter(
            Q(numero_ra__icontains=q) |
            Q(numero_rc__icontains=q) |
            Q(ph__nom__icontains=q) |
            Q(ph__prenom__icontains=q) |
            Q(ph__nni__icontains=q) |
            Q(pm__denomination__icontains=q) |
            Q(pm__sigle__icontains=q) |
            Q(sc__denomination__icontains=q)
        ).distinct()[:50]

        ser = RegistreAnalytiqueListSerializer(qs, many=True)
        return Response({'data': ser.data, 'total': len(ser.data)})


class RechercheParNNIView(APIView):
    permission_classes = [EstGreffier]

    def get(self, request, nni):
        qs = RegistreAnalytique.objects.select_related('ph', 'localite').filter(ph__nni=nni)
        ser = RegistreAnalytiqueListSerializer(qs, many=True)
        return Response({'data': ser.data})


class RechercheParNumRCView(APIView):
    permission_classes = [EstGreffier]

    def get(self, request, numero_rc):
        qs = RegistreAnalytique.objects.select_related('ph', 'pm', 'sc', 'localite').filter(numero_rc=numero_rc)
        if not qs.exists():
            return Response({'detail': 'Aucun enregistrement trouvé.'}, status=404)
        ser = RegistreAnalytiqueListSerializer(qs.first())
        return Response({'data': ser.data})


class CertificatNegatifView(APIView):
    permission_classes = [EstGreffier]

    def get(self, request):
        denomination = request.query_params.get('denomination', '').strip()
        if not denomination:
            return Response({'detail': 'Dénomination requise.'}, status=400)

        existe = RegistreAnalytique.objects.filter(
            Q(pm__denomination__iexact=denomination) |
            Q(pm__sigle__iexact=denomination) |
            Q(sc__denomination__iexact=denomination)
        ).filter(statut='IMMATRICULE').exists()

        return Response({
            'denomination': denomination,
            'disponible':   not existe,
            'message':      'Dénomination disponible.' if not existe else 'Dénomination déjà utilisée.',
        })


# ── Recherche avancée multicritères ──────────────────────────────────────────

class RechercheAvanceeView(APIView):
    """Recherche avancée multicritères — accès réservé au greffier (CDC §4.2).

    GET /api/recherche/avancee/

    Paramètres (tous facultatifs, combinables) :
      q               – texte libre (N°, dénomination, NNI…)
      numero_ra       – N° analytique (icontains)
      numero_chrono   – N° chronologique (icontains)
      denomination    – dénomination / nom commercial (FR ou AR)
      nom_prenom      – nom + prénom personne physique (FR ou AR)
      nni             – NNI (icontains)
      num_passeport   – N° passeport (icontains)
      nationalite_id  – ID de la nationalité (exact)
      activite        – activité / domaine d'activité (icontains)
      adresse         – adresse du siège (icontains)
      gerant          – nom du gérant (icontains)
      associe         – nom de l'associé (icontains)
      date_immat_from – date immatriculation >= (YYYY-MM-DD)
      date_immat_to   – date immatriculation <= (YYYY-MM-DD)
      date_enreg_from – date acte RC >= (YYYY-MM-DD)
      date_enreg_to   – date acte RC <= (YYYY-MM-DD)
      type_entite     – PH | PM | SC
      statut_ra       – statut du RA
      statut_rc       – statut du RC
      registre        – 'ra' | 'rc' | 'both' (défaut : both)
      page            – numéro de page (défaut : 1)
      page_size       – taille de page (défaut : 20, max : 100)
    """

    permission_classes = [EstGreffier]
    PAGE_SIZE = 20

    _RA_LABELS = {
        'BROUILLON':              'Brouillon',
        'EN_INSTANCE_VALIDATION': 'En instance de validation',
        'RETOURNE':               'Retourné',
        'EN_COURS':               'En cours',
        'IMMATRICULE':            'Immatriculé',
        'RADIE':                  'Radié',
        'SUSPENDU':               'Suspendu',
        'ANNULE':                 'Annulé',
    }
    _RC_LABELS = {
        'EN_INSTANCE': 'En instance',
        'VALIDE':      'Validé',
        'REJETE':      'Rejeté',
        'ANNULE':      'Annulé',
    }

    # ── Point d'entrée ────────────────────────────────────────────────────────

    def get(self, request):
        p = request.query_params

        # Pagination
        try:
            page      = max(1, int(p.get('page', 1)))
            page_size = min(100, max(1, int(p.get('page_size', self.PAGE_SIZE))))
        except (ValueError, TypeError):
            page, page_size = 1, self.PAGE_SIZE

        registre = p.get('registre', 'both')

        # Queryset optimisé
        qs = RegistreAnalytique.objects.select_related(
            'ph', 'pm', 'sc', 'localite',
            'ph__nationalite',
        ).prefetch_related(
            'chronos',
            'gerants',
            'associes',
            'domaines__domaine',
        )

        # Construction du filtre dynamique
        f, has_criteria = self._build_filter(p, registre)

        # Vérifier qu'au moins un critère est saisi (évite de charger toute la base)
        if not has_criteria:
            return Response({
                'count':     0,
                'page':      page,
                'page_size': page_size,
                'results':   [],
                'message':   'Veuillez saisir au moins un critère de recherche.',
            })

        qs = qs.filter(f).distinct()

        # Pagination
        count  = qs.count()
        start  = (page - 1) * page_size
        ra_page = list(qs[start:start + page_size])

        # Sérialisation avec info RC liée
        numero_chrono_filter = p.get('numero_chrono', '').strip()
        results = [self._to_dict(ra, numero_chrono_filter) for ra in ra_page]

        return Response({
            'count':     count,
            'page':      page,
            'page_size': page_size,
            'results':   results,
        })

    # ── Construction du filtre ────────────────────────────────────────────────

    def _build_filter(self, p, registre):
        """
        Retourne (Q, has_criteria).
        has_criteria=True dès qu'au moins un paramètre de recherche réel est fourni.
        """
        f            = Q()
        has_criteria = False

        def _add(condition):
            nonlocal f, has_criteria
            f &= condition
            has_criteria = True

        # Recherche globale (texte libre)
        q_val = (p.get('q') or '').strip()
        if q_val:
            _add(
                Q(numero_ra__icontains=q_val)           |
                Q(numero_rc__icontains=q_val)           |
                Q(ph__nom__icontains=q_val)             |
                Q(ph__prenom__icontains=q_val)          |
                Q(ph__nom_ar__icontains=q_val)          |
                Q(ph__nni__icontains=q_val)             |
                Q(pm__denomination__icontains=q_val)    |
                Q(pm__denomination_ar__icontains=q_val) |
                Q(pm__sigle__icontains=q_val)           |
                Q(sc__denomination__icontains=q_val)    |
                Q(sc__denomination_ar__icontains=q_val) |
                Q(chronos__numero_chrono__icontains=q_val)
            )

        # N° analytique
        v = (p.get('numero_ra') or '').strip()
        if v:
            _add(Q(numero_ra__icontains=v))

        # N° chronologique — cherche aussi dans le champ numero_rc direct
        v = (p.get('numero_chrono') or '').strip()
        if v:
            _add(
                Q(numero_rc__icontains=v) |
                Q(chronos__numero_chrono__icontains=v)
            )

        # Dénomination / nom commercial (FR + AR, tous types d'entité)
        v = (p.get('denomination') or '').strip()
        if v:
            _add(
                Q(ph__nom__icontains=v)             |
                Q(ph__prenom__icontains=v)          |
                Q(ph__nom_ar__icontains=v)          |
                Q(ph__prenom_ar__icontains=v)       |
                Q(pm__denomination__icontains=v)    |
                Q(pm__denomination_ar__icontains=v) |
                Q(pm__sigle__icontains=v)           |
                Q(sc__denomination__icontains=v)    |
                Q(sc__denomination_ar__icontains=v)
            )

        # Nom / prénom (personne physique uniquement, FR + AR)
        v = (p.get('nom_prenom') or '').strip()
        if v:
            _add(
                Q(ph__nom__icontains=v)      |
                Q(ph__prenom__icontains=v)   |
                Q(ph__nom_ar__icontains=v)   |
                Q(ph__prenom_ar__icontains=v)
            )

        # NNI
        v = (p.get('nni') or '').strip()
        if v:
            _add(Q(ph__nni__icontains=v))

        # N° passeport
        v = (p.get('num_passeport') or '').strip()
        if v:
            _add(
                Q(ph__num_passeport__icontains=v) |
                Q(ph__num_carte_identite__icontains=v)
            )

        # Nationalité (ID exact)
        v = (p.get('nationalite_id') or '').strip()
        if v:
            try:
                _add(Q(ph__nationalite_id=int(v)))
            except ValueError:
                pass

        # Activité / domaine d'activité
        v = (p.get('activite') or '').strip()
        if v:
            _add(
                Q(ph__profession__icontains=v)                |
                Q(domaines__domaine__libelle_fr__icontains=v) |
                Q(domaines__domaine__libelle_ar__icontains=v)
            )

        # Adresse du siège
        v = (p.get('adresse') or '').strip()
        if v:
            _add(
                Q(ph__adresse__icontains=v)         |
                Q(ph__adresse_ar__icontains=v)      |
                Q(pm__siege_social__icontains=v)    |
                Q(pm__siege_social_ar__icontains=v) |
                Q(sc__siege_social__icontains=v)
            )

        # Gérant
        v = (p.get('gerant') or '').strip()
        if v:
            _add(
                Q(gerants__nom_gerant__icontains=v) |
                Q(gerants__ph__nom__icontains=v)    |
                Q(gerants__ph__prenom__icontains=v) |
                Q(gerants__ph__nom_ar__icontains=v)
            )

        # Associé
        v = (p.get('associe') or '').strip()
        if v:
            _add(
                Q(associes__nom_associe__icontains=v) |
                Q(associes__ph__nom__icontains=v)     |
                Q(associes__ph__prenom__icontains=v)  |
                Q(associes__ph__nom_ar__icontains=v)
            )

        # Dates (plages)
        for param, field in [
            ('date_immat_from', 'date_immatriculation__gte'),
            ('date_immat_to',   'date_immatriculation__lte'),
            ('date_enreg_from', 'chronos__date_acte__gte'),
            ('date_enreg_to',   'chronos__date_acte__lte'),
        ]:
            v = (p.get(param) or '').strip()
            if v:
                try:
                    _add(Q(**{field: v}))
                except Exception:
                    pass

        # Type d'entité
        v = (p.get('type_entite') or '').strip()
        if v:
            _add(Q(type_entite=v))

        # Statut RA
        v = (p.get('statut_ra') or '').strip()
        if v:
            _add(Q(statut=v))

        # Statut RC
        v = (p.get('statut_rc') or '').strip()
        if v:
            _add(Q(chronos__statut=v))

        # Filtre registre : si 'rc' → uniquement les RA ayant au moins un RC
        if registre == 'rc':
            _add(Q(chronos__id__isnull=False))

        return f, has_criteria

    # ── Sérialisation d'un résultat ───────────────────────────────────────────

    def _denomination(self, ra):
        if ra.type_entite == 'PH' and ra.ph:
            return f"{ra.ph.nom} {ra.ph.prenom}".strip()
        if ra.type_entite == 'PM' and ra.pm:
            return ra.pm.denomination
        if ra.type_entite == 'SC' and ra.sc:
            return ra.sc.denomination
        return ''

    def _denomination_ar(self, ra):
        if ra.type_entite == 'PH' and ra.ph:
            return f"{ra.ph.nom_ar or ''} {ra.ph.prenom_ar or ''}".strip() or None
        if ra.type_entite == 'PM' and ra.pm:
            return ra.pm.denomination_ar or None
        if ra.type_entite == 'SC' and ra.sc:
            return ra.sc.denomination_ar or None
        return None

    def _to_dict(self, ra, chrono_filter=''):
        # Utilise le prefetch_cache — pas de requête supplémentaire
        chronos = sorted(
            list(ra.chronos.all()),
            key=lambda c: c.date_acte if c.date_acte else _date.min,
            reverse=True,
        )

        # RC à afficher : celui qui correspond au filtre, sinon le plus récent
        if chrono_filter and chronos:
            rc = next(
                (c for c in chronos if chrono_filter.upper() in c.numero_chrono.upper()),
                chronos[0],
            )
        else:
            rc = chronos[0] if chronos else None

        return {
            'id_ra':                  ra.id,
            'id_rc':                  rc.id if rc else None,
            'numero_ra':              ra.numero_ra,
            'numero_chrono':          _fmt_chrono(rc.numero_chrono) if rc else None,
            'denomination':           self._denomination(ra),
            'denomination_ar':        self._denomination_ar(ra),
            'type_entite':            ra.type_entite,
            'statut_ra':              ra.statut,
            'statut_ra_label':        self._RA_LABELS.get(ra.statut, ra.statut),
            'statut_rc':              rc.statut if rc else None,
            'statut_rc_label':        self._RC_LABELS.get(rc.statut, rc.statut) if rc else None,
            'localite':               ra.localite.libelle_fr if ra.localite else '',
            'localite_ar':            ra.localite.libelle_ar if ra.localite else None,
            'date_immatriculation':   str(ra.date_immatriculation) if ra.date_immatriculation else None,
            'date_acte':              str(rc.date_acte) if rc and rc.date_acte else None,
            'type_acte':              rc.type_acte if rc else None,
            'nb_chronos':             len(chronos),
        }
