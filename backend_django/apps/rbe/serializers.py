from rest_framework import serializers
from .models import RegistreBE, BeneficiaireEffectif, ActionHistoriqueRBE, EntiteJuridique, NatureControle


# ─────────────────────────────────────────────────────────────────────────────
# EntiteJuridique
# ─────────────────────────────────────────────────────────────────────────────

class EntiteJuridiqueSerializer(serializers.ModelSerializer):
    type_entite_display  = serializers.CharField(source='get_type_entite_display', read_only=True)
    source_entite_display = serializers.CharField(source='get_source_entite_display', read_only=True)
    autorite_display     = serializers.CharField(source='get_autorite_enregistrement_display', read_only=True)
    denomination_display = serializers.ReadOnlyField()
    ra_numero            = serializers.SerializerMethodField()
    nb_declarations      = serializers.SerializerMethodField()

    class Meta:
        model  = EntiteJuridique
        fields = [
            'id', 'uuid', 'type_entite', 'type_entite_display',
            'denomination', 'denomination_ar', 'denomination_display',
            'source_entite', 'source_entite_display',
            'ra', 'ra_numero', 'numero_rc',
            'autorite_enregistrement', 'autorite_display', 'numero_enregistrement',
            'date_creation', 'pays', 'siege_social',
            'nb_declarations',
            'created_at', 'updated_at', 'created_by',
        ]
        read_only_fields = ['id', 'uuid', 'created_at', 'updated_at']

    def get_ra_numero(self, obj):
        if obj.ra:
            return obj.ra.numero_rc or obj.ra.numero_ra or ''
        return ''

    def get_nb_declarations(self, obj):
        return obj.declarations.count()


# ─────────────────────────────────────────────────────────────────────────────
# NatureControle
# ─────────────────────────────────────────────────────────────────────────────

