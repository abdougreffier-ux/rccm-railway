"""
apps.interop.permissions — Classes de permission pour les API inter-administrations

Ces classes s'utilisent avec ApiKeyAuthentication.
request.user est un SystemeExterne (pas un Utilisateur Django).
"""
from rest_framework.permissions import BasePermission


class EstSystemeExterneActif(BasePermission):
    """
    Accorde l'accès si l'authentification a produit un SystemeExterne actif.
    À combiner avec ApiKeyAuthentication.
    """
    message = "Accès réservé aux systèmes externes accrédités (clé API RCCM requise)."

    def has_permission(self, request, view):
        from apps.interop.models import SystemeExterne
        return (
            request.user is not None
            and isinstance(request.user, SystemeExterne)
            and request.user.actif
        )


class ALeScope(BasePermission):
    """
    Vérifie que la clé API de l'appelant possède le scope requis.

    Utilisation dans une vue :
        permission_classes = [EstSystemeExterneActif, ALeScope]
        scope_requis       = 'lecture_rc'   # attribut de classe

    La liste des scopes est lue depuis la clé API (request.auth.scopes).
    Si la clé n'a pas de scopes propres, on utilise les scopes du système.
    """
    scope_requis = None

    def has_permission(self, request, view):
        if not self.scope_requis:
            return True     # pas de scope requis → accès libre (rare)

        cle = request.auth    # CleAPIExterne
        if cle is None:
            return False

        # Scopes effectifs : ceux de la clé, ou à défaut ceux du système
        scopes_effectifs = cle.scopes or cle.systeme.scopes or []
        return self.scope_requis in scopes_effectifs


def scope_requis(scope):
    """Décorateur-factory pour créer une permission ALeScope dynamiquement."""
    return type(
        f'ALeScope_{scope}',
        (ALeScope,),
        {'scope_requis': scope, 'message': f"Scope requis : {scope!r}."},
    )


# ── Scopes prédéfinis ──────────────────────────────────────────────────────────
# Utiliser ces constantes dans les vues pour éviter les fautes de frappe.

SCOPE_LECTURE_RC          = 'lecture_rc'           # Consulter un RC par numéro
SCOPE_VERIFICATION_STATUT = 'verification_statut'  # Vérifier statut/existence
SCOPE_RECHERCHE_ENTITE    = 'recherche_entite'      # Rechercher par nom/NNI/IF
SCOPE_EXPORT_RELEVE       = 'export_releve'         # Accéder aux relevés mensuels
SCOPE_WEBHOOK_RECEPTION   = 'webhook_reception'     # Recevoir des notifications RCCM
