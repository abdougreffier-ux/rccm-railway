"""
Commande Django : seed_users
=============================
Crée les rôles, postes et utilisateurs initiaux du système RCCM s'ils n'existent pas encore.
Utilise get_or_create → idempotente, peut être relancée sans risque.

Appelée automatiquement au démarrage Railway via railway.json startCommand.

Pour ajouter/modifier des utilisateurs : éditez les listes ci-dessous
puis poussez sur git. Les nouveaux éléments seront créés au prochain déploiement.
Les utilisateurs existants ne sont PAS modifiés (mot de passe préservé).
"""

from django.core.management.base import BaseCommand
from django.db import transaction


# ══════════════════════════════════════════════════════════════════════════════
# RÔLES À CRÉER
# ══════════════════════════════════════════════════════════════════════════════
ROLES_TO_SEED = [
    {
        'code':        'GREFFIER',
        'libelle':     'Greffier',
        'libelle_ar':  'كاتب الضبط',
        'description': 'Accès complet — validation, impression, paramétrage, gestion des utilisateurs',
    },
    {
        'code':        'AGENT_TRIBUNAL',
        'libelle':     'Agent du Tribunal',
        'libelle_ar':  'عون المحكمة',
        'description': 'Accès à tous les modules métier (dossiers créés par lui uniquement)',
    },
    {
        'code':        'AGENT_GU',
        'libelle':     'Agent Guichet Unique',
        'libelle_ar':  'عون الشباك الموحد',
        'description': 'Création des immatriculations uniquement (RC type IMMATRICULATION)',
    },
]

# ══════════════════════════════════════════════════════════════════════════════
# POSTES À CRÉER
# ══════════════════════════════════════════════════════════════════════════════
POSTES_TO_SEED = [
    {'code': 'GRF',  'libelle_fr': 'Greffier',             'libelle_ar': 'كاتب الضبط'},
    {'code': 'GC',   'libelle_fr': 'Greffier en Chef',     'libelle_ar': 'رئيس الكتابة'},
    {'code': 'AGT',  'libelle_fr': 'Agent du Tribunal',    'libelle_ar': 'عون المحكمة'},
    {'code': 'AGU',  'libelle_fr': 'Agent Guichet Unique', 'libelle_ar': 'عون الشباك الموحد'},
    {'code': 'INFO', 'libelle_fr': 'Informaticien',        'libelle_ar': 'تقني معلوماتي'},
]

# ══════════════════════════════════════════════════════════════════════════════
# UTILISATEURS À CRÉER
# Champs disponibles :
#   login, nom, prenom, email, password  → obligatoires
#   role_code     → code du rôle (GREFFIER / AGENT_TRIBUNAL / AGENT_GU)
#   poste_code    → code du poste (GRF / GC / AGT / AGU / INFO)
#   is_superuser  → True pour les admins Django (accès /admin/)
#   is_staff      → True pour l'accès à /admin/
#   actif         → True/False
# ══════════════════════════════════════════════════════════════════════════════
USERS_TO_SEED = [

    # ── Administrateur système ────────────────────────────────────────────────
    {
        'login':        'admin',
        'nom':          'Administrateur',
        'prenom':       'Système',
        'email':        'admin@rccm.mr',
        'password':     'Admin2026!',
        'role_code':    'GREFFIER',
        'poste_code':   'GC',
        'is_superuser': True,
        'is_staff':     True,
        'actif':        True,
    },

    # ── Greffiers ─────────────────────────────────────────────────────────────
    {
        'login':      'greffier1',
        'nom':        'Diagana',
        'prenom':     'Mohamed',
        'email':      'greffier1@rccm.mr',
        'password':   'Greffier2026!',
        'role_code':  'GREFFIER',
        'poste_code': 'GRF',
        'actif':      True,
    },
    {
        'login':      'greffier2',
        'nom':        'Mint Ahmed',
        'prenom':     'Fatimetou',
        'email':      'greffier2@rccm.mr',
        'password':   'Greffier2026!',
        'role_code':  'GREFFIER',
        'poste_code': 'GRF',
        'actif':      True,
    },

    # ── Superviseur (Greffier en Chef) ────────────────────────────────────────
    {
        'login':      'superviseur',
        'nom':        'Ould Brahim',
        'prenom':     'Sidi',
        'email':      'superviseur@rccm.mr',
        'password':   'Superviseur2026!',
        'role_code':  'GREFFIER',
        'poste_code': 'GC',
        'is_staff':   True,
        'actif':      True,
    },

    # ── Agents du Tribunal ────────────────────────────────────────────────────
    {
        'login':      'agent1',
        'nom':        'Ould Mohamed',
        'prenom':     'Ahmed',
        'email':      'agent1@rccm.mr',
        'password':   'Agent2026!',
        'role_code':  'AGENT_TRIBUNAL',
        'poste_code': 'AGT',
        'actif':      True,
    },
    {
        'login':      'agent2',
        'nom':        'Mint Cheikh',
        'prenom':     'Mariem',
        'email':      'agent2@rccm.mr',
        'password':   'Agent2026!',
        'role_code':  'AGENT_TRIBUNAL',
        'poste_code': 'AGT',
        'actif':      True,
    },

    # ── Agents Guichet Unique ─────────────────────────────────────────────────
    {
        'login':      'guichet1',
        'nom':        'Ould Ismail',
        'prenom':     'Moussa',
        'email':      'guichet1@rccm.mr',
        'password':   'Guichet2026!',
        'role_code':  'AGENT_GU',
        'poste_code': 'AGU',
        'actif':      True,
    },

    # Ajoutez d'autres utilisateurs ici en suivant le même format...
]
# ══════════════════════════════════════════════════════════════════════════════


