const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const GITHUB_REPO = 'michaelnid/GameLibrary';
const DEFAULT_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/backend/package.json`;
const DEFAULT_ALLOWED_HOSTS = ['raw.githubusercontent.com', 'github.com', 'api.github.com', 'objects.githubusercontent.com'];
const DEFAULT_RUNNER_PATH = '/usr/local/bin/game-library-updater';
const DEFAULT_STATE_PATH = '/var/lib/game-library/update-state.json';
const DEFAULT_LOG_PATH = '/var/log/game-library-updater.log';

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseVersion(version) {
    const parts = String(version || '')
        .replace(/^v/i, '')
        .split('.')
        .map((part) => Number.parseInt(part, 10));

    if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
        return null;
    }

    while (parts.length < 3) {
        parts.push(0);
    }

    return parts.slice(0, 3);
}

function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) return 0;

    for (let i = 0; i < 3; i += 1) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }

    return 0;
}

function getCurrentVersion() {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return String(packageJson.version || '0.0.0');
}

function getVersionUrl() {
    return String(process.env.UPDATE_VERSION_URL || DEFAULT_VERSION_URL).trim();
}

function getAllowedHosts() {
    const raw = process.env.UPDATE_ALLOWED_HOSTS;
    if (!raw || !raw.trim()) return DEFAULT_ALLOWED_HOSTS;

    return raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

function ensureAllowedUrl(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
        throw new Error('URL muss HTTPS verwenden');
    }

    const allowedHosts = getAllowedHosts();
    if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
        throw new Error(`Host "${parsed.hostname}" ist nicht erlaubt`);
    }

    return parsed.toString();
}

async function fetchLatestManifest() {
    const versionUrl = ensureAllowedUrl(getVersionUrl());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(versionUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'GameLibrary-Updater',
                'Cache-Control': 'no-cache'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Versions-Check fehlgeschlagen (HTTP ${response.status})`);
        }

        const packageJson = await response.json();
        const version = String(packageJson.version || '').trim();
        if (!version) {
            throw new Error('Keine Version in package.json gefunden');
        }

        return {
            version,
            url: `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.tar.gz`,
            publishedAt: null,
            notes: null
        };
    } finally {
        clearTimeout(timeout);
    }
}

function readJsonFileSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return null;
    }
}

function readUpdateState() {
    const filePath = process.env.UPDATE_STATE_PATH || DEFAULT_STATE_PATH;
    return readJsonFileSafe(filePath);
}

function readUpdateLogTail(maxLines = 80) {
    const filePath = process.env.UPDATE_LOG_PATH || DEFAULT_LOG_PATH;
    try {
        if (!fs.existsSync(filePath)) return [];

        const content = fs.readFileSync(filePath, 'utf8');
        if (!content) return [];

        return content
            .split('\n')
            .filter(Boolean)
            .slice(-Math.max(1, maxLines));
    } catch (err) {
        return [];
    }
}

function getUpdateRunnerPath() {
    return String(process.env.UPDATE_RUNNER_PATH || DEFAULT_RUNNER_PATH).trim();
}

function startUpdateProcess() {
    const runnerPath = getUpdateRunnerPath();
    if (!runnerPath) {
        throw new Error('UPDATE_RUNNER_PATH ist nicht gesetzt');
    }

    const useSudo = parseBoolean(process.env.UPDATE_USE_SUDO, process.env.NODE_ENV === 'production');

    const command = useSudo ? 'sudo' : runnerPath;
    const args = useSudo ? [runnerPath] : [];

    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
    });

    child.unref();

    return {
        pid: child.pid,
        command,
        args
    };
}

function isProcessAlive(pidValue) {
    const pid = Number.parseInt(pidValue, 10);
    if (!Number.isInteger(pid) || pid <= 0) return false;

    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    getCurrentVersion,
    compareVersions,
    fetchLatestManifest,
    readUpdateState,
    readUpdateLogTail,
    startUpdateProcess,
    isProcessAlive
};
