import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Typography, Row, Col,
  Alert, Space, Popconfirm, Modal, Input, message, Spin, Divider, Form,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, CloseOutlined, RollbackOutlined,
  SendOutlined, FileDoneOutlined, ExportOutlined, SaveOutlined,
  LockOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { historiqueAPI, parametrageAPI, autorisationAPI } from '../../api/api';
import { fmtChrono } from '../../utils/formatters';
import PiecesJointesCard from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;

const STATUT_COLOR = {
  BROUILLON:   'default',
  EN_INSTANCE: 'processing',
  RETOURNE:    'warning',
  VALIDE:      'success',
  REJETE:      'error',
  ANNULE:      'default',
};

// ── Bloc données PH ───────────────────────────────────────────────────────────
const DonneesPH = ({ d, natLabel }) => {
  const { t, isAr } = useLanguage();
  return (
    <>
      <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label={isAr ? t('hist.ph.nom') : 'Nom'}><strong>{d.nom || '—'}</strong></Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.prenom') : 'Prénom'}>{d.prenom || '—'}</Descriptions.Item>
        {d.denomination_commerciale && (
          <Descriptions.Item label={isAr ? t('hist.ph.denomCommerciale') : 'Dénomination / Nom commercial'} span={2}>{d.denomination_commerciale}</Descriptions.Item>
        )}
        <Descriptions.Item label={isAr ? t('hist.ph.nni') : 'NNI'}>{d.nni || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.passeport') : 'N° Passeport'}>{d.num_passeport || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.nationalite') : 'Nationalité'}>{natLabel(d.nationalite_id) || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.dateNaissance') : 'Date de naissance'}>{d.date_naissance || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.lieuNaissance') : 'Lieu de naissance'}>{d.lieu_naissance || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.telephone') : 'Téléphone'}>{d.telephone || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.ph.adresse') : 'Adresse / Domicile'} span={2}>{d.adresse || '—'}</Descriptions.Item>
      </Descriptions>
      <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>
        {isAr ? t('hist.block.gerant') : 'Gérant'}
      </Divider>
      {d.gerant?.type === 'other' ? (
        <Descriptions column={2} size="small">
          <Descriptions.Item label={isAr ? t('hist.ph.nom') + ' ' + t('hist.ph.prenom') : 'Nom et prénom'}>
            <strong>{[d.gerant.nom_gerant, d.gerant.prenom_gerant].filter(Boolean).join(' ') || '—'}</strong>
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.ph.nationalite') : 'Nationalité'}>{natLabel(d.gerant.nationalite_id) || '—'}</Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.ph.nni') : 'NNI'}>{d.gerant.nni || '—'}</Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.ph.passeport') : 'N° Passeport'}>{d.gerant.num_passeport || '—'}</Descriptions.Item>
        </Descriptions>
      ) : (
        <Tag color="blue">
          {isAr ? t('hist.form.gerantSelf') : 'Elle / lui-même (le·la commerçant·e)'}
        </Tag>
      )}
    </>
  );
};

