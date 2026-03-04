import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';
import { calculateKniffelScores, getDiceDots } from '../games/kniffel';
import { normalizeGamePayload } from '../games/registry';

function DiceVisual({ value, onClick, className = '' }) {
    const activeDots = getDiceDots(value);
    return (
        <button className={`dice-btn ${className}`} onClick={onClick} type="button">
            {Array.from({ length: 9 }, (_, index) => (
                <span key={index} className={activeDots.includes(index) ? 'dice-dot' : 'dice-dot-empty'} />
            ))}
        </button>
    );
}

const PHASE10_STEP_KEYS = [
    'phase1', 'phase2', 'phase3', 'phase4', 'phase5',
    'phase6', 'phase7', 'phase8', 'phase9', 'phase10'
];
const PHASE10_BONUS_KEYS = new Set(['bonusThreshold', 'bonusFinisher', 'bonus']);

function hasEnteredScore(value) {
    return value !== undefined && value !== null;
}

function getNextPhase10Category(scores = {}) {
    return PHASE10_STEP_KEYS.find((key) => !hasEnteredScore(scores[key])) || null;
}

function isPhase10BonusCategory(category) {
    return PHASE10_BONUS_KEYS.has(category);
}

function isPhase10StepCategory(category) {
    return /^phase([1-9]|10)$/.test(category || '');
}

function getPhaseNumber(category) {
    if (!isPhase10StepCategory(category)) return null;
    return Number.parseInt(String(category).replace('phase', ''), 10);
}

function formatPhaseLabel(label, categoryKey) {
    if (isPhase10StepCategory(categoryKey)) return '';
    return label;
}

function getFilledCount(player, categoryKeys) {
    return categoryKeys.filter((category) => hasEnteredScore(player.scores?.[category])).length;
}

function isPlayerFinished(player, categoryKeys) {
    if (!player || categoryKeys.length === 0) return false;
    return getFilledCount(player, categoryKeys) >= categoryKeys.length;
}

function findNextActivePlayerIndex(game, startIndex, categoryKeys) {
    if (!game?.players?.length || categoryKeys.length === 0) return null;

    const total = game.players.length;
    for (let offset = 1; offset <= total; offset += 1) {
        const idx = (startIndex + offset) % total;
        if (!isPlayerFinished(game.players[idx], categoryKeys)) {
            return idx;
        }
    }

    return null;
}

