import api from './api';
import { FALLBACK_GAME_TYPES } from '../games/registry';

export async function loadGameTypesOrFallback(options = {}) {
    try {
        const params = options.local ? '?local=true' : '';
        const res = await api.get(`/game-types${params}`);
        if (Array.isArray(res.data) && res.data.length > 0) {
            return res.data;
        }
        return FALLBACK_GAME_TYPES;
    } catch (err) {
        if (err.response?.status !== 404) {
            console.error('Failed to load game types:', err);
        }
        return FALLBACK_GAME_TYPES;
    }
}
