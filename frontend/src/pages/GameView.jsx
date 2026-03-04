import { Fragment, useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { calculateKniffelPreview, getDiceDots, getKniffelLiveSummary } from '../games/kniffel';
import { normalizeGamePayload } from '../games/registry';

const PHASE10_BONUS_KEYS = new Set(['bonusThreshold', 'bonusFinisher', 'bonus']);

function toSafeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function calculateSectionTotals(scores, sections) {
    const sectionTotals = {};

    sections.forEach((section) => {
        sectionTotals[section.id] = section.categories.reduce(
            (sum, category) => sum + toSafeNumber(scores[category.key]),
            0
        );
    });

    return sectionTotals;
}

function calculatePlayerSummary(scores, gameType, gameDefinition) {
    if (!gameDefinition) {
        return { total: 0, sectionTotals: {} };
    }

    if (gameType === 'kniffel') {
        const summary = getKniffelLiveSummary(scores);
        return {
            ...summary,
            sectionTotals: {
                upper: summary.upperSum,
                lower: summary.lowerSum
            }
        };
    }

    const sectionTotals = calculateSectionTotals(scores, gameDefinition.sections || []);
    const total = Object.values(sectionTotals).reduce((sum, value) => sum + value, 0);
    return { total, sectionTotals };
}

function MiniDice({ value }) {
    const activeDots = getDiceDots(value);
    return (
        <span className="mini-dice">
            {Array.from({ length: 9 }, (_, index) => (
                <span key={index} className={activeDots.includes(index) ? 'mini-dice-dot' : 'mini-dice-dot-empty'} />
            ))}
        </span>
    );
}

function isPhase10StepCategory(categoryKey) {
    return /^phase([1-9]|10)$/.test(categoryKey || '');
}

function getPhaseNumber(categoryKey) {
    if (!isPhase10StepCategory(categoryKey)) return null;
    return Number.parseInt(String(categoryKey).replace('phase', ''), 10);
}

function formatPhaseLabel(label, categoryKey) {
    if (isPhase10StepCategory(categoryKey)) return '';
    return label;
}

export default function GameView() {
    const { id } = useParams();
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [highlightedCells, setHighlightedCells] = useState(new Set());
    const [currentPlayerId, setCurrentPlayerId] = useState(null);
    const [liveDice, setLiveDice] = useState([]);
    const { joinGame, leaveGame, onScoreUpdate, onGameCompleted, onDiceSelected, onTurnChanged } = useSocket();
    const { isGameMaster } = useAuth();

    const loadGame = useCallback(async () => {
        try {
            const res = await api.get(`/games/${id}`);
            setGame(normalizeGamePayload(res.data));
        } catch (err) {
            console.error('Failed to load game:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadGame();
        joinGame(id);

        return () => {
            leaveGame(id);
        };
    }, [id, joinGame, leaveGame, loadGame]);

    useEffect(() => {
        const unsubScore = onScoreUpdate((data) => {
            if (String(data.gameId) !== String(id)) return;

            setGame((previous) => {
                if (!previous) return previous;

                const updatedPlayers = previous.players.map((player) => {
                    if (player.id !== data.playerId) return player;

                    const scores = { ...player.scores, [data.category]: data.value };
                    const summary = calculatePlayerSummary(scores, previous.gameType, previous.gameDefinition);

                    return {
                        ...player,
                        scores,
                        ...summary
                    };
                });

                return {
                    ...previous,
                    players: updatedPlayers
                };
            });

            const key = `${data.playerId}-${data.category}`;
            setHighlightedCells((prev) => new Set([...prev, key]));
            setTimeout(() => {
                setHighlightedCells((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }, 2000);
        });

        const unsubComplete = onGameCompleted((data) => {
            if (String(data.gameId) === String(id)) {
                setCurrentPlayerId(null);
                setLiveDice([]);
                loadGame();
            }
        });

        const unsubDice = onDiceSelected((data) => {
            if (String(data.gameId) === String(id)) {
                setLiveDice(data.dice || []);
                if (data.currentPlayerId) setCurrentPlayerId(data.currentPlayerId);
            }
        });

        const unsubTurn = onTurnChanged((data) => {
            if (String(data.gameId) === String(id)) {
                setCurrentPlayerId(data.currentPlayerId);
                setLiveDice([]);
            }
        });

        return () => {
            unsubScore();
            unsubComplete();
            unsubDice();
            unsubTurn();
        };
    }, [id, onScoreUpdate, onGameCompleted, onDiceSelected, onTurnChanged, loadGame]);

    if (loading) {
        return <div className="text-center mt-lg text-muted">Laden...</div>;
    }

    if (!game) {
        return (
            <div className="card empty-state">
                <p className="empty-state-title">Spiel nicht gefunden</p>
                <Link to="/spiele" className="btn btn-primary mt-md">Zurück zur Übersicht</Link>
            </div>
        );
    }

    const preview = game.gameType === 'kniffel' ? calculateKniffelPreview(liveDice) : null;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="flex gap-md" style={{ alignItems: 'center' }}>
                        <h1 className="page-title">#{String(game.gameNumber).padStart(4, '0')}{game.name ? ` - ${game.name}` : ''}</h1>
                        {game.status === 'active' ? (
                            <span className="live-indicator">
                                <span className="live-dot"></span>
                                LIVE
                            </span>
                        ) : (
                            <span className="badge badge-completed">Abgeschlossen</span>
                        )}
                    </div>
                    <p className="page-subtitle">
                        {game.gameTypeName || game.gameType} - {game.players.length} Spieler - Gestartet am {new Date(game.createdAt).toLocaleDateString('de-DE')}
                    </p>
                </div>
                <div className="flex gap-sm">
                    {isGameMaster && game.status === 'active' && (
                        <Link to={`/manage?game=${game.id}`} className="btn btn-primary">Scores eintragen</Link>
                    )}
                    <Link to="/spiele" className="btn btn-ghost">Zurück</Link>
                </div>
            </div>

            {game.status === 'active' && game.gameDefinition?.supportsDiceInput && (
                <div className="live-dice-banner">
                    {liveDice.length > 0 ? (
                        <>
                            <span className="live-dice-label">Würfel:</span>
                            <div className="live-dice-row">
                                {liveDice.map((value, index) => <MiniDice key={index} value={value} />)}
                            </div>
                        </>
                    ) : (
                        <span className="live-dice-label" style={{ opacity: 0.6 }}>Warte auf Würfel...</span>
                    )}
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrapper">
                    <table className="scoreboard">
                        <thead>
                            <tr>
                                <th>Kategorie</th>
                                {game.players.map((player) => (
                                    <th key={player.id} className={player.id === currentPlayerId ? 'active-player-col' : ''}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <div className="scoreboard-avatar">
                                                {player.avatar ? (
                                                    <img src={`/uploads/${player.avatar}`} alt="" />
                                                ) : (
                                                    <span>{player.name.charAt(0)}</span>
                                                )}
                                            </div>
                                            {player.name}
                                            {player.id === currentPlayerId && game.status === 'active' && (
                                                <span className="turn-indicator">●</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(game.gameDefinition?.sections || []).map((section) => (
                                <Fragment key={section.id}>
                                    <tr key={`${section.id}-header`}>
                                        <td colSpan={game.players.length + 1} className="section-header">
                                            {section.label}
                                        </td>
                                    </tr>

                                    {section.categories.map((category) => (
                                        <tr
                                            key={category.key}
                                            className={
                                                game.gameType === 'phase10dice'
                                                    ? `${isPhase10StepCategory(category.key) ? 'phase10-phase-row' : ''} ${PHASE10_BONUS_KEYS.has(category.key) ? 'phase10-bonus-row' : ''}`.trim()
                                                    : ''
                                            }
                                        >
                                            <td>
                                                <div className="score-category-cell">
                                                    <div className="score-category-title-row">
                                                        {game.gameType === 'phase10dice' && isPhase10StepCategory(category.key) && (
                                                            <span className="phase-step-pill">
                                                                P{getPhaseNumber(category.key)}
                                                            </span>
                                                        )}
                                                        {game.gameType === 'phase10dice' && PHASE10_BONUS_KEYS.has(category.key) && (
                                                            <span className="phase-bonus-pill">BONUS</span>
                                                        )}
                                                        {formatPhaseLabel(category.label, category.key) && (
                                                            <span className="score-category-label">
                                                                {formatPhaseLabel(category.label, category.key)}
                                                            </span>
                                                        )}
                                                        {Number.isFinite(category.maxPoints) && (
                                                            <span className="score-max-pill">max {category.maxPoints}</span>
                                                        )}
                                                    </div>
                                                    {category.requirement && (
                                                        <span className="score-category-requirement">
                                                            {category.requirement}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {game.players.map((player) => {
                                                const hasScore = player.scores[category.key] !== undefined && player.scores[category.key] !== null;
                                                const isCurrentPlayer = player.id === currentPlayerId;
                                                const showPreview = !hasScore && isCurrentPlayer && preview;
                                                const isHighlighted = highlightedCells.has(`${player.id}-${category.key}`);

                                                return (
                                                    <td
                                                        key={`${player.id}-${category.key}`}
                                                        className={`score-cell ${isHighlighted ? 'score-pop' : ''} ${isCurrentPlayer ? 'active-player-cell' : ''}`}
                                                    >
                                                        {hasScore
                                                            ? player.scores[category.key]
                                                            : showPreview
                                                                ? <span className="preview-score">{preview[category.key] ?? '-'}</span>
                                                                : '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}

                                    <tr key={`${section.id}-sum`} className="subtotal-row">
                                        <td>Summe {section.label}</td>
                                        {game.players.map((player) => (
                                            <td key={`${player.id}-${section.id}-sum`}>
                                                {player.sectionTotals?.[section.id] ?? 0}
                                            </td>
                                        ))}
                                    </tr>

                                    {game.gameType === 'kniffel' && section.id === 'upper' && (
                                        <tr key="kniffel-bonus" className="bonus-row">
                                            <td>Bonus (ab 63)</td>
                                            {game.players.map((player) => (
                                                <td key={`${player.id}-bonus`}>
                                                    {player.bonus > 0 ? `+${player.bonus}` : '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    )}
                                </Fragment>
                            ))}

                            <tr className="total-row">
                                <td>Gesamt</td>
                                {game.players.map((player) => (
                                    <td key={`${player.id}-total`}>{player.total ?? 0}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
