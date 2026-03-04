import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { loadGameTypesOrFallback } from '../services/gameTypes';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

function buildGamesUrl(status, gameTypeFilter) {
    const params = new URLSearchParams({ status });
    if (gameTypeFilter && gameTypeFilter !== 'all') {
        params.set('gameType', gameTypeFilter);
    }
    return `/games?${params.toString()}`;
}

export default function Dashboard() {
    const [activeGames, setActiveGames] = useState([]);
    const [completedGames, setCompletedGames] = useState([]);
    const [gameTypes, setGameTypes] = useState([]);
    const [gameTypeFilter, setGameTypeFilter] = useState('all');
    const [viewMode, setViewMode] = useState('all');
    const [completedExpanded, setCompletedExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const { socket } = useSocket();
    const { isGameMaster } = useAuth();
    const navigate = useNavigate();

    // New game modal state
    const [showNewGame, setShowNewGame] = useState(false);
    const [newGameName, setNewGameName] = useState('');
    const [selectedProfiles, setSelectedProfiles] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [profileSearch, setProfileSearch] = useState('');
    const [newGameType, setNewGameType] = useState('kniffel');

    const loadGames = useCallback(async () => {
        try {
            const [activeRes, completedRes] = await Promise.all([
                api.get(buildGamesUrl('active', gameTypeFilter)),
                api.get(buildGamesUrl('completed', gameTypeFilter))
            ]);
            setActiveGames(activeRes.data);
            setCompletedGames(completedRes.data);
        } catch (err) {
            console.error('Failed to load games:', err);
        } finally {
            setLoading(false);
        }
    }, [gameTypeFilter]);

    const loadGameTypes = useCallback(async () => {
        const types = await loadGameTypesOrFallback({ local: true });
        setGameTypes(types);
        if (types.length > 0) {
            setNewGameType(types[0].id);
        }
    }, []);

    useEffect(() => {
        loadGameTypes();
    }, [loadGameTypes]);

    useEffect(() => {
        loadGames();
    }, [loadGames]);

    useEffect(() => {
        if (!socket) return;
        socket.on('gameListChanged', loadGames);
        return () => socket.off('gameListChanged', loadGames);
    }, [socket, loadGames]);

    useEffect(() => {
        if (viewMode === 'completed') {
            setCompletedExpanded(true);
        }
    }, [viewMode]);

    // Load users (profiles) when opening modal
    const openNewGame = async () => {
        setShowNewGame(true);
        setNewGameName('');
        setSelectedProfiles([]);
        setProfileSearch('');
        try {
            const res = await api.get('/users');
            // Map user data to profile-like shape for the game creation UI
            setProfiles(res.data.map(u => ({ id: u.id, name: u.displayName, avatar: u.avatar })));
        } catch (err) {
            // ignore
        }
    };

    const createGame = async (event) => {
        event.preventDefault();
        if (selectedProfiles.length === 0) return;
        try {
            const res = await api.post('/games', {
                name: newGameName.trim() || null,
                gameType: newGameType,
                profileIds: selectedProfiles.map((profile) => profile.id)
            });
            setShowNewGame(false);
            navigate(`/manage?game=${res.data.id}`);
        } catch (err) {
            console.error('Create game error:', err);
        }
    };

    const addProfile = (profile) => {
        if (selectedProfiles.find((entry) => entry.id === profile.id)) return;
        setSelectedProfiles([...selectedProfiles, profile]);
        setProfileSearch('');
    };

    const removeProfile = (profileId) => {
        setSelectedProfiles(selectedProfiles.filter((profile) => profile.id !== profileId));
    };

    const filteredProfiles = profiles.filter((profile) =>
        !selectedProfiles.find((selected) => selected.id === profile.id)
        && profile.name.toLowerCase().includes(profileSearch.toLowerCase())
    );

    if (loading) {
        return <div className="text-center mt-lg text-muted">Laden...</div>;
    }

    const allGames = [...activeGames, ...completedGames];
    const uniquePlayers = new Set(
        allGames.flatMap((game) => game.players.map((player) => `${player.profileId || 'np'}-${player.name}`))
    ).size;
    const kpiTiles = [
        { label: 'Aktive Spiele', value: activeGames.length },
        { label: 'Abgeschlossen', value: completedGames.length },
        { label: 'Spieler gesamt', value: uniquePlayers }
    ];

    const showActiveSection = viewMode === 'all' || viewMode === 'active';
    const showCompletedSection = viewMode === 'all' || viewMode === 'completed';

    const formatDateTime = (value) => {
        if (!value) return 'Kein Datum';
        return new Date(value).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderGameCard = (game) => {
        const isActive = game.status === 'active';
        return (
            <article
                key={game.id}
                className="card db-game-card"
                onClick={() => navigate(`/spiel/${game.id}`)}
                onKeyDown={(event) => event.key === 'Enter' && navigate(`/spiel/${game.id}`)}
                tabIndex={0}
                role="button"
            >
                <div className="db-game-card-head">
                    <div>
                        <div className="db-game-title">#{String(game.gameNumber).padStart(4, '0')}{game.name ? ` · ${game.name}` : ''}</div>
                        <div className="db-game-type">{game.gameTypeName || game.gameType || 'Kniffel'}</div>
                    </div>
                    <span className={`badge ${isActive ? 'badge-active' : 'badge-completed'}`}>
                        {isActive ? 'Aktiv' : 'Abgeschlossen'}
                    </span>
                </div>

                <div className="db-player-row">
                    {game.players.map((player) => (
                        <span key={player.id} className="db-player-pill">
                            <span className="db-player-avatar">
                                {player.avatar ? (
                                    <img src={`/uploads/${player.avatar}`} alt="" />
                                ) : (
                                    <span>{player.name.charAt(0).toUpperCase()}</span>
                                )}
                            </span>
                            <span>{player.name}</span>
                        </span>
                    ))}
                </div>

                <div className="db-game-foot">
                    <span className="db-game-time">{formatDateTime(isActive ? game.createdAt : game.completedAt || game.createdAt)}</span>
                </div>
            </article>
        );
    };

    return (
        <div className="db-page">
            <section className="db-top">
                <div>
                    <h1 className="page-title">Game Library</h1>
                    <p className="page-subtitle">Control Deck für aktive und abgeschlossene Partien</p>
                </div>
                <div className="db-top-actions">
                    {isGameMaster && (
                        <button className="btn btn-primary db-new-game-btn" onClick={openNewGame}>
                            Neues Spiel
                        </button>
                    )}
                </div>
            </section>

            <section className="db-kpis">
                {kpiTiles.map((tile) => (
                    <div key={tile.label} className="card db-kpi-card">
                        <div className="db-kpi-value">{tile.value}</div>
                        <div className="db-kpi-label">{tile.label}</div>
                    </div>
                ))}
            </section>

            <section className="db-controls">
                <div className="db-segmented" role="tablist" aria-label="Spielstatus filter">
                    <button className={`db-segment ${viewMode === 'all' ? 'active' : ''}`} onClick={() => setViewMode('all')}>Alle</button>
                    <button className={`db-segment ${viewMode === 'active' ? 'active' : ''}`} onClick={() => setViewMode('active')}>Aktiv</button>
                    <button className={`db-segment ${viewMode === 'completed' ? 'active' : ''}`} onClick={() => setViewMode('completed')}>Abgeschlossen</button>
                </div>
                <select
                    className="form-select db-type-filter"
                    value={gameTypeFilter}
                    onChange={(event) => {
                        setLoading(true);
                        setGameTypeFilter(event.target.value);
                    }}
                >
                    <option value="all">Alle Spieltypen</option>
                    {gameTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                </select>
            </section>

            {showActiveSection && (
                <section className="db-section">
                    <div className="db-section-head">
                        <h2 className="db-section-title">Aktive Spiele</h2>
                    </div>
                    {activeGames.length === 0 ? (
                        <div className="card empty-state">
                            <p className="empty-state-title">Keine aktiven Spiele</p>
                            <p>Aktuell läuft kein Spiel für den gewählten Filter.</p>
                        </div>
                    ) : (
                        <div className="db-game-grid">
                            {activeGames.map(renderGameCard)}
                        </div>
                    )}
                </section>
            )}

            {showCompletedSection && (
                <section className="db-section">
                    <div className="db-section-head">
                        <h2 className="db-section-title">Abgeschlossene Spiele</h2>
                        <div className="db-section-tools">
                            <button
                                type="button"
                                className="db-collapse-btn"
                                onClick={() => setCompletedExpanded((value) => !value)}
                                aria-expanded={completedExpanded}
                            >
                                {completedExpanded ? 'Einklappen' : 'Ausklappen'}
                            </button>
                        </div>
                    </div>
                    {completedGames.length === 0 ? (
                        <div className="card empty-state">
                            <p className="empty-state-title">Keine abgeschlossenen Spiele</p>
                            <p>Hier erscheinen abgeschlossene Partien für den gewählten Filter.</p>
                        </div>
                    ) : !completedExpanded ? (
                        <div className="card db-collapsed-note">
                            <p>{completedGames.length} abgeschlossene Spiele sind eingeklappt.</p>
                        </div>
                    ) : (
                        <div className="db-game-grid">
                            {completedGames.map(renderGameCard)}
                        </div>
                    )}
                </section>
            )}

            {/* New Game Modal */}
            {showNewGame && (
                <div className="modal-overlay" onClick={() => setShowNewGame(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Neues Spiel erstellen</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowNewGame(false)}>X</button>
                        </div>
                        <form onSubmit={createGame}>
                            <div className="form-group">
                                <label className="form-label">Spieltyp</label>
                                <select
                                    className="form-select"
                                    value={newGameType}
                                    onChange={(event) => setNewGameType(event.target.value)}
                                    required
                                >
                                    {gameTypes.map((type) => (
                                        <option key={type.id} value={type.id}>{type.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Name (optional)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newGameName}
                                    onChange={(event) => setNewGameName(event.target.value)}
                                    placeholder="z.B. Freitagabend Runde"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Spieler</label>
                                {selectedProfiles.length > 0 && (
                                    <div className="selected-profiles-row">
                                        {selectedProfiles.map((profile) => (
                                            <div key={profile.id} className="selected-profile-chip">
                                                <div className="chip-avatar">
                                                    {profile.avatar ? (
                                                        <img src={`/uploads/${profile.avatar}`} alt="" />
                                                    ) : (
                                                        <span>{profile.name.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <span>{profile.name}</span>
                                                <button type="button" className="chip-remove" onClick={() => removeProfile(profile.id)}>x</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={profileSearch}
                                        onChange={(event) => setProfileSearch(event.target.value)}
                                        placeholder="Spieler suchen..."
                                    />
                                    {profileSearch && filteredProfiles.length > 0 && (
                                        <div className="profile-dropdown">
                                            {filteredProfiles.map((profile) => (
                                                <button
                                                    key={profile.id}
                                                    type="button"
                                                    className="profile-dropdown-item"
                                                    onClick={() => addProfile(profile)}
                                                >
                                                    <div className="profile-dropdown-avatar">
                                                        {profile.avatar ? (
                                                            <img src={`/uploads/${profile.avatar}`} alt="" />
                                                        ) : (
                                                            <span>{profile.name.charAt(0)}</span>
                                                        )}
                                                    </div>
                                                    <span>{profile.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {profileSearch && filteredProfiles.length === 0 && (
                                        <div className="profile-dropdown">
                                            <div className="profile-dropdown-empty">Kein Profil gefunden</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowNewGame(false)}>Abbrechen</button>
                                <button type="submit" className="btn btn-primary" disabled={selectedProfiles.length === 0}>Spiel starten</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
