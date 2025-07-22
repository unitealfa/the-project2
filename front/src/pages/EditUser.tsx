// front/src/pages/EditUser.tsx

import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CreateUserDto } from '../types';
import { AuthContext } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

const EditUser: React.FC = () => {
  const { id: adminId, userId } = useParams<{ id: string; userId: string }>();
  const navigate = useNavigate();
  const { token, user: currentUser } = useContext(AuthContext);

  const [form, setForm] = useState<CreateUserDto>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'gestionnaire',
  });
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Load the user to edit
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const u = await res.json();
        setForm({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          password: '',           // do not prefill with hash
          role: u.role,
        });
      } catch {
        alert('Impossible de charger les données');
        navigate(`/admin/${adminId}/team`, { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, token, navigate, adminId]);

  // Protect route
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Chargement…</p>;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `Erreur ${res.status}`);
      }
      navigate(`/admin/${adminId}/team`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Modifier {form.firstName} {form.lastName}</h2>
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
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Laisser vide pour conserver"
            style={{ flex: 1, paddingRight: 32 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: 'absolute',
              right: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer'
            }}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <br/><br/>

        <label>Rôle</label><br/>
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          required
        >
          <option value="admin">Admin</option>
          <option value="gestionnaire">Gestionnaire</option>
          <option value="confirmateur">Confirmateur</option>
        </select>
        <br/><br/>

        <button type="submit">Valider</button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        <Link to={`/admin/${adminId}/team`}>← Retour à l’équipe</Link>
      </p>
    </div>
  );
};

export default EditUser;
