from django.utils import timezone
from rest_framework import generics, serializers, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django_filters.rest_framework import DjangoFilterBackend
from .models import Modification, LigneModification
from apps.core.permissions import EstAgentTribunalOuGreffier, EstGreffier, filtrer_par_auteur, est_greffier


# ── Helpers ───────────────────────────────────────────────────────────────────

def _has_subsequent_ops(ra_id, after_dt, exclude_mod_id=None):
    """Return True if any validated operation on the RA was created after after_dt."""
    from apps.cessions.models import Cession
    from apps.radiations.models import Radiation
    mod_qs = Modification.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    if exclude_mod_id:
        mod_qs = mod_qs.exclude(id=exclude_mod_id)
    ces_qs = Cession.objects.filter(ra_id=ra_id, statut='VALIDE', validated_at__gt=after_dt)
    rad_qs = Radiation.objects.filter(ra_id=ra_id, statut='VALIDEE', validated_at__gt=after_dt)
    return mod_qs.exists() or ces_qs.exists() or rad_qs.exists()


def _can_annuler_or_corriger(obj):
    """Returns (can_do, reason) for greffier annulation/correction of a validated modification."""
    if obj.statut != 'VALIDE':
        return False, 'La modification n\'est pas dans un état validé.'
    if not obj.validated_at:
        return False, 'Date de validation manquante.'
    delta = timezone.now() - obj.validated_at
    if delta.days > 7:
        return False, f'Délai dépassé ({delta.days} jours — max 7 jours).'
    if _has_subsequent_ops(obj.ra_id, obj.validated_at, exclude_mod_id=obj.id):
        return False, 'Une opération ultérieure existe sur ce dossier.'
    return True, ''


def _capture_avant_donnees(modification):
    """Snapshot current entity + RA state before applying the modification."""
    ra = modification.ra
    avant = {'entity': {}, 'ra': {}}
    avant['ra']['numero_rc'] = ra.numero_rc or ''
    avant['ra']['localite_id'] = ra.localite_id

    entite = ra.entite
    if entite:
        if ra.type_entite == 'PM':
            fields = ['denomination', 'denomination_ar', 'sigle', 'forme_juridique_id',
                      'capital_social', 'devise_capital', 'duree_societe',
                      'siege_social', 'ville', 'telephone', 'fax', 'email', 'site_web', 'bp']
        elif ra.type_entite == 'PH':
            # On capture le snapshot civil (pour référence) mais l'identité n'est pas
            # modifiable via inscription modificative : nom/prenom ne sont pas dans ALLOWED.
            fields = ['nom', 'prenom', 'nom_ar', 'prenom_ar',
                      'adresse', 'adresse_ar', 'ville', 'telephone', 'email', 'profession']
        else:  # SC — capital_affecte exclu (non modifiable via inscription modificative)
            fields = ['denomination', 'denomination_ar', 'siege_social', 'ville',
                      'telephone', 'email']
        for f in fields:
            val = getattr(entite, f, None)
            avant['entity'][f] = str(val) if val is not None else ''

    # ── PM : capturer gérants / organes SA ──────────────────────────────────
    if ra.type_entite == 'PM':
        avant.setdefault('meta', {})
        try:
            _pm_est_sa = ra.est_sa
        except Exception:
            _pm_est_sa = False
        avant['meta']['est_sa'] = _pm_est_sa
        if not _pm_est_sa:
            # Non-SA : capturer gérants actifs
            _glist = []
            try:
                for _gm in ra.gerants.filter(actif=True):
                    _gdi = _gm.donnees_ident or {}
                    _glist.append({
                        'id': _gm.id,
                        'nom': _gdi.get('nom', '') or _gm.nom_gerant,
                        'prenom': _gdi.get('prenom', ''),
                        'nom_ar': _gdi.get('nom_ar', ''), 'prenom_ar': _gdi.get('prenom_ar', ''),
                        'nni': _gdi.get('nni', ''), 'adresse': _gdi.get('adresse', ''),
                        'telephone': _gdi.get('telephone', ''), 'fonction': _gdi.get('fonction', ''),
                        'nationalite_id': _gm.nationalite_id,
                    })
            except Exception:
                pass
            avant['meta']['gerants_pm_actifs'] = _glist
        else:
            # SA : capturer administrateurs, dirigeants, commissaires
            _adml = []
            try:
                for _am in ra.administrateurs.filter(actif=True):
                    _adml.append({
                        'id': _am.id,
                        'nom': _am.nom, 'prenom': _am.prenom or '',
                        'nom_ar': _am.nom_ar or '', 'prenom_ar': _am.prenom_ar or '',
                        'nni': _am.nni or '', 'num_passeport': _am.num_passeport or '',
                        'date_naissance': str(_am.date_naissance) if _am.date_naissance else '',
                        'lieu_naissance': _am.lieu_naissance or '',
                        'adresse': _am.adresse or '', 'telephone': _am.telephone or '',
                        'email': _am.email or '', 'fonction': _am.fonction or '',
                        'date_debut': str(_am.date_debut) if _am.date_debut else '',
                        'date_fin': str(_am.date_fin) if _am.date_fin else '',
                        'nationalite_id': _am.nationalite_id,
                    })
            except Exception:
                pass
            avant['meta']['administrateurs_actifs'] = _adml
            _dirl = []
            try:
                for _dm in ra.gerants.filter(actif=True):
                    _ddi = _dm.donnees_ident or {}
                    _dirl.append({
                        'id': _dm.id,
                        'nom': _ddi.get('nom', '') or _dm.nom_gerant,
                        'prenom': _ddi.get('prenom', ''),
                        'nom_ar': _ddi.get('nom_ar', ''), 'prenom_ar': _ddi.get('prenom_ar', ''),
                        'nni': _ddi.get('nni', ''), 'adresse': _ddi.get('adresse', ''),
                        'telephone': _ddi.get('telephone', ''), 'fonction': _ddi.get('fonction', ''),
                        'nationalite_id': _dm.nationalite_id,
                    })
            except Exception:
                pass
            avant['meta']['dirigeants_actifs'] = _dirl
            _coml = []
            try:
                for _cm in ra.commissaires.filter(actif=True):
                    _coml.append({
                        'id': _cm.id,
                        'nom': _cm.nom, 'prenom': _cm.prenom or '',
                        'nom_ar': _cm.nom_ar or '', 'prenom_ar': _cm.prenom_ar or '',
                        'type_commissaire': _cm.type_commissaire, 'role': _cm.role,
                        'nni': _cm.nni or '', 'num_passeport': _cm.num_passeport or '',
                        'date_naissance': str(_cm.date_naissance) if _cm.date_naissance else '',
                        'adresse': _cm.adresse or '', 'telephone': _cm.telephone or '',
                        'email': _cm.email or '', 'nationalite_id': _cm.nationalite_id,
                    })
            except Exception:
                pass
            avant['meta']['commissaires_actifs'] = _coml

    # ── PM : capturer objet_social depuis RC description ────────────────────
    if ra.type_entite == 'PM':
        import json as _j
        try:
            rc = (
                ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                          .order_by('-validated_at').first()
                or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
            )
            if rc and rc.description:
                desc = _j.loads(rc.description) if isinstance(rc.description, str) else {}
                avant['entity']['objet_social'] = desc.get('objet_social', '')
        except Exception:
            avant['entity']['objet_social'] = ''

    # ── SC : capturer activite depuis RC description ─────────────────────────
    # Compatibilité ascendante : l'ancienne implémentation stockait sous 'objet_social'.
    # On préfère 'activite', avec fallback sur 'objet_social' pour les données existantes.
    if ra.type_entite == 'SC':
        import json as _j
        try:
            rc = (
                ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                          .order_by('-validated_at').first()
                or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
            )
            if rc and rc.description:
                desc = _j.loads(rc.description) if isinstance(rc.description, str) else {}
                # Préférer 'activite', fallback sur 'objet_social' (ancien stockage SC)
                avant['entity']['activite'] = (
                    desc.get('activite', '') or desc.get('objet_social', '')
                )
        except Exception:
            avant['entity']['activite'] = ''

    # ── SC : capturer directeur actif ────────────────────────────────────────
    if ra.type_entite == 'SC':
        avant.setdefault('meta', {})
        try:
            directeur = ra.gerants.filter(actif=True).first()
            avant['meta']['directeur_actif_nom'] = directeur.nom_gerant if directeur else ''
        except Exception:
            avant['meta']['directeur_actif_nom'] = ''

    # ── PH : capturer nom_commercial (→ entity.denomination) et gérant actif ──
    if ra.type_entite == 'PH':
        import json as _j
        # Nom commercial (enseigne) → stocké dans entity.denomination pour le diff
        # Lecture depuis le RC d'immatriculation (source canonique)
        try:
            rc = (
                ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                          .order_by('-validated_at').first()
                or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
            )
            if rc and rc.description:
                desc = _j.loads(rc.description) if isinstance(rc.description, str) else {}
                # Compatibilité : clé 'denomination_commerciale' (immatriculation) ou 'denomination' (ancienne modif)
                avant['entity']['denomination'] = (
                    desc.get('denomination_commerciale', '')
                    or desc.get('denomination', '')
                )
        except Exception:
            avant['entity']['denomination'] = ''
        # Gérant actif → resté dans meta (traitement spécial à la validation)
        avant.setdefault('meta', {})
        try:
            gerant = ra.gerants.filter(actif=True).first()
            avant['meta']['gerant_actif_nom'] = gerant.nom_gerant if gerant else ''
        except Exception:
            avant['meta']['gerant_actif_nom'] = ''

    return avant


