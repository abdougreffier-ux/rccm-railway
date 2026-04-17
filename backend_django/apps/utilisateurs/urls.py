from django.urls import path
from .views import (
    UtilisateurListCreateView, UtilisateurDetailView,
    ActiverUtilisateurView, DesactiverUtilisateurView,
    ResetPasswordView, RoleListView
)

urlpatterns = [
    path('',              UtilisateurListCreateView.as_view(), name='utilisateurs'),
    path('roles/',        RoleListView.as_view(),              name='roles'),
    path('<int:pk>/',     UtilisateurDetailView.as_view(),     name='utilisateur-detail'),
    path('<int:pk>/activer/',       ActiverUtilisateurView.as_view(),    name='activer'),
    path('<int:pk>/desactiver/',    DesactiverUtilisateurView.as_view(), name='desactiver'),
    path('<int:pk>/reset-password/', ResetPasswordView.as_view(),        name='reset-password'),
]
