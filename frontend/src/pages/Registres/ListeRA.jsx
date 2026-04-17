import React, { useState } from 'react';
import {
  Table, Button, Space, Input, Select, Tag, Typography,
  Tooltip, message, Popconfirm, Alert, Tabs, Badge, Modal,
} from 'antd';
import {
  EyeOutlined, FilePdfOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { registreAPI, rapportAPI, openPDF, parametrageAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

// ── Couleurs des statuts ──────────────────────────────────────────────────────
const STATUT_TAG = {
  BROUILLON:              { color: 'default',    tKey: 'status.brouillon' },
  EN_INSTANCE_VALIDATION: { color: 'processing', tKey: 'status.enInstance' },
  RETOURNE:               { color: 'warning',    tKey: 'status.retourne' },
  EN_COURS:               { color: 'cyan',       tKey: 'status.enCours' },
  IMMATRICULE:            { color: 'success',    tKey: 'status.immatricule' },
  RADIE:                  { color: 'error',      tKey: 'status.radie' },
  SUSPENDU:               { color: 'orange',     tKey: 'status.suspendu' },
  ANNULE:                 { color: 'default',    tKey: 'status.annule' },
};

// ── Composant ─────────────────────────────────────────────────────────────────
const ListeRA = () => {
  const [search,          setSearch]          = useState('');
  const [statut,          setStatut]          = useState('');
  const [type,            setType]            = useState('');
  const [formeJuridique,  setFormeJuridique]  = useState('');
  const [statutBe,        setStatutBe]        = useState('');
  const [page,            setPage]            = useState(1);
  const [immatPage,       setImmatPage]       = useState(1);
  const [activeTab,       setActiveTab]       = useState('pending');  // 'pending' | 'all' | 'immatricules'

  const [retourModal,  setRetourModal]  = useState(false);
  const [retourTarget, setRetourTarget] = useState(null);   // { id }
  const [retourObs,    setRetourObs]    = useState('');

  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t, isAr, field } = useLanguage();
  const { hasRole } = useAuth();
  const isGreffier  = hasRole('GREFFIER');

  // ── Onglet "À traiter" : EN_INSTANCE_VALIDATION + RETOURNE ───────────────
  const { data: instData, isLoading: instLoading, isError: instError } = useQuery({
    queryKey: ['ra', 'instance', search, type, formeJuridique],
    queryFn:  () => registreAPI.listRA({
      statut:          'EN_INSTANCE_VALIDATION',
      search:          search        || undefined,
      type_entite:     type          || undefined,
      forme_juridique: formeJuridique || undefined,
      page_size:       200,
    }).then(r => r.data),
    keepPreviousData: true,
    retry: 1,
  });

  const { data: retData, isError: retError } = useQuery({
    queryKey: ['ra', 'retourne', search, type, formeJuridique],
    queryFn:  () => registreAPI.listRA({
      statut:          'RETOURNE',
      search:          search        || undefined,
      type_entite:     type          || undefined,
      forme_juridique: formeJuridique || undefined,
      page_size:       200,
    }).then(r => r.data),
    keepPreviousData: true,
    retry: 1,
  });

  const pendingResults = [
    ...(instData?.results  || []),
    ...(retData?.results   || []),
  ];
  const pendingCount = (instData?.count || 0) + (retData?.count || 0);
  const pendingApiError = instError || retError;

  // ── Onglet "Immatriculés" ─────────────────────────────────────────────────
  const { data: immatData, isLoading: immatLoading, isError: immatError } = useQuery({
    queryKey: ['ra', 'immatricules', immatPage, search, type, formeJuridique, statutBe],
    queryFn:  () => registreAPI.listRA({
      statut:          'IMMATRICULE',
      page:            immatPage,
      search:          search        || undefined,
      type_entite:     type          || undefined,
      forme_juridique: formeJuridique || undefined,
      statut_be:       statutBe      || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
    enabled: activeTab === 'immatricules',
    retry: 1,
  });

  // ── Onglet "Tous les dossiers" ────────────────────────────────────────────
  const { data: allData, isLoading: allLoading, isError: allError } = useQuery({
    queryKey: ['ra', 'all', page, search, statut, type, formeJuridique, statutBe],
    queryFn:  () => registreAPI.listRA({
      page,
      search:          search        || undefined,
      statut:          statut        || undefined,
      type_entite:     type          || undefined,
      forme_juridique: formeJuridique || undefined,
      statut_be:       statutBe      || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
    enabled: activeTab === 'all',
    retry: 1,
  });

  // ── Formes juridiques (pour filtre) ──────────────────────────────────────
  const { data: formesJuridiques = [] } = useQuery({
    queryKey: ['formes-juridiques'],
    queryFn:  () => parametrageAPI.formesJuridiques({ actif: true, page_size: 200 })
                      .then(r => r.data?.results || r.data || []),
    staleTime: 10 * 60 * 1000,
  });

  // Options filtrées selon le type d'entité sélectionné
  const formeJuridiquesOptions = formesJuridiques
    .filter(fj => !type || fj.type_entite === type || fj.type_entite === 'ALL')
    .map(fj => ({
      value: fj.code,
      label: isAr ? (fj.libelle_ar || fj.libelle_fr) : fj.libelle_fr,
    }));

  // ── Valider (greffier) ────────────────────────────────────────────────────
  const validerMut = useMutation({
    mutationFn: (id) => registreAPI.validerRA(id),
    onSuccess:  () => {
      message.success(t('msg.dossierValide'));
      queryClient.invalidateQueries({ queryKey: ['ra'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Retourner à l'agent (greffier) ────────────────────────────────────────
  const retournerMut = useMutation({
    mutationFn: ({ id, obs }) => registreAPI.retournerRA(id, { observations_greffier: obs }),
    onSuccess:  () => {
      message.success(t('msg.dossierRetourne'));
      queryClient.invalidateQueries({ queryKey: ['ra'] });
      setRetourModal(false);
      setRetourObs('');
      setRetourTarget(null);
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columns = [
    {
      title:     t('field.numeroChrono'),
      dataIndex: 'numero_chrono',
      key:       'numero_chrono',
      width:     100,
      render:    (v, r) => v
        ? <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
            <strong style={{ color: '#555' }}>{v}</strong>
          </a>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title:     t('field.numeroRA'),
      dataIndex: 'numero_ra',
      key:       'numero_ra',
      width:     130,
      render:    (v, r) => v
        ? <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
            <strong style={{ color: '#1a4480' }}>{v}</strong>
          </a>
        : <Tag color="default" style={{ fontSize: 11, color: '#aaa' }}>{t('status.nonAttribue')}</Tag>,
    },
    {
      title:  t('field.type'),
      dataIndex: 'type_entite',
      key:    'type',
      width:  70,
      render: v => {
        const colors = { PH: 'blue', PM: 'purple', SC: 'geekblue' };
        return <Tag color={colors[v] || 'default'}>{t(`entity.${v}`) || v}</Tag>;
      },
    },
    {
      title:     t('field.denomination'),
      dataIndex: 'denomination',
      key:       'denom',
      ellipsis:  true,
      render:    (v, r) => {
        const fjLabel = isAr
          ? (r.forme_juridique_libelle_ar || r.forme_juridique_libelle || r.forme_juridique_code)
          : (r.forme_juridique_libelle || r.forme_juridique_code);
        return (
          <div>
            <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
              {field(r, 'denomination') || '—'}
            </a>
            {fjLabel && (
              <Tag color="cyan" style={{ marginLeft: 6, fontSize: 11 }}>{fjLabel}</Tag>
            )}
            {r.created_by_nom && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {r.created_by_nom}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title:  t('field.statut'),
      dataIndex: 'statut',
      key:    'statut',
      width:  200,
      render: v => {
        const s = STATUT_TAG[v] || { color: 'default', tKey: '' };
        return <Tag color={s.color}>{t(s.tKey) || v}</Tag>;
      },
    },
    {
      title:  t('field.statutBE'),
      dataIndex: 'statut_be',
      key:    'statut_be',
      width:  130,
      render: v => {
        if (!v) return null;
        const beColors = { NON_DECLARE: 'default', EN_ATTENTE: 'orange', DECLARE: 'green', EN_RETARD: 'red' };
        const beKeys   = { NON_DECLARE: 'status.beNonDeclare', EN_ATTENTE: 'status.beEnAttente', DECLARE: 'status.beDeclare', EN_RETARD: 'status.beEnRetard' };
        return <Tag color={beColors[v] || 'default'} style={{ fontSize: 11 }}>{t(beKeys[v]) || v}</Tag>;
      },
    },
    {
      title:     t('field.greffe'),
      dataIndex: 'localite_libelle',
      key:       'greffe',
      width:     120,
      render:    v => v || '—',
    },
    {
      title:     t('field.dateImmat'),
      dataIndex: 'date_immatriculation',
      key:       'date_imm',
      width:     110,
      render:    v => v || '—',
    },
    {
      title:  t('field.actions'),
      key:    'actions',
      width:  120,
      fixed:  'right',
      render: (_, r) => (
        <Space>
          {/* Consulter — toujours visible */}
          <Tooltip title={t('common.view')}>
            <Button size="small" icon={<EyeOutlined />}
              onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}
            />
          </Tooltip>

          {/* Valider / Immatriculer — greffier, dossier EN_INSTANCE_VALIDATION */}
          {isGreffier && r.statut === 'EN_INSTANCE_VALIDATION' && (
            <Tooltip title={t('action.validerImmatriculer')}>
              <Popconfirm
                title={t('confirm.validerImmatriculer')}
                onConfirm={e => { e?.stopPropagation(); validerMut.mutate(r.id); }}
                okText={t('common.yes')} cancelText={t('common.no')}
                okButtonProps={{ style: { background: '#2e7d32' } }}
              >
                <Button size="small" icon={<CheckCircleOutlined />}
                  loading={validerMut.isPending}
                  style={{ color: '#2e7d32', borderColor: '#2e7d32' }}
                  onClick={e => e.stopPropagation()}
                />
              </Popconfirm>
            </Tooltip>
          )}

          {/* Retourner à l'agent — greffier, dossier EN_INSTANCE_VALIDATION */}
          {isGreffier && r.statut === 'EN_INSTANCE_VALIDATION' && (
            <Tooltip title={t('action.retournerAgent')}>
              <Button size="small" danger icon={<RollbackOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  setRetourTarget(r);
                  setRetourObs('');
                  setRetourModal(true);
                }}
              />
            </Tooltip>
          )}

          {/* Extrait RC — dossier immatriculé */}
          {r.statut === 'IMMATRICULE' && (
            <Tooltip title={t('action.extraitRC')}>
              <Button size="small" icon={<FilePdfOutlined />}
                onClick={e => { e.stopPropagation(); openPDF(rapportAPI.extraitRC(r.id)); }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // ── Colonnes onglet Immatriculés ──────────────────────────────────────────
  const columnsImmat = [
    {
      title:     t('field.numeroChrono'),
      dataIndex: 'numero_chrono',
      key:       'numero_chrono',
      width:     120,
      render:    (v, r) => v
        ? <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
            <strong style={{ color: '#555' }}>{v}</strong>
          </a>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title:     t('field.numeroRA'),
      dataIndex: 'numero_ra',
      key:       'numero_ra',
      width:     140,
      render:    (v, r) => v
        ? <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
            <strong style={{ color: '#1a4480' }}>{v}</strong>
          </a>
        : <Tag color="default" style={{ fontSize: 11, color: '#aaa' }}>{t('status.nonAttribue')}</Tag>,
    },
    {
      title:     t('field.dateImmat'),
      dataIndex: 'date_immatriculation',
      key:       'date_imm',
      width:     120,
      render:    v => v || '—',
    },
    {
      title:     t('field.denomination'),
      dataIndex: 'denomination',
      key:       'denom',
      ellipsis:  true,
      render:    (v, r) => {
        const fjLabel = isAr
          ? (r.forme_juridique_libelle_ar || r.forme_juridique_libelle || r.forme_juridique_code)
          : (r.forme_juridique_libelle || r.forme_juridique_code);
        return (
          <div>
            <a onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}>
              {field(r, 'denomination') || '—'}
            </a>
            {fjLabel && (
              <Tag color="cyan" style={{ marginLeft: 6, fontSize: 11 }}>{fjLabel}</Tag>
            )}
          </div>
        );
      },
    },
    {
      title:  t('field.statutBE'),
      dataIndex: 'statut_be',
      key:    'statut_be',
      width:  130,
      render: v => {
        if (!v) return null;
        const beColors = { NON_DECLARE: 'default', EN_ATTENTE: 'orange', DECLARE: 'green', EN_RETARD: 'red' };
        const beKeys   = { NON_DECLARE: 'status.beNonDeclare', EN_ATTENTE: 'status.beEnAttente', DECLARE: 'status.beDeclare', EN_RETARD: 'status.beEnRetard' };
        return <Tag color={beColors[v] || 'default'} style={{ fontSize: 11 }}>{t(beKeys[v]) || v}</Tag>;
      },
    },
    {
      title:  t('field.actions'),
      key:    'actions',
      width:  90,
      fixed:  'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('common.view')}>
            <Button size="small" icon={<EyeOutlined />}
              onClick={e => { e.stopPropagation(); navigate(`/registres/analytique/${r.id}`); }}
            />
          </Tooltip>
          <Tooltip title={isAr ? 'طباعة' : 'Imprimer'}>
            <Button size="small" icon={<FilePdfOutlined />}
              onClick={e => { e.stopPropagation(); openPDF(rapportAPI.extraitRC(r.id)); }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Colonnes allégées pour l'onglet "À traiter" ──────────────────────────
  // Suppression des colonnes non essentielles : N° analytique, Type, Statut,
  // Greffe, Date d'immatriculation — pour un affichage plus lisible.
  const PENDING_KEYS = new Set(['numero_chrono', 'denom', 'statut_be', 'actions']);
  const columnsPending = columns.filter(c => PENDING_KEYS.has(c.key));

  // ── Tableau commun ────────────────────────────────────────────────────────
  const DataTable = ({ data, loading, pagination, cols = columns, scrollX = 1100 }) => (
    <>
      {(data || []).some(r => r.statut === 'RETOURNE') && (
        <Alert
          type="warning"
          showIcon
          closable
          message={isAr
            ? 'يوجد ملفات مُعادة تتطلب تصحيحاً من قِبل المأمور.'
            : 'Des dossiers retournés nécessitent une correction par l\'agent.'}
          style={{ marginBottom: 12 }}
        />
      )}
      <Table
        dataSource={data || []}
        columns={cols}
        rowKey="id"
        loading={loading}
        scroll={{ x: scrollX }}
        size="small"
        rowClassName={r =>
          r.statut === 'RETOURNE'              ? 'row-retourne' :
          r.statut === 'EN_INSTANCE_VALIDATION' ? 'row-instance'  : ''
        }
        onRow={r => ({
          style:   { cursor: 'pointer' },
          onClick: () => navigate(`/registres/analytique/${r.id}`),
        })}
        pagination={pagination}
      />
    </>
  );

  // ── Options filtres ───────────────────────────────────────────────────────
  const statutOptions = [
    { value: 'BROUILLON',              label: t('status.brouillon') },
    { value: 'EN_INSTANCE_VALIDATION', label: t('status.enInstance') },
    { value: 'RETOURNE',               label: t('status.retourne') },
    { value: 'IMMATRICULE',            label: t('status.immatricule') },
    { value: 'RADIE',                  label: t('status.radie') },
    { value: 'SUSPENDU',               label: t('status.suspendu') },
    { value: 'ANNULE',                 label: t('status.annule') },
  ];

  // ── Filtre commun (search + type + forme juridique + BE) ─────────────────
  const CommonFilters = () => (
    <Space style={{ marginBottom: 12 }} wrap>
      <Input.Search
        placeholder={isAr ? 'رقم السجل، التسمية…' : 'N° RA, N° RC, dénomination…'}
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: 280 }} allowClear
      />
      <Select
        placeholder={t('field.type')}
        value={type || undefined}
        onChange={v => {
          setType(v || '');
          setFormeJuridique('');   // reset incompatible forme juridique
          setPage(1);
        }}
        allowClear style={{ width: 160 }}
        options={[
          { value: 'PH', label: t('entity.ph') },
          { value: 'PM', label: t('entity.pm') },
          { value: 'SC', label: t('entity.sc') },
        ]}
      />
      <Select
        placeholder={isAr ? 'الشكل القانوني' : 'Forme juridique'}
        value={formeJuridique || undefined}
        onChange={v => { setFormeJuridique(v || ''); setPage(1); }}
        allowClear style={{ width: 200 }}
        showSearch
        filterOption={(input, opt) =>
          (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
        options={formeJuridiquesOptions}
        disabled={formeJuridiquesOptions.length === 0}
      />
      <Select
        placeholder={t('field.statutBE')}
        value={statutBe || undefined}
        onChange={v => { setStatutBe(v || ''); setPage(1); }}
        allowClear style={{ width: 180 }}
        options={[
          { value: 'NON_DECLARE', label: `BE – ${t('status.beNonDeclare')}` },
          { value: 'EN_ATTENTE',  label: `BE – ${t('status.beEnAttente')}` },
          { value: 'DECLARE',     label: `BE – ${t('status.beDeclare')}` },
          { value: 'EN_RETARD',   label: `BE – ${t('status.beEnRetard')}` },
        ]}
      />
    </Space>
  );

  // ── Onglets ───────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key:   'pending',
      label: (
        <Space>
          <ClockCircleOutlined />
          {isAr ? 'قيد المعالجة' : 'À traiter'}
          {pendingCount > 0 && (
            <Badge count={pendingCount} style={{ backgroundColor: '#fa8c16' }} />
          )}
        </Space>
      ),
      children: (
        <div>
          <CommonFilters />
          {pendingApiError && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }}
              message={isAr ? 'خطأ في تحميل البيانات — تحقق من الخادم' : 'Erreur de chargement — vérifiez le serveur (migrations non appliquées ?)'}
            />
          )}
          {!pendingApiError && pendingCount === 0 && !instLoading ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message={isAr
                ? 'لا توجد ملفات في انتظار المعالجة حالياً.'
                : 'Aucun dossier en attente de traitement.'}
            />
          ) : (
            <DataTable
              data={pendingResults}
              loading={instLoading}
              pagination={false}
              cols={columnsPending}
              scrollX={600}
            />
          )}
        </div>
      ),
    },
    {
      key:   'all',
      label: isAr ? 'جميع الملفات' : 'Tous les dossiers',
      children: (
        <div>
          <Space style={{ marginBottom: 12 }} wrap>
            <Input.Search
              placeholder={isAr ? 'رقم السجل، التسمية…' : 'N° RA, N° RC, dénomination…'}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: 280 }} allowClear
            />
            <Select
              placeholder={t('field.type')}
              value={type || undefined}
              onChange={v => {
                setType(v || '');
                setFormeJuridique('');   // reset incompatible forme juridique
                setPage(1);
              }}
              allowClear style={{ width: 160 }}
              options={[
                { value: 'PH', label: t('entity.ph') },
                { value: 'PM', label: t('entity.pm') },
                { value: 'SC', label: t('entity.sc') },
              ]}
            />
            <Select
              placeholder={isAr ? 'الشكل القانوني' : 'Forme juridique'}
              value={formeJuridique || undefined}
              onChange={v => { setFormeJuridique(v || ''); setPage(1); }}
              allowClear style={{ width: 200 }}
              showSearch
              filterOption={(input, opt) =>
                (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={formeJuridiquesOptions}
              disabled={formeJuridiquesOptions.length === 0}
            />
            <Select
              placeholder={t('field.statut')}
              value={statut || undefined}
              onChange={v => { setStatut(v || ''); setPage(1); }}
              allowClear style={{ width: 230 }}
              options={statutOptions}
            />
          </Space>
          {allError && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }}
              message={isAr ? 'خطأ في تحميل البيانات — تحقق من الخادم' : 'Erreur de chargement — vérifiez le serveur (migrations non appliquées ?)'}
            />
          )}
          <DataTable
            data={allData?.results}
            loading={allLoading}
            pagination={{
              current:  page,
              pageSize: 20,
              total:    allData?.count || 0,
              onChange: setPage,
              showTotal: total => `${total} ${t('common.records')}`,
            }}
          />
        </div>
      ),
    },
    {
      key:   'immatricules',
      label: (
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          {isAr ? t('status.immatricule') : 'Immatriculés'}
          {immatData?.count > 0 && (
            <Badge count={immatData.count} style={{ backgroundColor: '#52c41a' }} />
          )}
        </Space>
      ),
      children: (
        <div>
          <Space style={{ marginBottom: 12 }} wrap>
            <Input.Search
              placeholder={isAr ? 'رقم السجل، التسمية…' : 'N° RA, N° RC, dénomination…'}
              value={search}
              onChange={e => { setSearch(e.target.value); setImmatPage(1); }}
              style={{ width: 280 }} allowClear
            />
            <Select
              placeholder={t('field.type')}
              value={type || undefined}
              onChange={v => {
                setType(v || '');
                setFormeJuridique('');   // reset incompatible forme juridique
                setImmatPage(1);
              }}
              allowClear style={{ width: 160 }}
              options={[
                { value: 'PH', label: t('entity.ph') },
                { value: 'PM', label: t('entity.pm') },
                { value: 'SC', label: t('entity.sc') },
              ]}
            />
            <Select
              placeholder={isAr ? 'الشكل القانوني' : 'Forme juridique'}
              value={formeJuridique || undefined}
              onChange={v => { setFormeJuridique(v || ''); setImmatPage(1); }}
              allowClear style={{ width: 200 }}
              showSearch
              filterOption={(input, opt) =>
                (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={formeJuridiquesOptions}
              disabled={formeJuridiquesOptions.length === 0}
            />
            <Select
              placeholder={t('field.statutBE')}
              value={statutBe || undefined}
              onChange={v => { setStatutBe(v || ''); setImmatPage(1); }}
              allowClear style={{ width: 180 }}
              options={[
                { value: 'NON_DECLARE', label: `BE – ${t('status.beNonDeclare')}` },
                { value: 'EN_ATTENTE',  label: `BE – ${t('status.beEnAttente')}` },
                { value: 'DECLARE',     label: `BE – ${t('status.beDeclare')}` },
                { value: 'EN_RETARD',   label: `BE – ${t('status.beEnRetard')}` },
              ]}
            />
          </Space>
          {immatError && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }}
              message={isAr
                ? 'خطأ في تحميل السجلات المقيدة — تأكد من تطبيق الترحيلات (python manage.py migrate)'
                : 'Erreur de chargement des immatriculés — vérifiez que les migrations sont appliquées (python manage.py migrate)'}
            />
          )}
          <Table
            dataSource={immatData?.results || []}
            columns={columnsImmat}
            rowKey="id"
            loading={immatLoading}
            scroll={{ x: 900 }}
            size="small"
            onRow={r => ({
              style:   { cursor: 'pointer' },
              onClick: () => navigate(`/registres/analytique/${r.id}`),
            })}
            pagination={{
              current:   immatPage,
              pageSize:  20,
              total:     immatData?.count || 0,
              onChange:  setImmatPage,
              showTotal: total => `${total} ${t('common.records')}`,
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📋 {t('nav.ra')}</Title>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={k => { setActiveTab(k); setPage(1); setImmatPage(1); }}
        items={tabItems}
      />

      <style>{`
        .row-retourne td { background: #fff7e6 !important; }
        .row-instance  td { background: #e6f4ff !important; }
        .row-instance:hover  td { background: #bae0ff !important; }
      `}</style>

      {/* ── Modal : Retourner à l'agent ──────────────────────────────────── */}
      <Modal
        open={retourModal}
        title={t('modal.retourTitle')}
        okText={t('action.retourner')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true, loading: retournerMut.isPending }}
        onCancel={() => { setRetourModal(false); setRetourObs(''); setRetourTarget(null); }}
        onOk={() => retournerMut.mutate({ id: retourTarget?.id, obs: retourObs })}
      >
        <p style={{ marginBottom: 8 }}>
          <strong>{retourTarget?.denomination || '—'}</strong>
        </p>
        <Input.TextArea
          rows={4}
          placeholder={t('placeholder.retourObs')}
          value={retourObs}
          onChange={e => setRetourObs(e.target.value)}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default ListeRA;
