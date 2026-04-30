from rest_framework import generics, serializers, parsers, filters
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from .models import Document, generate_nom_rccm
from apps.core.permissions import EstGreffier, EstAgentOuGreffier, est_greffier

# Statuts d'une ImmatriculationHistorique où un agent ne peut plus modifier
_IH_STATUTS_BLOQUES = frozenset({'EN_INSTANCE', 'VALIDE', 'REJETE', 'ANNULE'})
# Statuts d'un RegistreChronologique où un agent ne peut plus modifier les pièces jointes
_RC_STATUTS_BLOQUES = frozenset({'EN_INSTANCE', 'VALIDE', 'REJETE', 'ANNULE'})


def _qs_docs_agent(user):
    """
    Queryset de documents accessible à un agent :
    - uniquement ses propres documents (created_by)
    - excluant les documents liés à une immatriculation historique VALIDÉE
      (dossier clôturé : les PJ deviennent greffier-only)
    """
    return (Document.objects
            .filter(created_by=user)
            .exclude(
                immatriculation_hist__isnull=False,
                immatriculation_hist__statut='VALIDE',
            ))


class DocumentSerializer(serializers.ModelSerializer):
    type_doc_libelle = serializers.CharField(source='type_doc.libelle_fr', read_only=True)
    url              = serializers.SerializerMethodField()

    class Meta:
        model  = Document
        fields = ['id', 'uuid', 'nom_fichier', 'fichier', 'url', 'type_doc', 'type_doc_libelle',
                  'taille_ko', 'mime_type', 'ra', 'demande', 'depot', 'chrono', 'rbe',
                  'modification', 'cession', 'radiation', 'immatriculation_hist', 'cession_fonds',
                  'description', 'date_scan', 'created_at']
        # nom_fichier / taille_ko / mime_type : toujours déduits du fichier uploadé
        # dans perform_create — le client n'a pas à les fournir.
        read_only_fields = ['uuid', 'nom_fichier', 'taille_ko', 'mime_type', 'date_scan', 'created_at']

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.fichier and request:
            return request.build_absolute_uri(obj.fichier.url)
        return None