// ── Bloc données PM ───────────────────────────────────────────────────────────
const DonneesPM = ({ d, natLabel, formeLabel }) => {
  const { t, isAr } = useLanguage();
  return (
    <>
      <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label={isAr ? t('hist.pm.denomination') : 'Dénomination'} span={2}><strong>{d.denomination || '—'}</strong></Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.sigle') : 'Sigle'}>{d.sigle || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.formeJuridique') : 'Forme juridique'}>{formeLabel(d.forme_juridique_id) || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.capital') : 'Capital social'}>
          {d.capital_social ? `${Number(d.capital_social).toLocaleString()} ${d.devise_capital || 'MRU'}` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.duree') : 'Durée'}>{d.duree_societe ? `${d.duree_societe} ${isAr ? 'سنة' : 'ans'}` : '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.siege') : 'Siège social'} span={2}>{d.siege_social || '—'}</Descriptions.Item>
        {d.objet_social && (
          <Descriptions.Item label={isAr ? t('hist.form.objetSocial') : 'Objet social'} span={2}>{d.objet_social}</Descriptions.Item>
        )}
        <Descriptions.Item label={isAr ? t('hist.pm.telephone') : 'Téléphone'}>{d.telephone || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.fax') : 'Fax'}>{d.fax || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.email') : 'Email'}>{d.email || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.pm.bp') : 'B.P.'}>{d.bp || '—'}</Descriptions.Item>
      </Descriptions>

      {(d.associes || []).length > 0 && (
        <>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>
            {isAr ? t('hist.block.associes') : 'Associés'} ({d.associes.length})
          </Divider>
          {(d.associes || []).map((a, i) => {
            const isPH = (a.type || 'PH') !== 'PM';
            return (
              <div key={i} style={{
                borderLeft: `3px solid ${isPH ? '#1a4480' : '#389e0d'}`,
                paddingLeft: 12, marginBottom: 10,
              }}>
                <Space style={{ marginBottom: 4 }}>
                  <Tag color={isPH ? 'blue' : 'green'} style={{ fontSize: 11 }}>{a.type || 'PH'}</Tag>
                  <strong>
                    {isPH
                      ? ([a.nom, a.prenom].filter(Boolean).join(' ') || '—')
                      : (a.denomination || '—')}
                  </strong>
                  {(a.part_sociale > 0) && <Tag>{a.part_sociale}%</Tag>}
                </Space>
                {isPH ? (
                  <Descriptions column={3} size="small">
                    {a.nni           && <Descriptions.Item label={isAr ? t('hist.ph.nni') : 'NNI'}>{a.nni}</Descriptions.Item>}
                    {a.num_passeport && <Descriptions.Item label={isAr ? t('hist.ph.passeportShort') : 'Passeport'}>{a.num_passeport}</Descriptions.Item>}
                    {a.date_naissance && <Descriptions.Item label={isAr ? t('hist.ph.dateNaiss') : 'Date naiss.'}>{a.date_naissance}</Descriptions.Item>}
                    {a.lieu_naissance && <Descriptions.Item label={isAr ? t('hist.ph.lieuNaiss') : 'Lieu naiss.'}>{a.lieu_naissance}</Descriptions.Item>}
                    {a.telephone     && <Descriptions.Item label={isAr ? t('hist.ph.tel') : 'Tél.'}>{a.telephone}</Descriptions.Item>}
                    {a.domicile      && <Descriptions.Item label={isAr ? t('hist.ph.domicile') : 'Domicile'}>{a.domicile}</Descriptions.Item>}
                  </Descriptions>
                ) : (
                  <Descriptions column={3} size="small">
                    {a.numero_rc         && <Descriptions.Item label={isAr ? t('hist.ph.nrc') : 'N° RC'}>{a.numero_rc}</Descriptions.Item>}
                    {a.siege_social      && <Descriptions.Item label={isAr ? t('hist.ph.siege') : 'Siège'}>{a.siege_social}</Descriptions.Item>}
                    {a.date_immatriculation && <Descriptions.Item label={isAr ? t('hist.ph.dateImmat') : 'Date immat.'}>{a.date_immatriculation}</Descriptions.Item>}
                  </Descriptions>
                )}
              </div>
            );
          })}
        </>
      )}

      {(d.gerants || []).length > 0 && (
        <>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>
            {isAr ? t('hist.block.gerants') : 'Gérants'} ({d.gerants.length})
          </Divider>
          {(d.gerants || []).map((g, i) => (
            <div key={i} style={{ borderLeft: '3px solid #722ed1', paddingLeft: 12, marginBottom: 10 }}>
              <strong>
                {[g.nom, g.prenom].filter(Boolean).join(' ') || g.nom_gerant || '—'}
              </strong>
              <Descriptions column={3} size="small" style={{ marginTop: 4 }}>
                {g.nni           && <Descriptions.Item label={isAr ? t('hist.ph.nni') : 'NNI'}>{g.nni}</Descriptions.Item>}
                {g.num_passeport && <Descriptions.Item label={isAr ? t('hist.ph.passeportShort') : 'Passeport'}>{g.num_passeport}</Descriptions.Item>}
                {g.date_naissance && <Descriptions.Item label={isAr ? t('hist.ph.dateNaiss') : 'Date naiss.'}>{g.date_naissance}</Descriptions.Item>}
                {g.lieu_naissance && <Descriptions.Item label={isAr ? t('hist.ph.lieuNaiss') : 'Lieu naiss.'}>{g.lieu_naissance}</Descriptions.Item>}
                {g.telephone     && <Descriptions.Item label={isAr ? t('hist.ph.tel') : 'Tél.'}>{g.telephone}</Descriptions.Item>}
                {g.domicile      && <Descriptions.Item label={isAr ? t('hist.ph.domicile') : 'Domicile'}>{g.domicile}</Descriptions.Item>}
              </Descriptions>
            </div>
          ))}
        </>
      )}
    </>
  );
};

