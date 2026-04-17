from django.contrib.auth import get_user_model
from rest_framework import generics, status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (
    CustomTokenObtainPairSerializer, UtilisateurListSerializer,
    UtilisateurCreateSerializer, UtilisateurUpdateSerializer,
    MeSerializer, ChangePasswordSerializer, RoleSerializer
)
from .models import Role
from apps.core.permissions import EstGreffier, EstAgentOuGreffier

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """Déconnexion — accessible à tous les utilisateurs authentifiés."""

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        return Response({'message': 'Déconnexion réussie.'})


class MeView(generics.RetrieveAPIView):
    """Profil de l'utilisateur connecté — accessible à tous les rôles."""
    permission_classes = [EstAgentOuGreffier]
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """Changement de mot de passe — accessible à tous les rôles."""
    permission_classes = [EstAgentOuGreffier]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(ser.validated_data['ancien_mdp']):
            return Response({'detail': 'Ancien mot de passe incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(ser.validated_data['nouveau_mdp'])
        user.save()
        return Response({'message': 'Mot de passe modifié avec succès.'})


class UtilisateurListCreateView(generics.ListCreateAPIView):
    """Administration des utilisateurs — réservée au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]
    queryset = User.objects.select_related('role', 'poste', 'localite').all()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UtilisateurCreateSerializer
        return UtilisateurListSerializer

    def perform_create(self, serializer):
        serializer.save()


class UtilisateurDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Administration des utilisateurs — réservée au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]
    queryset = User.objects.select_related('role', 'poste', 'localite').all()

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return UtilisateurUpdateSerializer
        return UtilisateurListSerializer


class ActiverUtilisateurView(APIView):
    """Activation d'un utilisateur — réservée au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        user = generics.get_object_or_404(User, pk=pk)
        user.actif = True
        user.save(update_fields=['actif'])
        return Response({'message': 'Utilisateur activé.'})


class DesactiverUtilisateurView(APIView):
    """Désactivation d'un utilisateur — réservée au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        user = generics.get_object_or_404(User, pk=pk)
        user.actif = False
        user.save(update_fields=['actif'])
        return Response({'message': 'Utilisateur désactivé.'})


class ResetPasswordView(APIView):
    """Réinitialisation du mot de passe — réservée au greffier (CDC §3.3)."""
    permission_classes = [EstGreffier]

    def patch(self, request, pk):
        user = generics.get_object_or_404(User, pk=pk)
        nouveau_mdp = request.data.get('nouveau_mdp', 'Changez@2024!')
        user.set_password(nouveau_mdp)
        user.save()
        return Response({'message': 'Mot de passe réinitialisé.'})


class RoleListView(generics.ListAPIView):
    """Liste des rôles — réservée au greffier pour l'administration (CDC §3.3)."""
    permission_classes = [EstGreffier]
    queryset         = Role.objects.filter(actif=True)
    serializer_class = RoleSerializer
