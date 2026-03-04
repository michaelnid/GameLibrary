import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function MultiplayerLobby() {
    const { user, isAdmin, isGameMaster } = useAuth();
    const navigate = useNavigate();
    const [joinCode, setJoinCode] = useState('');
    const [myRooms, setMyRooms] = useState([]);
    const [creating, setCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [error, setError] = useState('');
    const [gameType, setGameType] = useState('kniffel');

    const canCreateRoom = isAdmin || isGameMaster;

    const fetchMyRooms = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.get('/multiplayer/rooms?mine=true');
            setMyRooms(res.data);
        } catch (err) {
            console.error('Failed to load my rooms:', err);
        }
    }, [user]);

    useEffect(() => {
        fetchMyRooms();
    }, [fetchMyRooms]);

    const handleCreateRoom = async () => {
        setCreating(true);
        setError('');
        try {
            const isTwoPlayerGame = gameType === 'tictactoe'
                || gameType === 'tictactoevanish'
                || gameType === 'connectfour'
                || gameType === 'battleship';
            const maxPlayers = isTwoPlayerGame ? 2 : 4;
            const res = await api.post('/multiplayer/rooms', { gameType, maxPlayers });
            navigate(`/multiplayer/game/${res.data.code}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Erstellen');
        } finally {
            setCreating(false);
        }
    };

    const handleJoinByCode = async () => {
        if (joinCode.length < 4) return;
        setError('');
        try {
            await api.post(`/multiplayer/rooms/${joinCode}/join`);
            navigate(`/multiplayer/game/${joinCode}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Raum nicht gefunden');
        }
    };

    if (!user) {
        return (
            <div className="mp-lobby">
                <div className="mp-lobby-header">
                    <h1 className="mp-lobby-title">Online Multiplayer</h1>
                    <p className="mp-lobby-subtitle">Melde dich an, um Räumen beizutreten oder zu spielen.</p>
                </div>
                <div className="mp-login-prompt">
                    <div className="mp-login-card">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mp-login-icon">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                            <polyline points="10 17 15 12 10 7" />
                            <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                        <h2>Login erforderlich</h2>
                        <p>Um Multiplayer-Spiele spielen zu können, brauchst du einen Account.</p>
                        <button className="btn btn-primary btn-lg" onClick={() => navigate('/login', { state: { from: '/multiplayer' } })}>
                            Zum Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mp-lobby">
            <div className="mp-lobby-header">
                <h1 className="mp-lobby-title">Online Multiplayer</h1>
                <p className="mp-lobby-subtitle">
                    Tritt einem Raum bei oder erstelle ein neues Spiel
                </p>
            </div>

            {error && <div className="mp-error">{error}</div>}

            {/* Join Section */}
            <div className="mp-join-section">
                <div className="mp-join-card">
                    <div className="mp-join-card-header">
                        <h2 className="mp-section-title">Raum beitreten</h2>
                        {canCreateRoom && (
                            <button
                                className="btn btn-primary mp-new-game-btn"
                                onClick={() => setShowCreateModal(true)}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Neues Spiel
                            </button>
                        )}
                    </div>
                    <div className="mp-join-form">
                        <input
                            type="text"
                            className="form-input mp-code-input"
                            placeholder="Code..."
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                            maxLength={4}
                            inputMode="numeric"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                        />
                        <button
                            className="btn btn-primary"
                            disabled={joinCode.length < 4}
                            onClick={handleJoinByCode}
                        >
                            Beitreten
                        </button>
                    </div>
                </div>
            </div>

            {/* Create Room Modal */}
            {showCreateModal && (
                <div className="mp-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="mp-modal-header">
                            <h2 className="mp-section-title">Neues Spiel erstellen</h2>
                            <button className="mp-modal-close" onClick={() => setShowCreateModal(false)}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="mp-game-type-picker">
                            <button
                                className={`mp-type-btn ${gameType === 'kniffel' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('kniffel')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="4" />
                                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                                    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                    <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                                    <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                                </svg>
                                Kniffel
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'phase10dice' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('phase10dice')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="4" />
                                    <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor" stroke="none" fontWeight="bold">10</text>
                                </svg>
                                Phase 10
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'tictactoe' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('tictactoe')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="4" y1="4" x2="20" y2="20" />
                                    <line x1="20" y1="4" x2="4" y2="20" />
                                    <circle cx="18" cy="18" r="3" />
                                </svg>
                                TicTacToe
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'tictactoevanish' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('tictactoevanish')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="4" y1="4" x2="20" y2="20" />
                                    <line x1="20" y1="4" x2="4" y2="20" />
                                    <circle cx="18" cy="18" r="3" strokeDasharray="4 2" />
                                </svg>
                                TTT Vanish
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'connectfour' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('connectfour')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="3" />
                                    <circle cx="8" cy="10" r="2" fill="currentColor" />
                                    <circle cx="16" cy="10" r="2" />
                                    <circle cx="8" cy="16" r="2" />
                                    <circle cx="12" cy="13" r="2" fill="currentColor" />
                                </svg>
                                Vier Gewinnt
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'battleship' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('battleship')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 17l2-1h14l2 1" />
                                    <path d="M5 16V9h14v7" />
                                    <rect x="9" y="6" width="6" height="3" rx="1" />
                                    <line x1="12" y1="4" x2="12" y2="6" />
                                    <path d="M1 20c2-1 4-2 6-2s4 1 6 2 4 2 6 2c2 0 4-1 5-2" />
                                </svg>
                                Schiffe Versenken
                            </button>
                            <button
                                className={`mp-type-btn ${gameType === 'uno' ? 'mp-type-active' : ''}`}
                                onClick={() => setGameType('uno')}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="5" width="8" height="14" rx="2" />
                                    <rect x="9" y="5" width="8" height="14" rx="2" />
                                    <rect x="15" y="5" width="6" height="14" rx="2" />
                                    <line x1="6" y1="9" x2="8" y2="9" />
                                    <line x1="12" y1="12" x2="14" y2="12" />
                                    <line x1="18" y1="15" x2="19" y2="15" />
                                </svg>
                                UNO
                            </button>
                        </div>
                        <p className="mp-create-desc">
                            {gameType === 'kniffel'
                                ? 'Klassisches Kniffel mit 5 Wuerfeln und 13 Kategorien.'
                                : gameType === 'phase10dice'
                                    ? 'Phase 10 Wuerfelspiel mit 10 Spezialwuerfeln und 10 Phasen.'
                                    : gameType === 'tictactoevanish'
                                        ? 'TicTacToe Vanish: Jeder hat max. 3 Chips. Der aelteste verschwindet! Kein Unentschieden.'
                                    : gameType === 'connectfour'
                                        ? 'Vier Gewinnt fuer genau 2 Spieler. Wer zuerst 4 in einer Reihe hat, gewinnt!'
                                        : gameType === 'battleship'
                                            ? 'Schiffe Versenken: Platziere 5 Schiffe und versenke die Flotte deines Gegners!'
                                            : gameType === 'uno'
                                                ? 'UNO fuer 2 bis 4 Spieler: Karten ablegen, Farbe wechseln und zuerst die Hand leeren.'
                                                : 'TicTacToe fuer genau 2 Spieler.'}
                        </p>
                        <button
                            className="btn btn-success btn-lg mp-create-btn"
                            onClick={handleCreateRoom}
                            disabled={creating}
                        >
                            {creating ? 'Erstelle...' : '+ Raum erstellen'}
                        </button>
                    </div>
                </div>
            )}

            {/* My Active Rooms */}
            {myRooms.length > 0 && (
                <div className="mp-rooms-section">
                    <h2 className="mp-section-title">Meine Raeume</h2>
                    <div className="mp-rooms-grid">
                        {myRooms.map((room) => (
                            <div
                                key={room.id}
                                className="mp-room-card card"
                                onClick={() => navigate(`/multiplayer/game/${room.code}`)}
                            >
                                <div className="mp-room-card-head">
                                    <span className="mp-room-code">{room.code}</span>
                                    <span className={`badge badge-${room.status === 'waiting' ? 'active' : room.status === 'playing' ? 'active' : 'completed'}`}>
                                        {room.status === 'waiting' ? 'Wartet' : room.status === 'playing' ? 'Laeuft' : 'Beendet'}
                                    </span>
                                </div>
                                <div className="mp-room-card-info">
                                    <span className="mp-room-type">
                                        {room.gameType === 'kniffel'
                                            ? 'Kniffel'
                                            : room.gameType === 'phase10dice'
                                                ? 'Phase 10'
                                                : room.gameType === 'tictactoe'
                                                    ? 'TicTacToe'
                                                    : room.gameType === 'tictactoevanish'
                                                        ? 'TTT Vanish'
                                                        : room.gameType === 'connectfour'
                                                            ? 'Vier Gewinnt'
                                                            : room.gameType === 'battleship'
                                                                ? 'Schiffe Versenken'
                                                                : room.gameType === 'uno'
                                                                    ? 'UNO'
                                                            : room.gameType}
                                    </span>
                                    <span className="mp-room-players">
                                        {room.playerCount}/{room.maxPlayers} Spieler
                                    </span>
                                </div>
                                {room.creatorName && (
                                    <div className="mp-room-creator">
                                        Erstellt von {room.creatorName}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
