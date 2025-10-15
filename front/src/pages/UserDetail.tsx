// front/src/pages/UserDetail.tsx
import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

import '../styles/Team.css';

const roleLabels: Partial<Record<User['role'], string>> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  confirmateur: 'Confirmateur',
};

const isKnownRole = (role: User['role']): role is 'admin' | 'gestionnaire' | 'confirmateur' =>
  role === 'admin' || role === 'gestionnaire' || role === 'confirmateur';

const UserDetail: React.FC = () => {
  const params = useParams<{ id: string; userId: string }>();
  const adminId = params.id ?? '';
  const selectedUserId = params.userId ?? '';
  const { token, user } = useContext(AuthContext);
  const [member, setMember] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedUserId || !token) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/users/${selectedUserId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'message' in body
              ? String((body as Record<string, unknown>).message)
              : `Erreur ${res.status}`;
          throw new Error(message);
        }
        if (!body) throw new Error('Réponse invalide du serveur');
        const data: User = body as User;
        if (mounted) setMember(data);
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedUserId, token]);

  const renderMessage = (
    message: string,
    tone: 'default' | 'error' = 'default',
    actions: React.ReactNode[] = []
  ) => (
    <div className="team-page">
      <section className={`team-card team-card--message team-card--${tone}`}>
        <div className="team-message">
          <p>{message}</p>
          {actions.length > 0 && (
            <div className="team-message__actions">
              {actions.map((action, index) => (
                <React.Fragment key={index}>{action}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  if (!user || user.role !== 'admin') {
    return renderMessage('Accès non autorisé', 'error');
  }

  if (loading) {
    return renderMessage('Chargement en cours…');
  }

  if (error) {
    return renderMessage(error, 'error', [
      <Link
        key="back"
        to={`/admin/${adminId}/team`}
        className="team-button team-button--ghost"
      >
        ← Retour à l’équipe
      </Link>,
    ]);
  }

  if (!member) {
    return renderMessage('Aucun utilisateur trouvé.', 'error', [
      <Link
        key="back"
        to={`/admin/${adminId}/team`}
        className="team-button team-button--ghost"
      >
        ← Retour à l’équipe
      </Link>,
    ]);
  }

  const firstInitial = (member.firstName ?? '').trim().charAt(0);
  const lastInitial = (member.lastName ?? '').trim().charAt(0);
  const initialsRaw = `${firstInitial}${lastInitial}`.trim();
  const initials = initialsRaw ? initialsRaw.toUpperCase() : '?';
  const roleLabel = roleLabels[member.role] ?? member.role;
  const roleBadgeModifier = isKnownRole(member.role) ? ` team-role-badge--${member.role}` : '';

  return (
    <div className="team-page">
      <header className="team-page__header">
        <div>
          <h1>Profil collaborateur</h1>
          <p className="team-page__subtitle">
            Consultez les informations du membre et suivez son rôle au sein de votre équipe.
          </p>
        </div>
        <div className="team-page__actions">
          <Link to={`/admin/${adminId}/team`} className="team-button team-button--ghost">
            ← Retour
          </Link>
          <Link
            to={`/admin/${adminId}/users/${member.id}/edit`}
            className="team-button team-button--primary"
          >
            Éditer
          </Link>
        </div>
      </header>

      <section className="team-card">
        <div className="team-profile">
          <div className="team-profile__avatar" aria-hidden="true">
            {initials}
          </div>
          <div>
            <h2 className="team-profile__name">
              {member.firstName || '—'} {member.lastName || ''}
            </h2>
            <div className="team-profile__meta">
              <a href={`mailto:${member.email}`} className="team-link">
                {member.email}
              </a>
              <span className={`team-role-badge${roleBadgeModifier}`}>
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        <dl className="team-detail">
          <div className="team-detail__item">
            <dt className="team-detail__label">Prénom</dt>
            <dd className="team-detail__value">{member.firstName || '—'}</dd>
          </div>
          <div className="team-detail__item">
            <dt className="team-detail__label">Nom</dt>
            <dd className="team-detail__value">{member.lastName || '—'}</dd>
          </div>
          <div className="team-detail__item">
            <dt className="team-detail__label">Email</dt>
            <dd className="team-detail__value">
              <a href={`mailto:${member.email}`} className="team-link">
                {member.email}
              </a>
            </dd>
          </div>
          <div className="team-detail__item">
            <dt className="team-detail__label">Rôle</dt>
            <dd className="team-detail__value">
              <span className={`team-role-badge${roleBadgeModifier}`}>
                {roleLabel}
              </span>
            </dd>
          </div>
          <div className="team-detail__item">
            <dt className="team-detail__label">Identifiant</dt>
            <dd className="team-detail__value team-detail__value--muted">{member.id}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

export default UserDetail;