class DocumentListCreate(generics.ListCreateAPIView):
    """
    Pièces jointes.

    • GET  : greffier → liste globale ; agent → ses propres documents uniquement.
    • POST : ouvert à tout le personnel (agents + greffier) — CDC §3.
    """
    serializer_class = DocumentSerializer
    parser_classes   = [parsers.MultiPartParser, parsers.FormParser]
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['ra', 'demande', 'depot', 'chrono', 'rbe', 'modification', 'cession', 'radiation', 'immatriculation_hist', 'cession_fonds']
    ordering         = ['-created_at']

    def get_permissions(self):
        # GET et POST : tout le personnel RCCM
        return [EstAgentOuGreffier()]

    def get_queryset(self):
        """
        Greffier : voit tous les documents.
        Agent    : uniquement ses propres documents, hors dossiers historiques VALIDÉS.
        """
        if est_greffier(self.request.user):
            return Document.objects.select_related('type_doc').all()
        return _qs_docs_agent(self.request.user).select_related('type_doc')

    def perform_create(self, serializer):
        # Contrôle de statut pour immatriculation_hist :
        # un agent ne peut pas ajouter de pièces jointes une fois la demande soumise.
        ih = serializer.validated_data.get('immatriculation_hist')
        if ih and not est_greffier(self.request.user):
            if ih.statut in _IH_STATUTS_BLOQUES:
                raise PermissionDenied(
                    f"Ajout de pièces jointes interdit pour le statut « {ih.statut} »."
                )

        # Contrôle de statut pour chrono (RegistreChronologique) :
        # un agent ne peut pas ajouter de pièces jointes après transmission au greffier.
        chrono = serializer.validated_data.get('chrono')
        if chrono and not est_greffier(self.request.user):
            if chrono.statut in _RC_STATUTS_BLOQUES:
                raise PermissionDenied(
                    f"Ajout de pièces jointes interdit pour le statut « {chrono.statut} »."
                )

        f    = self.request.FILES.get('fichier')
        data = serializer.validated_data
        kwargs = {'created_by': self.request.user}
        if f:
            kwargs['taille_ko'] = max(f.size // 1024, 1)   # minimum 1 Ko affiché
            kwargs['mime_type'] = f.content_type

        # ── Nommage normalisé RCCM ────────────────────────────────────────────
        # SEQ = nombre de PJ déjà liées au même (parent FK + type_doc) + 1
        _FK_NAMES = ('chrono', 'ra', 'modification', 'cession', 'cession_fonds',
                     'radiation', 'depot', 'demande', 'rbe', 'immatriculation_hist')
        type_doc_obj = data.get('type_doc')
        seq = 1
        for fk in _FK_NAMES:
            parent = data.get(fk)
            if parent:
                qs = Document.objects.filter(**{fk: parent})
                if type_doc_obj:
                    qs = qs.filter(type_doc=type_doc_obj)
                seq = qs.count() + 1
                break

        kwargs['nom_fichier'] = generate_nom_rccm(
            type_doc=type_doc_obj,
            chrono=data.get('chrono'),
            ra=data.get('ra'),
            modification=data.get('modification'),
            cession=data.get('cession'),
            cession_fonds=data.get('cession_fonds'),
            radiation=data.get('radiation'),
            depot=data.get('depot'),
            demande=data.get('demande'),
            rbe=data.get('rbe'),
            immatriculation_hist=data.get('immatriculation_hist'),
            seq=seq,
        )
        serializer.save(**kwargs)


class DocumentDetail(generics.RetrieveDestroyAPIView):
    """
    Détail / suppression d'une pièce jointe.
    Ouvert à tout le personnel RCCM — les agents ne voient/suppriment que leurs propres fichiers,
    et sont exclus des dossiers historiques VALIDÉS.
    """
    permission_classes = [EstAgentOuGreffier]
    serializer_class   = DocumentSerializer

    def get_queryset(self):
        if est_greffier(self.request.user):
            return Document.objects.select_related('type_doc').all()
        return _qs_docs_agent(self.request.user).select_related('type_doc')

    def perform_destroy(self, instance):
        """
        Protection supplémentaire à la suppression :
        un agent ne peut pas supprimer une PJ liée à un RC transmis (EN_INSTANCE/VALIDE/…).
        Le greffier n'est pas soumis à cette restriction.
        """
        if not est_greffier(self.request.user):
            if instance.chrono_id and instance.chrono.statut in _RC_STATUTS_BLOQUES:
                raise PermissionDenied(
                    f"Suppression de pièces jointes interdite pour le statut « {instance.chrono.statut} »."
                )
            if instance.immatriculation_hist_id and instance.immatriculation_hist.statut in _IH_STATUTS_BLOQUES:
                raise PermissionDenied(
                    f"Suppression de pièces jointes interdite pour le statut « {instance.immatriculation_hist.statut} »."
                )
        instance.delete()


def _serve_document(doc, as_attachment: bool):
    """Helper commun : ouvre le fichier et retourne un FileResponse approprié."""
    try:
        f = doc.fichier.open('rb')
    except (FileNotFoundError, OSError):
        return Response(
            {'detail': f"Fichier introuvable sur le serveur : {doc.nom_fichier}"},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    # Conserver le MIME type d'origine pour que le navigateur sache comment afficher
    mime = doc.mime_type or 'application/octet-stream'
    resp = FileResponse(f, content_type=mime, as_attachment=as_attachment,
                        filename=doc.nom_fichier)
    return resp


class DocumentDownloadView(APIView):
    """
    Téléchargement forcé (Content-Disposition: attachment).
    Bouton « Télécharger » — déclenche le save-as du navigateur.
    Les agents sont restreints à leurs propres fichiers, hors dossiers historiques VALIDÉS.
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request, pk):
        if est_greffier(request.user):
            qs = Document.objects.all()
        else:
            qs = _qs_docs_agent(request.user)
        doc = generics.get_object_or_404(qs, pk=pk)
        return _serve_document(doc, as_attachment=True)


class DocumentViewInlineView(APIView):
    """
    Visualisation inline (Content-Disposition: inline).
    Bouton « Voir » — le navigateur affiche le PDF/image dans un nouvel onglet.
    Compatible avec le mécanisme blob-URL du frontend (JWT dans l'en-tête Authorization).
    Les agents sont restreints à leurs propres fichiers, hors dossiers historiques VALIDÉS.
    """
    permission_classes = [EstAgentOuGreffier]

    def get(self, request, pk):
        if est_greffier(request.user):
            qs = Document.objects.all()
        else:
            qs = _qs_docs_agent(request.user)
        doc = generics.get_object_or_404(qs, pk=pk)
        return _serve_document(doc, as_attachment=False)
