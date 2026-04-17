import React, { useState } from 'react';
import { Card, Descriptions, Tag, Button, Space, Table, Typography, Spin, message, Popconfirm, Input, Modal } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { demandeAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title } = Typography;
const STATUT_COLOR = { SAISIE: 'default', SOUMISE: 'blue', EN_TRAITEMENT: 'orange', VALIDEE: 'success', REJETEE: 'error', ANNULEE: 'default' };

const DetailDemande = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [motifVisible, setMotifVisible] = useState(false);
  const [motif, setMotif]               = useState('');
  const { t } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['demande', id],
    queryFn:  () => demandeAPI.get(id).then(r => r.data),
  });

  const soumettreM = useMutation({
    mutationFn: () => demandeAPI.soumettre(id),
    onSuccess:  () => { message.success(t('msg.demandesoumise')); queryClient.invalidateQueries({ queryKey: ['demande', id] }); },
    onError:    e  => message.error(e.response?.data?.detail || t('msg.error')),
  });
  const validerM = useMutation({
    mutationFn: () => demandeAPI.valider(id),
    onSuccess:  () => { message.success(t('msg.demandevalidee')); queryClient.invalidateQueries({ queryKey: ['demande', id] }); },
    onError:    e  => message.error(e.response?.data?.detail || t('msg.error')),
  });
  const rejeterM = useMutation({
    mutationFn: () => demandeAPI.rejeter(id, motif),
    onSuccess:  () => { message.warning(t('msg.demandeRejetee')); setMotifVisible(false); queryClient.invalidateQueries({ queryKey: ['demande', id] }); },
    onError:    e  => message.error(e.response?.data?.detail || t('msg.error')),
  });
  const annulerM = useMutation({
    mutationFn: () => demandeAPI.annuler(id),
    onSuccess:  () => { message.info(t('msg.demandeannulee')); queryClient.invalidateQueries({ queryKey: ['demande', id] }); },
    onError:    e  => message.error(e.response?.data?.detail || t('msg.error')),
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (!data) return null;

  const ligneCols = [
    { title: t('field.piece'),    dataIndex: 'libelle',      key: 'libelle' },
    { title: t('field.present'),  dataIndex: 'present',      key: 'present',  render: v => <Tag color={v ? 'success' : 'default'}>{v ? '✓' : '–'}</Tag> },
    { title: t('field.conforme'), dataIndex: 'conforme',     key: 'conforme', render: v => <Tag color={v ? 'success' : 'warning'}>{v ? '✓' : t('common.validate')}</Tag> },
    { title: t('field.observations'), dataIndex: 'observations', key: 'obs' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📄 {t('page.demandes')} – {data.numero_dmd}</Title>
        <Space>
          {data.statut === 'SAISIE'  && (
            <Button type="primary" onClick={() => soumettreM.mutate()} loading={soumettreM.isPending} style={{ background: '#1a4480' }}>
              {t('action.soumettre')}
            </Button>
          )}
          {data.statut === 'SOUMISE' && (
            <Button type="primary" onClick={() => validerM.mutate()} loading={validerM.isPending} style={{ background: '#2e7d32' }}>
              {t('action.valider')}
            </Button>
          )}
          {['SOUMISE', 'EN_TRAITEMENT'].includes(data.statut) && (
            <Button danger onClick={() => setMotifVisible(true)}>{t('action.rejeter')}</Button>
          )}
          {['SAISIE', 'SOUMISE'].includes(data.statut) && (
            <Popconfirm title={t('confirm.annulerDemande')} onConfirm={() => annulerM.mutate()}
              okText={t('common.yes')} cancelText={t('common.no')}>
              <Button>{t('action.annuler')}</Button>
            </Popconfirm>
          )}
          <Button onClick={() => navigate('/demandes')}>{t('action.back')}</Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={3} size="small">
          <Descriptions.Item label={t('field.numDemande')}>{data.numero_dmd}</Descriptions.Item>
          <Descriptions.Item label={t('field.typeEntite')}>{data.type_entite}</Descriptions.Item>
          <Descriptions.Item label={t('field.statut')}><Tag color={STATUT_COLOR[data.statut]}>{data.statut}</Tag></Descriptions.Item>
          <Descriptions.Item label={t('field.typeDemande')} span={2}>{data.type_demande_libelle}</Descriptions.Item>
          <Descriptions.Item label={t('field.canal')}>{data.canal}</Descriptions.Item>
          <Descriptions.Item label={t('field.dateDemande')}>{data.date_demande}</Descriptions.Item>
          <Descriptions.Item label={t('field.dateLimite')}>{data.date_limite || '–'}</Descriptions.Item>
          <Descriptions.Item label={t('field.montantPaye')}>{data.montant_paye} MRU</Descriptions.Item>
          {data.motif_rejet && (
            <Descriptions.Item label={t('field.motifRejet')} span={3}>
              <Tag color="error">{data.motif_rejet}</Tag>
            </Descriptions.Item>
          )}
          {data.observations && (
            <Descriptions.Item label={t('field.observations')} span={3}>{data.observations}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t('card.piecesDossier')}>
        <Table dataSource={data.lignes || []} columns={ligneCols} rowKey="id" size="small" pagination={false} />
      </Card>

      <Modal title={t('modal.motifRejet')} open={motifVisible}
        onOk={() => rejeterM.mutate()} onCancel={() => setMotifVisible(false)}
        okButtonProps={{ danger: true }} okText={t('action.rejeter')} cancelText={t('common.cancel')}>
        <Input.TextArea rows={3} value={motif} onChange={e => setMotif(e.target.value)}
          placeholder={t('placeholder.motifRejet')} />
      </Modal>
    </div>
  );
};

export default DetailDemande;
