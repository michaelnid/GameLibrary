import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = location.state?.from || '/spiele';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !password) return;

        setLoading(true);
        try {
            await login(username, password);
            toast.success('Erfolgreich angemeldet');
            navigate(returnTo);
        } catch (err) {
            const msg = err.response?.data?.error || 'Anmeldung fehlgeschlagen';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="card login-card">
                <h1 className="login-title">Anmelden</h1>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Benutzername</label>
                        <input
                            type="text"
                            className="form-input"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="Benutzername eingeben"
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Passwort</label>
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Passwort eingeben"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                        {loading ? 'Wird angemeldet...' : 'Anmelden'}
                    </button>
                </form>
            </div>
        </div>
    );
}
