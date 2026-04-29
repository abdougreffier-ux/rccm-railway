import json
from django.db.models import Q
from rest_framework import serializers
from .models import (
    RegistreAnalytique, RegistreChronologique,
    Associe, Gerant, RADomaine, ActionHistorique, Declarant,
    Administrateur, CommissaireComptes,
)


# ── Déclarant ─────────────────────────────────────────────────────────────────

class DeclarantSerializer(serializers.ModelSerializer):
    nationalite_lib = serializers.CharField(source='nationalite.libelle_fr', read_only=True)

    class Meta:
        model  = Declarant
        fields = [
            'id', 'civilite', 'nom', 'prenom', 'nni', 'num_passeport',
            'date_naissance', 'lieu_naissance',
            'nationalite', 'nationalite_lib',
        ]


class AssocieSerializer(serializers.ModelSerializer):
    nom_entite         = serializers.SerializerMethodField()
    nom_entite_ar      = serializers.SerializerMethodField()
    nationalite_lib    = serializers.CharField(source='nationalite.libelle_fr', read_only=True)
    nationalite_lib_ar = serializers.SerializerMethodField()
    # civilite stockée dans donnees_ident pour les associés PH sans FK
    civilite           = serializers.SerializerMethodField()

    class Meta:
        model  = Associe
        fields = ['id', 'ra', 'type_associe', 'ph', 'pm', 'nom_associe',
                  'civilite',
                  'nationalite', 'nationalite_lib', 'nationalite_lib_ar',
                  'nom_entite', 'nom_entite_ar',
                  'nombre_parts', 'valeur_parts', 'pourcentage', 'type_part',
                  'date_entree', 'date_sortie', 'actif', 'donnees_ident']

    def get_civilite(self, obj):
        if obj.type_associe == 'PH' and obj.ph:
            return getattr(obj.ph, 'civilite', '') or ''
        return (obj.donnees_ident or {}).get('civilite', '')

    def get_nom_entite(self, obj):
        if obj.type_associe == 'PH' and obj.ph:
            return obj.ph.nom_complet
        if obj.type_associe == 'PM' and obj.pm:
            return obj.pm.denomination
        return obj.nom_associe

    def get_nom_entite_ar(self, obj):
        if obj.type_associe == 'PH' and obj.ph:
            parts = [obj.ph.nom_ar or obj.ph.nom, obj.ph.prenom_ar or obj.ph.prenom]
            return ' '.join(p for p in parts if p) or None
        if obj.type_associe == 'PM' and obj.pm:
            return obj.pm.denomination_ar or None
        return None

    def get_nationalite_lib_ar(self, obj):
        return obj.nationalite.libelle_ar if obj.nationalite else None


class GerantSerializer(serializers.ModelSerializer):
    nom_entite         = serializers.SerializerMethodField()
    nom_entite_ar      = serializers.SerializerMethodField()
    fonction_lib       = serializers.CharField(source='fonction.libelle_fr', read_only=True)
    fonction_lib_ar    = serializers.SerializerMethodField()
    nationalite_lib    = serializers.CharField(source='nationalite.libelle_fr', read_only=True)
    nationalite_lib_ar = serializers.SerializerMethodField()
    # civilite : depuis la FK ph si disponible, sinon donnees_ident
    civilite           = serializers.SerializerMethodField()

    class Meta:
        model  = Gerant
        fields = ['id', 'ra', 'type_gerant', 'ph', 'pm', 'nom_gerant',
                  'civilite',
                  'nationalite', 'nationalite_lib', 'nationalite_lib_ar',
                  'fonction', 'fonction_lib', 'fonction_lib_ar',
                  'nom_entite', 'nom_entite_ar',
                  'date_debut', 'date_fin', 'pouvoirs', 'actif', 'donnees_ident']

    def get_civilite(self, obj):
        if obj.type_gerant == 'PH' and obj.ph:
            return getattr(obj.ph, 'civilite', '') or ''
        return (obj.donnees_ident or {}).get('civilite', '')

    def get_nom_entite(self, obj):
        if obj.type_gerant == 'PH' and obj.ph:
            return obj.ph.nom_complet
        if obj.type_gerant == 'PM' and obj.pm:
            return obj.pm.denomination
        return obj.nom_gerant

    def get_nom_entite_ar(self, obj):
        if obj.type_gerant == 'PH' and obj.ph:
            parts = [obj.ph.nom_ar or obj.ph.nom, obj.ph.prenom_ar or obj.ph.prenom]
            return ' '.join(p for p in parts if p) or None
        if obj.type_gerant == 'PM' and obj.pm:
            return obj.pm.denomination_ar or None
        return None

    def get_fonction_lib_ar(self, obj):
        return obj.fonction.libelle_ar if obj.fonction else None

    def get_nationalite_lib_ar(self, obj):
        return obj.nationalite.libelle_ar if obj.nationalite else None


