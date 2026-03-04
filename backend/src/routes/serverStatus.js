const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile, spawn } = require('child_process');
const sequelize = require('../config/database');
const { User, Game } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');

const execFileAsync = promisify(execFile);
const router = express.Router();

const REBOOT_ENABLED = String(process.env.SERVER_REBOOT_ENABLED || 'false').toLowerCase() === 'true';
const REBOOT_COMMAND = String(process.env.SERVER_REBOOT_COMMAND || 'sudo').trim();
const REBOOT_ARGS = (process.env.SERVER_REBOOT_ARGS || '/sbin/reboot')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
const HISTORY_MAX_POINTS = Math.max(30, Number.parseInt(process.env.SERVER_STATUS_HISTORY_POINTS || '180', 10));

router.use(authenticate, requireRole('admin'));
const metricHistory = [];
let previousDiskSnapshot = null;

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function bytesToGiB(bytes) {
    return Number((bytes / (1024 ** 3)).toFixed(2));
}

function secondsToHuman(secondsRaw) {
    const seconds = Math.max(0, Math.floor(toNumber(secondsRaw, 0)));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

async function getDiskUsage() {
    try {
        const { stdout } = await execFileAsync('df', ['-kP', '/']);
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return null;

        const parts = lines[1].trim().split(/\s+/);
        if (parts.length < 6) return null;

        const totalKb = toNumber(parts[1]);
        const usedKb = toNumber(parts[2]);
        const availableKb = toNumber(parts[3]);
        const percentRaw = String(parts[4] || '').replace('%', '');

        return {
            filesystem: parts[0],
            mount: parts[5],
            totalBytes: totalKb * 1024,
            usedBytes: usedKb * 1024,
            availableBytes: availableKb * 1024,
            usedPercent: toNumber(percentRaw)
        };
    } catch (err) {
        return null;
    }
}

function readCpuTimes() {
    return os.cpus().map((cpu) => cpu.times);
}

function aggregateCpuDiff(before, after) {
    let idle = 0;
    let total = 0;

    for (let i = 0; i < before.length; i += 1) {
        const b = before[i];
        const a = after[i];
        const idleDiff = a.idle - b.idle;
        const totalDiff = (a.user - b.user)
            + (a.nice - b.nice)
            + (a.sys - b.sys)
            + (a.idle - b.idle)
            + (a.irq - b.irq);
        idle += idleDiff;
        total += totalDiff;
    }

    if (total <= 0) return 0;
    return Number((((total - idle) / total) * 100).toFixed(1));
}

async function sampleCpuUsage() {
    const before = readCpuTimes();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const after = readCpuTimes();
    return aggregateCpuDiff(before, after);
}

async function getDbSizeBytes() {
    const dbName = process.env.DB_NAME;
    if (!dbName) return null;

    try {
        const [rows] = await sequelize.query(
            `SELECT COALESCE(SUM(data_length + index_length), 0) AS sizeBytes
             FROM information_schema.tables
             WHERE table_schema = ?`,
            { replacements: [dbName] }
        );

        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        return row ? toNumber(row.sizeBytes, 0) : 0;
    } catch (err) {
        try {
            const [rows] = await sequelize.query('SHOW TABLE STATUS');
            if (!Array.isArray(rows)) return null;

            return rows.reduce((sum, tableRow) => {
                const dataLen = toNumber(tableRow.Data_length, 0);
                const indexLen = toNumber(tableRow.Index_length, 0);
                return sum + dataLen + indexLen;
            }, 0);
        } catch (fallbackErr) {
            return null;
        }
    }
}

async function getCpuTemperatureC() {
    try {
        const thermalBase = '/sys/class/thermal';
        const entries = await fs.promises.readdir(thermalBase, { withFileTypes: true });
        const zones = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('thermal_zone'));
        if (zones.length === 0) return null;

        let best = null;
        for (const zone of zones) {
            const zonePath = path.join(thermalBase, zone.name);
            const tempPath = path.join(zonePath, 'temp');
            const typePath = path.join(zonePath, 'type');

            let rawTemp;
            try {
                rawTemp = await fs.promises.readFile(tempPath, 'utf8');
            } catch (err) {
                continue;
            }

            const milliC = toNumber(String(rawTemp).trim(), NaN);
            if (!Number.isFinite(milliC) || milliC <= 0) continue;

            const tempC = milliC / 1000;
            let sensorType = '';
            try {
                sensorType = String(await fs.promises.readFile(typePath, 'utf8')).trim().toLowerCase();
            } catch (err) {
                sensorType = '';
            }

            const score = sensorType.includes('cpu') || sensorType.includes('x86_pkg') || sensorType.includes('coretemp') ? 2 : 1;
            if (!best || score > best.score || (score === best.score && tempC > best.tempC)) {
                best = { tempC, score };
            }
        }

        return best ? Number(best.tempC.toFixed(1)) : null;
    } catch (err) {
        return null;
    }
}

