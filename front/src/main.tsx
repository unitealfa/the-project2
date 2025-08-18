// front/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AuthProvider from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import ProtectedLayout from './components/ProtectedLayout';

import Login        from './pages/Login';
import Admin        from './pages/Admin';
import CreateUser   from './pages/CreateUser';
import Team         from './pages/Team';
import UserDetail   from './pages/UserDetail';
import EditUser     from './pages/EditUser';
import Gestionnaire from './pages/Gestionnaire';
import Confirmateur from './pages/Confirmateur';
import Orders       from './pages/Orders';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Login />} />

          {/* Admin-only */}
          <Route element={<PrivateRoute roles={['admin']} />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/admin/:id"                     element={<Admin />} />
              <Route path="/admin/:id/team"                element={<Team />} />
              <Route path="/admin/:id/create-user"         element={<CreateUser />} />
              <Route path="/admin/:id/users/:userId"       element={<UserDetail />} />
              <Route path="/admin/:id/users/:userId/edit"  element={<EditUser />} />
              <Route path="/admin/:id/orders"              element={<Orders />} />
            </Route>
          </Route>

          {/* Gestionnaire-only */}
          <Route element={<PrivateRoute roles={['gestionnaire']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/gestionnaire/:id" element={<Gestionnaire />} />
            </Route>
          </Route>

          {/* Confirmateur-only */}
          <Route element={<PrivateRoute roles={['confirmateur']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/confirmateur/:id" element={<Confirmateur />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
