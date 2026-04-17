from django.urls import path
from .views import (
    DocumentListCreate, DocumentDetail,
    DocumentDownloadView, DocumentViewInlineView,
)

urlpatterns = [
    path('',                  DocumentListCreate.as_view()),
    path('<int:pk>/',         DocumentDetail.as_view()),
    path('<int:pk>/download/', DocumentDownloadView.as_view()),   # Content-Disposition: attachment
    path('<int:pk>/view/',     DocumentViewInlineView.as_view()), # Content-Disposition: inline
]
