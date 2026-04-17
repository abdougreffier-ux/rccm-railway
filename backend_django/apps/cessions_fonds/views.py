from django.utils import timezone
from rest_framework import generics, serializers, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django_filters.rest_framework import DjangoFilterBackend
from .models import CessionFonds
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur


# ── Helpers ───────────────────────────────────────────────────────────────────

def _has_subsequent_ops_cf(ra_id, after_dt, exclude_cf_id=None):
    """Vérifie si une opération ultérieure existe (empêche l'annulation)."""
    from apps.modifications.models import Modification
    from apps.radiations.models import Radiation
    from apps.cessions.models import Cession

    mod_qs = Modification.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    ces_qs = Cession.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    cf_qs  = CessionFonds.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    rad_qs = Radiation.objects.filter(ra_id=ra_id, statut='VALIDEE', validated_at__gt=after_dt)
    if exclude_cf_id:
        cf_qs = cf_qs.exclude(id=exclude_cf_id)
    return mod_qs.exists() or ces_qs.exists() or cf_qs.exists() or rad_qs.exists()


def _can_annuler_or_corriger_cf(obj):
    """Retourne (can_do, reason) pour l'annulation/correction par le greffier."""
    if obj.statut != 'VALIDE':
        return False, 'La cession de fonds n\'est pas dans un état validé.'
    if not obj.validated_at:
        return False, 'Date de validation manquante.'
    delta = timezone.now() - obj.validated_at
    if delta.days > 7:
        return False, f'Délai dépassé ({delta.days} jours — max 7 jours).'
    if _has_subsequent_ops_cf(obj.ra_id, obj.validated_at, exclude_cf_id=obj.id):
        return False, 'Une opération ultérieure existe sur ce dossier.'
    return True, ''


def _capture_snapshot_cedant(cession_fonds):
    """Capture l'état de l'ancien titulaire avant application."""
    ra = cession_fonds.ra
    ph = ra.ph
    if not ph:
        return {}
    nat = ''
    nat_id = None
    if ph.nationalite:
        nat    = str(ph.nationalite)
        nat_id = ph.nationalite_id
    return {
        'ph_id':          ph.id,
        'nom':            ph.nom,
        'prenom':         ph.prenom,
        'nom_ar':         ph.nom_ar,
        'prenom_ar':      ph.prenom_ar,
        'nationalite':    nat,
        'nationalite_id': nat_id,
        'date_naissance': str(ph.date_naissance) if ph.date_naissance else '',
        'lieu_naissance': ph.lieu_naissance,
        'nni':            ph.nni or '',
        'num_passeport':  ph.num_passeport,
        'adresse':        ph.adresse,
        'telephone':      ph.telephone,
        'email':          ph.email,
    }


def _restore_cession_fonds(cession_fonds):
    """Restaure l'ancien titulaire à partir du snapshot_cedant."""
    snapshot = cession_fonds.snapshot_cedant or {}
    ph_id    = snapshot.get('ph_id')
    if not ph_id:
        return

    from apps.entites.models import PersonnePhysique
    try:
        ph_old = PersonnePhysique.objects.get(id=ph_id)
    except PersonnePhysique.DoesNotExist:
        return

    ra = cession_fonds.ra

    # Supprimer le PH créé pour le cessionnaire (sauf si c'est un PH existant réutilisé)
    new_ph_id = cession_fonds.cessionnaire_ph_id
    if new_ph_id and new_ph_id != ph_id:
        # Ne supprimer que si ce PH n'est plus lié à aucun autre RA
        other_ra_count = (
            type(ra).objects.filter(ph_id=new_ph_id).exclude(id=ra.id).count()
            if hasattr(type(ra), 'objects') else 0
        )
        # Import sécurisé
        from apps.registres.models import RegistreAnalytique as _RA
        other_ra_count = _RA.objects.filter(ph_id=new_ph_id).exclude(id=ra.id).count()
        if other_ra_count == 0:
            PersonnePhysique.objects.filter(id=new_ph_id).delete()

    # Rétablir l'ancien titulaire
    ra.ph = ph_old
    ra.save(update_fields=['ph', 'updated_at'])


# ── Serializers ───────────────────────────────────────────────────────────────

