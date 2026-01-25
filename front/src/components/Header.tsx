import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Header.css';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  gestionnaire: 'Gestionnaire',
  confirmateur: 'Confirmateur',
  livreur: 'Livreur',
};

type NavItem = {
  label: string;
  to: string;
};

const Header: React.FC = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const navButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isMenuOpen) {
        if (
          menuRef.current &&
          profileButtonRef.current &&
          !menuRef.current.contains(target) &&
          !profileButtonRef.current.contains(target)
        ) {
          setIsMenuOpen(false);
        }
      }

      if (isNavOpen) {
        if (
          navRef.current &&
          navButtonRef.current &&
          !navRef.current.contains(target) &&
          !navButtonRef.current.contains(target)
        ) {
          setIsNavOpen(false);
          setIsMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, isNavOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsNavOpen(false);
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setIsNavOpen(false);
    setIsMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setIsMenuOpen(false);
    logout();
    navigate('/');
  };

  if (!user) return null;

  const homePath = useMemo(() => {
    if (user.role === 'admin') return `/admin/${user.id}`;
    if (user.role === 'gestionnaire') return `/gestionnaire/${user.id}`;
    if (user.role === 'confirmateur') return `/confirmateur/${user.id}`;
    if (user.role === 'livreur') return `/livreur/${user.id}`;
    return '/';
  }, [user.id, user.role]);

  const navItems: NavItem[] = useMemo(() => {
    switch (user.role) {
      case 'admin':
        return [
          { label: 'Accueil', to: homePath },
          { label: 'Commandes', to: `/admin/${user.id}/orders` },
          { label: 'Produits', to: `/admin/${user.id}/products` },
          { label: 'Mon livreur', to: `/admin/${user.id}/livreurs` },
        ];
      case 'gestionnaire':
        return [
          { label: 'Accueil', to: homePath },
          { label: 'Produits', to: `/gestionnaire/${user.id}/products` },
        ];
      case 'confirmateur':
        return [
          { label: 'Accueil', to: homePath },
          { label: 'Commandes', to: `/confirmateur/${user.id}/orders` },
        ];
      case 'livreur':
        return [
          { label: 'Mes Commandes', to: homePath },
        ];
      default:
        return [{ label: 'Accueil', to: homePath }];
    }
  }, [homePath, user.id, user.role]);

  const profileLabel = roleLabels[user.role] ?? user.role;

  return (
    <header className="app-header">
      <div className="header-left">
        <Link to={homePath} className="header-logo" aria-label="Accueil">
          <i className="fa-solid fa-shop" aria-hidden="true"></i>
          BOUAZZA E-COM
        </Link>
        <button
          ref={navButtonRef}
          type="button"
          className={`menu-toggle${isNavOpen ? ' active' : ''}`}
          onClick={() =>
            setIsNavOpen((prev) => {
              const next = !prev;
              if (!next) {
                setIsMenuOpen(false);
              }
              return next;
            })
          }
          aria-haspopup="true"
          aria-controls="primary-navigation"
          aria-expanded={isNavOpen}
        >
          <i className="fa-solid fa-bars" aria-hidden="true"></i>
          <span className="menu-toggle-label">Menu</span>
        </button>
      </div>

      <nav
        id="primary-navigation"
        ref={navRef}
        className={`header-nav${isNavOpen ? ' open' : ''}`}
        aria-label="Navigation principale"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? 'active' : undefined
            }
            end={item.to === homePath}
            onClick={() => setIsNavOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="header-right" ref={menuRef}>
        <button
          ref={profileButtonRef}
          type="button"
          className={`profile-button${isMenuOpen ? ' active' : ''}`}
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          <i className="fa-solid fa-circle-user fa-flip-horizontal" aria-hidden="true"></i>
          <span>{profileLabel}</span>
          <svg
            className="chevron"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div className={`profile-menu${isMenuOpen ? ' open' : ''}`} role="menu">
          {user.role === 'admin' && (
            <Link
              to={`/admin/${user.id}/team`}
              role="menuitem"
              onClick={() => setIsMenuOpen(false)}
            >
              <i className="fa-solid fa-users" aria-hidden="true"></i>
              Mon équipe
            </Link>
          )}
          {user.role === 'livreur' && (
            <Link
              to={`/livreur/${user.id}/history`}
              role="menuitem"
              onClick={() => setIsMenuOpen(false)}
            >
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
              Mon historique
            </Link>
          )}
          <button type="button" role="menuitem" onClick={handleLogout}>
            <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
            Se déconnecter
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
