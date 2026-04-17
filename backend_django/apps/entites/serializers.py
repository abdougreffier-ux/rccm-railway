from rest_framework import serializers
from .models import PersonnePhysique, PersonneMorale, Succursale


class PersonnePhysiqueSerializer(serializers.ModelSerializer):
    nationalite_libelle = serializers.CharField(source='nationalite.libelle_fr', read_only=True)
    localite_libelle    = serializers.CharField(source='localite.libelle_fr',    read_only=True)
    nom_complet         = serializers.SerializerMethodField()

    class Meta:
        model  = PersonnePhysique
        fields = [
            'id','uuid','nni','civilite','nom','prenom','nom_ar','prenom_ar','nom_complet',
            'date_naissance','lieu_naissance','sexe',
            'nationalite','nationalite_libelle',
            'adresse','adresse_ar','ville','localite','localite_libelle',
            'telephone','email','profession','situation_matrimoniale',
            'nom_pere','nom_mere','num_passeport','num_carte_identite',
            'created_at','updated_at'
        ]
        read_only_fields = ['uuid','created_at','updated_at']

    def get_nom_complet(self, obj):
        return obj.nom_complet


class PersonneMoraleSerializer(serializers.ModelSerializer):
    forme_juridique_libelle = serializers.CharField(source='forme_juridique.libelle_fr', read_only=True)
    forme_juridique_code    = serializers.CharField(source='forme_juridique.code',       read_only=True)
    localite_libelle        = serializers.CharField(source='localite.libelle_fr',        read_only=True)

    class Meta:
        model  = PersonneMorale
        fields = [
            'id','uuid','denomination','denomination_ar','sigle',
            'forme_juridique','forme_juridique_libelle','forme_juridique_code',
            'capital_social','devise_capital','duree_societe',
            'date_constitution','date_ag',
            'siege_social','siege_social_ar','ville','localite','localite_libelle',
            'telephone','fax','email','site_web','bp','nb_associes',
            'created_at','updated_at'
        ]
        read_only_fields = ['uuid','created_at','updated_at']


class SuccursaleSerializer(serializers.ModelSerializer):
    pm_mere_denomination = serializers.CharField(source='pm_mere.denomination', read_only=True)
    localite_libelle     = serializers.CharField(source='localite.libelle_fr',  read_only=True)

    class Meta:
        model  = Succursale
        fields = [
            'id','uuid','pm_mere','pm_mere_denomination',
            'denomination','denomination_ar','pays_origine',
            'capital_affecte','devise',
            'siege_social','ville','localite','localite_libelle',
            'telephone','email',
            'created_at','updated_at'
        ]
        read_only_fields = ['uuid','created_at','updated_at']
