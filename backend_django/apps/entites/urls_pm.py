from django.urls import path
from .views import PersonneMoraleListCreate, PersonneMoraleDetail, PMAssociesView, PMGerantsView

urlpatterns = [
    path('',                     PersonneMoraleListCreate.as_view(), name='pm-list'),
    path('<int:pk>/',            PersonneMoraleDetail.as_view(),     name='pm-detail'),
    path('<int:pk>/associes/',   PMAssociesView.as_view(),           name='pm-associes'),
    path('<int:pk>/gerants/',    PMGerantsView.as_view(),            name='pm-gerants'),
]
