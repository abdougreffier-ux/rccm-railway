import uuid, os
from django.db import models
from apps.parametrage.models import TypeDocument
from apps.utilisateurs.models import Utilisateur


def document_upload_path(instance, filename):
    ext   = os.path.splitext(filename)[1].lower()
    fname = f'{uuid.uuid4().hex}{ext}'
    return f'documents/{fname}'


class Document(models.Model):
    uuid           = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    nom_fichier    = models.CharField(max_length=255)
    fichier        = models.FileField(upload_to=document_upload_path)
    type_doc       = models.ForeignKey(TypeDocument, null=True, blank=True, on_delete=models.SET_NULL)
    taille_ko      = models.IntegerField(null=True, blank=True)
    mime_type      = models.CharField(max_length=100, blank=True)
    ra             = models.ForeignKey('registres.RegistreAnalytique', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    demande        = models.ForeignKey('demandes.Demande', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    depot          = models.ForeignKey('depots.Depot', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    chrono         = models.ForeignKey('registres.RegistreChronologique', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    rbe            = models.ForeignKey('rbe.RegistreBE', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    modification   = models.ForeignKey('modifications.Modification', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    cession        = models.ForeignKey('cessions.Cession', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    radiation      = models.ForeignKey('radiations.Radiation', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    immatriculation_hist = models.ForeignKey('historique.ImmatriculationHistorique', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    cession_fonds        = models.ForeignKey('cessions_fonds.CessionFonds', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    description    = models.TextField(blank=True)
    date_scan      = models.DateField(auto_now_add=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    created_by     = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table   = 'documents'
        ordering   = ['-created_at']
        verbose_name        = 'Document'
        verbose_name_plural = 'Documents'

    def __str__(self): return self.nom_fichier