function parseRootDeviceName(dfInfo) {
    const filesystem = String(dfInfo?.filesystem || '').trim();
    if (!filesystem.startsWith('/dev/')) return null;
    const name = filesystem.replace('/dev/', '');

    if (/^nvme\d+n\d+p\d+$/.test(name)) return name.replace(/p\d+$/, '');
    if (/^mmcblk\d+p\d+$/.test(name)) return name.replace(/p\d+$/, '');
    return name.replace(/\d+$/, '');
}

async function getDiskIoSnapshot(dfInfo) {
    try {
        const rootDevice = parseRootDeviceName(dfInfo);
        if (!rootDevice) return null;

        const content = await fs.promises.readFile('/proc/diskstats', 'utf8');
        const lines = content.trim().split('\n');
        const row = lines.find((line) => {
            const parts = line.trim().split(/\s+/);
            return parts[2] === rootDevice;
        });
        if (!row) return null;

        const parts = row.trim().split(/\s+/);
        const sectorsRead = toNumber(parts[5], 0);
        const sectorsWritten = toNumber(parts[9], 0);
        const bytesRead = sectorsRead * 512;
        const bytesWritten = sectorsWritten * 512;
        const nowMs = Date.now();

        let readBytesPerSec = null;
        let writeBytesPerSec = null;
        if (previousDiskSnapshot && previousDiskSnapshot.device === rootDevice) {
            const dt = (nowMs - previousDiskSnapshot.timestampMs) / 1000;
            if (dt > 0.1) {
                readBytesPerSec = Math.max(0, (bytesRead - previousDiskSnapshot.bytesRead) / dt);
                writeBytesPerSec = Math.max(0, (bytesWritten - previousDiskSnapshot.bytesWritten) / dt);
            }
        }

        previousDiskSnapshot = {
            device: rootDevice,
            timestampMs: nowMs,
            bytesRead,
            bytesWritten
        };

        return {
            device: rootDevice,
            readBytesTotal: bytesRead,
            writeBytesTotal: bytesWritten,
            readBytesPerSec: readBytesPerSec === null ? null : Number(readBytesPerSec.toFixed(0)),
            writeBytesPerSec: writeBytesPerSec === null ? null : Number(writeBytesPerSec.toFixed(0))
        };
    } catch (err) {
        return null;
    }
}

function pushHistoryPoint(point) {
    metricHistory.push(point);
    if (metricHistory.length > HISTORY_MAX_POINTS) {
        metricHistory.splice(0, metricHistory.length - HISTORY_MAX_POINTS);
    }
}

async function runHealthChecks({ dbReachable, dbErrorMessage } = {}) {
    const checks = [];

    const apiStart = Date.now();
    checks.push({
        id: 'api',
        label: 'API',
        status: 'ok',
        message: 'HTTP-Server aktiv',
        latencyMs: Date.now() - apiStart
    });

    const dbStart = Date.now();
    if (dbReachable) {
        checks.push({
            id: 'db',
            label: 'Datenbank',
            status: 'ok',
            message: 'Datenbank erreichbar',
            latencyMs: Date.now() - dbStart
        });
    } else {
        checks.push({
            id: 'db',
            label: 'Datenbank',
            status: 'error',
            message: dbErrorMessage || 'Datenbank nicht erreichbar',
            latencyMs: Date.now() - dbStart
        });
    }

    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
    const fsStart = Date.now();
    try {
        await fs.promises.access(uploadsDir, fs.constants.R_OK | fs.constants.W_OK);
        checks.push({
            id: 'storage',
            label: 'Uploads-Verzeichnis',
            status: 'ok',
            message: 'Lesen/Schreiben möglich',
            latencyMs: Date.now() - fsStart
        });
    } catch (err) {
        checks.push({
            id: 'storage',
            label: 'Uploads-Verzeichnis',
            status: 'warning',
            message: 'Verzeichnis fehlt oder Rechte unvollständig',
            latencyMs: Date.now() - fsStart
        });
    }

    const overall = checks.some((check) => check.status === 'error')
        ? 'error'
        : checks.some((check) => check.status === 'warning')
            ? 'warning'
            : 'ok';

    return { overall, checks };
}

