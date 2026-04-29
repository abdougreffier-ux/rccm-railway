"""
apps.interop.throttling — Limiteurs de débit pour l'API inter-administrations

Protège le RCCM contre les abus (flooding, scraping).
Chaque système externe a un quota distinct.

Quotas par défaut :
  - Systèmes standard    : 200 req / heure
  - Systèmes prioritaires: 1000 req / heure (REGISTRE_CENTRAL, KHIDMATY)
  - Vérification publique: 60 req / minute (endpoint sans auth)

Configuration dans settings.py :
    REST_FRAMEWORK = {
        ...
        'DEFAULT_THROTTLE_CLASSES': [
            'apps.interop.throttling.ApiKeyThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': {
            'interop_standard':   '200/hour',
            'interop_prioritaire':'1000/hour',
            'public_verification':'60/min',
        },
    }
"""
from rest_framework.throttling import SimpleRateThrottle


SYSTEMES_PRIORITAIRES = {'REGISTRE_CENTRAL', 'KHIDMATY', 'APIM'}


class ApiKeyThrottle(SimpleRateThrottle):
    """
    Limite par clé API : le cache key est le préfixe de la clé.
    Les systèmes prioritaires ont un quota supérieur.
    """

    def get_cache_key(self, request, view):
        from apps.interop.models import SystemeExterne
        if not isinstance(request.user, SystemeExterne):
            return None     # pas un appel inter-admin → pas de throttle ici
        cle = request.auth
        return f'throttle_apikey_{cle.prefixe}' if cle else None

    def get_rate(self):
        # La classe de rate est déterminée par le type de système
        # Appelé avant que request soit disponible — on retourne le taux par défaut.
        # Le taux réel est surchargé dans allow_request() si nécessaire.
        return self.THROTTLE_RATES.get('interop_standard', '200/hour')

    def allow_request(self, request, view):
        from apps.interop.models import SystemeExterne
        if not isinstance(request.user, SystemeExterne):
            return True
        # Choisir le taux selon le type de système
        if request.user.code in SYSTEMES_PRIORITAIRES:
            self.rate = self.THROTTLE_RATES.get('interop_prioritaire', '1000/hour')
        else:
            self.rate = self.THROTTLE_RATES.get('interop_standard', '200/hour')
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)
