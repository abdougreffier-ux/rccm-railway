/**
 * PiecesJointesCard — gestion des pièces jointes pour modifications et cessions.
 *
 * Deux modes :
 *   1. Mode formulaire (entityId absent) : files are queued locally, parent uploads after save.
 *      Props: pendingFiles, onAddPending, onRemovePending
 *
 *   2. Mode détail (entityId présent) : files are fetched from API, upload/delete enabled.
 *      Props: entityType ('modification' | 'cession'), entityId, readOnly
 */
import React from 'react';
import {
  Card, Upload, Button, Table, Space, Tooltip, Popconfirm,
  Typography, Tag, message,
} from 'antd';
import {
  UploadOutlined, DeleteOutlined, DownloadOutlined,
  EyeOutlined, FileOutlined, FilePdfOutlined, FileImageOutlined, FileWordOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentAPI, openPDF, viewDocument } from '../api/api';
import { useLanguage } from '../contexts/LanguageContext';

/** Types MIME pouvant être affichés inline par le navigateur */
const VIEWABLE_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const { Text } = Typography;

const MAX_SIZE_MB   = 10;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const ALLOWED_EXT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';

const FileIcon = ({ mime }) => {
  if (!mime) return <FileOutlined style={{ color: '#8c8c8c' }} />;
  if (mime.includes('pdf'))   return <FilePdfOutlined  style={{ color: '#cf1322' }} />;
  if (mime.includes('image')) return <FileImageOutlined style={{ color: '#1677ff' }} />;
  if (mime.includes('word'))  return <FileWordOutlined  style={{ color: '#0958d9' }} />;
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
};

const formatSize = (ko) => {
  if (!ko) return '—';
  return ko >= 1024 ? `${(ko / 1024).toFixed(1)} Mo` : `${ko} Ko`;
};

/* ─── Mode formulaire ───────────────────────────────────────────────────────── */

