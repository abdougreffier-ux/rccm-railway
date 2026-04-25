import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Typography, Upload,
  Table, message, Spin, Divider, Tooltip, Popconfirm, Select, Alert, Input,
  Modal, Form, Badge,
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FilePdfOutlined, PrinterOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined,
  FileOutlined, LinkOutlined, EditOutlined, SendOutlined, WarningOutlined,
  RollbackOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { registreAPI, documentAPI, rapportAPI, parametrageAPI, autorisationAPI, openPDF } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title } = Typography;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_INSTANCE: 'warning',
  RETOURNE:    'orange',
  VALIDE:      'success',
  REJETE:      'error',
  ANNULE:      'default',
};

const TYPE_ACTE_LABELS = {
  IMMATRICULATION: 'Immatriculation',
  CONSTITUTION:    'Constitution',
  MODIFICATION:    'Modification',
  RADIATION:       'Radiation',
  DEPOT:           'Dépôt de document',
};

// Clés i18n — résolues par t() dans le rendu
const DESCRIPTION_LABELS = {
  denomination_commerciale: 'rc.desc.denomCommerciale',
  activite:                 'field.activite',
  origine_fonds:            'field.origineFonds',
  identite_declarant:       'rc.desc.identiteDeclarant',
  objet_social:             'field.objetSocial',
  gerant_lui_meme:          'rc.desc.gerantLuiMeme',
};

const RA_STATUT_COLOR = {
  BROUILLON:              'default',
  EN_INSTANCE_VALIDATION: 'processing',
  RETOURNE:               'warning',
  IMMATRICULE:            'success',
  RADIE:                  'error',
};

