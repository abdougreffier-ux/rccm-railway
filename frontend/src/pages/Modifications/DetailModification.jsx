import React, { useState } from 'react';
import {
  Card, Button, Tag, Descriptions, Typography, Space, Divider,
  Modal, Input, Popconfirm, Alert, message, Table, Form, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, SendOutlined,
  CheckCircleOutlined, RollbackOutlined, CloseCircleOutlined,
  UndoOutlined, ToolOutlined, WarningOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modifAPI, rapportAPI, openPDF, parametrageAPI } from '../../api/api';
import PiecesJointesCard from '../../components/PiecesJointesCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title, Text } = Typography;

const DetailModification = () => {
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

  const { data: modif, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['modification', id],
    queryFn:  () => modifAPI.get(id).then(r => r.data),
  });

  const soumettreM = useMutation({
    mutationFn: () => modifAPI.soumettre(id),
    onSuccess: () => { message.success('Dossier soumis au greffier.'); queryClient.invalidateQueries({ queryKey: ['modification', id] }); queryClient.invalidateQueries({ queryKey: ['modifications'] }); },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const retournerM = useMutation({
    mutationFn: (vals) => modifAPI.retourner(id, { observations: vals.observations }),
    onSuccess: () => { message.warning('Dossier retourné à l\'agent.'); setRetourModal(false); retourForm.resetFields(); queryClient.invalidateQueries({ queryKey: ['modification', id] }); queryClient.invalidateQueries({ queryKey: ['modifications'] }); },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const validerM = useMutation({
    mutationFn: () => modifAPI.valider(id, { observations: validerObs }),
    onSuccess: () => { message.success('Modification validée et appliquée.'); setValiderModal(false); queryClient.invalidateQueries({ queryKey: ['modification', id] }); queryClient.invalidateQueries({ queryKey: ['modifications'] }); },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const annulerM = useMutation({
    mutationFn: () => modifAPI.annuler(id),
    onSuccess: () => { message.info('Modification annulée.'); queryClient.invalidateQueries({ queryKey: ['modifications'] }); navigate('/modifications'); },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const annulerValideM = useMutation({
    mutationFn: () => modifAPI.annulerValide(id),
    onSuccess: () => {
      message.success('Modification annulée. État précédent restauré.');
      queryClient.invalidateQueries({ queryKey: ['modification', id] });
      queryClient.invalidateQueries({ queryKey: ['modifications'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const { data: formesJuridiques = [] } = useQuery({
    queryKey: ['formes-juridiques'],
    queryFn:  () => parametrageAPI.formesJuridiques().then(r => r.data?.results || r.data || []),
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!modif)    return <AccessDenied onRetry={refetch} style="inline" />;

  const nd     = modif.nouvelles_donnees || {};
  const entity = nd.entity || {};
  const ra     = nd.ra     || {};
  const meta   = nd.meta   || {};
  const av     = modif.avant_donnees || {};
  const avEnt  = av.entity || {};
  const avRa   = av.ra     || {};
  const avMeta = av.meta   || {};
  const isPH   = modif.ra_type_entite === 'PH';

  // ── Labels lisibles pour le diff avant validation ─────────────────────────
  const FIELD_LABELS = {
    denomination:       isPH ? 'Nom commercial (enseigne)' : 'Dénomination',
    denomination_ar:    'Dénomination (AR)',
    sigle:              'Sigle',
    forme_juridique_id: 'Forme juridique',
    capital_social:     'Capital social',
    devise_capital:     'Devise du capital',
    duree_societe:      'Durée de la société',
    siege_social:       'Siège social',
    objet_social:       'Objet social',
    ville:              'Ville',
    telephone:          'Téléphone',
    fax:                'Fax',
    email:              'E-mail',
    site_web:           'Site web',
    bp:                 'B.P.',
    adresse:            'Adresse',
    adresse_ar:         'Adresse (AR)',
    profession:         'Profession / Activité exercée',
    activite:           'Activité',
    capital_affecte:    'Capital affecté',
  };

  // ── Résolution des valeurs de référence (ID → libellé) ───────────────────
  const _fjMap = Object.fromEntries(formesJuridiques.map(f => [String(f.id), isAr ? (f.libelle_ar || f.libelle_fr) : `${f.code} – ${f.libelle_fr}`]));

  const resolveValue = (field, value) => {
    const v = String(value ?? '');
    if (field === 'forme_juridique_id') return _fjMap[v] || v;
    return v;
  };

  // ── Tableau AVANT/APRÈS ───────────────────────────────────────────────────
  // Si les lignes ont été peuplées par le backend (statut VALIDE), on les utilise.
  // Sinon, on construit un affichage depuis nouvelles_donnees (avant validation).
  const lignes = modif.lignes || [];
  const hasLignes = lignes.length > 0;

  const diffRows = hasLignes
    ? lignes.map(l => ({
        key:   l.id,
        champ: l.libelle_champ || l.code_champ,
        avant: resolveValue(l.code_champ, l.ancienne_valeur),
        apres: resolveValue(l.code_champ, l.nouvelle_valeur),
      }))
    : [
        ...Object.entries(entity)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => ({
            key:   k,
            champ: FIELD_LABELS[k] || k,
            avant: resolveValue(k, avEnt[k] ?? '—'),
            apres: resolveValue(k, v),
          })),
        ...Object.entries(ra)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => ({
            key:   `ra_${k}`,
            champ: FIELD_LABELS[k] || `(RA) ${k}`,
            avant: resolveValue(k, avRa[k] ?? '—'),
            apres: resolveValue(k, v),
          })),
        // Gérant (meta PH) — présent avant validation
        ...(meta.nouveau_gerant_nom ? [{
            key:   'meta_gerant',
            champ: 'Gérant',
            avant: avMeta.gerant_actif_nom || '—',
            apres: meta.nouveau_gerant_nom,
          }] : []),
        // Directeur (meta SC) — nouveau format objet ou ancien format chaîne
        ...(() => {
          const dObj = meta.nouveau_directeur || (meta.nouveau_directeur_nom ? { nom: meta.nouveau_directeur_nom } : null);
          if (!dObj) return [];
          const nom    = (dObj.nom    || '').trim();
          const prenom = (dObj.prenom || '').trim();
          const apres  = prenom ? `${prenom} ${nom}`.trim() : nom;
          return apres ? [{
            key:   'meta_directeur',
            champ: 'Directeur',
            avant: avMeta.directeur_actif_nom || '—',
            apres,
          }] : [];
        })(),
        // ── Organes PM — nouveau format événementiel (avant validation) ───────
        ...(() => {
          const evOrg   = meta.evenements_organes   || {};
          const nouvNom = meta.nouvelles_nominations || {};
          if (!Object.keys(evOrg).length && !Object.keys(nouvNom).length) return [];
          const rows = [];
          const _SORT_LBL = {
            DEMISSION:  isAr ? 'استقالة'       : 'Démission',
            REVOCATION: isAr ? 'إقالة'         : 'Révocation',
            FIN_MANDAT: isAr ? 'انتهاء المهمة' : 'Fin de mandat',
          };
          const _ORG_LBL = {
            gerants:         isAr ? 'المسير(ون)'          : 'Gérant(s)',
            administrateurs: isAr ? 'مجلس الإدارة'        : "Conseil d'administration",
            dirigeants:      isAr ? 'المديرون التنفيذيون' : 'Dirigeant(s) — DG/PDG',
            commissaires:    isAr ? 'مراقبو الحسابات'     : 'Commissaire(s) aux comptes',
          };
          const _AV_KEY = {
            gerants:        'gerants_pm_actifs',
            administrateurs: 'administrateurs_actifs',
            dirigeants:     'dirigeants_actifs',
            commissaires:   'commissaires_actifs',
          };
          const _fmtOrg = (o) => {
            if (!o || typeof o !== 'object') return '—';
            const nom    = (isAr ? (o.nom_ar    || o.nom)    : (o.nom    || o.nom_ar)    || '').trim();
            const prenom = (isAr ? (o.prenom_ar || o.prenom) : (o.prenom || o.prenom_ar) || '').trim();
            const fn     = (o.fonction || o.role || '').trim();
            const label  = prenom ? `${prenom} ${nom}`.trim() : nom;
            return fn ? `${label} (${fn})` : (label || '—');
          };

          // Événements sortie (DEMISSION / REVOCATION / FIN_MANDAT)
          Object.entries(evOrg).forEach(([typeKey, evList]) => {
            if (!Array.isArray(evList)) return;
            const typeLabel = _ORG_LBL[typeKey] || typeKey;
            const avIdx = {};
            (avMeta[_AV_KEY[typeKey] || typeKey] || []).forEach(o => {
              if (o && o.id) avIdx[String(o.id)] = o;
            });
            evList.forEach((ev, i) => {
              if (!ev || ev.sort === 'MAINTENU') return;
              const existing  = avIdx[String(ev.id)] || {};
              const sortLabel = _SORT_LBL[ev.sort] || ev.sort;
              const parties = [`[${sortLabel}]`];
              if (ev.date_effet)   parties.push(isAr ? `تاريخ السريان : ${ev.date_effet}`   : `Effet le ${ev.date_effet}`);
              if (ev.ref_decision) parties.push(isAr ? `القرار : ${ev.ref_decision}` : `Décision : ${ev.ref_decision}`);
              rows.push({
                key:   `ev_${typeKey}_sortie_${i}`,
                champ: isAr ? `${typeLabel} — خروج` : `${typeLabel} — Sortie`,
                avant: _fmtOrg(existing),
                apres: parties.join(' — '),
              });
              // Remplaçant désigné
              if (ev.remplacant && typeof ev.remplacant === 'object') {
                rows.push({
                  key:   `ev_${typeKey}_rempl_${i}`,
                  champ: isAr ? `${typeLabel} — خلف` : `${typeLabel} — Remplacement`,
                  avant: _fmtOrg(existing),
                  apres: `[${isAr ? 'تعيين خلف' : 'Remplacement'}] ${_fmtOrg(ev.remplacant)}`,
                });
              }
            });
          });

          // Nouvelles nominations (sans sortie)
          Object.entries(nouvNom).forEach(([typeKey, nomList]) => {
            if (!Array.isArray(nomList)) return;
            const typeLabel = _ORG_LBL[typeKey] || typeKey;
            nomList.forEach((nom, i) => {
              const label = _fmtOrg(nom);
              if (label && label !== '—') {
                rows.push({
                  key:   `ev_${typeKey}_nom_${i}`,
                  champ: isAr ? `${typeLabel} — تعيين جديد` : `${typeLabel} — Nouvelle nomination`,
                  avant: '—',
                  apres: `[${isAr ? 'تعيين' : 'Nomination'}] ${label}`,
                });
              }
            });
          });

          return rows;
        })(),
      ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/modifications')} />
          <Title level={4} style={{ margin: 0 }}>
            {modif.numero_modif} — {modif.ra_denomination}
          </Title>
          <Tag color={STATUT_CONFIG[modif.statut]?.color}>{STATUT_CONFIG[modif.statut]?.label}</Tag>
        </Space>
        <Space>
          {/* Agent actions */}
          {['BROUILLON', 'RETOURNE'].includes(modif.statut) && (
            <>
              <Button icon={<EditOutlined />}
                onClick={() => navigate(`/modifications/${id}/modifier`)}>
                Modifier
              </Button>
              <Button type="primary" icon={<SendOutlined />}
                onClick={() => soumettreM.mutate()}
                loading={soumettreM.isPending}
                style={{ background: '#1a4480' }}>
                Soumettre au greffier
              </Button>
              <Popconfirm title="Annuler cette demande ?" onConfirm={() => annulerM.mutate()}>
                <Button danger icon={<CloseCircleOutlined />} loading={annulerM.isPending}>Annuler</Button>
              </Popconfirm>
            </>
          )}
          {/* Greffier actions — masqués pour les agents */}
          {modif.statut === 'EN_INSTANCE' && isGreffier && (
            <>
              <Button icon={<RollbackOutlined />} onClick={() => setRetourModal(true)}>
                Retourner
              </Button>
              <Button type="primary" icon={<CheckCircleOutlined />}
                onClick={() => setValiderModal(true)}
                style={{ background: '#2e7d32' }}>
                Valider
              </Button>
            </>
          )}
          {/* Greffier — annulation / correction post-validation (7j max, pas d'op ultérieure) */}
          {modif.statut === 'VALIDE' && modif.can_modifier_correctif && isGreffier && (
            <Button icon={<ToolOutlined />}
              onClick={() => navigate(`/modifications/${id}/corriger`)}
              style={{ borderColor: '#d97706', color: '#d97706' }}>
              Modifier (correctif)
            </Button>
          )}
          {modif.statut === 'VALIDE' && modif.can_annuler_valide && isGreffier && (
            <Popconfirm
              title="Annuler cette modification ?"
              description="L'état précédent sera restauré. Cette action est irréversible."
              onConfirm={() => annulerValideM.mutate()}
              okText="Confirmer l'annulation"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<UndoOutlined />} loading={annulerValideM.isPending}>
                Annuler (greffier)
              </Button>
            </Popconfirm>
          )}
          {/* Certificat d'inscription modificative — disponible après validation */}
          {modif.statut === 'VALIDE' && (
            <Button icon={<FilePdfOutlined />}
              onClick={() => openPDF(rapportAPI.certificatModification(modif.id))}>
              {isAr ? 'شهادة القيد التعديلي' : 'Certificat modificatif'}
            </Button>
          )}
        </Space>
      </div>

      {/* Alerte rectification initiée par le greffier — priorité maximale */}
      {modif.statut === 'RETOURNE' && modif.est_rectification_greffier && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={t('modif.rectifGreffierTitre') || 'Rectification demandée par le greffier'}
          description={
            <div>
              <p style={{ margin: '4px 0 8px' }}>
                <strong>{t('field.observations') || 'Motif'} :</strong> {modif.observations}
              </p>
              <p style={{ margin: 0, color: '#555', fontSize: 13 }}>
                {t('modif.rectifGreffierInfo') || 'Renseignez les nouvelles données dans le formulaire ci-dessous, puis soumettez au greffier.'}
              </p>
            </div>
          }
        />
      )}

      {/* Alerte retour normal (non greffier) */}
      {modif.statut === 'RETOURNE' && !modif.est_rectification_greffier && modif.observations && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message={`${t('status.retourne') || 'Retourné'} — ${modif.observations}`} />
      )}

      {/* Info dossier */}
      <Card title="Informations" size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="N° Modification">{modif.numero_modif}</Descriptions.Item>
          <Descriptions.Item label="N° Analytique">{modif.ra_numero}</Descriptions.Item>
          <Descriptions.Item label="Dénomination">{modif.ra_denomination}</Descriptions.Item>
          <Descriptions.Item label="Date">{modif.date_modif}</Descriptions.Item>
          {(modif.demandeur || meta.demandeur) && (
            <Descriptions.Item label="Demandeur">{modif.demandeur || meta.demandeur}</Descriptions.Item>
          )}
          <Descriptions.Item label="Créé par">{modif.created_by_nom}</Descriptions.Item>
          <Descriptions.Item label="Validé par">{modif.validated_by_nom || '—'}</Descriptions.Item>
          {modif.observations && (
            <Descriptions.Item label="Observations" span={2}>{modif.observations}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Modifications demandées — tableau AVANT/APRÈS */}
      <Card
        title={modif.statut === 'VALIDE' ? 'Modifications appliquées' : 'Modifications demandées'}
        size="small"
        style={{ marginBottom: 16 }}
      >
        {diffRows.length === 0 ? (
          <Text type="secondary">Aucune modification saisie.</Text>
        ) : (
          <Table
            dataSource={diffRows}
            columns={[
              {
                title: 'Champ', dataIndex: 'champ', key: 'champ', width: 180,
                render: v => <strong>{v}</strong>,
              },
              {
                title: 'Ancienne valeur', dataIndex: 'avant', key: 'avant',
                render: v => v && v !== '—'
                  ? <span style={{ color: '#b91c1c', textDecoration: modif.statut === 'VALIDE' ? 'line-through' : 'none' }}>{v}</span>
                  : <Text type="secondary">—</Text>,
              },
              {
                title: 'Nouvelle valeur', dataIndex: 'apres', key: 'apres',
                render: v => v
                  ? <span style={{ color: '#15803d', fontWeight: 500 }}>{v}</span>
                  : <Text type="secondary">—</Text>,
              },
            ]}
            pagination={false}
            size="small"
          />
        )}
      </Card>

      {/* Pièces jointes */}
      <div style={{ marginBottom: 16 }}>
        <PiecesJointesCard
          entityType="modification"
          entityId={Number(id)}
          readOnly={modif.statut === 'VALIDE' || modif.statut === 'ANNULE'}
        />
      </div>

      {/* Retourner modal */}
      <Modal title="🔄 Retourner le dossier à l'agent" open={retourModal}
        onCancel={() => { setRetourModal(false); retourForm.resetFields(); }}
        onOk={() => retourForm.validateFields().then(vals => retournerM.mutate(vals))}
        okText="Retourner" okButtonProps={{ danger: true, loading: retournerM.isPending }}
        destroyOnClose>
        <p style={{ color: '#555', marginBottom: 12 }}>
          Ces observations seront communiquées à l'agent et historisées dans le suivi du dossier.
        </p>
        <Form form={retourForm} layout="vertical">
          <Form.Item
            name="observations"
            label={<span><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>Observations / corrections attendues</span>}
            rules={[
              { required: true, whitespace: true, message: 'Les observations sont obligatoires.' },
              { min: 10, message: 'Veuillez détailler les corrections attendues (min. 10 caractères).' },
            ]}
          >
            <Input.TextArea rows={4} placeholder="Décrivez précisément les corrections attendues…" showCount maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Valider modal */}
      <Modal title="Valider la modification" open={validerModal}
        onCancel={() => setValiderModal(false)}
        onOk={() => validerM.mutate()}
        okText="Valider et appliquer" okButtonProps={{ style: { background: '#2e7d32' }, loading: validerM.isPending }}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="Cette action appliquera définitivement les modifications à la fiche de l'entreprise." />
        <Input.TextArea rows={2} value={validerObs} onChange={e => setValiderObs(e.target.value)}
          placeholder="Observations greffier (optionnel)…" />
      </Modal>
    </div>
  );
};

export default DetailModification;
