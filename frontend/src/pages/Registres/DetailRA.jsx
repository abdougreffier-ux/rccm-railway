import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Tabs, Table, Typography,
  Spin, message, Modal, Input, Alert, Timeline, Upload, List, Avatar,
  Divider, Select, Tooltip, Popconfirm, Form,
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FilePdfOutlined, CheckCircleOutlined, PrinterOutlined,
  SendOutlined, RollbackOutlined, UploadOutlined, FileOutlined,
  DeleteOutlined, UserOutlined, DownloadOutlined, EyeOutlined,
  AuditOutlined, SafetyCertificateOutlined, EditOutlined,
  LockOutlined, UnlockOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { registreAPI, rapportAPI, radiationAPI, documentAPI, parametrageAPI, autorisationAPI, openPDF } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCivilite } from '../../utils/civilite';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;
const { TextArea } = Input;

const ACTION_COLOR = {
  CREATION:   'blue',
  COMPLETION: 'cyan',
  ENVOI:      'purple',
  RETOUR:     'orange',
  VALIDATION: 'green',
};

const OP_TYPE_CONFIG = {
  IMMATRICULATION:            { color: '#1a4480', bg: '#e8f0fe', label: 'Immatriculation'                  },
  MODIFICATION:               { color: '#7b5ea7', bg: '#f3ecff', label: 'Modification'                    },
  CESSION:                    { color: '#b45309', bg: '#fff7ed', label: 'Cession de parts'                 },
  CESSION_FONDS_COMMERCE:     { color: '#0369a1', bg: '#e0f2fe', label: 'Cession de fonds de commerce'    },
  RADIATION:                  { color: '#b91c1c', bg: '#fef2f2', label: 'Radiation'                       },
  SUSPENSION:                 { color: '#b45309', bg: '#fff7ed', label: 'Suspension'                      },
  REACTIVATION:               { color: '#15803d', bg: '#f0fdf4', label: 'Réactivation'                    },
  ANNULATION_MODIFICATION:    { color: '#6b7280', bg: '#f3f4f6', label: 'Annulation modification'         },
  ANNULATION_CESSION:         { color: '#6b7280', bg: '#f3f4f6', label: 'Annulation cession'              },
  ANNULATION_CESSION_FONDS:   { color: '#6b7280', bg: '#f3f4f6', label: 'Annulation cession fonds'        },
  ANNULATION_RADIATION:       { color: '#15803d', bg: '#f0fdf4', label: 'Annulation radiation'            },
  MODIFICATION_CORRECTIVE:    { color: '#d97706', bg: '#fffbeb', label: 'Modification corrective'         },
  CESSION_CORRECTIVE:         { color: '#d97706', bg: '#fffbeb', label: 'Cession corrective'              },
  IMMATRICULATION_HISTORIQUE: { color: '#722ed1', bg: '#f9f0ff', label: 'Immatriculation historique'      },
};

const OP_STATUT_COLOR = {
  EN_INSTANCE: 'processing',
  VALIDE:      'success',
  VALIDEE:     'success',
  BROUILLON:   'default',
  RETOURNE:    'warning',
  ANNULE:      'default',
  ANNULEE:     'default',
  REJETE:      'error',
  REJETEE:     'error',
  EN_COURS:    'processing',
};

// ── Bloc Personne Physique ─────────────────────────────────────────────────────
const SectionPH = ({ ph, extra, t, isAr }) => (
  <>
    <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
      <Descriptions.Item label={t('field.nomFr')}    span={1}><strong>{ph?.civilite && (formatCivilite(ph.civilite, isAr ? 'ar' : 'fr') + ' ')}{ph?.prenom} {ph?.nom}</strong></Descriptions.Item>
      <Descriptions.Item label={t('field.nomAr')}    span={1} className="rtl">{ph?.nom_ar} {ph?.prenom_ar}</Descriptions.Item>
      <Descriptions.Item label={t('field.nni')}      span={1}>{ph?.nni || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.passeport')}span={1}>{ph?.num_passeport || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.nationalite')} span={1}>{ph?.nationalite_libelle || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.sexe')}     span={1}>
        {ph?.sexe === 'M' ? t('field.masculin') : ph?.sexe === 'F' ? t('field.feminin') : '—'}
      </Descriptions.Item>
      <Descriptions.Item label={t('field.dateNaissance')} span={1}>{ph?.date_naissance || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.lieuNaissance')} span={1}>{ph?.lieu_naissance || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.situationMatrimoniale')} span={1}>{ph?.situation_matrimoniale || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.profession')} span={1}>{ph?.profession || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.nomPere')}  span={1}>{ph?.nom_pere || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.nomMere')}  span={1}>{ph?.nom_mere || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.adresse')}  span={2}>{ph?.adresse || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.telephone')}span={1}>{ph?.telephone || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.email')}    span={1}>{ph?.email || '—'}</Descriptions.Item>
    </Descriptions>
    {extra && Object.keys(extra).length > 0 && (
      <>
        <Divider orientation={isAr ? 'right' : 'left'} style={{ fontSize: 13 }}>{t('section.infoCommerciales')}</Divider>
        <Descriptions bordered column={2} size="small">
          {extra.denomination_commerciale && (
            <Descriptions.Item label={isAr ? 'الاسم التجاري (الشعار)' : 'Nom commercial (enseigne)'} span={2}>
              <strong>{extra.denomination_commerciale}</strong>
            </Descriptions.Item>
          )}
          {extra.activite && (
            <Descriptions.Item label={t('field.activite')} span={2}>{extra.activite}</Descriptions.Item>
          )}
          {extra.origine_fonds && (
            <Descriptions.Item label={t('field.origineFonds')} span={2}>{extra.origine_fonds}</Descriptions.Item>
          )}
          {extra.identite_declarant && (
            <Descriptions.Item label={t('field.declarant')} span={2}>{extra.identite_declarant}</Descriptions.Item>
          )}
        </Descriptions>
      </>
    )}
  </>
);

// ── Bloc Personne Morale ───────────────────────────────────────────────────────
const SectionPM = ({ pm, extra, t, isAr }) => (
  <>
    <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
      <Descriptions.Item label={t('field.denominationFr')} span={2}><strong>{pm?.denomination}</strong></Descriptions.Item>
      <Descriptions.Item label={t('field.denominationAr')} span={2} className="rtl">{pm?.denomination_ar || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.sigle')}          span={1}>{pm?.sigle || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.formeJuridique')} span={1}>{pm?.forme_juridique_libelle || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.capitalSocial')}  span={1}>
        {pm?.capital_social ? `${Number(pm.capital_social).toLocaleString()} ${pm.devise_capital}` : '—'}
      </Descriptions.Item>
      <Descriptions.Item label={t('field.duree')}          span={1}>{pm?.duree_societe || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.dateConstitution')}span={1}>{pm?.date_constitution || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.dateAG')}         span={1}>{pm?.date_ag || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.siegeSocial')}    span={2}>{pm?.siege_social || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.ville')}          span={1}>{pm?.ville || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.bp')}             span={1}>{pm?.bp || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.telephone')}      span={1}>{pm?.telephone || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.fax')}            span={1}>{pm?.fax || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.email')}          span={1}>{pm?.email || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.siteWeb')}        span={1}>{pm?.site_web || '—'}</Descriptions.Item>
    </Descriptions>
    {extra?.objet_social && (
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label={t('field.objetSocial')}>{extra.objet_social}</Descriptions.Item>
      </Descriptions>
    )}
  </>
);

