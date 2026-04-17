import uuid
from django.db import models
from apps.utilisateurs.models import Utilisateur


def _appliquer_evenements_organes(ra, meta):
    """
    Logique événementielle pour les organes sociaux PM.
    Payload attendu dans meta :
      evenements_organes  : {gerants, administrateurs, dirigeants, commissaires}
      nouvelles_nominations : {gerants, administrateurs, dirigeants, commissaires}
    """
    from apps.registres.models import (
        Administrateur as _Admin,
        CommissaireComptes as _Comm,
        Gerant as _Gerant,
    )
    try:
        _est_sa = ra.est_sa
    except Exception:
        _est_sa = False

    evenements  = meta.get('evenements_organes',    {}) or {}
    nominations = meta.get('nouvelles_nominations', {}) or {}

    # ── Helpers internes ─────────────────────────────────────────────────────
    def _save_gerant(ra, nom_complet, data_dict, type_gerant='PM'):
        _g = _Gerant.objects.create(
            ra=ra, type_gerant=type_gerant,
            nom_gerant=nom_complet, actif=True,
            date_debut=data_dict.get('date_nomination') or None,
            ref_decision=data_dict.get('ref_decision', ''),
        )
        _ident_fields = ('nom', 'prenom', 'nom_ar', 'prenom_ar',
                         'nni', 'adresse', 'telephone', 'fonction')
        _ident = {k: v for k, v in data_dict.items() if k in _ident_fields and v}
        if _ident:
            _g.donnees_ident = _ident
            _g.save(update_fields=['donnees_ident', 'updated_at'])
        return _g

    def _save_admin(ra, data_dict):
        _adm = _Admin(ra=ra, actif=True)
        for _f in ('nom', 'prenom', 'nom_ar', 'prenom_ar', 'nni', 'num_passeport',
                   'adresse', 'telephone', 'email', 'fonction', 'lieu_naissance'):
            _v = data_dict.get(_f)
            if _v:
                setattr(_adm, _f, _v)
        _adm.date_debut   = data_dict.get('date_nomination') or data_dict.get('date_debut') or None
        _adm.ref_decision = data_dict.get('ref_decision', '')
        _nat = data_dict.get('nationalite_id')
        if _nat:
            try:
                _adm.nationalite_id = int(_nat)
            except (TypeError, ValueError):
                pass
        _adm.save()
        return _adm

    def _save_comm(ra, data_dict):
        _cm = _Comm(ra=ra, actif=True)
        for _f in ('nom', 'prenom', 'nom_ar', 'prenom_ar', 'nni', 'num_passeport',
                   'adresse', 'telephone', 'email', 'type_commissaire', 'role', 'lieu_naissance'):
            _v = data_dict.get(_f)
            if _v:
                setattr(_cm, _f, _v)
        _cm.date_debut   = data_dict.get('date_nomination') or data_dict.get('date_debut') or None
        _cm.ref_decision = data_dict.get('ref_decision', '')
        _nat = data_dict.get('nationalite_id')
        if _nat:
            try:
                _cm.nationalite_id = int(_nat)
            except (TypeError, ValueError):
                pass
        _cm.save()
        return _cm

    # ── Traitement selon forme sociale ────────────────────────────────────────
    if not _est_sa:
        # ── Gérants (PM non-SA) ──────────────────────────────────────────────
        for ev in (evenements.get('gerants') or []):
            _id   = ev.get('id')
            _sort = ev.get('sort', 'MAINTENU')
            if not _id or _sort == 'MAINTENU':
                continue
            try:
                _g = ra.gerants.get(pk=_id, actif=True)
                _g.actif        = False
                _g.date_fin     = ev.get('date_effet') or None
                _g.motif_fin    = _sort
                _g.ref_decision = ev.get('ref_decision', '')
                _g.save(update_fields=['actif', 'date_fin', 'motif_fin', 'ref_decision', 'updated_at'])
                # Remplaçant
                _rem = ev.get('remplacant') or {}
                _rnom = (_rem.get('nom') or _rem.get('nom_ar') or '').strip()
                _rprenom = (_rem.get('prenom') or _rem.get('prenom_ar') or '').strip()
                _rnc = f"{_rprenom} {_rnom}".strip() if _rprenom else _rnom
                if _rnc:
                    _save_gerant(ra, _rnc, _rem)
            except _Gerant.DoesNotExist:
                pass
        # Nouvelles nominations gérants
        for _nd in (nominations.get('gerants') or []):
            _nnom    = (_nd.get('nom') or _nd.get('nom_ar') or '').strip()
            _nprenom = (_nd.get('prenom') or _nd.get('prenom_ar') or '').strip()
            _nnc = f"{_nprenom} {_nnom}".strip() if _nprenom else _nnom
            if _nnc:
                _save_gerant(ra, _nnc, _nd)

    else:
        # ── SA : Administrateurs ─────────────────────────────────────────────
        for ev in (evenements.get('administrateurs') or []):
            _id   = ev.get('id')
            _sort = ev.get('sort', 'MAINTENU')
            if not _id or _sort == 'MAINTENU':
                continue
            try:
                _adm = ra.administrateurs.get(pk=_id, actif=True)
                _adm.actif        = False
                _adm.date_fin     = ev.get('date_effet') or None
                _adm.motif_fin    = _sort
                _adm.ref_decision = ev.get('ref_decision', '')
                _adm.save(update_fields=['actif', 'date_fin', 'motif_fin', 'ref_decision', 'updated_at'])
                _rem = ev.get('remplacant') or {}
                if (_rem.get('nom') or _rem.get('nom_ar') or '').strip():
                    _save_admin(ra, _rem)
            except _Admin.DoesNotExist:
                pass
        for _nd in (nominations.get('administrateurs') or []):
            if (_nd.get('nom') or _nd.get('nom_ar') or '').strip():
                _save_admin(ra, _nd)

        # ── SA : Dirigeants (stockés dans Gerant) ────────────────────────────
        for ev in (evenements.get('dirigeants') or []):
            _id   = ev.get('id')
            _sort = ev.get('sort', 'MAINTENU')
            if not _id or _sort == 'MAINTENU':
                continue
            try:
                _dg = ra.gerants.get(pk=_id, actif=True)
                _dg.actif        = False
                _dg.date_fin     = ev.get('date_effet') or None
                _dg.motif_fin    = _sort
                _dg.ref_decision = ev.get('ref_decision', '')
                _dg.save(update_fields=['actif', 'date_fin', 'motif_fin', 'ref_decision', 'updated_at'])
                _rem = ev.get('remplacant') or {}
                _rnom    = (_rem.get('nom') or _rem.get('nom_ar') or '').strip()
                _rprenom = (_rem.get('prenom') or _rem.get('prenom_ar') or '').strip()
                _rnc = f"{_rprenom} {_rnom}".strip() if _rprenom else _rnom
                if _rnc:
                    _save_gerant(ra, _rnc, _rem)
            except _Gerant.DoesNotExist:
                pass
        for _nd in (nominations.get('dirigeants') or []):
            _nnom    = (_nd.get('nom') or _nd.get('nom_ar') or '').strip()
            _nprenom = (_nd.get('prenom') or _nd.get('prenom_ar') or '').strip()
            _nnc = f"{_nprenom} {_nnom}".strip() if _nprenom else _nnom
            if _nnc:
                _save_gerant(ra, _nnc, _nd)

        # ── SA : Commissaires aux comptes ────────────────────────────────────
        for ev in (evenements.get('commissaires') or []):
            _id   = ev.get('id')
            _sort = ev.get('sort', 'MAINTENU')
            if not _id or _sort == 'MAINTENU':
                continue
            try:
                _cm = ra.commissaires.get(pk=_id, actif=True)
                _cm.actif        = False
                _cm.date_fin     = ev.get('date_effet') or None
                _cm.motif_fin    = _sort
                _cm.ref_decision = ev.get('ref_decision', '')
                _cm.save(update_fields=['actif', 'date_fin', 'motif_fin', 'ref_decision', 'updated_at'])
                _rem = ev.get('remplacant') or {}
                if (_rem.get('nom') or _rem.get('nom_ar') or '').strip():
                    _save_comm(ra, _rem)
            except _Comm.DoesNotExist:
                pass
        for _nd in (nominations.get('commissaires') or []):
            if (_nd.get('nom') or _nd.get('nom_ar') or '').strip():
                _save_comm(ra, _nd)


