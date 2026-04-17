from django.urls import path
from .views import (
    TableauDeBordView, StatistiquesView,
    AttestationImmatriculationView, ExtraitRCView,
    RegistreChronologiquePDFView, CertificatChronologiqueView,
    AttestationRBEView, ExtraitRBEView,
    CertificatRadiationView,
    CertificatModificationView,
    CertificatCessionPartsView,
    CertificatCessionFondsView,
)

urlpatterns = [
    path('tableau-de-bord/',  TableauDeBordView.as_view()),
    path('statistiques/',     StatistiquesView.as_view()),
    # Documents RA
    path('attestation-immatriculation/<int:ra_id>/', AttestationImmatriculationView.as_view()),
    path('extrait-rc/<int:ra_id>/',                  ExtraitRCView.as_view()),
    # Documents RC chronologique
    path('certificat-chronologique/<int:rc_id>/',    CertificatChronologiqueView.as_view()),
    # Listes PDF
    path('registre-chronologique/',                  RegistreChronologiquePDFView.as_view()),
    # Documents RBE
    path('attestation-rbe/<int:rbe_id>/',            AttestationRBEView.as_view()),
    path('extrait-rbe/<int:rbe_id>/',                ExtraitRBEView.as_view()),
    # Radiation
    path('certificat-radiation/<int:rad_id>/',       CertificatRadiationView.as_view()),
    # Modification
    path('certificat-modification/<int:modif_id>/',  CertificatModificationView.as_view()),
    # Cession de parts sociales
    path('certificat-cession-parts/<int:ces_id>/',   CertificatCessionPartsView.as_view()),
    # Cession de fonds de commerce
    path('certificat-cession-fonds/<int:cf_id>/',    CertificatCessionFondsView.as_view()),
]
