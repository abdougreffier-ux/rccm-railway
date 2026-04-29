/**
 * JournalTransmissions — Journal des transmissions vers le Registre Central
 *
 * Affiche toutes les tentatives de transmission pour un relevé mensuel donné :
 *   - Date/heure
 *   - Période
 *   - N° tentative
 *   - Statut (succès / échec / rejeté / timeout)
 *   - Référence centrale (si acquittée)
 *   - Durée de transmission
 *   - Message d'erreur technique le cas échéant
 *
 * Accès : GREFFIER uniquement. Lecture seule — aucune action disponible.
 */
import React from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Alert,
  Tooltip, Descriptions, Timeline,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SyncOutlined, ExclamationCircleOutlined, FieldTimeOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { registreCentralAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

const MOIS_FR = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_AR = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const STATUT_TRANS = {
  SUCCES:    { color: 'green',   label: 'Succès',   labelAr: 'نجح',          icon: <CheckCircleOutlined /> },
  ECHEC:     { color: 'red',     label: 'Échec',    labelAr: 'فشل',          icon: <CloseCircleOutlined /> },
  TIMEOUT:   { color: 'orange',  label: 'Timeout',  labelAr: 'انتهاء الوقت', icon: <FieldTimeOutlined /> },
  REJETE:    { color: 'volcano', label: 'Rejeté',   labelAr: 'مرفوض',        icon: <ExclamationCircleOutlined /> },
  EN_COURS:  { color: 'blue',    label: 'En cours', labelAr: 'جارٍ',         icon: <SyncOutlined spin /> },
};

const JournalTransmissions = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { isAr } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['registre-central-transmissions', id],
    queryFn:  () => registreCentralAPI.transmissions(id).then(r => r.data),
    enabled:  !!id,
    refetchInterval: 30_000,
  });

  const transmissions  = data?.transmissions  || [];
  const periodeLabel   = data ? `${data.releve_id ? '' : ''}${data.periode || ''}` : '…';
  const [anneeStr, moisStr] = (data?.periode || '/').split('/');
  const moisInt = parseInt(moisStr, 10);

  // ── Colonnes ────────────────────────────────────────────────────────────────
  const colonnes = [
    {
      title: isAr ? 'رقم المحاولة' : 'Tentative',
      dataIndex: 'tentative',
      align: 'center',
      width: 80,
      render: (v) => <Tag style={{ fontWeight: 700 }}>#{v}</Tag>,
    },
    {
      title: isAr ? 'التاريخ والوقت' : 'Date / Heure',
      dataIndex: 'transmis_le',
      render: (v) => v ? new Date(v).toLocaleString('fr-DZ') : '—',
    },
    {
      title: isAr ? 'الحالة' : 'Statut',
      dataIndex: 'statut',
      align: 'center',
      render: (v) => {
        const s = STATUT_TRANS[v] || { color: 'default', label: v, icon: null };
        return (
          <Tag color={s.color} icon={s.icon}>
            {isAr ? s.labelAr : s.label}
          </Tag>
        );
      },
    },
    {
      title: isAr ? 'المرجع المركزي' : 'Référence centrale',
      dataIndex: 'reference_centrale',
      render: (v) => v
        ? <Text code style={{ fontSize: 12 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: isAr ? 'كود HTTP' : 'Code HTTP',
      dataIndex: 'http_status',
      align: 'center',
      render: (v) => v
        ? <Tag color={v < 300 ? 'green' : v < 500 ? 'orange' : 'red'}>{v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: isAr ? 'المدة (ms)' : 'Durée (ms)',
      dataIndex: 'duree_ms',
      align: 'right',
      render: (v) => v != null ? <Text type="secondary">{v} ms</Text> : '—',
    },
    {
      title: isAr ? 'بواسطة' : 'Transmis par',
      dataIndex: 'transmis_par',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: isAr ? 'تفاصيل الخطأ' : 'Erreur technique',
      dataIndex: 'erreur_detail',
      render: (v) => v
        ? (
          <Tooltip title={v} overlayStyle={{ maxWidth: 400 }}>
            <Text type="danger" style={{ fontSize: 11, cursor: 'pointer', maxWidth: 200 }} ellipsis>
              {v}
            </Text>
          </Tooltip>
        )
        : <Text type="secondary">—</Text>,
    },
  ];

  // ── Timeline (résumé visuel) ─────────────────────────────────────────────────
  const timelineItems = [...transmissions].reverse().map((t) => {
    const s = STATUT_TRANS[t.statut] || { color: 'gray', icon: null };
    return {
      color: s.color,
      dot:   s.icon,
      children: (
        <div>
          <Space>
            <Text strong>Tentative #{t.tentative}</Text>
            <Tag color={s.color}>{isAr ? (STATUT_TRANS[t.statut]?.labelAr || t.statut) : (STATUT_TRANS[t.statut]?.label || t.statut)}</Tag>
          </Space>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t.transmis_le ? new Date(t.transmis_le).toLocaleString('fr-DZ') : '—'}
            {t.reference_centrale ? ` — Réf. ${t.reference_centrale}` : ''}
            {t.duree_ms != null ? ` (${t.duree_ms} ms)` : ''}
          </Text>
          {t.erreur_detail && (
            <><br /><Text type="danger" style={{ fontSize: 11 }}>{t.erreur_detail}</Text></>
          )}
        </div>
      ),
    };
  });

  const aucuneErreur = transmissions.every(t => !t.erreur_detail);
  const derniere = transmissions[transmissions.length - 1];

  return (
    <div style={{ padding: '0 4px' }}>

      {/* Navigation */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/registre-central')}>
          {isAr ? 'العودة إلى القائمة' : 'Retour à la liste'}
        </Button>
        <Button onClick={() => navigate(`/registre-central/${id}`)}>
          {isAr ? 'تفاصيل الكشف' : 'Détail du relevé'}
        </Button>
      </div>

      {/* En-tête */}
      <Card loading={isLoading} style={{ marginBottom: 16 }}>
        {data && (
          <>
            <Title level={4} style={{ margin: 0, color: '#1a4480' }}>
              📡 {isAr ? 'سجل الإرسالات —' : 'Journal des transmissions —'}{' '}
              {isAr ? MOIS_AR[moisInt] || moisStr : MOIS_FR[moisInt] || moisStr}{' '}
              {anneeStr}
            </Title>
            <Space style={{ marginTop: 8 }} wrap>
              <Text type="secondary">
                {isAr ? `${data.nb_tentatives} محاولة` : `${data.nb_tentatives} tentative(s)`}
              </Text>
              <Tag>{data.statut_releve}</Tag>
            </Space>
          </>
        )}
      </Card>

      {/* Alerte dernière transmission */}
      {derniere && (
        <Alert
          type={derniere.statut === 'SUCCES' ? 'success' : derniere.statut === 'EN_COURS' ? 'info' : 'error'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            derniere.statut === 'SUCCES'
              ? (isAr
                  ? `آخر إرسال ناجح — المرجع : ${derniere.reference_centrale || '—'}`
                  : `Dernière transmission réussie — Référence centrale : ${derniere.reference_centrale || '—'}`)
              : (isAr
                  ? `آخر إرسال فشل : ${derniere.erreur_detail || derniere.statut}`
                  : `Dernière transmission échouée : ${derniere.erreur_detail || derniere.statut}`)
          }
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 16, alignItems: 'start' }}>

        {/* Tableau principal */}
        <Card
          title={
            <Space>
              {isAr ? 'تفاصيل كل محاولة' : 'Détail de chaque tentative'}
              <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                ({isAr ? 'للاطلاع فقط' : 'lecture seule'})
              </Text>
            </Space>
          }
          loading={isLoading}
        >
          <Table
            rowKey="id"
            dataSource={transmissions}
            columns={colonnes}
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            locale={{
              emptyText: isAr ? 'لا توجد إرسالات بعد' : 'Aucune transmission pour ce relevé',
            }}
            rowClassName={(r) => r.statut === 'ECHEC' || r.statut === 'REJETE' ? 'table-row-error' : ''}
          />
        </Card>

        {/* Timeline latérale */}
        <Card title={isAr ? 'مخطط زمني' : 'Chronologie'} size="small" loading={isLoading}>
          {timelineItems.length > 0
            ? <Timeline items={timelineItems} />
            : <Text type="secondary" style={{ fontSize: 12 }}>
                {isAr ? 'لا توجد إرسالات' : 'Aucune transmission'}
              </Text>
          }
        </Card>

      </div>
    </div>
  );
};

export default JournalTransmissions;
