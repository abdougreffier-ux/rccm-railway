# -*- coding: utf-8 -*-
"""
RCCM — Django System Checks personnalisés
==========================================

Enregistre des vérifications qui s'exécutent lors de :
  • python manage.py check
  • python manage.py runserver  (avant le démarrage du serveur HTTP)
  • python manage.py migrate    (avant chaque migration)

Les checks de niveau Error bloquent l'exécution de la commande.
Les checks de niveau Warning l'autorisent avec un avertissement.

IDs réservés RCCM :
  rccm.E001  — migrations en attente (Error → bloquant hors commandes schema)
  rccm.W001  — clé secrète par défaut en production (Warning)
  rccm.W002  — DEBUG=True en production (Warning)
"""

import sys
from django.core.checks import register, Error, Warning, Tags


# Commandes qui gèrent elles-mêmes le schéma → on n'émet pas d'Error bloquante
_SCHEMA_COMMANDS = {
    'migrate', 'makemigrations', 'showmigrations', 'sqlmigrate',
    'squashmigrations',
}


@register(Tags.database)
def check_pending_migrations(app_configs, **kwargs):
    """
    rccm.E001 — Vérifie qu'il n'existe aucune migration en attente.

    Retourne une Error si des migrations ne sont pas appliquées,
    ce qui bloque `runserver` et signale le problème immédiatement.
    """
    errors = []

    # Pas d'erreur bloquante pour les commandes de gestion du schéma
    if len(sys.argv) > 1 and sys.argv[1] in _SCHEMA_COMMANDS:
        return errors

    try:
        from django.db import connections
        from django.db.migrations.executor import MigrationExecutor

        connection = connections['default']
        executor   = MigrationExecutor(connection)
        plan       = executor.migration_plan(executor.loader.graph.leaf_nodes())

        if plan:
            pending = [f'{app}.{name}' for (app, name), _ in plan]
            errors.append(Error(
                f'{len(pending)} migration(s) non appliquée(s) détectée(s).',
                hint=(
                    'Exécutez : python manage.py migrate\n'
                    '  Migrations manquantes :\n'
                    + '\n'.join(f'    - {m}' for m in pending)
                ),
                obj=None,
                id='rccm.E001',
            ))

    except Exception:
        # DB inaccessible au moment du check → on ne bloque pas
        pass

    return errors


@register()
def check_secret_key(app_configs, **kwargs):
    """rccm.W001 — Clé secrète par défaut détectée en production."""
    from django.conf import settings
    warnings = []
    if (
        not getattr(settings, 'DEBUG', True)
        and 'changez-cette-cle' in getattr(settings, 'SECRET_KEY', '')
    ):
        warnings.append(Warning(
            'La SECRET_KEY est la valeur par défaut non sécurisée.',
            hint='Définissez une clé aléatoire dans le fichier .env (SECRET_KEY=...).',
            id='rccm.W001',
        ))
    return warnings


@register()
def check_debug_production(app_configs, **kwargs):
    """rccm.W002 — DEBUG=True en production (ALLOWED_HOSTS configurés)."""
    from django.conf import settings
    warnings = []
    hosts = getattr(settings, 'ALLOWED_HOSTS', [])
    has_real_host = any(
        h not in ('localhost', '127.0.0.1', '') for h in hosts
    )
    if getattr(settings, 'DEBUG', False) and has_real_host:
        warnings.append(Warning(
            'DEBUG=True est activé alors que des hôtes de production sont configurés.',
            hint='Passez DEBUG=False dans .env pour les environnements de production.',
            id='rccm.W002',
        ))
    return warnings
