from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView
from apps.utilisateurs.views import CustomTokenObtainPairView, LogoutView, MeView, ChangePasswordView
from apps.rapports.verification import VerificationPubliqueView

urlpatterns = [
    path('admin/', admin.site.urls),

    # ── Vérification publique RCCM (sans authentification — accessible via QR code) ──
    # GET /api/verifier/?ref=<reference>&type=<type>
    path('api/verifier/', VerificationPubliqueView.as_view(), name='rccm-verification-publique'),

    # Auth JWT
    path('api/auth/login/',           CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/',         TokenRefreshView.as_view(),          name='token_refresh'),
    path('api/auth/logout/',          LogoutView.as_view(),                name='logout'),
    path('api/auth/me/',              MeView.as_view(),                    name='me'),
    path('api/auth/change-password/', ChangePasswordView.as_view(),        name='change_password'),

    # Modules
    path('api/utilisateurs/',         include('apps.utilisateurs.urls')),
    path('api/parametrage/',          include('apps.parametrage.urls')),
    path('api/personnes-physiques/',  include('apps.entites.urls_ph')),
    path('api/personnes-morales/',    include('apps.entites.urls_pm')),
    path('api/succursales/',          include('apps.entites.urls_sc')),
    path('api/demandes/',             include('apps.demandes.urls')),
    path('api/depots/',               include('apps.depots.urls')),
    path('api/registres/',            include('apps.registres.urls')),
    path('api/modifications/',        include('apps.modifications.urls')),
    path('api/radiations/',           include('apps.radiations.urls')),
    path('api/cessions/',             include('apps.cessions.urls')),
    path('api/cessions-fonds/',       include('apps.cessions_fonds.urls')),
    path('api/documents/',            include('apps.documents.urls')),
    path('api/rapports/',             include('apps.rapports.urls')),
    path('api/recherche/',            include('apps.recherche.urls')),
    path('api/rbe/',                  include('apps.rbe.urls')),
    path('api/historique/',           include('apps.historique.urls')),
    path('api/autorisations/',        include('apps.autorisations.urls')),
    path('api/certificats/',          include('apps.certificats.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
