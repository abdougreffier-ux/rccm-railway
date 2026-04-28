"""
Système de permissions basé sur les rôles — RCCM
=================================================

Rôles définis dans le cahier des charges :
  GREFFIER        : autorité centrale, accès complet
  AGENT_TRIBUNAL  : agent du tribunal, accès à tous les modules métier (ses dossiers uniquement)
  AGENT_GU        : agent du guichet unique, création RC (immatriculation uniquement)

Usage dans les vues DRF :
    from apps.core.permissions import EstGreffier, EstAgentOuGreffier, est_greffier

    class MaVue(APIView):
        permission_classes = [EstGreffier]          # greffier seulement
        permission_classes = [EstAgentOuGreffier]   # tout le personnel
"""

from rest_framework.permissions import BasePermission

# ── Constantes des codes de rôle ──────────────────────────────────────────────
ROLE_GREFFIER        = 'GREFFIER'
ROLE_AGENT_GU        = 'AGENT_GU'
ROLE_AGENT_TRIBUNAL  = 'AGENT_TRIBUNAL'
ROLES_AGENTS         = (ROLE_AGENT_GU, ROLE_AGENT_TRIBUNAL)


# ── Fonctions utilitaires ─────────────────────────────────────────────────────

def get_role(user):
    """
    Retourne le code de rôle de l'utilisateur.
    Les superusers Django (is_superuser=True) sont traités comme des greffiers :
    ils ont accès à toutes les fonctionnalités.
    """
    if not (user and user.is_authenticated):
        return None
    if getattr(user, 'is_superuser', False):
        return ROLE_GREFFIER
    return user.role_code


def est_greffier(user):
    """True si l'utilisateur est un greffier."""
    return get_role(user) == ROLE_GREFFIER


def est_agent(user):
    """True si l'utilisateur est un agent (GU ou Tribunal)."""
    return get_role(user) in ROLES_AGENTS


def est_agent_gu(user):
    """True si l'utilisateur est un agent du guichet unique."""
    return get_role(user) == ROLE_AGENT_GU


def est_agent_tribunal(user):
    """True si l'utilisateur est un agent du tribunal."""
    return get_role(user) == ROLE_AGENT_TRIBUNAL


def filtrer_par_auteur(queryset, user):
    """
    Si l'utilisateur est un agent, filtre le queryset par created_by.
    Si c'est le greffier, retourne tout le queryset sans filtre.
    """
    if not est_greffier(user):
        return queryset.filter(created_by=user)
    return queryset


# ── Classes de permission DRF ─────────────────────────────────────────────────

class EstGreffier(BasePermission):
    """Accès réservé exclusivement au greffier."""
    message = 'Accès réservé au greffier.'

    def has_permission(self, request, view):
        return est_greffier(request.user)


class EstAgent(BasePermission):
    """Accès réservé aux agents (GU ou Tribunal)."""
    message = 'Accès réservé aux agents.'

    def has_permission(self, request, view):
        return est_agent(request.user)


class EstAgentOuGreffier(BasePermission):
    """Accès réservé à tout le personnel RCCM (agents + greffier)."""
    message = 'Accès réservé au personnel du RCCM (connexion requise).'

    def has_permission(self, request, view):
        return est_greffier(request.user) or est_agent(request.user)


class EstAgentTribunalOuGreffier(BasePermission):
    """Accès réservé aux agents du tribunal et au greffier (pas au GU)."""
    message = 'Accès réservé aux agents du tribunal et au greffier.'

    def has_permission(self, request, view):
        return get_role(request.user) in (ROLE_GREFFIER, ROLE_AGENT_TRIBUNAL)


def get_authorized_ra_ids(user):
    """
    Retourne la liste des PK de RegistreAnalytique pour lesquels l'agent
    possède une autorisation active :
      • CORRECTION : permanente (pas d'expiration)
      • IMPRESSION  : non expirée (expiration dans date_expiration)

    Import de DemandeAutorisation fait en différé pour éviter les imports
    circulaires (apps.autorisations ← apps.core ← apps.registres).

    Retourne une liste vide pour le greffier (inutile — il voit tout).
    """
    if est_greffier(user):
        return []
    from apps.autorisations.models import DemandeAutorisation
    from django.db.models import Q
    from django.utils import timezone as _tz
    now = _tz.now()
    return list(
        DemandeAutorisation.objects.filter(
            demandeur=user,
            type_dossier='RA',
            statut='AUTORISEE',
        ).filter(
            Q(type_demande='CORRECTION') |
            Q(type_demande='IMPRESSION', date_expiration__gt=now)
        ).values_list('dossier_id', flat=True)
    )


class LectureAgentModifGreffier(BasePermission):
    """
    Lecture autorisée pour tout le personnel (données de référence = listes déroulantes).
    Modification (POST/PUT/PATCH/DELETE) réservée au greffier (paramétrage).
    CDC §3.2 : agents — pas de modification des paramètres.
    """
    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')
    message = 'Modification des paramètres réservée au greffier.'

    def has_permission(self, request, view):
        role = get_role(request.user)
        if role is None:
            return False
        if request.method in self.SAFE_METHODS:
            # Tout le personnel peut lire les données de référence
            return role in (ROLE_GREFFIER, ROLE_AGENT_GU, ROLE_AGENT_TRIBUNAL)
        # Écritures réservées au greffier
        return role == ROLE_GREFFIER
