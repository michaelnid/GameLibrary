import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import DiceRoller from '../components/DiceRoller';
import { KNIFFEL_UPPER, KNIFFEL_LOWER, getKniffelLiveSummary, calculateKniffelScores } from '../games/kniffel';
import MultiplayerPhase10 from './MultiplayerPhase10';
import MultiplayerTicTacToe from './MultiplayerTicTacToe';
import MultiplayerTicTacToeVanish from './MultiplayerTicTacToeVanish';
import MultiplayerConnectFour from './MultiplayerConnectFour';
import MultiplayerBattleship from './MultiplayerBattleship';
import MultiplayerUno from './MultiplayerUno';

const CATEGORY_LABELS = {
    ones: 'Einser', twos: 'Zweier', threes: 'Dreier',
    fours: 'Vierer', fives: 'Fuenfer', sixes: 'Sechser',
    threeOfAKind: 'Dreierpasch', fourOfAKind: 'Viererpasch',
    fullHouse: 'Full House', smallStraight: 'Kleine Strasse',
    largeStraight: 'Grosse Strasse', kniffel: 'Kniffel', chance: 'Chance'
};

export default function MultiplayerGame() {
    const { roomCode } = useParams();
    const { user } = useAuth();
    const { joinMpRoom, leaveMpRoom, onMpEvent, connected } = useSocket();
    const navigate = useNavigate();

    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [possibleScores, setPossibleScores] = useState(null);
    const [phaseResult, setPhaseResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const isMyTurn = room?.currentTurnUserId === user?.id;
    const myPlayer = room?.players?.find(p => p.userId === user?.id);
    const isCreator = room?.createdBy === user?.id;
    const isPhase10 = room?.gameType === 'phase10dice';
    const isTicTacToe = room?.gameType === 'tictactoe';
    const isTicTacToeVanish = room?.gameType === 'tictactoevanish';
    const isConnectFour = room?.gameType === 'connectfour';
    const isBattleship = room?.gameType === 'battleship';
    const isUnoGame = room?.gameType === 'uno';
    const diceState = isPhase10
        ? (room?.diceState || { dice: new Array(10).fill({ value: 0, color: null, isWild: false }), held: new Array(10).fill(false), rollsLeft: 3 })
        : (room?.diceState || { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rollsLeft: 3 });

    const fetchRoom = useCallback(async () => {
        try {
            const res = await api.get(`/multiplayer/rooms/${roomCode}`);
            setRoom(res.data);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Raum nicht gefunden');
        } finally {
            setLoading(false);
        }
    }, [roomCode]);

    // Initial load + socket join
    useEffect(() => {
        fetchRoom();
        joinMpRoom(roomCode);
        return () => leaveMpRoom(roomCode);
    }, [roomCode, fetchRoom, joinMpRoom, leaveMpRoom]);

    // Re-fetch room when socket reconnects (to catch missed updates)
    const prevConnected = useRef(false);
    useEffect(() => {
        if (connected && !prevConnected.current) {
            // Socket just reconnected - refresh room data
            fetchRoom();
        }
        prevConnected.current = connected;
    }, [connected, fetchRoom]);

    // Polling fallback - refresh room state periodically when game is active
    // This ensures updates reach all players even if WebSockets fail
    useEffect(() => {
        if (!room || room.status !== 'playing') return;
        const interval = setInterval(() => {
            fetchRoom();
        }, 3000);
        return () => clearInterval(interval);
    }, [room?.status, fetchRoom]);

    // Keep a ref to current room for socket handlers (avoid stale closures)
    const roomRef = useRef(room);
    useEffect(() => { roomRef.current = room; }, [room]);

    // Socket events
    useEffect(() => {
        const isSanitizedGame = () => {
            const gameType = roomRef.current?.gameType;
            return gameType === 'battleship' || gameType === 'uno';
        };
        const handlers = [
            onMpEvent('mp:playerJoined', (data) => {
                if (isSanitizedGame()) { fetchRoom(); } else { setRoom(data); }
            }),
            onMpEvent('mp:playerLeft', (data) => {
                if (isSanitizedGame()) { fetchRoom(); } else { setRoom(data); }
            }),
            onMpEvent('mp:playerReady', (data) => {
                if (isSanitizedGame()) { fetchRoom(); } else { setRoom(data); }
            }),
            onMpEvent('mp:gameStarted', (data) => {
                if (isSanitizedGame()) { fetchRoom(); } else { setRoom(data); }
                setPossibleScores(null); setPhaseResult(null);
            }),
            onMpEvent('mp:gameCompleted', (data) => {
                if (isSanitizedGame()) { fetchRoom(); } else { setRoom(data); }
            }),
            onMpEvent('mp:diceRolled', (data) => {
                setRoom(prev => prev ? { ...prev, diceState: data.diceState } : prev);
                if (data.userId === user?.id) {
                    if (data.possibleScores) setPossibleScores(data.possibleScores);
                    if (data.phaseResult) setPhaseResult(data.phaseResult);
                }
            }),
            onMpEvent('mp:diceHeld', (data) => {
                if (data.userId === user?.id) return;
                setRoom(prev => prev ? { ...prev, diceState: data.diceState } : prev);
            }),
            onMpEvent('mp:scoreSubmitted', (data) => {
                if (isSanitizedGame()) {
                    fetchRoom();
                } else {
                    setRoom(data.room);
                }
                setPossibleScores(null);
                setPhaseResult(null);
            }),
            onMpEvent('mp:rematchUpdated', (data) => {
                if (isSanitizedGame()) {
                    fetchRoom();
                } else {
                    setRoom(data.room || data);
                }
            }),
            onMpEvent('mp:shipsPlaced', (data) => {
                fetchRoom();
            }),
            onMpEvent('mp:turnChanged', (data) => {
                if (isSanitizedGame()) {
                    fetchRoom();
                } else {
                    setRoom(prev => prev ? { ...prev, currentTurnUserId: data.currentTurnUserId, diceState: data.diceState } : prev);
                }
                setPossibleScores(null);
                setPhaseResult(null);
            })
        ];
        return () => handlers.forEach(unsub => unsub());
    }, [onMpEvent, user?.id]);

    // Actions
    const handleJoin = async () => {
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/join`);
            setRoom(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Beitreten');
        }
    };

    const handleReady = async () => {
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/ready`);
            setRoom(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler');
        }
    };

    const handleStart = async () => {
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/start`);
            setRoom(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Starten');
        }
    };

    const handleRoll = async () => {
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/roll`);
            setRoom(prev => prev ? { ...prev, diceState: res.data.diceState } : prev);
            if (res.data.possibleScores) setPossibleScores(res.data.possibleScores);
            if (res.data.phaseResult) setPhaseResult(res.data.phaseResult);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Wuerfeln');
        }
    };

    const handleToggleHold = async (index) => {
        const currentHeld = [...diceState.held];
        currentHeld[index] = !currentHeld[index];
        setRoom(prev => prev ? { ...prev, diceState: { ...prev.diceState, held: currentHeld } } : prev);
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/hold`, { held: currentHeld });
            if (res.data?.phaseResult) {
                setPhaseResult(res.data.phaseResult);
            }
        } catch (err) {
            setRoom(prev => prev ? { ...prev, diceState: { ...prev.diceState, held: diceState.held } } : prev);
            setError(err.response?.data?.error || 'Fehler');
        }
    };

    const handleScore = async (categoryOrAction) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const body = isPhase10
                ? { action: categoryOrAction || 'submit' }
                : { category: categoryOrAction };
            const res = await api.post(`/multiplayer/rooms/${roomCode}/score`, body);
            setRoom(res.data);
            setPossibleScores(null);
            setPhaseResult(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Eintragen');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLeave = async () => {
        try {
            await api.post(`/multiplayer/rooms/${roomCode}/leave`);
            navigate('/multiplayer');
        } catch (err) {
            navigate('/multiplayer');
        }
    };

    const handleMove = async (indexOrCol) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const body = isUnoGame
                ? indexOrCol
                : isConnectFour
                    ? { column: indexOrCol }
                    : isBattleship
                        ? { row: indexOrCol.row, col: indexOrCol.col }
                        : { index: indexOrCol };
            const res = await api.post(`/multiplayer/rooms/${roomCode}/move`, body);
            setRoom(res.data);
            setError('');
            return res.data;
        } catch (err) {
            setError(err.response?.data?.error || 'Fehler beim Zug');
            return null;
        } finally {
            setSubmitting(false);
        }
    };

    const handleRematch = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/multiplayer/rooms/${roomCode}/rematch`);
            setRoom(res.data);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Rematch fehlgeschlagen');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="mp-game-loading">Lade Raum...</div>;
    if (error && !room) return (
        <div className="mp-game-error">
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => navigate('/multiplayer')}>Zurueck zur Lobby</button>
        </div>
    );
    if (!room) return null;

    const gameTitle = isPhase10
        ? 'Phase 10 Wuerfelspiel'
        : isTicTacToe
            ? 'TicTacToe'
            : isTicTacToeVanish
                ? 'TicTacToe Vanish'
                : isConnectFour
                    ? 'Vier Gewinnt'
                    : isBattleship
                        ? 'Schiffe Versenken'
                        : isUnoGame
                            ? 'UNO'
                        : 'Multiplayer Kniffel';

    // WAITING ROOM (shared for both game types)
    if (room.status === 'waiting') {
        const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
        return (
            <div className="mp-game mp-waiting">
                <div className="mp-game-header">
                    <h1 className="mp-game-title">{gameTitle}</h1>
                    <div className="mp-room-badge">
                        <span className="mp-room-badge-label">Raum-Code</span>
                        <span className="mp-room-badge-code">{room.code}</span>
                    </div>
                </div>

                {error && <div className="mp-error">{error}</div>}

                <div className="mp-waiting-card">
                    <h2>Warteraum</h2>
                    <p className="mp-waiting-hint">Teile den Raum-Code mit deinen Mitspielern</p>

                    <div className="mp-player-list">
                        {room.players.map((p) => (
                            <div key={p.userId} className={`mp-player-item ${p.isReady ? 'mp-player-ready' : ''}`}>
                                <span className="mp-player-name">
                                    {p.displayName}
                                    {p.userId === room.createdBy && <span className="mp-player-host">Host</span>}
                                </span>
                                <span className={`mp-ready-badge ${p.isReady ? 'mp-ready-yes' : 'mp-ready-no'}`}>
                                    {p.isReady ? (
                                        <><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4L6 11 3 8" /></svg> Bereit</>
                                    ) : '...'}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="mp-waiting-actions">
                        {!myPlayer ? (
                            <button className="btn btn-primary btn-lg" onClick={handleJoin}>Beitreten</button>
                        ) : (
                            <>
                                <button className={`btn ${myPlayer.isReady ? 'btn-ghost' : 'btn-success'} btn-lg`} onClick={handleReady}>
                                    {myPlayer.isReady ? 'Nicht bereit' : 'Bereit'}
                                </button>
                                {isCreator && (
                                    <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={!allReady}>
                                        {allReady ? 'Spiel starten' : `Warte auf Spieler (${room.players.filter(p => p.isReady).length}/${room.players.length})`}
                                    </button>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={handleLeave}>Verlassen</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // PHASE 10 (playing + completed)
    if (isPhase10) {
        return (
            <MultiplayerPhase10
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                myPlayer={myPlayer}
                diceState={diceState}
                error={error}
                onRoll={handleRoll}
                onToggleHold={handleToggleHold}
                onScore={handleScore}
                onLeave={() => navigate('/multiplayer')}
                submitting={submitting}
                phaseResult={phaseResult}
            />
        );
    }

    // TICTACTOE (playing + completed)
    if (isTicTacToe) {
        return (
            <MultiplayerTicTacToe
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                error={error}
                submitting={submitting}
                onMove={handleMove}
                onRematch={handleRematch}
                onLeave={() => navigate('/multiplayer')}
            />
        );
    }

    // TICTACTOE VANISH (playing + completed)
    if (isTicTacToeVanish) {
        return (
            <MultiplayerTicTacToeVanish
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                error={error}
                submitting={submitting}
                onMove={handleMove}
                onRematch={handleRematch}
                onLeave={() => navigate('/multiplayer')}
            />
        );
    }

    // CONNECT FOUR (playing + completed)
    if (isConnectFour) {
        return (
            <MultiplayerConnectFour
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                error={error}
                submitting={submitting}
                onMove={(col) => handleMove(col)}
                onRematch={handleRematch}
                onLeave={() => navigate('/multiplayer')}
            />
        );
    }

    // BATTLESHIP (placing + playing + completed)
    if (isBattleship) {
        const handlePlaceShips = async (ships) => {
            if (submitting) return;
            setSubmitting(true);
            try {
                const res = await api.post(`/multiplayer/rooms/${roomCode}/place-ships`, { ships });
                setRoom(res.data);
                setError('');
            } catch (err) {
                setError(err.response?.data?.error || 'Fehler beim Platzieren');
            } finally {
                setSubmitting(false);
            }
        };

        return (
            <MultiplayerBattleship
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                error={error}
                submitting={submitting}
                onPlaceShips={handlePlaceShips}
                onMove={handleMove}
                onRematch={handleRematch}
                onLeave={() => navigate('/multiplayer')}
            />
        );
    }

    if (isUnoGame) {
        return (
            <MultiplayerUno
                room={room}
                user={user}
                isMyTurn={isMyTurn}
                error={error}
                submitting={submitting}
                onMove={handleMove}
                onRematch={handleRematch}
                onLeave={() => navigate('/multiplayer')}
            />
        );
    }

    // KNIFFEL: GAME COMPLETED
    if (room.status === 'completed') {
        const sorted = [...room.players].sort((a, b) => {
            const sa = getKniffelLiveSummary(a.scores);
            const sb = getKniffelLiveSummary(b.scores);
            return sb.total - sa.total;
        });
        const winner = sorted[0];
        const winnerSummary = getKniffelLiveSummary(winner.scores);

        return (
            <div className="mp-game mp-completed">
                <div className="mp-game-header">
                    <h1 className="mp-game-title">Spiel beendet!</h1>
                </div>
                <div className="mp-winner-card">
                    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg" className="mp-winner-trophy-icon">
                        <path d="M14 8h20v6c0 5.523-4.477 10-10 10s-10-4.477-10-10V8z" stroke="#f59e0b" strokeWidth="2.5" fill="#fbbf2440" />
                        <path d="M34 10h4a4 4 0 010 8h-4M14 10h-4a4 4 0 000 8h4" stroke="#f59e0b" strokeWidth="2.5" />
                        <rect x="20" y="24" width="8" height="6" rx="1" stroke="#f59e0b" strokeWidth="2" fill="#fbbf2420" />
                        <rect x="16" y="30" width="16" height="4" rx="2" stroke="#f59e0b" strokeWidth="2" fill="#fbbf2420" />
                    </svg>
                    <h2 className="mp-winner-name">{winner.displayName}</h2>
                    <p className="mp-winner-score">{winnerSummary.total} Punkte</p>
                </div>
                <div className="mp-final-standings">
                    <h3>Endergebnis</h3>
                    <div className="mp-standings-list">
                        {sorted.map((p, idx) => {
                            const summary = getKniffelLiveSummary(p.scores);
                            return (
                                <div key={p.userId} className={`mp-standing-item ${idx === 0 ? 'mp-standing-winner' : ''}`}>
                                    <span className="mp-standing-rank">#{idx + 1}</span>
                                    <span className="mp-standing-name">{p.displayName}</span>
                                    <span className="mp-standing-score">{summary.total}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/multiplayer')}>
                    Zurueck zur Lobby
                </button>
            </div>
        );
    }

    // KNIFFEL: PLAYING
    const currentTurnPlayer = room.players.find(p => p.userId === room.currentTurnUserId);
    const preview = isMyTurn && diceState.dice.some(d => d > 0) ? calculateKniffelScores(diceState.dice, myPlayer?.scores || {}) : null;

    return (
        <div className="mp-game mp-playing">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">Kniffel</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {isMyTurn ? (
                        <span className="mp-turn-badge mp-turn-mine">Du bist dran!</span>
                    ) : (
                        <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>
                    )}
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            {/* Dice Roller */}
            <DiceRoller
                dice={diceState.dice}
                held={diceState.held}
                rollsLeft={diceState.rollsLeft}
                isMyTurn={isMyTurn}
                onRoll={handleRoll}
                onToggleHold={handleToggleHold}
                disabled={submitting}
            />

            {/* Scoreboard */}
            <div className="mp-scoreboard-wrapper">
                <div className="table-wrapper">
                    <table className="scoreboard mp-scoreboard">
                        <thead>
                            <tr>
                                <th>Kategorie</th>
                                {room.players.map(p => (
                                    <th key={p.userId} className={p.userId === room.currentTurnUserId ? 'mp-col-active' : ''}>
                                        {p.displayName}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="section-header"><td colSpan={room.players.length + 1}>Oberer Block</td></tr>
                            {KNIFFEL_UPPER.map(cat => renderScoreRow(cat, room, myPlayer, isMyTurn, preview, possibleScores, handleScore, submitting))}
                            <tr className="subtotal-row">
                                <td>Zwischensumme</td>
                                {room.players.map(p => (
                                    <td key={p.userId}>{getKniffelLiveSummary(p.scores).upperSum}</td>
                                ))}
                            </tr>
                            <tr className="bonus-row">
                                <td>Bonus (&gt;= 63 → +35)</td>
                                {room.players.map(p => (
                                    <td key={p.userId}>{getKniffelLiveSummary(p.scores).bonus}</td>
                                ))}
                            </tr>
                            <tr className="section-header"><td colSpan={room.players.length + 1}>Unterer Block</td></tr>
                            {KNIFFEL_LOWER.map(cat => renderScoreRow(cat, room, myPlayer, isMyTurn, preview, possibleScores, handleScore, submitting))}
                            <tr className="total-row">
                                <td>Gesamt</td>
                                {room.players.map(p => (
                                    <td key={p.userId}>{getKniffelLiveSummary(p.scores).total}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mp-game-actions">
                <button className="btn btn-ghost btn-sm" onClick={handleLeave}>Spiel verlassen</button>
            </div>
        </div>
    );
}

function renderScoreRow(category, room, myPlayer, isMyTurn, preview, possibleScores, handleScore, submitting) {
    const myScores = myPlayer?.scores || {};
    const isFilled = myScores[category] !== undefined && myScores[category] !== null;
    const canSelect = isMyTurn && !isFilled && preview;
    const previewValue = possibleScores ? possibleScores[category] : (preview ? preview[category] : null);

    return (
        <tr key={category}>
            <td>{CATEGORY_LABELS[category]}</td>
            {room.players.map(p => {
                const pScore = p.scores?.[category];
                const isMe = p.userId === myPlayer?.userId;
                const filled = pScore !== undefined && pScore !== null;

                if (isMe && canSelect && !filled) {
                    return (
                        <td
                            key={p.userId}
                            className="score-cell editable mp-score-selectable"
                            onClick={() => !submitting && handleScore(category)}
                        >
                            <span className="mp-score-preview">{previewValue ?? '–'}</span>
                        </td>
                    );
                }

                return (
                    <td key={p.userId} className="score-cell">
                        {filled ? pScore : '–'}
                    </td>
                );
            })}
        </tr>
    );
}
