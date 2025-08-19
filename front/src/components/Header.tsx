import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Header: React.FC = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null; // pas de header si pas connecté

  // Détermine la route “home” selon le rôle
  let homePath = '/';
  if (user.role === 'admin')         homePath = `/admin/${user.id}`;
  else if (user.role === 'gestionnaire') homePath = `/gestionnaire/${user.id}`;
  else if (user.role === 'confirmateur') homePath = `/confirmateur/${user.id}`;

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.5rem 1rem',
      background: '#343a40',
      color: 'white'
    }}>
      <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link to={homePath} style={{ color: 'white', textDecoration: 'none' }}>
          Accueil
        </Link>
        {user.role === 'admin' && (
          <>
            <Link
              to={`/admin/${user.id}/orders`}
              style={{ color: 'white', textDecoration: 'none' }}
            >
              Commandes
            </Link>
            <Link
              to={`/admin/${user.id}/products`}
              style={{ color: 'white', textDecoration: 'none' }}
            >
              Produits
            </Link>
          </>
        )}
        {user.role === 'gestionnaire' && (
          <Link
            to={`/gestionnaire/${user.id}/products`}
            style={{ color: 'white', textDecoration: 'none' }}
          >
            Produits
          </Link>
        )}
      </nav>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span>
          {user.firstName} {user.lastName} ({user.role})
        </span>
        <button
          onClick={handleLogout}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '0.4rem 0.8rem',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Se déconnecter
        </button>
      </div>
    </header>
  );
};

export default Header;
