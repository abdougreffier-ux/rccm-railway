/**
 * ErrorBoundary — Composant de garde d'erreur React (class component requis par l'API)
 * Capture toute erreur de rendu JS dans l'arbre enfant et affiche un écran explicite
 * à la place d'une page blanche.  Bilingue FR / AR.
 */
import React from 'react';
import { Button, Result } from 'antd';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Journalisation console (visible dans Railway logs côté client)
    console.error('[ErrorBoundary] Erreur de rendu capturée :', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Message de fallback — affiché à la place d'une page blanche
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <Result
          status="error"
          title={
            <span>
              Une erreur est survenue
              <span style={{ marginLeft: 16, fontSize: 18, color: '#595959' }}>
                / حدث خطأ في الصفحة
              </span>
            </span>
          }
          subTitle={
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <p>
                Une erreur inattendue s'est produite lors du chargement de cette page.
              </p>
              <p style={{ color: '#888', fontSize: 13 }}>
                حدث خطأ غير متوقع أثناء تحميل هذه الصفحة. يرجى إعادة التحميل أو الاتصال بالدعم التقني.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <pre style={{
                  marginTop: 16, textAlign: 'left', background: '#fff0f0',
                  padding: 12, borderRadius: 4, fontSize: 12, overflowX: 'auto',
                  border: '1px solid #ffccc7',
                }}>
                  {this.state.error.toString()}
                </pre>
              )}
            </div>
          }
          extra={[
            <Button
              key="reload"
              type="primary"
              onClick={this.handleReload}
              style={{ background: '#1a4480', borderColor: '#1a4480' }}
            >
              Recharger la page / إعادة التحميل
            </Button>,
            <Button key="home" onClick={this.handleHome}>
              Retour à l'accueil / العودة للرئيسية
            </Button>,
          ]}
        />
      </div>
    );
  }
}

export default ErrorBoundary;
