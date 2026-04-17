from django.utils import timezone
from rest_framework import generics, serializers, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django_filters.rest_framework import DjangoFilterBackend
from .models import Cession
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur


# ── Helpers ───────────────────────────────────────────────────────────────────

def _has_subsequent_ops_ces(ra_id, after_dt, exclude_ces_id=None):
    from apps.modifications.models import Modification
    from apps.radiations.models import Radiation
    mod_qs = Modification.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    ces_qs = Cession.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    if exclude_ces_id:
        ces_qs = ces_qs.exclude(id=exclude_ces_id)
    rad_qs = Radiation.objects.filter(ra_id=ra_id, statut='VALIDEE', validated_at__gt=after_dt)
    return mod_qs.exists() or ces_qs.exists() or rad_qs.exists()


def _can_annuler_or_corriger_ces(obj):
    if obj.statut != 'VALIDE':
        return False, 'La cession n\'est pas dans un état validé.'
    if not obj.validated_at:
        return False, 'Date de validation manquante.'
    delta = timezone.now() - obj.validated_at
    if delta.days > 7:
        return False, f'Délai dépassé ({delta.days} jours — max 7 jours).'
    if _has_subsequent_ops_ces(obj.ra_id, obj.validated_at, exclude_ces_id=obj.id):
        return False, 'Une opération ultérieure existe sur ce dossier.'
    return True, ''


def _capture_snapshot_avant(cession):
    """Snapshot all associés state before applying the cession."""
    associes_state = []
    for a in cession.ra.associes.all():
        associes_state.append({
            'id':            a.id,
            'nombre_parts':  a.nombre_parts,
            'pourcentage':   str(a.pourcentage) if a.pourcentage is not None else '0',
            'actif':         a.actif,
            'date_sortie':   str(a.date_sortie) if a.date_sortie else None,
        })
    return {'associes': associes_state, 'nouveau_associe_id': None}


def _restore_cession(cession):
    """Restore associés to snapshot_avant state."""
    from apps.registres.models import Associe
    snapshot = cession.snapshot_avant or {}

    # Collect all IDs of newly created associés (multi-party + legacy)
    ids_to_delete = list(cession.nouveaux_associes_ids or [])
    legacy_id = cession.nouveau_associe_id
    if legacy_id and legacy_id not in ids_to_delete:
        ids_to_delete.append(legacy_id)
    if ids_to_delete:
        Associe.objects.filter(id__in=ids_to_delete).delete()

    # Restore each associé to snapshot state
    for state in snapshot.get('associes', []):
        try:
            a = Associe.objects.get(id=state['id'])
            a.nombre_parts = state['nombre_parts']
            a.pourcentage  = state['pourcentage']
            a.actif        = state['actif']
            a.date_sortie  = state['date_sortie']
            a.save()
        except Associe.DoesNotExist:
            pass


# ── Serializers ───────────────────────────────────────────────────────────────

class AssocieInfoSerializer(serializers.Serializer):
    id           = serializers.IntegerField()
    nom          = serializers.SerializerMethodField()
    nombre_parts = serializers.IntegerField()
    pourcentage  = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    actif        = serializers.BooleanField()

    def get_nom(self, obj):
        if obj.ph:  return obj.ph.nom_complet
        if obj.pm:  return obj.pm.denomination
        return obj.nom_associe or '—'


