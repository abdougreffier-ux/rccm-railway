/**
 * PdfViewerModal — visionneuse PDF intégrée pour les agents RCCM.
 *
 * Règle RCCM : un agent peut consulter et imprimer un document officiel,
 * mais ne doit jamais le télécharger localement.
 *
 * Fonctionnement :
 *   1. api.js détecte que l'utilisateur n'est pas greffier (flag localStorage
 *      user_is_greffier).
 *   2. Au lieu de créer un <a download>, api.js appelle
 *      window.__rccmOpenPdfModal(blobUrl, filename).
 *   3. Ce composant s'affiche : l'agent visualise le PDF dans un <iframe>
 *      plein écran et peut l'imprimer via le bouton dédié.
 *   4. Le paramètre #toolbar=0 masque la barre native du viewer Chrome
 *      (incluant son bouton de téléchargement).
 *   5. L'URL blob est révoquée à la fermeture pour libérer la mémoire.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Space, Tooltip } from 'antd';
import { PrinterOutlined, CloseOutlined } from '@ant-design/icons';

const PdfViewerModal = () => {
  const [open,     setOpen]     = useState(false);
  const [blobUrl,  setBlobUrl]  = useState('');
  const [filename, setFilename] = useState('');
  const iframeRef = useRef(null);

  // ── Enregistrement du callback global ─────────────────────────────────────
  // Appelé par api.js (contexte non-React) pour ouvrir la visionneuse.
  const openModal = useCallback((url, fname) => {
    setBlobUrl(url);
    setFilename(fname || 'document.pdf');
    setOpen(true);
  }, []);

  useEffect(() => {
    window.__rccmOpenPdfModal = openModal;
    return () => { delete window.__rccmOpenPdfModal; };
  }, [openModal]);

  // ── Fermeture + libération mémoire blob ─────────────────────────────────
  const handleClose = useCallback(() => {
    setOpen(false);
    const urlToRevoke = blobUrl;
    // Délai court pour laisser le temps au navigateur de désallouer l'iframe
    setTimeout(() => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      setBlobUrl('');
    }, 800);
  }, [blobUrl]);

  // ── Impression via l'API contentWindow de l'iframe ──────────────────────
  const handlePrint = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    } catch {
      // Fallback si l'accès contentWindow est bloqué (sandbox CORS)
      window.print();
    }
  }, []);

  const lang = localStorage.getItem('lang') || 'fr';
  const isAr = lang === 'ar';

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width="92vw"
      style={{ top: 16 }}
      styles={{ body: { padding: 0, height: 'calc(90vh - 112px)', overflow: 'hidden' } }}
      title={
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#555' }}>
          📄 {filename}
        </span>
      }
      footer={
        <Space>
          <Tooltip title={isAr ? 'طباعة المستند الرسمي' : 'Imprimer le document officiel'}>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
              style={{ background: '#1a4480', borderColor: '#1a4480' }}
            >
              {isAr ? 'طباعة' : 'Imprimer'}
            </Button>
          </Tooltip>
          <Button icon={<CloseOutlined />} onClick={handleClose}>
            {isAr ? 'إغلاق' : 'Fermer'}
          </Button>
        </Space>
      }
      // Ne pas détruire le nœud DOM à la fermeture — évite le flash blanc
      // lors de la réouverture ; la blobUrl est révoquée dans handleClose.
      destroyOnClose={false}
    >
      {blobUrl && (
        <iframe
          ref={iframeRef}
          // #toolbar=0  → masque la barre d'outils Chrome (bouton télécharger inclus)
          // #navpanes=0 → masque le panneau de navigation latéral
          // #scrollbar=1→ conserve la barre de défilement verticale
          src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
          title={filename}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      )}
    </Modal>
  );
};

export default PdfViewerModal;