class NatureControleSerializer(serializers.ModelSerializer):
    type_controle_display = serializers.CharField(source='get_type_controle_display', read_only=True)

    class Meta:
        model  = NatureControle
        fields = ['id', 'beneficiaire', 'type_controle', 'type_controle_display',
                  'pourcentage', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


# ─────────────────────────────────────────────────────────────────────────────
# BeneficiaireEffectif
# ─────────────────────────────────────────────────────────────────────────────

class BeneficiaireEffectifSerializer(serializers.ModelSerializer):
    nationalite_lib         = serializers.CharField(
        source='nationalite.libelle_fr', read_only=True, default=None)
    nationalite_lib_ar      = serializers.CharField(
        source='nationalite.libelle_ar', read_only=True, default=None)
    nature_controle_display = serializers.SerializerMethodField()
    type_document_display   = serializers.SerializerMethodField()
    nom_complet             = serializers.ReadOnlyField()
    natures_controle        = NatureControleSerializer(many=True, read_only=True)

    class Meta:
        model  = BeneficiaireEffectif
        fields = [
            'id', 'rbe',
            'civilite', 'nom', 'prenom', 'nom_ar', 'prenom_ar', 'nom_complet',
            'date_naissance', 'lieu_naissance', 'lieu_naissance_ar',
            'nationalite', 'nationalite_lib', 'nationalite_lib_ar', 'nationalite_autre',
            'type_document', 'type_document_display', 'numero_document',
            'adresse', 'adresse_ar', 'telephone', 'email', 'domicile',
            'nature_controle', 'nature_controle_display', 'nature_controle_detail',
            'pourcentage_detention', 'date_prise_effet',
            'natures_controle',
            'actif', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'natures_controle']

    def get_nature_controle_display(self, obj):
        return obj.get_nature_controle_display() if obj.nature_controle else ''

    def get_type_document_display(self, obj):
        return obj.get_type_document_display() if obj.type_document else ''


# ─────────────────────────────────────────────────────────────────────────────
# ActionHistoriqueRBE
# ─────────────────────────────────────────────────────────────────────────────

class ActionHistoriqueRBESerializer(serializers.ModelSerializer):
    action_display = serializers.SerializerMethodField()
    created_by_nom = serializers.SerializerMethodField()

    class Meta:
        model  = ActionHistoriqueRBE
        fields = ['id', 'rbe', 'action', 'action_display', 'commentaire',
                  'ancien_etat', 'nouvel_etat',
                  'created_by', 'created_by_nom', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_action_display(self, obj):
        return obj.get_action_display()

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None


# ─────────────────────────────────────────────────────────────────────────────
# RegistreBE — Liste
# ─────────────────────────────────────────────────────────────────────────────

class RegistreBEListSerializer(serializers.ModelSerializer):
    statut_display           = serializers.SerializerMethodField()
    type_entite_display      = serializers.SerializerMethodField()
    type_declaration_display = serializers.SerializerMethodField()
    mode_declaration_display = serializers.SerializerMethodField()
    denomination             = serializers.ReadOnlyField()
    source_entite            = serializers.ReadOnlyField()
    entite_denomination      = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreBE
        fields = [
            'id', 'uuid', 'numero_rbe',
            'type_entite', 'type_entite_display',
            'denomination_entite', 'denomination',
            'entite', 'entite_denomination',
            'statut', 'statut_display',
            'type_declaration', 'type_declaration_display',
            'mode_declaration', 'mode_declaration_display',
            'date_declaration', 'date_limite', 'created_at',
            'source_entite', 'demandeur',
        ]

    def get_statut_display(self, obj):
        return obj.get_statut_display()

    def get_type_entite_display(self, obj):
        return obj.get_type_entite_display()

    def get_type_declaration_display(self, obj):
        return obj.get_type_declaration_display()

    def get_mode_declaration_display(self, obj):
        return obj.get_mode_declaration_display() if obj.mode_declaration else ''

    def get_entite_denomination(self, obj):
        if obj.entite:
            return obj.entite.denomination_display
        return ''


# ─────────────────────────────────────────────────────────────────────────────
# RegistreBE — Détail
# ─────────────────────────────────────────────────────────────────────────────

class RegistreBEDetailSerializer(serializers.ModelSerializer):
    beneficiaires            = BeneficiaireEffectifSerializer(many=True, read_only=True)
    historique               = ActionHistoriqueRBESerializer(many=True, read_only=True)
    documents                = serializers.SerializerMethodField()
    entite_data              = serializers.SerializerMethodField()

    statut_display           = serializers.SerializerMethodField()
    type_entite_display      = serializers.SerializerMethodField()
    type_declaration_display = serializers.SerializerMethodField()
    mode_declaration_display = serializers.SerializerMethodField()
    denomination             = serializers.ReadOnlyField()
    source_entite            = serializers.ReadOnlyField()

    ra_numero                = serializers.SerializerMethodField()
    localite_libelle         = serializers.SerializerMethodField()
    created_by_nom           = serializers.SerializerMethodField()
    validated_by_nom         = serializers.SerializerMethodField()

    class Meta:
        model  = RegistreBE
        fields = [
            'id', 'uuid', 'numero_rbe',
            # Entité
            'type_entite', 'type_entite_display',
            'entite', 'entite_data',
            'ra', 'ra_numero',
            'denomination_entite', 'denomination_entite_ar', 'denomination',
            'source_entite',
            # Déclaration
            'type_declaration', 'type_declaration_display',
            'mode_declaration', 'mode_declaration_display',
            'date_limite',
            'statut', 'statut_display',
            'declaration_initiale',
            # Déclarant
            'declarant_civilite', 'declarant_nom', 'declarant_prenom', 'declarant_nom_ar',
            'declarant_qualite', 'declarant_qualite_ar',
            'declarant_adresse', 'declarant_telephone', 'declarant_email',
            # Date / lieu
            'date_declaration', 'localite', 'localite_libelle',
            # Motif & observations
            'motif', 'observations', 'observations_greffier', 'demandeur',
            # Audit
            'created_at', 'updated_at',
            'created_by', 'created_by_nom',
            'validated_by', 'validated_by_nom', 'validated_at',
            # Nested
            'beneficiaires', 'historique', 'documents',
        ]
        read_only_fields = [
            'id', 'uuid', 'numero_rbe',
            'created_at', 'updated_at',
            'validated_by', 'validated_at',
        ]

    def get_statut_display(self, obj):           return obj.get_statut_display()
    def get_type_entite_display(self, obj):      return obj.get_type_entite_display()
    def get_type_declaration_display(self, obj): return obj.get_type_declaration_display()
    def get_mode_declaration_display(self, obj): return obj.get_mode_declaration_display() if obj.mode_declaration else ''

    def get_ra_numero(self, obj):
        if obj.ra: return obj.ra.numero_rc or obj.ra.numero_ra or ''
        return ''

    def get_localite_libelle(self, obj):
        return str(obj.localite) if obj.localite else ''

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return obj.validated_by.get_full_name() or obj.validated_by.username
        return None

    def get_entite_data(self, obj):
        if obj.entite:
            return EntiteJuridiqueSerializer(obj.entite).data
        return None

    def get_documents(self, obj):
        from apps.documents.models import Document
        docs = Document.objects.filter(rbe=obj).select_related('type_doc')
        return [
            {
                'id':               d.id,
                'uuid':             str(d.uuid),
                'nom_fichier':      d.nom_fichier,
                'type_doc':         d.type_doc_id,
                'type_doc_libelle': d.type_doc.libelle_fr if d.type_doc else '',
                'taille_ko':        d.taille_ko,
                'mime_type':        d.mime_type,
                'date_scan':        str(d.date_scan) if d.date_scan else None,
                'created_at':       str(d.created_at) if d.created_at else None,
            }
            for d in docs
        ]
