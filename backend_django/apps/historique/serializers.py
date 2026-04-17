from rest_framework import serializers
from .models import ImmatriculationHistorique


def _fmt_chrono(val):
    """Normalise un numéro chronologique sur 4 chiffres minimum (CDC)."""
    if val is None:
        return None
    try:
        return str(int(val)).zfill(4)
    except (ValueError, TypeError):
        return str(val)


class ImmatriculationHistoriqueListSerializer(serializers.ModelSerializer):
    created_by_nom   = serializers.SerializerMethodField()
    validated_by_nom = serializers.SerializerMethodField()
    localite_label   = serializers.CharField(source='localite.libelle_fr', read_only=True, default='')
    denomination     = serializers.SerializerMethodField()
    numero_chrono    = serializers.SerializerMethodField()

    class Meta:
        model  = ImmatriculationHistorique
        fields = [
            'id', 'uuid', 'numero_demande', 'statut', 'type_entite',
            'numero_ra', 'numero_chrono', 'annee_chrono', 'date_immatriculation',
            'localite', 'localite_label', 'denomination',
            'observations', 'demandeur',
            'created_by_nom', 'validated_by_nom',
            'created_at', 'updated_at', 'validated_at', 'import_batch',
        ]

    def get_numero_chrono(self, obj):
        return _fmt_chrono(obj.numero_chrono)

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.nom} {obj.created_by.prenom}".strip() or obj.created_by.login
        return '—'

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.nom} {obj.validated_by.prenom}".strip() or obj.validated_by.login
        return '—'

    def get_denomination(self, obj):
        d = obj.donnees or {}
        if obj.type_entite == 'PH':
            return f"{d.get('nom', '')} {d.get('prenom', '')}".strip()
        return d.get('denomination', '')


class ImmatriculationHistoriqueDetailSerializer(serializers.ModelSerializer):
    created_by_nom   = serializers.SerializerMethodField()
    validated_by_nom = serializers.SerializerMethodField()
    localite_label   = serializers.CharField(source='localite.libelle_fr', read_only=True, default='')
    denomination     = serializers.SerializerMethodField()
    ra_numero        = serializers.CharField(source='ra.numero_ra', read_only=True, default='')
    numero_chrono    = serializers.SerializerMethodField()

    class Meta:
        model  = ImmatriculationHistorique
        fields = [
            'id', 'uuid', 'numero_demande', 'statut', 'type_entite',
            'numero_ra', 'numero_chrono', 'annee_chrono', 'date_immatriculation',
            'localite', 'localite_label', 'denomination', 'donnees',
            'observations', 'demandeur',
            'ra', 'ra_numero',
            'created_by', 'created_by_nom', 'validated_by', 'validated_by_nom',
            'created_at', 'updated_at', 'validated_at',
            'import_batch', 'import_row',
        ]
        read_only_fields = ['uuid', 'numero_demande', 'created_at', 'updated_at', 'ra']

    def get_numero_chrono(self, obj):
        return _fmt_chrono(obj.numero_chrono)

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.nom} {obj.created_by.prenom}".strip() or obj.created_by.login
        return '—'

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.nom} {obj.validated_by.prenom}".strip() or obj.validated_by.login
        return '—'

    def get_denomination(self, obj):
        d = obj.donnees or {}
        if obj.type_entite == 'PH':
            return f"{d.get('nom', '')} {d.get('prenom', '')}".strip()
        return d.get('denomination', '')
