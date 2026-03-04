import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import changelog from '../data/changelog';

const ADMIN_TABS = new Set(['users', 'games', 'backup', 'updates', 'changelog', 'serverStatus']);

function normalizeAdminTab(tab) {
    const value = String(tab || '').trim();
    return ADMIN_TABS.has(value) ? value : 'users';
}

export default function Admin() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() => normalizeAdminTab(searchParams.get('tab')));
    const toast = useToast();

    useEffect(() => {
        const requestedTab = normalizeAdminTab(searchParams.get('tab'));
        if (requestedTab !== activeTab) {
            setActiveTab(requestedTab);
        }
    }, [searchParams]);

    const switchTab = (nextTab) => {
        const safeTab = normalizeAdminTab(nextTab);
        setActiveTab(safeTab);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', safeTab);
        setSearchParams(nextParams, { replace: true });
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Administration</h1>
                    <p className="page-subtitle">Benutzer und System verwalten</p>
                </div>
            </div>

            <div className="admin-layout">
                <nav className="admin-sidebar">
                    <button
                        className={`admin-nav-item ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => switchTab('users')}
                    >
                        Benutzerverwaltung
                    </button>
                    <button
                        className={`admin-nav-item ${activeTab === 'games' ? 'active' : ''}`}
                        onClick={() => switchTab('games')}
                    >
                        Spiele verwalten
                    </button>

                    <button
                        className={`admin-nav-item ${activeTab === 'backup' ? 'active' : ''}`}
                        onClick={() => switchTab('backup')}
                    >
                        Backup / Restore
                    </button>
                    <button
                        className={`admin-nav-item ${activeTab === 'updates' ? 'active' : ''}`}
                        onClick={() => switchTab('updates')}
                    >
                        Updates
                    </button>
                    <button
                        className={`admin-nav-item ${activeTab === 'changelog' ? 'active' : ''}`}
                        onClick={() => switchTab('changelog')}
                    >
                        Changelog
                    </button>
                    <button
                        className="admin-nav-item"
                        onClick={async () => {
                            try {
                                const res = await api.post('/admin/phpmyadmin-token');
                                window.open(res.data.url, '_blank', 'noopener');
                            } catch (err) {
                                toast(err.response?.data?.error || 'phpMyAdmin Login fehlgeschlagen', 'error');
                            }
                        }}
                    >
                        phpMyAdmin
                    </button>
                    <button
                        className={`admin-nav-item ${activeTab === 'serverStatus' ? 'active' : ''}`}
                        onClick={() => switchTab('serverStatus')}
                    >
                        Server Status
                    </button>
                </nav>

                <div>
                    {activeTab === 'users' && <UserManagement toast={toast} />}
                    {activeTab === 'games' && <GameManagement toast={toast} />}

                    {activeTab === 'backup' && <BackupManagement toast={toast} />}
                    {activeTab === 'updates' && <UpdateManagement toast={toast} />}
                    {activeTab === 'changelog' && <ChangelogManagement />}
                    {activeTab === 'serverStatus' && <ServerStatusManagement toast={toast} />}
                </div>
            </div>
        </div>
    );
}

/* ---- Changelog ---- */
function ChangelogManagement() {
    return (
        <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Changelog</h2>

            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                {changelog.map((entry, index) => (
                    <article key={entry.version} className="card">
                        <div className="flex-between mb-sm" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>v{entry.version} · {entry.title}</h3>
                            <span className={`badge ${index === 0 ? 'badge-active' : 'badge-completed'}`}>
                                {entry.date}
                            </span>
                        </div>
                        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                            {entry.changes.map((change, changeIndex) => (
                                <li key={changeIndex} style={{ marginBottom: '6px' }}>{change}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </div>
    );
}

function toPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
}

function formatGiB(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)} GB`;
}

function usageTone(percent) {
    if (percent >= 90) return 'var(--color-danger)';
    if (percent >= 75) return 'var(--color-warning)';
    return 'var(--color-success)';
}

function formatMiBPerSec(value) {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)} MiB/s`;
}

function MiniTrendChart({ points = [], color = 'var(--color-primary)' }) {
    if (!Array.isArray(points) || points.length < 2) {
        return <div className="text-muted" style={{ fontSize: '0.8rem' }}>Zu wenig Verlaufspunkte</div>;
    }

    const sanitized = points.map((value) => (Number.isFinite(Number(value)) ? Number(value) : null));
    const valid = sanitized.filter((value) => value !== null);
    if (valid.length < 2) {
        return <div className="text-muted" style={{ fontSize: '0.8rem' }}>Zu wenig Verlaufspunkte</div>;
    }

    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const width = 100;
    const height = 42;

    const chartPoints = sanitized.map((value, index) => {
        const x = (index / Math.max(1, sanitized.length - 1)) * width;
        const normalized = value === null ? min : value;
        const y = height - ((normalized - min) / range) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: 52, display: 'block' }}>
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={chartPoints}
            />
        </svg>
    );
}

/* ---- Server Status ---- */
function ServerStatusManagement({ toast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rebootPending, setRebootPending] = useState(false);
    const [showRebootModal, setShowRebootModal] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState('cpu');
    const [showTrendModal, setShowTrendModal] = useState(false);

    const loadStatus = async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        if (silent) setRefreshing(true);
        try {
            const res = await api.get('/admin/server-status');
            setData(res.data);
        } catch (err) {
            if (!silent) {
                toast.error(err.response?.data?.error || 'Server-Status konnte nicht geladen werden');
            }
        } finally {
            if (!silent) setLoading(false);
            if (silent) setRefreshing(false);
        }
    };

    useEffect(() => {
        loadStatus();
        const interval = setInterval(() => loadStatus({ silent: true }), 5000);
        return () => clearInterval(interval);
    }, []);

    const triggerReboot = async () => {
        setRebootPending(true);
        try {
            await api.post('/admin/server-status/reboot');
            toast.success('Server-Reboot wurde gestartet');
            setShowRebootModal(false);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Reboot konnte nicht gestartet werden');
        } finally {
            setRebootPending(false);
        }
    };

    if (loading) {
        return <div className="text-center mt-lg text-muted">Server-Status wird geladen...</div>;
    }

    const cpuUsage = toPercent(data?.cpu?.usagePercent);
    const ramUsage = toPercent(data?.memory?.usedPercent);
    const diskUsage = toPercent(data?.disk?.usedPercent);
    const healthOverall = data?.health?.overall || 'warning';
    const healthBadgeTone = healthOverall === 'ok' ? 'completed' : healthOverall === 'warning' ? 'active' : 'admin';
    const history = Array.isArray(data?.history) ? data.history : [];

    const statCards = [
        {
            key: 'cpu',
            title: 'CPU',
            value: `${cpuUsage}%`,
            sub: `${data?.cpu?.cores || 0} Cores`,
            tone: usageTone(cpuUsage),
            percent: cpuUsage
        },
        {
            key: 'ram',
            title: 'RAM',
            value: `${ramUsage}%`,
            sub: `${formatGiB(data?.memory?.usedGiB)} / ${formatGiB(data?.memory?.totalGiB)}`,
            tone: usageTone(ramUsage),
            percent: ramUsage
        },
        {
            key: 'disk',
            title: 'Festplatte',
            value: `${diskUsage}%`,
            sub: `${formatGiB(data?.disk?.usedGiB)} / ${formatGiB(data?.disk?.totalGiB)}`,
            tone: usageTone(diskUsage),
            percent: diskUsage
        },
        {
            key: 'db',
            title: 'DB Größe',
            value: formatGiB(data?.database?.sizeGiB),
            sub: `${data?.database?.usersCount || 0} User · ${data?.database?.gamesCount || 0} Spiele`,
            tone: 'var(--color-primary)',
            percent: null
        },
        {
            key: 'temp',
            title: 'Temperatur',
            value: data?.temperature?.cpuC === null || data?.temperature?.cpuC === undefined ? '—' : `${Number(data.temperature.cpuC).toFixed(1)} °C`,
            sub: 'CPU Sensor',
            tone: 'var(--color-warning)',
            percent: null
        },
        {
            key: 'io',
            title: 'I/O',
            valueNode: (
                <div style={{ display: 'grid', gap: '2px', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2 }}>
                    <div>↓ {formatMiBPerSec(data?.io?.readMiBPerSec)}</div>
                    <div>↑ {formatMiBPerSec(data?.io?.writeMiBPerSec)}</div>
                </div>
            ),
            sub: `Gerät: ${data?.io?.device || 'Disk'}`,
            tone: 'var(--color-accent)',
            percent: null
        }
    ];

    const metricConfig = {
        cpu: {
            label: 'CPU %',
            unit: '%',
            color: usageTone(cpuUsage),
            points: history.map((p) => p.cpuPercent)
        },
        ram: {
            label: 'RAM %',
            unit: '%',
            color: usageTone(ramUsage),
            points: history.map((p) => p.ramPercent)
        },
        disk: {
            label: 'Disk %',
            unit: '%',
            color: usageTone(diskUsage),
            points: history.map((p) => p.diskPercent)
        },
        db: {
            label: 'DB Größe',
            unit: 'GB',
            color: 'var(--color-primary)',
            points: history.map((p) => p.dbSizeBytes === null ? null : Number(p.dbSizeBytes) / (1024 ** 3))
        },
        temp: {
            label: 'Temperatur',
            unit: '°C',
            color: 'var(--color-warning)',
            points: history.map((p) => p.tempC)
        },
        io: {
            label: 'I/O Gesamt',
            unit: 'MiB/s',
            color: 'var(--color-accent)',
            points: history.map((p) => {
                if (p.ioReadBytesPerSec === null || p.ioWriteBytesPerSec === null) return null;
                return (Number(p.ioReadBytesPerSec) + Number(p.ioWriteBytesPerSec)) / (1024 ** 2);
            })
        }
    };

    const selected = metricConfig[selectedMetric] || metricConfig.cpu;
    const selectedValues = selected.points.filter((value) => Number.isFinite(Number(value))).map(Number);
    const selectedLatest = selectedValues.length > 0 ? selectedValues[selectedValues.length - 1] : null;
    const selectedMin = selectedValues.length > 0 ? Math.min(...selectedValues) : null;
    const selectedMax = selectedValues.length > 0 ? Math.max(...selectedValues) : null;

    return (
        <div>
            <div className="flex-between mb-lg" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Server Status</h2>
                <div className="flex gap-sm" style={{ alignItems: 'center' }}>
                    <span className={`badge badge-${healthBadgeTone}`}>Health: {healthOverall.toUpperCase()}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => loadStatus({ silent: true })}>
                        {refreshing ? 'Aktualisiert...' : 'Jetzt aktualisieren'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                {statCards.map((card) => (
                    <button
                        key={card.key}
                        type="button"
                        className="card"
                        onClick={() => {
                            setSelectedMetric(card.key);
                            setShowTrendModal(true);
                        }}
                        style={{
                            borderTop: `4px solid ${card.tone}`,
                            textAlign: 'left',
                            cursor: 'pointer',
                            outline: selectedMetric === card.key && showTrendModal ? `2px solid ${card.tone}` : 'none'
                        }}
                    >
                        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '6px' }}>{card.title}</div>
                        {card.valueNode ? (
                            card.valueNode
                        ) : (
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.1 }}>{card.value}</div>
                        )}
                        <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '6px' }}>{card.sub}</div>
                        {card.percent !== null && (
                            <div style={{ marginTop: '10px', height: 8, borderRadius: 999, background: 'var(--color-border-light)', overflow: 'hidden' }}>
                                <div style={{ width: `${card.percent}%`, height: '100%', background: card.tone }} />
                            </div>
                        )}
                        <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '10px' }}>
                            Verlauf anzeigen
                        </div>
                    </button>
                ))}
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="flex-between mb-md" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>Health Checks</h3>
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>API Selfcheck inklusive</span>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                    {(data?.health?.checks || []).map((check) => {
                        const tone = check.status === 'ok'
                            ? 'var(--color-success-light)'
                            : check.status === 'warning'
                                ? 'var(--color-warning-light)'
                                : 'var(--color-danger-light)';
                        const textColor = check.status === 'ok'
                            ? 'var(--color-success)'
                            : check.status === 'warning'
                                ? 'var(--color-warning)'
                                : 'var(--color-danger)';

                        return (
                            <div key={check.id} style={{ background: tone, borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                                <div className="flex-between" style={{ gap: 'var(--space-sm)' }}>
                                    <strong style={{ color: textColor }}>{check.label}</strong>
                                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>{check.latencyMs} ms</span>
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.84rem' }}>{check.message}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="card">
                <div className="flex-between mb-md" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>System Info</h3>
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>Live-Refresh alle 5 Sekunden</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.9rem', display: 'grid', gap: '4px' }}>
                    <div><strong>Host:</strong> {data?.host || '—'}</div>
                    <div><strong>Plattform:</strong> {data?.platform || '—'}</div>
                    <div><strong>Uptime:</strong> {data?.uptimeHuman || '—'}</div>
                    <div><strong>CPU Modell:</strong> {data?.cpu?.model || '—'}</div>
                    <div><strong>Load Average:</strong> {(data?.cpu?.loadAverage || []).join(' / ') || '—'}</div>
                    <div><strong>Letzte Messung:</strong> {formatUpdateTime(data?.timestamp)}</div>
                </div>

                {data?.reboot?.enabled ? (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => setShowRebootModal(true)} disabled={rebootPending}>
                            {rebootPending ? 'Wird gestartet...' : 'Server neu starten'}
                        </button>
                    </div>
                ) : (
                    <p className="text-muted" style={{ marginTop: 'var(--space-md)', marginBottom: 0, fontSize: '0.84rem' }}>
                        Reboot ist aus Sicherheitsgründen deaktiviert (`SERVER_REBOOT_ENABLED=false`).
                    </p>
                )}
            </div>

            {showRebootModal && (
                <div className="modal-overlay" onClick={() => setShowRebootModal(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Server-Reboot bestätigen</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowRebootModal(false)}>X</button>
                        </div>
                        <p className="text-muted" style={{ marginBottom: 'var(--space-md)' }}>
                            Möchtest du den gesamten Server wirklich neu starten?
                        </p>
                        <p className="text-muted" style={{ marginBottom: 'var(--space-lg)' }}>
                            Die Anwendung ist während des Reboots kurz nicht erreichbar.
                        </p>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowRebootModal(false)} disabled={rebootPending}>
                                Abbrechen
                            </button>
                            <button type="button" className="btn btn-danger" onClick={triggerReboot} disabled={rebootPending}>
                                {rebootPending ? 'Wird gestartet...' : 'Server neu starten'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTrendModal && (
                <div className="modal-overlay" onClick={() => setShowTrendModal(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 760 }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Verlauf: {selected.label}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowTrendModal(false)}>X</button>
                        </div>
                        <MiniTrendChart points={selected.points} color={selected.color} />
                        <div className="text-muted" style={{ fontSize: '0.88rem', marginTop: '10px', display: 'grid', gap: '4px' }}>
                            <div><strong>Aktuell:</strong> {selectedLatest === null ? '—' : `${selectedLatest.toFixed(2)} ${selected.unit}`}</div>
                            <div><strong>Min:</strong> {selectedMin === null ? '—' : `${selectedMin.toFixed(2)} ${selected.unit}`}</div>
                            <div><strong>Max:</strong> {selectedMax === null ? '—' : `${selectedMax.toFixed(2)} ${selected.unit}`}</div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowTrendModal(false)}>
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatUpdateTime(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('de-DE');
}

function getStateMeta(rawState, updateAvailable) {
    const state = String(rawState || '').toLowerCase();
    if (state === 'running') {
        return { label: 'Update läuft', tone: 'active' };
    }
    if (updateAvailable) {
        // Prioritize actionable state for users when a new release exists.
        return { label: 'Update verfügbar', tone: 'active' };
    }
    if (state === 'success') {
        return { label: 'Letztes Update erfolgreich', tone: 'completed' };
    }
    if (state === 'failed') {
        return { label: 'Letztes Update fehlgeschlagen', tone: 'admin' };
    }
    return { label: 'Kein Update aktiv', tone: 'completed' };
}

/* ---- Update Management ---- */
function UpdateManagement({ toast }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

    const loadStatus = async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const res = await api.get('/admin/update/status');
            setStatus(res.data);
        } catch (err) {
            if (!silent) {
                toast.error(err.response?.data?.error || 'Update-Status konnte nicht geladen werden');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();

        const interval = setInterval(() => {
            loadStatus({ silent: true });
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const startUpdate = async () => {
        if (!status?.updateAvailable) return;
        setStarting(true);
        try {
            await api.post('/admin/update/start');
            toast.success('Update gestartet. Die Anwendung wird nach Abschluss neu gestartet.');
            await loadStatus({ silent: true });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Update konnte nicht gestartet werden');
        } finally {
            setStarting(false);
            setShowConfirmModal(false);
        }
    };

    if (loading) {
        return <div className="text-center mt-lg text-muted">Laden...</div>;
    }

    const stateMeta = getStateMeta(status?.updateState?.status, status?.updateAvailable);
    const finishedAt = formatUpdateTime(status?.updateState?.finishedAt);
    const startedAt = formatUpdateTime(status?.updateState?.startedAt);
    const statusMessage = status?.updateState?.message || '—';
    const isRunning = status?.updateState?.status === 'running';
    const noUpdateAvailable = !status?.updateAvailable;
    const updateButtonClass = noUpdateAvailable ? 'btn btn-ghost' : 'btn btn-primary';
    const showLastFailureHint = noUpdateAvailable && status?.updateState?.status === 'failed';

    return (
        <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Updates</h2>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="flex-between mb-md" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <div>
                        <div><strong>Installierte Version:</strong> {status?.currentVersion || '—'}</div>
                        <div><strong>Neueste Version:</strong> {status?.latestVersion || '—'}</div>
                    </div>
                    <span className={`badge badge-${status?.updateAvailable ? 'active' : 'completed'}`}>
                        {status?.updateAvailable ? 'Update verfügbar' : 'Aktuell'}
                    </span>
                </div>

                {status?.manifestError && (
                    <p className="text-muted" style={{ marginBottom: 'var(--space-md)' }}>
                        Manifest konnte nicht geladen werden: {status.manifestError}
                    </p>
                )}

                <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                    <button
                        className={updateButtonClass}
                        onClick={() => setShowConfirmModal(true)}
                        disabled={noUpdateAvailable || starting || isRunning}
                    >
                        {starting ? 'Wird gestartet...' : noUpdateAvailable ? 'System aktuell' : 'Jetzt updaten'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => loadStatus()}>
                        Aktualisieren
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="flex-between mb-md" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>Update-Status</h3>
                    <span className={`badge badge-${stateMeta.tone}`}>{stateMeta.label}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.95rem' }}>
                    {isRunning ? (
                        <p style={{ margin: 0 }}>
                            Das Update wird aktuell installiert. Bitte Seite in ein paar Sekunden erneut aktualisieren.
                        </p>
                    ) : noUpdateAvailable ? (
                        <p style={{ margin: 0 }}>
                            Dein System ist auf dem neuesten Stand.
                            {status?.updateState?.status === 'success' && finishedAt !== '—' ? ` Letztes erfolgreiches Update: ${finishedAt}.` : ''}
                        </p>
                    ) : (
                        <p style={{ margin: 0 }}>
                            Eine neue Version ist verfügbar und kann installiert werden.
                        </p>
                    )}
                </div>

                {showLastFailureHint && (
                    <p className="text-muted" style={{ fontSize: '0.86rem', marginTop: 'var(--space-sm)', marginBottom: 0 }}>
                        Hinweis: Der letzte Update-Versuch war nicht erfolgreich. Details findest du unten.
                    </p>
                )}

                <div style={{ marginTop: 'var(--space-md)' }}>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowTechnicalDetails((value) => !value)}
                    >
                        {showTechnicalDetails ? 'Technische Details ausblenden' : 'Technische Details anzeigen'}
                    </button>
                </div>

                {showTechnicalDetails && (
                    <div className="text-muted" style={{ fontSize: '0.86rem', marginTop: 'var(--space-md)' }}>
                        <div><strong>Letzter Lauf:</strong> {status?.updateState?.status || 'unbekannt'}</div>
                        <div><strong>Detailnachricht:</strong> {statusMessage}</div>
                        <div><strong>Zielversion:</strong> {status?.updateState?.version || '—'}</div>
                        <div><strong>Gestartet:</strong> {startedAt}</div>
                        <div><strong>Beendet:</strong> {finishedAt}</div>
                    </div>
                )}
            </div>

            <div className="card">
                <div className="flex-between mb-md" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>Updater-Log</h3>
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>letzte 120 Zeilen</span>
                </div>
                <pre
                    style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-md)',
                        fontSize: '0.78rem',
                        maxHeight: 320,
                        overflow: 'auto'
                    }}
                >
                    {(status?.logTail || []).length > 0 ? status.logTail.join('\n') : 'Noch keine Log-Einträge vorhanden.'}
                </pre>
            </div>

            {showConfirmModal && (
                <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Update bestätigen</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowConfirmModal(false)}>X</button>
                        </div>
                        <p className="text-muted" style={{ marginBottom: 'var(--space-md)' }}>
                            Möchtest du die Version <strong>{status?.latestVersion}</strong> jetzt installieren?
                        </p>
                        <p className="text-muted" style={{ marginBottom: 'var(--space-lg)' }}>
                            Während des Updates wird der Backend-Service neu gestartet. Die Seite kann kurz neu laden.
                        </p>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowConfirmModal(false)}
                                disabled={starting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={startUpdate}
                                disabled={starting}
                            >
                                {starting ? 'Wird gestartet...' : 'Update starten'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---- User Management (merged with Profiles) ---- */
function UserManagement({ toast }) {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [form, setForm] = useState({ displayName: '', username: '', password: '', role: 'player', multiplayerEnabled: false });
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch (err) {
            toast.error('Benutzer konnten nicht geladen werden');
        }
    };

    const openCreate = () => {
        setEditUser(null);
        setForm({ displayName: '', username: '', password: '', role: 'player', multiplayerEnabled: false });
        setAvatarFile(null);
        setAvatarPreview(null);
        setShowModal(true);
    };

    const openEdit = (user) => {
        setEditUser(user);
        setForm({
            displayName: user.displayName,
            username: user.username || '',
            password: '',
            role: user.role,
            multiplayerEnabled: !!user.multiplayerEnabled
        });
        setAvatarFile(null);
        setAvatarPreview(user.avatar ? `/uploads/${user.avatar}` : null);
        setShowModal(true);
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const saveUser = async (e) => {
        e.preventDefault();
        try {
            const formData = new FormData();
            formData.append('displayName', form.displayName);
            formData.append('role', form.role);
            formData.append('multiplayerEnabled', form.multiplayerEnabled);
            if (form.multiplayerEnabled && form.username) formData.append('username', form.username);
            if (form.password) formData.append('password', form.password);
            if (avatarFile) formData.append('avatar', avatarFile);

            if (editUser) {
                await api.put(`/users/${editUser.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success('Benutzer aktualisiert');
            } else {
                await api.post('/users', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success('Benutzer erstellt');
            }
            setShowModal(false);
            loadUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Speichern');
        }
    };

    const deleteUser = async (user) => {
        if (!window.confirm(`"${user.displayName}" wirklich löschen?`)) return;
        try {
            await api.delete(`/users/${user.id}`);
            toast.success('Benutzer gelöscht');
            loadUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Löschen');
        }
    };

    return (
        <div>
            <div className="flex-between mb-lg">
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Spieler & Benutzer</h2>
                <button className="btn btn-primary btn-sm" onClick={openCreate}>Neuer Spieler</button>
            </div>

            <div className="profile-grid">
                {users.map(u => (
                    <div key={u.id} className="card profile-card">
                        <div className="profile-card-header">
                            <div className="profile-avatar-lg">
                                {u.avatar ? (
                                    <img src={`/uploads/${u.avatar}`} alt={u.displayName} />
                                ) : (
                                    <span>{u.displayName.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <h3 className="profile-card-name">{u.displayName}</h3>
                            <div className="flex gap-sm" style={{ marginTop: 4 }}>
                                <span className={`badge badge-${u.role}`} style={{ fontSize: '0.7rem' }}>
                                    {u.role === 'admin' ? 'Admin' : u.role === 'player' ? 'Spieler' : 'GameMaster'}
                                </span>
                                {u.multiplayerEnabled && (
                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontSize: '0.7rem' }}>🌐 MP</span>
                                )}
                            </div>
                        </div>
                        <div className="profile-card-stats">
                            <div><span className="text-muted">Spiele:</span> {u.totalGames}</div>
                            <div><span className="text-muted">Ø Punkte:</span> {u.averageScore}</div>
                            <div><span className="text-muted">Rekord:</span> {u.highestSingleGame}</div>
                        </div>
                        <div className="profile-card-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Bearbeiten</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)}>Löschen</button>
                        </div>
                    </div>
                ))}
                {users.length === 0 && (
                    <div className="card empty-state">
                        <p className="text-muted">Noch keine Spieler angelegt</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editUser ? 'Spieler bearbeiten' : 'Neuer Spieler'}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>X</button>
                        </div>
                        <form onSubmit={saveUser}>
                            <div className="form-group" style={{ textAlign: 'center' }}>
                                <div
                                    className="profile-avatar-upload"
                                    onClick={() => fileRef.current.click()}
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Preview" />
                                    ) : (
                                        <span className="profile-avatar-placeholder">📷</span>
                                    )}
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    style={{ display: 'none' }}
                                />
                                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Avatar (optional)</p>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Anzeigename</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={form.displayName}
                                    onChange={e => setForm({ ...form, displayName: e.target.value })}
                                    placeholder="z.B. Mike"
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Rolle</label>
                                <select
                                    className="form-select"
                                    value={form.role}
                                    onChange={e => setForm({ ...form, role: e.target.value })}
                                >
                                    <option value="player">Spieler</option>
                                    <option value="gamemaster">GameMaster</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={form.multiplayerEnabled}
                                        onChange={e => setForm({ ...form, multiplayerEnabled: e.target.checked })}
                                    />
                                    <span>Multiplayer aktivieren (Login ermöglichen)</span>
                                </label>
                            </div>
                            {form.multiplayerEnabled && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Benutzername</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={form.username}
                                            onChange={e => setForm({ ...form, username: e.target.value })}
                                            placeholder="Login-Name"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Passwort{editUser ? ' (leer = beibehalten)' : ''}</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            placeholder="Min. 10 Zeichen"
                                            required={!editUser}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Abbrechen</button>
                                <button type="submit" className="btn btn-primary">Speichern</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---- Game Management ---- */
function GameManagement({ toast }) {
    const [games, setGames] = useState([]);
    const [mpRooms, setMpRooms] = useState([]);

    useEffect(() => { loadGames(); loadMpRooms(); }, []);

    const loadGames = async () => {
        try {
            const res = await api.get('/games');
            setGames(res.data);
        } catch (err) {
            toast.error('Spiele konnten nicht geladen werden');
        }
    };

    const loadMpRooms = async () => {
        try {
            const res = await api.get('/multiplayer/rooms?all=true');
            setMpRooms(res.data);
        } catch (err) {
            // Silently ignore if user doesn't have access
        }
    };

    const deleteGame = async (game) => {
        if (!window.confirm(`Spiel #${String(game.gameNumber).padStart(4, '0')}${game.name ? ' — ' + game.name : ''} wirklich löschen? Alle Scores gehen verloren.`)) return;
        try {
            await api.delete(`/games/${game.id}`);
            toast.success('Spiel gelöscht');
            loadGames();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Löschen');
        }
    };

    const deleteMpRoom = async (room) => {
        if (!window.confirm(`Multiplayer-Raum ${room.code}${room.creatorName ? ' (von ' + room.creatorName + ')' : ''} wirklich löschen?`)) return;
        try {
            await api.delete(`/multiplayer/rooms/${room.code}`);
            toast.success('Multiplayer-Raum gelöscht');
            loadMpRooms();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Löschen');
        }
    };

    const statusLabel = (status) => {
        if (status === 'waiting') return 'Wartend';
        if (status === 'playing') return 'Läuft';
        if (status === 'completed') return 'Abgeschlossen';
        return status;
    };

    const statusTone = (status) => {
        if (status === 'waiting') return 'active';
        if (status === 'playing') return 'active';
        return 'completed';
    };

    const multiplayerTypeLabel = (gameType) => {
        if (gameType === 'kniffel' || gameType === 'kniffel-multiplayer') return 'Kniffel';
        if (gameType === 'phase10dice' || gameType === 'phase10dice-multiplayer') return 'Phase 10';
        if (gameType === 'tictactoe' || gameType === 'tictactoe-multiplayer') return 'TicTacToe';
        return gameType || '—';
    };

    const multiplayerStatusRank = (status) => {
        if (status === 'playing') return 0;
        if (status === 'waiting') return 1;
        if (status === 'completed') return 2;
        return 3;
    };

    const sortedMpRooms = [...mpRooms].sort((left, right) => {
        const rankDiff = multiplayerStatusRank(left.status) - multiplayerStatusRank(right.status);
        if (rankDiff !== 0) return rankDiff;

        const leftCreated = new Date(left.createdAt).getTime();
        const rightCreated = new Date(right.createdAt).getTime();
        if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated)) {
            return rightCreated - leftCreated;
        }

        return String(left.code).localeCompare(String(right.code));
    });

    return (
        <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Singleplayer Spiele</h2>

            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-xl)' }}>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>#Nr.</th>
                                <th>Name</th>
                                <th>Typ</th>
                                <th>Status</th>
                                <th className="hide-mobile">Spieler</th>
                                <th className="hide-mobile">Erstellt</th>
                                <th style={{ width: '80px' }}>Aktion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {games.map(g => (
                                <tr key={g.id}>
                                    <td style={{ fontWeight: 600 }}>#{String(g.gameNumber).padStart(4, '0')}</td>
                                    <td style={{ fontWeight: 500 }}>{g.name || '—'}</td>
                                    <td>{g.gameTypeName || g.gameType}</td>
                                    <td>
                                        <span className={`badge badge-${g.status === 'active' ? 'active' : 'completed'}`}>
                                            {g.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}
                                        </span>
                                    </td>
                                    <td className="hide-mobile">{g.playerCount} Spieler</td>
                                    <td className="text-muted hide-mobile">{new Date(g.createdAt).toLocaleDateString('de-DE')}</td>
                                    <td>
                                        <button className="btn btn-danger btn-sm" onClick={() => deleteGame(g)}>X</button>
                                    </td>
                                </tr>
                            ))}
                            {games.length === 0 && (
                                <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '24px' }}>Keine Spiele vorhanden</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Multiplayer Spiele</h2>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Ersteller</th>
                                <th>Typ</th>
                                <th>Status</th>
                                <th className="hide-mobile">Spieler</th>
                                <th className="hide-mobile">Erstellt</th>
                                <th style={{ width: '80px' }}>Aktion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedMpRooms.map(r => (
                                <tr key={r.id}>
                                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.code}</td>
                                    <td style={{ fontWeight: 500 }}>{r.creatorName || '—'}</td>
                                    <td>{multiplayerTypeLabel(r.gameType)}</td>
                                    <td>
                                        <span className={`badge badge-${statusTone(r.status)}`}>
                                            {statusLabel(r.status)}
                                        </span>
                                    </td>
                                    <td className="hide-mobile">{r.playerCount} / {r.maxPlayers}</td>
                                    <td className="text-muted hide-mobile">{new Date(r.createdAt).toLocaleDateString('de-DE')}</td>
                                    <td>
                                        <button className="btn btn-danger btn-sm" onClick={() => deleteMpRoom(r)}>X</button>
                                    </td>
                                </tr>
                            ))}
                            {mpRooms.length === 0 && (
                                <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '24px' }}>Keine Multiplayer-Spiele vorhanden</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ---- Backup Management ---- */
