// front/src/main.tsx

import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AuthProvider from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import ProtectedLayout from './components/ProtectedLayout';

const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const CreateUser = lazy(() => import('./pages/CreateUser'));
const Team = lazy(() => import('./pages/Team'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const EditUser = lazy(() => import('./pages/EditUser'));
const Gestionnaire = lazy(() => import('./pages/Gestionnaire'));
const Confirmateur = lazy(() => import('./pages/Confirmateur'));
const DeliveryPerson = lazy(() => import('./pages/DeliveryPerson'));
const DeliveryHistory = lazy(() => import('./pages/DeliveryHistory'));
const AdminDeliveryOrders = lazy(() => import('./pages/AdminDeliveryOrders'));
const Orders = lazy(() => import('./pages/Orders'));
const Products = lazy(() => import('./pages/Products'));

import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<p style={{ textAlign: 'center', marginTop: '2rem' }}>Chargement…</p>}>
          <Routes>
          {/* Public */}
          <Route path="/" element={<Login />} />

          {/* Admin-only */}
          <Route element={<PrivateRoute roles={['admin']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/admin/:id"                     element={<Admin />} />
              <Route path="/admin/:id/team"                element={<Team />} />
              <Route path="/admin/:id/create-user"         element={<CreateUser />} />
              <Route path="/admin/:id/users/:userId"       element={<UserDetail />} />
              <Route path="/admin/:id/users/:userId/edit"  element={<EditUser />} />
              <Route path="/admin/:id/orders"              element={<Orders />} />
              <Route path="/admin/:id/livreurs"            element={<AdminDeliveryOrders />} />
              <Route path="/admin/:id/products"            element={<Products />} />
            </Route>
          </Route>

          {/* Gestionnaire-only */}
          <Route element={<PrivateRoute roles={['gestionnaire']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/gestionnaire/:id" element={<Gestionnaire />} />
              <Route path="/gestionnaire/:id/products" element={<Products />} />
            </Route>
          </Route>

          {/* Confirmateur-only */}
          <Route element={<PrivateRoute roles={['confirmateur']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/confirmateur/:id" element={<Confirmateur />} />
              <Route path="/confirmateur/:id/orders" element={<Orders />} />
            </Route>
          </Route>

          {/* Livreur-only */}
          <Route element={<PrivateRoute roles={['livreur']} ownPage />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/livreur/:id" element={<DeliveryPerson />} />
              <Route path="/livreur/:id/history" element={<DeliveryHistory />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
