// front/src/pages/CreateUser.tsx

import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreateUserDto } from '../types';
import { AuthContext } from '../context/AuthContext';

const CreateUser: React.FC = () => {
  const { id } = useParams<{ id: string }>();   // ID de l’admin connecté
  const navigate = useNavigate();
  const { token, user } = useContext(AuthContext);

  // Protection : seul l’admin propriétaire de cette page peut y accéder
  useEffect(() => {
    if (!user || user.role !== 'admin' || user.id !== id) {
      navigate('/', { replace: true });
    }
  }, [user, id, navigate]);

  const [form, setForm] = useState<CreateUserDto>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'gestionnaire',
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (res.status === 401) {
        throw new Error('Non autorisé : vous devez être admin');
      }
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || `Erreur ${res.status}`);
      }

      // Après création, on reste connecté et on retourne à la liste de l’équipe
      navigate(`/admin/${id}/team`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Créer un utilisateur</h2>
      {error && (
        <p style={{ color: 'red', marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label>Prénom</label><br/>
        <input
          name="firstName"
          value={form.firstName}
          onChange={handleChange}
          required
        />
        <br/><br/>

        <label>Nom</label><br/>
        <input
          name="lastName"
          value={form.lastName}
          onChange={handleChange}
          required
        />
        <br/><br/>

        <label>Email</label><br/>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <br/><br/>

        <label>Mot de passe</label><br/>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <br/><br/>

        <label>Rôle</label><br/>
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          required
        >
          <option value="gestionnaire">Gestionnaire</option>
          <option value="confirmateur">Confirmateur</option>
        </select>
        <br/><br/>

        <button type="submit">Créer l’utilisateur</button>
      </form>
    </div>
  );
};

export default CreateUser;