router.get('/', async (req, res) => {
    try {
        const [disk, cpuUsagePercent, dbSizeBytes, cpuTempC] = await Promise.all([
            getDiskUsage(),
            sampleCpuUsage(),
            getDbSizeBytes(),
            getCpuTemperatureC()
        ]);
        const io = await getDiskIoSnapshot(disk);

        let usersCount = 0;
        let gamesCount = 0;
        let dbReachable = true;
        let dbErrorMessage = null;

        try {
            [usersCount, gamesCount] = await Promise.all([
                User.count(),
                Game.count()
            ]);
        } catch (dbErr) {
            dbReachable = false;
            dbErrorMessage = dbErr?.message || null;
        }

        const health = await runHealthChecks({ dbReachable, dbErrorMessage });

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const timestamp = new Date().toISOString();

        pushHistoryPoint({
            timestamp,
            cpuPercent: Number(cpuUsagePercent),
            ramPercent: Number(((usedMem / totalMem) * 100).toFixed(1)),
            diskPercent: Number(disk?.usedPercent || 0),
            tempC: cpuTempC,
            ioReadBytesPerSec: io?.readBytesPerSec ?? null,
            ioWriteBytesPerSec: io?.writeBytesPerSec ?? null,
            dbSizeBytes: dbSizeBytes ?? null
        });

        res.json({
            timestamp,
            host: os.hostname(),
            platform: `${os.platform()} ${os.release()}`,
            uptimeSeconds: os.uptime(),
            uptimeHuman: secondsToHuman(os.uptime()),
            cpu: {
                model: os.cpus()?.[0]?.model || 'Unbekannt',
                cores: os.cpus()?.length || 0,
                usagePercent: cpuUsagePercent,
                loadAverage: os.loadavg().map((value) => Number(value.toFixed(2)))
            },
            memory: {
                totalBytes: totalMem,
                usedBytes: usedMem,
                freeBytes: freeMem,
                usedPercent: Number(((usedMem / totalMem) * 100).toFixed(1)),
                totalGiB: bytesToGiB(totalMem),
                usedGiB: bytesToGiB(usedMem),
                freeGiB: bytesToGiB(freeMem)
            },
            disk: disk ? {
                ...disk,
                totalGiB: bytesToGiB(disk.totalBytes),
                usedGiB: bytesToGiB(disk.usedBytes),
                availableGiB: bytesToGiB(disk.availableBytes)
            } : null,
            database: {
                sizeBytes: dbSizeBytes,
                sizeGiB: dbSizeBytes === null ? null : bytesToGiB(dbSizeBytes),
                usersCount,
                gamesCount
            },
            temperature: {
                cpuC: cpuTempC
            },
            io: io ? {
                ...io,
                readMiBPerSec: io.readBytesPerSec === null ? null : Number((io.readBytesPerSec / (1024 ** 2)).toFixed(2)),
                writeMiBPerSec: io.writeBytesPerSec === null ? null : Number((io.writeBytesPerSec / (1024 ** 2)).toFixed(2))
            } : null,
            history: metricHistory,
            health,
            reboot: {
                enabled: REBOOT_ENABLED
            }
        });
    } catch (err) {
        console.error('Server status error:', err);
        res.status(500).json({ error: 'Server-Status konnte nicht geladen werden' });
    }
});

router.post('/reboot', async (req, res) => {
    if (!REBOOT_ENABLED) {
        return res.status(403).json({ error: 'Reboot ist deaktiviert' });
    }

    try {
        // Intentionally async fire-and-forget after response is sent.
        res.status(202).json({ message: 'Server-Neustart wird ausgeführt' });
        setTimeout(() => {
            const child = spawn(REBOOT_COMMAND, REBOOT_ARGS, {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        }, 250);
        return undefined;
    } catch (err) {
        console.error('Reboot error:', err);
        return res.status(500).json({ error: 'Reboot konnte nicht gestartet werden' });
    }
});

module.exports = router;
