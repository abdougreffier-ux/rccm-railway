import React, { useState } from 'react';
import { Card, Row, Col, Button, DatePicker, Typography, Select, Space, Statistic, Spin } from 'antd';
import { FilePdfOutlined, BarChartOutlined, FileSearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { rapportAPI, openPDF } from '../../api/api';
import { useLanguage } from '../../contexts/LanguageContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const RapportsPage = () => {
  const [annee,     setAnnee]     = useState(dayjs().year());
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin,   setDateFin]   = useState('');
  const { t, isAr } = useLanguage();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', annee],
    queryFn:  () => rapportAPI.statistiques({ annee }).then(r => r.data),
  });

  const cardStyle = { borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'box-shadow .2s' };

  return (
    <div>
      <Title level={4}>{t('reports.title')}</Title>

      {/* Statistiques annuelles */}
      <Card title={
        <Space>
          <BarChartOutlined /> {t('reports.stats_annual')}
          <Select value={annee} onChange={setAnnee} style={{ width: 100 }}
            options={[2020,2021,2022,2023,2024,2025,2026].map(y => ({ value: y, label: y }))} />
        </Space>
      } style={{ marginBottom: 24 }}>
        {isLoading ? <Spin /> : (
          <Row gutter={16}>
            <Col span={6}><Statistic title={t('reports.immat_ph')} value={stats?.immatriculations?.PH || 0} valueStyle={{ color: '#1a4480' }} /></Col>
            <Col span={6}><Statistic title={t('reports.immat_pm')} value={stats?.immatriculations?.PM || 0} valueStyle={{ color: '#2e7d32' }} /></Col>
            <Col span={6}><Statistic title={t('reports.immat_sc')} value={stats?.immatriculations?.SC || 0} valueStyle={{ color: '#ed6c02' }} /></Col>
            <Col span={6}><Statistic title={t('reports.radiations_count')} value={stats?.radiations || 0}  valueStyle={{ color: '#d32f2f' }} /></Col>
          </Row>
        )}
      </Card>

      {/* Documents officiels */}
      <Title level={5}>📜 {t('reports.official_docs')}</Title>
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card hoverable style={cardStyle} onClick={() => {
              const id = prompt(t('reports.enter_ra'));
              if (id) openPDF(rapportAPI.attestationImmatriculation(id));
            }}>
              <FilePdfOutlined style={{ fontSize: 32, color: '#1a4480' }} />
              <div><strong>{t('reports.attestation')}</strong></div>
              <Text type="secondary">{t('reports.enter_ra')}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card hoverable style={cardStyle} onClick={() => {
              const id = prompt(t('reports.enter_ra'));
              if (id) openPDF(rapportAPI.extraitRC(id));
            }}>
              <FileSearchOutlined style={{ fontSize: 32, color: '#2e7d32' }} />
              <div><strong>{t('reports.extrait')}</strong></div>
              <Text type="secondary">{t('reports.enter_ra')}</Text>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Registre chronologique */}
      <Title level={5}>📅 {t('reports.rc_pdf')}</Title>
      <Card>
        <Space>
          <DatePicker placeholder={t('reports.date_start')} format="DD/MM/YYYY"
            onChange={d => setDateDebut(d?.format('YYYY-MM-DD') || '')} />
          <DatePicker placeholder={t('reports.date_end')}   format="DD/MM/YYYY"
            onChange={d => setDateFin(d?.format('YYYY-MM-DD') || '')} />
          <Button type="primary" icon={<FilePdfOutlined />}
            onClick={() => openPDF(rapportAPI.registreChronologiquePDF({ date_debut: dateDebut, date_fin: dateFin }))}
            style={{ background: '#1a4480' }}>
            {t('reports.generate_pdf')}
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default RapportsPage;
