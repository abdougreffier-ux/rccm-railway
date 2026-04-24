# -*- coding: utf-8 -*-
"""
RCCM — MigrationGuardMiddleware
================================

Bloque TOUTES les requêtes /api/* avec HTTP 503 si des migrations Django
sont en attente d'application au moment du démarrage du serveur.

Comportement :
  • Le flag _MIGRATIONS_OK est positionné une seule fois dans CoreConfig.ready()
    via apps.core.startup.check_migrations_on_startup().
  • Le middleware lit ce flag à chaque requête (lecture mémoire — coût nul).
  • HTTP 503 retourne un JSON bilingue FR/AR avec le code MIGRATIONS_PENDING
    et la commande de correction.
  • Les requêtes non-API (frontend statique, admin Django) ne sont PAS bloquées
    pour permettre le diagnostic via l'interface d'administration si nécessaire.

Placement dans MIDDLEWARE : juste après WhiteNoiseMiddleware et SessionMiddleware,
AVANT CorsMiddleware pour que le 503 soit renvoyé avec les bons headers CORS.
"""

import json
from django.http import HttpResponse


class MigrationGuardMiddleware:
    """
    Retourne HTTP 503 avec body JSON bilingue pour toute requête /api/*
    si le schéma de la base de données est désynchronisé avec les modèles.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    # Routes publiques exemptées du garde — accessibles même si migrations en attente.
    # /api/health/   : sonde Railway + frontend — DOIT toujours retourner 200.
    # /api/verifier/ : QR codes publics scannés par des tiers.
    _EXEMPT_PATHS = ('/api/health/', '/api/verifier/')

    def __call__(self, request):
        # Vérification uniquement sur les routes API (hors routes publiques exemptées)
        if request.path.startswith('/api/') and not any(
            request.path.startswith(p) for p in self._EXEMPT_PATHS
        ):
            from apps.core.startup import is_schema_ok, get_pending_migrations

            if not is_schema_ok():
                pending = get_pending_migrations()
                body = {
                    'detail': (
                        'Le système RCCM est temporairement indisponible. '
                        'Des migrations de base de données doivent être appliquées '
                        'avant toute utilisation. '
                        'Contactez immédiatement l\'administrateur.'
                    ),
                    'detail_ar': (
                        'نظام السجل التجاري والصناعي غير متاح مؤقتاً. '
                        'يجب تطبيق ترحيلات قاعدة البيانات قبل أي استخدام. '
                        'يُرجى الاتصال فوراً بالمسؤول.'
                    ),
                    'code':    'MIGRATIONS_PENDING',
                    'hint':    'python manage.py migrate',
                    'pending': pending[:10],  # max 10 pour ne pas surcharger la réponse
                }
                return HttpResponse(
                    content      = json.dumps(body, ensure_ascii=False),
                    content_type = 'application/json; charset=utf-8',
                    status       = 503,
                    headers      = {
                        'Retry-After':                 '60',
                        'X-RCCM-Schema-Status':        'MIGRATIONS_PENDING',
                        'X-RCCM-Pending-Migrations':   str(len(pending)),
                    },
                )

        return self.get_response(request)
