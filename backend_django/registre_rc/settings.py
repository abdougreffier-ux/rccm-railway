"""
Django Settings - Registre du Commerce - Mauritanie
"""
import os
import dj_database_url
from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Garantit l'existence du dossier logs/ au démarrage ───────────────────────
# Nécessaire pour les RotatingFileHandlers (django.log, rccm.log).
# Le Dockerfile crée /app/logs, mais cette ligne protège aussi le dev local.
os.makedirs(BASE_DIR / 'logs', exist_ok=True)

SECRET_KEY = config('SECRET_KEY', default='changez-cette-cle-en-production')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')
# Railway envoie ses health checks avec Host: healthcheck.railway.app — toujours autorisé.
if 'healthcheck.railway.app' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('healthcheck.railway.app')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    # Apps
    'apps.core',
    'apps.utilisateurs',
    'apps.entites',
    'apps.registres',
    'apps.demandes',
    'apps.depots',
    'apps.modifications',
    'apps.radiations',
    'apps.cessions',
    'apps.documents',
    'apps.rapports',
    'apps.parametrage',
    'apps.recherche',
    'apps.rbe',
    'apps.historique',
    'apps.autorisations',
    'apps.cessions_fonds',
    'apps.certificats',
    # ── Interopérabilité & Registre Central (API inter-administrations) ──────
    'apps.interop',
    'apps.registre_central',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # ── CORS en tête : doit précéder TOUT middleware qui génère des réponses
    # (WhiteNoise, MigrationGuard…) pour que même les 503/404 aient le header
    # Access-Control-Allow-Origin et que le navigateur ne masque pas le vrai erreur.
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    # ── Garde schéma RCCM : bloque /api/* avec HTTP 503 si migrations en attente
    'apps.core.middleware.MigrationGuardMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'registre_rc.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'registre_rc.wsgi.application'

# ── Base de données PostgreSQL ────────────────────────────────────────────────
# Priorité : DATABASE_URL (Railway l'injecte automatiquement pour le service
# PostgreSQL lié) → sinon variables individuelles DB_* pour Docker/local.
_DATABASE_URL = config('DATABASE_URL', default='')
if _DATABASE_URL:
    DATABASES = {
        'default': {
            **dj_database_url.parse(_DATABASE_URL, conn_max_age=600),
            'OPTIONS': {'options': '-c search_path=public'},
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE':   'django.db.backends.postgresql',
            'NAME':     config('DB_NAME',     default='registre_commerce'),
            'USER':     config('DB_USER',     default='rc_user'),
            'PASSWORD': config('DB_PASSWORD', default='rc_password_secret'),
            'HOST':     config('DB_HOST',     default='localhost'),
            'PORT':     config('DB_PORT',     default='5432'),
            'OPTIONS':  {'options': '-c search_path=public'},
        }
    }

# Modèle utilisateur personnalisé
AUTH_USER_MODEL = 'utilisateurs.Utilisateur'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Nouakchott'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = config('MEDIA_ROOT', default=str(BASE_DIR / 'media'))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    # ── Throttling — protection API inter-administrations ────────────────────
    'DEFAULT_THROTTLE_CLASSES': [
        'apps.interop.throttling.ApiKeyThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'interop_standard':    config('THROTTLE_INTEROP_STANDARD',    default='200/hour'),
        'interop_prioritaire': config('THROTTLE_INTEROP_PRIORITAIRE', default='1000/hour'),
        'public_verification': config('THROTTLE_PUBLIC_VERIFICATION', default='60/min'),
    },
    'DATE_FORMAT': '%Y-%m-%d',
    'DATE_INPUT_FORMATS': ['%Y-%m-%d', '%d/%m/%Y'],
    'DATETIME_FORMAT': '%Y-%m-%d %H:%M:%S',
}

# JWT Configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=config('JWT_ACCESS_TOKEN_LIFETIME_HOURS', default=8, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# ── CORS ──────────────────────────────────────────────────────────────────────
# Pour les déploiements Railway de test, CORS_ALLOW_ALL_ORIGINS est activé par
# défaut (True) car l'URL du frontend est générée automatiquement par Railway.
# En production réelle : CORS_ALLOW_ALL_ORIGINS=False + CORS_ALLOWED_ORIGINS=<url>
CORS_ALLOW_ALL_ORIGINS  = config('CORS_ALLOW_ALL_ORIGINS',  default=True, cast=bool)
CORS_ALLOWED_ORIGINS    = config('CORS_ALLOWED_ORIGINS',    default='http://localhost:3000').split(',')
CORS_ALLOW_CREDENTIALS  = True
# Expose Content-Disposition pour que fetch() côté navigateur puisse lire le
# nom de fichier des PDF en contexte cross-origin (services Railway séparés).
CORS_EXPOSE_HEADERS     = ['Content-Disposition']