// ── Bloc données SC ───────────────────────────────────────────────────────────
const DonneesSC = ({ d, natLabel, formeLabel }) => {
  const { t, isAr } = useLanguage();
  const mm = d.maison_mere || {};
  return (
    <>
      {/* Succursale */}
      <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label={isAr ? t('hist.sc.denomination') : 'Dénomination'} span={2}><strong>{d.denomination || '—'}</strong></Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.sc.telephone') : 'Contact / Téléphone'}>{d.contact || d.telephone || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.sc.email') : 'Email'}>{d.email || '—'}</Descriptions.Item>
        <Descriptions.Item label={isAr ? t('hist.sc.siege') : 'Siège social'} span={2}>{d.adresse_siege || d.siege_social || '—'}</Descriptions.Item>
        {d.objet_social && (
          <Descriptions.Item label={isAr ? t('hist.sc.objetSocial') : 'Objet social'} span={2}>{d.objet_social}</Descriptions.Item>
        )}
        {d.observations && (
          <Descriptions.Item label={isAr ? t('hist.sc.observations') : 'Observations'} span={2}>{d.observations}</Descriptions.Item>
        )}
      </Descriptions>

      {/* Directeurs */}
      {(d.directeurs || []).length > 0 && (
        <>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>
            {isAr ? t('hist.block.directeurs') : 'Directeurs'} ({d.directeurs.length})
          </Divider>
          {(d.directeurs || []).map((dir, i) => (
            <div key={i} style={{ borderLeft: '3px solid #722ed1', paddingLeft: 12, marginBottom: 10 }}>
              <strong>{[dir.nom, dir.prenom].filter(Boolean).join(' ') || '—'}</strong>
              <Descriptions column={3} size="small" style={{ marginTop: 4 }}>
                {dir.nni           && <Descriptions.Item label={isAr ? t('hist.ph.nni') : 'NNI'}>{dir.nni}</Descriptions.Item>}
                {dir.num_passeport && <Descriptions.Item label={isAr ? t('hist.ph.passeportShort') : 'Passeport'}>{dir.num_passeport}</Descriptions.Item>}
                {dir.date_naissance && <Descriptions.Item label={isAr ? t('hist.ph.dateNaiss') : 'Date naiss.'}>{dir.date_naissance}</Descriptions.Item>}
                {dir.lieu_naissance && <Descriptions.Item label={isAr ? t('hist.ph.lieuNaiss') : 'Lieu naiss.'}>{dir.lieu_naissance}</Descriptions.Item>}
                {dir.telephone     && <Descriptions.Item label={isAr ? t('hist.ph.tel') : 'Tél.'}>{dir.telephone}</Descriptions.Item>}
                {dir.domicile      && <Descriptions.Item label={isAr ? t('hist.ph.domicile') : 'Domicile'}>{dir.domicile}</Descriptions.Item>}
              </Descriptions>
            </div>
          ))}
        </>
      )}

      {/* Société mère */}
      {(mm.denomination_sociale || mm.numero_rc) && (
        <>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0' }}>
            {isAr ? t('hist.block.maisonMere') : '🏦 Société mère'}
          </Divider>
          <Descriptions column={2} size="small">
            <Descriptions.Item label={isAr ? t('hist.mm.denomination') : 'Dénomination sociale'} span={2}>
              <strong>{mm.denomination_sociale || '—'}</strong>
            </Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.formeJuridique') : 'Forme juridique'}>{formeLabel(mm.forme_juridique_id) || '—'}</Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.nationalite') : 'Nationalité'}>{natLabel(mm.nationalite_id) || '—'}</Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.dateDepot') : 'Date dépôt statuts'}>{mm.date_depot_statuts || '—'}</Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.dateImmat') : 'Date immatriculation'}>{mm.date_immatriculation || '—'}</Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.numRC') : 'N° RC'}>{mm.numero_rc || '—'}</Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.capital') : 'Capital social'}>
              {mm.capital_social ? `${Number(mm.capital_social).toLocaleString()} ${mm.devise_capital || 'MRU'}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={isAr ? t('hist.mm.siege') : 'Siège social'} span={2}>{mm.siege_social || '—'}</Descriptions.Item>
          </Descriptions>
        </>
      )}
    </>
  );
};

const DetailHistorique = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { t, isAr } = useLanguage();
  const { hasRole }  = useAuth();
  const isGreffier   = hasRole('GREFFIER');
  const isAgent      = hasRole('AGENT_GU') || hasRole('AGENT_TRIBUNAL');

  const TYPE_LABEL = {
    PH: isAr ? t('entity.ph') : 'Personne physique',
    PM: isAr ? t('entity.pm') : 'Personne morale',
    SC: isAr ? t('entity.sc') : 'Succursale',
  };

  const [retourModal,  setRetourModal]  = useState(false);
  const [rejeterModal, setRejeterModal] = useState(false);
  const [retourForm]                    = Form.useForm();
  const [rejeterForm]                   = Form.useForm();
  const [demandeModal,  setDemandeModal]  = useState(false);
  const [demandeType,   setDemandeType]   = useState(null);
  const [demandeMotif,  setDemandeMotif]  = useState('');

  const { data: ih, isLoading, isError, error } = useQuery({
    queryKey: ['historique', id],
    queryFn:  () => historiqueAPI.get(id).then(r => r.data),
  });

  const { data: nationalites     = [] } = useQuery({
    queryKey: ['nationalites'],
    queryFn:  () => parametrageAPI.nationalites().then(r => r.data?.results || r.data || []),
  });
  const { data: formesJuridiques = [] } = useQuery({
    queryKey: ['formes-juridiques'],
    queryFn:  () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []),
  });

  const natLabel   = (nid) => nationalites.find(n => n.id === nid)?.libelle_fr || null;
  const formeLabel = (fid) => formesJuridiques.find(f => f.id === fid)?.libelle_fr || null;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['historique', id] });

  const soumettreMut = useMutation({
    mutationFn: () => historiqueAPI.soumettre(id),
    onSuccess: () => {
      message.success(isAr ? t('hist.msg.submitted') : 'Soumis au greffier.');
      // Invalider le cache des dossiers retournés AVANT la navigation
      // afin que la liste ne montre plus l'alerte dès le retour de l'agent.
      queryClient.invalidateQueries({ queryKey: ['historiques-retournes'] });
      queryClient.invalidateQueries({ queryKey: ['historiques'] });
      if (!isGreffier) {
        navigate('/historique');
      } else {
        refetch();
      }
    },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });
  const validerMut = useMutation({
    mutationFn: () => historiqueAPI.valider(id, {}),
    onSuccess: (res) => {
      message.success(
        isAr
          ? `${t('hist.alert.valide')} (${res.data.ra_numero || ''})`
          : `Dossier ${res.data.ra_numero} créé dans le registre analytique.`
      );
      refetch();
      if (res.data.ra_id) setTimeout(() => navigate(`/registres/analytique/${res.data.ra_id}`), 1500);
    },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });
  const retourMut = useMutation({
    mutationFn: (vals) => historiqueAPI.retourner(id, { observations: vals.observations }),
    onSuccess: () => {
      message.success(isAr ? t('hist.msg.returned') : 'Retourné.');
      setRetourModal(false); retourForm.resetFields(); refetch();
    },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });
  const rejeterMut = useMutation({
    mutationFn: (vals) => historiqueAPI.rejeter(id, { observations: vals.observations }),
    onSuccess: () => {
      message.success(isAr ? t('hist.msg.rejected') : 'Rejeté.');
      setRejeterModal(false); rejeterForm.resetFields(); refetch();
    },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });
  const annulerMut = useMutation({
    mutationFn: () => historiqueAPI.annuler(id),
    onSuccess: () => { message.success(isAr ? t('hist.msg.cancelled') : 'Annulé.'); refetch(); },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });

  // ── Autorisations (agents, dossier VALIDE) ────────────────────────────────
  const { data: mesDemandes = [], refetch: refetchDemandes } = useQuery({
    queryKey: ['mes-autorisations', 'HISTORIQUE', id],
    queryFn:  () => autorisationAPI.list({ type_dossier: 'HISTORIQUE', dossier_id: id }).then(r => r.data),
    enabled:  isAgent,
    refetchInterval: 30_000,
  });
  const getDemande = (typeDemande) =>
    mesDemandes.find(d => d.type_demande === typeDemande);

  const creerDemandeMut = useMutation({
    mutationFn: (payload) => autorisationAPI.create(payload),
    onSuccess: () => {
      message.success(t('autorisation.submittedOk'));
      setDemandeModal(false);
      setDemandeMotif('');
      refetchDemandes();
    },
    onError: e => message.error(e.response?.data?.detail || (isAr ? t('msg.error') : 'Erreur.')),
  });

  const openDemandeModal = (type) => { setDemandeType(type); setDemandeMotif(''); setDemandeModal(true); };

  const submitDemande = () => {
    if (!demandeMotif.trim()) {
      message.warning(isAr ? 'السبب مطلوب.' : 'Le motif est obligatoire.'); return;
    }
    creerDemandeMut.mutate({
      type_demande: demandeType,
      type_dossier: 'HISTORIQUE',
      dossier_id: Number(id),
      motif: demandeMotif,
    });
  };

  if (isLoading) return <Spin style={{ display: 'block', marginTop: 60 }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!ih)       return <AccessDenied onRetry={refetch} style="inline" />;

  const d    = ih.donnees || {};
  const s    = ih.statut;
  const isRO = s === 'VALIDE' || s === 'REJETE' || s === 'ANNULE';
  // Agent : lecture seule aussi en EN_INSTANCE (dossier soumis, en cours d'examen greffier)
  const pjReadOnly = isRO || (s === 'EN_INSTANCE' && !isGreffier);

  const cardTitle =
    ih.type_entite === 'PH' ? (isAr ? t('hist.card.ph') : 'Données personne physique') :
    ih.type_entite === 'PM' ? (isAr ? t('hist.card.pm') : 'Données personne morale') :
    (isAr ? t('hist.card.sc') : 'Données succursale');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/historique')} />
          <Title level={4} style={{ margin: 0 }}>
            {ih.numero_demande} — {isAr ? t('hist.titleDetail') : 'Immatriculation historique'}
          </Title>
          <Tag color={STATUT_COLOR[s] || 'default'} style={{ fontSize: 13 }}>{s}</Tag>
        </div>

        <Space>
          {s === 'VALIDE' && ih.ra && isGreffier && (
            <Button icon={<ExportOutlined />} onClick={() => navigate(`/registres/analytique/${ih.ra}`)}>
              {isAr ? t('hist.voirRA') : 'Voir le dossier RA'}
            </Button>
          )}

          {/* ── Agents : demande correction sur dossier transmis (EN_INSTANCE) ── */}
          {s === 'EN_INSTANCE' && isAgent && (() => {
            const dCorrection = getDemande('CORRECTION');
            if (dCorrection?.statut === 'EN_ATTENTE') return (
              <Tooltip title={isAr ? 'في انتظار قرار كاتب الضبط' : 'Demande en attente du greffier'}>
                <Button icon={<ClockCircleOutlined />} disabled style={{ color: '#faad14', borderColor: '#faad14' }}>
                  {isAr ? 'التصحيح — قيد الانتظار' : 'Correction — en attente'}
                </Button>
              </Tooltip>
            );
            return (
              <Tooltip title={
                dCorrection?.statut === 'REFUSEE'
                  ? (isAr ? `مرفوض : ${dCorrection?.motif_decision || ''}` : `Refusé : ${dCorrection?.motif_decision || ''}`)
                  : (isAr ? 'طلب استرداد الملف للتصحيح — يتطلب موافقة كاتب الضبط' : 'Demander au greffier de retourner ce dossier pour correction')
              }>
                <Button
                  icon={<LockOutlined />}
                  danger={dCorrection?.statut === 'REFUSEE'}
                  style={dCorrection?.statut !== 'REFUSEE' ? { borderColor: '#722ed1', color: '#722ed1' } : undefined}
                  onClick={() => openDemandeModal('CORRECTION')}>
                  {isAr ? '🔒 طلب التصحيح' : '🔒 Demander correction'}
                </Button>
              </Tooltip>
            );
          })()}

          {/* ── Agents : demande d'autorisation (dossier VALIDE) ─────────── */}
          {s === 'VALIDE' && isAgent && (() => {
            const dCorrection = getDemande('CORRECTION');
            if (dCorrection?.statut === 'EN_ATTENTE') return (
              <Tooltip title={isAr ? 'في انتظار قرار كاتب الضبط' : 'En attente du greffier'}>
                <Button icon={<ClockCircleOutlined />} disabled style={{ color: '#faad14', borderColor: '#faad14' }}>
                  {isAr ? 'التصحيح — قيد الانتظار' : 'Correction — en attente'}
                </Button>
              </Tooltip>
            );
            return (
              <Tooltip title={
                dCorrection?.statut === 'REFUSEE'
                  ? (isAr ? `مرفوض : ${dCorrection?.motif_decision || ''}` : `Refusé : ${dCorrection?.motif_decision || ''}`)
                  : (isAr ? 'طلب تصحيح الملف المصادق عليه — يتطلب موافقة كاتب الضبط' : 'Demander une correction au greffier (dossier retournera en RETOURNE)')
              }>
                <Button
                  icon={<LockOutlined />}
                  danger={dCorrection?.statut === 'REFUSEE'}
                  style={dCorrection?.statut !== 'REFUSEE' ? { borderColor: '#722ed1', color: '#722ed1' } : undefined}
                  onClick={() => openDemandeModal('CORRECTION')}>
                  {isAr ? '🔒 طلب التصحيح' : '🔒 Demander correction'}
                </Button>
              </Tooltip>
            );
          })()}
          {(s === 'BROUILLON' || s === 'RETOURNE') && !isRO && (
            <>
              <Button icon={<SaveOutlined />} onClick={() => navigate(`/historique/${id}/modifier`)}>
                {isAr ? t('common.edit') : 'Modifier'}
              </Button>
              <Popconfirm
                title={isAr ? t('hist.confirm.soumettre') : 'Soumettre cette demande au greffier ?'}
                onConfirm={() => soumettreMut.mutate()}
              >
                <Button type="primary" icon={<SendOutlined />} loading={soumettreMut.isPending}
                  style={{ background: '#1a4480' }}>
                  {isAr ? t('action.soumettre') : 'Soumettre'}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={isAr ? t('hist.confirm.annuler') : 'Annuler cette demande ?'}
                onConfirm={() => annulerMut.mutate()}
              >
                <Button danger icon={<CloseOutlined />}>
                  {isAr ? t('action.annuler') : 'Annuler'}
                </Button>
              </Popconfirm>
            </>
          )}
          {s === 'EN_INSTANCE' && isGreffier && (
            <>
              <Button icon={<RollbackOutlined />} onClick={() => setRetourModal(true)}>
                {isAr ? t('action.retourner') : 'Retourner'}
              </Button>
              <Button danger icon={<CloseOutlined />} onClick={() => setRejeterModal(true)}>
                {isAr ? t('action.rejeter') : 'Rejeter'}
              </Button>
              <Popconfirm
                title={isAr ? t('hist.confirm.valider') : 'Valider et créer le dossier dans le registre analytique ?'}
                onConfirm={() => validerMut.mutate()}
              >
                <Button type="primary" icon={<CheckOutlined />} loading={validerMut.isPending}
                  style={{ background: '#389e0d' }}>
                  {isAr ? t('action.valider') : 'Valider'}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </div>

      {s === 'RETOURNE' && ih.observations && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message={`${isAr ? t('hist.alert.retourne') : 'Retourné — motif :'} ${ih.observations}`} />
      )}
      {s === 'REJETE' && ih.observations && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={`${isAr ? t('hist.alert.rejete') : 'Rejeté — motif :'} ${ih.observations}`} />
      )}
      {s === 'VALIDE' && (
        <Alert type="success" showIcon style={{ marginBottom: 16 }}
          message={`${isAr ? t('hist.alert.valide') : 'Dossier validé et créé dans le registre analytique'} (${ih.ra_numero || ''})`} />
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Card title={isAr ? t('hist.card.infos') : 'Données historiques'} size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={isAr ? t('field.numeroRA') : 'N° Analytique'}><strong>{ih.numero_ra}</strong></Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.numAnneeChrono') : 'N° / Année chrono'}>{ih.annee_chrono} / {fmtChrono(ih.numero_chrono)}</Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.ph.dateImmat') : 'Date immatriculation'}>
                {ih.date_immatriculation}
                {d.heure_immatriculation ? ` ${isAr ? 'في' : 'à'} ${d.heure_immatriculation}` : ''}
              </Descriptions.Item>
              {ih.type_entite === 'PH' && d.denomination_commerciale && (
                <Descriptions.Item label={isAr ? t('hist.ph.denomCommerciale') : 'Dénomination commerciale'}>{d.denomination_commerciale}</Descriptions.Item>
              )}
              <Descriptions.Item label={isAr ? t('field.typeEntite') : 'Type entité'}><Tag>{TYPE_LABEL[ih.type_entite] || ih.type_entite}</Tag></Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.greffe') : 'Greffe'}>{ih.localite_label || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card title={isAr ? t('hist.card.tracabilite') : 'Traçabilité'} size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              {ih.demandeur && (
                <Descriptions.Item label={isAr ? 'مُقدِّم الطلب' : 'Demandeur'}>{ih.demandeur}</Descriptions.Item>
              )}
              <Descriptions.Item label={isAr ? t('hist.creePar') : 'Créée par'}>{ih.created_by_nom}</Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.creeLe') : 'Créée le'}>{ih.created_at ? new Date(ih.created_at).toLocaleString('fr-FR') : '—'}</Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.valideePar') : 'Validée par'}>{ih.validated_by_nom}</Descriptions.Item>
              <Descriptions.Item label={isAr ? t('hist.valideeLe') : 'Validée le'}>{ih.validated_at ? new Date(ih.validated_at).toLocaleString('fr-FR') : '—'}</Descriptions.Item>
              {ih.import_batch && (
                <Descriptions.Item label={isAr ? t('hist.batchImport') : 'Batch import'}>
                  {ih.import_batch} ({isAr ? 'سطر' : 'ligne'} {ih.import_row})
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card title={cardTitle} size="small" style={{ marginBottom: 16 }}>
        {ih.type_entite === 'PH' && <DonneesPH d={d} natLabel={natLabel} />}
        {ih.type_entite === 'PM' && <DonneesPM d={d} natLabel={natLabel} formeLabel={formeLabel} />}
        {ih.type_entite === 'SC' && <DonneesSC d={d} natLabel={natLabel} formeLabel={formeLabel} />}
      </Card>

      {/* Pièces jointes : masquées pour l'agent sur un dossier VALIDE */}
      {(isGreffier || s !== 'VALIDE') && (
        <PiecesJointesCard entityType="immatriculation_hist" entityId={id} readOnly={pjReadOnly} />
      )}

      {/* Modales */}
      <Modal
        title={`🔄 ${isAr ? t('hist.modal.retourTitle') : "Retourner à l'agent"}`}
        open={retourModal}
        onCancel={() => { setRetourModal(false); retourForm.resetFields(); }}
        onOk={() => retourForm.validateFields().then(vals => retourMut.mutate(vals))}
        confirmLoading={retourMut.isPending}
        okText={isAr ? t('action.retourner') : 'Retourner'}
        destroyOnClose
      >
        <p style={{ color: '#555', marginBottom: 12 }}>
          {isAr ? t('hist.modal.retourInfo') : "Ces observations seront communiquées à l'agent et historisées dans le suivi du dossier."}
        </p>
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations"
            label={<span><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>{isAr ? t('hist.modal.retourObsLabel') : 'Observations / corrections attendues'}</span>}
            rules={[
              { required: true, whitespace: true, message: isAr ? t('validation.retourObsRequired') : 'Les observations sont obligatoires.' },
              { min: 10, message: isAr ? t('validation.retourObsRequired') : 'Veuillez détailler les corrections attendues (min. 10 caractères).' },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder={isAr ? t('hist.modal.retourPlaceholder') : 'Décrivez précisément les corrections attendues…'}
              showCount maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`❌ ${isAr ? t('hist.modal.rejeterTitle') : 'Rejeter la demande'}`}
        open={rejeterModal}
        onCancel={() => { setRejeterModal(false); rejeterForm.resetFields(); }}
        onOk={() => rejeterForm.validateFields().then(vals => rejeterMut.mutate(vals))}
        confirmLoading={rejeterMut.isPending}
        okText={isAr ? t('action.rejeter') : 'Rejeter'}
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <p style={{ color: '#555', marginBottom: 12 }}>
          {isAr ? t('hist.modal.rejeterInfo') : "Le motif de rejet sera communiqué à l'agent et historisé."}
        </p>
        <Form form={rejeterForm} layout="vertical">
          <Form.Item
            name="observations"
            label={<span><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>{isAr ? t('hist.modal.rejeterMotif') : 'Motif du rejet'}</span>}
            rules={[
              { required: true, whitespace: true, message: isAr ? t('validation.retourObsRequired') : 'Le motif du rejet est obligatoire.' },
              { min: 10, message: isAr ? t('validation.retourObsRequired') : 'Veuillez détailler le motif (min. 10 caractères).' },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder={isAr ? t('hist.modal.rejeterPlaceholder') : 'Précisez le motif du rejet…'}
              showCount maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal demande d'autorisation (agents, dossier VALIDE) ──────────── */}
      <Modal
        title={`🔒 ${isAr ? t('autorisation.demanderCorrection') : 'Demander une autorisation de correction'}`}
        open={demandeModal}
        onCancel={() => { setDemandeModal(false); setDemandeMotif(''); }}
        onOk={submitDemande}
        okText={isAr ? 'إرسال الطلب' : 'Envoyer la demande'}
        cancelText={isAr ? 'إلغاء' : 'Annuler'}
        confirmLoading={creerDemandeMut.isPending}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={isAr
            ? 'بعد الموافقة، سيُعاد الملف تلقائياً إلى حالة "مُعاد" لتمكينك من التصحيح.'
            : 'Après autorisation, le dossier repassera automatiquement à l\'état RETOURNE pour vous permettre de corriger.'}
        />
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: 500 }}>
            {isAr ? t('autorisation.motifLabel') : 'Motif de la demande'}{' '}
            <span style={{ color: '#ff4d4f' }}>*</span>
          </label>
        </div>
        <Input.TextArea
          rows={4}
          placeholder={isAr ? t('autorisation.motifPlaceholder') : 'Expliquez la raison de votre demande...'}
          value={demandeMotif}
          onChange={e => setDemandeMotif(e.target.value)}
          showCount
          maxLength={500}
        />
      </Modal>
    </div>
  );
};

export default DetailHistorique;
