from django.urls import path
from .views import SuccursaleListCreate, SuccursaleDetail

urlpatterns = [
    path('',          SuccursaleListCreate.as_view(), name='sc-list'),
    path('<int:pk>/', SuccursaleDetail.as_view(),     name='sc-detail'),
]
