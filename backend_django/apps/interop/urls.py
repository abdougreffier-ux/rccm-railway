from django.urls import path
from .views import (
    InteropStatusView,
    SystemesExternesView,
    EmissionCleAPIView,
    JournalAppelsView,
    RCRechercheExterneView,
    RCVerificationExterneView,
)

# ── Gestion inter-administrations (réservé greffier) ──────────────────────────
interop_urlpatterns = [
    path('status/',    InteropStatusView.as_view(),    name='interop-status'),
    path('systemes/',  SystemesExternesView.as_view(), name='interop-systemes'),
    path('cles/',      EmissionCleAPIView.as_view(),   name='interop-cles'),
    path('journal/',   JournalAppelsView.as_view(),    name='interop-journal'),
]

# ── Endpoints consommés par les systèmes externes (API Key) ───────────────────
rc_externe_urlpatterns = [
    path('recherche/',    RCRechercheExterneView.as_view(),    name='rc-externe-recherche'),
    path('verification/', RCVerificationExterneView.as_view(), name='rc-externe-verification'),
]
