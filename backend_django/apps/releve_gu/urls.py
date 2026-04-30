from django.urls import path
from .views import (
    ReleveGUListView,
    GenererReleveGUView,
    ReleveGUDetailView,
    FinaliserReleveGUView,
    ReleveGUPDFView,
)

urlpatterns = [
    path('',                       ReleveGUListView.as_view()),
    path('generer/',               GenererReleveGUView.as_view()),
    path('<int:pk>/',              ReleveGUDetailView.as_view()),
    path('<int:pk>/finaliser/',    FinaliserReleveGUView.as_view()),
    path('<int:pk>/pdf/',          ReleveGUPDFView.as_view()),
]
