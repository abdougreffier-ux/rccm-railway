import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Select,
  Tooltip, Badge, Alert, Divider,
} from 'antd';
import {
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PrinterOutlined, EditOutlined, FileDoneOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { autorisationAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

// ── Couleurs et libellés ──────────────────────────────────────────────────────
const STATUT_COLOR = {
  EN_ATTENTE: 'warning',
  AUTORISEE:  'success',
  REFUSEE:    'error',
  EXPIREE:    'default',
};

const STATUT_LABELS_FR = {
  EN_ATTENTE: 'En attente',
  AUTORISEE:  'Autorisée',
  REFUSEE:    'Refusée',
  EXPIREE:    'Expirée',
};
const STATUT_LABELS_AR = {
  EN_ATTENTE: 'في الانتظار',
  AUTORISEE:  'مقبولة',
  REFUSEE:    'مرفوضة',
  EXPIREE:    'منتهية',
};

const TYPE_LABELS_FR = { IMPRESSION: 'Impression', CORRECTION: 'Correction' };
const TYPE_LABELS_AR = { IMPRESSION: 'طباعة',     CORRECTION: 'تصحيح'    };
const DOC_LABELS_FR  = { EXTRAIT_RA: 'Extrait immatriculation', EXTRAIT_RC_COMPLET: 'Extrait RC complet' };
const DOC_LABELS_AR  = { EXTRAIT_RA: 'مستخرج السجل', EXTRAIT_RC_COMPLET: 'مستخرج كامل' };

const fmtDate = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—';

// ─────────────────────────────────────────────────────────────────────────────

const MesAutorisations = () => {
  const { isAr }    = useLanguage();
  const navigate    = useNavigate();
  const [statut, setStatut] = useState('');

  // ── Requête : toutes les demandes de l'agent connecté ─────────────────────
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['mes-autorisations-all', statut],
    queryFn:  () => autorisationAPI.list({ statut: statut || undefined }).then(r => r.data),
    refetchInterval: 30_000,   // rafraîchissement auto toutes les 30 s
  });

  // ── Compteurs pour les badges ─────────────────────────────────────────────
  const nbEnAttente = data.filter(d => d.statut === 'EN_ATTENTE').length;
  const nbAutorisee = data.filter(d => d.statut === 'AUTORISEE' &&
    (!d.date_expiration || new Date(d.date_expiration) > new Date())).length;

  // ── Navigation vers le dossier concerné ──────────────────────────────────
  const goToDossier = (demande) => {
    if (demande.type_dossier === 'RA') {
      navigate(`/registres/analytique/${demande.dossier_id}`);
    } else if (demande.type_dossier === 'HISTORIQUE') {
      navigate(`/historique/${demande.dossier_id}`);
    }
  };

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columns = [
    {
      title: isAr ? 'رقم' : '#',
      key: 'id',
      width: 55,
      render: (_, r) => <Text type="secondary">#{r.id}</Text>,
    },
    {
      title: isAr ? 'النوع' : 'Type',
      key: 'type',
      width: 120,
      render: (_, r) => (
        <Tag
          color={r.type_demande === 'IMPRESSION' ? 'blue' : 'purple'}
          icon={r.type_demande === 'IMPRESSION' ? <PrinterOutlined /> : <EditOutlined />}
        >
          {isAr ? TYPE_LABELS_AR[r.type_demande] : TYPE_LABELS_FR[r.type_demande]}
        </Tag>
      ),
    },
    {
      title: isAr ? 'الملف' : 'Dossier',
      key: 'dossier',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag color={r.type_dossier === 'RA' ? '#1a4480' : '#7b5ea7'}
            style={{ color: '#fff', cursor: 'pointer' }}
            onClick={() => goToDossier(r)}>
            {r.type_dossier} #{r.dossier_id}
          </Tag>
          {r.document_type && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {isAr ? DOC_LABELS_AR[r.document_type] : DOC_LABELS_FR[r.document_type]}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: isAr ? 'سبب الطلب' : 'Motif',
      dataIndex: 'motif',
      key: 'motif',
      ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: isAr ? 'تاريخ الطلب' : 'Date demande',
      key: 'date_demande',
      width: 140,
      render: (_, r) => <Text style={{ fontSize: 12 }}>{fmtDate(r.date_demande)}</Text>,
    },
    {
      title: isAr ? 'الحالة' : 'Statut',
      key: 'statut',
      width: 160,
      render: (_, r) => {
        const isActive = r.statut === 'AUTORISEE' &&
          (!r.date_expiration || new Date(r.date_expiration) > new Date());
        const mins = r.minutes_restantes;
        return (
          <Space direction="vertical" size={0}>
            <Tag color={STATUT_COLOR[r.statut]}>
              {isAr ? STATUT_LABELS_AR[r.statut] : STATUT_LABELS_FR[r.statut]}
            </Tag>
            {isActive && mins !== null && (
              <Text type="success" style={{ fontSize: 11 }}>
                <ClockCircleOutlined /> {mins} min {isAr ? 'متبقية' : 'restantes'}
              </Text>
            )}
            {r.statut === 'AUTORISEE' && r.date_expiration &&
              new Date(r.date_expiration) <= new Date() && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {isAr ? 'انتهت الصلاحية' : 'Expirée'}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: isAr ? 'قرار كاتب الضبط' : 'Décision greffier',
      key: 'decision',
      render: (_, r) => {
        if (r.statut === 'EN_ATTENTE') {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ color: '#faad14' }} />{' '}
              {isAr ? 'في انتظار القرار' : 'En attente de décision'}
            </Text>
          );
        }
        return (
          <Space direction="vertical" size={0}>
            {r.decideur_nom && (
              <Text style={{ fontSize: 12 }}>
                {isAr ? 'بواسطة ' : 'Par '}{r.decideur_nom}
              </Text>
            )}
            {r.date_decision && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {fmtDate(r.date_decision)}
              </Text>
            )}
            {r.motif_decision && (
              <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                "{r.motif_decision}"
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: isAr ? 'الإجراء' : 'Action',
      key: 'action',
      width: 110,
      render: (_, r) => {
        const isActive = r.statut === 'AUTORISEE' &&
          (!r.date_expiration || new Date(r.date_expiration) > new Date());
        return (
          <Tooltip title={isAr ? 'الانتقال إلى الملف' : 'Aller au dossier'}>
            <Button
              size="small"
              type={isActive ? 'primary' : 'default'}
              icon={<FileDoneOutlined />}
              style={isActive ? { background: '#389e0d', borderColor: '#389e0d' } : undefined}
              onClick={() => goToDossier(r)}
            >
              {isAr ? 'فتح' : 'Ouvrir'}
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space align="center">
          <FileDoneOutlined style={{ fontSize: 22, color: '#722ed1' }} />
          <Title level={4} style={{ margin: 0 }}>
            {isAr ? 'طلبات التفويض الخاصة بي' : 'Mes demandes d\'autorisation'}
          </Title>
          {nbEnAttente > 0 && (
            <Badge count={nbEnAttente} style={{ background: '#faad14' }} />
          )}
          {nbAutorisee > 0 && (
            <Badge count={nbAutorisee} style={{ background: '#389e0d' }} />
          )}
        </Space>
        <Space>
          <Select
            value={statut || undefined}
            placeholder={isAr ? 'كل الحالات' : 'Tous les statuts'}
            onChange={v => setStatut(v || '')}
            allowClear
            style={{ width: 180 }}
            options={[
              { value: 'EN_ATTENTE', label: isAr ? 'في الانتظار' : 'En attente'  },
              { value: 'AUTORISEE',  label: isAr ? 'مقبولة'      : 'Autorisées' },
              { value: 'REFUSEE',    label: isAr ? 'مرفوضة'      : 'Refusées'   },
              { value: 'EXPIREE',    label: isAr ? 'منتهية'       : 'Expirées'   },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={refetch}>
            {isAr ? 'تحديث' : 'Actualiser'}
          </Button>
        </Space>
      </div>

      {/* ── Alertes résumé ───────────────────────────────────────────────── */}
      {nbEnAttente > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: 12 }}
          message={isAr
            ? `${nbEnAttente} طلب(ات) في انتظار قرار كاتب الضبط.`
            : `${nbEnAttente} demande(s) en attente de décision du greffier.`}
        />
      )}
      {nbAutorisee > 0 && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 12 }}
          message={isAr
            ? `${nbAutorisee} تفويض نشط — يمكنك المتابعة.`
            : `${nbAutorisee} autorisation(s) active(s) — vous pouvez procéder.`}
        />
      )}

      {/* ── Tableau ──────────────────────────────────────────────────────── */}
      <Card>
        <Table
          rowKey="id"
          dataSource={data}
          columns={columns}
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{
            emptyText: isAr
              ? 'لا توجد طلبات تفويض'
              : 'Aucune demande d\'autorisation',
          }}
          rowClassName={(r) => {
            if (r.statut === 'EN_ATTENTE') return 'row-pending';
            if (r.statut === 'AUTORISEE' && (!r.date_expiration || new Date(r.date_expiration) > new Date()))
              return 'row-active';
            return '';
          }}
        />
      </Card>

      <style>{`
        .row-pending td { background-color: #fffbe6 !important; }
        .row-pending:hover td { background-color: #fff1b8 !important; }
        .row-active td { background-color: #f6ffed !important; }
        .row-active:hover td { background-color: #d9f7be !important; }
      `}</style>
    </div>
  );
};

export default MesAutorisations;
