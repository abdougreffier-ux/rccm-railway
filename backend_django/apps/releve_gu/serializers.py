from rest_framework import serializers
from .models import ReleveGuichetUnique


class ReleveGUListSerializer(serializers.ModelSerializer):
    genere_par_login   = serializers.CharField(
        source='genere_par.login', read_only=True, default='—',
    )
    finalise_par_login = serializers.CharField(
        source='finalise_par.login', read_only=True, default='—',
    )

    class Meta:
        model  = ReleveGuichetUnique
        fields = [
            'id', 'annee', 'mois', 'statut',
            'nb_ph', 'nb_pm', 'nb_sc', 'nb_total',
            'genere_le', 'genere_par_login',
            'finalise_le', 'finalise_par_login',
        ]


class ReleveGUDetailSerializer(serializers.ModelSerializer):
    genere_par_login   = serializers.CharField(
        source='genere_par.login', read_only=True, default='—',
    )
    finalise_par_login = serializers.CharField(
        source='finalise_par.login', read_only=True, default='—',
    )

    class Meta:
        model  = ReleveGuichetUnique
        fields = [
            'id', 'annee', 'mois', 'statut',
            'nb_ph', 'nb_pm', 'nb_sc', 'nb_total',
            'contenu_json',
            'genere_le', 'genere_par_login',
            'finalise_le', 'finalise_par_login',
        ]
