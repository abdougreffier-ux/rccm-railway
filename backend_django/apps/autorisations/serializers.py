from rest_framework import serializers
from django.utils import timezone
from .models import DemandeAutorisation


class DemandeAutorisationSerializer(serializers.ModelSerializer):
    """Sérialiseur complet — utilisé pour les réponses détaillées et la liste."""

    demandeur_nom  = serializers.SerializerMethodField()
    decideur_nom   = serializers.SerializerMethodField()
    est_valide     = serializers.SerializerMethodField()
    minutes_restantes = serializers.SerializerMethodField()

    class Meta:
        model  = DemandeAutorisation
        fields = [
            'id',
            'type_demande', 'type_dossier', 'dossier_id', 'document_type',
            'motif',
            'statut', 'motif_decision',
            'demandeur', 'demandeur_nom',
            'decideur',  'decideur_nom',
            'date_demande', 'date_decision', 'date_expiration',
            'est_valide', 'minutes_restantes',
        ]
        read_only_fields = [
            'id', 'statut', 'motif_decision',
            'demandeur', 'demandeur_nom',
            'decideur',  'decideur_nom',
            'date_demande', 'date_decision', 'date_expiration',
            'est_valide', 'minutes_restantes',
        ]

    def get_demandeur_nom(self, obj):
        u = obj.demandeur
        return f"{getattr(u, 'prenom', '') or ''} {getattr(u, 'nom', '') or ''}".strip() \
               or getattr(u, 'login', None) or getattr(u, 'username', '') or str(u)

    def get_decideur_nom(self, obj):
        if not obj.decideur:
            return None
        u = obj.decideur
        return f"{getattr(u, 'prenom', '') or ''} {getattr(u, 'nom', '') or ''}".strip() \
               or getattr(u, 'login', None) or getattr(u, 'username', '') or str(u)

    def get_est_valide(self, obj):
        return obj.est_valide

    def get_minutes_restantes(self, obj):
        """Retourne le nombre de minutes restantes avant expiration (ou None)."""
        if obj.statut != 'AUTORISEE' or not obj.date_expiration:
            return None
        delta = obj.date_expiration - timezone.now()
        mins = int(delta.total_seconds() / 60)
        return max(mins, 0)


class DemandeAutorisationCreateSerializer(serializers.ModelSerializer):
    """Sérialiseur de création — l'agent fournit uniquement les champs métier."""

    class Meta:
        model  = DemandeAutorisation
        fields = [
            'type_demande', 'type_dossier', 'dossier_id', 'document_type', 'motif',
        ]

    def validate(self, data):
        type_demande = data.get('type_demande')

        # Pour IMPRESSION spécifique, document_type obligatoire
        if type_demande == 'IMPRESSION' and not data.get('document_type'):
            raise serializers.ValidationError(
                {'document_type': 'Le type de document est obligatoire pour une demande d\'impression.'}
            )

        # Pour CORRECTION et IMPRESSION_GLOBALE, document_type non pertinent
        if type_demande in ('CORRECTION', 'IMPRESSION_GLOBALE'):
            data['document_type'] = ''

        # Pour IMPRESSION_GLOBALE : aucun dossier précis → dossier_id=0 (sentinelle)
        if type_demande == 'IMPRESSION_GLOBALE':
            data['dossier_id'] = 0

        return data


class DecisionSerializer(serializers.Serializer):
    """Payload de décision (autoriser / refuser) envoyé par le greffier."""
    motif_decision = serializers.CharField(
        allow_blank=True, default='',
        help_text='Commentaire optionnel du greffier',
    )
