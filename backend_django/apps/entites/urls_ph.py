from django.urls import path
from .views import PersonnePhysiqueListCreate, PersonnePhysiqueDetail

urlpatterns = [
    path('',          PersonnePhysiqueListCreate.as_view(), name='ph-list'),
    path('<int:pk>/', PersonnePhysiqueDetail.as_view(),     name='ph-detail'),
]
