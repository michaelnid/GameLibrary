const USER_KEY = 'game_library_user';
const LEGACY_USER_KEY = 'kniffel_user';
const SESSION_HINT_KEY = 'game_library_session_hint';

export function readStoredUser() {
    const user = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
    const hadSession = localStorage.getItem(SESSION_HINT_KEY) === '1';
    return { user, hadSession };
}

export function storeUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.setItem(SESSION_HINT_KEY, '1');
}

export function clearStoredUser() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.removeItem(SESSION_HINT_KEY);
}

// Cleanup for migrated sessions from old token-based auth.
export function clearLegacyTokenStorage() {
    localStorage.removeItem('game_library_token');
    localStorage.removeItem('kniffel_token');
}
