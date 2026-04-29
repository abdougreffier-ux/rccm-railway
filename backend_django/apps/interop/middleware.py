"""
apps.interop.middleware — Middleware de journalisation des appels inter-administrations

Intercepte tous les appels aux endpoints /api/v1/interop/* et /api/v1/rc/
pour créer une entrée dans JournalAppelExterne.

Ce middleware est NON BLOQUANT : si la journalisation échoue, la requête
est traitée normalement (aucune dépendance bloquante sur la traçabilité).
"""
import time
from django.utils.functional import SimpleLazyObject


PREFIXES_JOURNALISES = (
    '/api/v1/interop/',
    '/api/v1/rc/',
    '/api/v1/releve/',
)


class InteropJournalMiddleware:
    """
    Journalise les appels entrants sur les endpoints inter-administrations.
    Doit être ajouté après AuthenticationMiddleware dans MIDDLEWARE.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        if not any(path.startswith(p) for p in PREFIXES_JOURNALISES):
            return self.get_response(request)

        start = time.monotonic()
        response = self.get_response(request)
        duree_ms = int((time.monotonic() - start) * 1000)

        # Journalisation non bloquante
        try:
            self._journaliser(request, response, duree_ms)
        except Exception:
            pass    # ne jamais bloquer une réponse pour un échec de log

        return response

    def _journaliser(self, request, response, duree_ms):
        from apps.interop.models import SystemeExterne, JournalAppelExterne, CleAPIExterne

        systeme = None
        cle     = None
        if isinstance(request.user, SystemeExterne):
            systeme = request.user
            if isinstance(request.auth, CleAPIExterne):
                cle = request.auth

        # Ne conserver que les paramètres non sensibles
        params = {k: v for k, v in request.GET.items() if k not in ('api_key',)}

        JournalAppelExterne.objects.create(
            systeme=systeme,
            cle=cle,
            methode=request.method,
            endpoint=request.path_info[:500],
            ip_appelant=self._get_ip(request),
            statut_http=response.status_code,
            duree_ms=duree_ms,
            parametres=params,
            erreur=getattr(response, 'data', {}).get('detail', '') if response.status_code >= 400 else '',
        )

    @staticmethod
    def _get_ip(request):
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if xff:
            return xff.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
