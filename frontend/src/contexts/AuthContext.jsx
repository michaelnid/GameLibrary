import { createContext, useContext, useState, useEffect } from 'react';
import api, { registerSessionHandlers } from '../services/api';
import { readStoredUser, storeUser, clearStoredUser, clearLegacyTokenStorage } from '../services/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        clearLegacyTokenStorage();

        const { user: savedUser, hadSession } = readStoredUser();
        let hasStoredUser = false;
        if (savedUser) {
            try {
                setUser(JSON.parse(savedUser));
                hasStoredUser = true;
            } catch {
                clearStoredUser();
            }
        }

        const shouldBootstrapSession = hasStoredUser || hadSession;
        if (!shouldBootstrapSession) {
            setLoading(false);
            return () => {
                active = false;
            };
        }

        const bootstrapSession = async () => {
            try {
                const refreshRes = await api.post('/auth/refresh', {}, {
                    skipAuthRefresh: true,
                    skipSessionExpiredHandler: true
                });
                const refreshedUser = refreshRes.data?.user;
                if (active && refreshedUser) {
                    setUser(refreshedUser);
                    storeUser(refreshedUser);
                } else if (active) {
                    setUser(null);
                    clearStoredUser();
                }
            } catch (refreshErr) {
                if (active) {
                    setUser(null);
                    clearStoredUser();
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        bootstrapSession();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        registerSessionHandlers({
            expired: () => {
                clearStoredUser();
                setUser(null);
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            },
            refreshed: (sessionUser) => {
                if (!sessionUser) return;
                storeUser(sessionUser);
                setUser(sessionUser);
            }
        });

        return () => {
            registerSessionHandlers({
                expired: () => { },
                refreshed: () => { }
            });
        };
    }, []);

    const login = async (username, password) => {
        const res = await api.post('/auth/login', { username, password });
        const userData = res.data?.user;
        if (!userData) {
            throw new Error('Ungültige Login-Antwort');
        }
        storeUser(userData);
        setUser(userData);
        return userData;
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout', {}, {
                skipAuthRefresh: true,
                skipSessionExpiredHandler: true
            });
        } catch (err) {
            // Ignore logout transport errors; local cleanup still applies.
        }
        clearStoredUser();
        setUser(null);
    };

    const isAdmin = user?.role === 'admin';
    const isGameMaster = user?.role === 'gamemaster' || user?.role === 'admin';
    const isPlayer = user?.role === 'player' || isGameMaster;

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isGameMaster, isPlayer }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
