// front/src/pages/EditUser.tsx

import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CreateUserDto, User } from '../types';
import { AuthContext } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../utils/api';

import '../styles/Team.css';

type EditUserForm = Omit<CreateUserDto, 'role'> & { role: User['role'] };

const EditUser: React.FC = () => {
  const params = useParams<{ id: string; userId: string }>();
  const adminId = params.id ?? '';
  const userId = params.userId ?? '';
  const navigate = useNavigate();
  const { token, user: currentUser } = useContext(AuthContext);

  const [form, setForm] = useState<EditUserForm>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'gestionnaire',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!userId || !token) return;

    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/users/${userId}`, {
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
        const u: User = body as User;
        if (!mounted) return;
        setForm({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          password: '',
          role: u.role,
        });
        setError(null);
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, token]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

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

  if (!currentUser || currentUser.role !== 'admin') {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : `Erreur ${res.status}`;
        throw new Error(message);
      }
      navigate(`/admin/${adminId}/team`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="team-page">
      <header className="team-page__header">
        <div>
          <h1>Modifier un membre</h1>
          <p className="team-page__subtitle">
            Actualisez les informations d’accès et les coordonnées de votre collaborateur.
          </p>
        </div>
        <div className="team-page__actions">
          <Link to={`/admin/${adminId}/team`} className="team-button team-button--ghost">
            Annuler
          </Link>
          <button
            type="submit"
            form="edit-user-form"
            className="team-button team-button--primary"
            disabled={isSaving}
          >
            {isSaving ? 'Enregistrement…' : 'Valider'}
          </button>
        </div>
      </header>

      <section className="team-card">
        <form id="edit-user-form" className="team-form" onSubmit={handleSubmit}>
          <div className="team-form__group">
            <label className="team-form__label" htmlFor="firstName">
              Prénom
            </label>
            <input
              id="firstName"
              name="firstName"
              className="team-form__control"
              value={form.firstName}
              onChange={handleChange}
              autoComplete="given-name"
              required
            />
          </div>

          <div className="team-form__group">
            <label className="team-form__label" htmlFor="lastName">
              Nom
            </label>
            <input
              id="lastName"
              name="lastName"
              className="team-form__control"
              value={form.lastName}
              onChange={handleChange}
              autoComplete="family-name"
              required
            />
          </div>

          <div className="team-form__group">
            <label className="team-form__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              className="team-form__control"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="team-form__group">
            <label className="team-form__label" htmlFor="password">
              Mot de passe
            </label>
            <div className="team-form__password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className="team-form__control"
                value={form.password}
                onChange={handleChange}
                placeholder="Laisser vide pour conserver"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="team-form__password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="team-form__hint">Laissez vide pour conserver le mot de passe actuel.</p>
          </div>

          <div className="team-form__group">
            <label className="team-form__label" htmlFor="role">
              Rôle
            </label>
            <select
              id="role"
              name="role"
              className="team-form__control"
              value={form.role}
              onChange={handleChange}
              required
            >
              <option value="admin">Administrateur</option>
              <option value="gestionnaire">Gestionnaire</option>
              <option value="confirmateur">Confirmateur</option>
            </select>
          </div>

          <div className="team-form__actions">
            <Link to={`/admin/${adminId}/team`} className="team-button team-button--ghost">
              Annuler
            </Link>
            <button
              type="submit"
              className="team-button team-button--primary"
              disabled={isSaving}
            >
              {isSaving ? 'Enregistrement…' : 'Valider'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default EditUser;
