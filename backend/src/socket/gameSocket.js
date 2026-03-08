const jwt = require('jsonwebtoken');
const { parseCookieHeader } = require('../utils/cookies');
const { MultiplayerRoom, MultiplayerPlayer } = require('../models');

// In-memory cache for game live state (dice selection + current player)
const gameStates = new Map();
const MAX_TRACKED_GAMES = Number.parseInt(process.env.SOCKET_MAX_TRACKED_GAMES || '500', 10);
const STATE_TTL_MS = Number.parseInt(process.env.SOCKET_STATE_TTL_MS || `${6 * 60 * 60 * 1000}`, 10);
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'gl_access_token';

function toPositiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeGameId(gameId) {
    const parsed = toPositiveInt(gameId);
    return parsed ? String(parsed) : null;
}

function normalizeRoomCode(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') return null;
    const code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) return null;
    return code;
}

function parseSocketToken(socket) {
    if (typeof socket.handshake?.auth?.token === 'string' && socket.handshake.auth.token.trim()) {
        return socket.handshake.auth.token.trim();
    }

    const cookies = parseCookieHeader(socket.handshake?.headers?.cookie);
    if (cookies[ACCESS_COOKIE_NAME]) {
        return cookies[ACCESS_COOKIE_NAME];
    }

    const authHeader = socket.handshake?.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
}

function attachSocketIdentity(socket) {
    socket.data.userId = null;
    socket.data.userRole = 'anonymous';
    socket.data.tokenExpiresAt = null;

    const token = parseSocketToken(socket);
    if (!token || !process.env.JWT_SECRET) return;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.tokenType && decoded.tokenType !== 'access') {
            return;
        }
        socket.data.userId = decoded.userId || null;
        socket.data.userRole = decoded.role || 'anonymous';
        if (decoded.exp) {
            socket.data.tokenExpiresAt = decoded.exp * 1000;
        }
    } catch (err) {
        socket.data.userId = null;
        socket.data.userRole = 'anonymous';
        socket.data.tokenExpiresAt = null;
    }
}

function canWriteLiveState(socket) {
    return ['admin', 'gamemaster'].includes(socket.data?.userRole);
}

function maxTrackedGames() {
    return Number.isSafeInteger(MAX_TRACKED_GAMES) && MAX_TRACKED_GAMES >= 50
        ? MAX_TRACKED_GAMES
        : 500;
}

function stateTtlMs() {
    return Number.isSafeInteger(STATE_TTL_MS) && STATE_TTL_MS >= 60_000
        ? STATE_TTL_MS
        : 6 * 60 * 60 * 1000;
}

function enforceStateLimit() {
    const maxEntries = maxTrackedGames();
    if (gameStates.size <= maxEntries) return;

    const entriesByAge = Array.from(gameStates.entries())
        .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));

    const overflow = gameStates.size - maxEntries;
    for (let i = 0; i < overflow; i += 1) {
        gameStates.delete(entriesByAge[i][0]);
    }
}

function cleanupStaleStates() {
    const now = Date.now();
    const ttl = stateTtlMs();

    gameStates.forEach((value, key) => {
        if (!value.updatedAt || now - value.updatedAt > ttl) {
            gameStates.delete(key);
        }
    });
}

function updateGameState(gameId, patch) {
    const existing = gameStates.get(gameId) || {};
    gameStates.set(gameId, {
        ...existing,
        ...patch,
        updatedAt: Date.now()
    });
    enforceStateLimit();
}

function clearGameState(gameId) {
    const normalizedGameId = normalizeGameId(gameId);
    if (normalizedGameId) {
        gameStates.delete(normalizedGameId);
    }
}