class AdministrateurSerializer(serializers.ModelSerializer):
    """Administrateur du conseil d'administration – SA uniquement."""
    nationalite_lib    = serializers.CharField(source='nationalite.libelle_fr', read_only=True)
    nationalite_lib_ar = serializers.SerializerMethodField()
    nom_complet        = serializers.CharField(read_only=True)

    class Meta:
        model  = Administrateur
        fields = [
            'id', 'ra', 'civilite', 'nom', 'prenom', 'nom_ar', 'prenom_ar', 'nom_complet',
            'nationalite', 'nationalite_lib', 'nationalite_lib_ar',
            'date_naissance', 'lieu_naissance',
            'nni', 'num_passeport',
            'adresse', 'telephone', 'email',
            'fonction', 'date_debut', 'date_fin', 'actif',
        ]

    def get_nationalite_lib_ar(self, obj):
        return obj.nationalite.libelle_ar if obj.nationalite else None


class CommissaireComptesSerializer(serializers.ModelSerializer):
    """Commissaire aux comptes – SA uniquement."""
    nationalite_lib    = serializers.CharField(source='nationalite.libelle_fr', read_only=True)
    nationalite_lib_ar = serializers.SerializerMethodField()
    role_label         = serializers.CharField(source='get_role_display',             read_only=True)
    type_label         = serializers.CharField(source='get_type_commissaire_display', read_only=True)
    nom_complet        = serializers.CharField(read_only=True)

    class Meta:
        model  = CommissaireComptes
        fields = [
            'id', 'ra',
            'type_commissaire', 'type_label',
            'role', 'role_label',
            'civilite', 'nom', 'prenom', 'nom_ar', 'nom_complet',
            'nationalite', 'nationalite_lib', 'nationalite_lib_ar',
            'date_naissance', 'lieu_naissance',
            'nni', 'num_passeport',
            'adresse', 'telephone', 'email',
            'date_debut', 'date_fin', 'actif',
        ]

    def get_nationalite_lib_ar(self, obj):
        return obj.nationalite.libelle_ar if obj.nationalite else None


class RADomainSerializer(serializers.ModelSerializer):
    domaine_libelle    = serializers.CharField(source='domaine.libelle_fr', read_only=True)
    domaine_libelle_ar = serializers.SerializerMethodField()

    class Meta:
        model  = RADomaine
        fields = ['id', 'domaine', 'domaine_libelle', 'domaine_libelle_ar', 'principal']

    def get_domaine_libelle_ar(self, obj):
        return obj.domaine.libelle_ar if obj.domaine else None


class ActionHistoriqueSerializer(serializers.ModelSerializer):
    created_by_nom   = serializers.SerializerMethodField()
    action_label     = serializers.CharField(source='get_action_display', read_only=True)
    ra_numero        = serializers.SerializerMethodField()
    ra_denomination  = serializers.SerializerMethodField()
    lien_detail      = serializers.SerializerMethodField()

    # Actions liées à une modification — permettent d'afficher un lien vers le détail
    _MODIF_ACTIONS = frozenset({
        'VALIDATION_MODIFICATION', 'RETOUR_MODIFICATION',
        'ANNULATION_MODIFICATION', 'MODIFICATION_CORRECTIVE',
    })

    class Meta:
        model  = ActionHistorique
        fields = [
            'id', 'action', 'action_label', 'commentaire',
            'reference_operation', 'etat_avant', 'etat_apres',
            'ra', 'ra_numero', 'ra_denomination',
            'created_by', 'created_by_nom', 'created_at',
            'lien_detail',
        ]

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.nom} {obj.created_by.prenom}".strip() or obj.created_by.login
        return '—'

    def get_ra_numero(self, obj):
        return obj.ra.numero_ra if obj.ra else None

    def get_ra_denomination(self, obj):
        return obj.ra.denomination if obj.ra else '—'

    def get_lien_detail(self, obj):
        if obj.action in self._MODIF_ACTIONS and isinstance(obj.etat_apres, dict):
            mid = obj.etat_apres.get('__modif_id')
            if mid:
                return f'/modifications/{mid}'
        return None


