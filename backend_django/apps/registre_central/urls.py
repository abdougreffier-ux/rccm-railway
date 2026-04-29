from django.urls import path
from .views import (
    ReleveListView,
    GenererReleveView,
    FinaliserReleveView,
    TransmettreReleveView,
    TransmissionsReleveView,
)

urlpatterns = [
    path('',                          ReleveListView.as_view(),           name='releve-list'),
    path('generer/',                  GenererReleveView.as_view(),         name='releve-generer'),
    path('<int:pk>/finaliser/',       FinaliserReleveView.as_view(),       name='releve-finaliser'),
    path('<int:pk>/transmettre/',     TransmettreReleveView.as_view(),     name='releve-transmettre'),
    path('<int:pk>/transmissions/',   TransmissionsReleveView.as_view(),   name='releve-transmissions'),
]