const DetailRChrono = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { t, isAr } = useLanguage();
  const queryClient  = useQueryClient();
  const { hasRole }  = useAuth();
  const isGreffier   = hasRole('GREFFIER');
  const isAgentGU    = hasRole('AGENT_GU');
  const [uploading,  setUploading]  = useState(false);
  const [typeDocId,  setTypeDocId]  = useState(null);
  const [retourModal, setRetourModal] = useState(false);
  const [retourForm]                  = Form.useForm();
  // ── Modal décision autorisation (greffier) ────────────────────────────────
  const [authModal,    setAuthModal]    = useState(false);
  const [authAction,   setAuthAction]   = useState(null);  // { type: 'autoriser'|'refuser', demande }
  const [authMotif,    setAuthMotif]    = useState('');


  // ── Données RC ──────────────────────────────────────────────────────────────
  const { data: rc, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rchrono-detail', id],
    queryFn:  () => registreAPI.getChrono(id).then(r => r.data),
  });

  // ── Types de document ───────────────────────────────────────────────────────
  const { data: typesDocData } = useQuery({
    queryKey: ['types-doc'],
    queryFn:  () => parametrageAPI.typesDocuments().then(r => r.data),
  });
  const typesDocs = typesDocData?.results ?? typesDocData ?? [];

  // ── Demandes d'autorisation en attente pour ce RA (greffier uniquement) ──────
  const { data: pendingAuths = [], refetch: refetchAuths } = useQuery({
    queryKey: ['autorisation-pending-rc', rc?.ra],
    queryFn:  () =>
      autorisationAPI.list({ type_dossier: 'RA', dossier_id: rc.ra, statut: 'EN_ATTENTE' })
        .then(r => r.data),
    enabled:  isGreffier && !!rc?.ra,
    refetchInterval: 30_000,
  });

  // ── Mutations autoriser / refuser (greffier) ─────────────────────────────────
  const autoriserAuthMut = useMutation({
    mutationFn: ({ id, motif }) => autorisationAPI.autoriser(id, { motif_decision: motif }),
    onSuccess: () => {
      message.success('Autorisation accordée.');
      setAuthModal(false); setAuthMotif('');
      refetchAuths();
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rchrono'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur.'),
  });
  const refuserAuthMut = useMutation({
    mutationFn: ({ id, motif }) => autorisationAPI.refuser(id, { motif_decision: motif }),
    onSuccess: () => {
      message.success('Demande refusée.');
      setAuthModal(false); setAuthMotif('');
      refetchAuths();
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  const openAuthModal = (type, demande) => {
    setAuthAction({ type, demande });
    setAuthMotif('');
    setAuthModal(true);
  };
  const confirmAuthDecision = () => {
    const args = { id: authAction.demande.id, motif: authMotif };
    if (authAction.type === 'autoriser') autoriserAuthMut.mutate(args);
    else                                 refuserAuthMut.mutate(args);
  };

  // ── Envoyer au greffier ───────────────────────────────────────────────────────
  const envoyerMut = useMutation({
    mutationFn: () => registreAPI.envoyerChrono(id),
    onSuccess: () => {
      message.success('Dossier envoyé au greffier.');
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rchrono'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Retourner pour rectification (greffier, EN_INSTANCE) ────────────────────
  const retournerMut = useMutation({
    mutationFn: (vals) => registreAPI.retournerChrono(id, { observations: vals.observations }),
    onSuccess: () => {
      message.warning('Dossier retourné à l\'agent pour rectification.');
      setRetourModal(false);
      retourForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['rchrono'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Suppression document ─────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (docId) => documentAPI.delete(docId),
    onSuccess: () => {
      message.success(t('msg.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      if (rc?.ra) queryClient.invalidateQueries({ queryKey: ['ra', String(rc.ra)] });
    },
    onError: () => message.error(t('msg.error')),
  });

  // ── Upload pièce jointe ──────────────────────────────────────────────────────
  const handleUpload = async (file) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('fichier', file);
    formData.append('chrono', id);
    if (rc?.ra) formData.append('ra', rc.ra);
    if (typeDocId) formData.append('type_doc', typeDocId);
    try {
      await documentAPI.upload(formData);
      message.success(t('msg.uploadSuccess'));
      queryClient.invalidateQueries({ queryKey: ['rchrono-detail', id] });
      if (rc?.ra) queryClient.invalidateQueries({ queryKey: ['ra', String(rc.ra)] });
    } catch {
      message.error(t('msg.uploadError'));
    }
    setUploading(false);
    return false;
  };

  // ── Colonnes tableau documents ────────────────────────────────────────────────
  const docColumns = [
    {
      title: t('doc.nom'),
      dataIndex: 'nom_fichier',
      key: 'nom',
      render: (v) => (
        <Space>
          <FileOutlined style={{ color: '#1a4480' }} />
          <span>{v}</span>
        </Space>
      ),
    },
    { title: t('doc.type'),   dataIndex: isAr ? 'type_doc_libelle_ar' : 'type_doc_libelle', key: 'type', width: 160 },
    { title: t('doc.taille'), dataIndex: 'taille_ko', key: 'taille', width: 90,
      render: v => v ? `${v} Ko` : '—' },
    { title: t('doc.date'),   dataIndex: 'date_scan',  key: 'date',  width: 110 },
    {
      title: t('field.actions'), key: 'actions', width: 100, fixed: 'right',
      render: (_, doc) => (
        <Space>
          <Tooltip title={t('common.download')}>
            <Button size="small" icon={<DownloadOutlined />}
              onClick={() => openPDF(documentAPI.download(doc.id))} />
          </Tooltip>
          {canEditDocs && (
            <Popconfirm
              title={t('modal.confirmDelete')}
              onConfirm={() => deleteMut.mutate(doc.id)}
              okText={t('common.yes')} cancelText={t('common.no')}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!rc)       return <AccessDenied onRetry={refetch} style="inline" />;

  let descParsed = {};
  try { descParsed = typeof rc.description_parsed === 'object' ? rc.description_parsed : JSON.parse(rc.description || '{}'); } catch {}

  const STATUT_LABELS = {
    BROUILLON:   t('status.brouillon'),
    EN_INSTANCE: t('status.enInstance2'),
    RETOURNE:    t('status.retourne'),
    VALIDE:      t('status.valide'),
    REJETE:      t('status.rejete'),
    ANNULE:      t('status.annule'),
  };

  const docs = rc.documents || [];
  // Rectifier / Modifier : visible uniquement en BROUILLON ou RETOURNE, tous rôles confondus.
  // EN_INSTANCE → bouton masqué (dossier transmis, toute modification passe par le Registre Analytique).
  // VALIDE / REJETE / ANNULE → bouton absent.
  const peutModifier  = rc.statut === 'BROUILLON' || rc.statut === 'RETOURNE';
  // Tout utilisateur (agent et greffier) peut transmettre un BROUILLON/RETOURNE
  const peutEnvoyer   = rc.statut === 'BROUILLON' || rc.statut === 'RETOURNE';
  // Pièces jointes modifiables : greffier toujours, agent uniquement en BROUILLON/RETOURNE
  const canEditDocs   = !isAgentGU || peutModifier;

  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          📋 {t('rc.detail')} — <strong>{fmtChrono(rc.numero_chrono)}</strong>
        </Title>
        <Space wrap>
          {/* ── Actions AGENT uniquement — BROUILLON / RETOURNE ─────────────
              Le greffier ne modifie pas et n'envoie pas un brouillon d'agent. */}
          {!isGreffier && peutModifier && (
            <Button icon={<EditOutlined />}
              danger={rc.statut === 'RETOURNE'}
              onClick={() => navigate(`/registres/chronologique/${id}/rectifier`)}>
              {rc.statut === 'RETOURNE' ? t('action.rectifierRetourne') : t('action.rectifier')}
            </Button>
          )}

          {!isGreffier && peutEnvoyer && (
            <Button type="primary" icon={<SendOutlined />}
              loading={envoyerMut.isPending}
              onClick={() => envoyerMut.mutate()}
              style={{ background: '#1a4480', borderColor: '#1a4480' }}>
              {t('action.envoyerGreffier')}
            </Button>
          )}

          {/* ── Actions GREFFIER uniquement — EN_INSTANCE ─────────────────── */}
          {isGreffier && rc.statut === 'EN_INSTANCE' && (
            <Button icon={<RollbackOutlined />}
              onClick={() => setRetourModal(true)}
              style={{ borderColor: '#d97706', color: '#d97706' }}>
              {isAr ? 'إعادة للتصحيح' : 'Retourner pour rectification'}
            </Button>
          )}

          {/* Imprimer avant soumission — agents uniquement, BROUILLON/RETOURNE */}
          {!isGreffier && peutModifier && (
            <Button icon={<PrinterOutlined />}
              onClick={() => openPDF(rapportAPI.certificatChronologique(id))}>
              {t('rc.imprimerExtrait')}
            </Button>
          )}

          {/* Certificat officiel — greffier et Agent Tribunal, après transmission */}
          {!isAgentGU && !peutModifier && (
            <Button icon={<FilePdfOutlined />}
              onClick={() => openPDF(rapportAPI.certificatChronologique(id))}>
              {t('rc.certificat')}
            </Button>
          )}
          <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
        </Space>
      </div>

      {/* ── Alerte : dossier retourné ────────────────────────────────────────── */}
      {rc.statut === 'RETOURNE' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Dossier retourné pour correction"
          description={
            rc.observations
              ? `Observations : ${rc.observations}`
              : 'Ce dossier a été retourné par le greffier. Veuillez rectifier les informations puis le renvoyer.'
          }
        />
      )}

      {/* ── Panel greffier : demandes d'autorisation en attente pour ce RA ──── */}
      {isGreffier && pendingAuths.length > 0 && (
        <Card
          style={{ marginBottom: 16, borderColor: '#722ed1', borderWidth: 2 }}
          bodyStyle={{ padding: '12px 16px' }}
          title={
            <Space>
              <SafetyCertificateOutlined style={{ color: '#722ed1' }} />
              <span style={{ color: '#722ed1', fontWeight: 600 }}>
                {isAr ? 'طلبات التفويض المعلقة' : 'Demandes d\'autorisation en attente'}
              </span>
              <Badge count={pendingAuths.length} style={{ background: '#722ed1' }} />
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {pendingAuths.map(dem => (
              <div key={dem.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: '#f9f0ff', borderRadius: 6,
                border: '1px solid #d3adf7',
              }}>
                <Space wrap>
                  <Tag color={dem.type_demande === 'IMPRESSION' ? 'blue' : 'purple'} icon={
                    dem.type_demande === 'IMPRESSION' ? <PrinterOutlined /> : <EditOutlined />
                  }>
                    {dem.type_demande === 'IMPRESSION'
                      ? (isAr ? 'طباعة' : 'Impression')
                      : (isAr ? 'تصحيح' : 'Correction')}
                  </Tag>
                  <span style={{ fontSize: 13 }}>
                    <strong>{dem.demandeur_nom}</strong>
                    {dem.motif && <> — <em style={{ color: '#555' }}>{dem.motif}</em></>}
                  </span>
                </Space>
                <Space>
                  <Button
                    size="small" type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ background: '#389e0d', borderColor: '#389e0d' }}
                    onClick={() => openAuthModal('autoriser', dem)}
                  >
                    {isAr ? 'موافقة' : 'Autoriser'}
                  </Button>
                  <Button
                    size="small" danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => openAuthModal('refuser', dem)}
                  >
                    {isAr ? 'رفض' : 'Refuser'}
                  </Button>
                </Space>
              </div>
            ))}
          </Space>
        </Card>
      )}

      {/* ── Alerte : rectification post-immat demandée par le greffier ──────── */}
      {rc.statut === 'VALIDE' && rc.modifications_retournees?.length > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`Rectification demandée par le greffier — ${rc.modifications_retournees[0].numero_modif}`}
          description={
            <div>
              <p style={{ marginBottom: 8 }}>
                {rc.modifications_retournees[0].observations
                  || 'Le greffier demande une correction de ce dossier immatriculé. Veuillez renseigner les nouvelles informations.'}
              </p>
              <Button
                type="primary" danger size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/modifications/${rc.modifications_retournees[0].id}/modifier`)}
              >
                Traiter la rectification
              </Button>
            </div>
          }
        />
      )}

      {/* ── Informations RC ─────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label={t('rc.numero')} span={1}>
            <strong>{fmtChrono(rc.numero_chrono)}</strong>
          </Descriptions.Item>
          <Descriptions.Item label={t('field.statut')} span={1}>
            <Tag color={STATUT_COLOR[rc.statut]}>{STATUT_LABELS[rc.statut] || rc.statut}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('rc.date_acte')} span={1}>{rc.date_acte || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('rc.type_acte')} span={1}>
            {TYPE_ACTE_LABELS[rc.type_acte] || rc.type_acte}
          </Descriptions.Item>
          <Descriptions.Item label={t('field.denomination')} span={2}>
            <strong>{rc.denomination || '—'}</strong>
            {rc.denomination_ar && (
              <span className="rtl" style={{ display: 'block', color: '#555' }}>{rc.denomination_ar}</span>
            )}
          </Descriptions.Item>
          {rc.observations && (
            <Descriptions.Item label={t('field.observations')} span={2}>{rc.observations}</Descriptions.Item>
          )}
        </Descriptions>

        {/* ── Données complémentaires ────────────────────────────────────────── */}
        {Object.values(descParsed).some(v => v !== '' && v !== false && v != null) && (
          <>
            <Divider orientation={isAr ? 'right' : 'left'} style={{ fontSize: 13 }}>
              {t('section.infoCommerciales')}
            </Divider>
            <Descriptions bordered column={2} size="small">
              {Object.entries(DESCRIPTION_LABELS).map(([key, i18nKey]) => {
                const val = descParsed[key];
                if (val === undefined || val === null || val === '' || val === false) return null;
                const display = typeof val === 'boolean' ? t('common.yes') : String(val);
                return (
                  <Descriptions.Item key={key} label={t(i18nKey)}>{display}</Descriptions.Item>
                );
              })}
            </Descriptions>
          </>
        )}

        {/* ── Liaison RA ────────────────────────────────────────────────────── */}
        {rc.ra && (
          <>
            <Divider orientation={isAr ? 'right' : 'left'} style={{ fontSize: 13 }}>
              <LinkOutlined /> {t('rc.liaisonRA')}
            </Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label={t('rc.numeroRA')}>{rc.ra_numero || '—'}</Descriptions.Item>
              <Descriptions.Item label={t('field.statut')}>
                {rc.ra_statut
                  ? <Tag color={RA_STATUT_COLOR[rc.ra_statut] || 'default'}>{rc.ra_statut}</Tag>
                  : '—'}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>

      {/* ── Pièces jointes — visibles pour tous, upload/suppression selon droits ── */}
      <Card
        title={
          <Space>
            <FileOutlined />
            {t('section.piecesJointes')}
            <Tag>{docs.length}</Tag>
          </Space>
        }
      >
        {canEditDocs && (
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
                {isAr ? 'إضافة مرفق' : 'Ajouter une pièce jointe'}
              </Button>
            </Upload>
          </Space>
        )}

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

      {/* ── Modal retourner pour rectification ───────────────────────────────── */}
      <Modal
        title="Retourner le dossier pour rectification"
        open={retourModal}
        onCancel={() => { setRetourModal(false); retourForm.resetFields(); }}
        onOk={() => retourForm.validateFields().then(vals => retournerMut.mutate(vals))}
        okText="Retourner à l'agent"
        okButtonProps={{ danger: true, loading: retournerMut.isPending }}
        cancelText="Annuler"
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Le dossier repassera en statut RETOURNÉ. L'agent pourra le modifier et le resoumettre."
        />
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations"
            label={<span><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>Observations / corrections attendues</span>}
            rules={[
              { required: true, whitespace: true, message: 'Les observations sont obligatoires.' },
              { min: 10, message: 'Veuillez détailler les corrections attendues (min. 10 caractères).' },
            ]}
          >
            <Input.TextArea rows={4} placeholder="Décrivez précisément les corrections attendues…" showCount maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal décision autorisation (greffier) ────────────────────────────── */}
      <Modal
        title={
          authAction?.type === 'autoriser'
            ? `✅ ${isAr ? 'تأكيد الموافقة' : 'Confirmer l\'autorisation'}`
            : `🚫 ${isAr ? 'تأكيد الرفض' : 'Confirmer le refus'}`
        }
        open={authModal}
        onCancel={() => { setAuthModal(false); setAuthMotif(''); }}
        onOk={confirmAuthDecision}
        okText={authAction?.type === 'autoriser' ? (isAr ? 'موافقة' : 'Autoriser') : (isAr ? 'رفض' : 'Refuser')}
        okButtonProps={{
          style: authAction?.type === 'autoriser'
            ? { background: '#389e0d', borderColor: '#389e0d' }
            : { background: '#ff4d4f', borderColor: '#ff4d4f' },
          loading: autoriserAuthMut.isPending || refuserAuthMut.isPending,
        }}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        destroyOnClose
      >
        {authAction && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <strong>{isAr ? 'المأمور:' : 'Agent :'}</strong> {authAction.demande.demandeur_nom}
            </div>
            <div>
              <strong>{isAr ? 'النوع:' : 'Type :'}</strong>{' '}
              {authAction.demande.type_demande === 'IMPRESSION'
                ? (isAr ? 'طباعة' : 'Impression')
                : (isAr ? 'تصحيح' : 'Correction')}
            </div>
            <div>
              <strong>{isAr ? 'السبب:' : 'Motif :'}</strong> {authAction.demande.motif}
            </div>
            {authAction.demande.type_demande === 'CORRECTION' && authAction.type === 'autoriser' && (
              <Alert
                type="warning" showIcon
                message={isAr
                  ? 'سيتم تحويل الملف إلى حالة "مُعاد" تلقائياً.'
                  : 'Le dossier RA passera automatiquement en statut RETOURNE.'}
              />
            )}
            <Divider style={{ margin: '8px 0' }} />
            <Input.TextArea
              placeholder={isAr ? 'تعليق (اختياري)...' : 'Commentaire (facultatif)...'}
              rows={3}
              value={authMotif}
              onChange={e => setAuthMotif(e.target.value)}
            />
          </Space>
        )}
      </Modal>

    </div>
  );
};

export default DetailRChrono;