# ── Serializer partagé pour les pièces jointes ────────────────────────────────

class DocumentMiniSerializer(serializers.Serializer):
    """
    Serializer léger pour inclure les documents dans le détail RA ou RC.
    Source peut être 'ra' (lié au RA directement) ou 'chrono' (lié à un RC).
    """
    id                  = serializers.IntegerField()
    nom_fichier         = serializers.CharField()
    type_doc            = serializers.IntegerField(source='type_doc_id', allow_null=True)
    type_doc_libelle    = serializers.SerializerMethodField()
    type_doc_libelle_ar = serializers.SerializerMethodField()
    taille_ko           = serializers.IntegerField(allow_null=True)
    mime_type           = serializers.CharField(allow_blank=True)
    date_scan           = serializers.DateField()
    created_at          = serializers.DateTimeField()
    description         = serializers.CharField(allow_blank=True)
    url                 = serializers.SerializerMethodField()
    source              = serializers.SerializerMethodField()
    chrono_id           = serializers.IntegerField(allow_null=True)

    def get_type_doc_libelle(self, obj):
        return obj.type_doc.libelle_fr if obj.type_doc else ''

    def get_type_doc_libelle_ar(self, obj):
        return obj.type_doc.libelle_ar if obj.type_doc else None

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.fichier and request:
            return request.build_absolute_uri(obj.fichier.url)
        return None

    def get_source(self, obj):
        return 'chrono' if obj.chrono_id else 'ra'


# ── Registre Analytique ───────────────────────────────────────────────────────

class RegistreAnalytiqueListSerializer(serializers.ModelSerializer):
    denomination             = serializers.SerializerMethodField()
    denomination_ar          = serializers.SerializerMethodField()
    localite_libelle         = serializers.CharField(source='localite.libelle_fr', read_only=True)
    localite_libelle_ar      = serializers.SerializerMethodField()
    statut_label             = serializers.CharField(source='get_statut_display', read_only=True)
    nb_modifications         = serializers.SerializerMethodField()
    nb_cessions              = serializers.SerializerMethodField()
    statut_be_label          = serializers.CharField(source='get_statut_be_display', read_only=True)
    numero_chrono            = serializers.SerializerMethodField()
    created_by_nom           = serializers.SerializerMethodField()
    forme_juridique_code     = serializers.SerializerMethodField()
    forme_juridique_libelle  = serializers.SerializerMethodField()
    forme_juridique_libelle_ar = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreAnalytique
        fields = ['id', 'uuid', 'numero_ra', 'numero_rc', 'numero_chrono',
                  'type_entite', 'statut', 'statut_label',
                  'denomination', 'denomination_ar',
                  'forme_juridique_code', 'forme_juridique_libelle', 'forme_juridique_libelle_ar',
                  'date_immatriculation', 'date_radiation',
                  'localite', 'localite_libelle', 'localite_libelle_ar',
                  'created_at', 'created_by_nom',
                  'nb_modifications', 'nb_cessions',
                  'statut_be', 'statut_be_label', 'date_declaration_be', 'date_limite_be']

    def get_denomination(self, obj):    return obj.denomination
    def get_denomination_ar(self, obj): return obj.denomination_ar

    def _fj(self, obj):
        """Retourne l'objet FormeJuridique si disponible (PM uniquement)."""
        try:
            return obj.pm.forme_juridique if obj.type_entite == 'PM' and obj.pm else None
        except Exception:
            return None

    def get_forme_juridique_code(self, obj):
        fj = self._fj(obj)
        return fj.code if fj else None

    def get_forme_juridique_libelle(self, obj):
        fj = self._fj(obj)
        return fj.libelle_fr if fj else None

    def get_forme_juridique_libelle_ar(self, obj):
        fj = self._fj(obj)
        return (fj.libelle_ar or fj.libelle_fr) if fj else None

    def get_localite_libelle_ar(self, obj):
        return obj.localite.libelle_ar if obj.localite else None

    def get_nb_modifications(self, obj):
        try:
            return obj.modifications.count()
        except Exception:
            return 0

    def get_nb_cessions(self, obj):
        try:
            return obj.cessions.count()
        except Exception:
            return 0

    def get_numero_chrono(self, obj):
        """Numéro du premier RC chronologique lié (type IMMATRICULATION)."""
        try:
            rc = next(
                (c for c in obj.chronos.all() if c.type_acte == 'IMMATRICULATION'),
                None,
            )
            return rc.numero_chrono if rc else None
        except Exception:
            return None

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return (f"{obj.created_by.nom} {obj.created_by.prenom}".strip()
                    or obj.created_by.login)
        return None