# ── CSRF ─────────────────────────────────────────────────────────────────────
# Obligatoire pour accepter les requêtes non-GET depuis un domaine non-localhost.
# En production HTTPS : mettre https://rccm-test.mondomaine.mr
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost,http://localhost:80,http://localhost:3000',
).split(',')

# ── Sécurité HTTPS (activer en production avec TLS terminé au reverse proxy) ─
# SESSION_COOKIE_SECURE  : cookies de session transmis uniquement sur HTTPS
# SECURE_PROXY_SSL_HEADER: indique à Django que le proxy frontal gère le TLS
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=False, cast=bool)
if not DEBUG and SESSION_COOKIE_SECURE:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Upload fichiers
MAX_UPLOAD_SIZE = config('MAX_UPLOAD_SIZE_MB', default=10, cast=int) * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff']

# ── Vérification publique des documents RCCM ─────────────────────────────────
# URL de base accessible publiquement, encodée dans les QR codes de tous les
# documents officiels (certificats, extraits, attestations, dépôts…).
# Format attendu : https://rccm.justice.mr  (sans slash final)
# Variable d'environnement : RCCM_VERIFICATION_BASE_URL
# En l'absence de configuration, les QR codes utilisent le format texte RCCM-MR.
RCCM_VERIFICATION_BASE_URL = config(
    'RCCM_VERIFICATION_BASE_URL',
    default='http://localhost:8000',
)

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style':  '{',
        },
        'rccm': {
            # Format enrichi pour les logs métier RCCM
            'format': '[RCCM] {levelname} {asctime} [{name}] {message}',
            'style':  '{',
        },
        'pdf_audit': {
            # Format minimal pour le journal PDF — le JSON est dans le message
            'format': '{asctime} {message}',
            'style':  '{',
        },
    },
    'handlers': {
        'console': {
            'class':     'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    BASE_DIR / 'logs' / 'django.log',
            'maxBytes':    10 * 1024 * 1024,
            'backupCount': 5,
            'formatter':   'verbose',
        },
        'file_rccm': {
            # Fichier dédié aux logs métier RCCM (certificats, migrations, audit)
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    BASE_DIR / 'logs' / 'rccm.log',
            'maxBytes':    10 * 1024 * 1024,
            'backupCount': 10,
            'formatter':   'rccm',
        },
        'file_pdf_audit': {
            # Journal d'audit des générations PDF — chaque ligne = 1 JSON [PDF_AUDIT]
            # Sur Railway ce fichier n'est pas persistant entre les redémarrages ;
            # les entrées sont également émises sur console (capturées dans les logs Railway).
            'class':       'logging.handlers.RotatingFileHandler',
            'filename':    BASE_DIR / 'logs' / 'pdf_audit.log',
            'maxBytes':    20 * 1024 * 1024,
            'backupCount': 10,
            'formatter':   'pdf_audit',
        },
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django': {
            'handlers':  ['console', 'file'],
            'level':     'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers':  ['console', 'file'],
            'level':     'DEBUG',
            'propagate': False,
        },
        # ── Loggers métier RCCM ───────────────────────────────────────────────
        # Écrivent dans rccm.log ET console pour visibilité maximale.
        'rccm': {
            'handlers':  ['console', 'file_rccm'],
            'level':     'DEBUG',
            'propagate': False,
        },
        # ── Journal d'audit PDF ───────────────────────────────────────────────
        # Toute tentative de génération de document officiel est tracée ici.
        # Format : [PDF_AUDIT] <JSON> — chaque ligne contient utilisateur, acte,
        # référence, langue, succès, durée, timestamp.
        'rccm.pdf_audit': {
            'handlers':  ['console', 'file_pdf_audit'],
            'level':     'INFO',
            'propagate': False,   # ne pas doubler dans rccm.log
        },
    },
}

# ── Interopérabilité — API inter-administrations ──────────────────────────────
# Middleware de journalisation des appels externes.
# Insérer après AuthenticationMiddleware (voir MIDDLEWARE ci-dessus).
# Activation manuelle : ajouter dans MIDDLEWARE :
#   'apps.interop.middleware.InteropJournalMiddleware',
# (non ajouté par défaut pour ne pas impacter les performances internes)

# ── Registre Central — Consolidation nationale ────────────────────────────────
# URL de l'endpoint du Registre Central national (transmission mensuelle).
# Laisser vide pour activer le MODE SANDBOX (transmission simulée).
# Variable d'environnement : URL_REGISTRE_CENTRAL
URL_REGISTRE_CENTRAL = config('URL_REGISTRE_CENTRAL', default='')

# Clé API pour authentification auprès du Registre Central (optionnelle).
# Variable d'environnement : CLE_API_REGISTRE_CENTRAL
CLE_API_REGISTRE_CENTRAL = config('CLE_API_REGISTRE_CENTRAL', default='')