function setupGameSocket(io) {
    const intervalMs = Math.min(Math.max(Math.floor(stateTtlMs() / 2), 60_000), 10 * 60_000);
    const cleanupHandle = setInterval(cleanupStaleStates, intervalMs);
    if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();

    io.on('connection', (socket) => {
        attachSocketIdentity(socket);
        let tokenExpiryTimer = null;

        if (socket.data.tokenExpiresAt && socket.data.tokenExpiresAt > Date.now()) {
            tokenExpiryTimer = setTimeout(() => {
                socket.disconnect(true);
            }, socket.data.tokenExpiresAt - Date.now() + 1000);

            if (typeof tokenExpiryTimer.unref === 'function') tokenExpiryTimer.unref();
        }

        // Client joins a game room to receive live updates
        socket.on('joinGame', (gameId) => {
            const normalizedGameId = normalizeGameId(gameId);
            if (!normalizedGameId) return;

            socket.join(`game:${normalizedGameId}`);

            // Send current game state to newly joined client
            const state = gameStates.get(normalizedGameId);
            if (state) {
                if (state.diceData) socket.emit('diceSelected', state.diceData);
                if (state.turnData) socket.emit('turnChanged', state.turnData);
            }
        });

        // Client leaves a game room
        socket.on('leaveGame', (gameId) => {
            const normalizedGameId = normalizeGameId(gameId);
            if (!normalizedGameId) return;

            socket.leave(`game:${normalizedGameId}`);
        });

        // GameMaster/Admin broadcasts dice selection to spectators
        socket.on('diceSelected', (data) => {
            if (!canWriteLiveState(socket)) return;
            if (!data || typeof data !== 'object') return;

            const normalizedGameId = normalizeGameId(data.gameId);
            if (!normalizedGameId) return;

            const dice = Array.isArray(data.dice) ? data.dice : [];
            if (dice.length > 5 || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) return;

            let currentPlayerId = null;
            if (data.currentPlayerId !== null && data.currentPlayerId !== undefined) {
                currentPlayerId = toPositiveInt(data.currentPlayerId);
                if (!currentPlayerId) return;
            }

            const payload = {
                gameId: Number.parseInt(normalizedGameId, 10),
                dice,
                currentPlayerId
            };

            updateGameState(normalizedGameId, { diceData: payload });
            socket.to(`game:${normalizedGameId}`).emit('diceSelected', payload);
        });

        // GameMaster/Admin broadcasts current turn to spectators
        socket.on('turnChanged', (data) => {
            if (!canWriteLiveState(socket)) return;
            if (!data || typeof data !== 'object') return;

            const normalizedGameId = normalizeGameId(data.gameId);
            if (!normalizedGameId) return;

            let currentPlayerId = null;
            if (data.currentPlayerId !== null && data.currentPlayerId !== undefined) {
                currentPlayerId = toPositiveInt(data.currentPlayerId);
                if (!currentPlayerId) return;
            }

            const payload = {
                gameId: Number.parseInt(normalizedGameId, 10),
                currentPlayerId
            };

            updateGameState(normalizedGameId, { turnData: payload });
            socket.to(`game:${normalizedGameId}`).emit('turnChanged', payload);
        });

        // Multiplayer: Client joins a multiplayer room (requires authentication + membership)
        socket.on('mp:joinRoom', async (roomCode) => {
            if (!socket.data?.userId) return;

            const code = normalizeRoomCode(roomCode);
            if (!code) return;

            const membership = await MultiplayerPlayer.findOne({
                where: { userId: socket.data.userId },
                include: [{
                    model: MultiplayerRoom,
                    as: 'room',
                    required: true,
                    where: { code }
                }]
            });

            if (!membership) return;
            socket.join(`mp:${code}`);
        });

        // Multiplayer: Client leaves a multiplayer room
        socket.on('mp:leaveRoom', (roomCode) => {
            const code = normalizeRoomCode(roomCode);
            if (!code) return;
            socket.leave(`mp:${code}`);
        });

        socket.on('disconnect', () => {
            if (tokenExpiryTimer) {
                clearTimeout(tokenExpiryTimer);
                tokenExpiryTimer = null;
            }
        });
    });
}

module.exports = { setupGameSocket, gameStates, clearGameState };
