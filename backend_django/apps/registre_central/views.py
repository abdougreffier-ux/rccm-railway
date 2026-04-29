"""
apps.registre_central.views — Gestion des relevés mensuels et transmissions

Endpoints (réservés au greffier) :
  GET  /api/v1/releve/                   — liste des relevés mensuels
  POST /api/v1/releve/generer/           — générer un relevé pour une période
  POST /api/v1/releve/<id>/finaliser/    — finaliser un relevé (gel du contenu)
  POST /api/v1/releve/<id>/transmettre/  — transmettre au Registre Central
  GET  /api/v1/releve/<id>/transmissions/— journal des tentatives de transmission

Contraintes :
  • Seuls les actes VALIDÉS par le greffier sont inclus.
  • Un relevé FINALISE ne peut plus être modifié.
  • La transmission est asynchrone et non bloquante.
  • En l'absence d'URL_REGISTRE_CENTRAL configurée, la transmission est
    simulée (mode sandbox) — aucune erreur bloquante.
"""
import time
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework import status

from apps.core.permissions import EstGreffier
from apps.registre_central.models import ReleveActesMensuels, TransmissionReleveActes
from apps.registre_central.serializers import generer_contenu_releve


class ReleveListView(APIView):
    """GET /api/v1/releve/ — liste des relevés mensuels."""
    permission_classes = [EstGreffier]

    def get(self, request):
        qs = ReleveActesMensuels.objects.all()
        data = [
            {
                'id':                  r.id,
                'annee':               r.annee,
                'mois':                r.mois,
                'periode_label':       r.periode_label,
                'statut':              r.statut,
                'statut_label':        r.get_statut_display(),
                'nb_immatriculations': r.nb_immatriculations,
                'nb_modifications':    r.nb_modifications,
                'nb_cessions':         r.nb_cessions,
                'nb_radiations':       r.nb_radiations,
                'nb_actes_total':      r.nb_actes_total,
                'genere_le':           r.genere_le.isoformat(),
                'nb_transmissions':    r.transmissions.count(),
            }
            for r in qs
        ]
        return Response(data)


class GenererReleveView(APIView):
    """
    POST /api/v1/releve/generer/
    Body : { "annee": 2026, "mois": 4 }

    Génère un relevé mensuel pour la période indiquée.
    Si un relevé BROUILLON ou ERREUR existe déjà pour cette période,
    il est régénéré (mise à jour du contenu).
    """
    permission_classes = [EstGreffier]

    def post(self, request):
        annee = request.data.get('annee')
        mois  = request.data.get('mois')

        try:
            annee = int(annee)
            mois  = int(mois)
            if not (1900 <= annee <= 2100 and 1 <= mois <= 12):
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {'detail': 'annee (entier, 1900–2100) et mois (1–12) sont requis.'},
                status=400,
            )

        # Bloquer la re-génération d'un relevé déjà finalisé ou acquitté
        existant = ReleveActesMensuels.objects.filter(annee=annee, mois=mois).first()
        if existant and existant.statut in ('FINALISE', 'TRANSMIS', 'ACQUITTE'):
            return Response(
                {
                    'detail': (
                        f'Le relevé {annee}/{mois:02d} est en statut « {existant.get_statut_display()} » '
                        f'— impossible de le re-générer.'
                    ),
                },
                status=400,
            )

        # Génération du contenu
        contenu = generer_contenu_releve(annee, mois)
        stats   = contenu['statistiques']

        if existant:
            existant.actes_json          = contenu
            existant.nb_immatriculations = stats['nb_immatriculations']
            existant.nb_modifications    = stats['nb_modifications']
            existant.nb_cessions         = stats['nb_cessions']
            existant.nb_radiations       = stats['nb_radiations']
            existant.statut              = 'BROUILLON'
            existant.genere_par          = request.user
            existant.save()
            releve = existant
        else:
            releve = ReleveActesMensuels.objects.create(
                annee=annee,
                mois=mois,
                actes_json=contenu,
                nb_immatriculations=stats['nb_immatriculations'],
                nb_modifications=stats['nb_modifications'],
                nb_cessions=stats['nb_cessions'],
                nb_radiations=stats['nb_radiations'],
                statut='BROUILLON',
                genere_par=request.user,
            )

        return Response({
            'id':            releve.id,
            'periode':       f'{annee}/{mois:02d}',
            'statut':        releve.statut,
            'nb_actes':      stats['total'],
            'statistiques':  stats,
            'message':       f'Relevé {annee}/{mois:02d} généré avec succès ({stats["total"]} actes).',
        }, status=201)


