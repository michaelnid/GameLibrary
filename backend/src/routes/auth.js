const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { readCookie } = require('../utils/cookies');

const router = express.Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-placeholder', 12);
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'gl_access_token';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'gl_refresh_token';
const isProduction = process.env.NODE_ENV === 'production';

function auditLog(action, req, details = {}) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    console.log(`[AUDIT] ${action} | ip=${ip} ${Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
}

const ACCESS_TOKEN_TTL_MINUTES = parsePositiveInt(process.env.ACCESS_TOKEN_TTL_MINUTES, 15);
const REFRESH_TOKEN_TTL_DAYS = parsePositiveInt(process.env.REFRESH_TOKEN_TTL_DAYS, 7);
const ACCESS_TOKEN_MAX_AGE_MS = ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function resolveSameSite() {
    const raw = String(process.env.COOKIE_SAMESITE || (isProduction ? 'strict' : 'lax')).toLowerCase();
    if (['lax', 'strict', 'none'].includes(raw)) return raw;
    return isProduction ? 'strict' : 'lax';
}

function cookieBaseOptions() {
    const rawSecure = String(process.env.COOKIE_SECURE || '').toLowerCase();
    const secureCookie = ['1', 'true', 'yes'].includes(rawSecure)
        ? true
        : ['0', 'false', 'no'].includes(rawSecure)
            ? false
            : isProduction;

    const options = {
        httpOnly: true,
        secure: secureCookie,
        sameSite: resolveSameSite()
    };

    const configuredDomain = process.env.COOKIE_DOMAIN;
    if (configuredDomain && configuredDomain.trim()) {
        options.domain = configuredDomain.trim();
    }

    return options;
}

function accessCookieOptions() {
    return {
        ...cookieBaseOptions(),
        path: '/',
        maxAge: ACCESS_TOKEN_MAX_AGE_MS
    };
}

function refreshCookieOptions() {
    return {
        ...cookieBaseOptions(),
        path: '/api/auth',
        maxAge: REFRESH_TOKEN_MAX_AGE_MS
    };
}

function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE_NAME, {
        ...cookieBaseOptions(),
        path: '/'
    });
    res.clearCookie(REFRESH_COOKIE_NAME, {
        ...cookieBaseOptions(),
        path: '/api/auth'
    });
}

function tokenConfig() {
    if (!process.env.JWT_SECRET) {
        throw new Error('Server-Konfigurationsfehler');
    }

    const refreshSecret = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
    return {
        accessSecret: process.env.JWT_SECRET,
        refreshSecret
    };
}

function buildAuthPayload(user) {
    return {
        userId: user.id,
        role: user.role
    };
}

function setSessionCookies(res, user) {
    const payload = buildAuthPayload(user);
    const { accessSecret, refreshSecret } = tokenConfig();

    const accessToken = jwt.sign(
        { ...payload, tokenType: 'access' },
        accessSecret,
        { expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`, algorithm: 'HS256' }
    );

    const refreshToken = jwt.sign(
        { ...payload, tokenType: 'refresh' },
        refreshSecret,
        { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`, algorithm: 'HS256' }
    );

    res.cookie(ACCESS_COOKIE_NAME, accessToken, accessCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function readRefreshToken(req) {
    return readCookie(req, REFRESH_COOKIE_NAME);
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Login-Versuche. Bitte später erneut probieren.' }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!username || !password || username.length > 128 || password.length > 256) {
            return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
        }

        const user = await User.findByUsername(username);
        if (!user) {
            await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
            auditLog('LOGIN_FAILED', req, { username, reason: 'user_not_found' });
            return res.status(401).json({ error: 'Falsche Anmeldedaten' });
        }

        const isValid = user.getDataValue('passwordHash')
            ? await bcrypt.compare(password, user.passwordHash)
            : false;
        if (!isValid) {
            auditLog('LOGIN_FAILED', req, { username, reason: 'invalid_password' });
            return res.status(401).json({ error: 'Falsche Anmeldedaten' });
        }

        setSessionCookies(res, user);
        res.set('Cache-Control', 'no-store');
        auditLog('LOGIN_SUCCESS', req, { userId: user.id, username });

        res.json({
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = readRefreshToken(req);
        if (!refreshToken) {
            clearAuthCookies(res);
            return res.status(401).json({ error: 'Keine aktive Sitzung' });
        }

        const { refreshSecret } = tokenConfig();
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, refreshSecret, { algorithms: ['HS256'] });
        } catch (err) {
            clearAuthCookies(res);
            return res.status(401).json({ error: 'Sitzung abgelaufen' });
        }

        if (decoded.tokenType !== 'refresh' || !decoded.userId) {
            clearAuthCookies(res);
            return res.status(401).json({ error: 'Ungültige Sitzung' });
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            clearAuthCookies(res);
            return res.status(401).json({ error: 'Ungültige Sitzung' });
        }

        setSessionCookies(res, user);
        res.set('Cache-Control', 'no-store');

        return res.json({
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Refresh session error:', err);
        clearAuthCookies(res);
        return res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    clearAuthCookies(res);
    res.status(204).end();
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findByPk(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        res.set('Cache-Control', 'no-store');
        res.json({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role
        });
    } catch (err) {
        console.error('Auth me error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
