"""
Commande Django : seed_users
=============================
Crée les utilisateurs initiaux du système RCCM s'ils n'existent pas encore.
Utilise get_or_create → idempotente, peut être relancée sans risque.

Appelée automatiquement au démarrage Railway via railway.json startCommand.

Pour ajouter/modifier des utilisateurs : éditez la liste USERS_TO_SEED ci-dessous
puis poussez sur git. Les nouveaux utilisateurs seront créés au prochain déploiement.
Les utilisateurs existants ne sont PAS modifiés (mot de passe préservé).
"""

from django.core.management.base import BaseCommand
from django.db import transaction


# ══════════════════════════════════════════════════════════════════════════════
# LISTE DES UTILISATEURS À CRÉER
# Modifiez cette liste selon vos besoins.
# ══════════════════════════════════════════════════════════════════════════════
USERS_TO_SEED = [
    # ── Administrateur système ────────────────────────────────────────────────
    {
        'login':        'admin',
        'nom':          'Administrateur',
        'prenom':       'Système',
        'email':        'admin@rccm.mr',
        'password':     'Admin2026!',
        'is_superuser': True,
        'is_staff':     True,
        'actif':        True,
    },

    # ── Greffiers ─────────────────────────────────────────────────────────────
    {
        'login':    'greffier1',
        'nom':      'Diagana',
        'prenom':   'Mohamed',
        'email':    'greffier1@rccm.mr',
        'password': 'Greffier2026!',
        'actif':    True,
    },
    {
        'login':    'greffier2',
        'nom':      'Mint Ahmed',
        'prenom':   'Fatimetou',
        'email':    'greffier2@rccm.mr',
        'password': 'Greffier2026!',
        'actif':    True,
    },

    # ── Superviseur ───────────────────────────────────────────────────────────
    {
        'login':    'superviseur',
        'nom':      'Ould Brahim',
        'prenom':   'Sidi',
        'email':    'superviseur@rccm.mr',
        'password': 'Superviseur2026!',
        'is_staff': True,
        'actif':    True,
    },

    # Ajoutez d'autres utilisateurs ici en suivant le même format...
]
# ══════════════════════════════════════════════════════════════════════════════


class Command(BaseCommand):
    help = 'Crée les utilisateurs initiaux RCCM (idempotent — get_or_create)'

    def handle(self, *args, **options):
        from apps.utilisateurs.models import Utilisateur

        created_count  = 0
        existing_count = 0

        with transaction.atomic():
            for user_data in USERS_TO_SEED:
                login    = user_data['login']
                password = user_data.pop('password')

                user, created = Utilisateur.objects.get_or_create(
                    login=login,
                    defaults=user_data,
                )

                if created:
                    user.set_password(password)
                    user.save()
                    created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  ✅ Créé  : {login} ({user.nom} {user.prenom})')
                    )
                else:
                    existing_count += 1
                    self.stdout.write(
                        self.style.WARNING(f'  ⏭  Existe : {login} (non modifié)')
                    )

                # Remet le mot de passe dans le dict pour ne pas altérer la liste
                user_data['password'] = password

        self.stdout.write(
            self.style.SUCCESS(
                f'\nSeed terminé — {created_count} créé(s), {existing_count} déjà existant(s).'
            )
        )