def _restore_avant_donnees(modification):
    """Restore entity + RA to the state captured in avant_donnees."""
    from apps.registres.models import RegistreAnalytique
    ra    = modification.ra
    avant = modification.avant_donnees or {}

    entity_data = avant.get('entity', {})
    ra_data     = avant.get('ra', {})

    # ── RÈGLE FONDAMENTALE ────────────────────────────────────────────────────
    # Ne jamais réécrire une entité centrale (personnes_morales, personnes_physiques,
    # succursales) si la modification ne portait pas sur des champs d'entité.
    # Une modification portant uniquement sur des organes sociaux (nominations,
    # révocations, démissions) ne doit JAMAIS déclencher un UPDATE sur l'entité.
    nd_entity = (modification.nouvelles_donnees or {}).get('entity', {})
    nd_ra     = (modification.nouvelles_donnees or {}).get('ra', {})

    entite = ra.entite
    if entite and entity_data and nd_entity:
        if ra.type_entite == 'PM':
            ALLOWED      = {'denomination', 'denomination_ar', 'sigle', 'forme_juridique_id',
                            'capital_social', 'devise_capital', 'duree_societe',
                            'siege_social', 'ville', 'telephone', 'fax', 'email', 'site_web', 'bp'}
            # Champs FK / numériques explicitement nullables en base
            _CAN_BE_NULL = {'forme_juridique_id', 'capital_social', 'duree_societe'}
        elif ra.type_entite == 'PH':
            # nom/prenom jamais modifiables — exclus de ALLOWED pour la restauration aussi
            ALLOWED      = {'adresse', 'adresse_ar', 'ville', 'telephone', 'email', 'profession'}
            _CAN_BE_NULL = set()
        else:  # SC — capital_affecte exclu (jamais modifiable)
            ALLOWED      = {'denomination', 'denomination_ar', 'siege_social', 'ville',
                            'telephone', 'email'}
            _CAN_BE_NULL = set()
        for field, value in entity_data.items():
            if field in ALLOWED:
                if field in _CAN_BE_NULL:
                    # FK / champs numériques nullables : chaîne vide → None (NULL en base)
                    setattr(entite, field, value if value not in ('', None) else None)
                else:
                    # CharField / TextField NOT NULL : jamais None — '' pour les valeurs vides
                    setattr(entite, field, value if value is not None else '')
        entite.save()

    # Champs RA : restaurer seulement si la modification portait sur le RA
    RA_ALLOWED  = {'numero_rc', 'localite_id'}
    RA_NULLABLE = {'localite_id'}   # ForeignKey null=True
    if ra_data and nd_ra:
        for field, value in ra_data.items():
            if field in RA_ALLOWED:
                if field in RA_NULLABLE:
                    setattr(ra, field, value if value not in ('', None) else None)
                else:
                    # CharField (numero_rc) : jamais None
                    setattr(ra, field, value if value is not None else '')
        ra.save()

    # ── PM : restaurer gérants / organes SA ──────────────────────────────────
    if ra.type_entite == 'PM':
        av_meta_pm = (modification.avant_donnees or {}).get('meta', {}) or {}
        _pm_est_sa_r = av_meta_pm.get('est_sa', False)
        if not _pm_est_sa_r:
            # Non-SA : restaurer gérants
            _glist_r = av_meta_pm.get('gerants_pm_actifs') or []
            if _glist_r:
                try:
                    from apps.registres.models import Gerant as _Gerant
                    ra.gerants.filter(actif=True).update(actif=False)
                    for _gd_r in _glist_r:
                        _gnom_r    = (_gd_r.get('nom') or '').strip()
                        _gprenom_r = (_gd_r.get('prenom') or '').strip()
                        _gnc_r = f"{_gprenom_r} {_gnom_r}".strip() if _gprenom_r else _gnom_r
                        if _gnc_r:
                            _gr = _Gerant.objects.create(ra=ra, type_gerant='PM',
                                                          nom_gerant=_gnc_r, actif=True)
                            _gdonnees_r = {k: v for k, v in _gd_r.items()
                                           if k in ('nom','prenom','nom_ar','prenom_ar',
                                                     'nni','adresse','telephone','fonction') and v}
                            if _gdonnees_r:
                                _gr.donnees_ident = _gdonnees_r
                            _gnat_r = _gd_r.get('nationalite_id')
                            if _gnat_r:
                                try:
                                    _gr.nationalite_id = int(_gnat_r)
                                except (TypeError, ValueError):
                                    pass
                            if _gdonnees_r or _gnat_r:
                                _gr.save(update_fields=['donnees_ident', 'nationalite_id', 'updated_at'])
                except Exception:
                    pass
        else:
            # SA : restaurer administrateurs, dirigeants, commissaires
            from apps.registres.models import (Administrateur as _Admin,
                                               CommissaireComptes as _Comm,
                                               Gerant as _Gerant)
            _adml_r = av_meta_pm.get('administrateurs_actifs') or []
            if _adml_r:
                try:
                    ra.administrateurs.filter(actif=True).update(actif=False)
                    for _ar in _adml_r:
                        _am_r = _Admin(ra=ra, actif=True)
                        for _af_r in ('nom','prenom','nom_ar','prenom_ar','nni','num_passeport',
                                       'adresse','telephone','email','fonction',
                                       'date_debut','date_fin','lieu_naissance','date_naissance'):
                            _av_r = _ar.get(_af_r)
                            if _av_r:
                                setattr(_am_r, _af_r, _av_r)
                        _anat_r = _ar.get('nationalite_id')
                        if _anat_r:
                            try:
                                _am_r.nationalite_id = int(_anat_r)
                            except (TypeError, ValueError):
                                pass
                        _am_r.save()
                except Exception:
                    pass
            _dirl_r = av_meta_pm.get('dirigeants_actifs') or []
            if _dirl_r:
                try:
                    ra.gerants.filter(actif=True).update(actif=False)
                    for _dr_r in _dirl_r:
                        _dnom_r    = (_dr_r.get('nom') or '').strip()
                        _dprenom_r = (_dr_r.get('prenom') or '').strip()
                        _dnc_r = f"{_dprenom_r} {_dnom_r}".strip() if _dprenom_r else _dnom_r
                        if _dnc_r:
                            _dg_r = _Gerant.objects.create(ra=ra, type_gerant='PM',
                                                            nom_gerant=_dnc_r, actif=True)
                            _ddonnees_r = {k: v for k, v in _dr_r.items()
                                           if k in ('nom','prenom','nom_ar','prenom_ar',
                                                     'nni','adresse','telephone','fonction') and v}
                            if _ddonnees_r:
                                _dg_r.donnees_ident = _ddonnees_r
                            _dnat_r = _dr_r.get('nationalite_id')
                            if _dnat_r:
                                try:
                                    _dg_r.nationalite_id = int(_dnat_r)
                                except (TypeError, ValueError):
                                    pass
                            if _ddonnees_r or _dnat_r:
                                _dg_r.save(update_fields=['donnees_ident', 'nationalite_id', 'updated_at'])
                except Exception:
                    pass
            _coml_r = av_meta_pm.get('commissaires_actifs') or []
            if _coml_r:
                try:
                    ra.commissaires.filter(actif=True).update(actif=False)
                    for _cr in _coml_r:
                        _cm_r = _Comm(ra=ra, actif=True)
                        for _cf_r in ('nom','prenom','nom_ar','prenom_ar','nni','num_passeport',
                                       'adresse','telephone','email','type_commissaire','role',
                                       'date_debut','date_fin','lieu_naissance','date_naissance'):
                            _cv_r = _cr.get(_cf_r)
                            if _cv_r:
                                setattr(_cm_r, _cf_r, _cv_r)
                        _cnat_r = _cr.get('nationalite_id')
                        if _cnat_r:
                            try:
                                _cm_r.nationalite_id = int(_cnat_r)
                            except (TypeError, ValueError):
                                pass
                        _cm_r.save()
                except Exception:
                    pass

    # ── PM : restaurer objet_social vers RC description ─────────────────────
    if ra.type_entite == 'PM':
        import json as _j
        av_entity_pm = (modification.avant_donnees or {}).get('entity', {})
        objet_social_avant = av_entity_pm.get('objet_social', '')
        if objet_social_avant is not None:
            try:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    desc = (_j.loads(rc.description)
                            if isinstance(rc.description, str) else dict(rc.description or {}))
                    desc['objet_social'] = objet_social_avant
                    rc.description = _j.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])
            except Exception:
                pass

    # ── SC : restaurer activite vers RC description ───────────────────────────
    if ra.type_entite == 'SC':
        import json as _j
        av_entity_sc = (modification.avant_donnees or {}).get('entity', {})
        activite_avant = av_entity_sc.get('activite', '')
        if activite_avant is not None:
            try:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    desc = (_j.loads(rc.description)
                            if isinstance(rc.description, str) else dict(rc.description or {}))
                    desc['activite'] = activite_avant
                    rc.description = _j.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])
            except Exception:
                pass

    # ── SC : restaurer directeur ──────────────────────────────────────────────
    if ra.type_entite == 'SC':
        import json as _j  # noqa – may already be imported
        av_meta_sc = (modification.avant_donnees or {}).get('meta', {})
        directeur_avant = av_meta_sc.get('directeur_actif_nom', '')
        if directeur_avant:
            try:
                from apps.registres.models import Gerant as _Gerant
                ra.gerants.filter(actif=True).update(actif=False)
                _Gerant.objects.create(
                    ra=ra, type_gerant='SC',
                    nom_gerant=directeur_avant, actif=True,
                )
            except Exception:
                pass

    # ── PH : restaurer nom_commercial (entity.denomination → RC) et gérant ─────
    if ra.type_entite == 'PH':
        import json as _j
        av_entity = (modification.avant_donnees or {}).get('entity', {})
        av_meta   = (modification.avant_donnees or {}).get('meta', {})

        # Nom commercial → restauré depuis entity.denomination vers RC description
        nom_commercial_avant = av_entity.get('denomination', '')
        if nom_commercial_avant is not None:
            try:
                # Restaurer sur le RC d'immatriculation (source canonique)
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    desc = (_j.loads(rc.description)
                            if isinstance(rc.description, str) else dict(rc.description or {}))
                    # Écrire sous la clé canonique denomination_commerciale
                    desc['denomination_commerciale'] = nom_commercial_avant
                    rc.description = _j.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])
            except Exception:
                pass

        # Gérant → restauré depuis meta
        gerant_avant = av_meta.get('gerant_actif_nom', '')
        if gerant_avant:
            try:
                from apps.registres.models import Gerant as _Gerant
                ra.gerants.filter(actif=True).update(actif=False)
                _Gerant.objects.create(
                    ra=ra, type_gerant='PH',
                    nom_gerant=gerant_avant, actif=True,
                )
            except Exception:
                pass


