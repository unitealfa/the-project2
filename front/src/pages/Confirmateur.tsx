// front/src/pages/Confirmateur.tsx

import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Confirmateur: React.FC = () => {
  const { user } = useContext(AuthContext);

  if (!user) {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Non authentifié</p>;
  }
  if (user.role !== 'confirmateur') {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Accès refusé</p>;
  }

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', textAlign: 'center' }}>
      <h1>Bienvenue {user.firstName} {user.lastName}</h1>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Rôle:</strong> {user.role}</p>
    </div>
  );
};

export default Confirmateur;
