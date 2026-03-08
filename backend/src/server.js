require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');

const sequelize = require('./config/database');
const { User, Game } = require('./models');
const { setupGameSocket } = require('./socket/gameSocket');
const { rebuildProfileStatsFromCompletedGames } = require('./services/profileStats');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const gameRoutes = require('./routes/games');
const scoreRoutes = require('./routes/scores');
const highscoreRoutes = require('./routes/highscores');
const backupRoutes = require('./routes/backup');

const gameTypeRoutes = require('./routes/gameTypes');
const updateRoutes = require('./routes/updates');
const serverStatusRoutes = require('./routes/serverStatus');
const multiplayerRoutes = require('./routes/multiplayer');
const adminRoutes = require('./routes/admin');

const isProduction = process.env.NODE_ENV === 'production';

function parseOrigins(rawOrigins) {
    if (!rawOrigins || typeof rawOrigins !== 'string') return [];
    return rawOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
            try {
                return new URL(origin).origin.toLowerCase();
            } catch (err) {
                return origin.toLowerCase();
            }
        });
}

function validateStartupConfig() {
    const requiredEnv = ['DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET', 'ENCRYPTION_KEY'];
    const missing = requiredEnv.filter((key) => !process.env[key] || !process.env[key].trim());
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (isProduction) {
        if (process.env.JWT_SECRET.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters in production');
        }
        if (process.env.ENCRYPTION_KEY.length < 32) {
            throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');
        }
        if (process.env.JWT_SECRET === 'CHANGE_ME' || process.env.ENCRYPTION_KEY === 'CHANGE_ME') {
            throw new Error('JWT_SECRET and ENCRYPTION_KEY must not use placeholder values');
        }

        if (process.env.REFRESH_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET.length < 32) {
            throw new Error('REFRESH_TOKEN_SECRET must be at least 32 characters in production');
        }

        const cookieSameSite = String(process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
        if (cookieSameSite === 'none') {
            throw new Error('COOKIE_SAMESITE=none is not allowed in production for this setup');
        }

        if (!process.env.CORS_ORIGIN || !process.env.CORS_ORIGIN.trim()) {
            console.warn('WARNING: CORS_ORIGIN is not set in production. All same-host origins will be accepted.');
        }
    }
}

function normalizeHost(hostHeader) {
    if (!hostHeader) return null;
    return String(hostHeader).toLowerCase().trim();
}

function normalizeOrigin(originHeader) {
    if (!originHeader || typeof originHeader !== 'string') return null;
    try {
        return new URL(originHeader).origin.toLowerCase();
    } catch (err) {
        return null;
    }
}

function isOriginAllowed(requestOrigin, requestHost, allowedOrigins) {
    if (!requestOrigin) return true;
    if (!isProduction) return true;
    if (allowedOrigins.includes(requestOrigin)) return true;

    if (!requestHost) return false;

    try {
        const originUrl = new URL(requestOrigin);
        return originUrl.host.toLowerCase() === requestHost;
    } catch (err) {
        return false;
    }
}

function corsOptionsDelegate(req, callback) {
    const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
    const requestOrigin = normalizeOrigin(req.headers.origin);
    const requestHost = normalizeHost(req.headers.host);
    const allowOrigin = isOriginAllowed(requestOrigin, requestHost, allowedOrigins);

    callback(null, {
        origin: allowOrigin,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        credentials: true
    });
}

validateStartupConfig();

const app = express();
const server = http.createServer(app);

if (isProduction) {
    app.set('trust proxy', process.env.TRUST_PROXY || 1);
} else if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
}

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Keep connections alive on mobile (iPad Safari suspends tabs)
    pingInterval: 10000,   // Ping every 10s (default 25s)
    pingTimeout: 5000,     // 5s to respond (default 20s)
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    allowRequest: (req, callback) => {
        const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
        const requestOrigin = normalizeOrigin(req.headers.origin);
        const requestHost = normalizeHost(req.headers.host);
        const allowed = isOriginAllowed(requestOrigin, requestHost, allowedOrigins);
        callback(null, allowed);
    }
});

app.set('io', io);
setupGameSocket(io);

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    }
}));
app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '1mb' }));

const rateLimitWindowMs = (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000;
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX, 10) || (isProduction ? 5000 : 50000);

const ACCESS_COOKIE = process.env.ACCESS_COOKIE_NAME || 'gl_access_token';
const { readCookie } = require('./utils/cookies');
const jwt = require('jsonwebtoken');

function rateLimitKeyGenerator(req) {
    // Try to identify user from JWT cookie for per-user limiting
    try {
        const token = readCookie(req, ACCESS_COOKIE);
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
            if (decoded && decoded.userId) {
                return `user_${decoded.userId}`;
            }
        }
    } catch (_) { /* fall through to IP */ }
    return req.ip;
}

