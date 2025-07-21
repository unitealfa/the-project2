// front/src/components/ProtectedLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';

const ProtectedLayout: React.FC = () => (
  <>
    <Header />
    <main>
      <Outlet />
    </main>
  </>
);

export default ProtectedLayout;
