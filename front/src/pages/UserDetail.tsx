// front/src/pages/UserDetail.tsx
import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

const UserDetail: React.FC = () => {
  const { id: adminId, userId } = useParams<{ id: string; userId: string }>();
  const { token, user } = useContext(AuthContext);
  const [u, setU] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !token) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message = body && typeof body === 'object' && 'message' in body
            ? String((body as any).message)
            : `Erreur ${res.status}`;
          throw new Error(message);
        }
        if (!body) throw new Error('Réponse invalide du serveur');
        const data: User = body as User;
        if (mounted) setU(data);
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, token]);

  if (!user || user.role !== 'admin') {
    return <p>Accès non autorisé</p>;
  }
  if (loading) return <p>Chargement…</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!u) return <p>Aucun utilisateur trouvé.</p>;

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Détails de {u.firstName} {u.lastName}</h2>
      <p><strong>Prénom:</strong> {u.firstName}</p>
      <p><strong>Nom:</strong> {u.lastName}</p>
      <p><strong>Email:</strong> {u.email}</p>
      <p><strong>Rôle:</strong> {u.role}</p>
      <Link to={`/admin/${adminId}/team`}>← Retour à l’équipe</Link>
    </div>
  );
};

export default UserDetail;