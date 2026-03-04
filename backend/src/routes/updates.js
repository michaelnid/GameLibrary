const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const {
    getCurrentVersion,
    compareVersions,
    fetchLatestManifest,
    readUpdateState,
    readUpdateLogTail,
    startUpdateProcess,
    isProcessAlive
} = require('../services/updateService');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

function toIsoDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function minutesBetween(fromIso, toIso = new Date().toISOString()) {
    const from = new Date(fromIso).getTime();
    const to = new Date(toIso).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return (to - from) / 60000;
}

function resolveUpdateState(rawState, currentVersion, latestVersion) {
    const base = rawState || {};
    const state = {
        status: typeof base.status === 'string' ? base.status : 'idle',
        message: typeof base.message === 'string' ? base.message : 'Kein Update aktiv',
        version: base.version || null,
        pid: Number.isInteger(Number.parseInt(base.pid, 10)) ? Number.parseInt(base.pid, 10) : null,
        startedAt: toIsoDate(base.startedAt),
        finishedAt: toIsoDate(base.finishedAt)
    };

    const compareLatestToCurrent = latestVersion
        ? compareVersions(latestVersion, currentVersion)
        : 0;

    const hasActiveUpdaterProcess = state.status === 'running' && state.pid && isProcessAlive(state.pid);

    // If installed version already matches/exceeds latest, treat stale "running" as completed.
    if (state.status === 'running' && compareLatestToCurrent <= 0) {
        state.status = 'success';
        state.message = 'Update erfolgreich abgeschlossen';
        state.version = latestVersion || currentVersion;
        if (!state.finishedAt) {
            state.finishedAt = new Date().toISOString();
        }
    }

    // If process is gone but state is still running and we still have a newer version,
    // treat this as "no active update" (idle), not as a user-facing failure.
    if (state.status === 'running' && !hasActiveUpdaterProcess) {
        state.status = 'idle';
        state.message = 'Kein Update aktiv';
        state.version = null;
        state.startedAt = null;
        state.finishedAt = null;
    }

    // Safety net for stuck "running" states with no version change.
    if (state.status === 'running' && state.startedAt && hasActiveUpdaterProcess) {
        const runningMinutes = minutesBetween(state.startedAt);
        if (runningMinutes !== null && runningMinutes > 30) {
            state.status = 'failed';
            state.message = 'Update hängt seit über 30 Minuten. Bitte Logs prüfen.';
            if (!state.finishedAt) {
                state.finishedAt = new Date().toISOString();
            }
        }
    }

    return state;
}

router.get('/status', async (req, res) => {
    const currentVersion = getCurrentVersion();
    const rawUpdateState = readUpdateState();
    const logTail = readUpdateLogTail(120);

    try {
        const latest = await fetchLatestManifest();
        const updateAvailable = compareVersions(latest.version, currentVersion) > 0;
        const updateState = resolveUpdateState(rawUpdateState, currentVersion, latest.version);

        return res.json({
            currentVersion,
            latestVersion: latest.version,
            updateAvailable,
            manifest: latest,
            updateState,
            logTail
        });
    } catch (err) {
        return res.json({
            currentVersion,
            latestVersion: null,
            updateAvailable: false,
            manifest: null,
            manifestError: err.message,
            updateState: resolveUpdateState(rawUpdateState, currentVersion, null),
            logTail
        });
    }
});

router.post('/start', async (req, res) => {
    try {
        const currentVersion = getCurrentVersion();
        const latest = await fetchLatestManifest();
        const resolvedState = resolveUpdateState(readUpdateState(), currentVersion, latest.version);

        if (compareVersions(latest.version, currentVersion) <= 0) {
            return res.status(400).json({ error: 'Keine neuere Version verfügbar' });
        }

        if (resolvedState?.status === 'running') {
            return res.status(409).json({ error: 'Ein Update läuft bereits' });
        }

        const processInfo = startUpdateProcess();

        return res.status(202).json({
            message: `Update auf Version ${latest.version} gestartet`,
            pid: processInfo.pid,
            targetVersion: latest.version
        });
    } catch (err) {
        console.error('Start update error:', err);
        return res.status(500).json({ error: err.message || 'Update konnte nicht gestartet werden' });
    }
});

module.exports = router;
