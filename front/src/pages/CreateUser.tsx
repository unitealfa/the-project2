// front/src/pages/CreateUser.tsx

import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';import { CreateUserDto } from '../types';
import { AuthContext } from '../context/AuthContext';

import '../styles/Team.css';

type RoleValue = CreateUserDto['role'];

const roleOptions: Array<{
  value: RoleValue;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    value: 'gestionnaire',
    label: 'Gestionnaire',
    badge: 'Gestion',
    description:
      'Accès complet aux commandes, aux stocks et au suivi quotidien des opérations commerciales.',
  },
  {
    value: 'confirmateur',
    label: 'Confirmateur',
    badge: 'Validation',
    description:
      'Valide les demandes en attente et assure le contrôle qualité avant la mise à disposition.',
  },
  {
    value: 'livreur',
    label: 'Livreur',
    badge: 'Livraison',
    description:
      'Gère les livraisons et peut valider ou annuler les commandes qui lui sont assignées.',
  },
];

const CreateUser: React.FC = () => {
  const params = useParams<{ id: string }>();
  const adminId = params.id ?? '';
  const navigate = useNavigate();
  const { token, user } = useContext(AuthContext);

  useEffect(() => {
    if (!user || user.role !== 'admin' || (adminId && user.id !== adminId)) {
      navigate('/', { replace: true });
    }
  }, [user, adminId, navigate]);

  const [form, setForm] = useState<CreateUserDto>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'gestionnaire',
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    if (!token) {
      setServerError('Votre session a expiré. Veuillez vous reconnecter.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (res.status === 401) {
        throw new Error('Non autorisé : vous devez être admin.');
      }

      const body = await res.json();
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String((body as Record<string, unknown>).message)
            : `Erreur ${res.status}`;
        throw new Error(message);
      }

      navigate(`/admin/${adminId}/team`);
    } catch (err: any) {
      setServerError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="team-page">
      <header className="team-page__header">
        <div>
          <h1>Ajouter un collaborateur</h1>
          <p className="team-page__subtitle">
            Créez un accès sécurisé pour un membre de votre équipe et assignez-lui le bon niveau
            d’autorisation.
          </p>
        </div>
        <div className="team-page__actions">
          <Link to={`/admin/${adminId}/team`} className="team-button team-button--ghost">
            Annuler
          </Link>
          <button
            type="submit"
            form="create-user-form"
            className="team-button team-button--primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Création…' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {serverError && (
        <div className="team-alert" role="alert">
          <p className="team-alert__title">La création a échoué</p>
          <p>{serverError}</p>
        </div>
      )}

      <section className="team-card">
        <form id="create-user-form" className="team-form" onSubmit={handleSubmit}>
          <div className="team-form__section">
            <div>
              <h2 className="team-form__legend">Informations personnelles</h2>
              <p className="team-form__description">
                Ces informations permettent d’identifier facilement le collaborateur dans vos outils
                internes.
              </p>
            </div>
            <div className="team-form__grid">
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
                  Adresse e-mail professionnelle
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
            </div>
          </div>

          <div className="team-form__section">
            <div>
              <h2 className="team-form__legend">Sécurité</h2>
              <p className="team-form__description">
                Définissez un mot de passe temporaire qui sera communiqué au collaborateur.
              </p>
            </div>
            <div className="team-form__grid">
              <div className="team-form__group">
                <label className="team-form__label" htmlFor="password">
                  Mot de passe provisoire
                </label>
                <div className="team-form__password-field">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="team-form__control"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    placeholder="Saisissez un mot de passe sécurisé"
                    required
                  />
                  <button
                    type="button"
                    className="team-form__password-toggle"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="team-form__hint">
                  Le collaborateur pourra le personnaliser lors de sa première connexion.
                </p>
              </div>
            </div>
          </div>

          <div className="team-form__section">
            <div>
              <h2 className="team-form__legend">Rôle et permissions</h2>
              <p className="team-form__description">
                Choisissez un niveau d’accès adapté aux responsabilités du collaborateur.
              </p>
            </div>
            <div className="team-role-options">
              {roleOptions.map(option => (
                <label
                  key={option.value}
                  className={`team-role-option${
                    form.role === option.value ? ' team-role-option--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={form.role === option.value}
                    onChange={handleChange}
                  />
                  <span className="team-role-option__badge">{option.badge}</span>
                  <h3 className="team-role-option__title">{option.label}</h3>
                  <p className="team-role-option__description">{option.description}</p>
                </label>
              ))}
            </div>
          </div>

          <div className="team-form__footer">
            <div className="team-form__note">
              <ShieldCheck size={20} aria-hidden="true" />
              <p>
                <strong>Bon à savoir :</strong> partagez le mot de passe via un canal sécurisé et
                invitez le collaborateur à le modifier dès sa première connexion.
              </p>
            </div>
            <div className="team-form__footer-actions">
              <Link to={`/admin/${adminId}/team`} className="team-button team-button--ghost">
                Annuler
              </Link>
              <button
                type="submit"
                className="team-button team-button--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Création…' : 'Créer le compte'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
};

export default CreateUser;