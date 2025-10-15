// front/src/pages/Login.tsx

import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

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
    if (user.role === 'admin')        navigate(`/admin/${user.id}`,        { replace: true });
    else if (user.role === 'gestionnaire') navigate(`/gestionnaire/${user.id}`, { replace: true });
    else                               navigate(`/confirmateur/${user.id}`, { replace: true });
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
      const res = await fetch('/api/users/login', {
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
      const res = await fetch('/api/users/forgot-password', {
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
      const res = await fetch('/api/users/verify-code', {
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
    backgroundColor: '#fff',
    padding: '2rem 1.5rem 1.5rem',
    borderRadius: '8px',
    maxWidth: '420px',
    width: '100%',
    position: 'relative',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  };

  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    border: 'none',
    background: 'transparent',
    fontSize: '1.5rem',
    cursor: 'pointer',
  };

  const secondaryTextStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    color: '#555',
    lineHeight: 1.4,
  };

  return (
    <div style={{ maxWidth: 320, margin: '2rem auto' }}>
      <h2>Connexion</h2>
      <form onSubmit={handleSubmit}>
        <label>Email</label><br/>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <br/><br/>
        <label>Mot de passe</label><br/>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <br/><br/>
        <button type="submit">Se connecter</button>
      </form>
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <button type="button" onClick={openForgotModal} style={{ background: 'none', border: 'none', color: '#0077cc', cursor: 'pointer', textDecoration: 'underline' }}>
          Mot de passe oublié ?
        </button>
      </div>

      {showForgotModal && (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
          <div style={modalStyle}>
            <button style={closeButtonStyle} onClick={closeForgotModal} aria-label="Fermer la fenêtre de réinitialisation">
              ×
            </button>
            <h3 id="forgot-password-title">Réinitialiser le mot de passe</h3>
            <p style={secondaryTextStyle}>
              Si vous n'êtes pas administrateur, veuillez contacter l'administrateur pour réinitialiser votre mot de passe.
            </p>
            {hasRequestedReset && forgotMessage && (
              <p style={{ marginTop: '0.75rem' }}>{forgotMessage}</p>
            )}
            {hasRequestedReset && maskedAdminEmail && requiresVerification && (
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Un email a été envoyé à <strong>{maskedAdminEmail}</strong>.
              </p>
            )}
            {errorMessage && (
              <p style={{ color: '#c0392b', marginTop: '0.75rem' }}>{errorMessage}</p>
            )}
            {verificationMessage && (
              <p style={{ color: '#27ae60', marginTop: '0.75rem' }}>{verificationMessage}</p>
            )}

             {!hasRequestedReset && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={requestAdminReset}
                  style={{ width: '100%' }}
                  disabled={isSending}
                >
                  {isSending ? 'Envoi en cours…' : 'Réinitialiser le mot de passe administrateur'}
                </button>
              </div>
            )}

            {hasRequestedReset && !requiresVerification && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ marginBottom: '0.5rem' }}>
                  {isSending
                    ? 'Envoi du code de vérification à l\'administrateur…'
                    : 'Un email est envoyé automatiquement à l\'administrateur pour lancer la réinitialisation.'}
                </p>
                {!isSending && (
                  <button
                    type="button"
                    onClick={requestAdminReset}
                    style={{ width: '100%' }}
                  >
                    Renvoyer le code
                  </button>
                )}
              </div>
            )}

            {hasRequestedReset && requiresVerification && !verificationCompleted && (
              <>
                <form onSubmit={handleVerifyCode} style={{ marginTop: '1rem' }}>
                  <label htmlFor="verification-code">Code de vérification</label><br/>
                  <input
                    id="verification-code"
                    type="text"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value)}
                    required
                    style={{ width: '100%', marginTop: '0.5rem' }}
                  />
                  <button
                    type="submit"
                    style={{ marginTop: '1rem', width: '100%' }}
                    disabled={isVerifying}
                  >
                    {isVerifying ? 'Vérification…' : 'Valider le code'}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={requestAdminReset}
                  style={{ marginTop: '0.75rem', width: '100%' }}
                  disabled={isSending}
                >
                  {isSending ? 'Renvoi en cours…' : 'Renvoyer le code'}
                </button>
              </>
            )}

            {verificationCompleted && (
              <div style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  style={{ width: '100%' }}
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
