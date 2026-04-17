from rest_framework import serializers
from .models import Demande, LigneDemande


class LigneDemandeSerializer(serializers.ModelSerializer):
    type_doc_libelle = serializers.CharField(source='type_doc.libelle_fr', read_only=True)

    class Meta:
        model  = LigneDemande
        fields = ['id','demande','type_doc','type_doc_libelle','libelle','present','conforme','observations']


class DemandeListSerializer(serializers.ModelSerializer):
    type_demande_libelle = serializers.CharField(source='type_demande.libelle_fr', read_only=True)
    denomination         = serializers.SerializerMethodField()
    agent                = serializers.SerializerMethodField()

    class Meta:
        model  = Demande
        fields = [
            'id','uuid','numero_dmd','type_entite','statut','canal',
            'type_demande','type_demande_libelle',
            'denomination','date_demande','date_limite',
            'montant_paye','agent','created_at'
        ]

    def get_denomination(self, obj):
        if obj.type_entite == 'PH' and obj.ph: return obj.ph.nom_complet
        if obj.type_entite == 'PM' and obj.pm: return obj.pm.denomination
        if obj.type_entite == 'SC' and obj.sc: return obj.sc.denomination
        return ''

    def get_agent(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ''


class DemandeDetailSerializer(serializers.ModelSerializer):
    lignes               = LigneDemandeSerializer(many=True, read_only=True)
    type_demande_libelle = serializers.CharField(source='type_demande.libelle_fr', read_only=True)
    ra_numero            = serializers.CharField(source='ra.numero_ra', read_only=True)

    class Meta:
        model  = Demande
        fields = [
            'id','uuid','numero_dmd','type_demande','type_demande_libelle',
            'ra','ra_numero','type_entite','ph','pm','sc',
            'date_demande','date_limite','statut','motif_rejet','observations',
            'canal','montant_paye','reference_paiement',
            'lignes','created_at','updated_at','submitted_at','validated_at'
        ]
        read_only_fields = ['uuid','numero_dmd','created_at','updated_at']