class CessionFondsSerializer(serializers.ModelSerializer):
    ra_numero              = serializers.CharField(source='ra.numero_ra', read_only=True)
    ra_denomination        = serializers.SerializerMethodField()
    cedant_nom             = serializers.SerializerMethodField()
    cessionnaire_nom       = serializers.SerializerMethodField()
    created_by_nom         = serializers.SerializerMethodField()
    validated_by_nom       = serializers.SerializerMethodField()
    can_annuler_valide     = serializers.SerializerMethodField()
    can_modifier_correctif = serializers.SerializerMethodField()

    class Meta:
        model  = CessionFonds
        fields = [
            'id', 'uuid', 'numero_cession_fonds',
            'ra', 'ra_numero', 'ra_denomination',
            'date_cession', 'type_acte', 'langue_acte', 'observations', 'demandeur',
            'cessionnaire_data', 'cessionnaire_nom',
            'cedant_nom',
            'snapshot_cedant', 'cessionnaire_ph_id',
            'corrections', 'statut',
            'created_at', 'updated_at', 'validated_at',
            'created_by', 'created_by_nom',
            'validated_by', 'validated_by_nom',
            'can_annuler_valide', 'can_modifier_correctif',
        ]
        read_only_fields = [
            'uuid', 'numero_cession_fonds', 'created_at', 'updated_at',
            'snapshot_cedant', 'corrections', 'cessionnaire_ph_id',
        ]

    def get_ra_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_cedant_nom(self, obj):
        # Priorité : snapshot si déjà validé, sinon PH actuel
        snap = obj.snapshot_cedant or {}
        if snap.get('nom'):
            return f"{snap.get('prenom', '')} {snap.get('nom', '')}".strip()
        if obj.ra and obj.ra.ph:
            return obj.ra.ph.nom_complet
        return '—'

    def get_cessionnaire_nom(self, obj):
        d = obj.cessionnaire_data or {}
        return f"{d.get('prenom', '')} {d.get('nom', '')}".strip() or '—'

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.prenom} {obj.created_by.nom}".strip() or obj.created_by.login
        return ''

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.prenom} {obj.validated_by.nom}".strip() or obj.validated_by.login
        return ''

    def get_can_annuler_valide(self, obj):
        can, _ = _can_annuler_or_corriger_cf(obj)
        return can

    def get_can_modifier_correctif(self, obj):
        can, _ = _can_annuler_or_corriger_cf(obj)
        return can


# ── RA Lookup ─────────────────────────────────────────────────────────────────

class CessionFondsRALookupView(APIView):
    """Lookup RA pour cession de fonds — PH uniquement."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request):
        numero_ra = request.query_params.get('numero_ra', '').strip()
        if not numero_ra:
            return Response({'detail': 'numero_ra requis.'}, status=http_status.HTTP_400_BAD_REQUEST)

        try:
            from apps.registres.models import RegistreAnalytique
            ra = RegistreAnalytique.objects.select_related(
                'ph', 'ph__nationalite', 'localite',
            ).get(numero_ra=numero_ra)
        except RegistreAnalytique.DoesNotExist:
            return Response(
                {'detail': f'Aucun dossier trouvé pour {numero_ra}.'},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        # ── Vérification type : PH uniquement ────────────────────────────────
        if ra.type_entite != 'PH':
            return Response(
                {'detail': 'La cession de fonds de commerce concerne uniquement les personnes physiques (PH).'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if ra.statut == 'RADIE':
            return Response(
                {'detail': 'Ce dossier est radié. La cession est impossible.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if ra.statut not in ('IMMATRICULE', 'EN_COURS'):
            return Response(
                {'detail': f'Le dossier n\'est pas dans un état permettant la cession (statut : {ra.statut}).'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # ── Informations sur le cédant actuel ────────────────────────────────
        ph     = ra.ph
        cedant = {}
        if ph:
            cedant = {
                'nom':            ph.nom,
                'prenom':         ph.prenom,
                'nom_ar':         ph.nom_ar,
                'prenom_ar':      ph.prenom_ar,
                'nationalite':    str(ph.nationalite) if ph.nationalite else '',
                'date_naissance': str(ph.date_naissance) if ph.date_naissance else '',
                'lieu_naissance': ph.lieu_naissance,
                'nni':            ph.nni or '',
                'num_passeport':  ph.num_passeport,
                'adresse':        ph.adresse,
                'telephone':      ph.telephone,
                'email':          ph.email,
            }

        # ── Données entreprise depuis RC d'immatriculation ───────────────────
        import json as _j
        nom_commercial = ''
        activite       = ''
        try:
            rc = (
                ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                          .order_by('-validated_at').first()
                or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
            )
            if rc and rc.description:
                desc = _j.loads(rc.description) if isinstance(rc.description, str) else (rc.description or {})
                nom_commercial = desc.get('denomination_commerciale', '') or desc.get('denomination', '')
                activite       = desc.get('activite', '') or desc.get('objet_social', '')
        except Exception:
            pass

        return Response({
            'id':             ra.id,
            'numero_ra':      ra.numero_ra,
            'numero_rc':      ra.numero_rc or '',
            'type_entite':    ra.type_entite,
            'denomination':   ra.denomination,
            'nom_commercial': nom_commercial,
            'activite':       activite,
            'date_immat':     str(ra.date_immatriculation) if ra.date_immatriculation else '',
            'statut':         ra.statut,
            'cedant':         cedant,
        })


# ── CRUD ──────────────────────────────────────────────────────────────────────

class CessionFondsListCreate(generics.ListCreateAPIView):
    """CRUD cessions de fonds — agents tribunal + greffier, cloisonnement par created_by."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class   = CessionFondsSerializer
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ['statut', 'ra']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = CessionFonds.objects.select_related(
            'ra', 'ra__ph', 'created_by', 'validated_by',
        ).all()
        return filtrer_par_auteur(qs, self.request.user)

    def perform_create(self, serializer):
        from apps.demandes.views import _next_numero
        # Vérification préalable : le RA doit être PH
        ra = serializer.validated_data.get('ra')
        if ra and ra.type_entite != 'PH':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'ra': 'La cession de fonds concerne uniquement les personnes physiques.'})
        serializer.save(
            numero_cession_fonds=_next_numero('CF'),
            created_by=self.request.user,
        )


