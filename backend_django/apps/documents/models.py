import uuid, os, re as _re
from django.db import models
from django.utils import timezone as _tz
from apps.parametrage.models import TypeDocument
from apps.utilisateurs.models import Utilisateur


def document_upload_path(instance, filename):
    ext   = os.path.splitext(filename)[1].lower()
    fname = f'{uuid.uuid4().hex}{ext}'
    return f'documents/{fname}'


# ── Nommage normalisé RCCM ────────────────────────────────────────────────────
# Convention : RCCM_<TYPE_ACTE>_<ANNEE>-<NUM_CHRONO>_<NUM_ANALYTIQUE>_<TYPE_PIECE>_<SEQ>.pdf
# Exemples   : RCCM_IMMAT_2026-0015_RA000124_STATUTS_01.pdf
#              RCCM_MODIF_2026-0021_RA000124_PV_AG_01.pdf
#
# Règles :
#   • Nom généré automatiquement — aucun nom libre saisi par l'utilisateur.
#   • Indépendant de la langue (aucun libellé FR/AR dans le nom).
#   • Si numero_ra non encore attribué → segment RA_TMP, renommé à la validation.
#   • Si numero_chrono non encore attribué → segment TMP.
#   • Figé après validation (renommer_docs_ra_valide() assure le renommage final).
#   • Même règle pour Agent et Greffier.

def _sanitize_piece(s: str) -> str:
    """
    Normalise un code TypeDocument en segment de nom de fichier :
    majuscules, espaces/tirets → '_', caractères non alphanums → '_',
    tirets bas multiples → un seul.
    """
    s = str(s).upper().replace(' ', '_').replace('-', '_')
    s = _re.sub(r'[^A-Z0-9_]', '_', s)
    s = _re.sub(r'_+', '_', s).strip('_')
    return s or 'DOC'


def _type_acte_rccm(**kw) -> str:
    """Déduit le TYPE_ACTE du contexte (FK renseignée en priorité)."""
    if kw.get('chrono'):               return 'IMMAT'
    if kw.get('modification'):         return 'MODIF'
    if kw.get('cession'):              return 'CESS'
    if kw.get('cession_fonds'):        return 'CESS_FDS'
    if kw.get('radiation'):            return 'RAD'
    if kw.get('ra'):                   return 'IMMAT'
    if kw.get('depot'):                return 'DEPOT'
    if kw.get('demande'):              return 'DEMANDE'
    if kw.get('rbe'):                  return 'RBE'
    if kw.get('immatriculation_hist'): return 'HIST'
    return 'DOC'


def _chrono_parts(**kw):
    """Retourne (annee_str, num_chrono_str) ou (annee_courante, 'TMP')."""
    c = kw.get('chrono')
    if c and c.annee_chrono and c.numero_chrono:
        return str(c.annee_chrono), str(c.numero_chrono)
    for fk in ('modification', 'cession', 'cession_fonds', 'radiation'):
        act = kw.get(fk)
        if act:
            ch = getattr(act, 'chrono', None)
            if ch and ch.annee_chrono and ch.numero_chrono:
                return str(ch.annee_chrono), str(ch.numero_chrono)
    ih = kw.get('immatriculation_hist')
    if ih and ih.annee_chrono and ih.numero_chrono:
        return str(ih.annee_chrono), str(ih.numero_chrono)
    return str(_tz.now().year), 'TMP'


def _ra_segment(**kw) -> str:
    """Retourne 'RA{numero}' ou 'RA_TMP' si le numéro n'est pas encore attribué."""
    ra = kw.get('ra')
    if ra and ra.numero_ra:
        return f'RA{ra.numero_ra}'
    for fk in ('modification', 'cession', 'cession_fonds', 'radiation'):
        act = kw.get(fk)
        if act:
            act_ra = getattr(act, 'ra', None)
            if act_ra and act_ra.numero_ra:
                return f'RA{act_ra.numero_ra}'
    c = kw.get('chrono')
    if c:
        c_ra = getattr(c, 'ra', None)
        if c_ra and c_ra.numero_ra:
            return f'RA{c_ra.numero_ra}'
    return 'RA_TMP'


