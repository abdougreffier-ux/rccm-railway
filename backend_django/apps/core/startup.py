# -*- coding: utf-8 -*-
"""
RCCM — Contrôle de cohérence schéma/modèles au démarrage
=========================================================

Ce module est appelé depuis CoreConfig.ready().
Il vérifie si des migrations Django sont en attente d'application
et positionne le flag _MIGRATIONS_OK utilisé par MigrationGuardMiddleware.

Règle RCCM : un serveur dont le schéma DB est désynchronisé avec les modèles
NE DOIT PAS accepter de requêtes API — risque de perte de données ou d'erreurs
silencieuses (exemple : colonne manquante → HTTP 500 affiché comme « Aucune donnée »).
"""

import sys
import logging

logger = logging.getLogger('rccm.startup')

# ── Flag global — partagé avec le middleware ──────────────────────────────────
# True  = schéma cohérent, toutes les migrations sont appliquées
# False = migrations en attente → API bloquée (HTTP 503)
_MIGRATIONS_OK: bool = True          # fail-open par défaut (sécurité CI)
_PENDING_MIGRATIONS: list[str] = []  # liste des migrations manquantes


# Commandes Django qui modifient elles-mêmes le schéma — on ne bloque pas
# leur exécution, sinon migrate serait impossible à lancer.
_SCHEMA_COMMANDS = {
    'migrate', 'makemigrations', 'showmigrations', 'sqlmigrate',
    'squashmigrations', 'check', 'test', 'collectstatic', 'shell',
}


def check_migrations_on_startup() -> None:
    """
    Vérifie les migrations en attente et met à jour _MIGRATIONS_OK.
    À appeler depuis CoreConfig.ready() UNIQUEMENT.
    """
    global _MIGRATIONS_OK, _PENDING_MIGRATIONS

    # Ne pas bloquer les commandes de gestion du schéma elles-mêmes
    if len(sys.argv) > 1 and sys.argv[1] in _SCHEMA_COMMANDS:
        _MIGRATIONS_OK = True
        return

    try:
        from django.db import connections
        from django.db.migrations.executor import MigrationExecutor

        connection = connections['default']
        executor   = MigrationExecutor(connection)
        plan       = executor.migration_plan(executor.loader.graph.leaf_nodes())

        if plan:
            _PENDING_MIGRATIONS = [f'{app}.{name}' for (app, name), _ in plan]
            _MIGRATIONS_OK      = False

            logger.critical(
                '\n'
                '╔══════════════════════════════════════════════════════════════╗\n'
                '║  ⛔  RCCM — MIGRATIONS EN ATTENTE — SYSTÈME BLOQUÉ          ║\n'
                '╠══════════════════════════════════════════════════════════════╣\n'
                '║  %d migration(s) non appliquée(s) :                         ║\n'
                '%s'
                '╠══════════════════════════════════════════════════════════════╣\n'
                '║  → Toutes les requêtes /api/* retourneront HTTP 503         ║\n'
                '║  → CORRECTION : python manage.py migrate                    ║\n'
                '╚══════════════════════════════════════════════════════════════╝',
                len(_PENDING_MIGRATIONS),
                ''.join(f'║    - {m:<56}║\n' for m in _PENDING_MIGRATIONS[:10]),
            )
        else:
            _MIGRATIONS_OK      = True
            _PENDING_MIGRATIONS = []
            logger.info(
                'RCCM — Schéma DB cohérent ✅  '
                'Toutes les migrations sont appliquées.'
            )

    except Exception as exc:  # noqa: BLE001
        # Si la DB n'est pas encore accessible (premier démarrage avant
        # toute migration), on ne bloque pas — migrate doit pouvoir s'exécuter.
        _MIGRATIONS_OK = True
        logger.warning(
            'RCCM — Impossible de vérifier les migrations au démarrage '
            '(DB inaccessible ?) : %s', exc
        )


def is_schema_ok() -> bool:
    """Retourne True si le schéma est cohérent avec les modèles."""
    return _MIGRATIONS_OK


def get_pending_migrations() -> list[str]:
    """Retourne la liste des migrations en attente (pour les messages d'erreur)."""
    return list(_PENDING_MIGRATIONS)
