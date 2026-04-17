from rest_framework import serializers
from .models import CertificatGreffier


class CertificatGreffierSerializer(serializers.ModelSerializer):
    type_certificat_display = serializers.CharField(source='get_type_certificat_display', read_only=True)
    langue_display          = serializers.CharField(source='get_langue_display', read_only=True)
    delivre_par_nom         = serializers.SerializerMethodField()
    ra_denomination         = serializers.SerializerMethodField()
    ra_numero_rc            = serializers.SerializerMethodField()
    ra_type_entite          = serializers.SerializerMethodField()

    class Meta:
        model  = CertificatGreffier
        fields = [
            'id', 'numero', 'type_certificat', 'type_certificat_display',
            'langue', 'langue_display',
            'ra', 'ra_denomination', 'ra_numero_rc', 'ra_type_entite',
            'delivre_par', 'delivre_par_nom',
            'date_delivrance', 'observations',
        ]
        # langue est editable=False sur le modèle — on l'accepte à la création
        # uniquement via la vue (set explicitement), jamais en mise à jour.
        read_only_fields = ['id', 'numero', 'langue', 'date_delivrance', 'delivre_par']

    def get_delivre_par_nom(self, obj):
        u = obj.delivre_par
        return f"{u.prenom} {u.nom}".strip() if u else ''

    def get_ra_denomination(self, obj):
        ra = obj.ra
        if not ra:
            return '—'
        if ra.type_entite == 'PH' and ra.ph:
            return ra.ph.nom_complet or f"{ra.ph.nom} {ra.ph.prenom}".strip()
        if ra.type_entite == 'PM' and ra.pm:
            return ra.pm.denomination or '—'
        if ra.type_entite == 'SC' and ra.sc:
            return ra.sc.denomination or '—'
        return '—'

    def get_ra_numero_rc(self, obj):
        return (obj.ra.numero_rc or obj.ra.numero_ra or '—') if obj.ra else '—'

    def get_ra_type_entite(self, obj):
        return obj.ra.type_entite if obj.ra else ''
