/**
 * ListeReleves — Écran « Relevés mensuels vers le Registre Central »
 *
 * Accès : GREFFIER uniquement (garanti par <GreffierRoute> dans App.jsx).
 *
 * Fonctions disponibles :
 *   • Générer un relevé pour un mois/année donné
 *   • Finaliser (gel juridique du contenu)
 *   • Transmettre au Registre Central national
 *   • Consulter le détail
 *   • Consulter le journal des transmissions
 */
import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form,
  InputNumber, Select, Tooltip, Alert, Statistic, Row, Col, message,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, SendOutlined, EyeOutlined,
  HistoryOutlined, ReloadOutlined, LockOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { registreCentralAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

// ── Constantes ──────────────────────────────────────────────────────────────────
const MOIS_FR = [
  '', 'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const MOIS_AR = [
  '', 'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

const STATUT_COLOR = {
  BROUILLON: 'default',
  FINALISE:  'blue',
  TRANSMIS:  'orange',
  ACQUITTE:  'green',
  ERREUR:    'red',
  ANNULE:    'default',
};
const STATUT_LABEL = {
  BROUILLON: 'Brouillon',
  FINALISE:  'Finalisé',
  TRANSMIS:  'Transmis',
  ACQUITTE:  'Acquitté',
  ERREUR:    'Erreur',
  ANNULE:    'Annulé',
};

// ────────────────────────────────────────────────────────────────────────────────

const ListeReleves = () => {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { isAr }     = useLanguage();
  const [form]       = Form.useForm();
  const [modalOpen,  setModalOpen]  = useState(false);
  const [confirmObj, setConfirmObj] = useState(null); // { type, releve }

  // ── Données ─────────────────────────────────────────────────────────────────
  const { data: releves = [], isLoading, refetch } = useQuery({
    queryKey: ['registre-central-releves'],
    queryFn:  () => registreCentralAPI.list().then(r => r.data),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const genererMut = useMutation({
    mutationFn: (data) => registreCentralAPI.generer(data),
    onSuccess: (res) => {
      message.success(res.data.message || 'Relevé généré avec succès.');
      qc.invalidateQueries({ queryKey: ['registre-central-releves'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur lors de la génération.'),
  });

  const finaliserMut = useMutation({
    mutationFn: (id) => registreCentralAPI.finaliser(id),
    onSuccess: (res) => {
      message.success(res.data.message || 'Relevé finalisé.');
      qc.invalidateQueries({ queryKey: ['registre-central-releves'] });
      setConfirmObj(null);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur lors de la finalisation.'),
  });

  const transmettreM = useMutation({
    mutationFn: (id) => registreCentralAPI.transmettre(id),
    onSuccess: (res) => {
      const d = res.data;
      if (d.statut === 'SUCCES' || d.statut === 'ACQUITTE') {
        message.success(
          d.mode === 'sandbox'
            ? `Transmission simulée (sandbox). Référence : ${d.reference_centrale}`
            : `Transmis avec succès. Référence centrale : ${d.reference_centrale}`,
          5,
        );
      } else {
        message.warning(`Transmission terminée avec statut : ${d.statut}. ${d.erreur || ''}`, 6);
      }
      qc.invalidateQueries({ queryKey: ['registre-central-releves'] });
      setConfirmObj(null);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Erreur lors de la transmission.'),
  });

  // ── Colonnes ─────────────────────────────────────────────────────────────────
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
            {isAr ? `${r.annee}/${String(r.mois).padStart(2,'0')}` : `${r.annee}/${String(r.mois).padStart(2,'0')}`}
          </Text>
        </Space>
      ),
    },
    {
      title: isAr ? 'الأعمال' : 'Actes inclus',
      key: 'actes',
      render: (_, r) => (
        <Space wrap size={4}>
          {r.nb_immatriculations > 0 && (
            <Tag color="green">{r.nb_immatriculations} {isAr ? 'تسجيل' : 'Immat.'}</Tag>
          )}
          {r.nb_modifications > 0 && (
            <Tag color="blue">{r.nb_modifications} {isAr ? 'تعديل' : 'Modif.'}</Tag>
          )}
          {r.nb_cessions > 0 && (
            <Tag color="orange">{r.nb_cessions} {isAr ? 'تنازل' : 'Cess.'}</Tag>
          )}
          {r.nb_radiations > 0 && (
            <Tag color="red">{r.nb_radiations} {isAr ? 'شطب' : 'Rad.'}</Tag>
          )}
          {r.nb_actes_total === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>{isAr ? 'لا شيء' : 'Aucun acte'}</Text>
          )}
        </Space>
      ),
    },
    {
      title: isAr ? 'المجموع' : 'Total',
      dataIndex: 'nb_actes_total',
      align: 'center',
      render: (v) => <Text strong>{v}</Text>,
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
      dataIndex: 'genere_le',
      render: (v) => v ? new Date(v).toLocaleDateString('fr-DZ') : '—',
    },
    {
      title: isAr ? 'الإجراءات' : 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 260,
      render: (_, r) => (
        <Space wrap size={4}>
          {/* Consulter le détail */}
          <Tooltip title={isAr ? 'عرض التفاصيل' : 'Voir le détail'}>
            <Button
              size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/registre-central/${r.id}`)}
            >
              {isAr ? 'تفاصيل' : 'Détail'}
            </Button>
          </Tooltip>

          {/* Finaliser — seulement si BROUILLON */}
          {r.statut === 'BROUILLON' && (
            <Tooltip title={isAr ? 'تجميد المحتوى' : 'Geler le contenu (irréversible)'}>
              <Button
                size="small" icon={<LockOutlined />} type="primary" ghost
                onClick={() => setConfirmObj({ type: 'finaliser', releve: r })}
              >
                {isAr ? 'إتمام' : 'Finaliser'}
              </Button>
            </Tooltip>
          )}

          {/* Transmettre — seulement si FINALISE ou ERREUR */}
          {(r.statut === 'FINALISE' || r.statut === 'ERREUR') && (
            <Tooltip title={isAr ? 'إرسال للسجل المركزي' : 'Transmettre au Registre Central'}>
              <Button
                size="small" icon={<SendOutlined />} type="primary"
                style={{ background: '#1a4480' }}
                onClick={() => setConfirmObj({ type: 'transmettre', releve: r })}
              >
                {isAr ? 'إرسال' : 'Transmettre'}
              </Button>
            </Tooltip>
          )}

          {/* Journal des transmissions */}
          {r.nb_transmissions > 0 && (
            <Tooltip title={isAr ? 'سجل الإرسالات' : 'Journal des transmissions'}>
              <Button
                size="small" icon={<HistoryOutlined />}
                onClick={() => navigate(`/registre-central/${r.id}/transmissions`)}
              >
                {r.nb_transmissions}
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
      immat: acc.immat + r.nb_immatriculations,
      modif: acc.modif + r.nb_modifications,
      cess:  acc.cess  + r.nb_cessions,
      rad:   acc.rad   + r.nb_radiations,
    }),
    { immat: 0, modif: 0, cess: 0, rad: 0 },
  );

  return (
    <div style={{ padding: '0 4px' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#1a4480' }}>
            🏛️ {isAr ? 'الإرسالات الشهرية إلى السجل المركزي' : 'Relevés mensuels — Registre Central'}
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isAr
              ? 'الأعمال الموثقة المرسلة شهرياً إلى السجل المركزي الوطني'
              : 'Actes validés transmis mensuellement au Registre Central national'}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refetch}>
            {isAr ? 'تحديث' : 'Actualiser'}
          </Button>
          <Button
            type="primary" icon={<PlusOutlined />}
            style={{ background: '#1a4480' }}
            onClick={() => setModalOpen(true)}
          >
            {isAr ? 'توليد كشف' : 'Générer un relevé'}
          </Button>
        </Space>
      </div>

      {/* Statistiques globales */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: isAr ? 'تسجيلات' : 'Immatriculations', value: totaux.immat, color: '#52c41a' },
          { label: isAr ? 'تعديلات' : 'Modifications',    value: totaux.modif, color: '#1677ff' },
          { label: isAr ? 'تنازلات' : 'Cessions',         value: totaux.cess,  color: '#fa8c16' },
          { label: isAr ? 'شطبات' : 'Radiations',          value: totaux.rad,   color: '#ff4d4f' },
        ].map(({ label, value, color }) => (
          <Col xs={12} sm={6} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}` }}>
              <Statistic title={label} value={value} valueStyle={{ color, fontSize: 20 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Alerte mode sandbox */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={
          isAr
            ? 'وضع المحاكاة نشط — لم يتم ضبط عنوان السجل المركزي بعد. ستتم محاكاة الإرسالات تلقائياً.'
            : 'Mode sandbox actif — URL_REGISTRE_CENTRAL non configurée. Les transmissions seront simulées jusqu\'à configuration de l\'environnement de production.'
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
              ? 'لا توجد كشوف بعد — قم بتوليد كشف للبدء'
              : 'Aucun relevé — cliquez sur « Générer un relevé » pour commencer',
          }}
        />
      </Card>

      {/* Modal : Générer un relevé */}
      <Modal
        open={modalOpen}
        title={<><PlusOutlined /> {isAr ? 'توليد كشف شهري' : 'Générer un relevé mensuel'}</>}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={genererMut.isPending}
        okText={isAr ? 'توليد' : 'Générer'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        width={400}
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 16, fontSize: 12 }}
          message={
            isAr
              ? 'يشمل الكشف الأعمال المصادق عليها فقط من طرف كاتب العدل.'
              : 'Le relevé inclut uniquement les actes validés par le greffier.'
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
            <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="mois"
            label={isAr ? 'الشهر' : 'Mois'}
            rules={[{ required: true, message: isAr ? 'مطلوب' : 'Requis' }]}
          >
            <Select>
              {MOIS_FR.slice(1).map((m, i) => (
                <Select.Option key={i+1} value={i+1}>
                  {isAr ? MOIS_AR[i+1] : m}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Confirm : Finaliser */}
      <Modal
        open={confirmObj?.type === 'finaliser'}
        title={<><LockOutlined style={{ color: '#1677ff' }} /> {isAr ? 'تجميد الكشف' : 'Finaliser le relevé'}</>}
        onCancel={() => setConfirmObj(null)}
        onOk={() => finaliserMut.mutate(confirmObj.releve.id)}
        confirmLoading={finaliserMut.isPending}
        okText={isAr ? 'تأكيد التجميد' : 'Confirmer la finalisation'}
        okButtonProps={{ style: { background: '#1677ff' } }}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12, fontSize: 12 }}
          message={
            isAr
              ? 'بعد الإتمام، لن يمكن تعديل محتوى الكشف. هذه العملية لا رجعة فيها من الناحية القانونية.'
              : 'Après finalisation, le contenu du relevé est juridiquement figé. Cette opération est irréversible.'
          }
        />
        {confirmObj?.releve && (
          <p>
            <b>{isAr ? 'الفترة :' : 'Période :'}</b>{' '}
            {isAr ? MOIS_AR[confirmObj.releve.mois] : MOIS_FR[confirmObj.releve.mois]}{' '}
            {confirmObj.releve.annee}
            {' — '}<b>{confirmObj.releve.nb_actes_total}</b>{' '}
            {isAr ? 'عمل' : 'acte(s)'}
          </p>
        )}
      </Modal>

      {/* Confirm : Transmettre */}
      <Modal
        open={confirmObj?.type === 'transmettre'}
        title={<><SendOutlined style={{ color: '#1a4480' }} /> {isAr ? 'الإرسال إلى السجل المركزي' : 'Transmettre au Registre Central'}</>}
        onCancel={() => setConfirmObj(null)}
        onOk={() => transmettreM.mutate(confirmObj.releve.id)}
        confirmLoading={transmettreM.isPending}
        okText={isAr ? 'إرسال' : 'Transmettre'}
        okButtonProps={{ style: { background: '#1a4480' } }}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
      >
        {confirmObj?.releve && (
          <>
            <p>
              {isAr ? 'سيتم إرسال كشف الفترة' : 'Le relevé de la période'}{' '}
              <b>
                {isAr ? MOIS_AR[confirmObj.releve.mois] : MOIS_FR[confirmObj.releve.mois]}{' '}
                {confirmObj.releve.annee}
              </b>{' '}
              ({isAr ? 'يحتوي على' : 'contenant'}{' '}
              <b>{confirmObj.releve.nb_actes_total}</b>{' '}
              {isAr ? 'عمل' : 'acte(s)'}){' '}
              {isAr ? 'إلى السجل المركزي الوطني.' : 'au Registre Central national.'}
            </p>
            {confirmObj.releve.nb_transmissions > 0 && (
              <Alert
                type="info" showIcon style={{ fontSize: 12 }}
                message={
                  isAr
                    ? `هذا هو الإرسال رقم ${confirmObj.releve.nb_transmissions + 1}`
                    : `Il s'agit de la tentative n° ${confirmObj.releve.nb_transmissions + 1}`
                }
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default ListeReleves;
