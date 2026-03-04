import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole === 'admin' && user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    if (requiredRole === 'gamemaster' && user.role !== 'admin' && user.role !== 'gamemaster') {
        return <Navigate to="/" replace />;
    }

    return children;
}
