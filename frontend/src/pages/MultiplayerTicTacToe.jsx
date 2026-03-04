function resolveBoard(state) {
    const board = Array.isArray(state?.board) && state.board.length === 9 ? state.board : new Array(9).fill(null);
    return board.map((cell) => (cell === 'X' || cell === 'O' ? cell : null));
}

function resolveMarks(state) {
    if (state?.marks && typeof state.marks === 'object') {
        return state.marks;
    }
    return {};
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
    if (symbol === 'X') {
        return `0 0 10px ${color}, 0 0 22px ${color}cc, 0 0 44px ${color}99`;
    }
    if (symbol === 'O') {
        return `0 0 10px ${color}, 0 0 24px ${color}dd, 0 0 50px ${color}aa`;
    }
    return 'none';
}

export default function MultiplayerTicTacToe({
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

    const winnerUserId = state.winnerUserId || null;
    const draw = Boolean(state.draw);
    const winningLine = Array.isArray(state.winningLine) ? state.winningLine : [];
    const winningSet = new Set(winningLine);
    const rematchVotes = resolveRematchVotes(state);
    const rematchReadyCount = rematchVotes.length;
    const meReadyForRematch = rematchVotes.includes(user?.id);

    const winnerPlayer = winnerUserId
        ? room.players.find((p) => p.userId === winnerUserId)
        : null;
    const currentTurnPlayer = room.players.find((p) => p.userId === room.currentTurnUserId);

    return (
        <div className="mp-game mp-playing">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">TicTacToe</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {room.status === 'completed'
                        ? (
                            <span className="mp-turn-badge mp-turn-other">
                                {draw ? 'Unentschieden' : `Gewinner: ${winnerPlayer?.displayName || 'Unbekannt'}`}
                            </span>
                        )
                        : isMyTurn
                            ? <span className="mp-turn-badge mp-turn-mine">Du bist dran! <span style={{ color: symbolColor(myMark), fontWeight: 800 }}>({myMark})</span></span>
                            : <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>}
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            <div className="card" style={{ maxWidth: 420, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {board.map((cell, index) => {
                        const isWinning = winningSet.has(index);
                        const canPlay = room.status !== 'completed' && isMyTurn && !cell && !submitting;
                        return (
                            <button
                                key={index}
                                type="button"
                                onClick={() => canPlay && onMove(index)}
                                disabled={!canPlay}
                                className="btn"
                                style={{
                                    height: 110,
                                    fontSize: '3.2rem',
                                    fontWeight: 800,
                                    border: isWinning ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                                    background: isWinning ? 'rgba(16,185,129,0.12)' : 'var(--color-surface-muted)',
                                    cursor: canPlay ? 'pointer' : 'default'
                                }}
                            >
                                <span style={{
                                    color: symbolColor(cell),
                                    textShadow: cell ? symbolGlow(cell) : 'none',
                                    filter: cell ? 'saturate(1.35) brightness(1.15)' : 'none',
                                    lineHeight: 1
                                }}>
                                    {cell || ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    {room.players.map((p) => {
                        const mark = marks[String(p.userId)] || '?';
                        const result = p.scores?.result || null;
                        const points = typeof p.scores?.points === 'number' ? p.scores.points : null;
                        return (
                            <div key={p.userId} className="flex-between" style={{ alignItems: 'center' }}>
                                <div>
                                    <strong>{p.displayName}</strong>{' '}
                                    <span style={{ color: symbolColor(mark), fontWeight: 700 }}>({mark})</span>
                                </div>
                                <div className="text-muted">
                                    {result ? `${result} · ${points ?? 0} Punkte` : 'läuft'}
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
