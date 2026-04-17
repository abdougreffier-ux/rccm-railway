from django.contrib import admin
from .models import DemandeAutorisation


@admin.register(DemandeAutorisation)
class DemandeAutorisationAdmin(admin.ModelAdmin):
    list_display  = ('id', 'type_demande', 'type_dossier', 'dossier_id',
                     'statut', 'demandeur', 'decideur', 'date_demande', 'date_expiration')
    list_filter   = ('type_demande', 'type_dossier', 'statut')
    search_fields = ('demandeur__username', 'motif', 'motif_decision')
    ordering      = ('-date_demande',)
    readonly_fields = ('date_demande', 'date_decision', 'date_expiration')
