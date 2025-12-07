// front/src/pages/Login.tsx

import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

const Login: React.FC = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showForgotModal, setShowForgotModal]           = useState(false);
  const [forgotMessage, setForgotMessage]               = useState('');
  const [errorMessage, setErrorMessage]                 = useState('');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [maskedAdminEmail, setMaskedAdminEmail]         = useState('');
  const [verificationCode, setVerificationCode]         = useState('');
  const [isSending, setIsSending]                       = useState(false);
  const [isVerifying, setIsVerifying]                   = useState(false);
  const [verificationMessage, setVerificationMessage]   = useState('');
  const [verificationCompleted, setVerificationCompleted] = useState(false);
  const [hasRequestedReset, setHasRequestedReset]       = useState(false);
  const navigate = useNavigate();
  const { user, login } = useContext(AuthContext);

  // Si déjà logué, on redirige automatiquement vers sa page home
  useEffect(() => {
    if (!user) return;
    
    const currentPath = window.location.pathname;
    let targetPath = '';
    
    if (user.role === 'admin') {
      targetPath = `/admin/${user.id}`;
    } else if (user.role === 'gestionnaire') {
      targetPath = `/gestionnaire/${user.id}`;
    } else if (user.role === 'confirmateur') {
      targetPath = `/confirmateur/${user.id}`;
    } else if (user.role === 'livreur') {
      targetPath = `/livreur/${user.id}`;
    }
    
    // Ne naviguer que si on n'est pas déjà sur la bonne page
    if (targetPath && currentPath !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [user, navigate]);


  async function parseJsonSafe<T>(res: Response): Promise<T | null> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      console.error('Réponse JSON invalide reçue:', error, text);
      return null;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await parseJsonSafe<(User & { token: string }) | { message?: string }>(res);

      if (!res.ok) {
        const message = (data as { message?: string } | null)?.message ??
          "Erreur lors de la tentative de connexion. Veuillez réessayer.";
        throw new Error(message);
      }

      if (!data || !(data as User & { token: string }).token) {
        throw new Error('Réponse du serveur invalide.');
      }

      const { token, ...userData } = data as User & { token: string };

      // stocke user + token
      login(
        {
          id: userData.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          role: userData.role,
        },
        token
      );
    } catch (err: any) {
      const message = err instanceof Error
        ? err.message
        : "Impossible d'effectuer la connexion. Veuillez réessayer.";
      alert(message);
    }
  };

  const requestAdminReset = async () => {
    setIsSending(true);
    setErrorMessage('');
    setForgotMessage('');
    setVerificationMessage('');
    setVerificationCompleted(false);
    setVerificationCode('');
    try {
      const res = await apiFetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await parseJsonSafe<{
        message?: string;
        requiresVerification?: boolean;
        maskedEmail?: string;
      }>(res);

      if (!res.ok) {
        throw new Error(data?.message || 'Erreur lors de la demande de réinitialisation.');
      }

      if (data) {
        setForgotMessage(data.message ?? '');
        setRequiresVerification(Boolean(data.requiresVerification));
        setMaskedAdminEmail(data.maskedEmail ?? '');
      } else {
        setForgotMessage('Demande de réinitialisation envoyée.');
        setRequiresVerification(false);
        setMaskedAdminEmail('');
      }
      setHasRequestedReset(true);
    } catch (err: any) {
      const message = err instanceof Error
        ? err.message
        : 'Erreur lors de la demande de réinitialisation.';
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  const openForgotModal = () => {
    setShowForgotModal(true);
    setForgotMessage('');
    setErrorMessage('');
    setVerificationCode('');
    setVerificationMessage('');
    setMaskedAdminEmail('');
    setRequiresVerification(false);
    setVerificationCompleted(false);
    setHasRequestedReset(false);
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setErrorMessage('');
    setVerificationMessage('');
    try {
      const res = await apiFetch('/api/users/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode }),
      });
      const data = await parseJsonSafe<{ message?: string }>(res);

      if (!res.ok) {
        throw new Error(data?.message || 'Erreur lors de la vérification du code.');
      }

      setVerificationMessage(
        "Le mot de passe est \"adminadmin\" et l'email est votre adresse utilisateur."
      );
      setVerificationCompleted(true);
    } catch (err: any) {
      const message = err instanceof Error
        ? err.message
        : 'Erreur lors de la vérification du code.';
      setErrorMessage(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  };

   const modalStyle: React.CSSProperties = {
    background: '#fff',
    padding: '2.5rem 2.25rem',
    borderRadius: '18px',
    maxWidth: '440px',
    width: '100%',
    position: 'relative',
    boxShadow: '0 22px 55px rgba(0, 0, 0, 0.18)',
    color: '#111',
    textAlign: 'left',
  };

  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '1.25rem',
    right: '1.25rem',
    border: 'none',
    background: '#f4f4f4',
    fontSize: '1.1rem',
    cursor: 'pointer',
    width: '2.2rem',
    height: '2.2rem',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#111',
  };

  const secondaryTextStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: '#444',
    lineHeight: 1.5,
    marginTop: '0.75rem',
  };

  const modalTitleStyle: React.CSSProperties = {
    fontSize: '1.65rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    marginBottom: '0.5rem',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.8rem 1.1rem',
    borderRadius: '12px',
    border: '2px solid #111',
    backgroundColor: '#fff',
    color: '#111',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'box-shadow 0.2s ease',
    boxShadow: 'inset 0 0 0 0 rgba(0,0,0,0)',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    marginTop: '1.75rem',
    padding: '0.9rem 1rem',
    borderRadius: '999px',
    border: 'none',
    backgroundColor: '#111',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  const modalSectionSpacingStyle: React.CSSProperties = {
    marginTop: '1.5rem',
  };

  const modalInputStyle: React.CSSProperties = {
    ...inputStyle,
    marginTop: '0.75rem',
    border: '2px solid #111',
  };

  const modalPrimaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    marginTop: '1.25rem',
  };

  const modalSecondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    marginTop: '0.75rem',
    backgroundColor: '#f4f4f4',
    color: '#111',
    boxShadow: 'inset 0 0 0 2px #111',
  };

  const modalMessageStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    lineHeight: 1.5,
    marginTop: '0.75rem',
  };

  const getDisabledButtonStyle = (disabled: boolean): React.CSSProperties =>
    disabled
      ? {
          opacity: 0.6,
          cursor: 'not-allowed',
          boxShadow: 'none',
          transform: 'none',
        }
      : {};


  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f4f4',
    padding: '2rem 1.5rem',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    color: '#111',
    borderRadius: '18px',
    boxShadow: '0 22px 55px rgba(0, 0, 0, 0.14)',
    padding: '2.5rem 2.25rem',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.9rem',
    marginBottom: '0.5rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: '#555',
    marginBottom: '2rem',
    lineHeight: 1.5,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#222',
    textAlign: 'left',
    marginBottom: '0.5rem',
  };

  const forgotButtonStyle: React.CSSProperties = {
    marginTop: '1.25rem',
    border: 'none',
    background: 'transparent',
    color: '#111',
    fontSize: '0.9rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontWeight: 500,
  };

  const fieldSpacingStyle: React.CSSProperties = {
    marginBottom: '1.25rem',
  };


  return (
     <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Connexion</h1>
        <p style={subtitleStyle}>Accédez à votre espace en renseignant vos identifiants.</p>
        <form onSubmit={handleSubmit}>
          <div style={fieldSpacingStyle}>
            <label style={labelStyle} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,0,0,0.08)')}
              onBlur={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 0 rgba(0,0,0,0)')}
            />
          </div>
          <div style={fieldSpacingStyle}>
            <label style={labelStyle} htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,0,0,0.08)')}
              onBlur={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 0 rgba(0,0,0,0)')}
            />
          </div>
          <button type="submit" style={buttonStyle}>Se connecter</button>
        </form>
        <button type="button" onClick={openForgotModal} style={forgotButtonStyle}>
          Mot de passe oublié ?
        </button>
      </div>

      {showForgotModal && (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
          <div style={modalStyle}>
            <button
              style={closeButtonStyle}
              onClick={closeForgotModal}
              aria-label="Fermer la fenêtre de réinitialisation"
            >
              ×
            </button>
            <h3 id="forgot-password-title" style={modalTitleStyle}>
              Réinitialiser le mot de passe
            </h3>
            <p style={secondaryTextStyle}>
              Si vous n'êtes pas administrateur, veuillez contacter l'administrateur pour
              réinitialiser votre mot de passe.
            </p>
            {hasRequestedReset && forgotMessage && (
              <p style={modalMessageStyle}>{forgotMessage}</p>
            )}
            {hasRequestedReset && maskedAdminEmail && requiresVerification && (
              <p style={{ ...modalMessageStyle, fontSize: '0.95rem' }}>
                Un email a été envoyé à <strong>{maskedAdminEmail}</strong>.
              </p>
            )}
            {errorMessage && (
              <p style={{ ...modalMessageStyle, color: '#c0392b', fontWeight: 600 }}>
                {errorMessage}
              </p>
            )}
            {verificationMessage && (
              <p style={{ ...modalMessageStyle, color: '#1e8449', fontWeight: 600 }}>
                {verificationMessage}
              </p>
            )}

            {!hasRequestedReset && (
              <div style={modalSectionSpacingStyle}>
                <button
                  type="button"
                  onClick={requestAdminReset}
                  style={{
                    ...modalPrimaryButtonStyle,
                    ...getDisabledButtonStyle(isSending),
                  }}
                  disabled={isSending}
                >
                  {isSending ? 'Envoi en cours…' : 'Réinitialiser le mot de passe administrateur'}
                </button>
              </div>
            )}

            {hasRequestedReset && !requiresVerification && (
              <div style={modalSectionSpacingStyle}>
                <p style={modalMessageStyle}>
                  {isSending
                    ? "Envoi du code de vérification à l'administrateur…"
                    : "Un email est envoyé automatiquement à l'administrateur pour lancer la réinitialisation."}
                </p>
                {!isSending && (
                  <button
                    type="button"
                    onClick={requestAdminReset}
                    style={{
                      ...modalSecondaryButtonStyle,
                      ...getDisabledButtonStyle(false),
                    }}
                  >
                    Renvoyer le code
                  </button>
                )}
              </div>
            )}

            {hasRequestedReset && requiresVerification && !verificationCompleted && (
              <div style={modalSectionSpacingStyle}>
                <form onSubmit={handleVerifyCode}>
                  <label htmlFor="verification-code" style={labelStyle}>
                    Code de vérification
                  </label>
                  <input
                    id="verification-code"
                    type="text"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value)}
                    required
                    style={modalInputStyle}
                    onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,0,0,0.08)')}
                    onBlur={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 0 rgba(0,0,0,0)')}
                  />
                  <button
                    type="submit"
                    style={{
                      ...modalPrimaryButtonStyle,
                      ...getDisabledButtonStyle(isVerifying),
                    }}
                    disabled={isVerifying}
                  >
                    {isVerifying ? 'Vérification…' : 'Valider le code'}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={requestAdminReset}
                  style={{
                    ...modalSecondaryButtonStyle,
                    ...getDisabledButtonStyle(isSending),
                  }}
                  disabled={isSending}
                >
                  {isSending ? 'Renvoi en cours…' : 'Renvoyer le code'}
                </button>
              </div>
            )}

            {verificationCompleted && (
              <div style={modalSectionSpacingStyle}>
                <button
                  type="button"
                  style={modalPrimaryButtonStyle}
                  onClick={closeForgotModal}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