class CessionSerializer(serializers.ModelSerializer):
    ra_numero              = serializers.CharField(source='ra.numero_ra', read_only=True)
    ra_denomination        = serializers.SerializerMethodField()
    cedant_nom             = serializers.SerializerMethodField()
    beneficiaire_nom       = serializers.SerializerMethodField()
    created_by_nom         = serializers.SerializerMethodField()
    validated_by_nom       = serializers.SerializerMethodField()
    can_annuler_valide     = serializers.SerializerMethodField()
    can_modifier_correctif = serializers.SerializerMethodField()

    # Explicit JSONField declarations so DRF uses the correct field type
    # regardless of the auto-mapping behaviour.
    lignes        = serializers.JSONField(required=False, default=list)
    cedants       = serializers.JSONField(required=False, default=list)
    cessionnaires = serializers.JSONField(required=False, default=list)

    class Meta:
        model  = Cession
        fields = [
            'id', 'uuid', 'numero_cession', 'ra', 'ra_numero', 'ra_denomination',
            'date_cession', 'statut', 'langue_acte', 'observations', 'demandeur',
            'associe_cedant', 'cedant_nom',
            'type_cession_parts', 'nombre_parts_cedees',
            'beneficiaire_type', 'beneficiaire_associe', 'beneficiaire_nom', 'beneficiaire_data',
            'lignes',
            'cedants', 'cessionnaires',
            'snapshot_avant', 'corrections',
            'created_at', 'updated_at', 'validated_at',
            'created_by', 'created_by_nom', 'validated_by', 'validated_by_nom',
            'can_annuler_valide', 'can_modifier_correctif',
        ]
        read_only_fields = ['uuid', 'numero_cession', 'created_at', 'updated_at', 'date_cession',
                            'snapshot_avant', 'corrections']

    def validate_lignes(self, value):
        """Structural validation of cession lines (brouillon-safe: no completeness checks)."""
        if not isinstance(value, list):
            raise serializers.ValidationError('lignes doit être une liste.')
        for i, ligne in enumerate(value):
            if not isinstance(ligne, dict):
                raise serializers.ValidationError(f'Ligne {i+1} : format invalide (objet JSON attendu).')
            cess_type = ligne.get('cessionnaire_type')
            if cess_type and cess_type not in ('EXISTANT', 'NOUVEAU'):
                raise serializers.ValidationError(
                    f'Ligne {i+1} : cessionnaire_type «{cess_type}» invalide (EXISTANT ou NOUVEAU).')
        return value

    def get_ra_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_cedant_nom(self, obj):
        if not obj.associe_cedant: return ''
        a = obj.associe_cedant
        if a.ph:  return a.ph.nom_complet
        if a.pm:  return a.pm.denomination
        return a.nom_associe or '—'

    def get_beneficiaire_nom(self, obj):
        if obj.beneficiaire_type == 'EXISTANT' and obj.beneficiaire_associe:
            a = obj.beneficiaire_associe
            if a.ph:  return a.ph.nom_complet
            if a.pm:  return a.pm.denomination
            return a.nom_associe or '—'
        if obj.beneficiaire_type == 'NOUVEAU':
            d = obj.beneficiaire_data or {}
            return f"{d.get('prenom','')} {d.get('nom','')}".strip() or '—'
        return ''

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.prenom} {obj.created_by.nom}".strip() or obj.created_by.login
        return ''

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.prenom} {obj.validated_by.nom}".strip() or obj.validated_by.login
        return ''

    def get_can_annuler_valide(self, obj):
        can, _ = _can_annuler_or_corriger_ces(obj)
        return can

    def get_can_modifier_correctif(self, obj):
        can, _ = _can_annuler_or_corriger_ces(obj)
        return can


# ── RA Lookup ─────────────────────────────────────────────────────────────────

