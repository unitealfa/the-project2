// front/src/pages/UserDetail.tsx
import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

const UserDetail: React.FC = () => {
  const { id: adminId, userId } = useParams<{ id: string; userId: string }>();
  const { token, user } = useContext(AuthContext);
  const [u, setU] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setU(await res.json());
    })();
  }, [userId]);

  if (!user || user.role !== 'admin') {
    return <p>Accès non autorisé</p>;
  }
  if (!u) return <p>Chargement…</p>;

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