export const PiecesJointesPending = ({ pendingFiles = [], onAddPending, onRemovePending }) => {
  const { isAr } = useLanguage();
  const beforeUpload = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error(isAr
        ? `صيغة غير مسموح بها: ${file.name}. الصيغ المقبولة: PDF، DOC، DOCX، JPG، PNG.`
        : `Format non autorisé : ${file.name}. Formats acceptés : PDF, DOC, DOCX, JPG, PNG.`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      message.error(isAr
        ? `الملف "${file.name}" كبير جداً. الحجم الأقصى: ${MAX_SIZE_MB} Mo.`
        : `Fichier trop volumineux : ${file.name}. Taille max : ${MAX_SIZE_MB} Mo.`);
      return Upload.LIST_IGNORE;
    }
    onAddPending({ uid: `${Date.now()}-${file.name}`, name: file.name, size: file.size, type: file.type, file });
    return false; // prevent auto-upload
  };

  const columns = [
    {
      title: 'Fichier',
      dataIndex: 'name',
      key: 'name',
      render: (v, r) => (
        <Space>
          <FileIcon mime={r.type} />
          <Text>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Taille',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: v => formatSize(v ? Math.round(v / 1024) : null),
    },
    {
      title: '',
      key: 'del',
      width: 50,
      render: (_, r) => (
        <Tooltip title="Retirer">
          <Button size="small" danger icon={<DeleteOutlined />}
            onClick={() => onRemovePending(r.uid)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={<><UploadOutlined style={{ marginRight: 6 }} />Pièces jointes</>}
      extra={
        <Upload beforeUpload={beforeUpload} showUploadList={false}
          multiple accept={ALLOWED_EXT}>
          <Button size="small" icon={<UploadOutlined />}>Ajouter un fichier</Button>
        </Upload>
      }
    >
      {pendingFiles.length === 0 ? (
        <Upload.Dragger beforeUpload={beforeUpload} showUploadList={false}
          multiple accept={ALLOWED_EXT} style={{ padding: '8px 0' }}>
          <p style={{ color: '#8c8c8c', margin: 0 }}>
            Glissez vos fichiers ici ou cliquez pour parcourir
          </p>
          <p style={{ color: '#bbb', fontSize: 12, margin: '4px 0 0' }}>
            PDF, DOC, DOCX, JPG, PNG — max {MAX_SIZE_MB} Mo par fichier
          </p>
        </Upload.Dragger>
      ) : (
        <Table dataSource={pendingFiles} columns={columns} rowKey="uid"
          size="small" pagination={false} />
      )}
    </Card>
  );
};


/* ─── Mode détail (post-save) ───────────────────────────────────────────────── */

const PiecesJointesCard = ({ entityType, entityId, readOnly = false }) => {
  const queryClient  = useQueryClient();
  const queryKey     = ['documents', entityType, entityId];
  const { isAr }     = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => documentAPI.list({ [entityType]: entityId }).then(r => {
      // API returns paginated or flat array
      const raw = r.data;
      return Array.isArray(raw) ? raw : (raw.results || []);
    }),
    enabled: !!entityId,
  });

  const deleteMut = useMutation({
    mutationFn: (docId) => documentAPI.delete(docId),
    onSuccess:  () => {
      message.success(isAr ? 'تم حذف الملف.' : 'Fichier supprimé.');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      const detail = err.response?.data?.detail;
      message.error(detail || (isAr ? 'تعذّر حذف هذا الملف.' : 'Impossible de supprimer ce fichier.'));
    },
  });

  /** Extrait un message d'erreur lisible depuis une réponse axios. */
  const _uploadErrorMsg = (err, fileName) => {
    const status = err.response?.status;
    const data   = err.response?.data;
    // Extraire le premier message d'erreur structuré DRF
    let detail = null;
    if (data && typeof data === 'object') {
      detail = data.detail
        || data.fichier?.[0]
        || Object.values(data).flat().find(v => typeof v === 'string')
        || null;
    }
    if (status === 403) {
      return isAr ? 'غير مصرح لك بهذا الإجراء.' : 'Action non autorisée (accès refusé).';
    }
    if (status === 400 && detail) {
      return detail;
    }
    if (status === 413) {
      return isAr
        ? `الملف "${fileName}" كبير جداً (الحد الأقصى ${MAX_SIZE_MB} Mo).`
        : `Fichier trop volumineux : ${fileName} (max ${MAX_SIZE_MB} Mo).`;
    }
    if (detail) return detail;
    return isAr
      ? `تعذّر رفع الملف "${fileName}".`
      : `Impossible d'uploader "${fileName}".`;
  };

  const beforeUpload = async (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error(isAr
        ? `صيغة غير مسموح بها. الصيغ المقبولة: PDF، DOC، DOCX، JPG، PNG.`
        : `Format non autorisé : ${file.name}. Formats acceptés : PDF, DOC, DOCX, JPG, PNG.`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      message.error(isAr
        ? `الملف "${file.name}" كبير جداً (الحجم الأقصى: ${MAX_SIZE_MB} Mo).`
        : `Fichier trop volumineux : ${file.name} (max ${MAX_SIZE_MB} Mo).`);
      return Upload.LIST_IGNORE;
    }
    try {
      const fd = new FormData();
      fd.append('fichier',     file);
      fd.append('nom_fichier', file.name);
      fd.append(entityType,    entityId);
      await documentAPI.upload(fd);
      message.success(isAr ? `تمت إضافة "${file.name}".` : `"${file.name}" ajouté.`);
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      message.error(_uploadErrorMsg(err, file.name));
    }
    return false;
  };

  const docs = data || [];

  const columns = [
    {
      title: 'Fichier',
      dataIndex: 'nom_fichier',
      key: 'nom',
      render: (v, r) => (
        <Space>
          <FileIcon mime={r.mime_type} />
          <Text>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Taille',
      dataIndex: 'taille_ko',
      key: 'taille',
      width: 100,
      render: v => formatSize(v),
    },
    {
      title: 'Date',
      dataIndex: 'date_scan',
      key: 'date',
      width: 110,
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, r) => (
        <Space>
          {/* Visualisation inline — PDF et images uniquement */}
          {VIEWABLE_MIMES.includes(r.mime_type) && (
            <Tooltip title="Visualiser">
              <Button size="small" icon={<EyeOutlined />}
                onClick={() => viewDocument(documentAPI.view(r.id))} />
            </Tooltip>
          )}
          <Tooltip title="Télécharger">
            <Button size="small" icon={<DownloadOutlined />}
              onClick={() => openPDF(documentAPI.download(r.id))} />
          </Tooltip>
          {!readOnly && (
            <Popconfirm
              title={isAr ? 'حذف هذا الملف ؟' : 'Supprimer ce fichier ?'}
              okText={isAr ? 'نعم' : 'Oui'}
              cancelText={isAr ? 'لا' : 'Non'}
              onConfirm={() => deleteMut.mutate(r.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}
                loading={deleteMut.isPending} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={
        <Space>
          <UploadOutlined />
          <span>{isAr ? 'المرفقات' : 'Pièces jointes'}</span>
          {docs.length > 0 && <Tag>{docs.length}</Tag>}
        </Space>
      }
      extra={
        !readOnly && (
          <Upload beforeUpload={beforeUpload} showUploadList={false}
            multiple accept={ALLOWED_EXT}>
            <Button size="small" icon={<UploadOutlined />}>{isAr ? 'إضافة' : 'Ajouter'}</Button>
          </Upload>
        )
      }
      loading={isLoading}
    >
      {docs.length === 0 && !isLoading ? (
        !readOnly ? (
          <Upload.Dragger beforeUpload={beforeUpload} showUploadList={false}
            multiple accept={ALLOWED_EXT} style={{ padding: '8px 0' }}>
            <p style={{ color: '#8c8c8c', margin: 0 }}>
              {isAr ? 'اسحب ملفاتك هنا أو انقر للتصفح' : 'Glissez vos fichiers ici ou cliquez pour parcourir'}
            </p>
            <p style={{ color: '#bbb', fontSize: 12, margin: '4px 0 0' }}>
              PDF, DOC, DOCX, JPG, PNG — max {MAX_SIZE_MB} Mo
            </p>
          </Upload.Dragger>
        ) : (
          <Text type="secondary">{isAr ? 'لا توجد مرفقات.' : 'Aucune pièce jointe.'}</Text>
        )
      ) : (
        <Table dataSource={docs} columns={columns} rowKey="id"
          size="small" pagination={false} />
      )}
    </Card>
  );
};

export default PiecesJointesCard;