class CessionRALookupView(APIView):
    """Lookup RA pour cession — agents tribunal + greffier (CDC §3.2)."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request):
        numero_ra = request.query_params.get('numero_ra', '').strip()
        if not numero_ra:
            return Response({'detail': 'numero_ra requis.'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            from apps.registres.models import RegistreAnalytique
            ra = RegistreAnalytique.objects.prefetch_related(
                'associes__ph', 'associes__pm', 'associes__nationalite'
            ).get(numero_ra=numero_ra)
        except RegistreAnalytique.DoesNotExist:
            return Response({'detail': f'Aucun dossier trouvé pour {numero_ra}.'}, status=http_status.HTTP_404_NOT_FOUND)

        if ra.type_entite not in ('PM', 'SC'):
            return Response({'detail': 'Les cessions de parts concernent uniquement les PM et SC.'},
                            status=http_status.HTTP_400_BAD_REQUEST)

        # ── Vérification bénéficiaire effectif ───────────────────────────────
        if ra.statut_be != 'DECLARE':
            return Response(
                {'detail': "Opération impossible : le bénéficiaire effectif n'a pas été déclaré "
                           "conformément aux exigences légales."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        associes = []
        for a in ra.associes.filter(actif=True).select_related('ph', 'pm', 'nationalite'):
            if a.ph:   nom = a.ph.nom_complet
            elif a.pm: nom = a.pm.denomination
            else:      nom = a.nom_associe or '—'
            associes.append({
                'id': a.id, 'nom': nom,
                'nationalite': str(a.nationalite) if a.nationalite else '',
                'nombre_parts': a.nombre_parts,
                'pourcentage': float(a.pourcentage) if a.pourcentage else 0,
                'actif': a.actif,
            })

        return Response({
            'id': ra.id, 'numero_ra': ra.numero_ra, 'type_entite': ra.type_entite,
            'denomination': ra.denomination, 'associes': associes,
        })


# ── CRUD ──────────────────────────────────────────────────────────────────────

class CessionListCreate(generics.ListCreateAPIView):
    """CDC §3.2 : cession — agents tribunal + greffier, cloisonnement par created_by."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = CessionSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['statut', 'ra']
    ordering         = ['-created_at']

    def get_queryset(self):
        qs = Cession.objects.select_related(
            'ra', 'associe_cedant__ph', 'associe_cedant__pm',
            'beneficiaire_associe__ph', 'beneficiaire_associe__pm',
            'created_by', 'validated_by',
        ).all()
        return filtrer_par_auteur(qs, self.request.user)

    def perform_create(self, serializer):
        from apps.demandes.views import _next_numero
        from rest_framework.exceptions import APIException
        try:
            numero = _next_numero('CES')
        except Exception as e:
            raise APIException(f'Erreur de numérotation : {e}')
        try:
            serializer.save(numero_cession=numero, created_by=self.request.user)
        except Exception as e:
            raise APIException(f'Erreur de sauvegarde : {e}')