function BackupManagement({ toast }) {
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);

    const exportBackup = async () => {
        try {
            const res = await api.get('/backup/export');
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `game-library-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Backup heruntergeladen');
        } catch (err) {
            toast.error('Export fehlgeschlagen');
        }
    };

    const importBackup = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm('Achtung: Der Import überschreibt alle vorhandenen Daten! Fortfahren?')) {
            fileInputRef.current.value = '';
            return;
        }

        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('backup', file);
            await api.post('/backup/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Backup erfolgreich importiert');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Import fehlgeschlagen');
        } finally {
            setImporting(false);
            fileInputRef.current.value = '';
        }
    };

    return (
        <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Backup / Restore</h2>

            <div className="game-grid">
                <div className="card">
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Export</h3>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
                        Lädt eine entschlüsselte JSON-Datei mit Spiel-, Profil- und Score-Daten herunter.
                        Profil-Avatare werden mit exportiert. Benutzerkonten (inkl. Admin) sind bewusst ausgenommen.
                    </p>
                    <button className="btn btn-primary" onClick={exportBackup}>
                        Backup herunterladen
                    </button>
                </div>

                <div className="card">
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Import</h3>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
                        Lädt eine Backup-Datei hoch. Spiele, Profile und Scores werden überschrieben,
                        Benutzerkonten bleiben erhalten. Importierte Daten werden wieder verschlüsselt gespeichert.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={importBackup}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn btn-ghost"
                        onClick={() => fileInputRef.current.click()}
                        disabled={importing}
                    >
                        {importing ? 'Wird importiert...' : 'Backup hochladen'}
                    </button>
                </div>
            </div>
        </div>
    );
}

