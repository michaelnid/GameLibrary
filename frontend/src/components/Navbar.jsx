import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
    const { user, logout, isAdmin, isGameMaster } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <NavLink to="/" className="navbar-brand">
                    <span className="dice-icon">M</span>
                    <div className="brand-text">
                        <span className="brand-line-1">MIKE</span>
                        <span className="brand-line-2">Game Library</span>
                    </div>
                </NavLink>

                <div className="navbar-links">
                    <NavLink to="/" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`} end>
                        Home
                    </NavLink>
                    <NavLink to="/spiele" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                        Lokal
                    </NavLink>
                    <NavLink to="/multiplayer" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                        Multiplayer
                    </NavLink>
                    <NavLink to="/highscores" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                        Highscores
                    </NavLink>

                    {isAdmin && (
                        <NavLink to="/admin" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                            Admin
                        </NavLink>
                    )}
                    {user ? (
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={handleLogout} title="Abmelden">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    ) : (
                        <NavLink to="/login" className="btn btn-primary btn-sm navbar-login-btn" aria-label="Anmelden" title="Anmelden">
                            <span className="navbar-login-label">Anmelden</span>
                            <svg className="navbar-login-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <polyline points="10 17 15 12 10 7" />
                                <line x1="15" y1="12" x2="3" y2="12" />
                            </svg>
                        </NavLink>
                    )}
                </div>
            </div>
        </nav>
    );
}
