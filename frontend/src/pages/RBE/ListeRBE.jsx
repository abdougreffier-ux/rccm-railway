import React, { useState } from 'react';
import {
  Table, Typography, Tag, Input, Select, Space, Button,
  Tooltip, Badge, Tabs, message, Alert,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, SendOutlined, CheckCircleOutlined,
  BankOutlined, ShopOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { rbeAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_ATTENTE:  'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  MODIFIE:     'cyan',
  RADIE:       'error',
};

const TYPE_ENTITE_COLOR = {
  SOCIETE:                'blue',
  SUCCURSALE:             'geekblue',
  ASSOCIATION:            'purple',
  ONG:                    'volcano',
  FONDATION:              'gold',
  FIDUCIE:                'orange',
  CONSTRUCTION_JURIDIQUE: 'orange',
};

const TYPE_DECLARATION_COLOR = {
  INITIALE:     'green',
  MODIFICATION: 'cyan',
  RADIATION:    'red',
};

const MODE_DECL_COLOR = {
  IMMEDIATE: 'success',
  DIFFEREE:  'warning',
};

const ListeRBE = () => {
  const [search,     setSearch]     = useState('');
  const [statut,     setStatut]     = useState('');
  const [typeEntite, setTypeEntite] = useState('');
  const [typeDecl,   setTypeDecl]   = useState('');
  const [source,     setSource]     = useState('');   // RC | HORS_RC | ''
  const [page,       setPage]       = useState(1);
  const [activeTab,  setActiveTab]  = useState('aTraiter');

  const queryClient = useQueryClient();
  const navigate    = useNavigate();
  const { t, isAr } = useLanguage();
  const { user, hasRole } = useAuth();
  const isGreffier        = hasRole('GREFFIER');

  // ── Toutes les déclarations ────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['rbe', page, search, statut, typeEntite, typeDecl, source],
    queryFn: () => rbeAPI.list({
      page,
      search:           search     || undefined,
      statut:           statut     || undefined,
      type_entite:      typeEntite || undefined,
      type_declaration: typeDecl   || undefined,
      source_entite:    source     || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
    enabled: activeTab === 'toutes',
  });

  // ── À traiter (EN_ATTENTE + RETOURNE) ────────────────────────────────────
  const { data: dataATraiter, isLoading: loadingATraiter } = useQuery({
    queryKey: ['rbe-atraiter', source],
    queryFn: () => Promise.all([
      rbeAPI.list({ statut: 'EN_ATTENTE', page: 1, page_size: 200, source_entite: source || undefined }).then(r => r.data),
      rbeAPI.list({ statut: 'RETOURNE',   page: 1, page_size: 200, source_entite: source || undefined }).then(r => r.data),
    ]).then(([enAttente, retourne]) => ({
      results: [...(enAttente.results || []), ...(retourne.results || [])],
      count:   (enAttente.count || 0) + (retourne.count || 0),
    })),
    keepPreviousData: true,
  });

  // ── En retard (DIFFEREE + date_limite dépassée) ───────────────────────────
  const { data: dataEnRetard } = useQuery({
    queryKey: ['rbe-retard', source],
    queryFn: () => rbeAPI.list({
      en_retard:     '1',
      page: 1, page_size: 200,
      source_entite: source || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  // ── Envoyer au greffe ──────────────────────────────────────────────────────
  const envoyerMut = useMutation({
    mutationFn: (id) => rbeAPI.envoyer(id),
    onSuccess: () => {
      message.success(t('msg.dossiereEnvoye'));
      queryClient.invalidateQueries({ queryKey: ['rbe'] });
      queryClient.invalidateQueries({ queryKey: ['rbe-atraiter'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Valider ────────────────────────────────────────────────────────────────
  const validerMut = useMutation({
    mutationFn: (id) => rbeAPI.valider(id),
    onSuccess: () => {
      message.success(t('msg.saved'));
      queryClient.invalidateQueries({ queryKey: ['rbe'] });
      queryClient.invalidateQueries({ queryKey: ['rbe-atraiter'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const STATUT_LABELS = {
    BROUILLON:   t('status.brouillon')   || 'Brouillon',
    EN_ATTENTE:  t('status.enAttente')   || 'En attente',
    RETOURNE:    t('status.retourne')    || 'Retourné',
    VALIDE:      t('status.valide')      || 'Validé',
    MODIFIE:     t('status.modifie')     || 'Modifié',
    RADIE:       t('status.radie')       || 'Radié',
  };

  const TYPE_ENTITE_OPTIONS = [
    { value: 'SOCIETE',      label: 'Société commerciale' },
    { value: 'SUCCURSALE',   label: 'Succursale étrangère' },
    { value: 'ASSOCIATION',  label: 'Association' },
    { value: 'ONG',          label: 'ONG' },
    { value: 'FONDATION',    label: 'Fondation' },
    { value: 'FIDUCIE',      label: 'Fiducie / Construction juridique' },
  ];

  // ── Colonnes ───────────────────────────────────────────────────────────────
  const buildColumns = () => [
    {
      title:     t('rbe.numero') || 'N° RBE',
      dataIndex: 'numero_rbe',
      key:       'numero',
      width:     160,
      render:    (v, r) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/registres/rbe/${r.id}`)}>
          <strong>{v}</strong>
        </Button>
      ),
    },
    {
      title:     isAr ? 'المصدر' : 'Source',
      dataIndex: 'source_entite',
      key:       'source',
      width:     90,
      render:    v => v === 'RC'
        ? <Tag color="blue" icon={<BankOutlined />}>RC</Tag>
        : v === 'HORS_RC'
        ? <Tag color="purple" icon={<ShopOutlined />}>Hors RC</Tag>
        : <Tag color="default">—</Tag>,
    },
    {
      title:     t('rbe.typeEntite') || 'Type',
      dataIndex: 'type_entite',
      key:       'type_entite',
      width:     155,
      render:    v => {
        const opt = TYPE_ENTITE_OPTIONS.find(o => o.value === v);
        return <Tag color={TYPE_ENTITE_COLOR[v] || 'default'}>{opt?.label || v}</Tag>;
      },
    },
    {
      title:     t('rbe.denomination') || 'Dénomination',
      dataIndex: 'denomination',
      key:       'denom',
      ellipsis:  true,
      render:    (v, r) => (
        <a onClick={() => navigate(`/registres/rbe/${r.id}`)}>
          {v || r.entite_denomination || '—'}
        </a>
      ),
    },
    {
      title:     t('rbe.typeDeclaration') || 'Type décl.',
      dataIndex: 'type_declaration',
      key:       'type_decl',
      width:     130,
      render:    v => (
        <Tag color={TYPE_DECLARATION_COLOR[v] || 'default'}>{v}</Tag>
      ),
    },
    {
      title:     isAr ? 'نمط الإقرار' : 'Mode décl.',
      dataIndex: 'mode_declaration',
      key:       'mode_decl',
      width:     130,
      render:    v => v ? (
        <Tag color={MODE_DECL_COLOR[v] || 'default'} style={{ fontSize: 11 }}>
          {v === 'IMMEDIATE' ? 'Immédiat' : 'Différé 15j'}
        </Tag>
      ) : null,
    },
    {
      title:     isAr ? 'الموعد النهائي' : 'Date limite',
      dataIndex: 'date_limite',
      key:       'date_limite',
      width:     110,
      render:    (v) => {
        if (!v) return '—';
        const today = new Date().toISOString().slice(0, 10);
        const isLate = v < today;
        return <span style={{ color: isLate ? '#cf1322' : undefined }}>{v}</span>;
      },
    },
    {
      title:     t('field.statut') || 'Statut',
      dataIndex: 'statut',
      key:       'statut',
      width:     130,
      render:    v => <Tag color={STATUT_COLOR[v]}>{STATUT_LABELS[v] || v}</Tag>,
    },
    {
      title:     t('field.date') || 'Date',
      dataIndex: 'date_declaration',
      key:       'date',
      width:     110,
    },
    {
      title:     t('field.actions') || 'Actions',
      key:       'actions',
      width:     110,
      fixed:     'right',
      render:    (_, r) => (
        <Space>
          <Tooltip title={t('common.view')}>
            <Button size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/registres/rbe/${r.id}`)} />
          </Tooltip>
          {/* Envoyer — agents uniquement, BROUILLON ou RETOURNE */}
          {!isGreffier && (r.statut === 'BROUILLON' || r.statut === 'RETOURNE') && (
            <Tooltip title={t('rbe.envoyer') || 'Envoyer'}>
              <Button size="small" icon={<SendOutlined />}
                loading={envoyerMut.isPending}
                onClick={() => envoyerMut.mutate(r.id)} />
            </Tooltip>
          )}
          {r.statut === 'EN_ATTENTE' && isGreffier && (
            <Tooltip title={t('common.validate')}>
              <Button size="small" icon={<CheckCircleOutlined />}
                style={{ color: '#2e7d32', borderColor: '#2e7d32' }}
                loading={validerMut.isPending}
                onClick={() => validerMut.mutate(r.id)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const rowClassName = (record) => {
    if (record.statut === 'RETOURNE')   return 'row-warning';
    if (record.statut === 'EN_ATTENTE') return 'row-processing';
    return '';
  };

  // ── Filtres communs ────────────────────────────────────────────────────────
  const FilterBar = ({ showSource = true }) => (
    <Space style={{ marginBottom: 16 }} wrap>
      <Input.Search
        placeholder={isAr ? 'رقم، تسمية…' : 'N° RBE, dénomination…'}
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: 260 }}
        allowClear
      />
      {showSource && (
        <Select
          placeholder={isAr ? 'المصدر' : 'Source'}
          value={source || undefined}
          onChange={v => { setSource(v || ''); setPage(1); }}
          allowClear style={{ width: 150 }}
          options={[
            { value: 'RC',      label: <><BankOutlined /> Entités RC</> },
            { value: 'HORS_RC', label: <><ShopOutlined /> Hors RC</> },
          ]}
        />
      )}
      <Select
        placeholder={t('rbe.typeEntite') || 'Type entité'}
        value={typeEntite || undefined}
        onChange={v => { setTypeEntite(v || ''); setPage(1); }}
        allowClear style={{ width: 200 }}
        options={TYPE_ENTITE_OPTIONS}
      />
      <Select
        placeholder={t('field.statut') || 'Statut'}
        value={statut || undefined}
        onChange={v => { setStatut(v || ''); setPage(1); }}
        allowClear style={{ width: 150 }}
        options={[
          { value: 'BROUILLON',   label: t('status.brouillon')  || 'Brouillon' },
          { value: 'EN_ATTENTE',  label: t('status.enAttente')  || 'En attente' },
          { value: 'RETOURNE',    label: t('status.retourne')   || 'Retourné' },
          { value: 'VALIDE',      label: t('status.valide')     || 'Validé' },
          { value: 'MODIFIE',     label: t('status.modifie')    || 'Modifié' },
          { value: 'RADIE',       label: t('status.radie')      || 'Radié' },
        ]}
      />
      <Select
        placeholder={t('rbe.typeDeclaration') || 'Type décl.'}
        value={typeDecl || undefined}
        onChange={v => { setTypeDecl(v || ''); setPage(1); }}
        allowClear style={{ width: 160 }}
        options={[
          { value: 'INITIALE',     label: 'Initiale' },
          { value: 'MODIFICATION', label: 'Modification' },
          { value: 'RADIATION',    label: 'Radiation' },
        ]}
      />
    </Space>
  );

  const aTraiterCount = dataATraiter?.count || 0;
  const enRetardCount = dataEnRetard?.count || 0;

  const tabItems = [
    // ── Onglet À traiter ──────────────────────────────────────────────────────
    {
      key: 'aTraiter',
      label: (
        <Space>
          <ClockCircleOutlined />
          {isAr ? 'قيد المعالجة' : 'À traiter'}
          {aTraiterCount > 0 && (
            <Badge count={aTraiterCount} size="small"
              style={{ backgroundColor: '#fa8c16' }} />
          )}
        </Space>
      ),
      children: (
        <div>
          <FilterBar showSource />
          {aTraiterCount === 0 && !loadingATraiter ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message={isAr
                ? 'لا توجد ملفات في انتظار المعالجة.'
                : 'Aucun dossier en attente de traitement.'}
            />
          ) : (
            <Table
              dataSource={dataATraiter?.results || []}
              columns={buildColumns()}
              rowKey="id"
              loading={loadingATraiter}
              scroll={{ x: 1200 }}
              rowClassName={rowClassName}
              pagination={{
                pageSize: 20,
                total: aTraiterCount,
                showTotal: total => `${total} ${t('common.records') || 'enreg.'}`,
              }}
              size="small"
            />
          )}
        </div>
      ),
    },

    // ── Onglet En retard ──────────────────────────────────────────────────────
    {
      key: 'enRetard',
      label: (
        <Space>
          <WarningOutlined style={{ color: '#cf1322' }} />
          {isAr ? 'متأخرة' : 'En retard'}
          {enRetardCount > 0 && (
            <Badge count={enRetardCount} size="small"
              style={{ backgroundColor: '#cf1322' }} />
          )}
        </Space>
      ),
      children: (
        <div>
          <FilterBar showSource />
          {enRetardCount === 0 ? (
            <Alert
              type="success"
              showIcon
              message={isAr
                ? 'لا توجد ملفات متأخرة.'
                : 'Aucune déclaration en retard.'}
            />
          ) : (
            <>
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message={isAr
                  ? `${enRetardCount} إقرار(ات) تجاوزت الأجل`
                  : `${enRetardCount} déclaration(s) ont dépassé le délai de 15 jours.`}
              />
              <Table
                dataSource={dataEnRetard?.results || []}
                columns={buildColumns()}
                rowKey="id"
                scroll={{ x: 1200 }}
                size="small"
                pagination={{
                  pageSize: 20,
                  total: enRetardCount,
                  showTotal: total => `${total} ${t('common.records') || 'enreg.'}`,
                }}
              />
            </>
          )}
        </div>
      ),
    },

    // ── Onglet Toutes ─────────────────────────────────────────────────────────
    {
      key: 'toutes',
      label: isAr ? 'جميع الإقرارات' : 'Toutes les déclarations',
      children: (
        <div>
          <FilterBar showSource />
          <Table
            dataSource={data?.results || []}
            columns={buildColumns()}
            rowKey="id"
            loading={isLoading}
            scroll={{ x: 1200 }}
            rowClassName={rowClassName}
            pagination={{
              current:  page,
              pageSize: 20,
              total:    data?.count || 0,
              onChange: setPage,
              showTotal: total => `${total} ${t('common.records') || 'enreg.'}`,
            }}
            size="small"
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <style>{`
        .row-warning td    { background: #fffbe6 !important; }
        .row-processing td { background: #e6f4ff !important; }
      `}</style>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginBottom: 16, alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <Title level={4} style={{ margin: 0 }}>
          📋 {t('rbe.title') || 'Registre des Bénéficiaires Effectifs'}
        </Title>
        <Space>
          <Button
            icon={<PlusOutlined />}
            onClick={() => navigate('/registres/rbe/nouvelle?source=HORS_RC')}
          >
            {isAr ? 'إقرار — خارج السجل' : 'Nouvelle déclaration (hors RC)'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/registres/rbe/nouvelle')}
            style={{ background: '#1a4480' }}
          >
            {t('rbe.new') || 'Nouvelle déclaration (RC)'}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={k => { setActiveTab(k); setPage(1); }}
        items={tabItems}
      />
    </div>
  );
};

export default ListeRBE;
