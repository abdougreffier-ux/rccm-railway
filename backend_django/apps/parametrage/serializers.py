from rest_framework import serializers
from .models import (
    Nationalite, FormeJuridique, DomaineActivite, Fonction,
    TypeDocument, TypeDemande, Localite, Tarif, Signataire,
)


class NationaliteSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = Nationalite
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'actif']


class FormeJuridiqueSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = FormeJuridique
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'type_entite', 'actif']


class DomaineActiviteSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = DomaineActivite
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'actif']


class FonctionSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = Fonction
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'type_entite', 'actif']


class TypeDocumentSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = TypeDocument
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'type_demande', 'obligatoire', 'actif']


class TypeDemandeSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = TypeDemande
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'type_entite', 'delai_traitement', 'actif']


class LocaliteSerializer(serializers.ModelSerializer):
    libelle = serializers.CharField(source='libelle_fr', read_only=True)

    class Meta:
        model  = Localite
        fields = ['id', 'code', 'libelle', 'libelle_fr', 'libelle_ar', 'type', 'parent', 'actif']


class TarifSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tarif
        fields = ['id', 'code', 'libelle_fr', 'type_demande', 'montant', 'devise', 'date_effet', 'date_fin', 'actif']


class SignataireSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Signataire
        fields = ['id', 'nom', 'nom_ar', 'qualite', 'qualite_ar', 'actif', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']
