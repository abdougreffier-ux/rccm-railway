import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Typography, Upload,
  Table, message, Spin, Tooltip, Popconfirm, Select, Alert,
  Modal, Form, Input, InputNumber, DatePicker, Row, Col,
  Tabs, Timeline,
} from 'antd';
import {
  FilePdfOutlined, PrinterOutlined, UploadOutlined, DeleteOutlined,
  DownloadOutlined, FileOutlined, ArrowLeftOutlined, CheckCircleOutlined,
  SendOutlined, EditOutlined, StopOutlined, PlusOutlined, CloseCircleOutlined,
  BankOutlined, ShopOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rbeAPI, documentAPI, rapportAPI, parametrageAPI, openPDF } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { getCiviliteOptions, formatCivilite } from '../../utils/civilite';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

// Helpers décimaux bilingues (FR virgule ↔ interne point)
const pctFormatter = v =>
  (v !== undefined && v !== null && v !== '') ? String(v).replace('.', ',') : '';
const pctParser = v => {
  if (!v) return undefined;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_ATTENTE:  'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  MODIFIE:     'cyan',
  RADIE:       'error',
};

const HISTORY_COLOR = {
  CREATION:   'blue',
  ENVOI:      'purple',
  RETOUR:     'orange',
  VALIDATION: 'green',
  RADIATION:  'red',
  MODIFICATION: 'cyan',
};