class CessionFondsDetail(generics.RetrieveUpdateAPIView):
    """Récupère ou met à jour une cession de fonds."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class   = CessionFondsSerializer

    def get_queryset(self):
        qs = CessionFonds.objects.select_related(
            'ra', 'ra__ph', 'created_by', 'validated_by',
        ).all()
        return filtrer_par_auteur(qs, self.request.user)


# ── Workflow ───────────────────────────────────────────────────────────────────

class CessionFondsActionView(APIView):
    """Workflow cession de fonds : soumettre, retourner, valider, annuler."""
    permission_classes = [EstAgentTribunalOuGreffier]

    ACTIONS_GREFFIER = {'retourner', 'valider', 'annuler_valide', 'modifier_correctif'}

    def patch(self, request, pk, action):
        if action in self.ACTIONS_GREFFIER:
            if not EstGreffier().has_permission(request, self):
                return Response({'detail': 'Action réservée au greffier.'}, status=403)

        obj = generics.get_object_or_404(CessionFonds, pk=pk)

        # ── soumettre ─────────────────────────────────────────────────────────
        if action == 'soumettre':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response(
                    {'detail': 'Seul un brouillon ou un dossier retourné peut être soumis.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            data = obj.cessionnaire_data or {}
            if not data.get('nom'):
                return Response(
                    {'detail': 'Les informations du cessionnaire (nom) sont obligatoires.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            if not obj.date_cession:
                return Response(
                    {'detail': 'La date de cession est obligatoire.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            obj.statut = 'EN_INSTANCE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Cession de fonds soumise au greffier.'})

        # ── retourner ─────────────────────────────────────────────────────────
        elif action == 'retourner':
            if obj.statut != 'EN_INSTANCE':
                return Response(
                    {'detail': 'Seul un dossier en instance peut être retourné.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            obs = request.data.get('observations', '').strip()
            obj.statut = 'RETOURNE'
            if obs:
                obj.observations = obs
            obj.save(update_fields=['statut', 'observations', 'updated_at'])
            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra,
                action='RETOUR_CESSION_FONDS',
                reference_operation=obj.numero_cession_fonds,
                etat_avant={'statut': 'EN_INSTANCE'},
                etat_apres={'statut': 'RETOURNE', 'observations': obs},
                commentaire=f"Retour de {obj.numero_cession_fonds} à l'agent. Motif : {obs}",
                created_by=request.user,
            )
            return Response({'statut': obj.statut, 'message': 'Dossier retourné à l\'agent.'})

        # ── valider ───────────────────────────────────────────────────────────
        elif action == 'valider':
            if obj.statut != 'EN_INSTANCE':
                return Response(
                    {'detail': 'Seul un dossier en instance peut être validé.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

            # Capturer snapshot avant application
            snapshot = _capture_snapshot_cedant(obj)
            try:
                new_ph_id = obj.appliquer()
            except Exception as e:
                return Response(
                    {'detail': f'Erreur lors de l\'application : {e}'},
                    status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            obs = request.data.get('observations', '').strip()
            obj.statut             = 'VALIDE'
            obj.validated_at       = timezone.now()
            obj.validated_by       = request.user
            obj.snapshot_cedant    = snapshot
            obj.cessionnaire_ph_id = new_ph_id
            if obs:
                obj.observations = obs
            obj.save(update_fields=[
                'statut', 'validated_at', 'validated_by', 'observations',
                'snapshot_cedant', 'cessionnaire_ph_id', 'updated_at',
            ])

            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra,
                action='VALIDATION_CESSION_FONDS',
                reference_operation=obj.numero_cession_fonds,
                etat_avant={'cedant': snapshot},
                etat_apres={
                    'cessionnaire': obj.cessionnaire_data,
                    'date_cession': str(obj.date_cession),
                    'type_acte':    obj.type_acte,
                    'demandeur':    obj.demandeur,
                },
                commentaire=(
                    f'Validation de la cession de fonds {obj.numero_cession_fonds}.'
                    + (f' {obs}' if obs else '')
                ),
                created_by=request.user,
            )
            return Response({'statut': obj.statut, 'message': 'Cession de fonds validée et appliquée.'})

        # ── annuler (brouillon/retourné) ──────────────────────────────────────
        elif action == 'annuler':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response(
                    {'detail': 'Seul un brouillon ou dossier retourné peut être annulé.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            obj.statut = 'ANNULE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Cession de fonds annulée.'})

        # ── annuler_valide (greffier, dans les 7 jours) ───────────────────────
        elif action == 'annuler_valide':
            can, reason = _can_annuler_or_corriger_cf(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)
            try:
                _restore_cession_fonds(obj)
            except Exception as e:
                return Response(
                    {'detail': f'Erreur lors de la restauration : {e}'},
                    status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            obj.statut = 'ANNULE_GREFFIER'
            obj.save(update_fields=['statut', 'updated_at'])
            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra,
                action='ANNULATION_CESSION_FONDS',
                reference_operation=obj.numero_cession_fonds,
                etat_avant=obj.snapshot_cedant,
                etat_apres={'statut': 'ANNULE_GREFFIER', 'restaure': True},
                commentaire=f'Annulation de la cession de fonds {obj.numero_cession_fonds} par le greffier.',
                created_by=request.user,
            )
            return Response({
                'statut': obj.statut,
                'message': f'Cession {obj.numero_cession_fonds} annulée. Titulaire précédent restauré.',
            })

        # ── modifier_correctif (greffier, dans les 7 jours) ───────────────────
        elif action == 'modifier_correctif':
            can, reason = _can_annuler_or_corriger_cf(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)

            data = request.data
            if not data.get('cessionnaire_data'):
                return Response(
                    {'detail': 'cessionnaire_data requis pour la correction.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

            # Historique correction
            correction_entry = {
                'date':       timezone.now().isoformat(),
                'user':       request.user.login if request.user else '',
                'ancien_etat': {
                    'cessionnaire_data': obj.cessionnaire_data,
                    'date_cession':      str(obj.date_cession),
                    'type_acte':         obj.type_acte,
                },
                'nouvel_etat': data,
            }
            corrections = list(obj.corrections or [])
            corrections.append(correction_entry)

            # Restaurer l'ancien titulaire
            try:
                _restore_cession_fonds(obj)
            except Exception as e:
                return Response(
                    {'detail': f'Erreur lors de la restauration : {e}'},
                    status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Mettre à jour les données corrigées
            obj.cessionnaire_data = data['cessionnaire_data']
            if data.get('date_cession'):
                obj.date_cession = data['date_cession']
            if data.get('type_acte'):
                obj.type_acte = data['type_acte']
            if data.get('observations') is not None:
                obj.observations = data['observations']
            obj.corrections = corrections

            # Capturer nouveau snapshot et ré-appliquer
            snapshot = _capture_snapshot_cedant(obj)
            obj.snapshot_cedant = snapshot
            obj.save()

            try:
                new_ph_id = obj.appliquer()
            except Exception as e:
                return Response(
                    {'detail': f'Erreur lors de l\'application corrective : {e}'},
                    status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            obj.cessionnaire_ph_id = new_ph_id
            obj.snapshot_cedant    = snapshot
            obj.save(update_fields=['cessionnaire_ph_id', 'snapshot_cedant'])

            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra,
                action='CESSION_FONDS_CORRECTIVE',
                reference_operation=obj.numero_cession_fonds,
                etat_avant=correction_entry['ancien_etat'],
                etat_apres=correction_entry['nouvel_etat'],
                commentaire=f'Correction de la cession de fonds {obj.numero_cession_fonds} par le greffier.',
                created_by=request.user,
            )
            return Response({
                'statut': obj.statut,
                'message': f'Cession {obj.numero_cession_fonds} corrigée et réappliquée.',
            })

        return Response({'detail': 'Action inconnue.'}, status=http_status.HTTP_400_BAD_REQUEST)
