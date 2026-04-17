# -*- coding: utf-8 -*-
"""
RCCM — Commande de contrôle pré-déploiement
============================================

Usage :
  python manage.py check_deploy              # Vérifie sans appliquer
  python manage.py check_deploy --apply      # Applique les migrations manquantes
  python manage.py check_deploy --apply --no-input  # Silencieux (CI/CD)

Étapes exécutées :
  1. Connexion à la base de données
  2. Vérification des migrations en attente
  3. Application des migrations si --apply
  4. Vérification Django system checks (rccm.E*, rccm.W*)
  5. Rapport final pass/fail

Code de sortie :
  0 = tout est OK
  1 = migrations en attente non corrigées (ou erreur)
"""

import sys
from io import StringIO

from django.core.management.base import BaseCommand
from django.core.management       import call_command
from django.db                    import connections
from django.db.migrations.executor import MigrationExecutor


class Command(BaseCommand):
    help = 'Vérifie la cohérence schéma/modèles avant déploiement RCCM.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action  = 'store_true',
            default = False,
            help    = 'Applique automatiquement les migrations manquantes.',
        )
        parser.add_argument(
            '--no-input',
            action  = 'store_true',
            default = False,
            dest    = 'no_input',
            help    = 'Mode silencieux (pas de confirmation interactive).',
        )

    def handle(self, *args, **options):
        apply    = options['apply']
        no_input = options['no_input']
        ok       = True

        self.stdout.write('\n')
        self.stdout.write(self.style.MIGRATE_HEADING(
            '══════════════════════════════════════════════════\n'
            '  RCCM — Contrôle pré-déploiement\n'
            '══════════════════════════════════════════════════\n'
            '  RÈGLE : Aucune recette ni démonstration sans\n'
            '          MIGRATIONS_OK confirmé par cet outil.\n'
            '══════════════════════════════════════════════════'
        ))
        self.stdout.write('\n')

        # ── Étape 1 : Connexion DB ────────────────────────────────────────────
        self.stdout.write('  1/4  Connexion à la base de données … ', ending='')
        try:
            conn = connections['default']
            conn.ensure_connection()
            self.stdout.write(self.style.SUCCESS('OK'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'ÉCHEC : {e}'))
            self.stderr.write(
                self.style.ERROR(
                    '\n⛔ Impossible de se connecter à la base de données.\n'
                    '   Vérifiez DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD dans .env\n'
                )
            )
            sys.exit(1)

        # ── Étape 2 : Migrations en attente ───────────────────────────────────
        self.stdout.write('  2/4  Vérification des migrations … ', ending='')
        executor = MigrationExecutor(conn)
        plan     = executor.migration_plan(executor.loader.graph.leaf_nodes())

        if not plan:
            self.stdout.write(self.style.SUCCESS('Toutes appliquées ✅'))
        else:
            pending = [f'{app}.{name}' for (app, name), _ in plan]
            self.stdout.write(
                self.style.WARNING(f'{len(pending)} migration(s) en attente ⚠')
            )
            for m in pending:
                self.stdout.write(f'       - {m}')

            if apply:
                self.stdout.write('\n  ↳ Application des migrations …')
                try:
                    call_command(
                        'migrate',
                        interactive = not no_input,
                        verbosity   = 1,
                        stdout      = self.stdout,
                        stderr      = self.stderr,
                    )
                    self.stdout.write(self.style.SUCCESS('  ↳ Migrations appliquées ✅'))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  ↳ ÉCHEC : {e}'))
                    ok = False
            else:
                self.stdout.write(
                    self.style.WARNING(
                        '\n  ↳ Utilisez --apply pour les appliquer.\n'
                        '    Commande : python manage.py check_deploy --apply\n'
                    )
                )
                ok = False

        # ── Étape 3 : Qualité des données — civilité PersonnePhysique ────────
        self.stdout.write('  3/4  Qualité données civilité … ', ending='')
        try:
            from apps.entites.models import PersonnePhysique
            total_ph   = PersonnePhysique.objects.count()
            sans_civ   = PersonnePhysique.objects.filter(civilite='').count()
            if total_ph > 0 and sans_civ > 0:
                pct = round(sans_civ * 100 / total_ph)
                self.stdout.write(
                    self.style.WARNING(
                        f'{sans_civ}/{total_ph} personnes sans civilité ({pct} %)'
                    )
                )
                self.stdout.write(
                    '       ↳ Ces personnes seront affichées sans préfixe (M./Mme/Mlle).\n'
                    '         La civilité sera requise à la prochaine modification.'
                )
            else:
                self.stdout.write(self.style.SUCCESS('OK ✅'))
        except Exception:
            self.stdout.write(self.style.WARNING('Non vérifiable (DB non migrée)'))

        # ── Étape 4 : Django system checks ───────────────────────────────────
        self.stdout.write('  4/4  Django system checks … ', ending='')
        buf = StringIO()
        try:
            call_command('check', stdout=buf, stderr=buf)
            output = buf.getvalue().strip()
            if 'SystemCheckError' in output or 'rccm.E' in output:
                self.stdout.write(self.style.ERROR('Erreurs détectées'))
                self.stdout.write(output)
                ok = False
            elif 'rccm.W' in output:
                self.stdout.write(self.style.WARNING('Avertissements (non bloquants)'))
                self.stdout.write(output)
            else:
                self.stdout.write(self.style.SUCCESS('OK ✅'))
        except SystemExit:
            output = buf.getvalue().strip()
            self.stdout.write(self.style.ERROR('Erreurs bloquantes'))
            self.stdout.write(output)
            ok = False

        # ── Étape 5 : Rapport final ───────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            '══════════════════════════════════════════════════'
        ))
        if ok:
            self.stdout.write(self.style.SUCCESS(
                '  ✅  RCCM — Système prêt pour le déploiement.\n'
            ))
            sys.exit(0)
        else:
            self.stderr.write(self.style.ERROR(
                '  ⛔  RCCM — Des problèmes bloquants ont été détectés.\n'
                '       Corrigez-les avant tout démarrage en production.\n'
            ))
            sys.exit(1)