// ── Bloc Succursale ────────────────────────────────────────────────────────────
const SectionSC = ({ sc, extra, t, isAr }) => (
  <>
    <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
      <Descriptions.Item label={t('field.denominationFr')} span={2}><strong>{sc?.denomination}</strong></Descriptions.Item>
      <Descriptions.Item label={t('field.denominationAr')} span={2} className="rtl">{sc?.denomination_ar || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.paysOrigine')}    span={1}>{sc?.pays_origine || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.capitalAffecte')} span={1}>
        {sc?.capital_affecte ? `${Number(sc.capital_affecte).toLocaleString()} ${sc.devise}` : '—'}
      </Descriptions.Item>
      <Descriptions.Item label={t('field.siegeSocial')}    span={2}>{sc?.siege_social || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.telephone')}      span={1}>{sc?.telephone || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('field.email')}          span={1}>{sc?.email || '—'}</Descriptions.Item>
    </Descriptions>
    {sc?.pm_mere_denomination && (
      <>
        <Divider orientation={isAr ? 'right' : 'left'} style={{ fontSize: 13 }}>{t('section.maisonMere')}</Divider>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label={t('field.denomination')} span={2}>{sc.pm_mere_denomination}</Descriptions.Item>
        </Descriptions>
      </>
    )}
    {extra?.maison_mere && (
      <>
        <Divider orientation={isAr ? 'right' : 'left'} style={{ fontSize: 13 }}>{t('section.infoMaisonMere')}</Divider>
        <Descriptions bordered column={2} size="small">
          {extra.maison_mere.denomination_sociale && (
            <Descriptions.Item label={t('field.denomination')} span={2}>{extra.maison_mere.denomination_sociale}</Descriptions.Item>
          )}
          {extra.maison_mere.siege_social && (
            <Descriptions.Item label={t('field.siegeSocial')} span={2}>{extra.maison_mere.siege_social}</Descriptions.Item>
          )}
          {extra.maison_mere.capital_social && (
            <Descriptions.Item label={t('field.capitalSocial')} span={1}>
              {Number(extra.maison_mere.capital_social).toLocaleString()} {extra.maison_mere.devise_capital || 'MRU'}
            </Descriptions.Item>
          )}
        </Descriptions>
      </>
    )}
  </>
);


// ── Bouton certificat de radiation ────────────────────────────────────────────
const RadiationCertificatButton = ({ raId }) => {
  const { data } = useQuery({
    queryKey: ['radiations', 'validee', raId],
    queryFn:  () => radiationAPI.list({ ra: raId, statut: 'VALIDEE' }).then(r => r.data),
  });
  const rad = data?.results?.[0] || data?.[0];
  if (!rad) return null;
  return (
    <Button
      icon={<FilePdfOutlined />}
      style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }}
      onClick={() => openPDF(rapportAPI.certificatRadiation(rad.id))}
    >
      Certificat de radiation
    </Button>
  );
};


