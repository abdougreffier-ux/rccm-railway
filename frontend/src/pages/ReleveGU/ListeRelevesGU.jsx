/**
 * ListeRelevesGU — Relevés mensuels officiels du Guichet unique
 *
 * Accès : GREFFIER uniquement (garanti par <GreffierRoute> dans App.jsx).
 *
 * Règle non négociable (CDC §3) :
 *   Seules les immatriculations satisfaisant les 4 critères simultanés sont incluses :
 *     1. type_acte = 'IMMATRICULATION'
 *     2. statut    = 'VALIDE'
 *     3. validated_at dans (annee, mois)
 *     4. created_by.role.code = 'AGENT_GU'
 *
 * Fonctions disponibles :
 *   • Générer un relevé pour un mois/année donné
 *   • Finaliser (gel juridique irréversible)
 *   • Télécharger le PDF officiel (FR ou AR)
 */
import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form,
  InputNumber, Select, Tooltip, Alert, Statistic, Row, Col, message,
} from 'antd';
import {
  PlusOutlined, LockOutlined, FilePdfOutlined,
  ReloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { releveGuAPI, openPDF } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

// ── Libellés mois ─────────────────────────────────────────────────────────────
const MOIS_FR = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MOIS_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const STATUT_COLOR = { BROUILLON: 'default', FINALISE: 'green' };
const STATUT_LABEL = { BROUILLON: 'Brouillon', FINALISE: 'Finalisé' };

// ─────────────────────────────────────────────────────────────────────────────

const ListeRelevesGU = () => {
  const qc          = useQueryClient();
  const { isAr }   = useLanguage();
  const [form]      = Form.useForm();
  const [modalOpen,  setModalOpen]  = useState(false);
  const [confirmObj, setConfirmObj] = useState(null); // { releve }

  // ── Données ──────────────────────────────────────────────────────────────────
  const { data: releves = [], isLoading, refetch } = useQuery({
    queryKey: ['releve-gu-list'],
    queryFn:  () => releveGuAPI.list().then(r => r.data),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const genererMut = useMutation({
    mutationFn: (data) => releveGuAPI.generer(data),
    onSuccess: () => {
      message.success(isAr ? 'تم توليد الكشف بنجاح.' : 'Relevé généré avec succès.');
      qc.invalidateQueries({ queryKey: ['releve-gu-list'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (e) => message.error(
      e.response?.data?.detail || (isAr ? 'خطأ أثناء التوليد.' : 'Erreur lors de la génération.')
    ),
  });

  const finaliserMut = useMutation({
    mutationFn: (id) => releveGuAPI.finaliser(id),
    onSuccess: () => {
      message.success(isAr ? 'تم تحديد الكشف نهائياً.' : 'Relevé finalisé et figé définitivement.');
      qc.invalidateQueries({ queryKey: ['releve-gu-list'] });
      setConfirmObj(null);
    },
    onError: (e) => message.error(
      e.response?.data?.detail || (isAr ? 'خطأ أثناء التحديد.' : 'Erreur lors de la finalisation.')
    ),
  });

  // ── Colonnes ──────────────────────────────────────────────────────────────────
  const colonnes = [
    {
      title: isAr ? 'الفترة' : 'Période',
      key: 'periode',
      sorter: (a, b) => (a.annee * 100 + a.mois) - (b.annee * 100 + b.mois),
      defaultSortOrder: 'descend',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            {isAr ? MOIS_AR[r.mois] : MOIS_FR[r.mois]} {r.annee}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.annee}/{String(r.mois).padStart(2, '0')}
          </Text>
        </Space>
      ),
    },
    {
      title: isAr ? 'التسجيلات' : 'Immatriculations',
      key: 'immat',
      align: 'center',
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color="green">PH : {r.nb_ph}</Tag>
          <Tag color="blue">PM : {r.nb_pm}</Tag>
          <Tag color="orange">SC : {r.nb_sc}</Tag>
        </Space>
      ),
    },
    {
      title: isAr ? 'المجموع' : 'Total',
      dataIndex: 'nb_total',
      align: 'center',
      render: (v) => <Text strong style={{ fontSize: 15 }}>{v}</Text>,
    },
    {
      title: isAr ? 'الحالة' : 'Statut',
      dataIndex: 'statut',
      align: 'center',
      render: (v) => (
        <Tag color={STATUT_COLOR[v] || 'default'}>
          {STATUT_LABEL[v] || v}
        </Tag>
      ),
    },
    {
      title: isAr ? 'تاريخ التوليد' : 'Généré le',
      key: 'genere',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>
            {r.genere_le ? new Date(r.genere_le).toLocaleDateString('fr-FR') : '—'}
          </Text>
          {r.genere_par_login && (
            <Text type="secondary" style={{ fontSize: 11 }}>{r.genere_par_login}</Text>
          )}
        </Space>
      ),
    },
    {
      title: isAr ? 'الإجراءات' : 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 240,
      render: (_, r) => (
        <Space wrap size={4}>

          {/* PDF Français */}
          <Tooltip title="PDF Français">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              style={{ color: '#C9A227', borderColor: '#C9A227' }}
              onClick={() => openPDF(releveGuAPI.pdfUrl(r.id, 'fr'))}
            >
              FR
            </Button>
          </Tooltip>

          {/* PDF عربي */}
          <Tooltip title="PDF عربي">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              style={{ color: '#0B6E3A', borderColor: '#0B6E3A' }}
              onClick={() => openPDF(releveGuAPI.pdfUrl(r.id, 'ar'))}
            >
              AR
            </Button>
          </Tooltip>

          {/* Finaliser — seulement si BROUILLON */}
          {r.statut === 'BROUILLON' && (
            <Tooltip title={isAr ? 'تجميد نهائي (لا رجعة فيه)' : 'Geler définitivement (irréversible)'}>
              <Button
                size="small"
                icon={<LockOutlined />}
                type="primary"
                ghost
                onClick={() => setConfirmObj({ releve: r })}
              >
                {isAr ? 'إتمام' : 'Finaliser'}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // ── Statistiques globales ─────────────────────────────────────────────────────
  const totaux = releves.reduce(
    (acc, r) => ({
      ph:    acc.ph    + (r.nb_ph    || 0),
      pm:    acc.pm    + (r.nb_pm    || 0),
      sc:    acc.sc    + (r.nb_sc    || 0),
      total: acc.total + (r.nb_total || 0),
    }),
    { ph: 0, pm: 0, sc: 0, total: 0 },
  );

  return (
    <div style={{ padding: '0 4px' }}>

      {/* En-tête */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#0B6E3A' }}>
            {isAr ? 'كشوف شهرية للشباك الموحد' : '🏢 Relevés mensuels — Guichet unique'}
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isAr
              ? 'تسجيلات الشباك الموحد المصادق عليها من طرف كاتب العدل'
              : 'Immatriculations GU validées par le greffier — données officielles figées'}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            {isAr ? 'تحديث' : 'Actualiser'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#0B6E3A', borderColor: '#0B6E3A' }}
            onClick={() => setModalOpen(true)}
          >
            {isAr ? 'توليد كشف' : 'Générer un relevé'}
          </Button>
        </Space>
      </div>

      {/* Statistiques globales cumulées */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: isAr ? 'ش.ط PH' : 'Pers. physiques', value: totaux.ph,    color: '#52c41a' },
          { label: isAr ? 'ش.م PM' : 'Pers. morales',   value: totaux.pm,    color: '#1677ff' },
          { label: isAr ? 'فروع SC' : 'Succursales',    value: totaux.sc,    color: '#fa8c16' },
          { label: isAr ? 'المجموع' : 'Total GU',       value: totaux.total, color: '#0B6E3A' },
        ].map(({ label, value, color }) => (
          <Col xs={12} sm={6} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}` }}>
              <Statistic title={label} value={value} valueStyle={{ color, fontSize: 20 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Note légale */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={
          isAr
            ? 'يشمل كل كشف تسجيلات الشباك الموحد فقط : نوع العمل = تسجيل، الحالة = صالح، تاريخ التصديق ضمن الشهر، الدور = AGENT_GU.'
            : 'Chaque relevé inclut uniquement : type_acte=IMMATRICULATION + statut=VALIDE + validated_at dans le mois + rôle AGENT_GU. Toute autre immatriculation est exclue.'
        }
        style={{ marginBottom: 16, fontSize: 12 }}
        closable
      />

      {/* Tableau */}
      <Card>
        <Table
          rowKey="id"
          dataSource={releves}
          columns={colonnes}
          loading={isLoading}
          pagination={{ pageSize: 24, showSizeChanger: false }}
          size="middle"
          scroll={{ x: 800 }}
          locale={{
            emptyText: isAr
              ? 'لا توجد كشوف بعد — قم بتوليد أول كشف'
              : 'Aucun relevé — cliquez sur « Générer un relevé » pour commencer',
          }}
        />
      </Card>

      {/* Modal : Générer un relevé */}
      <Modal
        open={modalOpen}
        title={<><PlusOutlined /> {isAr ? 'توليد كشف شهري للشباك الموحد' : 'Générer un relevé mensuel GU'}</>}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={genererMut.isPending}
        okText={isAr ? 'توليد' : 'Générer'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        okButtonProps={{ style: { background: '#0B6E3A', borderColor: '#0B6E3A' } }}
        width={400}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, fontSize: 12 }}
          message={
            isAr
              ? 'يشمل الكشف حصرياً التسجيلات المصادق عليها عبر الشباك الموحد (AGENT_GU) خلال الشهر المحدد.'
              : 'Le relevé inclut exclusivement les immatriculations GU (AGENT_GU) validées au cours du mois sélectionné.'
          }
        />
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => genererMut.mutate(v)}
          initialValues={{ annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 }}
        >
          <Form.Item
            name="annee"
            label={isAr ? 'السنة' : 'Année'}
            rules={[{ required: true, message: isAr ? 'مطلوب' : 'Requis' }]}
          >
            <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="mois"
            label={isAr ? 'الشهر' : 'Mois'}
            rules={[{ required: true, message: isAr ? 'مطلوب' : 'Requis' }]}
          >
            <Select>
              {MOIS_FR.slice(1).map((m, i) => (
                <Select.Option key={i + 1} value={i + 1}>
                  {isAr ? MOIS_AR[i + 1] : m}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal : Confirmer finalisation */}
      <Modal
        open={!!confirmObj}
        title={<><LockOutlined style={{ color: '#0B6E3A' }} /> {isAr ? 'تجميد الكشف نهائياً' : 'Finaliser le relevé'}</>}
        onCancel={() => setConfirmObj(null)}
        onOk={() => confirmObj && finaliserMut.mutate(confirmObj.releve.id)}
        confirmLoading={finaliserMut.isPending}
        okText={isAr ? 'تأكيد التجميد' : 'Confirmer la finalisation'}
        okButtonProps={{ style: { background: '#0B6E3A', borderColor: '#0B6E3A' } }}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={
            isAr
              ? 'بعد التجميد، تصبح بيانات الكشف محددة قانونياً ولا يمكن تعديلها. هذه العملية لا رجعة فيها.'
              : 'Après finalisation, les données du relevé sont juridiquement figées et non modifiables. Opération irréversible.'
          }
        />
        {confirmObj && confirmObj.releve && (
          <p style={{ marginBottom: 0 }}>
            <b>{isAr ? 'الفترة :' : 'Période :'}</b>{' '}
            {isAr ? MOIS_AR[confirmObj.releve.mois] : MOIS_FR[confirmObj.releve.mois]}{' '}
            {confirmObj.releve.annee}
            {' — '}
            <b>{confirmObj.releve.nb_total}</b>{' '}
            {isAr ? 'تسجيل' : 'immatriculation(s)'}
            {' (PH: '}{confirmObj.releve.nb_ph}
            {', PM: '}{confirmObj.releve.nb_pm}
            {', SC: '}{confirmObj.releve.nb_sc}{')'}
          </p>
        )}
      </Modal>
    </div>
  );
};

export default ListeRelevesGU;
