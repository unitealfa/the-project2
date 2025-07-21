// front/src/pages/Team.tsx

import React, { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

const Team: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useContext(AuthContext);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const data: User[] = await res.json();
        setTeam(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // protection basique : seul admin voit cette page
  if (!user || user.role !== 'admin') {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Accès non autorisé</p>;
  }
  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Chargement…</p>;
  if (error)   return <p style={{ color: 'red', textAlign: 'center', marginTop: '2rem' }}>{error}</p>;

  return (
    <div style={{ maxWidth: 700, margin: '2rem auto' }}>
      <h2 style={{ textAlign: 'center' }}>Mon équipe</h2>
      <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <Link
          to={`/admin/${id}/create-user`}
          state={{ user }}
          style={{
            textDecoration: 'none',
            background: '#007bff',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: 4
          }}
        >
          Créer un utilisateur
        </Link>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Prénom</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Nom</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Email</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Rôle</th>
          </tr>
        </thead>
        <tbody>
          {team.map(u => {
            const isMe = u.id === id;
            return (
              <tr
                key={u.id}
                style={{
                  background: isMe ? '#d1ecf1' : 'white', 
                  fontWeight: isMe ? 'bold' : 'normal'
                }}
              >
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.firstName}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.lastName}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.email}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{u.role}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Team;
