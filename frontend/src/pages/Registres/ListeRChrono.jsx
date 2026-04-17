import React, { useState, useMemo } from 'react';
import { Table, Typography, Tag, Input, Select, Space, Button, Tooltip, message, Alert, Badge, Avatar, Modal } from 'antd';
import {
  FilePdfOutlined, PrinterOutlined, PlusOutlined,
  EyeOutlined, EditOutlined, SendOutlined,
  WarningOutlined, InfoCircleOutlined, LockOutlined,
  ClockCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { registreAPI, rapportAPI, autorisationAPI, openPDF } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_INSTANCE: 'warning',
  RETOURNE:    'orange',
  VALIDE:      'success',
  REJETE:      'error',
  ANNULE:      'default',
};

// Style de ligne selon le statut
const ROW_CLASS = (record) => {
  if (record.statut === 'RETOURNE') return 'row-retourne';
  if (record.statut === 'BROUILLON') return 'row-brouillon';
  return '';
};

const ListeRChrono = () => {
  const [search,       setSearch]       = useState('');
  const [statut,       setStatut]       = useState('');
  const [page,         setPage]         = useState(1);
  // ── Modal demande de correction ──────────────────────────────────────────
  const [corrModal,    setCorrModal]    = useState(false);
  const [corrRaId,     setCorrRaId]     = useState(null);
  const [corrMotif,    setCorrMotif]    = useState('');

  const queryClient = useQueryClient();
  const navigate    = useNavigate();
  const { t, isAr, field } = useLanguage();
  const { hasRole }  = useAuth();
  const isGreffier   = hasRole('GREFFIER');
  const isAgentGU    = hasRole('AGENT_GU');
  const isAgent      = hasRole('AGENT_GU') || hasRole('AGENT_TRIBUNAL');

  // ── Données de la liste principale ──────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['rchrono', page, search, statut],
    queryFn:  () => registreAPI.listChrono({ page, search, statut: statut || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  // ── Compteur des dossiers retournés (toujours frais) ─────────────────────────
  const { data: retourneData } = useQuery({
    queryKey: ['rchrono-retourne-count'],
    queryFn:  () => registreAPI.listChrono({ statut: 'RETOURNE', page: 1 }).then(r => r.data),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,   // rafraîchit toutes les 60 s
  });
  const nbRetournes = retourneData?.count || 0;

  // ── Compteur des brouillons en attente d'envoi ───────────────────────────────
  const { data: brouillonData } = useQuery({
    queryKey: ['rchrono-brouillon-count'],
    queryFn:  () => registreAPI.listChrono({ statut: 'BROUILLON', page: 1 }).then(r => r.data),
    refetchOnWindowFocus: true,
  });
  const nbBrouillons = brouillonData?.count || 0;

  // ── Demandes de correction en cours (agent) — pour afficher l'état par ligne ─
  const { data: myAuths = [], refetch: refetchMyAuths } = useQuery({
    queryKey: ['my-correction-requests'],
    queryFn:  () => autorisationAPI.list({ type_dossier: 'RA' }).then(r => r.data),
    enabled:  isAgent,
    refetchInterval: 30_000,
  });

  // Map raId → dernière demande de correction active (EN_ATTENTE ou AUTORISEE non expirée)
  const corrStatusByRa = useMemo(() => {
    const map = {};
    myAuths
      .filter(a => a.type_demande === 'CORRECTION')
      .forEach(a => {
        const prev = map[a.dossier_id];
        // Garder la demande la plus récente pour chaque RA
        if (!prev || a.id > prev.id) map[a.dossier_id] = a;
      });
    return map;
  }, [myAuths]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const invaliderCache = () => {
    queryClient.invalidateQueries({ queryKey: ['rchrono'] });
    queryClient.invalidateQueries({ queryKey: ['rchrono-retourne-count'] });
    queryClient.invalidateQueries({ queryKey: ['rchrono-brouillon-count'] });
  };

  const envoyerMut = useMutation({
    mutationFn: (id) => registreAPI.envoyerChrono(id),
    onSuccess: () => {
      message.success(t('msg.dossiereEnvoye'));
      invaliderCache();
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  // ── Mutation : créer demande d'autorisation de correction ────────────────
  const demandeCorMut = useMutation({
    mutationFn: (payload) => autorisationAPI.create(payload),
    onSuccess: () => {
      message.success(isAr
        ? 'تم إرسال طلب التصحيح إلى كاتب الضبط.'
        : 'Demande de correction envoyée au greffier.');
      setCorrModal(false);
      setCorrMotif('');
      setCorrRaId(null);
      refetchMyAuths();   // Rafraîchit immédiatement l'état des boutons dans la liste
    },
    onError: (e) => message.error(e.response?.data?.detail || t('msg.error')),
  });

  const openCorrModal = (raId) => {
    setCorrRaId(raId);
    setCorrMotif('');
    setCorrModal(true);
  };
  const submitCorr = () => {
    if (!corrMotif.trim()) {
      message.warning(isAr ? 'السبب مطلوب.' : 'Le motif est obligatoire.');
      return;
    }
    demandeCorMut.mutate({ type_demande: 'CORRECTION', type_dossier: 'RA', dossier_id: Number(corrRaId), motif: corrMotif });
  };

  const STATUT_LABELS = {
    BROUILLON:   'Brouillon',
    EN_INSTANCE: t('status.enInstance2'),
    RETOURNE:    'Retourné',
    VALIDE:      t('status.valide'),
    REJETE:      t('status.rejete'),
    ANNULE:      t('status.annule'),
  };

  // ── Colonnes ─────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: '', key: 'indicator', width: 8, fixed: 'left',
      render: (_, r) => {
        if (r.statut === 'RETOURNE')
          return <div style={{ width: 4, height: 32, background: '#fa8c16', borderRadius: 2, margin: '0 auto' }} />;
        if (r.statut === 'BROUILLON')
          return <div style={{ width: 4, height: 32, background: '#d9d9d9', borderRadius: 2, margin: '0 auto' }} />;
        if (r.modifications_retournees?.length > 0)
          return <div style={{ width: 4, height: 32, background: '#ff4d4f', borderRadius: 2, margin: '0 auto' }} />;
        return null;
      },
    },
    { title: t('rc.numero'),    dataIndex: 'numero_chrono', key: 'chrono', width: 150, render: v => fmtChrono(v) },
    {
      title: t('rc.date_acte'), dataIndex: 'date_acte', key: 'date', width: 150,
      render: v => {
        if (!v) return <span style={{ color: '#bfbfbf' }}>—</span>;
        const d = dayjs(v);
        return d.isValid() ? d.format('DD/MM/YYYY HH:mm') : v;
      },
    },
    {
      title: t('rc.type_entite'),
      dataIndex: 'ra_type_entite',
      key: 'type_entite',
      width: 140,
      render: v => {
        const cfg = {
          PH: { label: isAr ? 'شخص طبيعي' : 'Pers. physique', color: '#1a4480', bg: '#e8f0fe' },
          PM: { label: isAr ? 'شخص معنوي' : 'Pers. morale',   color: '#7b5ea7', bg: '#f3ecff' },
          SC: { label: isAr ? 'فرع'        : 'Succursale',     color: '#0d7a5f', bg: '#e6f7f1' },
        }[v] || null;
        if (!cfg) return <span style={{ color: '#bfbfbf' }}>—</span>;
        return (
          <Tag style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}33`, fontWeight: 500 }}>
            {cfg.label}
          </Tag>
        );
      },
    },
    { title: t('rc.ra_rc'),     dataIndex: 'ra_numero',     key: 'ra',     width: 130 },
    { title: t('field.denomination'), dataIndex: 'denomination', key: 'denom', ellipsis: true,
      render: (v, r) => field(r, 'denomination') || '—' },
    {
      title: t('field.statut'), dataIndex: 'statut', key: 'statut', width: 190,
      render: (v, r) => {
        const tag = <Tag color={STATUT_COLOR[v]}>{STATUT_LABELS[v] || v}</Tag>;
        // Pour RETOURNE : tooltip avec le motif du greffier
        if (v === 'RETOURNE' && r.observations) {
          return (
            <Tooltip
              title={
                <span>
                  <strong>Motif du retour :</strong><br />
                  {r.observations}
                </span>
              }
              color="#fa8c16"
            >
              <span style={{ cursor: 'help' }}>
                {tag} <InfoCircleOutlined style={{ color: '#fa8c16', fontSize: 12 }} />
              </span>
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: t('field.actions'), key: 'actions', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('rc.voirDetail')}>
            <Button size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/registres/chronologique/${r.id}`)} />
          </Tooltip>

          {/* Corriger / Modifier — BROUILLON ou RETOURNE uniquement (tous rôles).
              En instance → bouton masqué.
              Retourné    → bouton "Corriger le dossier" visible pour permettre la correction. */}
          {(r.statut === 'BROUILLON' || r.statut === 'RETOURNE') && (
            <Tooltip title={r.statut === 'RETOURNE' ? t('action.corrigerDossier') : t('action.rectifier')}>
              <Button size="small" icon={<EditOutlined />}
                danger={r.statut === 'RETOURNE'}
                onClick={() => navigate(`/registres/chronologique/${r.id}/rectifier`)} />
            </Tooltip>
          )}

          {/* Imprimer l'extrait avant soumission — BROUILLON/RETOURNE, tous rôles */}
          {(r.statut === 'BROUILLON' || r.statut === 'RETOURNE') && (
            <Tooltip title={t('rc.imprimerExtrait')}>
              <Button size="small" icon={<PrinterOutlined />}
                onClick={() => openPDF(rapportAPI.certificatChronologique(r.id))} />
            </Tooltip>
          )}

          {/* Certificat officiel — greffier uniquement, après transmission */}
          {isGreffier && r.statut !== 'BROUILLON' && r.statut !== 'RETOURNE' && (
            <Tooltip title={t('rc.certificat')}>
              <Button size="small" icon={<PrinterOutlined />}
                onClick={() => openPDF(rapportAPI.certificatChronologique(r.id))} />
            </Tooltip>
          )}

          {/* 🔒 Demander correction — agents uniquement, dossier VALIDE
              L'apparence du bouton reflète l'état de la dernière demande de correction */}
          {isAgent && r.statut === 'VALIDE' && r.ra && (() => {
            const auth = corrStatusByRa[r.ra];
            if (auth?.statut === 'EN_ATTENTE') {
              return (
                <Tooltip title={isAr
                  ? 'طلب التصحيح في انتظار قرار كاتب الضبط'
                  : 'Demande de correction en attente de décision du greffier'}>
                  <Tag
                    icon={<ClockCircleOutlined />}
                    color="warning"
                    style={{ margin: 0, cursor: 'default', fontSize: 11 }}
                  >
                    {isAr ? 'في الانتظار' : 'En attente'}
                  </Tag>
                </Tooltip>
              );
            }
            if (auth?.statut === 'AUTORISEE') {
              return (
                <Tooltip title={isAr
                  ? 'تمت الموافقة على التصحيح — الملف سيُعاد قريباً'
                  : 'Correction autorisée — le dossier va repasser en RETOURNE'}>
                  <Tag
                    icon={<CheckCircleOutlined />}
                    color="success"
                    style={{ margin: 0, cursor: 'default', fontSize: 11 }}
                  >
                    {isAr ? 'مقبولة' : 'Autorisée'}
                  </Tag>
                </Tooltip>
              );
            }
            // Pas de demande active ou demande refusée/expirée → afficher le bouton de demande
            return (
              <Tooltip title={isAr
                ? 'طلب إعادة الملف للتصحيح — يتطلب موافقة كاتب الضبط'
                : 'Demander au greffier de retourner ce dossier pour correction'}>
                <Button
                  size="small"
                  icon={<LockOutlined />}
                  style={{ borderColor: '#722ed1', color: '#722ed1' }}
                  onClick={() => openCorrModal(r.ra)}
                />
              </Tooltip>
            );
          })()}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── Styles ligne colorée ─────────────────────────────────────────────── */}
      <style>{`
        .row-retourne td { background-color: #fff7e6 !important; }
        .row-retourne:hover td { background-color: #ffe7ba !important; }
        .row-brouillon td { background-color: #fafafa !important; }
      `}</style>

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>📅 {t('rc.title')}</Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate('/registres/chronologique/nouveau')}
            style={{ background: '#1a4480' }}>
            {t('rc.new')}
          </Button>
          {!isAgentGU && (
            <Button icon={<FilePdfOutlined />}
              onClick={() => openPDF(rapportAPI.registreChronologiquePDF({}))}>
              {t('common.export_pdf')}
            </Button>
          )}
        </Space>
      </div>

      {/* ── Bandeau d'alerte : dossiers retournés ────────────────────────────── */}
      {nbRetournes > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 12 }}
          message={
            <span>
              <strong>{nbRetournes} dossier{nbRetournes > 1 ? 's' : ''} retourné{nbRetournes > 1 ? 's' : ''}</strong>
              {' '}par le greffier — corrections attendues de votre part.
            </span>
          }
          action={
            <Button size="small" danger
              onClick={() => { setStatut('RETOURNE'); setPage(1); }}>
              Voir les dossiers retournés
            </Button>
          }
        />
      )}

      {/* ── Bandeau agent : demandes d'autorisation en attente ───────────────── */}
      {isAgent && Object.values(corrStatusByRa).filter(a => a.statut === 'EN_ATTENTE').length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: 12 }}
          message={
            <span>
              <strong>
                {Object.values(corrStatusByRa).filter(a => a.statut === 'EN_ATTENTE').length}{' '}
                demande{Object.values(corrStatusByRa).filter(a => a.statut === 'EN_ATTENTE').length > 1 ? 's' : ''} de correction
              </strong>
              {' '}en attente de décision du greffier.
            </span>
          }
          action={
            <Button size="small" href="/mes-autorisations" type="link">
              Voir mes demandes →
            </Button>
          }
        />
      )}

      {/* ── Bandeau info : brouillons non encore envoyés ─────────────────────── */}
      {nbBrouillons > 0 && nbRetournes === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              <strong>{nbBrouillons} brouillon{nbBrouillons > 1 ? 's' : ''}</strong>
              {' '}en attente d'envoi au greffier.
            </span>
          }
          action={
            <Button size="small"
              onClick={() => { setStatut('BROUILLON'); setPage(1); }}>
              Voir les brouillons
            </Button>
          }
        />
      )}

      {/* ── Filtres ──────────────────────────────────────────────────────────── */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder={t('rc.search_ph')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 350 }} allowClear />
        <Select
          placeholder={t('field.statut')}
          value={statut || undefined}
          onChange={v => { setStatut(v || ''); setPage(1); }}
          allowClear style={{ width: 210 }}
          options={[
            {
              value: 'BROUILLON',
              label: <span>Brouillon {nbBrouillons > 0 && <Badge count={nbBrouillons} size="small" color="default" style={{ marginLeft: 4 }} />}</span>,
            },
            { value: 'EN_INSTANCE', label: t('status.enInstance2') },
            {
              value: 'RETOURNE',
              label: (
                <span>
                  Retourné{' '}
                  {nbRetournes > 0 && <Badge count={nbRetournes} size="small" color="orange" style={{ marginLeft: 4 }} />}
                </span>
              ),
            },
            { value: 'VALIDE',  label: t('status.valide') },
            { value: 'REJETE',  label: t('status.rejete') },
            { value: 'ANNULE',  label: t('status.annule') },
          ]}
        />
        {/* Raccourci : afficher uniquement les dossiers à traiter */}
        <Button
          type={statut === 'RETOURNE' || statut === 'BROUILLON' ? 'primary' : 'default'}
          onClick={() => {
            setStatut(statut === 'RETOURNE' ? '' : 'RETOURNE');
            setPage(1);
          }}
          icon={<WarningOutlined />}
          danger={nbRetournes > 0}
        >
          À traiter
          {(nbRetournes + nbBrouillons) > 0 && (
            <Badge
              count={nbRetournes + nbBrouillons}
              size="small"
              style={{ marginLeft: 6, backgroundColor: nbRetournes > 0 ? '#fa8c16' : '#8c8c8c' }}
            />
          )}
        </Button>
      </Space>

      {/* ── Modal demande de correction (agent → greffier) ────────────────── */}
      <Modal
        title={`🔒 ${isAr ? 'طلب إذن التصحيح' : 'Demander une autorisation de correction'}`}
        open={corrModal}
        onCancel={() => { setCorrModal(false); setCorrMotif(''); }}
        onOk={submitCorr}
        okText={isAr ? 'إرسال الطلب' : 'Envoyer la demande'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        confirmLoading={demandeCorMut.isPending}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={isAr
            ? 'بعد موافقة كاتب الضبط، سيُعاد الملف تلقائياً إلى حالة "مُعاد" لتمكينك من التصحيح.'
            : 'Après autorisation du greffier, le dossier repassera automatiquement en statut RETOURNE.'}
        />
        <div style={{ marginBottom: 8, fontWeight: 500 }}>
          {isAr ? 'سبب الطلب' : 'Motif de la demande'}{' '}
          <span style={{ color: '#ff4d4f' }}>*</span>
        </div>
        <Input.TextArea
          rows={4}
          placeholder={isAr
            ? 'اشرح سبب طلب التصحيح...'
            : 'Expliquez la raison de votre demande de correction...'}
          value={corrMotif}
          onChange={e => setCorrMotif(e.target.value)}
          showCount
          maxLength={500}
        />
      </Modal>

      {/* ── Tableau ──────────────────────────────────────────────────────────── */}
      <Table
        dataSource={data?.results || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 1050 }}
        rowClassName={ROW_CLASS}
        pagination={{
          current:   page,
          pageSize:  20,
          total:     data?.count || 0,
          onChange:  setPage,
          showTotal: total => `${total} ${t('common.acts')}`,
        }}
        size="small"
      />

    </div>
  );
};

export default ListeRChrono;
