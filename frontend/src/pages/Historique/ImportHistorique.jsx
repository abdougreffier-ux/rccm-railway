import React, { useState } from 'react';
import {
  Card, Button, Upload, Table, Tag, Typography, Alert,
  Descriptions, Space, Divider, Statistic, Row, Col, message,
} from 'antd';
import {
  UploadOutlined, DownloadOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, ArrowLeftOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { historiqueAPI } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';

const { Title, Text } = Typography;

const STATUT_ICON = {
  CREE:    <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  DOUBLON: <WarningOutlined     style={{ color: '#fa8c16' }} />,
  ERREUR:  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
};
const STATUT_COLOR = { CREE: 'success', DOUBLON: 'warning', ERREUR: 'error' };

const CSV_TEMPLATE = `type_entite,numero_ra,numero_chrono,annee_chrono,date_immatriculation,nom,prenom,denomination,siege_social,ville,telephone,email,pays_origine,capital_social
PH,000001,1,2001,2001-03-15,Dupont,Jean,,,Nouakchott,22001234,jean@mail.mr,,
PM,000002,2,2001,2001-05-20,,,SARL Exemple,,Nouakchott,22005678,contact@sarl.mr,,500000
SC,000003,3,2002,2002-01-10,,,Succursale ABC,Rue 1,Nouakchott,22009012,sc@abc.mr,France,200000
`;

const ImportHistorique = () => {
  const navigate = useNavigate();
  const { t, isAr } = useLanguage();
  const [rapport,   setRapport]   = useState(null);
  const [fileList,  setFileList]  = useState([]);

  const importMut = useMutation({
    mutationFn: (fd) => historiqueAPI.import(fd).then(r => r.data),
    onSuccess:  (data) => { setRapport(data); setFileList([]); },
    onError:    (e) => message.error(e.response?.data?.detail || (isAr ? 'خطأ أثناء الاستيراد.' : "Erreur lors de l'import.")),
  });

  const handleUpload = () => {
    if (!fileList.length) {
      message.warning(isAr ? 'اختر ملف CSV أو Excel.' : 'Sélectionnez un fichier CSV ou XLSX.');
      return;
    }
    const fd = new FormData();
    fd.append('fichier', fileList[0]);
    importMut.mutate(fd);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'modele_import_historique.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { title: isAr ? t('hist.import.colLigne')     : 'Ligne',         dataIndex: 'ligne',      key: 'ligne',   width: 70 },
    { title: isAr ? t('field.numeroRA')            : 'N° Analytique', dataIndex: 'numero_ra',  key: 'ra',      width: 140 },
    {
      title: isAr ? t('hist.import.colResultat') : 'Résultat', dataIndex: 'statut', key: 'statut', width: 110,
      render: v => <Tag color={STATUT_COLOR[v] || 'default'} icon={STATUT_ICON[v]}>{v}</Tag>,
    },
    {
      title: isAr ? t('hist.import.colDetails') : 'Détails', dataIndex: 'erreurs', key: 'erreurs',
      render: (errs) => errs?.length
        ? <ul style={{ margin: 0, paddingLeft: 18 }}>{errs.map((e, i) => <li key={i}><Text type="danger">{e}</Text></li>)}</ul>
        : <Text type="success">{isAr ? t('hist.import.creeSucces') : 'Créé avec succès'}</Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/historique')} />
        <HistoryOutlined style={{ fontSize: 22, color: '#1a4480' }} />
        <Title level={4} style={{ margin: 0 }}>
          {isAr ? t('hist.import.title') : 'Import en masse — Immatriculations historiques'}
        </Title>
      </div>

      <Card title={isAr ? t('hist.import.instructions') : 'Instructions'} size="small" style={{ marginBottom: 16 }}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={isAr ? t('hist.import.alertInfo') : 'Préparez un fichier CSV ou Excel avec les colonnes ci-dessous. Une ligne = une entreprise.'} />
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label={isAr ? t('hist.import.colObligatoires') : 'Colonnes obligatoires'} span={2}>
            <Text code>type_entite</Text> (PH/PM/SC), <Text code>numero_ra</Text>,{' '}
            <Text code>numero_chrono</Text>, <Text code>annee_chrono</Text>,{' '}
            <Text code>date_immatriculation</Text> (YYYY-MM-DD)
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.import.champsPH') : 'PH — champs utiles'}>
            nom, prenom, nni, adresse, ville, telephone, email, profession
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.import.champsPM') : 'PM — champs utiles'}>
            denomination, sigle, siege_social, ville, telephone, email, capital_social, devise_capital
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.import.champsSC') : 'SC — champs utiles'}>
            denomination, pays_origine, capital_affecte, siege_social, ville
          </Descriptions.Item>
          <Descriptions.Item label={isAr ? t('hist.import.associesPM') : 'Associés PM (import de base)'} span={2}>
            <Text type="secondary">
              {isAr ? t('hist.import.associesPMInfo') : "Non pris en charge dans l'import CSV. Ajoutez-les manuellement après import via la fiche de la demande."}
            </Text>
          </Descriptions.Item>
        </Descriptions>
        <Button icon={<DownloadOutlined />} onClick={downloadTemplate} style={{ marginTop: 12 }}>
          {isAr ? t('hist.import.downloadTemplate') : 'Télécharger le modèle CSV'}
        </Button>
      </Card>

      <Card title={isAr ? t('hist.import.importation') : 'Importation'} size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload
            beforeUpload={(file) => { setFileList([file]); return false; }}
            onRemove={() => setFileList([])}
            fileList={fileList.map(f => ({ uid: '-1', name: f.name, status: 'done', originFileObj: f }))}
            accept=".csv,.xlsx,.xls"
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>
              {isAr ? t('hist.import.chooseFile') : 'Choisir un fichier (CSV / Excel)'}
            </Button>
          </Upload>
          <Button type="primary" onClick={handleUpload} loading={importMut.isPending}
            disabled={!fileList.length} style={{ background: '#1a4480' }}>
            {isAr ? t('hist.import.launch') : "Lancer l'import"}
          </Button>
        </Space>
      </Card>

      {rapport && (
        <Card title={isAr ? t('hist.import.rapport') : "Rapport d'import"} size="small">
          <Row gutter={24} style={{ marginBottom: 16 }}>
            <Col span={6}><Statistic title={isAr ? t('hist.import.totalLignes')       : 'Total lignes'}        value={rapport.total}   /></Col>
            <Col span={6}><Statistic title={isAr ? t('hist.import.creees')            : 'Créées'}              value={rapport.created} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={6}><Statistic title={isAr ? t('hist.import.ignoreesErreurs')   : 'Ignorées/Erreurs'}    value={rapport.skipped} valueStyle={{ color: rapport.skipped > 0 ? '#ff4d4f' : '#52c41a' }} /></Col>
            <Col span={6}><Statistic title="Batch" value={rapport.import_batch} /></Col>
          </Row>
          {rapport.created > 0 && (
            <Alert type="success" showIcon style={{ marginBottom: 12 }}
              message={
                isAr
                  ? `${rapport.created} ${t('hist.import.createdMsg')}`
                  : `${rapport.created} demande(s) créée(s) en brouillon. Elles sont maintenant disponibles dans la liste.`
              } />
          )}
          <Divider orientation="left">
            {isAr ? t('hist.import.detailLigne') : 'Détail par ligne'}
          </Divider>
          <Table dataSource={rapport.rapport} columns={columns} rowKey="ligne"
            size="small" pagination={{ pageSize: 20 }} />
        </Card>
      )}
    </div>
  );
};

export default ImportHistorique;
