// front/src/pages/Team.tsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

const Team: React.FC = () => {
  const { id: adminId } = useParams<{ id: string }>();
  const { token, user } = useContext(AuthContext);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/users', {
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
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  if (!user || user.role !== 'admin') {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Accès non autorisé</p>;
  }
  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Chargement…</p>;
  if (error)   return <p style={{ color: 'red', textAlign: 'center', marginTop: '2rem' }}>{error}</p>;

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchTeam();
    else alert('Erreur suppression');
  };

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto' }}>
      <h2 style={{ textAlign: 'center' }}>Mon équipe</h2>
      <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <Link
          to={`/admin/${adminId}/create-user`}
          style={{
            background: '#007bff',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: 4,
            textDecoration: 'none'
          }}
        >
          Créer un utilisateur
        </Link>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            {['Prénom','Nom','Email','Rôle','Actions'].map(h => (
              <th key={h} style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {team.map(u => {
            const isAdmin = u.role === 'admin';
            const isMe = u.id === adminId;
            return (
              <tr
                key={u.id}
                style={{
                  background: isMe ? '#d1ecf1' : 'white',
                  fontWeight: isMe ? 'bold' : 'normal',
                }}
              >
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.firstName}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.lastName}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.email}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.role}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>
                  <Link to={`/admin/${adminId}/users/${u.id}`} style={{ marginRight: 8 }}>
                    Voir
                  </Link>
                  <Link to={`/admin/${adminId}/users/${u.id}/edit`} style={{ marginRight: 8 }}>
                    Éditer
                  </Link>
                  {!isAdmin && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 3,
                        cursor: 'pointer'
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Team;