# ── Label map pour LigneModification ─────────────────────────────────────────
_FIELD_LABELS_MODIF = {
    'denomination': 'Dénomination', 'denomination_ar': 'Dénomination (AR)',
    'sigle': 'Sigle', 'forme_juridique_id': 'Forme juridique',
    'capital_social': 'Capital social', 'devise_capital': 'Devise du capital',
    'duree_societe': 'Durée de la société', 'siege_social': 'Siège social',
    'objet_social': 'Objet social',
    'ville': 'Ville', 'telephone': 'Téléphone', 'fax': 'Fax',
    'email': 'E-mail', 'site_web': 'Site web', 'bp': 'B.P.',
    'nom': 'Nom', 'prenom': 'Prénom', 'nom_ar': 'Nom (AR)', 'prenom_ar': 'Prénom (AR)',
    'adresse': 'Adresse', 'adresse_ar': 'Adresse (AR)', 'profession': 'Profession / Activité exercée',
    'nom_commercial': 'Nom commercial (enseigne)',
    'gerant_nom': 'Gérant',
    'directeur_nom': 'Directeur',
    'capital_affecte': 'Capital affecté',
    'activite': 'Activité',
    'numero_rc': 'N° RC', 'localite_id': 'Localité',
    'gerants_pm': 'Gérant(s)', 'administrateurs': 'Conseil d\'administration',
    'dirigeants': 'Dirigeant(s) (DG/PDG)', 'commissaires': 'Commissaire(s) aux comptes',
}