class Command(BaseCommand):
    help = 'Crée les rôles, postes et utilisateurs initiaux RCCM (idempotent — get_or_create)'

    def handle(self, *args, **options):
        from apps.utilisateurs.models import Role, Poste, Utilisateur

        # ── 1. Seed des rôles ──────────────────────────────────────────────────
        self.stdout.write('\n── Rôles ──')
        roles_map = {}
        for role_data in ROLES_TO_SEED:
            role, created = Role.objects.get_or_create(
                code=role_data['code'],
                defaults=role_data,
            )
            roles_map[role.code] = role
            if created:
                self.stdout.write(self.style.SUCCESS(
                    f'  ✅ Créé  : Rôle {role.code} ({role.libelle})'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'  ⏭  Existe : Rôle {role.code}'
                ))

        # ── 2. Seed des postes ─────────────────────────────────────────────────
        self.stdout.write('\n── Postes ──')
        postes_map = {}
        for poste_data in POSTES_TO_SEED:
            poste, created = Poste.objects.get_or_create(
                code=poste_data['code'],
                defaults=poste_data,
            )
            postes_map[poste.code] = poste
            if created:
                self.stdout.write(self.style.SUCCESS(
                    f'  ✅ Créé  : Poste {poste.code} ({poste.libelle_fr})'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'  ⏭  Existe : Poste {poste.code}'
                ))

        # ── 3. Seed des utilisateurs ───────────────────────────────────────────
        self.stdout.write('\n── Utilisateurs ──')
        created_count  = 0
        existing_count = 0

        with transaction.atomic():
            for user_data in USERS_TO_SEED:
                login      = user_data['login']
                password   = user_data.pop('password')
                role_code  = user_data.pop('role_code',  None)
                poste_code = user_data.pop('poste_code', None)

                # Résoudre les FK rôle et poste
                if role_code:
                    user_data['role'] = roles_map.get(role_code)
                if poste_code:
                    user_data['poste'] = postes_map.get(poste_code)

                user, created = Utilisateur.objects.get_or_create(
                    login=login,
                    defaults=user_data,
                )

                if created:
                    user.set_password(password)
                    user.save()
                    created_count += 1
                    role_label = roles_map[role_code].libelle if role_code else '—'
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✅ Créé  : {login} ({user.nom} {user.prenom}) [{role_label}]'
                    ))
                else:
                    existing_count += 1
                    self.stdout.write(self.style.WARNING(
                        f'  ⏭  Existe : {login} (non modifié)'
                    ))

                # Remettre les valeurs extraites pour ne pas altérer la liste
                user_data['password'] = password
                if role_code:
                    user_data['role_code']  = role_code
                if poste_code:
                    user_data['poste_code'] = poste_code

        self.stdout.write(self.style.SUCCESS(
            f'\nSeed terminé — {created_count} utilisateur(s) créé(s), {existing_count} déjà existant(s).'
        ))