const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
    message: { error: 'Zu viele Anfragen, bitte später erneut versuchen' }
});
app.use('/api', limiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api', scoreRoutes);
app.use('/api/highscores', highscoreRoutes);
app.use('/api/backup', backupRoutes);

app.use('/api/game-types', gameTypeRoutes);
app.use('/api/admin/update', updateRoutes);
app.use('/api/admin/server-status', serverStatusRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/multiplayer', multiplayerRoutes);

// Serve uploaded files (avatars)
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
app.use('/uploads', express.static(uploadsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
});

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established.');

        // alter:true only in dev - in production it creates duplicate indexes on every restart (MariaDB bug)
        const syncOptions = process.env.NODE_ENV === 'development' ? { alter: true } : {};
        await sequelize.sync(syncOptions);
        console.log('Database synchronized.');

        // One-time migration: move PlayerProfile data into User table
        try {
            const [tables] = await sequelize.query("SHOW TABLES LIKE 'player_profiles'");
            if (tables.length > 0) {
                console.log('Migrating player_profiles to users table...');
                const [profiles] = await sequelize.query('SELECT * FROM player_profiles');
                const { encrypt } = require('./config/encryption');
                let migrated = 0;
                const idMap = new Map(); // old profile ID → new user ID

                for (const profile of profiles) {
                    // Check if a user with the same displayName already exists
                    const existingUsers = await User.findAll();
                    const duplicate = existingUsers.find(u => u.displayName === (typeof profile.name === 'string' && profile.name.startsWith('{') ? JSON.parse(profile.name)?.ct ? require('./config/encryption').decrypt(profile.name) : profile.name : profile.name));

                    if (duplicate) {
                        // Update stats on existing user
                        idMap.set(profile.id, duplicate.id);
                        continue;
                    }

                    const newUser = await User.create({
                        displayName: profile.name.startsWith('{') ? require('./config/encryption').decrypt(profile.name) : profile.name,
                        role: 'player',
                        avatar: profile.avatar,
                        totalGames: profile.totalGames || 0,
                        totalScore: profile.totalScore || 0,
                        highestSingleGame: profile.highestSingleGame || 0,
                        statsByGameType: typeof profile.statsByGameType === 'string' ? JSON.parse(profile.statsByGameType) : (profile.statsByGameType || {})
                    });
                    idMap.set(profile.id, newUser.id);
                    migrated++;
                }

                // Remap Player.profileId from old profile IDs to new user IDs
                for (const [oldId, newId] of idMap.entries()) {
                    await sequelize.query(
                        'UPDATE players SET profileId = ? WHERE profileId = ?',
                        { replacements: [newId, oldId] }
                    );
                }

                // Rename old table so migration doesn't run again
                await sequelize.query('RENAME TABLE player_profiles TO _player_profiles_migrated');
                console.log(`Migration complete: ${migrated} profiles migrated, ${idMap.size} profile IDs remapped.`);
            }
        } catch (migrationErr) {
            console.error('PlayerProfile migration warning:', migrationErr.message);
        }

        // Backfill usernameHash for existing users (M3 security fix)
        await User.backfillUsernameHashes();

        // Backfill gameNumber for existing games
        const gamesWithoutNumber = await Game.findAll({
            where: { gameNumber: null },
            order: [['id', 'ASC']]
        });
        if (gamesWithoutNumber.length > 0) {
            const maxNum = await Game.max('gameNumber') || 0;
            for (let i = 0; i < gamesWithoutNumber.length; i++) {
                gamesWithoutNumber[i].gameNumber = maxNum + i + 1;
                await gamesWithoutNumber[i].save();
            }
            console.log(`Backfilled gameNumber for ${gamesWithoutNumber.length} games.`);
        }

        const gamesWithoutType = await Game.findAll({
            where: { gameType: null },
            order: [['id', 'ASC']]
        });
        if (gamesWithoutType.length > 0) {
            for (const game of gamesWithoutType) {
                game.gameType = 'kniffel';
                await game.save();
            }
            console.log(`Backfilled gameType for ${gamesWithoutType.length} games.`);
        }

        const statsResult = await rebuildProfileStatsFromCompletedGames();
        console.log(`Rebuilt profile stats for ${statsResult.profiles} profiles from ${statsResult.completedGames} completed games.`);

        // Create default admin if no users exist
        const userCount = await User.count();
        if (userCount === 0) {
            let defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
            if (!defaultPassword || defaultPassword.length < 12) {
                if (isProduction) {
                    throw new Error('ADMIN_DEFAULT_PASSWORD must be set (min. 12 characters) for first startup in production');
                }
                defaultPassword = 'admin';
                console.warn('ADMIN_DEFAULT_PASSWORD missing: using insecure development fallback password');
            }
            const passwordHash = await bcrypt.hash(defaultPassword, 12);
            await User.create({
                username: 'admin',
                displayName: 'Administrator',
                passwordHash,
                role: 'admin'
            });
            console.log('Default admin user created (username: admin)');
            if (!isProduction) {
                console.warn(`Development admin password: ${defaultPassword}`);
            }
        }

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