class Modification(models.Model):
    STATUT = [
        ('BROUILLON',       'Brouillon'),
        ('EN_INSTANCE',     'En instance de validation'),
        ('RETOURNE',        'Retourné'),
        ('VALIDE',          'Validé'),
        ('ANNULE',          'Annulé'),
        ('ANNULE_GREFFIER', 'Annulé par le greffier'),
    ]

    uuid             = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    numero_modif     = models.CharField(max_length=30, unique=True)
    ra               = models.ForeignKey('registres.RegistreAnalytique', on_delete=models.PROTECT, related_name='modifications')
    chrono           = models.ForeignKey('registres.RegistreChronologique', null=True, blank=True, on_delete=models.SET_NULL)
    demande          = models.ForeignKey('demandes.Demande', null=True, blank=True, on_delete=models.SET_NULL)
    date_modif       = models.DateTimeField(auto_now_add=True, verbose_name='Date et heure de la modification')
    statut           = models.CharField(max_length=20, choices=STATUT, default='BROUILLON', db_index=True)
    langue_acte      = models.CharField(
        max_length=2, choices=[('fr', 'Français'), ('ar', 'Arabe')], default='fr',
        verbose_name="Langue de l'acte",
    )
    observations     = models.TextField(blank=True)
    demandeur        = models.CharField(max_length=200, blank=True, verbose_name='Demandeur')
    nouvelles_donnees = models.JSONField(default=dict, blank=True)
    avant_donnees     = models.JSONField(default=dict, blank=True)   # état avant application
    corrections       = models.JSONField(default=list, blank=True)   # historique des corrections
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)
    validated_at     = models.DateTimeField(null=True, blank=True)
    validated_by     = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='modifications_validees')
    created_by       = models.ForeignKey(Utilisateur, null=True, blank=True, on_delete=models.SET_NULL, related_name='modifications_creees')

    class Meta:
        db_table            = 'modifications'
        ordering            = ['-created_at']
        verbose_name        = 'Modification'
        verbose_name_plural = 'Modifications'

    def __str__(self):
        return f'{self.numero_modif} – {self.ra.numero_ra}'

    def appliquer(self):
        """Apply nouvelles_donnees to the RA entity. Called only on validation."""
        from apps.registres.models import RegistreAnalytique
        data = self.nouvelles_donnees or {}
        ra   = self.ra
        entity_data = data.get('entity', {})
        meta        = data.get('meta', {}) or {}
        ra_data     = data.get('ra', {})

        entite = ra.entite
        if entite and entity_data:
            if ra.type_entite == 'PM':
                ALLOWED = {
                    'denomination','denomination_ar','sigle','forme_juridique_id',
                    'capital_social','devise_capital','duree_societe',
                    'siege_social','ville','telephone','fax','email','site_web','bp',
                }
            elif ra.type_entite == 'PH':
                # nom/prenom/nom_ar/prenom_ar : identité civile — JAMAIS modifiable
                # via inscription modificative (changer de personne = cession).
                # denomination pour PH = nom commercial → traitement spécial ci-dessous
                ALLOWED = {
                    'adresse', 'adresse_ar', 'ville', 'telephone', 'email', 'profession',
                }
            else:  # SC — capital_affecte exclu (non modifiable via inscription modificative)
                ALLOWED = {
                    'denomination','denomination_ar','siege_social',
                    'ville','telephone','email',
                }
            for field, value in entity_data.items():
                if field in ALLOWED:
                    if value == '' or value is None:
                        continue
                    setattr(entite, field, value)
            entite.save()

        # ── PM : objet_social dans RC description ────────────────────────────────
        if ra.type_entite == 'PM':
            import json as _json_mod
            objet_social = (entity_data.get('objet_social') or '').strip()
            if objet_social:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    try:
                        desc = (_json_mod.loads(rc.description)
                                if isinstance(rc.description, str) else dict(rc.description or {}))
                    except (ValueError, TypeError):
                        desc = {}
                    desc['objet_social'] = objet_social
                    rc.description = _json_mod.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])

        # ── SC : activite dans RC description ────────────────────────────────────
        if ra.type_entite == 'SC':
            import json as _json_mod
            activite_sc = (entity_data.get('activite') or '').strip()
            if activite_sc:
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    try:
                        desc = (_json_mod.loads(rc.description)
                                if isinstance(rc.description, str) else dict(rc.description or {}))
                    except (ValueError, TypeError):
                        desc = {}
                    desc['activite'] = activite_sc
                    rc.description = _json_mod.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])

        # ── PH : denomination (nom commercial) depuis entity + gérant depuis meta ─
        if ra.type_entite == 'PH':
            import json as _json_mod

            # Nom commercial → entity.denomination → stocké dans RC description['denomination_commerciale']
            nom_commercial = (entity_data.get('denomination') or '').strip()
            if nom_commercial:
                # Toujours mettre à jour le RC d'immatriculation (source canonique du nom commercial)
                rc = (
                    ra.chronos.filter(type_acte='IMMATRICULATION', statut='VALIDE')
                              .order_by('-validated_at').first()
                    or ra.chronos.filter(statut='VALIDE').order_by('-validated_at').first()
                )
                if rc:
                    try:
                        desc = (_json_mod.loads(rc.description)
                                if isinstance(rc.description, str) else dict(rc.description or {}))
                    except (ValueError, TypeError):
                        desc = {}
                    # Clé canonique : denomination_commerciale (alignée sur l'immatriculation)
                    desc['denomination_commerciale'] = nom_commercial
                    rc.description = _json_mod.dumps(desc, ensure_ascii=False)
                    rc.save(update_fields=['description', 'updated_at'])

            # Nouveau gérant → méta (traitement spécial : pas dans entity)
            nouveau_gerant = meta.get('nouveau_gerant_nom', '').strip()
            if nouveau_gerant:
                from apps.registres.models import Gerant as _Gerant
                ra.gerants.filter(actif=True).update(actif=False)
                _Gerant.objects.create(
                    ra=ra, type_gerant='PH',
                    nom_gerant=nouveau_gerant, actif=True,
                )

        # ── SC : nouveau directeur depuis meta (bloc identité complet) ─────────────
        if ra.type_entite == 'SC':
            from apps.registres.models import Gerant as _Gerant
            # Nouveau format : meta.nouveau_directeur (objet identité)
            # Ancien format (compat.) : meta.nouveau_directeur_nom (chaîne)
            dir_obj = meta.get('nouveau_directeur') or {}
            if not dir_obj and meta.get('nouveau_directeur_nom'):
                dir_obj = {'nom': meta['nouveau_directeur_nom']}
            if dir_obj:
                _nom    = (dir_obj.get('nom')    or '').strip()
                _prenom = (dir_obj.get('prenom') or '').strip()
                _nom_complet = f"{_prenom} {_nom}".strip() if _prenom else _nom
                if _nom_complet:
                    ra.gerants.filter(actif=True).update(actif=False)
                    g = _Gerant.objects.create(
                        ra=ra, type_gerant='SC',
                        nom_gerant=_nom_complet, actif=True,
                    )
                    # Stocker l'identité complète dans donnees_ident
                    _ident_fields = ('nom', 'prenom', 'nom_ar', 'prenom_ar',
                                     'date_naissance', 'lieu_naissance', 'nni',
                                     'adresse', 'telephone')
                    _donnees = {k: v for k, v in dir_obj.items()
                                if k in _ident_fields and v}
                    if _donnees:
                        g.donnees_ident = _donnees
                    # Nationalité
                    _nat_id = dir_obj.get('nationalite_id')
                    if _nat_id:
                        try:
                            g.nationalite_id = int(_nat_id)
                        except (TypeError, ValueError):
                            pass
                    if _donnees or _nat_id:
                        g.save(update_fields=['donnees_ident', 'nationalite_id', 'updated_at'])

        # ── PM : gérants / organes SA depuis meta ─────────────────────────────
        if ra.type_entite == 'PM':
            # Nouveau format événementiel → fonction dédiée
            if 'evenements_organes' in meta or 'nouvelles_nominations' in meta:
                _appliquer_evenements_organes(ra, meta)
            else:
                # Ancien format (rétrocompatibilité — modifications déjà saisies avant la mise à jour)
                self._appliquer_organes_ancien_format(ra, meta)

        RA_ALLOWED = {'numero_rc', 'localite_id'}
        if ra_data:
            for field, value in ra_data.items():
                if field in RA_ALLOWED and value not in ('', None):
                    setattr(ra, field, value)
            ra.save()

    def _appliquer_organes_ancien_format(self, ra, meta):
        """Ancien format (tableau de remplacement global) — maintenu pour rétrocompatibilité."""
        from apps.registres.models import (Administrateur as _Admin,
                                           CommissaireComptes as _Comm,
                                           Gerant as _Gerant)
        try:
            _est_sa = ra.est_sa
        except Exception:
            _est_sa = False

        if not _est_sa:
            # Non-SA : remplacement global des gérants
            _gerants_data = meta.get('gerants_pm') or []
            if _gerants_data and isinstance(_gerants_data, list):
                ra.gerants.filter(actif=True).update(actif=False)
                for _gd in _gerants_data:
                    _gnom    = (_gd.get('nom') or _gd.get('nom_ar') or '').strip()
                    _gprenom = (_gd.get('prenom') or _gd.get('prenom_ar') or '').strip()
                    _gnc = f"{_gprenom} {_gnom}".strip() if _gprenom else _gnom
                    if _gnc:
                        _g = _Gerant.objects.create(ra=ra, type_gerant='PM',
                                                    nom_gerant=_gnc, actif=True)
                        _gfields = ('nom', 'prenom', 'nom_ar', 'prenom_ar',
                                    'date_naissance', 'lieu_naissance', 'nni',
                                    'adresse', 'telephone', 'fonction')
                        _gd_ident = {k: v for k, v in _gd.items() if k in _gfields and v}
                        _gnat = _gd.get('nationalite_id')
                        if _gd_ident:
                            _g.donnees_ident = _gd_ident
                        if _gnat:
                            try:
                                _g.nationalite_id = int(_gnat)
                            except (TypeError, ValueError):
                                pass
                        if _gd_ident or _gnat:
                            _g.save(update_fields=['donnees_ident', 'nationalite_id', 'updated_at'])
        else:
            # SA : remplacement global (ancien format)
            _admins_data = meta.get('administrateurs') or []
            if _admins_data and isinstance(_admins_data, list):
                ra.administrateurs.filter(actif=True).update(actif=False)
                for _ad in _admins_data:
                    if (_ad.get('nom') or _ad.get('nom_ar') or '').strip():
                        _adm = _Admin(ra=ra, actif=True)
                        for _af in ('nom', 'prenom', 'nom_ar', 'prenom_ar', 'nni',
                                    'num_passeport', 'adresse', 'telephone', 'email',
                                    'fonction', 'date_debut', 'date_fin',
                                    'lieu_naissance', 'date_naissance'):
                            _av = _ad.get(_af)
                            if _av:
                                setattr(_adm, _af, _av)
                        _adnat = _ad.get('nationalite_id')
                        if _adnat:
                            try:
                                _adm.nationalite_id = int(_adnat)
                            except (TypeError, ValueError):
                                pass
                        _adm.save()

            _dirig_data = meta.get('dirigeants') or []
            if _dirig_data and isinstance(_dirig_data, list):
                ra.gerants.filter(actif=True).update(actif=False)
                for _dd in _dirig_data:
                    _dnom    = (_dd.get('nom') or _dd.get('nom_ar') or '').strip()
                    _dprenom = (_dd.get('prenom') or _dd.get('prenom_ar') or '').strip()
                    _dnc = f"{_dprenom} {_dnom}".strip() if _dprenom else _dnom
                    if _dnc:
                        _dg = _Gerant.objects.create(ra=ra, type_gerant='PM',
                                                     nom_gerant=_dnc, actif=True)
                        _dfields = ('nom', 'prenom', 'nom_ar', 'prenom_ar',
                                    'date_naissance', 'lieu_naissance', 'nni',
                                    'adresse', 'telephone', 'fonction')
                        _dd_ident = {k: v for k, v in _dd.items() if k in _dfields and v}
                        _dnat = _dd.get('nationalite_id')
                        if _dd_ident:
                            _dg.donnees_ident = _dd_ident
                        if _dnat:
                            try:
                                _dg.nationalite_id = int(_dnat)
                            except (TypeError, ValueError):
                                pass
                        if _dd_ident or _dnat:
                            _dg.save(update_fields=['donnees_ident', 'nationalite_id', 'updated_at'])

            _comms_data = meta.get('commissaires') or []
            if _comms_data and isinstance(_comms_data, list):
                ra.commissaires.filter(actif=True).update(actif=False)
                for _cd in _comms_data:
                    if (_cd.get('nom') or _cd.get('nom_ar') or '').strip():
                        _cm = _Comm(ra=ra, actif=True)
                        for _cf in ('nom', 'prenom', 'nom_ar', 'prenom_ar', 'nni',
                                    'num_passeport', 'adresse', 'telephone', 'email',
                                    'date_debut', 'date_fin', 'lieu_naissance', 'date_naissance',
                                    'type_commissaire', 'role'):
                            _cv = _cd.get(_cf)
                            if _cv:
                                setattr(_cm, _cf, _cv)
                        _cnat = _cd.get('nationalite_id')
                        if _cnat:
                            try:
                                _cm.nationalite_id = int(_cnat)
                            except (TypeError, ValueError):
                                pass
                        _cm.save()


class LigneModification(models.Model):
    modification   = models.ForeignKey(Modification, on_delete=models.CASCADE, related_name='lignes')
    code_champ     = models.CharField(max_length=50)
    libelle_champ  = models.CharField(max_length=200)
    ancienne_valeur = models.TextField(blank=True)
    nouvelle_valeur = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lignes_modification'