def _peupler_lignes_modification(obj, avant):
    """Déduit et insère les LigneModification en comparant avant_donnees vs nouvelles_donnees."""
    nd        = obj.nouvelles_donnees or {}
    av        = avant or {}
    av_entity = av.get('entity', {})
    av_ra     = av.get('ra', {})
    nd_entity = nd.get('entity', {})
    nd_ra     = nd.get('ra', {})

    is_ph = obj.ra.type_entite == 'PH'

    lignes = []
    # Cache des formes juridiques pour la résolution ID → libellé
    _fj_cache = {}
    def _resolve_fj(val):
        """Résout un ID de forme juridique en libellé lisible."""
        if not val:
            return str(val) if val is not None else ''
        key = str(val)
        if key not in _fj_cache:
            try:
                from apps.parametrage.models import FormeJuridique
                fj = FormeJuridique.objects.get(pk=val)
                _fj_cache[key] = f"{fj.code} – {fj.libelle_fr}" if fj.code else fj.libelle_fr
            except Exception:
                _fj_cache[key] = key
        return _fj_cache[key]

    is_sc = obj.ra.type_entite == 'SC'

    for champ, nouvelle_val in nd_entity.items():
        if nouvelle_val in ('', None):
            continue
        # ── SC : normaliser objet_social → activite (compat. ancienne implémentation) ─
        champ_effectif = champ
        if is_sc and champ == 'objet_social':
            champ_effectif = 'activite'
        ancienne_val = av_entity.get(champ_effectif, '') or av_entity.get(champ, '')
        if str(nouvelle_val) != str(ancienne_val if ancienne_val is not None else ''):
            # Pour PH : denomination = nom commercial (enseigne), pas la raison sociale
            if is_ph and champ_effectif == 'denomination':
                libelle = 'Nom commercial (enseigne)'
            elif is_sc and champ_effectif == 'activite':
                libelle = 'Activité'
            else:
                libelle = _FIELD_LABELS_MODIF.get(champ_effectif, champ_effectif)
            # Résolution des valeurs de référence (ID → libellé)
            if champ == 'forme_juridique_id':
                nouvelle_val_str  = _resolve_fj(nouvelle_val)
                ancienne_val_str  = _resolve_fj(ancienne_val) if ancienne_val else ''
            else:
                nouvelle_val_str  = str(nouvelle_val)
                ancienne_val_str  = str(ancienne_val) if ancienne_val is not None else ''
            lignes.append(LigneModification(
                modification=obj,
                code_champ=champ_effectif,  # code canonique (activite pour SC, pas objet_social)
                libelle_champ=libelle,
                ancienne_valeur=ancienne_val_str,
                nouvelle_valeur=nouvelle_val_str,
            ))
    for champ, nouvelle_val in nd_ra.items():
        if nouvelle_val in ('', None):
            continue
        ancienne_val = av_ra.get(champ, '')
        if str(nouvelle_val) != str(ancienne_val if ancienne_val is not None else ''):
            lignes.append(LigneModification(
                modification=obj,
                code_champ=f'ra_{champ}',
                libelle_champ=_FIELD_LABELS_MODIF.get(champ, champ),
                ancienne_valeur=str(ancienne_val) if ancienne_val is not None else '',
                nouvelle_valeur=str(nouvelle_val),
            ))
    # ── Champ meta PH : gérant uniquement (denomination est maintenant dans entity) ─
    nd_meta = nd.get('meta', {}) or {}
    av_meta = av.get('meta', {}) or {}

    if nd_meta.get('nouveau_gerant_nom'):
        ancienne = str(av_meta.get('gerant_actif_nom', ''))
        nouvelle = str(nd_meta['nouveau_gerant_nom'])
        if nouvelle != ancienne:
            lignes.append(LigneModification(
                modification=obj, code_champ='gerant_nom',
                libelle_champ=_FIELD_LABELS_MODIF.get('gerant_nom', 'Gérant'),
                ancienne_valeur=ancienne, nouvelle_valeur=nouvelle,
            ))

    # Directeur SC — nouveau format objet ou ancien format chaîne (compat.)
    _dir_obj = nd_meta.get('nouveau_directeur') or {}
    if not _dir_obj and nd_meta.get('nouveau_directeur_nom'):
        _dir_obj = {'nom': nd_meta['nouveau_directeur_nom']}
    if _dir_obj:
        _d_nom    = (_dir_obj.get('nom')    or '').strip()
        _d_prenom = (_dir_obj.get('prenom') or '').strip()
        nouvelle  = f"{_d_prenom} {_d_nom}".strip() if _d_prenom else _d_nom
        ancienne  = str(av_meta.get('directeur_actif_nom', ''))
        if nouvelle and nouvelle != ancienne:
            lignes.append(LigneModification(
                modification=obj, code_champ='directeur_nom',
                libelle_champ=_FIELD_LABELS_MODIF.get('directeur_nom', 'Directeur'),
                ancienne_valeur=ancienne, nouvelle_valeur=nouvelle,
            ))

    # ── PM : organes (gérants, administrateurs, dirigeants, commissaires) ─────
    def _format_organ_list(lst):
        """Résume une liste d'organes en chaîne lisible."""
        if not lst or not isinstance(lst, list):
            return ''
        parts = []
        for o in lst:
            if isinstance(o, dict):
                nom    = o.get('nom') or o.get('nom_ar') or ''
                prenom = o.get('prenom') or o.get('prenom_ar') or ''
                fn     = o.get('fonction') or ''
                label  = f"{prenom} {nom}".strip() if prenom else nom
                if fn:
                    label = f"{label} ({fn})"
                if label:
                    parts.append(label)
        return ' ; '.join(parts)

    for _org_key in ('gerants_pm', 'administrateurs', 'dirigeants', 'commissaires'):
        _nd_val = nd_meta.get(_org_key)
        if _nd_val and isinstance(_nd_val, list):
            _av_key_map = {
                'gerants_pm':    'gerants_pm_actifs',
                'administrateurs': 'administrateurs_actifs',
                'dirigeants':    'dirigeants_actifs',
                'commissaires':  'commissaires_actifs',
            }
            _av_val = av_meta.get(_av_key_map.get(_org_key, _org_key), [])
            _nouvelle_str = _format_organ_list(_nd_val)
            _ancienne_str = _format_organ_list(_av_val) if isinstance(_av_val, list) else str(_av_val)
            if _nouvelle_str != _ancienne_str:
                lignes.append(LigneModification(
                    modification=obj, code_champ=_org_key,
                    libelle_champ=_FIELD_LABELS_MODIF.get(_org_key, _org_key),
                    ancienne_valeur=_ancienne_str,
                    nouvelle_valeur=_nouvelle_str,
                ))

    # ── PM : nouveau format événementiel ─────────────────────────────────────
    # evenements_organes  : { gerants|administrateurs|dirigeants|commissaires : [{id, sort, date_effet, ref_decision, remplacant}] }
    # nouvelles_nominations : { ... : [{...champs organe...}] }
    _ev_org    = nd_meta.get('evenements_organes')    or {}
    _nouv_nom  = nd_meta.get('nouvelles_nominations') or {}

    if _ev_org or _nouv_nom:
        _SORT_LABELS_EV = {
            'DEMISSION':  'Démission',
            'REVOCATION': 'Révocation',
            'FIN_MANDAT': 'Fin de mandat',
        }
        _ORG_TYPE_LABELS = {
            'gerants':        'Gérant(s)',
            'administrateurs': 'Conseil d\'administration',
            'dirigeants':     'Dirigeant(s) — DG/PDG',
            'commissaires':   'Commissaire(s) aux comptes',
        }
        _AV_ORG_KEY = {
            'gerants':        'gerants_pm_actifs',
            'administrateurs': 'administrateurs_actifs',
            'dirigeants':     'dirigeants_actifs',
            'commissaires':   'commissaires_actifs',
        }

        def _fmt_org(o):
            """Formate un dict organe en chaîne lisible mono-ligne."""
            if not isinstance(o, dict):
                return str(o) if o else '—'
            nom    = (o.get('nom')    or o.get('nom_ar')    or '').strip()
            prenom = (o.get('prenom') or o.get('prenom_ar') or '').strip()
            fn     = (o.get('fonction') or o.get('role') or '').strip()
            label  = f"{prenom} {nom}".strip() if prenom else nom
            if fn:
                label = f"{label} ({fn})"
            return label or '—'

        # ── Événements sur organes existants ─────────────────────────────────
        for _type_key, _ev_list in _ev_org.items():
            if not isinstance(_ev_list, list):
                continue
            _type_label = _ORG_TYPE_LABELS.get(_type_key, _type_key)
            # Construire un index id→snapshot depuis avant_donnees
            _av_idx = {
                str(o.get('id', '')): o
                for o in (av_meta.get(_AV_ORG_KEY.get(_type_key, ''), []) or [])
                if isinstance(o, dict) and o.get('id')
            }
            for _ev in _ev_list:
                if not isinstance(_ev, dict):
                    continue
                _sort = _ev.get('sort', 'MAINTENU')
                if _sort == 'MAINTENU':
                    continue
                _org_id      = str(_ev.get('id', ''))
                _existing    = _av_idx.get(_org_id, {})
                _date_effet  = (_ev.get('date_effet')   or '').strip()
                _ref_dec     = (_ev.get('ref_decision') or '').strip()
                _sort_label  = _SORT_LABELS_EV.get(_sort, _sort)

                # Ancienne valeur : identité de l'organe sortant
                _ancienne = _fmt_org(_existing)

                # Nouvelle valeur : événement juridique
                _parties = [f"[{_sort_label}]"]
                if _date_effet:
                    _parties.append(f"Effet le {_date_effet}")
                if _ref_dec:
                    _parties.append(f"Décision : {_ref_dec}")
                _nouvelle = " — ".join(_parties)

                lignes.append(LigneModification(
                    modification=obj,
                    code_champ=f'{_type_key}_sortie',
                    libelle_champ=f"{_type_label} — Sortie",
                    ancienne_valeur=_ancienne,
                    nouvelle_valeur=_nouvelle,
                ))

                # Si un remplaçant est désigné → ligne entrée corrélée
                _rempl = _ev.get('remplacant')
                if _rempl and isinstance(_rempl, dict):
                    _rempl_label = _fmt_org(_rempl)
                    lignes.append(LigneModification(
                        modification=obj,
                        code_champ=f'{_type_key}_nomination',
                        libelle_champ=f"{_type_label} — Remplacement",
                        ancienne_valeur=_ancienne,
                        nouvelle_valeur=f"[Remplacement] {_rempl_label}",
                    ))

        # ── Nouvelles nominations (sans sortie d'organe existant) ─────────────
        for _type_key, _nom_list in _nouv_nom.items():
            if not isinstance(_nom_list, list) or not _nom_list:
                continue
            _type_label = _ORG_TYPE_LABELS.get(_type_key, _type_key)
            for _nom in _nom_list:
                if not isinstance(_nom, dict):
                    continue
                _nom_label = _fmt_org(_nom)
                if _nom_label and _nom_label != '—':
                    lignes.append(LigneModification(
                        modification=obj,
                        code_champ=f'{_type_key}_nomination',
                        libelle_champ=f"{_type_label} — Nouvelle nomination",
                        ancienne_valeur='—',
                        nouvelle_valeur=f"[Nomination] {_nom_label}",
                    ))

    if lignes:
        LigneModification.objects.bulk_create(lignes)


# ── Serializers ───────────────────────────────────────────────────────────────

class LigneModificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LigneModification
        fields = ['id', 'code_champ', 'libelle_champ', 'ancienne_valeur', 'nouvelle_valeur']


