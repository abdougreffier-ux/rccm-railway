from django.contrib import admin
from .models import RegistreBE, BeneficiaireEffectif, ActionHistoriqueRBE


class BeneficiaireEffectifInline(admin.TabularInline):
    model  = BeneficiaireEffectif
    extra  = 0
    fields = ('nom', 'prenom', 'nationalite', 'nature_controle', 'pourcentage_detention', 'actif')


class ActionHistoriqueRBEInline(admin.TabularInline):
    model          = ActionHistoriqueRBE
    extra          = 0
    readonly_fields = ('action', 'commentaire', 'created_by', 'created_at')
    can_delete     = False


@admin.register(RegistreBE)
class RegistreBEAdmin(admin.ModelAdmin):
    list_display   = ('numero_rbe', 'type_entite', 'denomination_entite', 'type_declaration', 'statut', 'date_declaration', 'created_at')
    list_filter    = ('statut', 'type_declaration', 'type_entite')
    search_fields  = ('numero_rbe', 'denomination_entite', 'declarant_nom', 'declarant_prenom')
    readonly_fields = ('uuid', 'numero_rbe', 'created_at', 'updated_at')
    inlines        = [BeneficiaireEffectifInline, ActionHistoriqueRBEInline]
    raw_id_fields  = ('ra', 'localite', 'declaration_initiale', 'created_by', 'validated_by')


@admin.register(BeneficiaireEffectif)
class BeneficiaireEffectifAdmin(admin.ModelAdmin):
    list_display  = ('nom', 'prenom', 'rbe', 'nature_controle', 'pourcentage_detention', 'actif')
    list_filter   = ('actif', 'nature_controle', 'nationalite')
    search_fields = ('nom', 'prenom', 'nom_ar', 'prenom_ar', 'numero_document')
    raw_id_fields = ('rbe', 'nationalite')


@admin.register(ActionHistoriqueRBE)
class ActionHistoriqueRBEAdmin(admin.ModelAdmin):
    list_display  = ('rbe', 'action', 'created_by', 'created_at')
    list_filter   = ('action',)
    search_fields = ('rbe__numero_rbe',)
    readonly_fields = ('created_at',)
