import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Input, Select,
  message, Tooltip, Badge, Alert, Divider,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  PrinterOutlined, EditOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { autorisationAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ── Couleurs statut ───────────────────────────────────────────────────────────
const STATUT_COLOR  = { EN_ATTENTE: 'warning', AUTORISEE: 'success', REFUSEE: 'error', EXPIREE: 'default' };
const TYPE_COLOR    = { IMPRESSION: 'blue', CORRECTION: 'purple' };
const DOSSIER_COLOR = { RA: '#1a4480', HISTORIQUE: '#7b5ea7' };

// ── Libellés document_type ────────────────────────────────────────────────────
const DOC_LABELS = {
  EXTRAIT_RA:         'Extrait d\'immatriculation',
  EXTRAIT_RC_COMPLET: 'Extrait RC complet',
};
const DOC_LABELS_AR = {
  EXTRAIT_RA:         'مستخرج السجل التجاري',
  EXTRAIT_RC_COMPLET: 'مستخرج كامل',
};

const fmtDate = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—';

// ─────────────────────────────────────────────────────────────────────────────

const ListeAutorisations = () => {
  const { t, isAr }  = useLanguage();
  const queryClient  = useQueryClient();

  const [statutFiltre, setStatutFiltre] = useState('EN_ATTENTE');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalAction,  setModalAction]  = useState(null);   // { type: 'autoriser'|'refuser', demande }
  const [motifDecision, setMotifDecision] = useState('');

  // ── Données ────────────────────────────────────────────────────────────────
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['autorisations', statutFiltre],
    queryFn:  () => autorisationAPI.list({ statut: statutFiltre }).then(r => r.data),
    refetchInterval: 30_000,   // actualisation auto toutes les 30 s
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const autoriserMut = useMutation({
    mutationFn: ({ id, motif }) => autorisationAPI.autoriser(id, { motif_decision: motif }),
    onSuccess: () => {
      message.success(t('autorisation.successAutoriser'));
      setModalVisible(false);
      setMotifDecision('');
      queryClient.invalidateQueries({ queryKey: ['autorisations'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur.'),
  });
  const refuserMut = useMutation({
    mutationFn: ({ id, motif }) => autorisationAPI.refuser(id, { motif_decision: motif }),
    onSuccess: () => {
      message.success(t('autorisation.successRefuser'));
      setModalVisible(false);
      setMotifDecision('');
      queryClient.invalidateQueries({ queryKey: ['autorisations'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur.'),
  });

  // ── Ouvrir modal décision ──────────────────────────────────────────────────
  const openModal = (type, demande) => {
    setModalAction({ type, demande });
    setMotifDecision('');
    setModalVisible(true);
  };

  const handleConfirm = () => {
    const { type, demande } = modalAction;
    const args = { id: demande.id, motif: motifDecision };
    if (type === 'autoriser') autoriserMut.mutate(args);
    else                      refuserMut.mutate(args);
  };

  // ── Badge compteur en-tête ────────────────────────────────────────────────
  const nbEnAttente = statutFiltre === 'EN_ATTENTE' ? data.length : undefined;

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columns = [
    {
      title: '#',
      key: 'id',
      width: 55,
      render: (_, r) => <Text type="secondary">#{r.id}</Text>,
    },
    {
      title: isAr ? 'النوع' : 'Type',
      key: 'type_demande',
      width: 120,
      render: (_, r) => (
        <Tag color={TYPE_COLOR[r.type_demande]} icon={r.type_demande === 'IMPRESSION' ? <PrinterOutlined /> : <EditOutlined />}>
          {isAr
            ? (r.type_demande === 'IMPRESSION' ? 'طباعة' : 'تصحيح')
            : (r.type_demande === 'IMPRESSION' ? 'Impression' : 'Correction')}
        </Tag>
      ),
    },
    {
      title: isAr ? 'الملف' : 'Dossier',
      key: 'dossier',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag color={DOSSIER_COLOR[r.type_dossier]} style={{ color: '#fff' }}>
            {r.type_dossier}
          </Tag>
          <Text style={{ fontSize: 12 }}>ID #{r.dossier_id}</Text>
          {r.document_type && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {isAr ? DOC_LABELS_AR[r.document_type] : DOC_LABELS[r.document_type]}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: isAr ? 'مقدم الطلب' : 'Demandeur',
      dataIndex: 'demandeur_nom',
      key: 'demandeur_nom',
    },
    {
      title: isAr ? 'سبب الطلب' : 'Motif',
      dataIndex: 'motif',
      key: 'motif',
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: isAr ? 'تاريخ الطلب' : 'Date demande',
      key: 'date_demande',
      render: (_, r) => <Text style={{ fontSize: 12 }}>{fmtDate(r.date_demande)}</Text>,
    },
    {
      title: isAr ? 'الحالة' : 'Statut',
      key: 'statut',
      width: 130,
      render: (_, r) => {
        const mins = r.minutes_restantes;
        return (
          <Space direction="vertical" size={0}>
            <Tag color={STATUT_COLOR[r.statut]}>
              {isAr
                ? { EN_ATTENTE: 'في الانتظار', AUTORISEE: 'مقبول', REFUSEE: 'مرفوض', EXPIREE: 'منتهي' }[r.statut]
                : { EN_ATTENTE: 'En attente', AUTORISEE: 'Autorisée', REFUSEE: 'Refusée', EXPIREE: 'Expirée' }[r.statut]}
            </Tag>
            {r.statut === 'AUTORISEE' && mins !== null && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <ClockCircleOutlined /> {mins} min
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: isAr ? 'الإجراءات' : 'Actions',
      key: 'actions',
      width: 160,
      render: (_, r) =>
        r.statut === 'EN_ATTENTE' ? (
          <Space>
            <Tooltip title={t('autorisation.autoriser')}>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                style={{ background: '#389e0d', borderColor: '#389e0d' }}
                onClick={() => openModal('autoriser', r)}
              >
                {isAr ? 'موافقة' : 'Autoriser'}
              </Button>
            </Tooltip>
            <Tooltip title={t('autorisation.refuser')}>
              <Button
                danger
                size="small"
                icon={<CloseCircleOutlined />}
                onClick={() => openModal('refuser', r)}
              >
                {isAr ? 'رفض' : 'Refuser'}
              </Button>
            </Tooltip>
          </Space>
        ) : (
          <Space direction="vertical" size={0}>
            {r.decideur_nom && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {isAr ? 'بواسطة ' : 'Par '}{r.decideur_nom}
              </Text>
            )}
            {r.date_decision && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {fmtDate(r.date_decision)}
              </Text>
            )}
            {r.motif_decision && (
              <Text type="secondary" style={{ fontSize: 11 }}>"{r.motif_decision}"</Text>
            )}
          </Space>
        ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space align="center">
          <FileDoneOutlined style={{ fontSize: 22, color: '#1a4480' }} />
          <Title level={4} style={{ margin: 0 }}>
            {isAr ? t('autorisation.pageTitle') : 'Autorisations — File du greffier'}
          </Title>
          {nbEnAttente > 0 && (
            <Badge count={nbEnAttente} style={{ background: '#faad14' }} />
          )}
        </Space>
        <Space>
          <Select
            value={statutFiltre}
            onChange={setStatutFiltre}
            style={{ width: 160 }}
            options={[
              { value: 'EN_ATTENTE', label: isAr ? 'في الانتظار' : 'En attente' },
              { value: 'AUTORISEE',  label: isAr ? 'مقبولة'      : 'Autorisées' },
              { value: 'REFUSEE',   label: isAr ? 'مرفوضة'      : 'Refusées'  },
              { value: 'EXPIREE',   label: isAr ? 'منتهية'       : 'Expirées'  },
              { value: '',          label: isAr ? 'الكل'         : 'Toutes'    },
            ]}
          />
          <Button onClick={refetch}>{isAr ? 'تحديث' : 'Actualiser'}</Button>
        </Space>
      </div>

      {statutFiltre === 'EN_ATTENTE' && data.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            isAr
              ? `${data.length} طلب(ات) تنتظر قرارك.`
              : `${data.length} demande(s) en attente de votre décision.`
          }
        />
      )}

      <Card>
        <Table
          rowKey="id"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: isAr ? t('autorisation.aucune') : 'Aucune demande' }}
          size="middle"
        />
      </Card>

      {/* ── Modal décision ─────────────────────────────────────────────────── */}
      <Modal
        title={
          modalAction?.type === 'autoriser'
            ? `✅ ${isAr ? 'تأكيد الموافقة' : 'Confirmer l\'autorisation'}`
            : `🚫 ${isAr ? 'تأكيد الرفض' : 'Confirmer le refus'}`
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleConfirm}
        okText={modalAction?.type === 'autoriser'
          ? (isAr ? 'موافقة' : 'Autoriser')
          : (isAr ? 'رفض' : 'Refuser')
        }
        okButtonProps={{
          style: modalAction?.type === 'autoriser'
            ? { background: '#389e0d', borderColor: '#389e0d' }
            : { background: '#ff4d4f', borderColor: '#ff4d4f' },
          loading: autoriserMut.isPending || refuserMut.isPending,
        }}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        destroyOnClose
      >
        {modalAction && (
          <>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Text>
                <strong>{isAr ? 'النوع:' : 'Type :'}</strong>{' '}
                {modalAction.demande.type_demande === 'IMPRESSION'
                  ? (isAr ? 'طباعة' : 'Impression')
                  : (isAr ? 'تصحيح' : 'Correction')}
              </Text>
              <Text>
                <strong>{isAr ? 'الملف:' : 'Dossier :'}</strong>{' '}
                {modalAction.demande.type_dossier} #{modalAction.demande.dossier_id}
              </Text>
              <Text>
                <strong>{isAr ? 'مقدم الطلب:' : 'Demandeur :'}</strong>{' '}
                {modalAction.demande.demandeur_nom}
              </Text>
              <Text>
                <strong>{isAr ? 'السبب:' : 'Motif :'}</strong>{' '}
                {modalAction.demande.motif}
              </Text>
              {modalAction.demande.type_demande === 'IMPRESSION' && modalAction.type === 'autoriser' && (
                <Alert
                  type="info"
                  showIcon
                  message={isAr
                    ? 'سيكون للمأمور 20 دقيقة لطباعة الوثيقة بعد الموافقة.'
                    : 'L\'agent disposera de 20 minutes pour imprimer après autorisation.'}
                />
              )}
              {modalAction.demande.type_demande === 'CORRECTION' && modalAction.type === 'autoriser' && (
                <Alert
                  type="warning"
                  showIcon
                  message={isAr
                    ? 'سيتم تحويل الملف من "مسجّل" إلى "مُعاد" تلقائياً.'
                    : 'Le dossier passera automatiquement de IMMATRICULE à RETOURNE.'}
                />
              )}
            </Space>
            <Divider />
            <TextArea
              placeholder={isAr ? t('autorisation.motifDecisionPlaceholder') : 'Commentaire (facultatif)...'}
              rows={3}
              value={motifDecision}
              onChange={e => setMotifDecision(e.target.value)}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default ListeAutorisations;
