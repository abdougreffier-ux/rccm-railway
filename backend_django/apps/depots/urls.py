from django.urls import path
from .views import DepotListCreate, DepotDetail, CertificatDepotView

urlpatterns = [
    path('',                       DepotListCreate.as_view()),
    path('<int:pk>/',              DepotDetail.as_view()),
    path('<int:pk>/certificat/',   CertificatDepotView.as_view()),
]
