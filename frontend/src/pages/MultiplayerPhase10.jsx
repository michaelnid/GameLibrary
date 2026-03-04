import Phase10DiceRoller from '../components/Phase10DiceRoller';

const PHASE_LABELS = {
    phase1: { label: 'Phase 1', req: '2 Drillinge' },
    phase2: { label: 'Phase 2', req: '1 Drilling + 1 Viererfolge' },
    phase3: { label: 'Phase 3', req: '1 Vierling + 1 Viererfolge' },
    phase4: { label: 'Phase 4', req: '1 Siebenerfolge' },
    phase5: { label: 'Phase 5', req: '1 Achterfolge' },
    phase6: { label: 'Phase 6', req: '1 Neunerfolge' },
    phase7: { label: 'Phase 7', req: '2 Vierlinge' },
    phase8: { label: 'Phase 8', req: '7 gleiche Farbe' },
    phase9: { label: 'Phase 9', req: '1 Fuenfling + 1 Zwilling' },
    phase10: { label: 'Phase 10', req: '1 Fuenfling + 1 Drilling' }
};

const PHASES_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6', 'phase7', 'phase8', 'phase9', 'phase10'];

function getP10Total(scores) {
    let total = 0;
    for (const key of PHASES_ORDER) {
        if (typeof scores[key] === 'number') total += scores[key];
    }
    if (typeof scores.bonusThreshold === 'number') total += scores.bonusThreshold;
    if (typeof scores.bonusFinisher === 'number') total += scores.bonusFinisher;
    return total;
}

