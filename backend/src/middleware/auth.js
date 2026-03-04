const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { readCookie } = require('../utils/cookies');

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'gl_access_token';

function readBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
}

async function authenticate(req, res, next) {
    const token = readBearerToken(req) || readCookie(req, ACCESS_COOKIE_NAME);
    if (!token) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: 'Server-Konfigurationsfehler' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.tokenType && decoded.tokenType !== 'access') {
            return res.status(401).json({ error: 'Ungültiger Token' });
        }
        const user = await User.findByPk(decoded.userId, { attributes: ['id', 'role'] });
        if (!user) {
            return res.status(401).json({ error: 'Ungültiger Token' });
        }

        req.userId = user.id;
        req.userRole = user.role;
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Ungültiger Token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.userRole)) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }
        next();
    };
}

module.exports = { authenticate, requireRole };
