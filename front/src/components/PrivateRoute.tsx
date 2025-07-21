// front/src/components/PrivateRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

interface Props {
  roles?: string[];
  ownPage?: boolean;
}

const PrivateRoute: React.FC<Props> = ({ roles, ownPage = false }) => {
  const { user } = React.useContext(AuthContext)!;
  const location = useLocation();
  const params   = useParams<{ id: string }>();

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  if (ownPage && params.id && user.role !== 'admin' && user.id !== params.id) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

export default PrivateRoute;