export default function MultiplayerPhase10({
    room, user, isMyTurn, myPlayer, diceState, error,
    onRoll, onToggleHold, onScore, onLeave,
    submitting, phaseResult
}) {
    const currentTurnPlayer = room.players.find(p => p.userId === room.currentTurnUserId);
    const myCurrentPhase = myPlayer?.currentPhase || 1;
    const myPhaseKey = myCurrentPhase <= 10 ? `phase${myCurrentPhase}` : null;
    const phaseInfo = myPhaseKey ? PHASE_LABELS[myPhaseKey] : null;
    const hasRolled = diceState && diceState.rollsLeft < 3;
    const myAttempt = myPlayer?.phaseAttempt || 1;

    // COMPLETED
    if (room.status === 'completed') {
        const sorted = [...room.players].sort((a, b) => getP10Total(b.scores || {}) - getP10Total(a.scores || {}));
        const winner = sorted[0];

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
                    <p className="mp-winner-score">{getP10Total(winner.scores || {})} Punkte</p>
                </div>
                <div className="mp-final-standings">
                    <h3>Endergebnis</h3>
                    <div className="mp-standings-list">
                        {sorted.map((p, idx) => (
                            <div key={p.userId} className={`mp-standing-item ${idx === 0 ? 'mp-standing-winner' : ''}`}>
                                <span className="mp-standing-rank">#{idx + 1}</span>
                                <span className="mp-standing-name">{p.displayName}</span>
                                <span className="mp-standing-score">{getP10Total(p.scores || {})}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <button className="btn btn-primary btn-lg" onClick={onLeave}>
                    Zurueck zur Lobby
                </button>
            </div>
        );
    }

    // PLAYING
    return (
        <div className="mp-game mp-playing p10-game">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">Phase 10</h1>
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

            {/* Current Phase Info + Attempt */}
            {isMyTurn && phaseInfo && (
                <div className="p10-current-phase">
                    <div className="p10-phase-badge">
                        <span className="p10-phase-number">{phaseInfo.label}</span>
                        <span className="p10-phase-req">{phaseInfo.req}</span>
                        <span className="p10-attempt-badge">
                            Versuch {myAttempt}/2
                        </span>
                    </div>
                </div>
            )}

            {/* Dice Roller */}
            <Phase10DiceRoller
                dice={diceState?.dice || []}
                held={diceState?.held || new Array(10).fill(false)}
                rollsLeft={diceState?.rollsLeft ?? 3}
                isMyTurn={isMyTurn}
                onRoll={onRoll}
                onToggleHold={onToggleHold}
                disabled={submitting}
            />

            {/* Phase Result & Action Buttons */}
            {isMyTurn && hasRolled && (
                <div className="p10-phase-result">
                    {phaseResult?.valid ? (
                        <div className="p10-result-success">
                            <span className="p10-result-icon">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            </span>
                            <span className="p10-result-text">Phase geschafft! {phaseResult.score} Punkte</span>
                            <div className="p10-result-actions">
                                <button
                                    className="btn btn-success btn-lg"
                                    onClick={() => onScore('submit')}
                                    disabled={submitting}
                                >
                                    Eintragen
                                </button>
                                {myAttempt === 1 && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => onScore('skip')}
                                        disabled={submitting}
                                    >
                                        Weiter (nochmal versuchen)
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p10-result-fail">
                            <span className="p10-result-icon">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </span>
                            <span className="p10-result-text">Phase nicht geschafft</span>
                            <div className="p10-result-actions">
                                {myAttempt === 1 ? (
                                    <>
                                        <button
                                            className="btn btn-primary btn-lg"
                                            onClick={() => onScore('skip')}
                                            disabled={submitting}
                                        >
                                            Weiter (2. Versuch)
                                        </button>
                                        {diceState?.rollsLeft === 0 && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => onScore('submit')}
                                                disabled={submitting}
                                            >
                                                Streichen (0 Punkte)
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        className="btn btn-ghost btn-lg"
                                        onClick={() => onScore('submit')}
                                        disabled={submitting}
                                    >
                                        Streichen (0 Punkte)
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Scoreboard */}
            <div className="mp-scoreboard-wrapper p10-scoreboard-wrapper">
                <div className="table-wrapper">
                    <table className="scoreboard mp-scoreboard p10-scoreboard">
                        <thead>
                            <tr>
                                <th>Phase</th>
                                <th className="p10-req-col">Anforderung</th>
                                {room.players.map(p => (
                                    <th key={p.userId} className={p.userId === room.currentTurnUserId ? 'mp-col-active' : ''}>
                                        {p.displayName}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PHASES_ORDER.map((phaseKey, idx) => {
                                const info = PHASE_LABELS[phaseKey];
                                const phaseNum = idx + 1;
                                return (
                                    <tr key={phaseKey}>
                                        <td className="p10-phase-label">{info.label}</td>
                                        <td className="p10-phase-req-cell">{info.req}</td>
                                        {room.players.map(p => {
                                            const score = p.scores?.[phaseKey];
                                            const isCurrent = (p.currentPhase || 1) === phaseNum;
                                            const filled = score !== undefined && score !== null;
                                            return (
                                                <td key={p.userId} className={`score-cell ${isCurrent ? 'p10-phase-current' : ''} ${filled ? 'p10-phase-done' : ''}`}>
                                                    {filled ? score : isCurrent ? (
                                                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <polygon points="8,2 10,6 14,7 11,10 12,14 8,12 4,14 5,10 2,7 6,6" />
                                                        </svg>
                                                    ) : '–'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                            {/* Bonus: Threshold */}
                            <tr className="bonus-row">
                                <td colSpan="2" className="p10-bonus-label">&gt;= 221 nach Phase 5 &rarr; +40</td>
                                {room.players.map(p => (
                                    <td key={p.userId} className="score-cell">
                                        {p.scores?.bonusThreshold || '–'}
                                    </td>
                                ))}
                            </tr>
                            {/* Bonus: First Finisher */}
                            <tr className="bonus-row">
                                <td colSpan="2" className="p10-bonus-label">Erster fertig &rarr; +40</td>
                                {room.players.map(p => (
                                    <td key={p.userId} className="score-cell">
                                        {p.scores?.bonusFinisher || '–'}
                                    </td>
                                ))}
                            </tr>
                            {/* Total */}
                            <tr className="total-row">
                                <td colSpan="2">Gesamt</td>
                                {room.players.map(p => (
                                    <td key={p.userId}>{getP10Total(p.scores || {})}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Player Phase Indicators */}
            <div className="p10-player-phases">
                {room.players.map(p => (
                    <div key={p.userId} className={`p10-player-phase-item ${p.userId === room.currentTurnUserId ? 'p10-player-active' : ''}`}>
                        <span className="p10-player-name">{p.displayName}</span>
                        <span className="p10-player-current">
                            {(p.currentPhase || 1) > 10 ? 'Fertig' : `Phase ${p.currentPhase || 1}`}
                        </span>
                        {(p.currentPhase || 1) <= 10 && (
                            <span className="p10-player-attempt">Versuch {p.phaseAttempt || 1}/2</span>
                        )}
                    </div>
                ))}
            </div>

            <div className="mp-game-actions">
                <button className="btn btn-ghost btn-sm" onClick={onLeave}>Spiel verlassen</button>
            </div>
        </div>
    );
}