class RegistreAnalytiqueDetailSerializer(serializers.ModelSerializer):
    denomination          = serializers.SerializerMethodField()
    denomination_ar       = serializers.SerializerMethodField()
    localite_libelle      = serializers.CharField(source='localite.libelle_fr', read_only=True)
    localite_libelle_ar   = serializers.SerializerMethodField()
    statut_label          = serializers.CharField(source='get_statut_display', read_only=True)
    validated_by_nom      = serializers.SerializerMethodField()
    created_by_nom        = serializers.SerializerMethodField()
    associes              = AssocieSerializer(many=True, read_only=True)
    gerants               = GerantSerializer(many=True, read_only=True)
    administrateurs       = AdministrateurSerializer(many=True, read_only=True)
    commissaires          = CommissaireComptesSerializer(many=True, read_only=True)
    domaines              = RADomainSerializer(many=True, read_only=True)
    historique            = ActionHistoriqueSerializer(many=True, read_only=True)
    documents             = serializers.SerializerMethodField()
    ph_data               = serializers.SerializerMethodField()
    pm_data               = serializers.SerializerMethodField()
    sc_data               = serializers.SerializerMethodField()
    description_extra     = serializers.SerializerMethodField()
    chronos_count         = serializers.SerializerMethodField()
    operations            = serializers.SerializerMethodField()
    statut_be_label       = serializers.CharField(source='get_statut_be_display', read_only=True)
    est_sa                = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreAnalytique
        fields = [
            'id', 'uuid', 'numero_ra', 'numero_rc', 'type_entite', 'statut', 'statut_label',
            'ph', 'pm', 'sc', 'denomination', 'denomination_ar', 'ph_data', 'pm_data', 'sc_data',
            'date_immatriculation', 'date_radiation', 'motif_radiation',
            'localite', 'localite_libelle', 'localite_libelle_ar',
            'observations', 'observations_greffier',
            'associes', 'gerants', 'administrateurs', 'commissaires', 'domaines',
            'historique', 'documents',
            'description_extra', 'chronos_count',
            'operations',
            'created_at', 'updated_at', 'validated_at',
            'validated_by', 'validated_by_nom',
            'created_by',  'created_by_nom',
            'statut_be', 'statut_be_label', 'date_declaration_be', 'date_limite_be',
            'est_sa',
        ]

    def get_denomination(self, obj):    return obj.denomination
    def get_denomination_ar(self, obj): return obj.denomination_ar
    def get_est_sa(self, obj):          return obj.est_sa

    def get_localite_libelle_ar(self, obj):
        return obj.localite.libelle_ar if obj.localite else None

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.nom} {obj.validated_by.prenom}".strip() or obj.validated_by.login
        return None

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.nom} {obj.created_by.prenom}".strip() or obj.created_by.login
        return None

    def get_ph_data(self, obj):
        if obj.ph:
            from apps.entites.serializers import PersonnePhysiqueSerializer
            return PersonnePhysiqueSerializer(obj.ph).data
        return None

    def get_pm_data(self, obj):
        if obj.pm:
            from apps.entites.serializers import PersonneMoraleSerializer
            return PersonneMoraleSerializer(obj.pm).data
        return None

    def get_sc_data(self, obj):
        if obj.sc:
            from apps.entites.serializers import SuccursaleSerializer
            return SuccursaleSerializer(obj.sc).data
        return None

    def get_documents(self, obj):
        """
        Retourne les documents liés au RA ET ceux liés aux RC chronologiques
        de ce RA — sans duplication, triés par date décroissante.
        """
        from apps.documents.models import Document
        docs = (
            Document.objects
            .filter(Q(ra=obj) | Q(chrono__ra=obj))
            .select_related('type_doc')
            .distinct()
            .order_by('-created_at')
        )
        return DocumentMiniSerializer(docs, many=True, context=self.context).data

    def get_description_extra(self, obj):
        """Extrait le JSON stocké dans le RC chrono IMMATRICULATION lié."""
        chrono = obj.chronos.filter(type_acte='IMMATRICULATION').first()
        if chrono and chrono.description:
            try:
                return json.loads(chrono.description)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    def get_chronos_count(self, obj):
        return obj.chronos.count()

    def get_operations(self, obj):
        """
        Retourne l'historique opérationnel complet du dossier :
        immatriculations (RC), modifications, cessions, radiations.
        Triés par date croissante.
        """
        _TYPE_LABELS = {
            'IMMATRICULATION': 'Immatriculation initiale',
            'MODIFICATION':    'Modification',
            'CESSION':         'Cession de parts',
            'RADIATION':       'Radiation',
            'SUSPENSION':      'Suspension',
            'REACTIVATION':    'Réactivation',
        }
        _STATUT_LABELS_CHRONO = {
            'EN_INSTANCE': 'En instance',
            'VALIDE':      'Validé',
            'REJETE':      'Rejeté',
            'ANNULE':      'Annulé',
        }
        _STATUT_LABELS_WORKFLOW = {
            'BROUILLON':       'Brouillon',
            'EN_INSTANCE':     'En instance',
            'RETOURNE':        'Retourné',
            'VALIDE':          'Validé',
            'ANNULE':          'Annulé',
            'ANNULE_GREFFIER': 'Annulé (greffier)',
        }
        _STATUT_LABELS_RAD = {
            'EN_COURS': 'En cours',
            'VALIDEE':  'Validée',
            'REJETEE':  'Rejetée',
            'ANNULEE':  'Annulée',
        }

        def _nom(user):
            if not user:
                return '—'
            return f"{user.prenom} {user.nom}".strip() or getattr(user, 'login', '—')

        items = []

        # 1. RC Chronologiques (immatriculation et autres actes)
        for c in obj.chronos.all():
            items.append({
                'type':           c.type_acte,
                'type_label':     _TYPE_LABELS.get(c.type_acte, c.type_acte),
                'date':           str(c.date_acte) if c.date_acte else str(c.created_at.date()),
                'numero':         _fmt_chrono(c.numero_chrono),
                'statut':         c.statut,
                'statut_label':   _STATUT_LABELS_CHRONO.get(c.statut, c.statut),
                'id_ref':         c.id,
                'module':         'chrono',
                'url':            f'/registres/chronologique/{c.id}',
                'created_by_nom': _nom(getattr(c, 'created_by', None)),
                'created_at':     c.created_at.isoformat() if c.created_at else None,
            })

        # 2. Modifications
        try:
            for m in obj.modifications.all():
                items.append({
                    'type':           'MODIFICATION',
                    'type_label':     'Modification',
                    'date':           str(m.date_modif) if m.date_modif else str(m.created_at.date()),
                    'numero':         m.numero_modif,
                    'statut':         m.statut,
                    'statut_label':   _STATUT_LABELS_WORKFLOW.get(m.statut, m.statut),
                    'id_ref':         m.id,
                    'module':         'modification',
                    'url':            f'/modifications/{m.id}',
                    'created_by_nom': _nom(getattr(m, 'created_by', None)),
                    'created_at':     m.created_at.isoformat() if m.created_at else None,
                })
        except Exception:
            pass

        # 3. Cessions
        try:
            for c in obj.cessions.all():
                items.append({
                    'type':           'CESSION',
                    'type_label':     'Cession de parts',
                    'date':           str(c.date_cession) if c.date_cession else str(c.created_at.date()),
                    'numero':         c.numero_cession,
                    'statut':         c.statut,
                    'statut_label':   _STATUT_LABELS_WORKFLOW.get(c.statut, c.statut),
                    'id_ref':         c.id,
                    'module':         'cession',
                    'url':            f'/cessions/{c.id}',
                    'created_by_nom': _nom(getattr(c, 'created_by', None)),
                    'created_at':     c.created_at.isoformat() if c.created_at else None,
                })
        except Exception:
            pass

        # 4. Radiations
        try:
            for r in obj.radiations.all():
                items.append({
                    'type':           'RADIATION',
                    'type_label':     'Radiation',
                    'date':           str(r.date_radiation) if r.date_radiation else str(r.created_at.date()),
                    'numero':         r.numero_radia,
                    'statut':         r.statut,
                    'statut_label':   _STATUT_LABELS_RAD.get(r.statut, r.statut),
                    'id_ref':         r.id,
                    'module':         'radiation',
                    'url':            f'/radiations/{r.id}',
                    'created_by_nom': _nom(getattr(r, 'created_by', None)),
                    'created_at':     r.created_at.isoformat() if r.created_at else None,
                })
        except Exception:
            pass

        # 5. Cessions de fonds de commerce
        try:
            for cf in obj.cessions_fonds.all():
                snap    = cf.snapshot_cedant   or {}
                cess    = cf.cessionnaire_data or {}
                _cedant = f"{snap.get('nom', '')} {snap.get('prenom', '')}".strip() or '—'
                _cess   = f"{cess.get('nom', '')} {cess.get('prenom', '')}".strip() or '—'
                items.append({
                    'type':           'CESSION_FONDS_COMMERCE',
                    'type_label':     'Cession de fonds de commerce',
                    'date':           str(cf.date_cession) if cf.date_cession else str(cf.created_at.date()),
                    'numero':         cf.numero_cession_fonds,
                    'statut':         cf.statut,
                    'statut_label':   _STATUT_LABELS_WORKFLOW.get(cf.statut, cf.statut),
                    'id_ref':         cf.id,
                    'module':         'cession_fonds',
                    'url':            f'/cessions-fonds/{cf.id}',
                    'created_by_nom': _nom(getattr(cf, 'created_by', None)),
                    'created_at':     cf.created_at.isoformat() if cf.created_at else None,
                    'resume':         f'{_cedant} → {_cess}',
                })
        except Exception:
            pass

        # 6. Annulations et corrections (ActionHistorique entries)
        ANNUL_TYPES = {
            'ANNULATION_MODIFICATION':   ('ANNULATION_MODIFICATION',   'Annulation de modification'),
            'ANNULATION_CESSION':        ('ANNULATION_CESSION',        'Annulation de cession'),
            'ANNULATION_RADIATION':      ('ANNULATION_RADIATION',      'Annulation de radiation'),
            'ANNULATION_CESSION_FONDS':  ('ANNULATION_CESSION_FONDS',  'Annulation de cession de fonds'),
            'MODIFICATION_CORRECTIVE':   ('MODIFICATION_CORRECTIVE',   'Modification corrective'),
            'CESSION_CORRECTIVE':        ('CESSION_CORRECTIVE',        'Cession corrective'),
        }
        for h in obj.historique.filter(action__in=ANNUL_TYPES.keys()):
            op_type, op_label = ANNUL_TYPES[h.action]
            items.append({
                'type':           op_type,
                'type_label':     op_label,
                'date':           str(h.created_at.date()),
                'numero':         '—',
                'statut':         'ENREGISTRE',
                'statut_label':   'Enregistré',
                'id_ref':         h.id,
                'module':         'historique',
                'url':            None,
                'created_by_nom': _nom(getattr(h, 'created_by', None)),
                'created_at':     h.created_at.isoformat() if h.created_at else None,
                'commentaire':    h.commentaire,
            })

        items.sort(key=lambda x: x.get('date') or x.get('created_at') or '')
        return items


