import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'registre_rc.settings')

_django_app = get_wsgi_application()

# ── CORS au niveau WSGI ───────────────────────────────────────────────────────
# Injecte les headers CORS sur TOUTES les réponses, y compris les préflight
# OPTIONS, avant que Django middleware ne s'en charge.
# Nécessaire sur Railway où le proxy peut intercepter OPTIONS avant Django.
_CORS_HEADERS = [
    ('Access-Control-Allow-Methods',
     'GET, POST, PUT, PATCH, DELETE, OPTIONS'),
    ('Access-Control-Allow-Headers',
     'Authorization, Content-Type, Accept, X-CSRFToken, X-Requested-With'),
    ('Access-Control-Allow-Credentials', 'true'),
    ('Access-Control-Max-Age', '86400'),
    ('Vary', 'Origin'),
]


def application(environ, start_response):
    origin = environ.get('HTTP_ORIGIN', '')

    def cors_start_response(status, response_headers, exc_info=None):
        # Ajoute Access-Control-Allow-Origin avec l'origine exacte du client
        # (wildcard * incompatible avec credentials=true)
        ao_header = ('Access-Control-Allow-Origin', origin if origin else '*')
        existing = {h[0].lower() for h in response_headers}
        headers = list(response_headers)
        if 'access-control-allow-origin' not in existing:
            headers.append(ao_header)
        for h in _CORS_HEADERS:
            if h[0].lower() not in existing:
                headers.append(h)
        return start_response(status, headers, exc_info)

    # Répondre aux requêtes OPTIONS (preflight) immédiatement
    if environ.get('REQUEST_METHOD') == 'OPTIONS':
        cors_start_response('204 No Content', [('Content-Length', '0')])
        return [b'']

    return _django_app(environ, cors_start_response)
