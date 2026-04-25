import React, { useState } from 'react';
import {
  Card, Button, Tag, Descriptions, Typography, Space,
  Popconfirm, Alert, message, Modal, Input, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FilePdfOutlined, UndoOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { radiationAPI, rapportAPI, openPDF } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getMotifLabel } from './motifRadiation';
import PiecesJointesCard from '../../components/PiecesJointesCard';
import AccessDenied from '../../components/Common/AccessDenied';

const { Title } = Typography;

const DetailRadiation = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { t, isAr } = useLanguage();
  const { hasRole } = useAuth();
  const isGreffier  = hasRole('GREFFIER');
  const STATUT_CONFIG = {
    EN_COURS: { color: 'processing', label: t('status.enCours')  },
    VALIDEE:  { color: 'success',    label: t('status.validee')  },
    REJETEE:  { color: 'error',      label: t('status.rejetee')  },
    ANNULEE:  { color: 'default',    label: t('status.annulee')  },
  };
  const [annulModal,  setAnnulModal]  = useState(false);
  const [annulMotif,  setAnnulMotif]  = useState('');

  const { data: rad, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['radiation', id],
    queryFn:  () => radiationAPI.get(id).then(r => r.data),
  });

  const validerM = useMutation({
    mutationFn: () => radiationAPI.valider(id),
    onSuccess:  () => {
      message.success('Radiation validée. Le dossier est radié.');
      queryClient.invalidateQueries({ queryKey: ['radiation', id] });
      queryClient.invalidateQueries({ queryKey: ['radiations'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const rejeterM = useMutation({
    mutationFn: () => radiationAPI.rejeter(id),
    onSuccess:  () => {
      message.warning('Radiation rejetée.');
      queryClient.invalidateQueries({ queryKey: ['radiation', id] });
      queryClient.invalidateQueries({ queryKey: ['radiations'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const annulerM = useMutation({
    mutationFn: () => radiationAPI.annuler(id),
    onSuccess:  () => {
      message.info('Demande de radiation annulée.');
      queryClient.invalidateQueries({ queryKey: ['radiations'] });
      navigate('/radiations');
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  const annulerValidationM = useMutation({
    mutationFn: () => radiationAPI.annulerValidation(id, { motif: annulMotif }),
    onSuccess:  () => {
      message.success('Radiation annulée. Dossier réactivé.');
      setAnnulModal(false);
      setAnnulMotif('');
      queryClient.invalidateQueries({ queryKey: ['radiation', id] });
      queryClient.invalidateQueries({ queryKey: ['radiations'] });
    },
    onError: e => message.error(e.response?.data?.detail || 'Erreur'),
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (isError)   return <AccessDenied status={error?.response?.status} onRetry={refetch} style="inline" />;
  if (!rad)      return <AccessDenied onRetry={refetch} style="inline" />;

  // Allow adding docs on VALIDEE radiations (needed for annulation justificatif)
  const isReadOnly = rad.statut === 'REJETEE' || rad.statut === 'ANNULEE';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/radiations')} />
          <Title level={4} style={{ margin: 0 }}>
            {rad.numero_radia} — {rad.ra_denomination}
          </Title>
          <Tag color={STATUT_CONFIG[rad.statut]?.color}>{STATUT_CONFIG[rad.statut]?.label}</Tag>
        </Space>
        <Space>
          {/* Valider / Rejeter / Annuler — réservés exclusivement au greffier (CDC §5) */}
          {isGreffier && rad.statut === 'EN_COURS' && (
            <>
              <Popconfirm
                title="Valider la radiation ?"
                description="Cette action radiera définitivement le dossier."
                onConfirm={() => validerM.mutate()}
                okText="Valider"
                okButtonProps={{ style: { background: '#b91c1c' } }}
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={validerM.isPending}
                  style={{ background: '#b91c1c' }}
                >
                  Valider
                </Button>
              </Popconfirm>
              <Popconfirm title="Rejeter cette demande ?" onConfirm={() => rejeterM.mutate()}>
                <Button danger icon={<CloseCircleOutlined />} loading={rejeterM.isPending}>Rejeter</Button>
              </Popconfirm>
              <Popconfirm title="Annuler cette demande ?" onConfirm={() => annulerM.mutate()}>
                <Button icon={<CloseCircleOutlined />} loading={annulerM.isPending}>Annuler</Button>
              </Popconfirm>
            </>
          )}
          {rad.statut === 'VALIDEE' && (
            <>
              {/* Certificat : accessible au greffier uniquement (EstGreffier côté backend) */}
              {isGreffier && (
                <Button
                  icon={<FilePdfOutlined />}
                  style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }}
                  onClick={() => openPDF(rapportAPI.certificatRadiation(id))}
                >
                  Certificat de radiation
                </Button>
              )}
              {/* Annuler la radiation : réservé au greffier */}
              {isGreffier && (
                <Button
                  icon={<UndoOutlined />}
                  onClick={() => setAnnulModal(true)}
                  style={{ borderColor: '#059669', color: '#059669' }}
                >
                  Annuler la radiation
                </Button>
              )}
            </>
          )}
        </Space>
      </div>

      <Card title="Informations" size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="N° Radiation">{rad.numero_radia}</Descriptions.Item>
          <Descriptions.Item label="N° Analytique">{rad.ra_numero}</Descriptions.Item>
          <Descriptions.Item label="Dénomination">{rad.ra_denomination}</Descriptions.Item>
          <Descriptions.Item label="N° RC">{rad.ra_numero_rc || '—'}</Descriptions.Item>
          <Descriptions.Item label="Date de radiation">{rad.date_radiation}</Descriptions.Item>
          <Descriptions.Item label={isAr ? 'السبب' : 'Motif'}>
            <Tag color="red">{getMotifLabel(rad.motif, isAr)}</Tag>
          </Descriptions.Item>
          {rad.description && (
            <Descriptions.Item label="Description" span={2}>{rad.description}</Descriptions.Item>
          )}
          {rad.demandeur && (
            <Descriptions.Item label="Demandeur">{rad.demandeur}</Descriptions.Item>
          )}
          <Descriptions.Item label="Créé par">{rad.created_by_nom || '—'}</Descriptions.Item>
          <Descriptions.Item label="Validé / Traité par">{rad.validated_by_nom || '—'}</Descriptions.Item>
          {rad.validated_at && (
            <Descriptions.Item label="Date de traitement" span={2}>
              {new Date(rad.validated_at).toLocaleString('fr-FR')}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {rad.statut === 'EN_COURS' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Une pièce justificative est obligatoire pour valider la radiation. Joignez-la ci-dessous si ce n'est pas encore fait."
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <PiecesJointesCard
          entityType="radiation"
          entityId={Number(id)}
          readOnly={isReadOnly}
        />
      </div>
      <Modal
        title="Annuler la radiation"
        open={annulModal}
        onCancel={() => { setAnnulModal(false); setAnnulMotif(''); }}
        onOk={() => annulerValidationM.mutate()}
        okText="Confirmer l'annulation"
        okButtonProps={{ style: { background: '#059669' }, loading: annulerValidationM.isPending }}
        cancelText="Annuler"
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Le dossier sera réactivé (statut IMMATRICULE). Une pièce justificative doit déjà être jointe à cette radiation."
        />
        <p><strong>Motif de l'annulation (obligatoire) :</strong></p>
        <Input.TextArea
          rows={3}
          value={annulMotif}
          onChange={e => setAnnulMotif(e.target.value)}
          placeholder="Saisissez le motif de l'annulation de la radiation…"
        />
      </Modal>
    </div>
  );
};

export default DetailRadiation;