class ModificationSerializer(serializers.ModelSerializer):
    lignes               = LigneModificationSerializer(many=True, read_only=True)
    ra_numero            = serializers.CharField(source='ra.numero_ra', read_only=True)
    ra_type_entite       = serializers.CharField(source='ra.type_entite', read_only=True)
    ra_denomination      = serializers.SerializerMethodField()
    created_by_nom       = serializers.SerializerMethodField()
    validated_by_nom     = serializers.SerializerMethodField()
    can_annuler_valide   = serializers.SerializerMethodField()
    can_modifier_correctif = serializers.SerializerMethodField()

    class Meta:
        model  = Modification
        fields = [
            'id', 'uuid', 'numero_modif', 'ra', 'ra_numero', 'ra_type_entite', 'ra_denomination',
            'chrono', 'demande', 'date_modif', 'statut', 'langue_acte', 'observations', 'demandeur',
            'nouvelles_donnees', 'avant_donnees', 'corrections', 'lignes',
            'created_at', 'updated_at', 'validated_at',
            'created_by', 'created_by_nom', 'validated_by', 'validated_by_nom',
            'can_annuler_valide', 'can_modifier_correctif',
            'est_rectification_greffier',
        ]
        read_only_fields = ['uuid', 'numero_modif', 'created_at', 'updated_at', 'date_modif',
                            'avant_donnees', 'corrections']

    est_rectification_greffier = serializers.SerializerMethodField()

    def get_est_rectification_greffier(self, obj):
        """True si cette modification a été initiée par le greffier (rectification post-immat)."""
        return est_greffier(obj.created_by) if obj.created_by else False

    def get_ra_denomination(self, obj):
        return obj.ra.denomination if obj.ra else ''

    def get_created_by_nom(self, obj):
        if obj.created_by:
            return f"{obj.created_by.prenom} {obj.created_by.nom}".strip() or obj.created_by.login
        return ''

    def get_validated_by_nom(self, obj):
        if obj.validated_by:
            return f"{obj.validated_by.prenom} {obj.validated_by.nom}".strip() or obj.validated_by.login
        return ''

    def get_can_annuler_valide(self, obj):
        can, _ = _can_annuler_or_corriger(obj)
        return can

    def get_can_modifier_correctif(self, obj):
        can, _ = _can_annuler_or_corriger(obj)
        return can


# ── RA Lookup (for form auto-fill) ────────────────────────────────────────────

