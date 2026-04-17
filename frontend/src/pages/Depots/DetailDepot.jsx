import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Typography, Spin,
  Table, message, Upload, Select, Tooltip, Popconfirm,
} from 'antd';
import {
  EditOutlined, FilePdfOutlined, ArrowLeftOutlined,
  UploadOutlined, FileOutlined, DownloadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { depotAPI, documentAPI, parametrageAPI, openPDF } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCivilite } from '../../utils/civilite';

const { Title, Text } = Typography;

const DetailDepot = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [uploading, setUploading]   = useState(false);
  const [typeDocId, setTypeDocId]   = useState(null);
  const { t, isAr } = useLanguage();

  const { data: depot, isLoading } = useQuery({
    queryKey: ['depot', id],
    queryFn:  () => depotAPI.get(id).then(r => r.data),
  });

  const { data: typesDocData } = useQuery({
    queryKey: ['types-doc'],
    queryFn:  () => parametrageAPI.typesDocuments().then(r => r.data),
  });
  const typesDocs = typesDocData?.results ?? typesDocData ?? [];

  const deleteMut = useMutation({
    mutationFn: (docId) => documentAPI.delete(docId),
    onSuccess: () => {
      message.success('Document supprimé.');
      queryClient.invalidateQueries({ queryKey: ['depot', id] });
    },
    onError: () => message.error('Erreur lors de la suppression.'),
  });

  const handleUpload = async (file) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('depot', id);
    if (typeDocId) fd.append('type_doc', typeDocId);
    try {
      await documentAPI.upload(fd);
      message.success('Pièce jointe ajoutée.');
      queryClient.invalidateQueries({ queryKey: ['depot', id] });
    } catch {
      message.error('Erreur lors de l\'upload.');
    }
    setUploading(false);
    return false;
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!depot)   return null;

  const fj_str  = depot.forme_juridique_libelle || '—';
  const cap_str = depot.capital
    ? `${parseFloat(depot.capital).toLocaleString('fr-FR')} MRU`
    : '—';

  const docColumns = [
    {
      title: 'Nom du fichier', dataIndex: 'nom_fichier', key: 'nom',
      render: (v) => <Space><FileOutlined style={{ color: '#1a4480' }} /><span>{v}</span></Space>,
    },
    { title: 'Taille', dataIndex: 'taille_ko', key: 'taille', width: 90, render: v => v ? `${v} Ko` : '—' },
    { title: 'Date',   dataIndex: 'date_scan',  key: 'date',  width: 110 },
    {
      title: 'Actions', key: 'actions', width: 100, fixed: 'right',
      render: (_, doc) => (
        <Space>
          <Tooltip title="Télécharger">
            <Button size="small" icon={<DownloadOutlined />}
              onClick={() => openPDF(documentAPI.download(doc.id))} />
          </Tooltip>
          <Popconfirm title="Supprimer ce document ?" onConfirm={() => deleteMut.mutate(doc.id)}
            okText="Oui" cancelText="Non">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>📥 Dépôt</Title>
          <Tag color="blue" style={{ fontSize: 14, padding: '2px 10px' }}>
            {depot.numero_depot}
          </Tag>
        </Space>
        <Space wrap>
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => openPDF(depotAPI.certificat(id, isAr ? 'ar' : 'fr'))}
            style={{ borderColor: '#1a4480', color: '#1a4480' }}
          >
            Certificat de dépôt
          </Button>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/depots/${id}/modifier`)}>
            Modifier
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/depots')}>
            Retour
          </Button>
        </Space>
      </div>

      {/* ── Informations du dépôt ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="N° de dépôt"  span={1}><strong>{depot.numero_depot}</strong></Descriptions.Item>
          <Descriptions.Item label="Date de dépôt" span={1}>{depot.date_depot || '—'}</Descriptions.Item>
          <Descriptions.Item label="Déposant" span={2}>
            <strong>
              {depot.civilite_deposant && (formatCivilite(depot.civilite_deposant, isAr ? 'ar' : 'fr') + ' ')}
              {depot.prenom_deposant} {depot.nom_deposant}
            </strong>
          </Descriptions.Item>
          <Descriptions.Item label="Téléphone" span={2}>{depot.telephone_deposant || '—'}</Descriptions.Item>
          <Descriptions.Item label="Dénomination"    span={2}><strong>{depot.denomination || '—'}</strong></Descriptions.Item>
          <Descriptions.Item label="Forme juridique" span={1}>{fj_str}</Descriptions.Item>
          <Descriptions.Item label="Capital"         span={1}>{cap_str}</Descriptions.Item>
          <Descriptions.Item label="Siège social"    span={2}>{depot.siege_social || '—'}</Descriptions.Item>
          <Descriptions.Item label="Objet social"    span={2}>{depot.objet_social || '—'}</Descriptions.Item>
          {depot.observations && (
            <Descriptions.Item label="Observations" span={2}>{depot.observations}</Descriptions.Item>
          )}
          {depot.created_by_nom && (
            <Descriptions.Item label="Créé par" span={1}>{depot.created_by_nom}</Descriptions.Item>
          )}
          <Descriptions.Item label="Date création" span={1}>
            {depot.created_at ? new Date(depot.created_at).toLocaleDateString('fr-FR') : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ── Pièces jointes ────────────────────────────────────────────────── */}
      <Card
        title={
          <Space>
            <FileOutlined />
            <span>Pièces jointes</span>
            <Tag>{(depot.documents || []).length}</Tag>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="Type de document"
            value={typeDocId}
            onChange={setTypeDocId}
            allowClear
            style={{ width: 240 }}
            options={typesDocs.map(td => ({
              value: td.id,
              label: isAr ? (td.libelle_ar || td.libelle_fr) : td.libelle_fr,
            }))}
          />
          <Upload beforeUpload={handleUpload} showUploadList={false}>
            <Button icon={<UploadOutlined />} loading={uploading}>
              Ajouter une pièce jointe
            </Button>
          </Upload>
        </Space>
        <Table
          dataSource={depot.documents || []}
          columns={docColumns}
          rowKey="id"
          size="small"
          scroll={{ x: 600 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'Aucune pièce jointe' }}
        />
      </Card>
    </div>
  );
};

export default DetailDepot;
