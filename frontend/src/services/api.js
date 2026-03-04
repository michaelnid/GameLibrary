import axios from 'axios';
import { clearStoredUser } from './authStorage';

let onSessionExpired = () => { };
let onSessionRefreshed = () => { };

export function registerSessionHandlers({ expired, refreshed } = {}) {
    if (typeof expired === 'function') onSessionExpired = expired;
    if (typeof refreshed === 'function') onSessionRefreshed = refreshed;
}

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true
});

let refreshPromise = null;

async function refreshSession() {
    if (!refreshPromise) {
        refreshPromise = api.post('/auth/refresh', {}, { skipAuthRefresh: true })
            .then((response) => {
                const user = response.data?.user || null;
                onSessionRefreshed(user);
                return user;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

// Handle 401 responses
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response?.status;
        const originalRequest = error.config || {};
        const url = originalRequest.url || '';
        const isAuthEndpoint = typeof url === 'string'
            && (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout'));

        if (status === 401 && !originalRequest.skipAuthRefresh) {
            if (!originalRequest._retry && !isAuthEndpoint) {
                originalRequest._retry = true;
                try {
                    const user = await refreshSession();
                    if (user) {
                        return api(originalRequest);
                    }
                    clearStoredUser();
                    if (!originalRequest.skipSessionExpiredHandler) {
                        onSessionExpired();
                    }
                } catch (refreshError) {
                    clearStoredUser();
                    if (!originalRequest.skipSessionExpiredHandler) {
                        onSessionExpired();
                    }
                    return Promise.reject(refreshError);
                }
            } else if (!isAuthEndpoint) {
                clearStoredUser();
                if (!originalRequest.skipSessionExpiredHandler) {
                    onSessionExpired();
                }
            }
        }

        return Promise.reject(error);
    }
);

export default api;