class ModificationRALookupView(APIView):
    """Lookup RA pour modification — agents tribunal + greffier (CDC §3.2)."""
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request):
        numero_ra = request.query_params.get('numero_ra', '').strip()
        if not numero_ra:
            return Response({'detail': 'numero_ra requis.'}, status=http_status.HTTP_400_BAD_REQUEST)
        try:
            from apps.registres.models import RegistreAnalytique
            ra = RegistreAnalytique.objects.select_related('ph', 'pm', 'sc', 'localite').get(numero_ra=numero_ra)
        except RegistreAnalytique.DoesNotExist:
            return Response({'detail': f'Aucun dossier trouvé pour {numero_ra}.'}, status=http_status.HTTP_404_NOT_FOUND)

        # ── Vérification bénéficiaire effectif ───────────────────────────────
        # L'obligation BE ne s'applique qu'aux PM (et SC).
        # Les personnes physiques (PH) en sont exclues par principe juridique.
        if ra.type_entite != 'PH' and ra.statut_be != 'DECLARE':
            return Response(
                {'detail': "Opération impossible : le bénéficiaire effectif n'a pas été déclaré "
                           "conformément aux exigences légales."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        data = {
            'id': ra.id, 'numero_ra': ra.numero_ra, 'numero_rc': ra.numero_rc,
            'type_entite': ra.type_entite, 'denomination': ra.denomination,
            'statut': ra.statut, 'localite_id': ra.localite_id,
            'localite': str(ra.localite) if ra.localite else '',
            'date_immatriculation': str(ra.date_immatriculation) if ra.date_immatriculation else '',
        }

        if ra.type_entite == 'PM' and ra.pm:
            import json as _j
            pm = ra.pm
            # Objet social depuis le RC d'immatriculation (source canonique)
            objet_social_pm = ''
            try:
                rc_pm = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc_pm and rc_pm.description:
                    desc_pm = _j.loads(rc_pm.description) if isinstance(rc_pm.description, str) else {}
                    objet_social_pm = desc_pm.get('objet_social', '') or desc_pm.get('activite', '')
            except Exception:
                pass
            # est_sa + organes courants
            try:
                _est_sa = ra.est_sa
            except Exception:
                _est_sa = False
            data['est_sa'] = _est_sa
            # Gérants actifs (PM non-SA)
            _gerants_actifs = []
            if not _est_sa:
                try:
                    for _g in ra.gerants.filter(actif=True):
                        _di = _g.donnees_ident or {}
                        _gerants_actifs.append({
                            'id': _g.id, 'nom': _di.get('nom', '') or _g.nom_gerant,
                            'prenom': _di.get('prenom', ''),
                            'nom_ar': _di.get('nom_ar', ''), 'prenom_ar': _di.get('prenom_ar', ''),
                            'nni': _di.get('nni', ''), 'adresse': _di.get('adresse', ''),
                            'telephone': _di.get('telephone', ''),
                            'fonction': _di.get('fonction', ''),
                            'nationalite_id': _g.nationalite_id,
                        })
                except Exception:
                    pass
            data['gerants_actifs'] = _gerants_actifs
            # Administrateurs actifs (SA)
            _admins_actifs = []
            _dirigeants_actifs = []
            _comms_actifs = []
            if _est_sa:
                try:
                    for _adm in ra.administrateurs.filter(actif=True):
                        _admins_actifs.append({
                            'id': _adm.id, 'nom': _adm.nom, 'prenom': _adm.prenom,
                            'nom_ar': _adm.nom_ar or '', 'prenom_ar': _adm.prenom_ar or '',
                            'nni': _adm.nni or '', 'num_passeport': _adm.num_passeport or '',
                            'date_naissance': str(_adm.date_naissance) if _adm.date_naissance else '',
                            'lieu_naissance': _adm.lieu_naissance or '',
                            'adresse': _adm.adresse or '', 'telephone': _adm.telephone or '',
                            'email': _adm.email or '', 'fonction': _adm.fonction or '',
                            'date_debut': str(_adm.date_debut) if _adm.date_debut else '',
                            'date_fin': str(_adm.date_fin) if _adm.date_fin else '',
                            'nationalite_id': _adm.nationalite_id,
                        })
                except Exception:
                    pass
                try:
                    for _dg in ra.gerants.filter(actif=True):
                        _ddi = _dg.donnees_ident or {}
                        _dirigeants_actifs.append({
                            'id': _dg.id, 'nom': _ddi.get('nom', '') or _dg.nom_gerant,
                            'prenom': _ddi.get('prenom', ''),
                            'nom_ar': _ddi.get('nom_ar', ''), 'prenom_ar': _ddi.get('prenom_ar', ''),
                            'nni': _ddi.get('nni', ''), 'adresse': _ddi.get('adresse', ''),
                            'telephone': _ddi.get('telephone', ''),
                            'fonction': _ddi.get('fonction', ''),
                            'nationalite_id': _dg.nationalite_id,
                        })
                except Exception:
                    pass
                try:
                    for _comm in ra.commissaires.filter(actif=True):
                        _comms_actifs.append({
                            'id': _comm.id, 'nom': _comm.nom, 'prenom': _comm.prenom or '',
                            'nom_ar': _comm.nom_ar or '', 'prenom_ar': _comm.prenom_ar or '',
                            'type_commissaire': _comm.type_commissaire,
                            'role': _comm.role,
                            'nni': _comm.nni or '', 'num_passeport': _comm.num_passeport or '',
                            'date_naissance': str(_comm.date_naissance) if _comm.date_naissance else '',
                            'adresse': _comm.adresse or '', 'telephone': _comm.telephone or '',
                            'email': _comm.email or '',
                            'nationalite_id': _comm.nationalite_id,
                        })
                except Exception:
                    pass
            data['administrateurs_actifs'] = _admins_actifs
            data['dirigeants_actifs']      = _dirigeants_actifs
            data['commissaires_actifs']    = _comms_actifs
            data['entity'] = {
                'id': pm.id, 'denomination': pm.denomination, 'denomination_ar': pm.denomination_ar,
                'sigle': pm.sigle, 'forme_juridique_id': pm.forme_juridique_id,
                'forme_juridique': str(pm.forme_juridique) if pm.forme_juridique else '',
                'capital_social': str(pm.capital_social) if pm.capital_social else '',
                'devise_capital': pm.devise_capital, 'duree_societe': pm.duree_societe,
                'siege_social': pm.siege_social, 'ville': pm.ville, 'telephone': pm.telephone,
                'fax': pm.fax, 'email': pm.email, 'site_web': pm.site_web, 'bp': pm.bp,
                'objet_social': objet_social_pm,
            }
        elif ra.type_entite == 'PH' and ra.ph:
            import json as _j
            ph = ra.ph
            # Nom commercial depuis le RC d'immatriculation (source canonique)
            nom_com = ''
            try:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc and rc.description:
                    desc = _j.loads(rc.description) if isinstance(rc.description, str) else {}
                    # Compatibilité : clé 'denomination_commerciale' (immatriculation) ou 'denomination' (ancienne modif)
                    nom_com = desc.get('denomination_commerciale', '') or desc.get('denomination', '')
            except Exception:
                pass
            # Gérant actif
            gerant_actif = ''
            try:
                g = ra.gerants.filter(actif=True).first()
                gerant_actif = g.nom_gerant if g else ''
            except Exception:
                pass
            data['entity'] = {
                'id': ph.id, 'nom': ph.nom, 'prenom': ph.prenom,
                'nom_ar': ph.nom_ar, 'prenom_ar': ph.prenom_ar,
                'adresse': ph.adresse, 'adresse_ar': ph.adresse_ar or '',
                'ville': ph.ville, 'telephone': ph.telephone,
                'email': ph.email, 'profession': ph.profession,
                'denomination_commerciale': nom_com,
                'gerant_actif': gerant_actif,
            }
        elif ra.type_entite == 'SC' and ra.sc:
            import json as _j
            sc = ra.sc
            # Objet social et activité depuis RC description
            objet_social_sc = ''
            activite_sc = ''
            try:
                rc_sc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc_sc and rc_sc.description:
                    desc_sc = _j.loads(rc_sc.description) if isinstance(rc_sc.description, str) else {}
                    objet_social_sc = desc_sc.get('objet_social', '')
                    activite_sc     = desc_sc.get('activite', '')
            except Exception:
                pass
            # Directeur actif
            directeur_actif_sc = ''
            try:
                d = ra.gerants.filter(actif=True).first()
                directeur_actif_sc = d.nom_gerant if d else ''
            except Exception:
                pass
            data['entity'] = {
                'id': sc.id, 'denomination': sc.denomination, 'denomination_ar': sc.denomination_ar,
                'siege_social': sc.siege_social, 'ville': sc.ville, 'telephone': sc.telephone,
                'email': sc.email,
                'objet_social': objet_social_sc,
                'activite': activite_sc,
                'directeur_actif': directeur_actif_sc,
            }
        else:
            data['entity'] = {}

        return Response(data)


# ── Données RA pour une modification existante (sans vérification BE) ─────────

class ModificationRADataView(APIView):
    """
    Retourne les données RA/entité d'une modification existante, sans contrôle
    statut_be.  Utilisé par le formulaire d'édition en mode rectification.
    L'agent n'a accès qu'aux modifications qui lui appartiennent (created_by).
    """
    permission_classes = [EstAgentTribunalOuGreffier]

    def get(self, request, pk):
        if not est_greffier(request.user):
            modif = generics.get_object_or_404(
                Modification.objects.filter(created_by=request.user),
                pk=pk,
            )
        else:
            modif = generics.get_object_or_404(Modification, pk=pk)

        ra = modif.ra
        if not ra:
            return Response({'detail': 'Aucun RA associé à cette modification.'}, status=404)

        # ── Détecter la source (RC chronologique ou IH) ───────────────────────
        rc_valide = ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
        rc_valide_id = rc_valide.id if rc_valide else None

        ih_id = None
        try:
            ih = ra.immatriculation_historique
            ih_id = ih.id if ih else None
        except Exception:
            ih_id = None

        if ih_id:
            source = 'IH'
        elif rc_valide_id:
            source = 'RC'
        else:
            source = None

        data = {
            'id':                  ra.id,
            'numero_ra':           ra.numero_ra,
            'numero_rc':           ra.numero_rc,
            'type_entite':         ra.type_entite,
            'denomination':        ra.denomination,
            'statut':              ra.statut,
            'localite_id':         ra.localite_id,
            'localite':            str(ra.localite) if ra.localite else '',
            'date_immatriculation': str(ra.date_immatriculation) if ra.date_immatriculation else '',
            # Clés de navigation pour le formulaire complet
            'rc_valide_id':        rc_valide_id,
            'ih_id':               ih_id,
            'source':              source,
        }

        if ra.type_entite == 'PM' and ra.pm:
            import json as _j
            pm = ra.pm
            # Objet social depuis le RC d'immatriculation (source canonique)
            objet_social_pm = ''
            try:
                rc_pm2 = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc_pm2 and rc_pm2.description:
                    desc_pm2 = _j.loads(rc_pm2.description) if isinstance(rc_pm2.description, str) else {}
                    objet_social_pm = desc_pm2.get('objet_social', '') or desc_pm2.get('activite', '')
            except Exception:
                pass
            # est_sa + organes courants
            try:
                _est_sa2 = ra.est_sa
            except Exception:
                _est_sa2 = False
            data['est_sa'] = _est_sa2
            _gerants_actifs2 = []
            if not _est_sa2:
                try:
                    for _g2 in ra.gerants.filter(actif=True):
                        _di2 = _g2.donnees_ident or {}
                        _gerants_actifs2.append({
                            'id': _g2.id, 'nom': _di2.get('nom', '') or _g2.nom_gerant,
                            'prenom': _di2.get('prenom', ''),
                            'nom_ar': _di2.get('nom_ar', ''), 'prenom_ar': _di2.get('prenom_ar', ''),
                            'nni': _di2.get('nni', ''), 'adresse': _di2.get('adresse', ''),
                            'telephone': _di2.get('telephone', ''),
                            'fonction': _di2.get('fonction', ''),
                            'nationalite_id': _g2.nationalite_id,
                        })
                except Exception:
                    pass
            data['gerants_actifs'] = _gerants_actifs2
            _admins_actifs2 = []
            _dirigeants_actifs2 = []
            _comms_actifs2 = []
            if _est_sa2:
                try:
                    for _adm2 in ra.administrateurs.filter(actif=True):
                        _admins_actifs2.append({
                            'id': _adm2.id, 'nom': _adm2.nom, 'prenom': _adm2.prenom,
                            'nom_ar': _adm2.nom_ar or '', 'prenom_ar': _adm2.prenom_ar or '',
                            'nni': _adm2.nni or '', 'num_passeport': _adm2.num_passeport or '',
                            'date_naissance': str(_adm2.date_naissance) if _adm2.date_naissance else '',
                            'lieu_naissance': _adm2.lieu_naissance or '',
                            'adresse': _adm2.adresse or '', 'telephone': _adm2.telephone or '',
                            'email': _adm2.email or '', 'fonction': _adm2.fonction or '',
                            'date_debut': str(_adm2.date_debut) if _adm2.date_debut else '',
                            'date_fin': str(_adm2.date_fin) if _adm2.date_fin else '',
                            'nationalite_id': _adm2.nationalite_id,
                        })
                except Exception:
                    pass
                try:
                    for _dg2 in ra.gerants.filter(actif=True):
                        _ddi2 = _dg2.donnees_ident or {}
                        _dirigeants_actifs2.append({
                            'id': _dg2.id, 'nom': _ddi2.get('nom', '') or _dg2.nom_gerant,
                            'prenom': _ddi2.get('prenom', ''),
                            'nom_ar': _ddi2.get('nom_ar', ''), 'prenom_ar': _ddi2.get('prenom_ar', ''),
                            'nni': _ddi2.get('nni', ''), 'adresse': _ddi2.get('adresse', ''),
                            'telephone': _ddi2.get('telephone', ''),
                            'fonction': _ddi2.get('fonction', ''),
                            'nationalite_id': _dg2.nationalite_id,
                        })
                except Exception:
                    pass
                try:
                    for _comm2 in ra.commissaires.filter(actif=True):
                        _comms_actifs2.append({
                            'id': _comm2.id, 'nom': _comm2.nom, 'prenom': _comm2.prenom or '',
                            'nom_ar': _comm2.nom_ar or '', 'prenom_ar': _comm2.prenom_ar or '',
                            'type_commissaire': _comm2.type_commissaire, 'role': _comm2.role,
                            'nni': _comm2.nni or '', 'num_passeport': _comm2.num_passeport or '',
                            'date_naissance': str(_comm2.date_naissance) if _comm2.date_naissance else '',
                            'adresse': _comm2.adresse or '', 'telephone': _comm2.telephone or '',
                            'email': _comm2.email or '',
                            'nationalite_id': _comm2.nationalite_id,
                        })
                except Exception:
                    pass
            data['administrateurs_actifs'] = _admins_actifs2
            data['dirigeants_actifs']      = _dirigeants_actifs2
            data['commissaires_actifs']    = _comms_actifs2
            data['entity'] = {
                'id': pm.id, 'denomination': pm.denomination,
                'denomination_ar': pm.denomination_ar, 'sigle': pm.sigle,
                'forme_juridique_id': pm.forme_juridique_id,
                'forme_juridique': str(pm.forme_juridique) if pm.forme_juridique else '',
                'capital_social': str(pm.capital_social) if pm.capital_social else '',
                'devise_capital': pm.devise_capital, 'duree_societe': pm.duree_societe,
                'siege_social': pm.siege_social, 'ville': pm.ville,
                'telephone': pm.telephone, 'fax': pm.fax, 'email': pm.email,
                'site_web': pm.site_web, 'bp': pm.bp,
                'objet_social': objet_social_pm,
            }
        elif ra.type_entite == 'PH' and ra.ph:
            import json as _j
            ph = ra.ph
            # Nom commercial depuis le RC d'immatriculation (source canonique)
            nom_com = ''
            try:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc and rc.description:
                    desc = _j.loads(rc.description) if isinstance(rc.description, str) else {}
                    # Compatibilité : clé 'denomination_commerciale' (immatriculation) ou 'denomination' (ancienne modif)
                    nom_com = desc.get('denomination_commerciale', '') or desc.get('denomination', '')
            except Exception:
                pass
            # Gérant actif
            gerant_actif = ''
            try:
                g = ra.gerants.filter(actif=True).first()
                gerant_actif = g.nom_gerant if g else ''
            except Exception:
                pass
            data['entity'] = {
                'id': ph.id, 'nom': ph.nom, 'prenom': ph.prenom,
                'nom_ar': ph.nom_ar, 'prenom_ar': ph.prenom_ar,
                'adresse': ph.adresse, 'adresse_ar': ph.adresse_ar or '',
                'ville': ph.ville, 'telephone': ph.telephone,
                'email': ph.email, 'profession': ph.profession,
                'denomination_commerciale': nom_com,
                'gerant_actif': gerant_actif,
            }
        elif ra.type_entite == 'SC' and ra.sc:
            import json as _j
            sc = ra.sc
            # Objet social et activité depuis RC description
            objet_social_sc2 = ''
            activite_sc2 = ''
            try:
                rc_sc2 = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc_sc2 and rc_sc2.description:
                    desc_sc2 = _j.loads(rc_sc2.description) if isinstance(rc_sc2.description, str) else {}
                    objet_social_sc2 = desc_sc2.get('objet_social', '')
                    activite_sc2     = desc_sc2.get('activite', '')
            except Exception:
                pass
            # Directeur actif
            directeur_actif_sc2 = ''
            try:
                d2 = ra.gerants.filter(actif=True).first()
                directeur_actif_sc2 = d2.nom_gerant if d2 else ''
            except Exception:
                pass
            data['entity'] = {
                'id': sc.id, 'denomination': sc.denomination,
                'denomination_ar': sc.denomination_ar,
                'siege_social': sc.siege_social, 'ville': sc.ville,
                'telephone': sc.telephone, 'email': sc.email,
                'objet_social': objet_social_sc2,
                'activite': activite_sc2,
                'directeur_actif': directeur_actif_sc2,
            }
        else:
            data['entity'] = {}

        return Response(data)


# ── CRUD ──────────────────────────────────────────────────────────────────────

class ModificationListCreate(generics.ListCreateAPIView):
    """CDC §3.2 : modification — agents tribunal + greffier, cloisonnement par created_by.
    Les rectifications initiées par le greffier (créées avec created_by = greffier) sont
    exclues : elles sont désormais traitées directement dans le workflow RC/IH.
    """
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = ModificationSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['statut', 'ra']
    ordering         = ['-created_at']

    def get_queryset(self):
        from django.db.models import Q
        qs = Modification.objects.select_related('ra', 'created_by', 'validated_by').all()
        # Exclure les rectifications greffier (legacy + éventuels futurs) :
        # elles sont traitées dans RC Chronologique / Immatriculations historiques.
        qs = qs.exclude(
            Q(created_by__role__code='GREFFIER') | Q(created_by__is_superuser=True)
        )
        if not est_greffier(self.request.user):
            # L'agent ne voit que ses propres modifications
            qs = qs.filter(created_by=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        """
        Bloquer la création par le greffier.
        Les rectifications post-immatriculation initiées par le greffier sont traitées
        directement dans le workflow Registre Chronologique ou Immatriculations historiques.
        Elles ne passent PAS par cet endpoint : si elles y étaient créées, le get_queryset()
        les exclurait silencieusement (created_by=greffier → exclu), rendant la modification
        invisible pour tous.
        """
        if est_greffier(request.user):
            return Response(
                {
                    'detail': (
                        "Les inscriptions modificatives sont initiées par les agents du tribunal "
                        "uniquement. En tant que greffier, utilisez le workflow Registre "
                        "Chronologique ou Immatriculations historiques pour rectifier un dossier."
                    ),
                    'detail_ar': (
                        "يُنشئ قيود التعديل أعوانُ المحكمة حصراً. "
                        "بصفتك كاتب ضبط، استخدم سير عمل السجل الزمني "
                        "أو التسجيلات التاريخية لتصحيح الملف."
                    ),
                    'code': 'GREFFIER_CANNOT_CREATE_MODIFICATION',
                },
                status=http_status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def _valider_champs_ph(self, ra_id, nouvelles_donnees):
        """Lève ValidationError si la requête tente de modifier l'identité civile d'une PH."""
        if not ra_id:
            return
        try:
            from apps.registres.models import RegistreAnalytique
            ra = RegistreAnalytique.objects.get(pk=ra_id)
        except Exception:
            return
        if ra.type_entite != 'PH':
            return
        entity = (nouvelles_donnees or {}).get('entity', {}) if isinstance(nouvelles_donnees, dict) else {}
        forbidden = {'nom', 'prenom', 'nom_ar', 'prenom_ar'} & set(entity.keys())
        if forbidden:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'detail': (
                    "L'identité de la personne physique (nom, prénom) ne peut pas être "
                    "modifiée via une inscription modificative. "
                    "Un changement de personne constitue une cession, pas une modification."
                )
            })

    def perform_create(self, serializer):
        from apps.demandes.views import _next_numero
        self._valider_champs_ph(
            self.request.data.get('ra'),
            self.request.data.get('nouvelles_donnees'),
        )
        serializer.save(numero_modif=_next_numero('MOD'), created_by=self.request.user)


class ModificationDetail(generics.RetrieveUpdateAPIView):
    """CDC §3.2 : agents voient uniquement leurs propres modifications (pas les rectifications greffier)."""
    permission_classes = [EstAgentTribunalOuGreffier]
    serializer_class = ModificationSerializer

    def get_queryset(self):
        from django.db.models import Q
        qs = Modification.objects.prefetch_related('lignes').select_related(
            'ra', 'created_by', 'validated_by'
        ).all()
        # Exclure les rectifications greffier (legacy + éventuels futurs)
        qs = qs.exclude(
            Q(created_by__role__code='GREFFIER') | Q(created_by__is_superuser=True)
        )
        if not est_greffier(self.request.user):
            qs = qs.filter(created_by=self.request.user)
        return qs

    def update(self, request, *args, **kwargs):
        """Validation PH : rejeter toute tentative de modification de l'identité civile."""
        obj = self.get_object()
        if obj.ra and obj.ra.type_entite == 'PH':
            nd = request.data.get('nouvelles_donnees', {}) or {}
            entity = nd.get('entity', {}) if isinstance(nd, dict) else {}
            forbidden = {'nom', 'prenom', 'nom_ar', 'prenom_ar'} & set(entity.keys())
            if forbidden:
                return Response(
                    {'detail': (
                        "L'identité de la personne physique (nom, prénom) ne peut pas être "
                        "modifiée via une inscription modificative."
                    )},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
        return super().update(request, *args, **kwargs)


# ── Workflow actions ───────────────────────────────────────────────────────────

class ModificationActionView(APIView):
    """CDC §6 : workflow modifications.
    Actions agents : soumettre. Actions greffier : retourner, valider, annuler."""
    permission_classes = [EstAgentTribunalOuGreffier]

    ACTIONS_GREFFIER = {'retourner', 'valider', 'annuler_valide', 'modifier_correctif'}

    def patch(self, request, pk, action):
        if action in self.ACTIONS_GREFFIER:
            if not EstGreffier().has_permission(request, self):
                return Response({'detail': 'Action réservée au greffier.'}, status=403)
        from django.db.models import Q
        # Exclure les rectifications greffier (elles ne transitent plus par les MODs)
        qs = Modification.objects.exclude(
            Q(created_by__role__code='GREFFIER') | Q(created_by__is_superuser=True)
        )
        obj = generics.get_object_or_404(qs, pk=pk)

        if action == 'soumettre':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response({'detail': 'Seul un brouillon ou un dossier retourné peut être soumis.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            obj.statut = 'EN_INSTANCE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Dossier soumis au greffier.'})

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
                ra=obj.ra, action='RETOUR_MODIFICATION',
                reference_operation=obj.numero_modif,
                etat_avant={'statut': 'EN_INSTANCE'},
                etat_apres={'statut': 'RETOURNE', 'observations': obs},
                commentaire=f'Retour de {obj.numero_modif} à l\'agent. Motif : {obs}',
                created_by=request.user,
            )
            return Response({'statut': obj.statut, 'message': 'Dossier retourné à l\'agent.'})

        elif action == 'valider':
            if obj.statut != 'EN_INSTANCE':
                return Response({'detail': 'Seul un dossier en instance peut être validé.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            # Capture état avant application
            avant = _capture_avant_donnees(obj)
            obs   = request.data.get('observations', '').strip()
            from django.db import transaction as _dbtx
            try:
                with _dbtx.atomic():
                    obj.appliquer()
                    obj.statut        = 'VALIDE'
                    obj.validated_at  = timezone.now()
                    obj.validated_by  = request.user
                    obj.avant_donnees = avant
                    if obs:
                        obj.observations = obs
                    obj.save(update_fields=['statut', 'validated_at', 'validated_by',
                                            'observations', 'avant_donnees', 'updated_at'])
                    # ── Peupler lignes de modification (diff avant/après) ─────────
                    _peupler_lignes_modification(obj, avant)
                    # ── Journal enrichi ───────────────────────────────────────────
                    # Nom de l'agent demandeur
                    _u = obj.created_by
                    _agent_nom = (
                        f"{_u.prenom or ''} {_u.nom or ''}".strip() or getattr(_u, 'login', '')
                    ) if _u else ''
                    # Résumé des champs réellement modifiés
                    _champs = list(obj.lignes.values_list('libelle_champ', flat=True))
                    _parts = [f'Validation de {obj.numero_modif}.']
                    if _agent_nom:
                        _parts.append(f'Demandé par : {_agent_nom}.')
                    if _champs:
                        _parts.append(f'Champs modifiés : {", ".join(_champs)}.')
                    if obs:
                        _parts.append(obs)
                    # etat_apres enrichi avec __modif_id pour la résolution du lien
                    _etat_apres = dict(obj.nouvelles_donnees or {})
                    _etat_apres['__modif_id'] = obj.id
                    from apps.registres.models import ActionHistorique
                    ActionHistorique.objects.create(
                        ra=obj.ra, action='VALIDATION_MODIFICATION',
                        reference_operation=obj.numero_modif,
                        etat_avant=avant,
                        etat_apres=_etat_apres,
                        commentaire=' '.join(_parts),
                        created_by=request.user,
                    )
            except Exception as e:
                return Response({'detail': f'Erreur lors de l\'application : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response({'statut': obj.statut, 'message': 'Modification validée et appliquée.'})

        elif action == 'annuler':
            if obj.statut not in ('BROUILLON', 'RETOURNE'):
                return Response({'detail': 'Seul un brouillon ou dossier retourné peut être annulé.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            obj.statut = 'ANNULE'
            obj.save(update_fields=['statut', 'updated_at'])
            return Response({'statut': obj.statut, 'message': 'Modification annulée.'})

        elif action == 'annuler_valide':
            can, reason = _can_annuler_or_corriger(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)
            # Restore previous state
            try:
                _restore_avant_donnees(obj)
            except Exception as e:
                return Response({'detail': f'Erreur lors de la restauration : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
            obj.statut = 'ANNULE_GREFFIER'
            obj.save(update_fields=['statut', 'updated_at'])
            # Log to ActionHistorique
            from apps.registres.models import ActionHistorique
            _etat_apres_annul = dict(obj.avant_donnees or {})
            _etat_apres_annul['__modif_id'] = obj.id
            ActionHistorique.objects.create(
                ra=obj.ra, action='ANNULATION_MODIFICATION',
                reference_operation=obj.numero_modif,
                etat_avant=obj.nouvelles_donnees,
                etat_apres=_etat_apres_annul,
                commentaire=f'Annulation de la modification {obj.numero_modif} par le greffier.',
                created_by=request.user,
            )
            return Response({'statut': obj.statut,
                             'message': f'Modification {obj.numero_modif} annulée. État précédent restauré.'})

        elif action == 'modifier_correctif':
            can, reason = _can_annuler_or_corriger(obj)
            if not can:
                return Response({'detail': reason}, status=http_status.HTTP_400_BAD_REQUEST)

            # Validation PH : interdire modification de l'identité civile
            if obj.ra and obj.ra.type_entite == 'PH':
                nd_check = request.data.get('nouvelles_donnees', {}) or {}
                entity_check = nd_check.get('entity', {}) if isinstance(nd_check, dict) else {}
                forbidden_check = {'nom', 'prenom', 'nom_ar', 'prenom_ar'} & set(entity_check.keys())
                if forbidden_check:
                    return Response(
                        {'detail': "L'identité de la personne physique ne peut pas être modifiée via une inscription modificative."},
                        status=http_status.HTTP_400_BAD_REQUEST,
                    )

            nouvelles_donnees = request.data.get('nouvelles_donnees')
            if not nouvelles_donnees:
                return Response({'detail': 'nouvelles_donnees requis.'}, status=http_status.HTTP_400_BAD_REQUEST)

            # Save correction history entry
            correction_entry = {
                'date':           timezone.now().isoformat(),
                'user':           request.user.login if request.user else '',
                'ancien_etat':    obj.nouvelles_donnees,
                'nouvel_etat':    nouvelles_donnees,
            }
            corrections = list(obj.corrections or [])
            corrections.append(correction_entry)

            # Revert to before-state
            try:
                _restore_avant_donnees(obj)
            except Exception as e:
                return Response({'detail': f'Erreur lors de la restauration : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Update modification with corrected data and re-apply
            obj.nouvelles_donnees = nouvelles_donnees
            obj.corrections = corrections
            obj.save(update_fields=['nouvelles_donnees', 'corrections', 'updated_at'])
            try:
                obj.appliquer()
            except Exception as e:
                return Response({'detail': f'Erreur lors de l\'application corrective : {e}'},
                                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Log to ActionHistorique
            from apps.registres.models import ActionHistorique
            _etat_apres_corr = dict(correction_entry['nouvel_etat'] or {})
            _etat_apres_corr['__modif_id'] = obj.id
            ActionHistorique.objects.create(
                ra=obj.ra, action='MODIFICATION_CORRECTIVE',
                reference_operation=obj.numero_modif,
                etat_avant=correction_entry['ancien_etat'],
                etat_apres=_etat_apres_corr,
                commentaire=f'Correction de la modification {obj.numero_modif} par le greffier.',
                created_by=request.user,
            )
            return Response({'statut': obj.statut,
                             'message': f'Modification {obj.numero_modif} corrigée et réappliquée.'})

        return Response({'detail': 'Action inconnue.'}, status=http_status.HTTP_400_BAD_REQUEST)
