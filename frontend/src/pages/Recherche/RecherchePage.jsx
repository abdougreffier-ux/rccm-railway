import React, { useState } from 'react';
import {
  Form, Input, Select, DatePicker, Button, Table, Tag, Typography,
  Card, Space, Row, Col, Collapse, Tabs, Alert, Tooltip, Badge,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, EyeOutlined, FilterOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rechercheAPI, parametrageAPI } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

// ── Couleurs des statuts ──────────────────────────────────────────────────────

const STATUT_RA_COLOR = {
  BROUILLON:              'default',
  EN_INSTANCE_VALIDATION: 'processing',
  RETOURNE:               'warning',
  EN_COURS:               'cyan',
  IMMATRICULE:            'success',
  RADIE:                  'error',
  SUSPENDU:               'orange',
  ANNULE:                 'default',
};

const STATUT_RC_COLOR = {
  EN_INSTANCE: 'processing',
  VALIDE:      'success',
  REJETE:      'error',
  ANNULE:      'default',
};

const TYPE_COLOR = { PH: 'blue', PM: 'purple', SC: 'geekblue' };

// ── Composant principal ───────────────────────────────────────────────────────

const RecherchePage = () => {
  const [form]              = Form.useForm();
  const [results, setResults]     = useState(null);   // null = pas encore lancé
  const [searching, setSearching] = useState(false);
  const [page, setPage]           = useState(1);
  const [lastParams, setLastParams] = useState({});
  const [certNom, setCertNom]     = useState('');
  const [certResult, setCertResult] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const navigate    = useNavigate();
  const { t, isAr } = useLanguage();

  // ── Nationalités pour le sélecteur ───────────────────────────────────────
  const { data: natData } = useQuery({
    queryKey: ['nationalites-search'],
    queryFn:  () => parametrageAPI.nationalites({ page_size: 500 }).then(r => r.data),
  });
  const nationalites = natData?.results ?? natData ?? [];

  // ── Lancement de la recherche ─────────────────────────────────────────────
  const doSearch = async (params) => {
    setSearching(true);
    try {
      const resp = await rechercheAPI.avancee(params).then(r => r.data);
      setResults(resp);
      setPage(params.page || 1);
    } catch (e) {
      console.error('Recherche avancée :', e);
      setResults({ count: 0, results: [], error: true });
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (currentPage = 1) => {
    const values = form.getFieldsValue();
    const params = {};

    Object.entries(values).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      // DatePicker renvoie un objet dayjs
      if (v && typeof v === 'object' && typeof v.format === 'function') {
        params[k] = v.format('YYYY-MM-DD');
      } else {
        params[k] = v;
      }
    });

    params.page      = currentPage;
    params.page_size = 20;
    setLastParams(params);
    await doSearch(params);
  };

  const handleReset = () => {
    form.resetFields();
    setResults(null);
    setPage(1);
    setLastParams({});
  };

  const handlePageChange = (p) => {
    const params = { ...lastParams, page: p };
    setLastParams(params);
    doSearch(params);
  };

  // ── Certificat négatif ────────────────────────────────────────────────────
  const checkCertificat = async () => {
    if (!certNom.trim()) return;
    setCertLoading(true);
    try {
      const resp = await rechercheAPI.certificatNegatif(certNom).then(r => r.data);
      setCertResult(resp);
    } catch {}
    setCertLoading(false);
  };

  // ── Options des selects ───────────────────────────────────────────────────
  const STATUT_RA_OPTIONS = [
    { value: 'BROUILLON',              label: t('status.brouillon') },
    { value: 'EN_INSTANCE_VALIDATION', label: t('status.enInstance') },
    { value: 'RETOURNE',               label: t('status.retourne') },
    { value: 'IMMATRICULE',            label: t('status.immatricule') },
    { value: 'RADIE',                  label: t('status.radie') },
    { value: 'ANNULE',                 label: t('status.annule') },
  ];

  const STATUT_RC_OPTIONS = [
    { value: 'EN_INSTANCE', label: t('status.enInstance2') },
    { value: 'VALIDE',      label: t('status.valide') },
    { value: 'REJETE',      label: t('status.rejete') },
    { value: 'ANNULE',      label: t('status.annule') },
  ];

  const TYPE_OPTIONS = [
    { value: 'PH', label: t('entity.ph') },
    { value: 'PM', label: t('entity.pm') },
    { value: 'SC', label: t('entity.sc') },
  ];

  const REGISTRE_OPTIONS = [
    { value: 'both', label: isAr ? 'الكل (RC + RA)'            : 'Les deux registres (RC + RA)' },
    { value: 'ra',   label: isAr ? 'السجل التحليلي فقط'         : 'Registre analytique uniquement' },
    { value: 'rc',   label: isAr ? 'السجل الكرنولوجي فقط'        : 'Registre chronologique uniquement' },
  ];

  // ── Colonnes du tableau de résultats ─────────────────────────────────────
  const columns = [
    {
      title:     t('field.numeroRA'),
      dataIndex: 'numero_ra',
      key:       'numero_ra',
      width:     130,
      sorter:    (a, b) => (a.numero_ra || '').localeCompare(b.numero_ra || ''),
      render:    (v, r) => (
        <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id_ra}`); }}>
          <strong style={{ color: '#1a4480' }}>{v}</strong>
        </a>
      ),
    },
    {
      title:     t('rc.numero'),
      dataIndex: 'numero_chrono',
      key:       'numero_chrono',
      width:     150,
      render:    (v, r) => v ? (
        <a onClick={e => { e.stopPropagation(); navigate(`/registres/chronologique/${r.id_rc}`); }}>
          {fmtChrono(v)}
        </a>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title:    t('field.denomination'),
      dataIndex:'denomination',
      key:      'denomination',
      ellipsis: true,
      sorter:   (a, b) => (a.denomination || '').localeCompare(b.denomination || ''),
      render:   (v, r) => (
        <div>
          <span>{v || '—'}</span>
          {r.denomination_ar && (
            <div className="rtl" style={{ color: '#888', fontSize: 12 }}>{r.denomination_ar}</div>
          )}
        </div>
      ),
    },
    {
      title:     t('field.type'),
      dataIndex: 'type_entite',
      key:       'type_entite',
      width:     70,
      render:    v => <Tag color={TYPE_COLOR[v] || 'default'}>{t(`entity.${v}`) || v}</Tag>,
    },
    {
      title:  t('search.col_statut_rc'),
      key:    'statut_rc',
      width:  155,
      render: (_, r) => r.statut_rc ? (
        <Tag color={STATUT_RC_COLOR[r.statut_rc] || 'default'}>
          {r.statut_rc_label || r.statut_rc}
        </Tag>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title:  t('search.col_statut_ra'),
      key:    'statut_ra',
      width:  185,
      render: (_, r) => (
        <Tag color={STATUT_RA_COLOR[r.statut_ra] || 'default'}>
          {r.statut_ra_label || r.statut_ra}
        </Tag>
      ),
    },
    {
      title:  t('field.greffe'),
      key:    'localite',
      width:  120,
      render: (_, r) => (isAr && r.localite_ar) ? r.localite_ar : (r.localite || '—'),
    },
    {
      title:  t('search.col_date'),
      key:    'date',
      width:  110,
      sorter: (a, b) => (a.date_immatriculation || a.date_acte || '').localeCompare(
                         b.date_immatriculation || b.date_acte || ''),
      render: (_, r) => r.date_immatriculation || r.date_acte || '—',
    },
    {
      title:  t('field.actions'),
      key:    'actions',
      width:  90,
      fixed:  'right',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={t('search.voir_ra')}>
            <Button
              size="small" type="primary" ghost icon={<EyeOutlined />}
              onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id_ra}`); }}
            />
          </Tooltip>
          {r.id_rc && (
            <Tooltip title={t('search.voir_rc')}>
              <Button
                size="small" icon={<ArrowRightOutlined />}
                onClick={e => { e.stopPropagation(); navigate(`/registres/chronologique/${r.id_rc}`); }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // ── Onglet Recherche avancée ──────────────────────────────────────────────
  const rechercheTab = (
    <div>
      <Form form={form} layout="vertical" onFinish={() => handleSearch(1)}>

        {/* Barre de recherche globale */}
        <Card size="small" style={{ marginBottom: 12 }}>
          <Row gutter={12} align="middle" wrap={false}>
            <Col flex="auto">
              <Form.Item name="q" style={{ margin: 0 }}>
                <Input
                  size="large"
                  prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                  placeholder={t('search.placeholder')}
                  allowClear
                  onPressEnter={() => handleSearch(1)}
                />
              </Form.Item>
            </Col>
            <Col>
              <Space>
                <Button
                  size="large" type="primary" icon={<SearchOutlined />}
                  loading={searching}
                  onClick={() => handleSearch(1)}
                  style={{ background: '#1a4480' }}>
                  {t('common.search')}
                </Button>
                <Button size="large" icon={<ReloadOutlined />} onClick={handleReset}>
                  {t('search.reset')}
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Critères avancés (repliables) */}
        <Collapse
          size="small"
          style={{ marginBottom: 16 }}
          defaultActiveKey={['advanced']}
          items={[{
            key:         'advanced',
            forceRender: true,   /* toujours monter les Form.Item même panel fermé */
            label: <Space><FilterOutlined /><span>{t('search.advanced')}</span></Space>,
            children: (
              <Row gutter={[16, 4]}>

                {/* Identifiants */}
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="numero_ra" label={t('search.num_ra')}>
                    <Input placeholder="000001" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="numero_chrono" label={t('search.num_chrono')}>
                    <Input placeholder="RC2024000001" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="denomination" label={t('search.denomination')}>
                    <Input placeholder={t('search.denomination')} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="nom_prenom" label={t('search.nom_prenom')}>
                    <Input placeholder={t('search.nom_prenom')} allowClear />
                  </Form.Item>
                </Col>

                {/* Identité */}
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="nni" label={t('search.nni')}>
                    <Input placeholder="NNI" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="num_passeport" label={t('search.passeport')}>
                    <Input placeholder={t('search.passeport')} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="nationalite_id" label={t('search.nationalite')}>
                    <Select
                      placeholder={t('search.nationalite')}
                      allowClear showSearch
                      filterOption={(input, opt) =>
                        (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={nationalites.map(n => ({
                        value: n.id,
                        label: isAr ? (n.libelle_ar || n.libelle_fr) : n.libelle_fr,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="activite" label={t('search.activite')}>
                    <Input placeholder={t('search.activite')} allowClear />
                  </Form.Item>
                </Col>

                {/* Localisation & personnes */}
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="adresse" label={t('search.adresse')}>
                    <Input placeholder={t('search.adresse')} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="gerant" label={t('search.gerant')}>
                    <Input placeholder={t('search.gerant')} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="associe" label={t('search.associe')}>
                    <Input placeholder={t('search.associe')} allowClear />
                  </Form.Item>
                </Col>

                {/* Filtres type / statuts / registre */}
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="type_entite" label={t('search.type_entite')}>
                    <Select placeholder={t('search.type_entite')} allowClear options={TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="statut_ra" label={t('search.col_statut_ra')}>
                    <Select placeholder={t('search.col_statut_ra')} allowClear options={STATUT_RA_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="statut_rc" label={t('search.col_statut_rc')}>
                    <Select placeholder={t('search.col_statut_rc')} allowClear options={STATUT_RC_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="registre" label={t('search.registre')} initialValue="both">
                    <Select options={REGISTRE_OPTIONS} />
                  </Form.Item>
                </Col>

                {/* Plages de dates */}
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="date_immat_from" label={t('search.date_immat_from')}>
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="date_immat_to" label={t('search.date_immat_to')}>
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="date_enreg_from" label={t('search.date_enreg_from')}>
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item name="date_enreg_to" label={t('search.date_enreg_to')}>
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>

              </Row>
            ),
          }]}
        />
      </Form>

      {/* Zone de résultats */}
      {results !== null && (
        <Card
          size="small"
          title={
            <Space>
              <Badge
                count={results.count}
                showZero
                style={{ backgroundColor: results.count > 0 ? '#1a4480' : '#aaa' }}
              />
              <Text>{isAr ? 'نتيجة' : 'résultat(s)'}</Text>
            </Space>
          }
          style={{ marginTop: 4 }}
        >
          {results.error && (
            <Alert type="error" showIcon message={t('msg.error')} />
          )}

          {!results.error && results.count === 0 && (
            <Alert
              type="info"
              showIcon
              message={
                results.message
                  ? (isAr ? 'يرجى إدخال معيار بحث واحد على الأقل.' : results.message)
                  : (isAr ? 'لا توجد نتائج لمعايير البحث المحددة.' : 'Aucun résultat pour ces critères.')
              }
            />
          )}

          {!results.error && results.count > 0 && (
            <Table
              dataSource={results.results}
              columns={columns}
              rowKey={r => `${r.id_ra}-${r.id_rc ?? 0}`}
              size="small"
              scroll={{ x: 1150 }}
              loading={searching}
              pagination={{
                current:        page,
                pageSize:       20,
                total:          results.count,
                onChange:       handlePageChange,
                showTotal:      total => `${total} ${isAr ? 'نتيجة' : 'résultat(s)'}`,
                showSizeChanger: false,
              }}
              onRow={r => ({
                style:   { cursor: 'pointer' },
                onClick: () => navigate(`/registres/analytique/${r.id_ra}`),
              })}
            />
          )}
        </Card>
      )}
    </div>
  );

  // ── Onglet Certificat négatif ─────────────────────────────────────────────
  const certificatTab = (
    <Card style={{ maxWidth: 600 }}>
      <Typography.Paragraph>
        {isAr
          ? 'تحقق من توفر التسمية التجارية قبل تأسيس شركة أو مؤسسة.'
          : 'Vérifiez si une dénomination commerciale est disponible avant de constituer une société.'}
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder={isAr ? 'التسمية للتحقق منها…' : 'Dénomination à vérifier...'}
          value={certNom}
          onChange={e => { setCertNom(e.target.value); setCertResult(null); }}
          onPressEnter={checkCertificat}
        />
        <Button
          type="primary" loading={certLoading}
          onClick={checkCertificat}
          disabled={!certNom.trim()}
          style={{ background: '#1a4480' }}>
          {isAr ? 'تحقق' : 'Vérifier'}
        </Button>
      </Space.Compact>

      {certResult && (
        <Alert
          message={certResult.message}
          type={certResult.disponible ? 'success' : 'error'}
          showIcon
          description={certResult.disponible
            ? (isAr ? 'يمكنك استخدام هذه التسمية.' : 'Vous pouvez utiliser cette dénomination.')
            : (isAr ? 'التسمية مستعملة. اختر تسمية أخرى.' : 'Dénomination déjà utilisée. Choisissez-en une autre.')}
        />
      )}
    </Card>
  );

  const tabItems = [
    {
      key:      'avancee',
      label:    `🔍 ${isAr ? 'البحث المتقدم' : 'Recherche avancée'}`,
      children: rechercheTab,
    },
    {
      key:      'certificat',
      label:    `📜 ${isAr ? 'شهادة عدم التسجيل' : 'Certificat Négatif'}`,
      children: certificatTab,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>{t('search.title')}</Title>
      <Tabs items={tabItems} />
    </div>
  );
};

export default RecherchePage;