def generate_nom_rccm(
    *,
    type_doc=None,
    chrono=None, ra=None,
    modification=None, cession=None, cession_fonds=None,
    radiation=None, depot=None, demande=None, rbe=None,
    immatriculation_hist=None,
    seq: int = 1,
) -> str:
    """
    Génère le nom normalisé RCCM d'une pièce jointe.

    Format : RCCM_<TYPE_ACTE>_<ANNEE>-<NUM_CHRONO>_<NUM_ANALYTIQUE>_<TYPE_PIECE>_<SEQ>.pdf

    Paramètres :
      type_doc           — instance TypeDocument (code utilisé comme TYPE_PIECE)
      chrono             — RegistreChronologique lié
      ra                 — RegistreAnalytique lié (ou instance fraîche après validation)
      modification/…     — actes liés (Modification, Cession, CessionFonds, Radiation,
                           Depot, Demande, RegistreBE, ImmatriculationHistorique)
      seq                — numéro de séquence (entier, zéro-padé sur 2 chiffres)
    """
    kw = dict(
        chrono=chrono, ra=ra, modification=modification,
        cession=cession, cession_fonds=cession_fonds,
        radiation=radiation, depot=depot, demande=demande,
        rbe=rbe, immatriculation_hist=immatriculation_hist,
    )
    acte       = _type_acte_rccm(**kw)
    annee, num = _chrono_parts(**kw)
    num_ra     = _ra_segment(**kw)
    piece      = _sanitize_piece(type_doc.code) if type_doc and type_doc.code else 'DOC'
    return f'RCCM_{acte}_{annee}-{num}_{num_ra}_{piece}_{seq:02d}.pdf'


def renommer_docs_ra_valide(ra) -> int:
    """
    Renomme toutes les pièces jointes dont nom_fichier contient encore 'RA_TMP'
    et qui sont rattachées au RA `ra` (directement ou via chrono/actes).

    Appelé par ValiderRAView.patch juste après ra.save(), une fois que
    ra.numero_ra a été attribué.  Retourne le nombre de documents renommés.
    """
    from django.db.models import Q
    qs = Document.objects.filter(
        Q(ra=ra)
        | Q(chrono__ra=ra)
        | Q(modification__ra=ra)
        | Q(cession__ra=ra)
        | Q(cession_fonds__ra=ra)
        | Q(radiation__ra=ra),
        nom_fichier__contains='RA_TMP',
    ).select_related(
        'type_doc',
        'chrono', 'chrono__ra',
        'modification', 'modification__ra', 'modification__chrono',
        'cession',       'cession__ra',       'cession__chrono',
        'cession_fonds', 'cession_fonds__ra', 'cession_fonds__chrono',
        'radiation',     'radiation__ra',     'radiation__chrono',
    )
    docs = list(qs)
    for doc in docs:
        # Conserver le numéro de séquence gravé dans l'ancien nom
        m   = _re.search(r'_(\d+)\.pdf$', doc.nom_fichier)
        seq = int(m.group(1)) if m else 1
        doc.nom_fichier = generate_nom_rccm(
            type_doc=doc.type_doc,
            chrono=doc.chrono,
            ra=ra,                         # instance fraîche avec numero_ra
            modification=doc.modification,
            cession=doc.cession,
            cession_fonds=doc.cession_fonds,
            radiation=doc.radiation,
            depot=doc.depot,
            demande=doc.demande,
            rbe=doc.rbe,
            immatriculation_hist=doc.immatriculation_hist,
            seq=seq,
        )
    if docs:
        Document.objects.bulk_update(docs, ['nom_fichier'])
    return len(docs)


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