export default function ManageGame() {
    const [selectedGame, setSelectedGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedDice, setSelectedDice] = useState([]);
    const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
    const [manualValues, setManualValues] = useState({});
    const toast = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { emitDiceSelected, emitTurnChanged } = useSocket();
    const previousPlayerIdRef = useRef(null);
    const [turnChangePulse, setTurnChangePulse] = useState(false);

    // Edit mode state
    const [editMode, setEditMode] = useState(false);
    const [editPlayerIdx, setEditPlayerIdx] = useState(null);
    const [editValues, setEditValues] = useState({});

    useEffect(() => {
        const gameId = searchParams.get('game');
        if (gameId) {
            loadGame(gameId);
        } else {
            setLoading(false);
        }
    }, []);

    const getCategoryKeys = (game) => game?.gameDefinition?.categoryKeys || [];
    const isGameFullyScored = (game) => {
        const categoryKeys = getCategoryKeys(game);
        if (!game || categoryKeys.length === 0) return false;

        return game.players.every((player) =>
            categoryKeys.every((categoryKey) => player.scores[categoryKey] !== undefined && player.scores[categoryKey] !== null)
        );
    };

    const advanceToNextPlayer = (game) => {
        if (!game || !game.players || game.players.length === 0) return;
        const categoryKeys = getCategoryKeys(game);
        if (categoryKeys.length === 0) return;

        const nextIdx = findNextActivePlayerIndex(game, currentPlayerIdx, categoryKeys);
        if (nextIdx === null) return;
        setCurrentPlayerIdx(nextIdx);

        const nextPlayer = game.players[nextIdx];
        emitTurnChanged(game.id, nextPlayer.id);

        if (game.gameDefinition?.supportsDiceInput) {
            setSelectedDice([]);
            emitDiceSelected(game.id, [], nextPlayer.id);
        }
    };

    const loadGame = async (gameId) => {
        try {
            const res = await api.get(`/games/${gameId}`);
            const loadedGame = normalizeGamePayload(res.data);
            const categoryKeys = getCategoryKeys(loadedGame);

            setSelectedGame(loadedGame);
            setSelectedDice([]);
            setManualValues({});

            if (loadedGame.players.length > 0 && categoryKeys.length > 0) {
                const unfinishedIndices = loadedGame.players
                    .map((player, idx) => ({ idx, filled: getFilledCount(player, categoryKeys) }))
                    .filter((entry) => entry.filled < categoryKeys.length)
                    .sort((a, b) => a.filled - b.filled || a.idx - b.idx);

                const idx = unfinishedIndices.length > 0 ? unfinishedIndices[0].idx : 0;
                setCurrentPlayerIdx(idx);
                emitTurnChanged(gameId, loadedGame.players[idx].id);
                emitDiceSelected(gameId, [], loadedGame.players[idx].id);
            }
        } catch (err) {
            toast.error('Spiel konnte nicht geladen werden');
        } finally {
            setLoading(false);
        }
    };

    const addDie = (value) => {
        if (selectedDice.length >= 5 || !selectedGame || selectedGame.gameType !== 'kniffel') return;
        const newDice = [...selectedDice, value];
        setSelectedDice(newDice);
        const player = selectedGame.players[currentPlayerIdx];
        if (player) emitDiceSelected(selectedGame.id, newDice, player.id);
    };

    const removeDie = (index) => {
        const newDice = selectedDice.filter((_, i) => i !== index);
        setSelectedDice(newDice);
        if (selectedGame) {
            const player = selectedGame.players[currentPlayerIdx];
            if (player) emitDiceSelected(selectedGame.id, newDice, player.id);
        }
    };

    const clearDice = () => {
        setSelectedDice([]);
        if (selectedGame) {
            const player = selectedGame.players[currentPlayerIdx];
            if (player) emitDiceSelected(selectedGame.id, [], player.id);
        }
    };

    const openEditMode = () => {
        setEditMode(true);
        setEditPlayerIdx(null);
        setEditValues({});
    };

    const selectEditPlayer = (idx) => {
        setEditPlayerIdx(idx);
        const player = selectedGame.players[idx];
        const values = {};

        getCategoryKeys(selectedGame).forEach((category) => {
            values[category] = player.scores[category] !== undefined && player.scores[category] !== null
                ? String(player.scores[category])
                : '';
        });

        setEditValues(values);
    };

    const saveEditScore = async (category) => {
        if (selectedGame?.gameType === 'phase10dice' && isPhase10BonusCategory(category)) {
            toast.error('Die Phase-10-Boni werden automatisch berechnet');
            return;
        }

        const player = selectedGame.players[editPlayerIdx];
        const value = editValues[category];
        if (value === '' || value === undefined) return;

        const numericValue = parseInt(value, 10);
        if (Number.isNaN(numericValue) || numericValue < 0) {
            toast.error('Ungültiger Wert');
            return;
        }

        try {
            await api.put(`/games/${selectedGame.id}/players/${player.id}/scores`, {
                category,
                value: numericValue
            });
            toast.success(`${category}: ${numericValue} gespeichert`);
            loadGame(selectedGame.id);
        } catch (err) {
            toast.error('Fehler beim Speichern');
        }
    };

    const closeEditMode = () => {
        setEditMode(false);
        setEditPlayerIdx(null);
        setEditValues({});
        if (selectedGame) loadGame(selectedGame.id);
    };

    const selectCategory = async (category, value) => {
        if (!selectedGame) return;

        const player = selectedGame.players[currentPlayerIdx];
        if (!player) return;

        if (selectedGame.gameType === 'phase10dice') {
            if (isPhase10BonusCategory(category)) {
                toast.error('Die Phase-10-Boni werden automatisch vergeben');
                return;
            }

            const alreadyEntered = hasEnteredScore(player.scores[category]);
            const nextPhaseCategory = getNextPhase10Category(player.scores || {});
            if (!alreadyEntered && nextPhaseCategory && category !== nextPhaseCategory) {
                toast.error('Bei Phase 10 muss von oben nach unten eingetragen werden');
                return;
            }
        }

        if (hasEnteredScore(player.scores[category])) return;

        try {
            await api.put(`/games/${selectedGame.id}/players/${player.id}/scores`, {
                category,
                value
            });

            const updatedRes = await api.get(`/games/${selectedGame.id}`);
            const updatedGame = normalizeGamePayload(updatedRes.data);
            setSelectedGame(updatedGame);
            setSelectedDice([]);
            setManualValues((prev) => ({ ...prev, [category]: '' }));
            emitDiceSelected(updatedGame.id, [], null);

            const allDone = isGameFullyScored(updatedGame);

            if (allDone) {
                try {
                    await api.put(`/games/${selectedGame.id}/complete`);
                    toast.success('Spiel abgeschlossen! Highscores aktualisiert.');
                    setSelectedGame(null);
                    navigate('/spiele');
                } catch (err) {
                    toast.error('Fehler beim Abschliessen des Spiels');
                }
                return;
            }

            advanceToNextPlayer(updatedGame);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Speichern');
        }
    };

    const saveManualCategory = async (category) => {
        const rawValue = manualValues[category];
        if (rawValue === '' || rawValue === undefined) return;

        const numericValue = parseInt(rawValue, 10);
        if (Number.isNaN(numericValue) || numericValue < 0) {
            toast.error('Ungültiger Wert');
            return;
        }

        await selectCategory(category, numericValue);
    };

    const completeGame = async () => {
        if (!selectedGame) return;
        const fullyScored = isGameFullyScored(selectedGame);
        const confirmMessage = fullyScored
            ? 'Spiel wirklich abschliessen?'
            : 'Spiel vorzeitig abschliessen? Nicht ausgefuellte Felder werden als 0 gewertet.';
        if (!window.confirm(confirmMessage)) return;

        try {
            await api.put(`/games/${selectedGame.id}/complete`);
            toast.success(fullyScored ? 'Spiel abgeschlossen' : 'Spiel vorzeitig abgeschlossen');
            setSelectedGame(null);
            navigate('/spiele');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Fehler beim Abschliessen');
        }
    };

    const continueWithoutScore = () => {
        if (!selectedGame) return;
        advanceToNextPlayer(selectedGame);
    };

    const categoryKeys = getCategoryKeys(selectedGame);
    const currentPlayer = selectedGame?.players[currentPlayerIdx];
    const isPhase10 = selectedGame?.gameType === 'phase10dice';
    const phase10NextCategory = isPhase10 && currentPlayer
        ? getNextPhase10Category(currentPlayer.scores || {})
        : null;
    const phase10Progress = isPhase10 && currentPlayer
        ? PHASE10_STEP_KEYS.map((key) => {
            const done = hasEnteredScore(currentPlayer.scores[key]);
            const current = !done && phase10NextCategory === key;
            return {
                key,
                phase: getPhaseNumber(key),
                done,
                current
            };
        })
        : [];

    useEffect(() => {
        previousPlayerIdRef.current = null;
        setTurnChangePulse(false);
    }, [selectedGame?.id]);

    useEffect(() => {
        if (!selectedGame || !currentPlayer) return;

        const previousPlayerId = previousPlayerIdRef.current;
        previousPlayerIdRef.current = currentPlayer.id;

        if (previousPlayerId === null || previousPlayerId === currentPlayer.id) return;

        setTurnChangePulse(true);
        const timeoutId = setTimeout(() => setTurnChangePulse(false), 900);

        return () => clearTimeout(timeoutId);
    }, [selectedGame?.id, currentPlayer?.id]);

    const scores = selectedDice.length === 5
        && currentPlayer
        && selectedGame?.gameType === 'kniffel'
        ? calculateKniffelScores(selectedDice, currentPlayer.scores)
        : null;

    const filledCategories = currentPlayer
        ? categoryKeys.filter((category) => currentPlayer.scores[category] !== undefined && currentPlayer.scores[category] !== null)
        : [];

    const totalRounds = selectedGame ? selectedGame.players.length * categoryKeys.length : 0;
    const completedRounds = selectedGame
        ? selectedGame.players.reduce((sum, player) => sum + categoryKeys.filter((category) => player.scores[category] !== undefined && player.scores[category] !== null).length, 0)
        : 0;
    const allFieldsFilled = isGameFullyScored(selectedGame);
    const showManualInputDisclaimer = Boolean(
        selectedGame
        && !selectedGame.gameDefinition?.supportsDiceInput
        && selectedGame.gameType !== 'phase10dice'
    );
    const showSkipWithoutScore = selectedGame?.gameType === 'phase10dice';
    const canSkipCurrentPlayer = Boolean(
        showSkipWithoutScore
        && currentPlayer
        && !isPlayerFinished(currentPlayer, categoryKeys)
    );

    const bestCategory = scores ? (() => {
        let best = null;
        let bestValue = -1;

        categoryKeys.forEach((category) => {
            if (!filledCategories.includes(category) && (scores[category] ?? -1) > bestValue) {
                bestValue = scores[category];
                best = category;
            }
        });

        return best;
    })() : null;

    return (
        <div>
            {!selectedGame ? (
                <div className="card empty-state">
                    <p className="empty-state-title">Kein Spiel ausgewählt</p>
                    <button className="btn btn-primary mt-md" onClick={() => navigate('/spiele')}>Zurück zur Übersicht</button>
                </div>
            ) : (
                <>
                    {selectedGame && currentPlayer && (
                        <div>
                            <div className="gm-header mb-lg">
                                <div className="gm-header-left">
                                    <span className="badge badge-active gm-game-type-badge">
                                        {selectedGame.gameTypeName || selectedGame.gameType}
                                    </span>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                                        #{String(selectedGame.gameNumber).padStart(4, '0')}{selectedGame.name ? ` - ${selectedGame.name}` : ''}
                                    </h2>
                                </div>
                                <div className="gm-header-actions">
                                    <button className="btn btn-ghost btn-sm gm-btn-edit" onClick={openEditMode}>
                                        Bearbeiten
                                    </button>
                                    <button className="btn btn-ghost btn-sm gm-btn-live" onClick={() => navigate(`/spiel/${selectedGame.id}`)}>
                                        Live-Ansicht
                                    </button>
                                    <button
                                        className="btn btn-success btn-sm gm-btn-complete"
                                        onClick={completeGame}
                                        title={!allFieldsFilled ? 'Vorzeitiges Abschliessen moeglich' : ''}
                                    >
                                        {allFieldsFilled ? 'Spiel abschliessen' : 'Vorzeitig abschliessen'}
                                    </button>
                                </div>
                            </div>

                            {editMode && (
                                <div className="modal-overlay" onClick={closeEditMode}>
                                    <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 620 }}>
                                        <div className="modal-header">
                                            <h2 className="modal-title">Scores bearbeiten</h2>
                                            <button className="modal-close" onClick={closeEditMode}>x</button>
                                        </div>

                                        {editPlayerIdx === null ? (
                                            <div style={{ padding: 'var(--space-lg)' }}>
                                                <p className="text-muted mb-md">Wähle einen Spieler:</p>
                                                <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
                                                    {selectedGame.players.map((player, idx) => (
                                                        <button
                                                            key={player.id}
                                                            className="btn btn-ghost"
                                                            onClick={() => selectEditPlayer(idx)}
                                                            style={{ padding: '12px 24px', fontSize: '1rem' }}
                                                        >
                                                            {player.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: 'var(--space-lg)', maxHeight: '65vh', overflow: 'auto' }}>
                                                <div className="flex-between mb-md">
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditPlayerIdx(null)}>
                                                        Zurück zum Spieler
                                                    </button>
                                                    <span style={{ fontWeight: 600 }}>{selectedGame.players[editPlayerIdx].name}</span>
                                                </div>

                                                {(selectedGame.gameDefinition?.sections || []).map((section) => (
                                                    <div key={`edit-${section.id}`}>
                                                        <div className="scoring-section-header" style={{ marginTop: 4 }}>{section.label}</div>
                                                        {section.categories.map((category) => (
                                                            <div key={`edit-${category.key}`} className="edit-score-row">
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <div className="score-category-title-row">
                                                                        {selectedGame.gameType === 'phase10dice' && isPhase10StepCategory(category.key) && (
                                                                            <span className="phase-step-pill">P{getPhaseNumber(category.key)}</span>
                                                                        )}
                                                                        {selectedGame.gameType === 'phase10dice' && isPhase10BonusCategory(category.key) && (
                                                                            <span className="phase-bonus-pill">BONUS</span>
                                                                        )}
                                                                        {formatPhaseLabel(category.label, category.key) && (
                                                                            <span className="edit-score-label">{formatPhaseLabel(category.label, category.key)}</span>
                                                                        )}
                                                                        {Number.isFinite(category.maxPoints) && (
                                                                            <span className="score-max-pill">max {category.maxPoints}</span>
                                                                        )}
                                                                    </div>
                                                                    {category.requirement && (
                                                                        <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                                                                            {category.requirement}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="edit-score-actions">
                                                                    {selectedGame.gameType === 'phase10dice' && isPhase10BonusCategory(category.key) ? (
                                                                        <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                                                                            Automatisch berechnet
                                                                        </span>
                                                                    ) : (
                                                                        <>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                className="edit-score-input"
                                                                                value={editValues[category.key] || ''}
                                                                                onChange={(event) => setEditValues((values) => ({ ...values, [category.key]: event.target.value }))}
                                                                                onKeyDown={(event) => event.key === 'Enter' && saveEditScore(category.key)}
                                                                            />
                                                                            <button className="btn btn-primary btn-sm" onClick={() => saveEditScore(category.key)}>
                                                                                Speichern
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className={`current-player-banner ${turnChangePulse ? 'turn-change' : ''}`}>
                                <div>
                                    <div className="current-player-name">{currentPlayer.name} ist dran</div>
                                    <div className="current-player-info">
                                        Runde {Math.floor(completedRounds / selectedGame.players.length) + 1} von {categoryKeys.length} · {filledCategories.length}/{categoryKeys.length} Kategorien
                                    </div>
                                    {canSkipCurrentPlayer && (
                                        <button
                                            className="btn btn-sm btn-banner-skip mt-sm"
                                            onClick={continueWithoutScore}
                                        >
                                            Weiter (ohne Eintrag)
                                        </button>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="current-player-info" style={{ marginBottom: 4 }}>Gesamtfortschritt</div>
                                    <div className="progress-bar-wrapper">
                                        <div className="progress-bar-fill" style={{ width: `${totalRounds > 0 ? (completedRounds / totalRounds) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            </div>

                            {isPhase10 && (
                                <div className="phase-progress-strip card mb-lg">
                                    {phase10Progress.map((entry) => (
                                        <div
                                            key={entry.key}
                                            className={`phase-progress-item ${entry.done ? 'done' : ''} ${entry.current ? 'current' : ''}`}
                                        >
                                            <span className="phase-progress-number">P{entry.phase}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedGame.gameDefinition?.supportsDiceInput && (
                                <div className="card mb-lg">
                                    <h3 className="card-title mb-md" style={{ textAlign: 'center' }}>Würfel eingeben</h3>
                                    <div className="dice-selector">
                                        {[1, 2, 3, 4, 5, 6].map((value) => (
                                            <DiceVisual
                                                key={value}
                                                value={value}
                                                className={selectedDice.length >= 5 ? 'disabled' : ''}
                                                onClick={() => addDie(value)}
                                            />
                                        ))}
                                    </div>

                                    <div className={`selected-dice-area ${selectedDice.length > 0 ? 'has-dice' : ''}`}>
                                        {selectedDice.length === 0 ? (
                                            <span className="selected-dice-placeholder">Klicke oben auf die Würfel um sie einzugeben (5 Stück)</span>
                                        ) : (
                                            selectedDice.map((value, index) => (
                                                <DiceVisual key={index} value={value} onClick={() => removeDie(index)} />
                                            ))
                                        )}
                                    </div>

                                    {selectedDice.length > 0 && selectedDice.length < 5 && (
                                        <p className="text-center text-muted" style={{ fontSize: '0.85rem' }}>
                                            Noch {5 - selectedDice.length} Würfel auswählen
                                        </p>
                                    )}

                                    {selectedDice.length > 0 && (
                                        <button className="btn btn-ghost btn-sm clear-dice-btn" onClick={clearDice}>
                                            Würfel zurücksetzen
                                        </button>
                                    )}
                                </div>
                            )}

                            {showManualInputDisclaimer && (
                                <div className="card mb-lg">
                                    <h3 className="card-title">Manuelle Eingabe</h3>
                                    <p className="text-muted" style={{ marginTop: 8 }}>
                                        Dieser Spieltyp nutzt aktuell keine Würfel-Assistenz. Trage Werte direkt je Kategorie ein.
                                    </p>
                                </div>
                            )}

                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                {(selectedGame.gameDefinition?.sections || []).map((section) => (
                                    <div key={`section-${section.id}`}>
                                        <div className="scoring-section-header">{section.label}</div>
                                        <div className="scoring-options">
                                            {section.categories.map((category) => {
                                                const used = hasEnteredScore(currentPlayer.scores[category.key]);
                                                const isBest = scores && bestCategory === category.key;
                                                const categoryScore = scores ? scores[category.key] : null;
                                                const manualValue = manualValues[category.key] ?? '';
                                                const isPhase10Bonus = isPhase10 && isPhase10BonusCategory(category.key);
                                                const isLockedPhase10Step = isPhase10
                                                    && !isPhase10Bonus
                                                    && !used
                                                    && phase10NextCategory
                                                    && category.key !== phase10NextCategory;

                                                return (
                                                    <div key={category.key} className={`scoring-option ${used || isLockedPhase10Step ? 'disabled' : ''} ${isBest ? 'best-option' : ''}`}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <div className="score-category-title-row">
                                                                {isPhase10 && isPhase10StepCategory(category.key) && (
                                                                    <span className="phase-step-pill">P{getPhaseNumber(category.key)}</span>
                                                                )}
                                                                {isPhase10 && isPhase10Bonus && (
                                                                    <span className="phase-bonus-pill">BONUS</span>
                                                                )}
                                                                {formatPhaseLabel(category.label, category.key) && (
                                                                    <span className="scoring-option-name">{formatPhaseLabel(category.label, category.key)}</span>
                                                                )}
                                                                {Number.isFinite(category.maxPoints) && (
                                                                    <span className="score-max-pill">max {category.maxPoints}</span>
                                                                )}
                                                            </div>
                                                            {category.requirement && (
                                                                <span className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                                    {category.requirement}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="scoring-option-actions">
                                                            <span className="scoring-option-value">
                                                                {used
                                                                    ? currentPlayer.scores[category.key]
                                                                    : categoryScore !== null && categoryScore !== undefined
                                                                        ? categoryScore
                                                                        : '-'}
                                                            </span>

                                                            {!used && scores && (
                                                                <button
                                                                    className={`btn btn-sm ${categoryScore > 0 ? 'btn-primary' : 'btn-ghost'}`}
                                                                    style={{ fontSize: '0.78rem' }}
                                                                    onClick={() => selectCategory(category.key, categoryScore)}
                                                                >
                                                                    {categoryScore > 0 ? 'Eintragen' : 'Streichen'}
                                                                </button>
                                                            )}

                                                            {!used && !scores && !selectedGame.gameDefinition?.supportsDiceInput && !isPhase10Bonus && !isLockedPhase10Step && (
                                                                <>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        className="edit-score-input"
                                                                        style={{ width: 82 }}
                                                                        value={manualValue}
                                                                        onChange={(event) => setManualValues((values) => ({ ...values, [category.key]: event.target.value }))}
                                                                        onKeyDown={(event) => event.key === 'Enter' && saveManualCategory(category.key)}
                                                                    />
                                                                    <button className="btn btn-primary btn-sm" onClick={() => saveManualCategory(category.key)}>
                                                                        Speichern
                                                                    </button>
                                                                </>
                                                            )}

                                                            {!used && isLockedPhase10Step && (
                                                                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                                    Erst nach {phase10NextCategory.replace('phase', 'Phase ')}
                                                                </span>
                                                            )}

                                                            {isPhase10Bonus && (
                                                                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                                    Automatisch
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="scoring-summary-row">
                                            <span>Summe {section.label}</span>
                                            <span className="scoring-summary-value">{currentPlayer.sectionTotals?.[section.id] ?? 0}</span>
                                        </div>

                                        {selectedGame.gameType === 'kniffel' && section.id === 'upper' && (
                                            <div className="scoring-summary-row">
                                                <span>Bonus (ab 63)</span>
                                                <span className="scoring-summary-value">{currentPlayer.bonus > 0 ? `+${currentPlayer.bonus}` : '-'}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <div className="scoring-total-row">
                                    <span>Gesamt</span>
                                    <span className="scoring-total-value">{currentPlayer.total ?? 0}</span>
                                </div>
                            </div>

                            {selectedGame.players.length > 1 && (
                                <div className="card mt-lg">
                                    <h3 className="card-title mb-md">Übersicht</h3>
                                    <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
                                        {selectedGame.players.map((player, idx) => (
                                            <div
                                                key={player.id}
                                                style={{
                                                    padding: '12px 20px',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: idx === currentPlayerIdx ? 'var(--color-primary-light)' : 'var(--color-bg)',
                                                    border: idx === currentPlayerIdx ? '2px solid var(--color-primary)' : '2px solid transparent',
                                                    minWidth: 120,
                                                    textAlign: 'center'
                                                }}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{player.name}</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)' }}>{player.total ?? 0}</div>
                                                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                    {categoryKeys.filter((category) => player.scores[category] !== undefined && player.scores[category] !== null).length}/{categoryKeys.length}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