# ── Registre Chronologique ────────────────────────────────────────────────────

def _fmt_chrono(val):
    """Normalise un numéro chronologique sur 4 chiffres minimum (CDC)."""
    if val is None:
        return None
    try:
        return str(int(str(val).strip())).zfill(4)
    except (ValueError, TypeError):
        return str(val)


class RegistreChronologiqueSerializer(serializers.ModelSerializer):
    """Serializer allégé pour la liste."""
    ra_numero              = serializers.CharField(source='ra.numero_ra',    read_only=True)
    ra_statut              = serializers.CharField(source='ra.statut',       read_only=True)
    ra_type_entite         = serializers.CharField(source='ra.type_entite',  read_only=True, default='')
    denomination           = serializers.SerializerMethodField()
    denomination_ar        = serializers.SerializerMethodField()
    statut_label           = serializers.CharField(source='get_statut_display', read_only=True)
    numero_chrono          = serializers.SerializerMethodField()
    modifications_retournees = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreChronologique
        fields = [
            'id', 'uuid', 'numero_chrono', 'annee_chrono', 'ra', 'ra_numero', 'ra_statut', 'ra_type_entite',
            'denomination', 'denomination_ar', 'type_acte', 'date_acte', 'date_enregistrement',
            'statut', 'statut_label', 'langue_acte', 'observations',
            'modifications_retournees',
            'created_at', 'updated_at', 'validated_at',
        ]

    def get_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_denomination_ar(self, obj):
        return obj.ra.denomination_ar if obj.ra else ''

    def get_numero_chrono(self, obj):
        return _fmt_chrono(obj.numero_chrono)

    def get_modifications_retournees(self, obj):
        """
        Liste des modifications en statut RETOURNE liées au RA de ce RC.
        Permet à l'agent de découvrir et traiter une rectification post-immatriculation
        initiée par le greffier, même quand le RC est en statut VALIDE.
        """
        if not obj.ra:
            return []
        try:
            return list(
                obj.ra.modifications
                .filter(statut='RETOURNE')
                .values('id', 'numero_modif', 'observations')
            )
        except Exception:
            return []