// ── Composant principal ────────────────────────────────────────────────────────
const DetailRA = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t, isAr } = useLanguage();
  const { hasRole }  = useAuth();
  const isGreffier   = hasRole('GREFFIER');
  const isAgent      = hasRole('AGENT_GU') || hasRole('AGENT_TRIBUNAL');

  const [retourModal,      setRetourModal]      = useState(false);
  const [demandeModal,     setDemandeModal]      = useState(false);
  const [demandeType,      setDemandeType]       = useState(null);   // 'IMPRESSION_EXTRAIT_RA' | 'IMPRESSION_EXTRAIT_RC' | 'CORRECTION'
  const [demandeMotif,     setDemandeMotif]      = useState('');
  const [retourForm]                      = Form.useForm();
  const [uploadLoading, setUploadLoading] = useState(false);
  const [typeDocId,     setTypeDocId]     = useState(null);

  const { data: ra, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ra', id],
    queryFn:  () => registreAPI.getRA(id).then(r => r.data),
    retry: 1,
  });

  const envoyerMut = useMutation({
    mutationFn: () => registreAPI.envoyerRA(id),
    onSuccess:  () => { message.success(t('msg.dossiereEnvoye')); queryClient.invalidateQueries({ queryKey: ['ra', id] }); },
    onError:    (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const retournerMut = useMutation({
    mutationFn: (vals) => registreAPI.retournerRA(id, { observations_greffier: vals.observations_greffier }),
    onSuccess:  (res) => {
      message.success(t('msg.dossierRetourne'));
      if (res.data?.rc_retournes > 0) {
        message.info(`${res.data.rc_retournes} acte(s) chronologique(s) retourné(s) à l'agent.`, 4);
      }
      setRetourModal(false);
      retourForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['ra', id] });
      queryClient.invalidateQueries({ queryKey: ['rchrono'] });              // liste RC
      queryClient.invalidateQueries({ queryKey: ['rchrono-retourne-count'] }); // badge compteur
      queryClient.invalidateQueries({ queryKey: ['rchrono-brouillon-count'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const validerMut = useMutation({
    mutationFn: () => registreAPI.validerRA(id),
    onSuccess:  () => { message.success(t('msg.dossierValide')); queryClient.invalidateQueries({ queryKey: ['ra', id] }); },
    onError:    (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });



  const declarerBEMut = useMutation({
    mutationFn: () => registreAPI.declarerBE(id),
    onSuccess:  () => {
      message.success('Bénéficiaire effectif déclaré avec succès.');
      queryClient.invalidateQueries({ queryKey: ['ra', id] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Types de document ───────────────────────────────────────────────────────
  const { data: typesDocData } = useQuery({
    queryKey: ['types-doc'],
    queryFn:  () => parametrageAPI.typesDocuments().then(r => r.data),
  });
  const typesDocs = typesDocData?.results ?? typesDocData ?? [];

  const deleteDocMut = useMutation({
    mutationFn: (docId) => documentAPI.delete(docId),
    onSuccess:  () => { message.success(t('msg.docSupprime')); queryClient.invalidateQueries({ queryKey: ['ra', id] }); },
    onError:    () => message.error(t('msg.error')),
  });

  // ── Autorisations impression (agents uniquement, dossier IMMATRICULE) ──────
  const { data: authExtraitRA } = useQuery({
    queryKey: ['autorisation', 'IMPRESSION', 'EXTRAIT_RA', id],
    queryFn:  () => autorisationAPI.verifier({
      type_demande: 'IMPRESSION', type_dossier: 'RA', dossier_id: id,
    }).then(r => r.data),
    enabled:  isAgent,
    refetchInterval: 30_000,
  });
  const { data: authExtraitRC } = useQuery({
    queryKey: ['autorisation', 'IMPRESSION', 'EXTRAIT_RC_COMPLET', id],
    queryFn:  () => autorisationAPI.verifier({
      type_demande: 'IMPRESSION', type_dossier: 'RA', dossier_id: id,
    }).then(r => r.data),
    enabled:  isAgent,
    refetchInterval: 30_000,
  });

  // ── Demandes en cours (agent) ──────────────────────────────────────────────
  const { data: mesDemandes = [], refetch: refetchDemandes } = useQuery({
    queryKey: ['mes-autorisations', 'RA', id],
    queryFn:  () => autorisationAPI.list({ type_dossier: 'RA', dossier_id: id }).then(r => r.data),
    enabled:  isAgent,
    refetchInterval: 30_000,
  });
  const getDemande = (typeDemande, docType) =>
    mesDemandes.find(d => d.type_demande === typeDemande && (!docType || d.document_type === docType));

  // ── Créer une demande d'autorisation ──────────────────────────────────────
  const creerDemandeMut = useMutation({
    mutationFn: (payload) => autorisationAPI.create(payload),
    onSuccess: () => {
      message.success(t('autorisation.submittedOk'));
      setDemandeModal(false);
      setDemandeMotif('');
      refetchDemandes();
    },
    onError: e => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const openDemandeModal = (type) => {
    setDemandeType(type);
    setDemandeMotif('');
    setDemandeModal(true);
  };

  const submitDemande = () => {
    if (!demandeMotif.trim()) { message.warning(isAr ? 'السبب مطلوب.' : 'Le motif est obligatoire.'); return; }
    const payload = { type_dossier: 'RA', dossier_id: Number(id), motif: demandeMotif };
    if (demandeType === 'CORRECTION') {
      creerDemandeMut.mutate({ ...payload, type_demande: 'CORRECTION' });
    } else if (demandeType === 'EXTRAIT_RA') {
      creerDemandeMut.mutate({ ...payload, type_demande: 'IMPRESSION', document_type: 'EXTRAIT_RA' });
    } else if (demandeType === 'EXTRAIT_RC') {
      creerDemandeMut.mutate({ ...payload, type_demande: 'IMPRESSION', document_type: 'EXTRAIT_RC_COMPLET' });
    }
  };

  const handleUpload = async (file) => {
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      fd.append('ra', id);
      fd.append('nom_fichier', file.name);
      if (typeDocId) fd.append('type_doc', typeDocId);
      await documentAPI.upload(fd);
      message.success(t('msg.docUploaded'));
      queryClient.invalidateQueries({ queryKey: ['ra', id] });
    } catch {
      message.error(t('msg.error'));
    } finally {
      setUploadLoading(false);
    }
    return false;
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!ra)       return <AccessDenied onRetry={refetch} style="inline" />;

  const STATUT_TAG = {
    BROUILLON:              { color: 'default',    label: t('status.brouillon') },
    EN_INSTANCE_VALIDATION: { color: 'processing', label: t('status.enInstance') },
    RETOURNE:               { color: 'warning',    label: t('status.retourne') },
    EN_COURS:               { color: 'warning',    label: t('status.enCours') },
    IMMATRICULE:            { color: 'success',    label: t('status.immatricule') },
    RADIE:                  { color: 'error',      label: t('status.radie') },
    SUSPENDU:               { color: 'orange',     label: t('status.suspendu') },
    ANNULE:                 { color: 'default',    label: t('status.annule') },
  };

  const statut = STATUT_TAG[ra.statut] || { color: 'default', label: ra.statut };

  const docColumns = [
    {
      title:     t('doc.nom'),
      dataIndex: 'nom_fichier',
      key:       'nom',
      render:    (v, doc) => (
        <Space>
          <FileOutlined style={{ color: '#1a4480' }} />
          <span>{v}</span>
          {doc.source === 'chrono' && (
            <Tag color="blue" style={{ fontSize: 11 }}>RC</Tag>
          )}
        </Space>
      ),
    },
    {
      title:     t('doc.type'),
      dataIndex: isAr ? 'type_doc_libelle_ar' : 'type_doc_libelle',
      key:       'type',
      width:     160,
      render:    v => v || '—',
    },
    { title: t('doc.taille'), dataIndex: 'taille_ko', key: 'taille', width: 90,
      render: v => v ? `${v} Ko` : '—' },
    { title: t('doc.date'),   dataIndex: 'date_scan',  key: 'date',  width: 110 },
    {
      title:  t('field.actions'),
      key:    'actions',
      width:  110,
      fixed:  'right',
      render: (_, doc) => (
        <Space>
          <Tooltip title={t('common.download')}>
            <Button size="small" icon={<DownloadOutlined />}
              onClick={() => openPDF(documentAPI.download(doc.id))} />
          </Tooltip>
          <Popconfirm
            title={t('modal.confirmDelete')}
            onConfirm={() => deleteDocMut.mutate(doc.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const gerantCols = [
    {
      title: 'Type', dataIndex: 'type_gerant', key: 'type', width: 50,
      render: v => v ? <Tag color={v === 'PH' ? 'blue' : 'green'} style={{ fontSize: 11 }}>{v}</Tag> : null,
    },
    { title: t('field.nom'),         dataIndex: 'nom_entite',     key: 'nom',      render: (v, r) => v || r.nom_gerant },
    { title: t('field.fonction'),    dataIndex: 'fonction_lib',   key: 'fonction' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_lib',key: 'nat' },
    { title: t('field.dateDebut'),   dataIndex: 'date_debut',     key: 'debut' },
    { title: t('field.dateFin'),     dataIndex: 'date_fin',       key: 'fin',  render: v => v || '—' },
  ];

  const gerantExpandable = {
    rowExpandable: (r) => {
      const di = r.donnees_ident || {};
      return !!(di.nni || di.num_passeport || di.date_naissance || di.lieu_naissance || di.telephone || di.domicile || di.prenom);
    },
    expandedRowRender: (r) => {
      const di = r.donnees_ident || {};
      return (
        <Descriptions size="small" column={3} style={{ padding: '4px 32px', background: '#fafafa' }}>
          {di.prenom         && <Descriptions.Item label="Prénom">{di.prenom}</Descriptions.Item>}
          {di.nni            && <Descriptions.Item label="NNI">{di.nni}</Descriptions.Item>}
          {di.num_passeport  && <Descriptions.Item label="Passeport">{di.num_passeport}</Descriptions.Item>}
          {di.date_naissance && <Descriptions.Item label="Date naiss.">{di.date_naissance}</Descriptions.Item>}
          {di.lieu_naissance && <Descriptions.Item label="Lieu naiss.">{di.lieu_naissance}</Descriptions.Item>}
          {di.telephone      && <Descriptions.Item label="Tél.">{di.telephone}</Descriptions.Item>}
          {di.domicile       && <Descriptions.Item label="Domicile">{di.domicile}</Descriptions.Item>}
        </Descriptions>
      );
    },
  };

  const associeCols = [
    {
      title: 'Type', dataIndex: 'type_associe', key: 'type', width: 50,
      render: v => v ? <Tag color={v === 'PH' ? 'blue' : 'green'} style={{ fontSize: 11 }}>{v}</Tag> : null,
    },
    {
      title: t('field.nom'), key: 'nom',
      render: (_, r) => {
        // PH lié à une fiche PH existante → nom_entite = ph.nom_complet (nom + prenom déjà inclus)
        // PH non lié (saisi manuellement) → nom_entite = nom_associe seulement
        //   → on ajoute le prenom depuis donnees_ident
        const base = r.nom_entite || r.nom_associe || '';
        if (r.type_associe === 'PH' && !r.ph) {
          const di = r.donnees_ident || {};
          const civ = formatCivilite(di.civilite, isAr ? 'ar' : 'fr');
          const prenom = di.prenom || '';
          return [civ, prenom, base].filter(Boolean).join(' ');
        }
        return base;
      },
    },
    { title: t('field.parts'),       dataIndex: 'nombre_parts',  key: 'parts' },
    { title: t('field.valeur'),      dataIndex: 'valeur_parts',  key: 'valeur' },
    { title: t('field.pourcentage'), dataIndex: 'pourcentage',   key: 'pct',   render: v => v ? `${v}%` : '—' },
    { title: t('field.nationalite'), dataIndex: 'nationalite_lib',key: 'nat' },
  ];

  const associeExpandable = {
    rowExpandable: (r) => {
      const di = r.donnees_ident || {};
      if (r.type_associe === 'PM') return !!(di.denomination || di.numero_rc || di.siege_social || di.date_immatriculation);
      // Prénom maintenant visible dans la colonne principale — on n'ouvre la ligne que si d'autres données existent
      return !!(di.nni || di.num_passeport || di.date_naissance || di.lieu_naissance || di.telephone || di.domicile);
    },
    expandedRowRender: (r) => {
      const di = r.donnees_ident || {};
      if (r.type_associe === 'PM') {
        return (
          <Descriptions size="small" column={3} style={{ padding: '4px 32px', background: '#f6ffed' }}>
            {di.denomination         && <Descriptions.Item label="Dénomination">{di.denomination}</Descriptions.Item>}
            {di.numero_rc            && <Descriptions.Item label="N° RC">{di.numero_rc}</Descriptions.Item>}
            {di.siege_social         && <Descriptions.Item label="Siège social">{di.siege_social}</Descriptions.Item>}
            {di.date_immatriculation && <Descriptions.Item label="Date immat.">{di.date_immatriculation}</Descriptions.Item>}
          </Descriptions>
        );
      }
      return (
        <Descriptions size="small" column={3} style={{ padding: '4px 32px', background: '#f0f5ff' }}>
          {/* Prénom affiché directement dans la colonne nom — on ne le répète pas ici */}
          {di.nni            && <Descriptions.Item label="NNI">{di.nni}</Descriptions.Item>}
          {di.num_passeport  && <Descriptions.Item label="Passeport">{di.num_passeport}</Descriptions.Item>}
          {di.date_naissance && <Descriptions.Item label="Date naiss.">{di.date_naissance}</Descriptions.Item>}
          {di.lieu_naissance && <Descriptions.Item label="Lieu naiss.">{di.lieu_naissance}</Descriptions.Item>}
          {di.telephone      && <Descriptions.Item label="Tél.">{di.telephone}</Descriptions.Item>}
          {di.domicile       && <Descriptions.Item label="Domicile">{di.domicile}</Descriptions.Item>}
        </Descriptions>
      );
    },
  };

  const TYPE_SECTION_LABEL = {
    PH: `👤 ${t('entity.ph')}`,
    PM: `🏢 ${t('entity.pm')}`,
    SC: `🌐 ${t('entity.sc')}`,
  };

  const tabItems = [
    {
      key: 'info', label: `📄 ${t('tab.informations')}`,
      children: (
        <>
          {ra.statut === 'RETOURNE' && ra.observations_greffier && (
            <Alert
              type="warning"
              showIcon
              message={t('alert.dossierRetourne')}
              description={ra.observations_greffier}
              style={{ marginBottom: 16 }}
            />
          )}

          <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('field.numeroRA')}  span={1}><strong>{ra.numero_ra}</strong></Descriptions.Item>
            <Descriptions.Item label={t('field.numeroRC')}  span={1}>{ra.numero_rc || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('field.type')}      span={1}><Tag>{ra.type_entite}</Tag></Descriptions.Item>
            <Descriptions.Item label={t('field.statut')}    span={1}><Tag color={statut.color}>{statut.label}</Tag></Descriptions.Item>
            <Descriptions.Item label={t('field.greffe')}    span={1}>{ra.localite_libelle || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('field.dateImmat')} span={1}>{ra.date_immatriculation || '—'}</Descriptions.Item>
            {ra.validated_by_nom && (
              <Descriptions.Item label={t('field.validePar')} span={1}>{ra.validated_by_nom}</Descriptions.Item>
            )}
            {ra.created_by_nom && (
              <Descriptions.Item label={t('field.creePar')}  span={1}>{ra.created_by_nom}</Descriptions.Item>
            )}
          </Descriptions>

          <Divider orientation={isAr ? 'right' : 'left'}>
            {TYPE_SECTION_LABEL[ra.type_entite] || ra.type_entite}
          </Divider>
          {ra.type_entite === 'PH' && <SectionPH ph={ra.ph_data} extra={ra.description_extra} t={t} isAr={isAr} />}
          {ra.type_entite === 'PM' && <SectionPM pm={ra.pm_data} extra={ra.description_extra} t={t} isAr={isAr} />}
          {ra.type_entite === 'SC' && <SectionSC sc={ra.sc_data} extra={ra.description_extra} t={t} isAr={isAr} />}

          {ra.observations && (
            <>
              <Divider />
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label={t('field.observations')}>{ra.observations}</Descriptions.Item>
              </Descriptions>
            </>
          )}
        </>
      ),
    },

    {
      key: 'gerants',
      label: `👔 ${ra.type_entite === 'SC' ? t('tab.directeurs') : t('tab.gerants')} (${ra.gerants?.length || 0})`,
      children: (
        <Table
          dataSource={ra.gerants || []}
          columns={gerantCols}
          rowKey="id"
          size="small"
          pagination={false}
          expandable={gerantExpandable}
        />
      ),
    },

    ra.type_entite !== 'PH' && {
      key: 'associes',
      label: `🤝 ${t('tab.associes')} (${ra.associes?.length || 0})`,
      children: (
        <Table
          dataSource={ra.associes || []}
          columns={associeCols}
          rowKey="id"
          size="small"
          pagination={false}
          expandable={associeExpandable}
        />
      ),
    },

    // ── Conseil d'administration — SA uniquement ───────────────────────────────
    ra.est_sa && {
      key: 'conseil_admin',
      label: (
        <span>
          🏛️ {isAr ? 'مجلس الإدارة' : 'Conseil d\'administration'}
          {' '}({ra.administrateurs?.length || 0})
        </span>
      ),
      children: (
        <>
          {(ra.administrateurs || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              {isAr ? 'لا يوجد أعضاء مسجلون في مجلس الإدارة.' : 'Aucun administrateur enregistré.'}
            </div>
          ) : (
            <Table
              dataSource={ra.administrateurs || []}
              rowKey="id"
              size="small"
              pagination={false}
              expandable={{
                rowExpandable: r => !!(r.nni || r.num_passeport || r.date_naissance || r.lieu_naissance || r.adresse || r.email),
                expandedRowRender: r => (
                  <Descriptions size="small" column={3}
                    style={{ padding: '4px 32px', background: '#f0f5ff' }}>
                    {r.nni            && <Descriptions.Item label={isAr ? 'رقم الهوية' : 'NNI'}>{r.nni}</Descriptions.Item>}
                    {r.num_passeport  && <Descriptions.Item label={isAr ? 'جواز السفر' : 'Passeport'}>{r.num_passeport}</Descriptions.Item>}
                    {r.date_naissance && <Descriptions.Item label={isAr ? 'تاريخ الميلاد' : 'Date naissance'}>{r.date_naissance}</Descriptions.Item>}
                    {r.lieu_naissance && <Descriptions.Item label={isAr ? 'مكان الميلاد' : 'Lieu naissance'}>{r.lieu_naissance}</Descriptions.Item>}
                    {r.adresse        && <Descriptions.Item label={isAr ? 'العنوان' : 'Adresse'} span={2}>{r.adresse}</Descriptions.Item>}
                    {r.email          && <Descriptions.Item label="Email">{r.email}</Descriptions.Item>}
                    {r.telephone      && <Descriptions.Item label={isAr ? 'الهاتف' : 'Téléphone'}>{r.telephone}</Descriptions.Item>}
                  </Descriptions>
                ),
              }}
              columns={[
                {
                  title: isAr ? 'الاسم واللقب' : 'Nom et prénoms',
                  key: 'nom',
                  render: r => {
                    const civ = formatCivilite(r.civilite, isAr ? 'ar' : 'fr');
                    const nomFr = r.nom_complet || [civ, r.prenom, r.nom].filter(Boolean).join(' ');
                    return (
                      <span>
                        <strong>{nomFr}</strong>
                        {r.nom_ar && <div style={{ fontSize: 11, color: '#6b7280', direction: 'rtl' }}>{r.nom_ar} {r.prenom_ar}</div>}
                      </span>
                    );
                  },
                },
                {
                  title: isAr ? 'المهمة' : 'Fonction',
                  dataIndex: 'fonction',
                  key: 'fonction',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'الجنسية' : 'Nationalité',
                  dataIndex: isAr ? 'nationalite_lib_ar' : 'nationalite_lib',
                  key: 'nat',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'تاريخ المباشرة' : 'Début mandat',
                  dataIndex: 'date_debut',
                  key: 'debut',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'تاريخ الانتهاء' : 'Fin mandat',
                  dataIndex: 'date_fin',
                  key: 'fin',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'الحالة' : 'Statut',
                  dataIndex: 'actif',
                  key: 'actif',
                  width: 80,
                  render: v => (
                    <Tag color={v ? 'green' : 'default'}>
                      {v ? (isAr ? 'نشط' : 'Actif') : (isAr ? 'غير نشط' : 'Inactif')}
                    </Tag>
                  ),
                },
              ]}
            />
          )}
        </>
      ),
    },

    // ── Commissaires aux comptes — SA uniquement ───────────────────────────────
    ra.est_sa && {
      key: 'commissaires',
      label: (
        <span>
          🔍 {isAr ? 'مراقبو الحسابات' : 'Commissaires aux comptes'}
          {' '}({ra.commissaires?.length || 0})
        </span>
      ),
      children: (
        <>
          {(ra.commissaires || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              {isAr ? 'لا يوجد مراقبو حسابات مسجلون.' : 'Aucun commissaire aux comptes enregistré.'}
            </div>
          ) : (
            <Table
              dataSource={ra.commissaires || []}
              rowKey="id"
              size="small"
              pagination={false}
              expandable={{
                rowExpandable: r => !!(r.nni || r.num_passeport || r.date_naissance || r.lieu_naissance || r.adresse || r.email),
                expandedRowRender: r => (
                  <Descriptions size="small" column={3}
                    style={{ padding: '4px 32px', background: '#fffbe6' }}>
                    {r.nni            && <Descriptions.Item label={isAr ? 'رقم الهوية' : 'NNI'}>{r.nni}</Descriptions.Item>}
                    {r.num_passeport  && <Descriptions.Item label={isAr ? 'جواز السفر' : 'Passeport'}>{r.num_passeport}</Descriptions.Item>}
                    {r.date_naissance && <Descriptions.Item label={isAr ? 'تاريخ الميلاد' : 'Date naissance'}>{r.date_naissance}</Descriptions.Item>}
                    {r.lieu_naissance && <Descriptions.Item label={isAr ? 'مكان الميلاد' : 'Lieu naissance'}>{r.lieu_naissance}</Descriptions.Item>}
                    {r.adresse        && <Descriptions.Item label={isAr ? 'العنوان' : 'Adresse'} span={2}>{r.adresse}</Descriptions.Item>}
                    {r.email          && <Descriptions.Item label="Email">{r.email}</Descriptions.Item>}
                    {r.telephone      && <Descriptions.Item label={isAr ? 'الهاتف' : 'Téléphone'}>{r.telephone}</Descriptions.Item>}
                  </Descriptions>
                ),
              }}
              columns={[
                {
                  title: isAr ? 'الاسم' : 'Nom',
                  key: 'nom',
                  render: r => {
                    const civ = formatCivilite(r.civilite, isAr ? 'ar' : 'fr');
                    const nomFr = r.nom_complet || [civ, r.prenom, r.nom].filter(Boolean).join(' ');
                    return (
                      <span>
                        <strong>{nomFr}</strong>
                        {r.nom_ar && <div style={{ fontSize: 11, color: '#6b7280', direction: 'rtl' }}>{r.nom_ar}</div>}
                      </span>
                    );
                  },
                },
                {
                  title: isAr ? 'الرتبة' : 'Rôle',
                  dataIndex: 'role_label',
                  key: 'role',
                  render: (v, r) => (
                    <Tag color={r.role === 'TITULAIRE' ? 'blue' : 'orange'} style={{ fontSize: 11 }}>
                      {isAr
                        ? (r.role === 'TITULAIRE' ? 'أصيل' : 'نائب')
                        : (v || r.role)}
                    </Tag>
                  ),
                },
                {
                  title: isAr ? 'النوع' : 'Type',
                  dataIndex: 'type_label',
                  key: 'type',
                  render: (v, r) => (
                    <Tag color={r.type_commissaire === 'PH' ? 'blue' : 'green'} style={{ fontSize: 11 }}>
                      {r.type_commissaire}
                    </Tag>
                  ),
                },
                {
                  title: isAr ? 'الجنسية' : 'Nationalité',
                  dataIndex: isAr ? 'nationalite_lib_ar' : 'nationalite_lib',
                  key: 'nat',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'تاريخ التعيين' : 'Date nomination',
                  dataIndex: 'date_debut',
                  key: 'debut',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'تاريخ الانتهاء' : 'Fin mandat',
                  dataIndex: 'date_fin',
                  key: 'fin',
                  render: v => v || '—',
                },
                {
                  title: isAr ? 'الحالة' : 'Statut',
                  dataIndex: 'actif',
                  key: 'actif',
                  width: 80,
                  render: v => (
                    <Tag color={v ? 'green' : 'default'}>
                      {v ? (isAr ? 'نشط' : 'Actif') : (isAr ? 'غير نشط' : 'Inactif')}
                    </Tag>
                  ),
                },
              ]}
            />
          )}
        </>
      ),
    },

    {
      key: 'domaines',
      label: `🏭 ${t('tab.domaines')}`,
      children: (
        <ul style={{ paddingLeft: isAr ? 0 : 20, paddingRight: isAr ? 20 : 0 }}>
          {(ra.domaines || []).map(d => (
            <li key={d.id}>
              {d.domaine_libelle}
              {d.principal && <Tag color="blue" style={{ marginInlineStart: 8 }}>{t('field.principal')}</Tag>}
            </li>
          ))}
          {(ra.domaines || []).length === 0 && <li style={{ color: '#999' }}>{t('msg.aucunDomaine')}</li>}
        </ul>
      ),
    },

    {
      key: 'documents',
      label: `📎 ${t('tab.documents')} (${ra.documents?.length || 0})`,
      children: (
        <div>
          <Space style={{ marginBottom: 16 }} wrap>
            <Select
              placeholder={t('doc.typeDoc')}
              value={typeDocId}
              onChange={setTypeDocId}
              allowClear
              style={{ width: 240 }}
              options={typesDocs.map(td => ({
                value: td.id,
                label: isAr ? (td.libelle_ar || td.libelle_fr) : td.libelle_fr,
              }))}
            />
            <Upload
              beforeUpload={handleUpload}
              showUploadList={false}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            >
              <Button icon={<UploadOutlined />} loading={uploadLoading}>
                {t('doc.ajouter')}
              </Button>
            </Upload>
          </Space>
          <Table
            dataSource={ra.documents || []}
            columns={docColumns}
            rowKey="id"
            size="small"
            scroll={{ x: 700 }}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: t('doc.aucun') }}
          />
        </div>
      ),
    },

    {
      key: 'operations',
      label: (
        <span>
          <AuditOutlined /> Opérations ({ra.operations?.length || 0})
        </span>
      ),
      children: (() => {
        const ops = ra.operations || [];
        const opColumns = [
          {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            width: 170,
            render: (v, r) => {
              const cfg = OP_TYPE_CONFIG[v] || { color: '#555', bg: '#f5f5f5', label: v };
              return (
                <span style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: cfg.color,
                  background: cfg.bg,
                  border: `1px solid ${cfg.color}33`,
                }}>
                  {r.type_label || cfg.label}
                </span>
              );
            },
          },
          {
            title: 'Numéro / Référence',
            dataIndex: 'numero',
            key: 'numero',
            width: 200,
            render: (v, r) => (
              <span>
                <Text code style={{ fontSize: 12 }}>{v}</Text>
                {r.resume && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {r.resume}
                  </div>
                )}
              </span>
            ),
          },
          {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            width: 110,
          },
          {
            title: 'Statut',
            dataIndex: 'statut',
            key: 'statut',
            width: 130,
            render: (v, r) => (
              <Tag color={OP_STATUT_COLOR[v] || 'default'} style={{ fontSize: 11 }}>
                {r.statut_label || v}
              </Tag>
            ),
          },
          {
            title: 'Créé par',
            dataIndex: 'created_by_nom',
            key: 'created_by',
            render: v => <Text type="secondary" style={{ fontSize: 12 }}><UserOutlined /> {v}</Text>,
          },
          {
            title: '',
            key: 'action',
            width: 60,
            render: (_, r) => r.url ? (
              <Tooltip title="Voir le détail">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(r.url)}
                />
              </Tooltip>
            ) : null,
          },
        ];

        if (ops.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              Aucune opération enregistrée.
            </div>
          );
        }

        return (
          <Table
            dataSource={ops}
            columns={opColumns}
            rowKey={(r, i) => `${r.module}-${r.id_ref}-${i}`}
            size="small"
            pagination={false}
            scroll={{ x: 700 }}
            rowClassName={(r) => r.type === 'RADIATION' ? 'op-row-radiation' : ''}
          />
        );
      })(),
    },

    {
      key: 'historique',
      label: `📜 Journal (${ra.historique?.length || 0})`,
      children: (
        <Timeline mode="left" style={{ padding: '8px 0' }}>
          {(ra.historique || []).map(h => (
            <Timeline.Item
              key={h.id}
              color={ACTION_COLOR[h.action] || 'blue'}
              label={<Text type="secondary" style={{ fontSize: 12 }}>{new Date(h.created_at).toLocaleString(isAr ? 'ar-MA' : 'fr-FR')}</Text>}
            >
              <Space direction="vertical" size={0}>
                <Space size={8} align="center">
                  <Text strong>{h.action_label}</Text>
                  {h.reference_operation && (
                    <Text type="secondary" style={{ fontSize: 12 }}>— {h.reference_operation}</Text>
                  )}
                  {h.lien_detail && (
                    <Button
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      onClick={() => navigate(h.lien_detail)}
                    >
                      Voir
                    </Button>
                  )}
                </Space>
                {h.created_by_nom && (
                  <Text type="secondary"><UserOutlined /> {h.created_by_nom}</Text>
                )}
                {h.commentaire && <Text>{h.commentaire}</Text>}
              </Space>
            </Timeline.Item>
          ))}
          {(ra.historique || []).length === 0 && (
            <Text type="secondary">{t('msg.aucuneAction')}</Text>
          )}
        </Timeline>
      ),
    },
  ].filter(Boolean);

  return (
    <div>
      {ra.statut === 'RADIE' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              <strong>Dossier radié</strong>
              {ra.date_radiation && ` — Date de radiation : ${ra.date_radiation}`}
              {ra.motif_radiation && ` · Motif : ${ra.motif_radiation}`}
            </span>
          }
        />
      )}
      {/* Bandeau bénéficiaire effectif — uniquement pour PM et SC */}
      {ra.type_entite !== 'PH' && ra.statut === 'IMMATRICULE' && ra.statut_be !== 'DECLARE' && (
        <Alert
          type={ra.statut_be === 'EN_RETARD' ? 'error' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            ra.statut_be === 'EN_RETARD'
              ? `⚠️ Bénéficiaire effectif en retard — délai expiré${ra.date_limite_be ? ` le ${ra.date_limite_be}` : ''}.`
              : ra.statut_be === 'EN_ATTENTE'
              ? `⏳ Bénéficiaire effectif en attente — à déclarer avant le ${ra.date_limite_be || '—'}.`
              : "❌ Bénéficiaire effectif non déclaré."
          }
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>📋 {t('ra.dossier')}</Title>
          <Tag color={statut.color} style={{ fontSize: 14, padding: '2px 10px' }}>{statut.label}</Tag>
          {ra.type_entite !== 'PH' && ra.statut_be && (() => {
            const beColors = { NON_DECLARE: 'default', EN_ATTENTE: 'orange', DECLARE: 'green', EN_RETARD: 'red' };
            const beKeys   = { NON_DECLARE: 'status.beNonDeclare', EN_ATTENTE: 'status.beEnAttente', DECLARE: 'status.beDeclare', EN_RETARD: 'status.beEnRetard' };
            return (
              <Tag color={beColors[ra.statut_be] || 'default'} style={{ fontSize: 12 }}>
                BE — {t(beKeys[ra.statut_be]) || ra.statut_be}
              </Tag>
            );
          })()}
        </Space>

        <Space wrap>
          {/* Corriger / Modifier — agents uniquement, BROUILLON ou RETOURNE */}
          {!isGreffier && (ra.statut === 'BROUILLON' || ra.statut === 'RETOURNE') && (() => {
            const rcImmat = (ra.operations || []).find(
              op => op.type === 'IMMATRICULATION' && op.module === 'chrono'
            );
            return rcImmat ? (
              <Button icon={<EditOutlined />}
                danger={ra.statut === 'RETOURNE'}
                onClick={() => navigate(`/registres/chronologique/${rcImmat.id_ref}/rectifier`)}>
                {ra.statut === 'RETOURNE' ? t('action.corrigerDossier') : t('action.modifier')}
              </Button>
            ) : null;
          })()}

          {/* Modifier — greffier : BROUILLON / RETOURNE / EN_INSTANCE_VALIDATION */}
          {isGreffier && (
            ra.statut === 'BROUILLON' ||
            ra.statut === 'RETOURNE' ||
            ra.statut === 'EN_INSTANCE_VALIDATION'
          ) && (() => {
            const rcImmat = (ra.operations || []).find(
              op => op.type === 'IMMATRICULATION' && op.module === 'chrono'
            );
            return rcImmat ? (
              <Button icon={<EditOutlined />}
                danger={ra.statut === 'RETOURNE'}
                onClick={() => navigate(`/registres/chronologique/${rcImmat.id_ref}/rectifier`)}>
                {t('action.modifier')}
              </Button>
            ) : null;
          })()}

          {/* Transmettre / Soumettre à nouveau — agents ET greffier, BROUILLON / RETOURNE / EN_COURS */}
          {(ra.statut === 'BROUILLON' || ra.statut === 'RETOURNE' || ra.statut === 'EN_COURS') && (
            <Button type="primary" icon={<SendOutlined />}
              onClick={() => envoyerMut.mutate()}
              loading={envoyerMut.isPending}
              style={{ background: '#1a4480' }}>
              {ra.statut === 'RETOURNE' ? t('action.soumettreNouveau') : t('action.envoyerGreffier')}
            </Button>
          )}

          {/* Valider / Immatriculer — greffier uniquement, EN_INSTANCE_VALIDATION */}
          {isGreffier && (ra.statut === 'EN_INSTANCE_VALIDATION' || ra.statut === 'EN_COURS') && (
            <Button type="primary" icon={<CheckCircleOutlined />}
              onClick={() => validerMut.mutate()}
              loading={validerMut.isPending}
              style={{ background: '#2e7d32' }}>
              {t('action.validerImmatriculer')}
            </Button>
          )}

          {/* Retourner à l'agent — greffier uniquement, EN_INSTANCE_VALIDATION */}
          {isGreffier && (ra.statut === 'EN_INSTANCE_VALIDATION' || ra.statut === 'EN_COURS') && (
            <Button icon={<RollbackOutlined />} danger onClick={() => setRetourModal(true)}>
              {t('action.retournerAgent')}
            </Button>
          )}

          {ra.type_entite !== 'PH' && ra.statut === 'IMMATRICULE' && ra.statut_be !== 'DECLARE' && (
            <Button
              icon={<SafetyCertificateOutlined />}
              type="primary"
              style={{ background: '#d46b08', borderColor: '#d46b08' }}
              loading={declarerBEMut.isPending}
              onClick={() => declarerBEMut.mutate()}
            >
              Déclarer BE
            </Button>
          )}

          {/* ── Impression dossier IMMATRICULE ─────────────────────────── */}
          {ra.statut === 'IMMATRICULE' && isGreffier && (
            <>
              <Button icon={<FilePdfOutlined />}
                onClick={() => openPDF(rapportAPI.attestationImmatriculation(id))}>
                {t('action.attestation')}
              </Button>
              <Button icon={<PrinterOutlined />}
                onClick={() => openPDF(rapportAPI.extraitRC(id))}>
                {t('action.extraitRC')}
              </Button>
            </>
          )}

          {/* ── Agents : demande de correction sur dossier transmis (EN_INSTANCE_VALIDATION) ── */}
          {ra.statut === 'EN_INSTANCE_VALIDATION' && isAgent && (() => {
            const dCorrection = getDemande('CORRECTION');
            if (dCorrection?.statut === 'EN_ATTENTE') {
              return (
                <Tooltip title={isAr ? 'في انتظار قرار كاتب الضبط' : 'Demande de correction en attente du greffier'}>
                  <Button icon={<ClockCircleOutlined />} disabled style={{ color: '#faad14', borderColor: '#faad14' }}>
                    {isAr ? 'طلب التصحيح — قيد الانتظار' : 'Correction — en attente'}
                  </Button>
                </Tooltip>
              );
            }
            return (
              <Tooltip title={
                dCorrection?.statut === 'REFUSEE'
                  ? (isAr ? `مرفوض: ${dCorrection?.motif_decision || ''}` : `Refusé : ${dCorrection?.motif_decision || ''}`)
                  : (isAr ? 'طلب استرداد الملف للتصحيح — يتطلب موافقة كاتب الضبط' : 'Demander au greffier de retourner ce dossier pour correction')
              }>
                <Button
                  icon={<LockOutlined />}
                  danger={dCorrection?.statut === 'REFUSEE'}
                  style={dCorrection?.statut !== 'REFUSEE' ? { borderColor: '#722ed1', color: '#722ed1' } : undefined}
                  onClick={() => openDemandeModal('CORRECTION')}>
                  {isAr ? '🔒 طلب التصحيح' : '🔒 Demander correction'}
                </Button>
              </Tooltip>
            );
          })()}

          {/* ── Agents : boutons impression + correction sur dossier IMMATRICULE ── */}
          {ra.statut === 'IMMATRICULE' && isAgent && (() => {
            const dExtraitRA  = getDemande('IMPRESSION', 'EXTRAIT_RA');
            const dExtraitRC  = getDemande('IMPRESSION', 'EXTRAIT_RC_COMPLET');
            const dCorrection = getDemande('CORRECTION');

            // Bouton d'impression contrôlé par autorisation greffier
            const AuthButton = ({ demande, docType, label, icon }) => {
              const isAutorisee = demande?.statut === 'AUTORISEE' &&
                demande?.date_expiration && new Date(demande.date_expiration) > new Date();
              const isEnAttente = demande?.statut === 'EN_ATTENTE';
              const isRefusee   = demande?.statut === 'REFUSEE';

              // ✅ Autorisé : impression directe avec compte à rebours
              if (isAutorisee) {
                const mins = Math.max(0, Math.round(
                  (new Date(demande.date_expiration) - new Date()) / 60000
                ));
                return (
                  <Tooltip title={`${isAr ? 'مقبول — ' : 'Autorisé — '}${mins} min`}>
                    <Button icon={<UnlockOutlined />}
                      style={{ borderColor: '#389e0d', color: '#389e0d' }}
                      onClick={() => openPDF(
                        docType === 'EXTRAIT_RA'
                          ? rapportAPI.attestationImmatriculation(id)
                          : rapportAPI.extraitRC(id)
                      )}>
                      {label}
                      <small style={{ marginLeft: 4, opacity: 0.7 }}>({mins}min)</small>
                    </Button>
                  </Tooltip>
                );
              }
              // ⏳ En attente de décision
              if (isEnAttente) {
                return (
                  <Tooltip title={isAr ? 'في انتظار قرار كاتب الضبط' : 'En attente du greffier'}>
                    <Button icon={<ClockCircleOutlined />} disabled style={{ color: '#faad14', borderColor: '#faad14' }}>
                      {label}
                    </Button>
                  </Tooltip>
                );
              }
              // 🔒 Verrouillé (jamais demandé ou refusé) — libellé explicite
              return (
                <Tooltip title={
                  isRefusee
                    ? (isAr ? `مرفوض : ${demande?.motif_decision || ''}` : `Refusé : ${demande?.motif_decision || ''}`)
                    : (isAr ? 'اضغط لإرسال طلب الطباعة إلى كاتب الضبط' : 'Cliquer pour demander l\'autorisation d\'impression au greffier')
                }>
                  <Button
                    icon={<LockOutlined />}
                    danger={isRefusee}
                    style={!isRefusee ? { borderColor: '#722ed1', color: '#722ed1' } : undefined}
                    onClick={() => openDemandeModal(docType)}>
                    {isRefusee
                      ? label
                      : (isAr ? `🔒 ${label}` : `🔒 ${label}`)}
                  </Button>
                </Tooltip>
              );
            };

            return (
              <>
                <AuthButton
                  demande={dExtraitRA}
                  docType="EXTRAIT_RA"
                  label={t('action.attestation')}
                  icon={<FilePdfOutlined />}
                />
                <AuthButton
                  demande={dExtraitRC}
                  docType="EXTRAIT_RC"
                  label={t('action.extraitRC')}
                  icon={<PrinterOutlined />}
                />
                {/* ── Demander correction du dossier validé ── */}
                {dCorrection?.statut === 'EN_ATTENTE' ? (
                  <Tooltip title={isAr ? 'في انتظار قرار كاتب الضبط' : 'Correction en attente du greffier'}>
                    <Button icon={<ClockCircleOutlined />} disabled style={{ color: '#faad14', borderColor: '#faad14' }}>
                      {isAr ? 'التصحيح — قيد الانتظار' : 'Correction — en attente'}
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip title={
                    dCorrection?.statut === 'REFUSEE'
                      ? (isAr ? `مرفوض : ${dCorrection?.motif_decision || ''}` : `Refusé : ${dCorrection?.motif_decision || ''}`)
                      : (isAr ? 'طلب تصحيح الملف — يتطلب موافقة كاتب الضبط' : 'Demander une correction au greffier (dossier retournera en RETOURNE)')
                  }>
                    <Button
                      icon={<LockOutlined />}
                      danger={dCorrection?.statut === 'REFUSEE'}
                      style={dCorrection?.statut !== 'REFUSEE' ? { borderColor: '#722ed1', color: '#722ed1' } : undefined}
                      onClick={() => openDemandeModal('CORRECTION')}>
                      {isAr ? '🔒 طلب التصحيح' : '🔒 Demander correction'}
                    </Button>
                  </Tooltip>
                )}
              </>
            );
          })()}
          {ra.statut === 'RADIE' && <RadiationCertificatButton raId={id} />}

          <Button onClick={() => navigate('/registres/analytique')}>{t('action.back')}</Button>
        </Space>
      </div>

      <Card>
        <Tabs items={tabItems} />
      </Card>

      <Modal
        title={`🔄 ${t('modal.retourTitle')}`}
        open={retourModal}
        onOk={() => retourForm.validateFields().then(vals => retournerMut.mutate(vals))}
        onCancel={() => { setRetourModal(false); retourForm.resetFields(); }}
        okText={t('action.retourner')}
        cancelText={t('action.cancel')}
        confirmLoading={retournerMut.isPending}
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <p style={{ color: '#555', marginBottom: 12 }}>{t('modal.retourDesc')}</p>
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations_greffier"
            label={
              <span>
                <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                Observations / corrections attendues
              </span>
            }
            rules={[
              { required: true, whitespace: true, message: 'Les observations sont obligatoires pour retourner un dossier.' },
              { min: 10, message: 'Veuillez détailler les corrections attendues (minimum 10 caractères).' },
            ]}
          >
            <TextArea
              rows={5}
              placeholder="Décrivez précisément les corrections ou informations manquantes attendues de l'agent…"
              showCount
              maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal demande d'autorisation (agents) ──────────────────────────── */}
      <Modal
        title={
          demandeType === 'CORRECTION'
            ? `🔒 ${isAr ? t('autorisation.demanderCorrection') : 'Demander une autorisation de correction'}`
            : `🖨️ ${isAr ? t('autorisation.demanderImpression') : 'Demander une autorisation d\'impression'}`
        }
        open={demandeModal}
        onCancel={() => { setDemandeModal(false); setDemandeMotif(''); }}
        onOk={submitDemande}
        okText={isAr ? 'إرسال الطلب' : 'Envoyer la demande'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        confirmLoading={creerDemandeMut.isPending}
        destroyOnClose
      >
        {demandeType === 'CORRECTION' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={isAr
              ? 'بعد الموافقة، سيُعاد الملف تلقائياً إلى حالة "مُعاد" لتمكينك من التصحيح.'
              : 'Après autorisation, le dossier repassera automatiquement à l\'état RETOURNE pour vous permettre de corriger.'}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={isAr
              ? 'بعد الموافقة، ستتوفر لديك 20 دقيقة لطباعة الوثيقة.'
              : 'Après autorisation, vous disposerez de 20 minutes pour imprimer le document.'}
          />
        )}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: 500 }}>
            {isAr ? t('autorisation.motifLabel') : 'Motif de la demande'}{' '}
            <span style={{ color: '#ff4d4f' }}>*</span>
          </label>
        </div>
        <Input.TextArea
          rows={4}
          placeholder={isAr ? t('autorisation.motifPlaceholder') : 'Expliquez la raison de votre demande...'}
          value={demandeMotif}
          onChange={e => setDemandeMotif(e.target.value)}
          showCount
          maxLength={500}
        />
      </Modal>

    </div>
  );
};

export default DetailRA;
