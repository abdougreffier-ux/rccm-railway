"""
apps.interop.authentication — Authentification par clé API pour les systèmes externes

Utilisation :
  Les endpoints inter-administrations et Registre Central déclarent :

    authentication_classes = [ApiKeyAuthentication]
    permission_classes     = [EstSystemeExterneActif]

  L'appelant transmet sa clé via l'en-tête HTTP :
    X-RCCM-API-Key: <cle_brute>

  La clé brute est hachée (SHA-256) et comparée au stockage ; jamais stockée
  en clair dans la base de données.

Objet retourné par authenticate() :
  (SystemeExterne, CleAPIExterne) — request.user = SystemeExterne,
                                     request.auth = CleAPIExterne.
"""
import hashlib
import time
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils import timezone


class ApiKeyAuthentication(BaseAuthentication):
    """
    Authentification par clé API pour les API inter-administrations RCCM.

    En-tête attendu : X-RCCM-API-Key: <clé_brute>

    Comportement :
      - Absence de l'en-tête → retourne None (DRF passe à la classe suivante)
      - Clé présente mais invalide → AuthenticationFailed (HTTP 401)
      - Clé valide mais système inactif → AuthenticationFailed (HTTP 401)
      - Clé expirée → AuthenticationFailed (HTTP 401)
    """
    HEADER_NAME = 'HTTP_X_RCCM_API_KEY'

    def authenticate(self, request):
        raw_key = request.META.get(self.HEADER_NAME, '').strip()
        if not raw_key:
            return None     # pas de clé → DRF essaie la classe suivante (JWT)

        start = time.monotonic()

        # Hachage constant en temps (protection timing attack)
        key_hash = hashlib.sha256(raw_key.encode('utf-8')).hexdigest()

        try:
            from apps.interop.models import CleAPIExterne
            cle = (
                CleAPIExterne.objects
                .select_related('systeme')
                .get(cle_hachee=key_hash)
            )
        except CleAPIExterne.DoesNotExist:
            raise AuthenticationFailed(
                'Clé API RCCM invalide. '
                'Contactez le greffe pour obtenir une clé valide.'
            )

        if not cle.systeme.actif:
            raise AuthenticationFailed(
                f'Système {cle.systeme.code!r} désactivé — accès interdit.'
            )

        if not cle.actif:
            raise AuthenticationFailed(
                'Cette clé API a été désactivée. Contactez le greffe.'
            )

        if cle.date_expiration and cle.date_expiration < timezone.now():
            raise AuthenticationFailed(
                f'Clé API expirée le {cle.date_expiration:%d/%m/%Y}. '
                'Contactez le greffe pour renouveler votre clé.'
            )

        # Mise à jour asynchrone (non bloquante) de la dernière utilisation
        CleAPIExterne.objects.filter(pk=cle.pk).update(
            derniere_utilisation=timezone.now(),
            nb_appels_total=cle.nb_appels_total + 1,
        )

        # request.user  = SystemeExterne (objet non-Utilisateur)
        # request.auth  = CleAPIExterne
        return (cle.systeme, cle)

    def authenticate_header(self, request):
        """Valeur du header WWW-Authenticate en cas de 401."""
        return 'X-RCCM-API-Key realm="RCCM-API"'