class RegistreChronologiqueDetailSerializer(serializers.ModelSerializer):
    """Serializer complet pour le détail RC — inclut documents et infos RA.

    Les champs ra_* embarquent les données de l'entité liée (PH/PM/SC) afin que
    le formulaire d'édition puisse se pré-remplir sans appel supplémentaire à
    l'endpoint RA (utile pour l'Agent GU qui n'a pas accès à /registre-analytique/).
    """
    ra_numero                = serializers.CharField(source='ra.numero_ra', read_only=True)
    ra_statut                = serializers.CharField(source='ra.statut',    read_only=True)
    ra_type_entite           = serializers.CharField(source='ra.type_entite', read_only=True, default='')
    ra_localite              = serializers.IntegerField(source='ra.localite_id', read_only=True, allow_null=True)
    ra_gerants               = serializers.SerializerMethodField()
    ra_associes              = serializers.SerializerMethodField()
    ra_administrateurs       = serializers.SerializerMethodField()
    ra_commissaires          = serializers.SerializerMethodField()
    ra_domaines              = serializers.SerializerMethodField()
    ra_ph_data               = serializers.SerializerMethodField()
    ra_pm_data               = serializers.SerializerMethodField()
    ra_sc_data               = serializers.SerializerMethodField()
    denomination             = serializers.SerializerMethodField()
    denomination_ar          = serializers.SerializerMethodField()
    statut_label             = serializers.CharField(source='get_statut_display', read_only=True)
    documents                = serializers.SerializerMethodField()
    description_parsed       = serializers.SerializerMethodField()
    numero_chrono            = serializers.SerializerMethodField()
    declarant_data           = serializers.SerializerMethodField()
    modifications_retournees = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreChronologique
        fields = [
            'id', 'uuid', 'numero_chrono', 'annee_chrono',
            'ra', 'ra_numero', 'ra_statut',
            'ra_type_entite', 'ra_localite',
            'ra_gerants', 'ra_associes', 'ra_administrateurs', 'ra_commissaires', 'ra_domaines',
            'ra_ph_data', 'ra_pm_data', 'ra_sc_data',
            'denomination', 'denomination_ar',
            'type_acte', 'date_acte', 'date_enregistrement',
            'description', 'description_parsed', 'description_ar',
            'statut', 'statut_label', 'observations',
            'documents',
            'declarant', 'declarant_data',
            'modifications_retournees',
            'created_at', 'updated_at', 'validated_at',
        ]

    def get_numero_chrono(self, obj):
        return _fmt_chrono(obj.numero_chrono)

    def get_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_denomination_ar(self, obj):
        if not obj.ra:
            return ''
        ra = obj.ra
        if ra.type_entite == 'PH' and ra.ph:
            return f"{ra.ph.nom_ar or ''} {ra.ph.prenom_ar or ''}".strip()
        if ra.type_entite == 'PM' and ra.pm:
            return ra.pm.denomination_ar or ''
        if ra.type_entite == 'SC' and ra.sc:
            return ra.sc.denomination_ar or ''
        return ''

    def get_documents(self, obj):
        return DocumentMiniSerializer(
            obj.documents.select_related('type_doc').all(),
            many=True,
            context=self.context,
        ).data

    def get_description_parsed(self, obj):
        if obj.description:
            try:
                return json.loads(obj.description)
            except (ValueError, TypeError):
                return {}
        return {}

    def get_declarant_data(self, obj):
        if obj.declarant:
            d = obj.declarant
            return {
                'id':             d.id,
                'nom':            d.nom,
                'prenom':         d.prenom,
                'nni':            d.nni,
                'num_passeport':  d.num_passeport,
                'date_naissance': str(d.date_naissance) if d.date_naissance else None,
                'lieu_naissance': d.lieu_naissance,
                'nationalite_id': d.nationalite_id,
            }
        return None

    # ── Données RA embarquées — permettent l'édition sans appel séparé à /ra/ ──

    def get_ra_ph_data(self, obj):
        if obj.ra and obj.ra.ph:
            from apps.entites.serializers import PersonnePhysiqueSerializer
            return PersonnePhysiqueSerializer(obj.ra.ph).data
        return None

    def get_ra_pm_data(self, obj):
        if obj.ra and obj.ra.pm:
            from apps.entites.serializers import PersonneMoraleSerializer
            return PersonneMoraleSerializer(obj.ra.pm).data
        return None

    def get_ra_sc_data(self, obj):
        if obj.ra and obj.ra.sc:
            from apps.entites.serializers import SuccursaleSerializer
            return SuccursaleSerializer(obj.ra.sc).data
        return None

    def get_ra_gerants(self, obj):
        if not obj.ra:
            return []
        return GerantSerializer(
            obj.ra.gerants.filter(actif=True), many=True
        ).data

    def get_ra_associes(self, obj):
        if not obj.ra:
            return []
        return AssocieSerializer(
            obj.ra.associes.filter(actif=True), many=True
        ).data

    def get_ra_administrateurs(self, obj):
        if not obj.ra:
            return []
        return AdministrateurSerializer(
            obj.ra.administrateurs.all(), many=True
        ).data

    def get_ra_commissaires(self, obj):
        if not obj.ra:
            return []
        return CommissaireComptesSerializer(
            obj.ra.commissaires.all(), many=True
        ).data

    def get_ra_domaines(self, obj):
        if not obj.ra:
            return []
        return RADomainSerializer(obj.ra.domaines.all(), many=True).data

    def get_modifications_retournees(self, obj):
        """
        Liste des modifications en statut RETOURNE liées au RA de ce RC.
        Permet d'afficher une alerte dans le détail RC quand le greffier
        a initié une rectification post-immatriculation.
        """
        if not obj.ra:
            return []
        try:
            return list(
                obj.ra.modifications
                .filter(statut='RETOURNE')
                .values('id', 'numero_modif', 'observations')
            )
        except Exception:
            return []
