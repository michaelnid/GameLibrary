const express = require('express');
const crypto = require('crypto');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const TOKEN_TTL_MS = 30000; // 30 seconds

function isLoopbackAddress(value) {
    if (!value) return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1') {
        return true;
    }
    if (normalized.startsWith('::ffff:')) {
        return normalized.slice(7) === '127.0.0.1';
    }
    return false;
}

// In-memory token store (no filesystem permissions needed)
const pmaTokens = new Map();

// GET /api/admin/pma-validate?token=xxx
// Internal endpoint called by PHP signon script (localhost only)
// This route MUST be before the auth middleware
router.get('/pma-validate', (req, res) => {
    // Use the direct socket address to avoid trust-proxy/X-Forwarded-For spoofing.
    const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
    const isLocal = isLoopbackAddress(remoteAddress);
    if (!isLocal) {
        return res.status(403).json({ error: 'Nur lokal erlaubt' });
    }

    const token = req.query.token;
    if (!token) {
        return res.status(400).json({ error: 'Token fehlt' });
    }

    const data = pmaTokens.get(token);
    if (!data) {
        return res.status(404).json({ error: 'Token nicht gefunden' });
    }

    // Delete immediately (one-time use)
    pmaTokens.delete(token);

    if (Date.now() > data.expires) {
        return res.status(410).json({ error: 'Token abgelaufen' });
    }

    res.json({ user: data.user, password: data.password });
});

// All routes below require admin authentication
router.use(authenticate, requireRole('admin'));

// POST /api/admin/phpmyadmin-token
// Generates a one-time signon token for phpMyAdmin auto-login
router.post('/phpmyadmin-token', (req, res) => {
    try {
        const pmaUser = process.env.PHPMYADMIN_USER;
        const pmaPass = process.env.PHPMYADMIN_PASS;

        if (!pmaUser || !pmaPass) {
            return res.status(500).json({ error: 'phpMyAdmin-Zugangsdaten nicht konfiguriert' });
        }

        // Clean up expired tokens
        const now = Date.now();
        for (const [key, data] of pmaTokens) {
            if (now > data.expires) {
                pmaTokens.delete(key);
            }
        }

        // Generate one-time token
        const token = crypto.randomUUID();
        pmaTokens.set(token, {
            user: pmaUser,
            password: pmaPass,
            expires: now + TOKEN_TTL_MS
        });

        // Auto-cleanup after TTL
        setTimeout(() => pmaTokens.delete(token), TOKEN_TTL_MS + 1000);

        res.json({ token, url: `/phpmyadmin/signon.php?token=${token}` });
    } catch (err) {
        console.error('phpMyAdmin token error:', err);
        res.status(500).json({ error: 'Token konnte nicht erstellt werden' });
    }
});

module.exports = router;