class FinaliserReleveView(APIView):
    """
    POST /api/v1/releve/<id>/finaliser/
    Gèle le contenu du relevé — il ne pourra plus être re-généré.
    Pré-requis : statut BROUILLON ou ERREUR.
    """
    permission_classes = [EstGreffier]

    def post(self, request, pk):
        releve = get_object_or_404(ReleveActesMensuels, pk=pk)
        if releve.statut not in ('BROUILLON', 'ERREUR'):
            return Response(
                {'detail': f'Impossible de finaliser un relevé en statut « {releve.get_statut_display()} ».'},
                status=400,
            )
        releve.statut      = 'FINALISE'
        releve.finalise_le  = timezone.now()
        releve.finalise_par = request.user
        releve.save(update_fields=['statut', 'finalise_le', 'finalise_par'])
        return Response({
            'id':      releve.id,
            'statut':  releve.statut,
            'message': f'Relevé {releve.annee}/{releve.mois:02d} finalisé.',
        })


class TransmettreReleveView(APIView):
    """
    POST /api/v1/releve/<id>/transmettre/
    Transmet le relevé finalisé au Registre Central.

    Si URL_REGISTRE_CENTRAL n'est pas configurée (mode sandbox / intégration future),
    la transmission est simulée avec succès — aucun appel réseau réel n'est effectué.

    La transmission est journalisée dans TransmissionReleveActes quelle que soit
    l'issue (succès, échec, timeout, sandbox).
    """
    permission_classes = [EstGreffier]

    def post(self, request, pk):
        releve = get_object_or_404(ReleveActesMensuels, pk=pk)
        if releve.statut not in ('FINALISE', 'ERREUR'):
            return Response(
                {'detail': f'Seul un relevé FINALISÉ (ou ERREUR) peut être transmis. Statut actuel : « {releve.get_statut_display()} ».'},
                status=400,
            )

        url_centrale = getattr(settings, 'URL_REGISTRE_CENTRAL', '')
        tentative_n  = releve.transmissions.count() + 1

        transmission = TransmissionReleveActes.objects.create(
            releve=releve,
            tentative=tentative_n,
            url_cible=url_centrale or 'sandbox://non-configure',
            statut='EN_COURS',
            transmis_par=request.user,
        )

        if not url_centrale:
            # ── MODE SANDBOX — aucun appel réseau ─────────────────────────────
            # L'URL du Registre Central n'est pas encore configurée.
            # On simule un acquittement avec la référence sandbox.
            transmission.statut             = 'SUCCES'
            transmission.http_status        = 200
            transmission.reference_centrale = f'SANDBOX-{releve.annee}{releve.mois:02d}-{tentative_n:03d}'
            transmission.reponse_json       = {
                'statut':    'acquitté',
                'mode':      'sandbox',
                'reference': transmission.reference_centrale,
                'avertissement': (
                    'URL_REGISTRE_CENTRAL non configurée. '
                    'Configurer cette variable d\'environnement pour activer '
                    'la transmission réelle vers le Registre Central national.'
                ),
            }
            transmission.duree_ms = 0
            transmission.save()

            releve.statut = 'ACQUITTE'
            releve.save(update_fields=['statut'])

            return Response({
                'id_transmission':   transmission.id,
                'statut':            transmission.statut,
                'reference_centrale':transmission.reference_centrale,
                'mode':              'sandbox',
                'message':           'Transmission simulée (sandbox) — configurer URL_REGISTRE_CENTRAL pour la production.',
            })

        # ── TRANSMISSION RÉELLE ────────────────────────────────────────────────
        import urllib.request, urllib.error, json as _json
        headers = {
            'Content-Type':     'application/json; charset=utf-8',
            'X-RCCM-Source':    'RCCM-LOCAL',
            'X-RCCM-Periode':   f'{releve.annee}/{releve.mois:02d}',
        }
        # Clé d'API pour le Registre Central (optionnelle)
        cle_centrale = getattr(settings, 'CLE_API_REGISTRE_CENTRAL', '')
        if cle_centrale:
            headers['X-RCCM-API-Key'] = cle_centrale

        payload = _json.dumps(releve.actes_json, ensure_ascii=False).encode('utf-8')
        req     = urllib.request.Request(url_centrale, data=payload, headers=headers, method='POST')

        start = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                duree_ms      = int((time.monotonic() - start) * 1000)
                reponse_brute = resp.read().decode('utf-8')
                try:
                    reponse_json = _json.loads(reponse_brute)
                except Exception:
                    reponse_json = {'raw': reponse_brute}

                ref_centrale = (
                    reponse_json.get('reference') or
                    reponse_json.get('ref') or
                    reponse_json.get('id') or ''
                )
                transmission.statut             = 'SUCCES'
                transmission.http_status        = resp.status
                transmission.reference_centrale = str(ref_centrale)[:100]
                transmission.reponse_json       = reponse_json
                transmission.duree_ms           = duree_ms
                transmission.save()

                releve.statut = 'TRANSMIS' if not ref_centrale else 'ACQUITTE'
                releve.save(update_fields=['statut'])

        except urllib.error.HTTPError as e:
            duree_ms = int((time.monotonic() - start) * 1000)
            try:
                reponse_json = _json.loads(e.read().decode('utf-8'))
            except Exception:
                reponse_json = {'http_error': e.code}
            transmission.statut        = 'REJETE'
            transmission.http_status   = e.code
            transmission.reponse_json  = reponse_json
            transmission.erreur_detail = str(e)
            transmission.duree_ms      = duree_ms
            transmission.save()
            releve.statut = 'ERREUR'
            releve.save(update_fields=['statut'])

        except Exception as exc:
            duree_ms = int((time.monotonic() - start) * 1000)
            transmission.statut        = 'ECHEC'
            transmission.erreur_detail = str(exc)
            transmission.duree_ms      = duree_ms
            transmission.save()
            releve.statut = 'ERREUR'
            releve.save(update_fields=['statut'])

        return Response({
            'id_transmission':   transmission.id,
            'statut':            transmission.statut,
            'reference_centrale':transmission.reference_centrale or None,
            'http_status':       transmission.http_status,
            'erreur':            transmission.erreur_detail or None,
            'duree_ms':          transmission.duree_ms,
        })


class TransmissionsReleveView(APIView):
    """
    GET /api/v1/releve/<id>/transmissions/
    Journal des tentatives de transmission pour un relevé.
    """
    permission_classes = [EstGreffier]

    def get(self, request, pk):
        releve = get_object_or_404(ReleveActesMensuels, pk=pk)
        data = [
            {
                'id':                t.id,
                'tentative':         t.tentative,
                'statut':            t.statut,
                'statut_label':      t.get_statut_display(),
                'http_status':       t.http_status,
                'reference_centrale':t.reference_centrale or None,
                'url_cible':         t.url_cible,
                'duree_ms':          t.duree_ms,
                'erreur_detail':     t.erreur_detail or None,
                'transmis_le':       t.transmis_le.isoformat(),
                'transmis_par':      str(t.transmis_par) if t.transmis_par else None,
            }
            for t in releve.transmissions.order_by('tentative')
        ]
        return Response({
            'releve_id':       releve.id,
            'periode':         f'{releve.annee}/{releve.mois:02d}',
            'statut_releve':   releve.statut,
            'nb_tentatives':   len(data),
            'transmissions':   data,
        })
