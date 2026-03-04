function resolveBoard(state) {
    const board = Array.isArray(state?.board) && state.board.length === 9 ? state.board : new Array(9).fill(null);
    return board.map((cell) => (cell === 'X' || cell === 'O' ? cell : null));
}

function resolveMarks(state) {
    if (state?.marks && typeof state.marks === 'object') return state.marks;
    return {};
}

function resolveMoveHistory(state) {
    const mh = state?.moveHistory;
    if (mh && typeof mh === 'object') {
        return {
            X: Array.isArray(mh.X) ? mh.X : [],
            O: Array.isArray(mh.O) ? mh.O : []
        };
    }
    return { X: [], O: [] };
}

function resolveRematchVotes(state) {
    if (!Array.isArray(state?.rematchVotes)) return [];
    return Array.from(new Set(
        state.rematchVotes
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value) && value > 0)
    ));
}

function symbolColor(symbol) {
    if (symbol === 'X') return '#ff4d6d';
    if (symbol === 'O') return '#22d3ee';
    return 'var(--color-text)';
}

function symbolGlow(symbol) {
    const color = symbolColor(symbol);
    if (symbol === 'X') return `0 0 10px ${color}, 0 0 22px ${color}cc, 0 0 44px ${color}99`;
    if (symbol === 'O') return `0 0 10px ${color}, 0 0 24px ${color}dd, 0 0 50px ${color}aa`;
    return 'none';
}

const MAX_CHIPS = 3;

export default function MultiplayerTicTacToeVanish({
    room,
    user,
    isMyTurn,
    error,
    submitting,
    onMove,
    onRematch,
    onLeave
}) {
    const state = room?.diceState || {};
    const board = resolveBoard(state);
    const marks = resolveMarks(state);
    const myMark = marks[String(user?.id)] || '?';
    const moveHistory = resolveMoveHistory(state);
    const lastVanished = typeof state.lastVanished === 'number' ? state.lastVanished : null;

    const winnerUserId = state.winnerUserId || null;
    const winningLine = Array.isArray(state.winningLine) ? state.winningLine : [];
    const winningSet = new Set(winningLine);
    const rematchVotes = resolveRematchVotes(state);
    const rematchReadyCount = rematchVotes.length;
    const meReadyForRematch = rematchVotes.includes(user?.id);

    const winnerPlayer = winnerUserId
        ? room.players.find((p) => p.userId === winnerUserId)
        : null;
    const currentTurnPlayer = room.players.find((p) => p.userId === room.currentTurnUserId);

    // My chips count
    const myChipCount = moveHistory[myMark]?.length || 0;
    // If I have 3 chips and it's my turn, the oldest will vanish on next move
    const myOldest = (isMyTurn && myChipCount >= MAX_CHIPS && moveHistory[myMark].length > 0)
        ? moveHistory[myMark][0]
        : null;

    return (
        <div className="mp-game mp-playing">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">TicTacToe Vanish</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {room.status === 'completed'
                        ? (
                            <span className="mp-turn-badge mp-turn-other">
                                Gewinner: {winnerPlayer?.displayName || 'Unbekannt'}
                            </span>
                        )
                        : isMyTurn
                            ? <span className="mp-turn-badge mp-turn-mine">Du bist dran! <span style={{ color: symbolColor(myMark), fontWeight: 800 }}>({myMark})</span></span>
                            : <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>}
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            {/* Vanish rule hint */}
            <div className="text-muted" style={{ textAlign: 'center', marginBottom: 8, fontSize: '0.85rem' }}>
                Max. 3 Chips pro Spieler – der aelteste verschwindet!
                {myOldest !== null && isMyTurn && room.status !== 'completed' && (
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}> ⚡ Dein naechster Zug entfernt ein Symbol!</span>
                )}
            </div>

            <div className="card" style={{ maxWidth: 420, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {board.map((cell, index) => {
                        const isWinning = winningSet.has(index);
                        const canPlay = room.status !== 'completed' && isMyTurn && !cell && !submitting;
                        const isVanishCandidate = myOldest === index;
                        const justVanished = lastVanished === index && !cell;
                        return (
                            <button
                                key={index}
                                type="button"
                                onClick={() => canPlay && onMove(index)}
                                disabled={!canPlay}
                                className={`btn ${justVanished ? 'tttv-vanished' : ''}`}
                                style={{
                                    height: 110,
                                    fontSize: '3.2rem',
                                    fontWeight: 800,
                                    border: isWinning
                                        ? '2px solid var(--color-success)'
                                        : isVanishCandidate
                                            ? '2px dashed #f59e0b'
                                            : '1px solid var(--color-border)',
                                    background: isWinning
                                        ? 'rgba(16,185,129,0.12)'
                                        : isVanishCandidate
                                            ? 'rgba(245,158,11,0.08)'
                                            : 'var(--color-surface-muted)',
                                    cursor: canPlay ? 'pointer' : 'default',
                                    position: 'relative'
                                }}
                            >
                                <span style={{
                                    color: symbolColor(cell),
                                    textShadow: cell ? symbolGlow(cell) : 'none',
                                    filter: cell ? 'saturate(1.35) brightness(1.15)' : 'none',
                                    lineHeight: 1,
                                    opacity: isVanishCandidate ? 0.45 : 1,
                                    transition: 'opacity 0.3s ease'
                                }}>
                                    {cell || ''}
                                </span>
                                {isVanishCandidate && (
                                    <span style={{
                                        position: 'absolute', bottom: 4, right: 6,
                                        fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600
                                    }}>⚡</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    {room.players.map((p) => {
                        const mark = marks[String(p.userId)] || '?';
                        const chipCount = moveHistory[mark]?.length || 0;
                        const result = p.scores?.result || null;
                        const points = typeof p.scores?.points === 'number' ? p.scores.points : null;
                        return (
                            <div key={p.userId} className="flex-between" style={{ alignItems: 'center' }}>
                                <div>
                                    <strong>{p.displayName}</strong>{' '}
                                    <span style={{ color: symbolColor(mark), fontWeight: 700 }}>({mark})</span>
                                    <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                                        {chipCount}/{MAX_CHIPS} Chips
                                    </span>
                                </div>
                                <div className="text-muted">
                                    {result ? `${result} · ${points ?? 0} Punkte` : 'laeuft'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {room.status === 'completed' && (
                <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                    <div className="flex-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div className="text-muted">
                            Rematch bereit: {rematchReadyCount}/{room.players.length}
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={onRematch}
                            disabled={submitting || meReadyForRematch}
                        >
                            {meReadyForRematch ? 'Warte auf Gegner...' : 'Nochmal spielen'}
                        </button>
                    </div>
                </div>
            )}

            <div className="mp-game-actions">
                <button className="btn btn-ghost btn-sm" onClick={onLeave}>Spiel verlassen</button>
            </div>
        </div>
    );
}