class CessionDetail(generics.RetrieveUpdateAPIView):
    """CDC §3.2 : agents voient uniquement leurs dossiers."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = CessionSerializer

    def get_queryset(self):
        qs = Cession.objects.select_related(
            'ra', 'associe_cedant__ph', 'associe_cedant__pm',
            'beneficiaire_associe__ph', 'beneficiaire_associe__pm',
            'created_by', 'validated_by',
        ).all()
        return filtrer_par_auteur(qs, self.request.user)

    def perform_update(self, serializer):
        from rest_framework.exceptions import APIException
        try:
            serializer.save()
        except Exception as e:
            raise APIException(f'Erreur de mise à jour : {e}')


# ── Workflow actions ───────────────────────────────────────────────────────────

class CessionActionView(APIView):
    """CDC §6 : workflow cessions.
    Actions agents : soumettre. Actions greffier : retourner, valider, annuler."""
    permission_classes = [EstAgentTribunalOuGreffier]

    # Actions réservées au greffier (validation, retour, annulation post-validation,
    # modification corrective) — l'agent ne peut jamais déclencher ces actions.
    ACTIONS_GREFFIER = {'retourner', 'valider', 'annuler', 'annuler_valide', 'modifier_correctif'}
    # Actions réservées à l'agent (soumission) — le greffier ne peut pas soumettre
    # à sa propre place ; il retourne le dossier s'il faut des corrections.
    ACTIONS_AGENT    = {'soumettre'}

    def patch(self, request, pk, action):
        if action in self.ACTIONS_GREFFIER:
            if not EstGreffier().has_permission(request, self):
                return Response(
                    {'detail': 'Action réservée au greffier.'},
                    status=http_status.HTTP_403_FORBIDDEN,
                )
        if action in self.ACTIONS_AGENT:
            if EstGreffier().has_permission(request, self):
                return Response(
                    {'detail': "Le greffier ne peut pas soumettre un dossier. "
                               "Il lui appartient de le retourner à l'agent si des corrections sont nécessaires."},
                    status=http_status.HTTP_403_FORBIDDEN,
                )
        obj = generics.get_object_or_404(Cession, pk=pk)

        if action == 'soumettre':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response({'detail': 'Seul un brouillon ou un dossier retourné peut être soumis.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            lignes_data  = obj.lignes or []
            cedants_data = obj.cedants or []

            if lignes_data:
                # ── Validation mode lignes RCCM ───────────────────────────────
                from apps.registres.models import Associe as _Associe
                from collections import defaultdict

                for i, l in enumerate(lignes_data):
                    if not l.get('cedant_associe_id'):
                        return Response({'detail': f'Ligne {i+1} : cédant non défini.'},
                                        status=http_status.HTTP_400_BAD_REQUEST)
                    if not (l.get('nombre_parts', 0) > 0):
                        return Response({'detail': f'Ligne {i+1} : nombre de parts invalide.'},
                                        status=http_status.HTTP_400_BAD_REQUEST)
                    if l.get('cessionnaire_type') == 'EXISTANT' and not l.get('cessionnaire_associe_id'):
                        return Response({'detail': f'Ligne {i+1} : cessionnaire (existant) non défini.'},
                                        status=http_status.HTTP_400_BAD_REQUEST)
                    if l.get('cessionnaire_type') == 'NOUVEAU':
                        _type_p = l.get('cessionnaire_type_personne', 'PH')
                        if _type_p == 'PM':
                            if not (l.get('cessionnaire_denomination') or '').strip():
                                return Response(
                                    {'detail': f'Ligne {i+1} : dénomination de la personne morale (cessionnaire nouveau) obligatoire.'},
                                    status=http_status.HTTP_400_BAD_REQUEST,
                                )
                        else:  # PH (défaut)
                            if not (l.get('cessionnaire_nom') or '').strip():
                                return Response(
                                    {'detail': f'Ligne {i+1} : nom du cessionnaire personne physique (nouveau) obligatoire.'},
                                    status=http_status.HTTP_400_BAD_REQUEST,
                                )

                # Contrôle bloquant : total cédé par cédant ≤ parts détenues
                parts_cedees_by = defaultdict(int)
                for l in lignes_data:
                    parts_cedees_by[l['cedant_associe_id']] += l.get('nombre_parts', 0)

                for assoc_id, total in parts_cedees_by.items():
                    try:
                        assoc = _Associe.objects.get(id=assoc_id)
                        if total > assoc.nombre_parts:
                            return Response(
                                {'detail': f'Cédant « {assoc.nom_associe or assoc_id} » : '
                                           f'parts cédées ({total}) > parts disponibles ({assoc.nombre_parts}).'},
                                status=http_status.HTTP_400_BAD_REQUEST,
                            )
                    except _Associe.DoesNotExist:
                        return Response({'detail': f'Cédant {assoc_id} introuvable.'},
                                        status=http_status.HTTP_400_BAD_REQUEST)

            elif cedants_data:
                # ── Validation mode cedants/cessionnaires ─────────────────────
                for i, c in enumerate(cedants_data):
                    if not c.get('associe_id'):
                        return Response({'detail': f'Cédant {i+1} : associé non défini.'},
                                        status=http_status.HTTP_400_BAD_REQUEST)
                cess_data = obj.cessionnaires or []
                if not cess_data:
                    return Response({'detail': 'Au moins un cessionnaire est requis.'},
                                    status=http_status.HTTP_400_BAD_REQUEST)
                total_cede   = sum(c.get('nombre_parts', 0) for c in cedants_data)
                total_acquis = sum(c.get('nombre_parts', 0) for c in cess_data)
                if total_cede != total_acquis:
                    return Response(
                        {'detail': f'Déséquilibre : parts cédées ({total_cede}) ≠ parts acquises ({total_acquis}).'},
                        status=http_status.HTTP_400_BAD_REQUEST,
                    )
            else:
                # ── Validation mode héritage ──────────────────────────────────
                if not obj.associe_cedant:
                    return Response({'detail': 'Veuillez sélectionner un associé cédant.'},
                                    status=http_status.HTTP_400_BAD_REQUEST)
                if not obj.type_cession_parts:
                    return Response({'detail': 'Veuillez préciser le type de cession (totale/partielle).'},
                                    status=http_status.HTTP_400_BAD_REQUEST)
            obj.statut = 'EN_INSTANCE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Cession soumise au greffier.'})

        elif action == 'retourner':
            if obj.statut != 'EN_INSTANCE':
                return Response({'detail': 'Seul un dossier en instance peut être retourné.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            obs = request.data.get('observations', '').strip()
            obj.statut = 'RETOURNE'
            if obs:
                obj.observations = obs
            obj.save(update_fields=['statut', 'observations', 'updated_at'])
            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra, action='RETOUR_CESSION',
                reference_operation=obj.numero_cession,
                etat_avant={'statut': 'EN_INSTANCE'},
                etat_apres={'statut': 'RETOURNE', 'observations': obs},
                commentaire=f'Retour de {obj.numero_cession} à l\'agent. Motif : {obs}',
                created_by=request.user,
            )
            return Response({'statut': obj.statut, 'message': 'Dossier retourné à l\'agent.'})

        elif action == 'valider':
            if obj.statut != 'EN_INSTANCE':
                return Response({'detail': 'Seul un dossier en instance peut être validé.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            # Capture snapshot before applying
            snapshot = _capture_snapshot_avant(obj)
            try:
                nouveaux_ids = obj.appliquer()  # returns list[int]
            except Exception as e:
                return Response({'detail': f'Erreur lors de l\'application : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
            if nouveaux_ids:
                snapshot['nouveaux_associes_ids'] = nouveaux_ids
            obs = request.data.get('observations', '').strip()
            obj.statut                = 'VALIDE'
            obj.validated_at          = timezone.now()
            obj.validated_by          = request.user
            obj.snapshot_avant        = snapshot
            obj.nouveaux_associes_ids = nouveaux_ids
            obj.nouveau_associe_id    = nouveaux_ids[0] if nouveaux_ids else None  # legacy compat
            if obs:
                obj.observations = obs
            obj.save(update_fields=['statut', 'validated_at', 'validated_by', 'observations',
                                    'snapshot_avant', 'nouveau_associe_id', 'nouveaux_associes_ids',
                                    'updated_at'])
            from apps.registres.models import ActionHistorique
            if obj.lignes:
                etat_apres = {
                    'lignes':       obj.lignes,
                    'nouveaux_ids': nouveaux_ids,
                }
            elif obj.cedants:
                etat_apres = {
                    'cedants':        obj.cedants,
                    'cessionnaires':  obj.cessionnaires,
                    'nouveaux_ids':   nouveaux_ids,
                }
            else:
                etat_apres = {
                    'type_cession':       obj.type_cession_parts,
                    'nombre_parts_cedees': obj.nombre_parts_cedees,
                    'beneficiaire_type':  obj.beneficiaire_type,
                    'beneficiaire_data':  obj.beneficiaire_data,
                }
            ActionHistorique.objects.create(
                ra=obj.ra, action='VALIDATION_CESSION',
                reference_operation=obj.numero_cession,
                etat_avant=snapshot,
                etat_apres=etat_apres,
                commentaire=f'Validation de {obj.numero_cession}.' + (f' {obs}' if obs else ''),
                created_by=request.user,
            )
            return Response({'statut': obj.statut, 'message': 'Cession validée et appliquée.'})

        elif action == 'annuler':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response({'detail': 'Seul un brouillon ou dossier retourné peut être annulé.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            obj.statut = 'ANNULE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Cession annulée.'})

        elif action == 'annuler_valide':
            can, reason = _can_annuler_or_corriger_ces(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)
            try:
                _restore_cession(obj)
            except Exception as e:
                return Response({'detail': f'Erreur lors de la restauration : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
            obj.statut = 'ANNULE_GREFFIER'
            obj.save(update_fields=['statut', 'updated_at'])
            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra, action='ANNULATION_CESSION',
                reference_operation=obj.numero_cession,
                etat_avant=obj.snapshot_avant,
                etat_apres={'statut': 'ANNULE_GREFFIER', 'restaure': True},
                commentaire=f'Annulation de la cession {obj.numero_cession} par le greffier.',
                created_by=request.user,
            )
            return Response({'statut': obj.statut,
                             'message': f'Cession {obj.numero_cession} annulée. État précédent restauré.'})

        elif action == 'modifier_correctif':
            can, reason = _can_annuler_or_corriger_ces(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)

            data     = request.data
            is_lignes = bool(data.get('lignes'))
            is_multi  = bool(data.get('cedants')) and not is_lignes

            if not is_lignes and not is_multi:
                required = ['associe_cedant', 'type_cession_parts', 'beneficiaire_type']
                for f in required:
                    if f not in data:
                        return Response({'detail': f'Champ requis : {f}'}, status=http_status.HTTP_400_BAD_REQUEST)

            # Save correction history
            if obj.lignes:
                ancien_etat = {'lignes': obj.lignes}
            elif obj.cedants:
                ancien_etat = {'cedants': obj.cedants, 'cessionnaires': obj.cessionnaires}
            else:
                ancien_etat = {
                    'associe_cedant':       obj.associe_cedant_id,
                    'type_cession_parts':   obj.type_cession_parts,
                    'nombre_parts_cedees':  obj.nombre_parts_cedees,
                    'beneficiaire_type':    obj.beneficiaire_type,
                    'beneficiaire_associe': obj.beneficiaire_associe_id,
                    'beneficiaire_data':    obj.beneficiaire_data,
                }
            correction_entry = {
                'date':        timezone.now().isoformat(),
                'user':        request.user.login if request.user else '',
                'ancien_etat': ancien_etat,
                'nouvel_etat': data,
            }
            corrections = list(obj.corrections or [])
            corrections.append(correction_entry)

            # Restore previous state
            try:
                _restore_cession(obj)
            except Exception as e:
                return Response({'detail': f'Erreur lors de la restauration : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Apply corrected data
            if is_lignes:
                obj.lignes               = data['lignes']
                obj.cedants              = []
                obj.cessionnaires        = []
                obj.nouveaux_associes_ids = []
                obj.nouveau_associe_id   = None
            elif is_multi:
                obj.cedants              = data['cedants']
                obj.cessionnaires        = data.get('cessionnaires', [])
                obj.lignes               = []
                obj.nouveaux_associes_ids = []
                obj.nouveau_associe_id   = None
            else:
                obj.associe_cedant_id       = data['associe_cedant']
                obj.type_cession_parts      = data['type_cession_parts']
                obj.nombre_parts_cedees     = data.get('nombre_parts_cedees')
                obj.beneficiaire_type       = data['beneficiaire_type']
                obj.beneficiaire_associe_id = data.get('beneficiaire_associe')
                obj.beneficiaire_data       = data.get('beneficiaire_data', {})
                obj.lignes                  = []
                obj.nouveaux_associes_ids   = []
                obj.nouveau_associe_id      = None
            obj.corrections  = corrections
            obj.observations = data.get('observations', obj.observations)
            snapshot = _capture_snapshot_avant(obj)
            obj.snapshot_avant = snapshot
            obj.save()

            try:
                nouveaux_ids = obj.appliquer()
            except Exception as e:
                return Response({'detail': f'Erreur lors de l\'application corrective : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

            if nouveaux_ids:
                obj.nouveaux_associes_ids = nouveaux_ids
                obj.nouveau_associe_id    = nouveaux_ids[0]
                obj.snapshot_avant['nouveaux_associes_ids'] = nouveaux_ids
                obj.save(update_fields=['nouveau_associe_id', 'nouveaux_associes_ids', 'snapshot_avant'])

            from apps.registres.models import ActionHistorique
            ActionHistorique.objects.create(
                ra=obj.ra, action='CESSION_CORRECTIVE',
                reference_operation=obj.numero_cession,
                etat_avant=correction_entry['ancien_etat'],
                etat_apres=correction_entry['nouvel_etat'],
                commentaire=f'Correction de la cession {obj.numero_cession} par le greffier.',
                created_by=request.user,
            )
            return Response({'statut': obj.statut,
                             'message': f'Cession {obj.numero_cession} corrigée et réappliquée.'})

        return Response({'detail': 'Action inconnue.'}, status=http_status.HTTP_400_BAD_REQUEST)