// Nature de contrôle selon le type d'entité
const NATURE_CONTROLE_ALL = [
  { value: 'DETENTION_DIRECTE',      label: 'Détention directe (≥ 20 % des parts / droits de vote)',       types: ['SOCIETE','SUCCURSALE'] },
  { value: 'DETENTION_INDIRECTE',    label: 'Détention indirecte',                                          types: ['SOCIETE','SUCCURSALE'] },
  { value: 'CONTROLE',               label: 'Contrôle (autre mécanisme)',                                   types: ['SOCIETE','SUCCURSALE'] },
  { value: 'DIRIGEANT_PAR_DEFAUT',   label: 'Dirigeant par défaut (aucun autre BE identifié)',              types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
  { value: 'BENEFICIAIRE_BIENS',     label: 'Bénéficiaire des biens (≥ 20 %)',                              types: ['ASSOCIATION','ONG'] },
  { value: 'GROUPE_BENEFICIAIRE',    label: 'Appartenance à un groupe de bénéficiaires',                    types: ['ASSOCIATION','ONG'] },
  { value: 'CONTROLEUR_ASSO',        label: "Contrôleur de l'association",                                  types: ['ASSOCIATION','ONG'] },
  { value: 'BENEFICIAIRE_ACTUEL',    label: 'Bénéficiaire actuel de la fiducie',                            types: ['FIDUCIE'] },
  { value: 'BENEFICIAIRE_CATEGORIE', label: 'Appartenance à une catégorie de bénéficiaires',                types: ['FIDUCIE'] },
  { value: 'CONTROLEUR_FINAL',       label: 'Contrôleur final de la fiducie',                               types: ['FIDUCIE'] },
  { value: 'CONTROLE_DERNIER_RESSORT', label: 'Contrôle en dernier ressort (fondation)',                    types: ['FONDATION'] },
  { value: 'REPRESENTANT_LEGAL',     label: 'Représentant légal',                                           types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
  { value: 'AUTRE',                  label: 'Autre',                                                        types: ['SOCIETE','SUCCURSALE','ASSOCIATION','ONG','FONDATION','FIDUCIE'] },
];

const getNatureControleOptions = (typeEntite) => {
  if (!typeEntite) return NATURE_CONTROLE_ALL;
  return NATURE_CONTROLE_ALL.filter(o => o.types.includes(typeEntite));
};

const TYPE_DOC_OPTIONS = [
  { value: 'NNI',       label: 'NNI' },
  { value: 'PASSEPORT', label: 'Passeport' },
  { value: 'AUTRE',     label: 'Autre' },
];

const DetailRBE = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { t, isAr, field } = useLanguage();
  const { user }     = useAuth();
  const queryClient  = useQueryClient();

  const [retourModalOpen, setRetourModalOpen] = useState(false);
  const [benModalOpen,    setBenModalOpen]    = useState(false);
  const [editingBen,      setEditingBen]      = useState(null);
  const [typeDocId,       setTypeDocId]       = useState(null);
  const [uploading,       setUploading]       = useState(false);
  const [retourForm]  = Form.useForm();
  const [benForm]     = Form.useForm();

  // ── Données RBE ──────────────────────────────────────────────────────────────
  const { data: rbe, isLoading } = useQuery({
    queryKey: ['rbe-detail', id],
    queryFn:  () => rbeAPI.get(id).then(r => r.data),
  });

  // ── Types de document ────────────────────────────────────────────────────────
  const { data: typesDocData } = useQuery({
    queryKey: ['types-doc'],
    queryFn:  () => parametrageAPI.typesDocuments().then(r => r.data),
  });
  const typesDocs = typesDocData?.results ?? typesDocData ?? [];

  // ── Nationalités ─────────────────────────────────────────────────────────────
  const { data: nationalitesData } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
  });
  const nationalites = nationalitesData || [];

  // ── Workflow mutations ───────────────────────────────────────────────────────
  const envoyerMut = useMutation({
    mutationFn: () => rbeAPI.envoyer(id),
    onSuccess: () => {
      message.success(t('msg.dossiereEnvoye'));
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rbe'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const validerMut = useMutation({
    mutationFn: (data) => rbeAPI.valider(id, data),
    onSuccess: () => {
      message.success(t('msg.saved'));
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rbe'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const retournerMut = useMutation({
    mutationFn: (data) => rbeAPI.retourner(id, data),
    onSuccess: () => {
      message.success(t('msg.dossierRetourne'));
      setRetourModalOpen(false);
      retourForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rbe'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Bénéficiaires mutations ──────────────────────────────────────────────────
  const addBenMut = useMutation({
    mutationFn: (data) => rbeAPI.addBeneficiaire(id, data),
    onSuccess: () => {
      message.success(t('msg.saved'));
      setBenModalOpen(false);
      benForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const updateBenMut = useMutation({
    mutationFn: ({ bid, data }) => rbeAPI.updateBeneficiaire(id, bid, data),
    onSuccess: () => {
      message.success(t('msg.saved'));
      setBenModalOpen(false);
      benForm.resetFields();
      setEditingBen(null);
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const deleteBenMut = useMutation({
    mutationFn: (bid) => rbeAPI.deleteBeneficiaire(id, bid),
    onSuccess: () => {
      message.success(t('msg.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
    },
    onError: () => message.error(t('msg.error')),
  });

  // ── Document mutations ───────────────────────────────────────────────────────
  const deleteDocMut = useMutation({
    mutationFn: (docId) => documentAPI.delete(docId),
    onSuccess: () => {
      message.success(t('msg.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
    },
    onError: () => message.error(t('msg.error')),
  });

  const handleUpload = async (file) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('fichier', file);
    formData.append('rbe', id);
    if (typeDocId) formData.append('type_doc', typeDocId);
    try {
      await documentAPI.upload(formData);
      message.success(t('msg.uploadSuccess'));
      queryClient.invalidateQueries({ queryKey: ['rbe-detail', id] });
    } catch {
      message.error(t('msg.uploadError'));
    }
    setUploading(false);
    return false;
  };

  // ── Ouvrir modal bénéficiaire ────────────────────────────────────────────────
  const openAddBen = () => {
    setEditingBen(null);
    benForm.resetFields();
    setBenModalOpen(true);
  };

  const openEditBen = (ben) => {
    setEditingBen(ben);
    benForm.setFieldsValue({
      ...ben,
      date_naissance:   ben.date_naissance   ? dayjs(ben.date_naissance)   : null,
      date_prise_effet: ben.date_prise_effet  ? dayjs(ben.date_prise_effet) : null,
    });
    setBenModalOpen(true);
  };

  const handleBenOk = () => {
    benForm.validateFields().then(vals => {
      const payload = {
        ...vals,
        date_naissance:   vals.date_naissance   ? dayjs(vals.date_naissance).format('YYYY-MM-DD')   : null,
        date_prise_effet: vals.date_prise_effet  ? dayjs(vals.date_prise_effet).format('YYYY-MM-DD') : null,
      };
      if (editingBen) {
        updateBenMut.mutate({ bid: editingBen.id, data: payload });
      } else {
        addBenMut.mutate(payload);
      }
    });
  };

  // ── Colonnes bénéficiaires ───────────────────────────────────────────────────
  const benColumns = [
    {
      title: t('field.nom') + ' / ' + t('field.prenom'),
      key: 'nom_prenom',
      render: (_, r) => {
        const civ = formatCivilite(r.civilite, isAr ? 'ar' : 'fr');
        return <span><strong>{[civ, r.prenom, r.nom].filter(Boolean).join(' ')}</strong></span>;
      },
    },
    {
      title: t('field.nationalite'),
      dataIndex: isAr ? 'nationalite_lib_ar' : 'nationalite_lib',
      key: 'nat',
      width: 140,
    },
    {
      title: t('rbe.natureControle'),
      dataIndex: 'nature_controle_display',
      key: 'nature',
      ellipsis: true,
    },
    {
      title: t('rbe.pourcentage'),
      dataIndex: 'pourcentage_detention',
      key: 'pct',
      width: 110,
      render: v => v ? `${v}%` : '—',
    },
    {
      title: t('rbe.datePriseEffet'),
      dataIndex: 'date_prise_effet',
      key: 'date_effet',
      width: 120,
    },
    {
      title: t('field.actions'),
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, ben) => (
        <Space>
          <Tooltip title={t('action.edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditBen(ben)} />
          </Tooltip>
          <Popconfirm
            title={t('modal.confirmDelete')}
            onConfirm={() => deleteBenMut.mutate(ben.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── Colonnes documents ───────────────────────────────────────────────────────
  const docColumns = [
    {
      title: t('doc.nom'),
      dataIndex: 'nom_fichier',
      key: 'nom',
      render: v => (
        <Space>
          <FileOutlined style={{ color: '#1a4480' }} />
          <span>{v}</span>
        </Space>
      ),
    },
    { title: t('doc.type'),   dataIndex: isAr ? 'type_doc_libelle_ar' : 'type_doc_libelle', key: 'type', width: 160 },
    { title: t('doc.taille'), dataIndex: 'taille_ko',  key: 'taille', width: 90, render: v => v ? `${v} Ko` : '—' },
    { title: t('doc.date'),   dataIndex: 'date_scan',  key: 'date',   width: 110 },
    {
      title: t('field.actions'),
      key: 'actions',
      width: 100,
      fixed: 'right',
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

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!rbe) return null;

  const isGrefOuAdmin = user?.role === 'GREFFIER' || user?.role === 'ADMIN';
  const docs           = rbe.documents     || [];
  const beneficiaires  = rbe.beneficiaires || [];
  const historique     = rbe.historique    || [];

  const STATUT_LABELS = {
    BROUILLON:   t('status.brouillon'),
    EN_ATTENTE:  t('status.enAttente'),
    RETOURNE:    t('status.retourne'),
    VALIDE:      t('status.valide'),
    MODIFIE:     t('status.modifie'),
    RADIE:       t('status.radie'),
  };

  // ── Onglet 1 : Informations ──────────────────────────────────────────────────
  const tabInfos = (
    <>
      {rbe.statut === 'RETOURNE' && rbe.observations_greffier && (
        <Alert
          type="warning"
          showIcon
          icon={<CloseCircleOutlined />}
          style={{ marginBottom: 16 }}
          message={t('alert.dossierRetourne')}
          description={rbe.observations_greffier}
        />
      )}
      <Card title={t('rbe.detail')} style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label={t('rbe.numero')} span={1}>
            <strong>{rbe.numero_rbe}</strong>
          </Descriptions.Item>
          <Descriptions.Item label={t('field.statut')} span={1}>
            <Tag color={STATUT_COLOR[rbe.statut]}>{STATUT_LABELS[rbe.statut] || rbe.statut}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'المصدر' : 'Source'} span={1}>
            {rbe.source_entite === 'RC'
              ? <Tag color="blue" icon={<BankOutlined />}>Registre du Commerce</Tag>
              : rbe.source_entite === 'HORS_RC'
              ? <Tag color="purple" icon={<ShopOutlined />}>Hors Registre du Commerce</Tag>
              : '—'
            }
          </Descriptions.Item>
          <Descriptions.Item label={t('rbe.typeEntite') || 'Type entité'} span={1}>
            {rbe.type_entite_display || rbe.type_entite}
          </Descriptions.Item>
          <Descriptions.Item label={t('rbe.typeDeclaration') || 'Type déclaration'} span={1}>
            {rbe.type_declaration_display || rbe.type_declaration}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'نمط الإقرار' : 'Mode déclaration'} span={1}>
            {rbe.mode_declaration_display
              ? <Tag color={rbe.mode_declaration === 'IMMEDIATE' ? 'success' : 'warning'}>
                  {rbe.mode_declaration_display}
                </Tag>
              : '—'
            }
          </Descriptions.Item>
          {rbe.date_limite && (
            <Descriptions.Item label={isAr ? 'الأجل' : 'Date limite'} span={1}>
              <span style={{ color: rbe.date_limite < new Date().toISOString().slice(0,10) ? '#cf1322' : undefined }}>
                {rbe.date_limite}
              </span>
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('rbe.denomination') || 'Dénomination'} span={2}>
            <strong>{rbe.denomination_entite || rbe.denomination || '—'}</strong>
            {rbe.denomination_entite_ar && (
              <span className="rtl" style={{ display: 'block', color: '#555' }}>
                {rbe.denomination_entite_ar}
              </span>
            )}
          </Descriptions.Item>
          {rbe.ra_numero && (
            <Descriptions.Item label={t('rbe.raLie') || 'Registre analytique'} span={1}>
              <Button type="link" size="small" style={{ padding: 0 }}
                onClick={() => rbe.ra && navigate(`/registres/analytique/${rbe.ra}`)}>
                {rbe.ra_numero}
              </Button>
            </Descriptions.Item>
          )}
          {rbe.entite_data && (
            <Descriptions.Item label={isAr ? 'بيانات الكيان' : 'Entité juridique'} span={2}>
              <Space wrap>
                <span><strong>{rbe.entite_data.denomination_display}</strong></span>
                {rbe.entite_data.autorite_display && (
                  <Tag color="geekblue">{rbe.entite_data.autorite_display}</Tag>
                )}
                {rbe.entite_data.numero_enregistrement && (
                  <span style={{ color: '#666' }}>N° {rbe.entite_data.numero_enregistrement}</span>
                )}
                {rbe.entite_data.pays && rbe.entite_data.pays !== 'Mauritanie' && (
                  <Tag>{rbe.entite_data.pays}</Tag>
                )}
              </Space>
            </Descriptions.Item>
          )}
          {rbe.localite_libelle && (
            <Descriptions.Item label={t('field.greffe')} span={1}>
              {rbe.localite_libelle}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('field.date')} span={1}>
            {rbe.date_declaration}
          </Descriptions.Item>
          {rbe.demandeur && (
            <Descriptions.Item label={isAr ? 'مُقدِّم الطلب' : 'Demandeur'} span={1}>
              {rbe.demandeur}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('field.creePar')} span={1}>
            {rbe.created_by_nom || '—'}
          </Descriptions.Item>
          {rbe.validated_at && (
            <>
              <Descriptions.Item label={t('field.validePar')} span={1}>
                {rbe.validated_by_nom || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Date validation" span={1}>
                {rbe.validated_at?.split('T')[0]}
              </Descriptions.Item>
            </>
          )}
          {rbe.motif && (
            <Descriptions.Item label={t('rbe.motif')} span={2}>
              {rbe.motif}
            </Descriptions.Item>
          )}
          {rbe.observations && (
            <Descriptions.Item label={t('field.observations')} span={2}>
              {rbe.observations}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t('rbe.declarant')} size="small">
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label={t('rbe.declarant_nom')} span={1}>
            {[formatCivilite(rbe.declarant_civilite, isAr ? 'ar' : 'fr'), rbe.declarant_nom, rbe.declarant_prenom].filter(Boolean).join(' ')}
          </Descriptions.Item>
          <Descriptions.Item label={t('rbe.declarant_qualite')} span={1}>
            {rbe.declarant_qualite || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('field.adresse')} span={1}>
            {rbe.declarant_adresse || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('field.telephone')} span={1}>
            {rbe.declarant_telephone || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('field.email')} span={1}>
            {rbe.declarant_email || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );

  // ── Onglet 2 : Bénéficiaires ─────────────────────────────────────────────────
  const tabBeneficiaires = (
    <Card
      title={
        <Space>
          {t('rbe.beneficiaires')}
          <Tag>{beneficiaires.length}</Tag>
        </Space>
      }
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={openAddBen}
          style={{ background: '#1a4480' }}>
          {t('rbe.addBeneficiaire')}
        </Button>
      }
    >
      <Table
        dataSource={beneficiaires}
        columns={benColumns}
        rowKey="id"
        size="small"
        scroll={{ x: 800 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: t('rbe.aucunBeneficiaire') }}
      />
    </Card>
  );

  // ── Onglet 3 : Pièces jointes ────────────────────────────────────────────────
  const tabDocuments = (
    <Card
      title={
        <Space>
          <FileOutlined />
          {t('section.piecesJointes')}
          <Tag>{docs.length}</Tag>
        </Space>
      }
    >
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
          <Button icon={<UploadOutlined />} loading={uploading}>
            {t('doc.ajouter')}
          </Button>
        </Upload>
      </Space>
      <Table
        dataSource={docs}
        columns={docColumns}
        rowKey="id"
        size="small"
        scroll={{ x: 700 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: t('doc.aucun') }}
      />
    </Card>
  );

  // ── Onglet 4 : Historique ────────────────────────────────────────────────────
  const tabHistorique = (
    <Card title={t('tab.historique')}>
      {historique.length === 0 ? (
        <Text type="secondary">{t('msg.aucuneAction')}</Text>
      ) : (
        <Timeline
          items={historique.map(h => ({
            color: HISTORY_COLOR[h.action] || 'gray',
            children: (
              <div>
                <Text strong>{h.action_display || h.action}</Text>
                {' — '}
                <Text type="secondary">{h.created_at?.split('T')[0]}</Text>
                {h.created_by_nom && (
                  <Text type="secondary"> par {h.created_by_nom}</Text>
                )}
                {h.observations && (
                  <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
                    {h.observations}
                  </div>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Card>
  );

  const tabItems = [
    { key: 'infos',        label: t('tab.informations'),    children: tabInfos },
    { key: 'beneficiaires',label: t('rbe.beneficiaires'),   children: tabBeneficiaires },
    { key: 'documents',    label: t('tab.documents'),       children: tabDocuments },
    { key: 'historique',   label: t('tab.historique'),      children: tabHistorique },
  ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          📋 {t('rbe.detail')} — <strong>{rbe.numero_rbe}</strong>
        </Title>
        <Space wrap>
          {/* Envoyer au greffe */}
          {(rbe.statut === 'BROUILLON' || rbe.statut === 'RETOURNE') && (
            <Popconfirm
              title={t('confirm.envoyerDossier')}
              onConfirm={() => envoyerMut.mutate()}
              okText={t('common.yes')} cancelText={t('common.no')}
            >
              <Button icon={<SendOutlined />} loading={envoyerMut.isPending}
                style={{ background: '#1a4480', color: '#fff', borderColor: '#1a4480' }}>
                {t('rbe.envoyer')}
              </Button>
            </Popconfirm>
          )}

          {/* Valider (greffe/admin) */}
          {rbe.statut === 'EN_ATTENTE' && isGrefOuAdmin && (
            <Popconfirm
              title="Valider cette déclaration RBE ?"
              onConfirm={() => validerMut.mutate({})}
              okText={t('common.yes')} cancelText={t('common.no')}
            >
              <Button type="primary" icon={<CheckCircleOutlined />}
                loading={validerMut.isPending}
                style={{ background: '#2e7d32', borderColor: '#2e7d32' }}>
                {t('common.validate')}
              </Button>
            </Popconfirm>
          )}

          {/* Retourner (greffe/admin) */}
          {rbe.statut === 'EN_ATTENTE' && isGrefOuAdmin && (
            <Button icon={<ArrowLeftOutlined />}
              onClick={() => setRetourModalOpen(true)}>
              {t('rbe.retourner')}
            </Button>
          )}

          {/* Modifier */}
          {(rbe.statut === 'VALIDE' || rbe.statut === 'MODIFIE') && (
            <Button icon={<EditOutlined />}
              onClick={() => navigate(`/registres/rbe/${id}/modifier`)}>
              {t('rbe.modifier')}
            </Button>
          )}

          {/* Radier */}
          {(rbe.statut === 'VALIDE' || rbe.statut === 'MODIFIE') && (
            <Button danger icon={<StopOutlined />}
              onClick={() => navigate(`/registres/rbe/${id}/radier`)}>
              {t('rbe.radier')}
            </Button>
          )}

          {/* PDF Attestation */}
          <Button icon={<FilePdfOutlined />}
            onClick={() => openPDF(rapportAPI.attestationRBE(id, isAr ? 'ar' : 'fr'))}>
            {t('rbe.attestation')}
          </Button>

          {/* PDF Extrait */}
          <Button icon={<PrinterOutlined />}
            onClick={() => openPDF(rapportAPI.extraitRBE(id, isAr ? 'ar' : 'fr'))}>
            {t('rbe.extrait')}
          </Button>

          <Button onClick={() => navigate('/registres/rbe')}>
            {t('common.back')}
          </Button>
        </Space>
      </div>

      {/* ── Onglets ───────────────────────────────────────────────────────────── */}
      <Tabs items={tabItems} />

      {/* ── Modal Retourner ───────────────────────────────────────────────────── */}
      <Modal
        title={t('modal.retourTitle')}
        open={retourModalOpen}
        onOk={() => retourForm.validateFields().then(vals => retournerMut.mutate(vals))}
        onCancel={() => { setRetourModalOpen(false); retourForm.resetFields(); }}
        okText={t('action.retourner')}
        cancelText={t('common.cancel')}
        confirmLoading={retournerMut.isPending}
      >
        <p style={{ color: '#888', marginBottom: 12 }}>{t('modal.retourDesc')}</p>
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations_greffier"
            label={t('common.observations')}
            rules={[{ required: true, message: 'Les observations sont requises' }]}
          >
            <TextArea rows={4} placeholder={t('placeholder.observations')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Bénéficiaire ────────────────────────────────────────────────── */}
      <Modal
        title={editingBen ? t('action.edit') + ' — ' + t('rbe.beneficiaires') : t('rbe.addBeneficiaire')}
        open={benModalOpen}
        onOk={handleBenOk}
        onCancel={() => { setBenModalOpen(false); benForm.resetFields(); setEditingBen(null); }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={addBenMut.isPending || updateBenMut.isPending}
        width={760}
        destroyOnClose
      >
        <Form form={benForm} layout="vertical" style={{ marginTop: 12 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="civilite" label={t('field.civilite')} rules={[{ required: true, message: isAr ? 'اللقب الشرفي مطلوب' : 'Civilité requise' }]}>
                <Select placeholder="—" options={getCiviliteOptions(isAr ? 'ar' : 'fr')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nom" label={t('field.nomFr')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="prenom" label={t('field.prenom')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nom_ar" label={t('field.nomAr')}>
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="prenom_ar" label={t('field.prenom') + ' (AR)'}>
                <Input dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_naissance" label={t('field.dateNaissance')}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lieu_naissance" label={t('field.lieuNaissance')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nationalite" label={t('field.nationalite')}>
                <Select showSearch
                  options={nationalites.map(n => ({ value: n.id, label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type_document" label="Type document">
                <Select options={TYPE_DOC_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="numero_document" label="N° document" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telephone" label={t('field.telephone')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="adresse" label={t('field.adresse')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label={t('field.email')}>
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nature_controle" label={t('rbe.natureControle')} rules={[{ required: true }]}>
                <Select options={getNatureControleOptions(rbe?.type_entite)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pourcentage_detention" label={t('rbe.pourcentage')}>
                <InputNumber
                  min={0} max={100} step={0.01} precision={2}
                  style={{ width: '100%' }} addonAfter="%"
                  formatter={pctFormatter}
                  parser={pctParser}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_prise_effet" label={t('rbe.datePriseEffet')}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default DetailRBE;
