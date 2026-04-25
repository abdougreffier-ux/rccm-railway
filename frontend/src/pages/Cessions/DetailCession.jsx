import React, { useState } from 'react';
import {
  Card, Button, Tag, Descriptions, Typography, Space,
  Modal, Input, Popconfirm, Alert, message, Table, Form, Tooltip, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, SendOutlined,
  CheckCircleOutlined, RollbackOutlined, CloseCircleOutlined,
  UndoOutlined, ToolOutlined, FilePdfOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cessionAPI, rapportAPI, openPDF, parametrageAPI } from '../../api/api';
import PiecesJointesCard from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title } = Typography;

/* ─── Rendu identité cessionnaire (une cellule) ─────────────────────────── */
const CessIdentite = ({ r, natMap, isAr }) => {
  if (r.cessionnaire_type !== 'NOUVEAU') {
    return (
      <div>
        <Tag style={{ marginBottom: 2 }}>{isAr ? 'منخرط' : 'Existant'}</Tag>
        <span style={{ fontWeight: 500 }}>{r.cessionnaire_nom || '—'}</span>
      </div>
    );
  }

  const isPH = (r.cessionnaire_type_personne || 'PH') === 'PH';

  if (isPH) {
    const fullName = [r.cessionnaire_civilite, r.cessionnaire_prenom, r.cessionnaire_nom]
      .filter(Boolean).join(' ') || '—';
    const natNom = r.cessionnaire_nationalite_id ? natMap[r.cessionnaire_nationalite_id] : null;
    const missing = !(r.cessionnaire_nom?.trim());
    return (
      <div>
        <Space size={4} style={{ marginBottom: 3 }}>
          <Tag color="blue">{isAr ? 'شخص طبيعي' : 'Pers. physique'}</Tag>
          <Tag color="green">{isAr ? 'جديد' : 'Nouveau'}</Tag>
          {missing && <Tag color="red" icon={<WarningOutlined />}>{isAr ? 'ناقص' : 'Incomplet'}</Tag>}
        </Space>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{fullName}</div>
        <div style={{ fontSize: 11, color: '#555' }}>
          {natNom && <span>{isAr ? 'الجنسية' : 'Nationalité'} : {natNom}</span>}
          {r.cessionnaire_nni && (
            <span style={{ marginLeft: natNom ? 8 : 0 }}>
              {isAr ? 'رقم الهوية' : 'NNI/Passeport'} : {r.cessionnaire_nni}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* PM */
  const missing = !(r.cessionnaire_denomination?.trim());
  return (
    <div>
      <Space size={4} style={{ marginBottom: 3 }}>
        <Tag color="purple">{isAr ? 'شخص معنوي' : 'Pers. morale'}</Tag>
        <Tag color="green">{isAr ? 'جديد' : 'Nouveau'}</Tag>
        {missing && <Tag color="red" icon={<WarningOutlined />}>{isAr ? 'ناقص' : 'Incomplet'}</Tag>}
      </Space>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {r.cessionnaire_denomination || <span style={{ color: '#dc2626' }}>—</span>}
      </div>
      <div style={{ fontSize: 11, color: '#555' }}>
        {r.cessionnaire_forme_juridique && <span>{r.cessionnaire_forme_juridique}</span>}
        {r.cessionnaire_nationalite_pm && (
          <span style={{ marginLeft: r.cessionnaire_forme_juridique ? 8 : 0 }}>
            {isAr ? 'الجنسية' : 'Nationalité'} : {r.cessionnaire_nationalite_pm}
          </span>
        )}
        {r.cessionnaire_num_identification && (
          <span style={{ marginLeft: 8 }}>
            {isAr ? 'رقم التسجيل' : 'N° Identif.'} : {r.cessionnaire_num_identification}
          </span>
        )}
      </div>
      {r.cessionnaire_siege_social && (
        <div style={{ fontSize: 11, color: '#555' }}>
          {isAr ? 'المقر الاجتماعي' : 'Siège social'} : {r.cessionnaire_siege_social}
        </div>
      )}
    </div>
  );
};

/* ─── Vérifie si l'identité d'une ligne est complète ────────────────────── */
const _isIdentiteComplete = (l) => {
  if (l.cessionnaire_type !== 'NOUVEAU') return true;
  const isPH = (l.cessionnaire_type_personne || 'PH') === 'PH';
  return isPH ? !!(l.cessionnaire_nom?.trim()) : !!(l.cessionnaire_denomination?.trim());
};

/* ═══════════════════════════════════════════════════════════════════════════ */

const DetailCession = () => {
  const { id }              = useParams();
  const navigate            = useNavigate();
  const queryClient         = useQueryClient();
  const { t, isAr }         = useLanguage();
  const { hasRole }         = useAuth();
  const isGreffier          = hasRole('GREFFIER');

  const STATUT_CONFIG = {
    BROUILLON:   { color: 'default',    label: t('status.brouillon')   },
    EN_INSTANCE: { color: 'processing', label: t('status.enInstance2') },
    RETOURNE:    { color: 'warning',    label: t('status.retourne')    },
    VALIDE:      { color: 'success',    label: t('status.valide')      },
    ANNULE:      { color: 'error',      label: t('status.annule')      },
  };

  const [retourModal,  setRetourModal]  = useState(false);
  const [retourForm]                    = Form.useForm();
  const [validerObs,   setValiderObs]   = useState('');
  const [validerModal, setValiderModal] = useState(false);

  const { data: cession, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cession', id],
    queryFn:  () => cessionAPI.get(id).then(r => r.data),
  });

  const { data: nationalites = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  /* id → nom */
  const natMap = Object.fromEntries(nationalites.map(n => [n.id, n.nom || n.libelle || String(n.id)]));

  const _errMsg = (e) => {
    const data = e.response?.data;
    if (!data) return 'Erreur de connexion.';
    if (data.detail) return data.detail;
    if (typeof data === 'object') {
      const msgs = Object.entries(data)
        .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' | ');
      if (msgs) return msgs;
    }
    return 'Erreur inconnue.';
  };

  const soumettreM = useMutation({
    mutationFn: () => cessionAPI.soumettre(id),
    onSuccess: () => {
      message.success(isAr ? 'تم إرسال التنازل إلى الكاتب.' : 'Cession soumise au greffier.');
      queryClient.invalidateQueries({ queryKey: ['cession', id] });
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
    },
    onError: e => message.error(_errMsg(e), 6),
  });

  const retournerM = useMutation({
    mutationFn: (vals) => cessionAPI.retourner(id, { observations: vals.observations }),
    onSuccess: () => {
      message.warning(isAr ? 'أُعيد الملف إلى العون.' : "Cession retournée à l'agent.");
      setRetourModal(false);
      retourForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['cession', id] });
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
    },
    onError: e => message.error(_errMsg(e), 6),
  });

  const validerM = useMutation({
    mutationFn: () => cessionAPI.valider(id, { observations: validerObs }),
    onSuccess: () => {
      message.success(isAr ? 'تم اعتماد التنازل وتطبيقه.' : 'Cession validée et appliquée.');
      setValiderModal(false);
      queryClient.invalidateQueries({ queryKey: ['cession', id] });
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
    },
    onError: e => message.error(_errMsg(e), 6),
  });

  const annulerM = useMutation({
    mutationFn: () => cessionAPI.annuler(id),
    onSuccess: () => {
      message.info(isAr ? 'تم إلغاء التنازل.' : 'Cession annulée.');
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
      navigate('/cessions');
    },
    onError: e => message.error(_errMsg(e), 6),
  });

  const annulerValideM = useMutation({
    mutationFn: () => cessionAPI.annulerValide(id),
    onSuccess: () => {
      message.success(isAr ? 'تم إلغاء التنازل. استُعيدت الحالة السابقة.' : 'Cession annulée. État précédent restauré.');
      queryClient.invalidateQueries({ queryKey: ['cession', id] });
      queryClient.invalidateQueries({ queryKey: ['cessions'] });
    },
    onError: e => message.error(_errMsg(e), 6),
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!cession)  return <AccessDenied onRetry={refetch} style="inline" />;

  /* ── Vérification complétude des identités (lignes RCCM) ──────────────── */
  const lignes = cession.lignes || [];
  const hasMissingIdentity = lignes.some(l => !_isIdentiteComplete(l));
  const canValider = !hasMissingIdentity;

  /* ── Colonnes du tableau lignes de cession ────────────────────────────── */
  const lignesColumns = [
    {
      title: '#',
      dataIndex: '_idx',
      width: 36,
      align: 'center',
    },
    {
      title: isAr ? 'المتنازِل' : 'Cédant',
      dataIndex: 'cedant_nom',
      key: 'cedant',
      width: 180,
      render: v => <span style={{ fontWeight: 500 }}>{v || '—'}</span>,
    },
    {
      title: '',
      key: 'arrow',
      width: 28,
      align: 'center',
      render: () => <span style={{ color: '#6b7280', fontWeight: 700 }}>→</span>,
    },
    {
      title: isAr ? 'المستفيد — الهوية الكاملة' : 'Cessionnaire — Identité complète',
      key: 'cess',
      render: r => <CessIdentite r={r} natMap={natMap} isAr={isAr} />,
    },
    {
      title: isAr ? 'الحصص المتنازَل عنها' : 'Parts cédées',
      dataIndex: 'nombre_parts',
      width: 110,
      align: 'center',
      render: v => <strong style={{ color: '#1a4480', fontSize: 13 }}>{v ?? '—'}</strong>,
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── En-tête ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cessions')} />
          <Title level={4} style={{ margin: 0 }}>
            {cession.numero_cession} — {cession.ra_denomination}
          </Title>
          <Tag color={STATUT_CONFIG[cession.statut]?.color}>{STATUT_CONFIG[cession.statut]?.label}</Tag>
        </Space>

        <Space wrap>
          {/* ── Actions AGENT : BROUILLON / RETOURNÉ ───────────────────── */}
          {!isGreffier && ['BROUILLON', 'RETOURNE'].includes(cession.statut) && (
            <>
              <Button icon={<EditOutlined />} onClick={() => navigate(`/cessions/${id}/modifier`)}>
                {isAr ? 'تعديل' : 'Modifier'}
              </Button>
              <Button type="primary" icon={<SendOutlined />}
                onClick={() => soumettreM.mutate()} loading={soumettreM.isPending}
                style={{ background: '#1a4480' }}>
                {isAr ? 'إرسال إلى الكاتب' : 'Soumettre au greffier'}
              </Button>
              <Popconfirm
                title={isAr ? 'إلغاء هذا التنازل؟' : 'Annuler cette cession ?'}
                onConfirm={() => annulerM.mutate()}
              >
                <Button danger icon={<CloseCircleOutlined />} loading={annulerM.isPending}>
                  {isAr ? 'إلغاء' : 'Annuler'}
                </Button>
              </Popconfirm>
            </>
          )}

          {/* ── Actions GREFFIER : EN INSTANCE ─────────────────────────── */}
          {isGreffier && cession.statut === 'EN_INSTANCE' && (
            <>
              <Button icon={<RollbackOutlined />} onClick={() => setRetourModal(true)}>
                {isAr ? 'إرجاع' : 'Retourner'}
              </Button>
              <Tooltip
                title={
                  !canValider
                    ? (isAr
                        ? 'هوية بعض المستفيدين غير مكتملة. يجب إرجاع الملف لإكمالها.'
                        : "L'identité de certains cessionnaires est incomplète. Retournez le dossier à l'agent.")
                    : undefined
                }
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!canValider}
                  onClick={() => setValiderModal(true)}
                  style={canValider ? { background: '#2e7d32' } : {}}
                >
                  {isAr ? 'اعتماد' : 'Valider'}
                </Button>
              </Tooltip>
            </>
          )}

          {/* ── Actions GREFFIER : VALIDÉ ───────────────────────────────── */}
          {isGreffier && cession.statut === 'VALIDE' && (
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => openPDF(rapportAPI.certificatCession(cession.id))}
              style={{ borderColor: '#1a4480', color: '#1a4480' }}
            >
              {isAr ? 'شهادة التنازل عن الحصص' : 'Certificat de cession'}
            </Button>
          )}

          {isGreffier && cession.statut === 'VALIDE' && cession.can_modifier_correctif && (
            <Button icon={<ToolOutlined />}
              onClick={() => navigate(`/cessions/${id}/corriger`)}
              style={{ borderColor: '#d97706', color: '#d97706' }}>
              {isAr ? 'تصحيح' : 'Modifier (correctif)'}
            </Button>
          )}

          {isGreffier && cession.statut === 'VALIDE' && cession.can_annuler_valide && (
            <Popconfirm
              title={isAr ? 'إلغاء هذا التنازل؟' : 'Annuler cette cession ?'}
              description={
                isAr
                  ? 'ستُستعاد الحالة السابقة للشركاء. هذا الإجراء لا رجعة فيه.'
                  : "L'état précédent des associés sera restauré. Cette action est irréversible."
              }
              onConfirm={() => annulerValideM.mutate()}
              okText={isAr ? 'تأكيد الإلغاء' : "Confirmer l'annulation"}
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<UndoOutlined />} loading={annulerValideM.isPending}>
                {isAr ? 'إلغاء (الكاتب)' : 'Annuler (greffier)'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* ── Alerte : acte en lecture seule (agent, statut figé) ─────────── */}
      {!isGreffier && cession.statut === 'EN_INSTANCE' && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={
            isAr
              ? 'الملف في انتظار قرار الكاتب. لا يمكنك إجراء أي تعديل في هذه المرحلة.'
              : 'Dossier en attente de décision du greffier. Aucune action n\'est possible à ce stade.'
          } />
      )}
      {!isGreffier && cession.statut === 'VALIDE' && (
        <Alert type="success" showIcon style={{ marginBottom: 16 }}
          message={
            isAr
              ? 'تم اعتماد هذا التنازل من قِبَل الكاتب. الملف مغلق — للاطلاع فقط.'
              : 'Cession validée par le greffier. Dossier figé — consultation uniquement.'
          } />
      )}
      {!isGreffier && cession.statut === 'ANNULE' && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={isAr ? 'تم إلغاء هذا التنازل.' : 'Cette cession a été annulée.'} />
      )}

      {/* ── Alerte : dossier retourné ─────────────────────────────────────── */}
      {cession.statut === 'RETOURNE' && cession.observations && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message={`${isAr ? 'أُعيد — ' : 'Retourné — '}${cession.observations}`} />
      )}

      {/* ── Alerte : identité cessionnaire incomplète (EN_INSTANCE) ──────── */}
      {cession.statut === 'EN_INSTANCE' && hasMissingIdentity && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={isAr ? 'هوية مستفيد غير مكتملة — الاعتماد مُعلَّق' : 'Identité cessionnaire incomplète — Validation bloquée'}
          description={
            isAr
              ? 'إحدى أو أكثر من سطور التنازل تفتقر إلى البيانات الإلزامية للمستفيد (الاسم أو التسمية). يجب إرجاع الملف إلى العون لإكمال الهوية قبل الاعتماد.'
              : "Une ou plusieurs lignes de cession ne contiennent pas l'identité obligatoire du cessionnaire (Nom ou Dénomination). Retournez le dossier à l'agent pour compléter les informations avant de valider."
          }
        />
      )}

      {/* ── Informations générales ────────────────────────────────────────── */}
      <Card
        title={isAr ? 'معلومات عامة' : 'Informations'}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label={isAr ? 'رقم التنازل' : 'N° Cession'}>
            {cession.numero_cession}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'الرقم التحليلي' : 'N° Analytique'}>
            {cession.ra_numero}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'التسمية' : 'Dénomination'}>
            {cession.ra_denomination}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'التاريخ' : 'Date'}>
            {cession.date_cession}
          </Descriptions.Item>
          {cession.demandeur && (
            <Descriptions.Item label={isAr ? 'مقدِّم الطلب' : 'Demandeur'}>
              {cession.demandeur}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={isAr ? 'أنشأه' : 'Créé par'}>
            {cession.created_by_nom}
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? 'اعتمده' : 'Validé par'}>
            {cession.validated_by_nom || '—'}
          </Descriptions.Item>
          {cession.observations && (
            <Descriptions.Item label={isAr ? 'ملاحظات' : 'Observations'} span={2}>
              {cession.observations}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* ══ Lignes de cession — modèle canonique RCCM ═══════════════════════ */}
      {lignes.length > 0 ? (
        <Card
          size="small"
          style={{ marginBottom: 16, borderLeft: '4px solid #059669' }}
          title={
            <span style={{ color: '#059669', fontWeight: 600 }}>
              {isAr ? 'سطور التنازل' : 'Lignes de cession'}
              <Tag color="green" style={{ marginLeft: 8 }}>{lignes.length}</Tag>
              {hasMissingIdentity && (
                <Tag color="red" icon={<WarningOutlined />} style={{ marginLeft: 4 }}>
                  {isAr ? 'هوية ناقصة' : 'Identité incomplète'}
                </Tag>
              )}
            </span>
          }
        >
          <Table
            size="small"
            pagination={false}
            dataSource={lignes.map((l, i) => ({ ...l, _idx: i + 1 }))}
            rowKey="_idx"
            columns={lignesColumns}
            rowClassName={r => !_isIdentiteComplete(r) ? 'row-incomplete' : ''}
          />

          {/* Récapitulatif total par cédant */}
          {(() => {
            const stats = {};
            lignes.forEach(l => {
              if (!stats[l.cedant_nom]) stats[l.cedant_nom] = 0;
              stats[l.cedant_nom] += l.nombre_parts || 0;
            });
            return (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(stats).map(([nom, total]) => (
                  <Tag key={nom} color="blue">
                    {nom} : {total} {isAr ? 'حصة متنازَل عنها' : 'part(s) cédée(s)'}
                  </Tag>
                ))}
              </div>
            );
          })()}
        </Card>

      ) : cession.cedants?.length > 0 ? (
        /* ── Mode multi-parties (rétrocompat) ──────────────────────────── */
        <>
          <Table
            size="small"
            style={{ marginBottom: 12 }}
            pagination={false}
            title={() => (
              <span style={{ fontWeight: 600, color: '#b45309' }}>
                {isAr ? `المتنازِلون (${cession.cedants.length})` : `Cédants (${cession.cedants.length})`}
              </span>
            )}
            dataSource={cession.cedants}
            rowKey={(_, i) => `ced_${i}`}
            columns={[
              { title: isAr ? 'الاسم' : 'Nom', dataIndex: 'nom' },
              {
                title: isAr ? 'النوع' : 'Type',
                dataIndex: 'type_cession',
                width: 110,
                render: v => v === 'TOTALE'
                  ? <Tag color="blue">{isAr ? 'كلي' : 'Totale'}</Tag>
                  : <Tag color="cyan">{isAr ? 'جزئي' : 'Partielle'}</Tag>,
              },
              { title: isAr ? 'الحصص' : 'Parts', dataIndex: 'nombre_parts', width: 90 },
            ]}
          />
          {cession.cessionnaires?.length > 0 && (
            <Table
              size="small"
              style={{ marginBottom: 16 }}
              pagination={false}
              title={() => (
                <span style={{ fontWeight: 600, color: '#1a4480' }}>
                  {isAr
                    ? `المستفيدون (${cession.cessionnaires.length})`
                    : `Cessionnaires (${cession.cessionnaires.length})`}
                </span>
              )}
              dataSource={cession.cessionnaires}
              rowKey={(_, i) => `cess_${i}`}
              columns={[
                {
                  title: isAr ? 'المستفيد' : 'Cessionnaire',
                  key: 'id',
                  render: r => r.type === 'NOUVEAU'
                    ? (
                      <div>
                        <Space size={4} style={{ marginBottom: 2 }}>
                          <Tag color="green">{isAr ? 'جديد' : 'Nouveau'}</Tag>
                          {r.type_personne === 'PM'
                            ? <Tag color="purple">{isAr ? 'شخص معنوي' : 'Pers. morale'}</Tag>
                            : <Tag color="blue">{isAr ? 'شخص طبيعي' : 'Pers. physique'}</Tag>}
                        </Space>
                        <div style={{ fontWeight: 500 }}>
                          {r.type_personne === 'PM'
                            ? (r.denomination || `${r.prenom || ''} ${r.nom || ''}`.trim() || '—')
                            : `${r.prenom || ''} ${r.nom || ''}`.trim() || '—'}
                        </div>
                      </div>
                    )
                    : <span style={{ fontWeight: 500 }}>{r.nom || '—'}</span>,
                },
                { title: isAr ? 'الحصص' : 'Parts', dataIndex: 'nombre_parts', width: 90 },
              ]}
            />
          )}
        </>

      ) : (
        /* ── Mode héritage 1+1 ─────────────────────────────────────────── */
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label={isAr ? 'المتنازِل' : 'Cédant'}>
              {cession.cedant_nom || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={isAr ? 'نوع التنازل' : 'Type de cession'}>
              {cession.type_cession_parts === 'TOTALE'
                ? <Tag color="blue">{isAr ? 'كلي' : 'Totale'}</Tag>
                : cession.type_cession_parts === 'PARTIELLE'
                  ? <Tag color="cyan">{isAr ? 'جزئي' : 'Partielle'}</Tag>
                  : '—'}
            </Descriptions.Item>
            {cession.type_cession_parts === 'PARTIELLE' && (
              <Descriptions.Item label={isAr ? 'الحصص المتنازَل عنها' : 'Parts cédées'}>
                {cession.nombre_parts_cedees}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={isAr ? 'المستفيد' : 'Bénéficiaire'}>
              {cession.beneficiaire_type === 'NOUVEAU'
                ? <Tag color="green">{isAr ? 'شريك جديد' : 'Nouvel associé'}</Tag>
                : <Tag>{isAr ? 'شريك موجود' : 'Associé existant'}</Tag>}
              {' '}{cession.beneficiaire_nom}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* ── Pièces jointes ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <PiecesJointesCard
          entityType="cession"
          entityId={Number(id)}
          readOnly={cession.statut === 'VALIDE' || cession.statut === 'ANNULE'}
        />
      </div>

      {/* ── Modal : Retourner ─────────────────────────────────────────────── */}
      <Modal
        title={isAr ? '🔄 إرجاع الملف إلى العون' : "🔄 Retourner le dossier à l'agent"}
        open={retourModal}
        onCancel={() => { setRetourModal(false); retourForm.resetFields(); }}
        onOk={() => retourForm.validateFields().then(vals => retournerM.mutate(vals))}
        okText={isAr ? 'إرجاع' : 'Retourner'}
        okButtonProps={{ danger: true, loading: retournerM.isPending }}
        destroyOnClose
      >
        <p style={{ color: '#555', marginBottom: 12 }}>
          {isAr
            ? 'ستُبلَّغ هذه الملاحظات إلى العون وتُسجَّل في سجل المتابعة.'
            : "Ces observations seront communiquées à l'agent et historisées dans le suivi du dossier."}
        </p>
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations"
            label={
              <span>
                <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                {isAr ? 'الملاحظات / التصحيحات المطلوبة' : 'Observations / corrections attendues'}
              </span>
            }
            rules={[
              {
                required: true,
                whitespace: true,
                message: isAr ? 'الملاحظات إلزامية.' : 'Les observations sont obligatoires.',
              },
              {
                min: 10,
                message: isAr
                  ? 'يرجى تفصيل التصحيحات المطلوبة (10 أحرف على الأقل).'
                  : 'Veuillez détailler les corrections attendues (min. 10 caractères).',
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder={
                isAr
                  ? 'صِف التصحيحات المطلوبة بدقة…'
                  : 'Décrivez précisément les corrections attendues…'
              }
              showCount
              maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal : Valider ───────────────────────────────────────────────── */}
      <Modal
        title={isAr ? 'اعتماد التنازل' : 'Valider la cession'}
        open={validerModal}
        onCancel={() => setValiderModal(false)}
        onOk={() => validerM.mutate()}
        okText={isAr ? 'اعتماد وتطبيق' : 'Valider et appliquer'}
        okButtonProps={{ style: { background: '#2e7d32' }, loading: validerM.isPending }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            isAr
              ? 'سيطبِّق هذا الإجراء التنازل نهائياً ويُعيد احتساب حصص الشركاء.'
              : 'Cette action appliquera définitivement la cession et recalculera les parts des associés.'
          }
        />
        <Input.TextArea
          rows={2}
          value={validerObs}
          onChange={e => setValiderObs(e.target.value)}
          placeholder={
            isAr
              ? 'ملاحظات الكاتب (اختيارية)…'
              : 'Observations greffier (optionnel)…'
          }
        />
      </Modal>
    </div>
  );
};

export default DetailCession;
