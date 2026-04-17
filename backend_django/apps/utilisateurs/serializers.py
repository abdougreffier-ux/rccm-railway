from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from .models import Role, Permission, Poste

User = get_user_model()


# ── Helpers pour les superusers ───────────────────────────────────────────────

def _effective_role_code(user):
    """
    Retourne le code de rôle effectif.
    Les superusers Django sont traités comme des greffiers (accès complet).
    """
    if user.is_superuser:
        return 'GREFFIER'
    return user.role.code if user.role else None


def _effective_role_libelle(user):
    """Retourne le libellé du rôle effectif."""
    if user.is_superuser and not user.role:
        return 'Greffier (superuser)'
    return user.role.libelle if user.role else None


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'login'

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['login']        = user.login
        token['nom']          = user.get_full_name()
        token['role_code']    = _effective_role_code(user)
        token['is_superuser'] = user.is_superuser
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        # Mettre à jour dernière connexion
        from django.utils import timezone
        user.derniere_cnx = timezone.now()
        user.save(update_fields=['derniere_cnx'])

        role_code    = _effective_role_code(user)
        role_libelle = _effective_role_libelle(user)

        data['user'] = {
            'id':           user.id,
            'nom':          user.nom,
            'prenom':       user.prenom,
            'login':        user.login,
            'email':        user.email,
            'is_superuser': user.is_superuser,
            'role': {
                'code':       role_code,
                'libelle':    role_libelle,
                'libelle_ar': user.role.libelle_ar if user.role else None,
            }
        }
        return data


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Role
        fields = ['id', 'code', 'libelle', 'libelle_ar', 'description', 'actif']


class PosteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Poste
        fields = ['id', 'code', 'libelle_fr', 'libelle_ar', 'actif']


class UtilisateurListSerializer(serializers.ModelSerializer):
    role_libelle    = serializers.CharField(source='role.libelle',     read_only=True)
    poste_libelle   = serializers.CharField(source='poste.libelle_fr', read_only=True)
    localite_libelle = serializers.CharField(source='localite.libelle_fr', read_only=True)

    class Meta:
        model  = User
        fields = [
            'id','uuid','matricule','nom','prenom','login','email','telephone',
            'role','role_libelle','poste','poste_libelle','localite','localite_libelle',
            'actif','derniere_cnx','created_at'
        ]
        read_only_fields = ['uuid','created_at']


class UtilisateurCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model  = User
        fields = ['nom','prenom','login','email','telephone','password','role','poste','localite','matricule']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user     = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UtilisateurUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['nom','prenom','email','telephone','role','poste','localite','matricule']


class MeSerializer(serializers.ModelSerializer):
    role         = serializers.SerializerMethodField()
    poste        = PosteSerializer(read_only=True)
    localite     = serializers.StringRelatedField()
    is_superuser = serializers.BooleanField(read_only=True)

    class Meta:
        model  = User
        fields = ['id','uuid','matricule','nom','prenom','login','email','telephone',
                  'role','poste','localite','derniere_cnx','is_superuser']

    def get_role(self, user):
        """Retourne le rôle effectif (superuser → GREFFIER)."""
        return {
            'code':       _effective_role_code(user),
            'libelle':    _effective_role_libelle(user),
            'libelle_ar': user.role.libelle_ar if user.role else None,
        }


class ChangePasswordSerializer(serializers.Serializer):
    ancien_mdp  = serializers.CharField(required=True)
    nouveau_mdp = serializers.CharField(required=True, min_length=8)
