/**
 * DetailReleve — Détail d'un relevé mensuel (lecture seule)
 *
 * Affiche :
 *   - Résumé du relevé (période, statut, statistiques)
 *   - Liste de tous les actes inclus par type
 *   - Bandeau d'avertissement juridique si le relevé est figé
 *
 * Accès : GREFFIER uniquement. Aucune action de modification disponible.
 */
import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Alert, Tabs,
  Descriptions, Statistic, Row, Col, Tooltip, Badge,
} from 'antd';
import {
  ArrowLeftOutlined, HistoryOutlined, LockFilled,
  FileDoneOutlined, EditOutlined, SwapOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { registreCentralAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

const MOIS_FR = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_AR = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const STATUT_COLOR = { BROUILLON:'default', FINALISE:'blue', TRANSMIS:'orange', ACQUITTE:'green', ERREUR:'red' };
const TYPE_ENTITE_LABEL = { PH:'Pers. Physique', PM:'Pers. Morale', SC:'Succursale' };

// ── Composant colonne réutilisable ─────────────────────────────────────────────
const colonnesActes = (isAr) => [
  {
    title: isAr ? 'ن.ت / السنة' : 'Chrono / Année',
    key: 'chrono',
    render: (_, r) =>
      r.annee_chrono && r.numero_chrono
        ? <Text code>{r.annee_chrono}/{r.numero_chrono}</Text>
        : <Text type="secondary">—</Text>,
  },
  {
    title: isAr ? 'الرقم التحليلي' : 'N° analytique',
    dataIndex: 'numero_ra',
    render: (v) => v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>,
  },
  {
    title: isAr ? 'التسمية' : 'Dénomination',
    key: 'denomination',
    render: (_, r) => (
      <Space direction="vertical" size={0}>
        <Text>{isAr ? (r.denomination_ar || r.denomination) : r.denomination}</Text>
        {r.type_entite && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {TYPE_ENTITE_LABEL[r.type_entite] || r.type_entite}
          </Text>
        )}
      </Space>
    ),
  },
  {
    title: isAr ? 'تاريخ التصديق' : 'Date validation',
    key: 'date',
    render: (_, r) => {
      const d = r.date_immatriculation || r.date_validation;
      return d ? new Date(d).toLocaleDateString('fr-DZ') : '—';
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────────

const DetailReleve = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { isAr }  = useLanguage();

  const { data: releve, isLoading } = useQuery({
    queryKey: ['registre-central-releve', id],
    queryFn:  () => registreCentralAPI.get(id).then(r => r.data),
    enabled:  !!id,
  });

  const actes = releve?.actes_json || {};
  const immat = actes.immatriculations || [];
  const modif = actes.modifications    || [];
  const cess  = actes.cessions         || [];
  const rad   = actes.radiations       || [];

  const estFige = releve && ['FINALISE','TRANSMIS','ACQUITTE'].includes(releve.statut);

  const tabItems = [
    {
      key: 'immat',
      label: (
        <Space>
          <FileDoneOutlined />
          {isAr ? 'تسجيلات' : 'Immatriculations'}
          <Badge count={immat.length} style={{ background: '#52c41a' }} />
        </Space>
      ),
      children: (
        <Table
          rowKey={(r, i) => `immat-${r.numero_ra || i}`}
          dataSource={immat}
          columns={colonnesActes(isAr)}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: isAr ? 'لا تسجيلات' : 'Aucune immatriculation' }}
        />
      ),
    },
    {
      key: 'modif',
      label: (
        <Space>
          <EditOutlined />
          {isAr ? 'تعديلات' : 'Modifications'}
          <Badge count={modif.length} style={{ background: '#1677ff' }} />
        </Space>
      ),
      children: (
        <Table
          rowKey={(r, i) => `modif-${r.numero_modif || i}`}
          dataSource={modif}
          columns={[
            { title: isAr ? 'ن. التعديل' : 'N° modification', dataIndex: 'numero_modif', render: v => v ? <Text code>{v}</Text> : '—' },
            ...colonnesActes(isAr).slice(1),
          ]}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: isAr ? 'لا تعديلات' : 'Aucune modification' }}
        />
      ),
    },
    {
      key: 'cess',
      label: (
        <Space>
          <SwapOutlined />
          {isAr ? 'تنازلات' : 'Cessions'}
          <Badge count={cess.length} style={{ background: '#fa8c16' }} />
        </Space>
      ),
      children: (
        <Table
          rowKey={(r, i) => `cess-${r.numero_cession || i}`}
          dataSource={cess}
          columns={[
            { title: isAr ? 'ن. التنازل' : 'N° cession', dataIndex: 'numero_cession', render: v => v ? <Text code>{v}</Text> : '—' },
            ...colonnesActes(isAr).slice(1),
          ]}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: isAr ? 'لا تنازلات' : 'Aucune cession' }}
        />
      ),
    },
    {
      key: 'rad',
      label: (
        <Space>
          <CloseCircleOutlined />
          {isAr ? 'شطبات' : 'Radiations'}
          <Badge count={rad.length} style={{ background: '#ff4d4f' }} />
        </Space>
      ),
      children: (
        <Table
          rowKey={(r, i) => `rad-${r.numero_radia || i}`}
          dataSource={rad}
          columns={[
            { title: isAr ? 'ن. الشطب' : 'N° radiation', dataIndex: 'numero_radia', render: v => v ? <Text code>{v}</Text> : '—' },
            ...colonnesActes(isAr).slice(1),
          ]}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: isAr ? 'لا شطبات' : 'Aucune radiation' }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>

      {/* Navigation */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/registre-central')}>
          {isAr ? 'العودة إلى القائمة' : 'Retour à la liste'}
        </Button>
        {releve?.nb_transmissions > 0 && (
          <Button
            icon={<HistoryOutlined />}
            onClick={() => navigate(`/registre-central/${id}/transmissions`)}
          >
            {isAr ? `سجل الإرسالات (${releve.nb_transmissions})` : `Journal des transmissions (${releve.nb_transmissions})`}
          </Button>
        )}
      </div>

      {/* Avertissement juridique si figé */}
      {estFige && (
        <Alert
          type="warning"
          showIcon
          icon={<LockFilled />}
          message={
            isAr
              ? 'هذا الكشف مُتجمَّد قانونياً — لا يمكن تعديل محتواه بعد الإتمام.'
              : 'Ce relevé est juridiquement figé — son contenu ne peut plus être modifié après finalisation.'
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Résumé */}
      <Card loading={isLoading} style={{ marginBottom: 16 }}>
        {releve && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div>
                <Title level={4} style={{ margin: 0, color: '#1a4480' }}>
                  🏛️ {isAr ? MOIS_AR[releve.mois] : MOIS_FR[releve.mois]} {releve.annee}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {isAr ? 'كشف الأعمال الشهرية للسجل المركزي' : 'Relevé mensuel — Registre Central national'}
                </Text>
              </div>
              <Tag color={STATUT_COLOR[releve.statut] || 'default'} style={{ fontSize: 13, padding: '4px 12px' }}>
                {releve.statut_label}
              </Tag>
            </div>

            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }}>
              <Descriptions.Item label={isAr ? 'الفترة' : 'Période'}>
                <Text strong>{releve.annee}/{String(releve.mois).padStart(2,'0')}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={isAr ? 'تاريخ التوليد' : 'Généré le'}>
                {releve.genere_le ? new Date(releve.genere_le).toLocaleString('fr-DZ') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={isAr ? 'تاريخ الإتمام' : 'Finalisé le'}>
                {releve.finalise_le ? new Date(releve.finalise_le).toLocaleString('fr-DZ') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={isAr ? 'عدد الإرسالات' : 'Transmissions'}>
                <Text strong>{releve.nb_transmissions}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Row gutter={12} style={{ marginTop: 16 }}>
              {[
                { label: isAr ? 'تسجيلات' : 'Immatriculations', value: releve.nb_immatriculations, color: '#52c41a' },
                { label: isAr ? 'تعديلات' : 'Modifications',    value: releve.nb_modifications,    color: '#1677ff' },
                { label: isAr ? 'تنازلات' : 'Cessions',         value: releve.nb_cessions,         color: '#fa8c16' },
                { label: isAr ? 'شطبات' : 'Radiations',          value: releve.nb_radiations,       color: '#ff4d4f' },
              ].map(({ label, value, color }) => (
                <Col xs={12} sm={6} key={label}>
                  <Statistic
                    title={label}
                    value={value}
                    valueStyle={{ color, fontSize: 20 }}
                  />
                </Col>
              ))}
            </Row>
          </>
        )}
      </Card>

      {/* Actes */}
      <Card
        title={
          <Space>
            <FileDoneOutlined />
            {isAr ? 'قائمة الأعمال المدرجة' : 'Liste des actes inclus'}
            <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
              ({isAr ? 'للاطلاع فقط — لا تعديل ممكن' : 'lecture seule — aucune modification possible'})
            </Text>
          </Space>
        }
        loading={isLoading}
      >
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
};

export default DetailReleve;
