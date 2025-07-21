// front/src/pages/Login.tsx

import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { AuthContext } from '../context/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { user, login } = useContext(AuthContext);

  // Si déjà logué, on redirige automatiquement vers sa page home
  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin')        navigate(`/admin/${user.id}`,        { replace: true });
    else if (user.role === 'gestionnaire') navigate(`/gestionnaire/${user.id}`, { replace: true });
    else                               navigate(`/confirmateur/${user.id}`, { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = (await res.json()) as User & { token: string };

      // stocke user + token
      login(
        { id: data.id, firstName: data.firstName, lastName: data.lastName, email: data.email, role: data.role },
        data.token
      );
    } catch (err: any) {
      alert(err.message);
    }
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
    </div>
  );
};

export default Login;
