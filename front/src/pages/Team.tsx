// front/src/pages/Team.tsx
import React, { useEffect, useState, useContext, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

import '../styles/Team.css';

const Team: React.FC = () => {
  const { id: adminId } = useParams<{ id: string }>();
  const { token, user } = useContext(AuthContext);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await apiFetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: User[] = await res.json();
      setTeam(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const roleLabels = useMemo(
    () => ({
      admin: 'Administrateur',
      gestionnaire: 'Gestionnaire',
      confirmateur: 'Confirmateur',
    }),
    []
  );

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;

    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }

      await fetchTeam();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Erreur suppression";
      alert(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderMessage = (message: string, tone: 'default' | 'error' = 'default') => (
    <div className={`team-card team-card--message team-card--${tone}`}>
      <p>{message}</p>
    </div>
  );

  if (!user || user.role !== 'admin') {
    return <div className="team-page">{renderMessage('Accès non autorisé', 'error')}</div>;
  }

  if (loading) {
    return <div className="team-page">{renderMessage('Chargement en cours…')}</div>;
  }

  if (error) {
    return <div className="team-page">{renderMessage(error, 'error')}</div>;
  }

  const hasTeamMembers = team.length > 0;

  return (
    <div className="team-page">
      <header className="team-page__header">
        <div>
          <h1>Mon équipe</h1>
          <p className="team-page__subtitle">
            Retrouvez les membres de votre organisation et gérez leurs accès.
          </p>
        </div>
        <div className="team-page__actions">
          <Link
            to={`/admin/${adminId}/create-user`}
            className="team-page__create-button"
          >
            <span className="team-page__create-icon" aria-hidden="true">+</span>
            Nouvel utilisateur
          </Link>
        </div>
      </header>

      <section className="team-card" aria-live="polite">
        {hasTeamMembers ? (
          <div className="team-table-wrapper">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Prénom</th>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th className="team-table__actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => {
                  const isAdmin = member.role === 'admin';
                  const isMe = member.id === adminId;
                  const rowClassName = [
                    'team-table__row',
                    isMe ? 'team-table__row--current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <tr key={member.id} className={rowClassName}>
                      <td data-label="Prénom">
                        <div className="team-member">
                          <span className="team-member__initials" aria-hidden="true">
                            {(member.firstName || '?').charAt(0)}
                            {(member.lastName || '').charAt(0)}
                          </span>
                          <div>
                            <span className="team-member__name">{member.firstName || '—'}</span>
                            {isMe && <span className="team-tag">Vous</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Nom">{member.lastName || '—'}</td>
                      <td data-label="Email">
                        <a href={`mailto:${member.email}`} className="team-link">
                          {member.email}
                        </a>
                      </td>
                      <td data-label="Rôle">
                        <span className={`team-role-badge team-role-badge--${member.role}`}>
                          {roleLabels[member.role as keyof typeof roleLabels] ?? member.role}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div className="team-actions">
                          <Link
                            to={`/admin/${adminId}/users/${member.id}`}
                            className="team-action-button"
                          >
                            Voir
                          </Link>
                          <Link
                            to={`/admin/${adminId}/users/${member.id}/edit`}
                            className="team-action-button team-action-button--secondary"
                          >
                            Éditer
                          </Link>
                          {!isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(member.id)}
                              className="team-action-button team-action-button--danger"
                              disabled={isDeleting}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="team-empty">
            <p>Vous n'avez pas encore ajouté de collaborateurs.</p>
            <Link
              to={`/admin/${adminId}/create-user`}
              className="team-empty__cta"
            >
              Inviter un premier membre
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

export default Team;
