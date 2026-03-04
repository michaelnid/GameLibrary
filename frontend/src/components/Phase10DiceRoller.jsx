import { useState, useEffect, useRef } from 'react';

const P10_COLORS = {
    blue: '#3b82f6',
    red: '#ef4444',
    orange: '#f59e0b',
    green: '#22c55e'
};

function getDieSortValue(die) {
    if (die.isWild) return 999; // Wildcards ans Ende
    return die.value;
}

export default function Phase10DiceRoller({ dice, held, rollsLeft, isMyTurn, onRoll, onToggleHold, disabled }) {
    const [rolling, setRolling] = useState(false);
    const prevRollsLeft = useRef(rollsLeft);

    // Trigger animation when rollsLeft decreases (= a roll happened)
    useEffect(() => {
        if (rollsLeft < prevRollsLeft.current) {
            setRolling(true);
            const timer = setTimeout(() => setRolling(false), 450);
            return () => clearTimeout(timer);
        }
        prevRollsLeft.current = rollsLeft;
    }, [rollsLeft]);

    // Also update ref when rollsLeft increases (new turn)
    useEffect(() => {
        prevRollsLeft.current = rollsLeft;
    }, [rollsLeft]);

    if (!dice || dice.length !== 10) return null;

    const canHold = isMyTurn && rollsLeft < 3 && !disabled;

    // Held dice sorted by value for the bottom row
    const indexedDice = dice.map((die, index) => ({ die, index }));
    const heldDice = indexedDice
        .filter(d => held[d.index])
        .sort((a, b) => getDieSortValue(a.die) - getDieSortValue(b.die));

    const renderDie = ({ die, index }, isGhost = false) => {
        const isHeld = held[index];
        const isWild = die.isWild;
        const dieValue = die.value;
        const dieColor = die.color ? P10_COLORS[die.color] || '#94a3b8' : '#94a3b8';
        const isEmpty = dieValue === 0 && !isWild;
        const isRolling = rolling && !isHeld && !isEmpty;

        // Ghost slot: held dice shown as faded placeholder in top grid
        if (isGhost) {
            return (
                <div
                    key={index}
                    className={`p10-die p10-die-ghost ${canHold ? 'p10-die-clickable' : ''}`}
                    onClick={() => canHold && onToggleHold(index)}
                />
            );
        }

        return (
            <div
                key={index}
                className={`p10-die ${isHeld ? 'p10-die-held' : ''} ${canHold ? 'p10-die-clickable' : ''} ${index < 4 ? 'p10-die-low' : 'p10-die-high'} ${isEmpty ? 'p10-die-empty' : ''} ${isRolling ? 'p10-die-rolling' : ''}`}
                onClick={() => canHold && !isEmpty && onToggleHold(index)}
                style={!isEmpty ? { '--die-color': dieColor, '--roll-delay': `${index * 30}ms` } : { '--roll-delay': `${index * 30}ms` }}
            >
                {isEmpty ? (
                    <span className="p10-die-placeholder">?</span>
                ) : isWild ? (
                    <span className="p10-die-wild" style={{ color: dieColor }}>{dieValue > 0 ? dieValue : 'W'}</span>
                ) : (
                    <span className="p10-die-value" style={{ color: dieColor }}>{dieValue}</span>
                )}
                {isHeld && <span className="p10-die-lock">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                        <path d="M4 7V5a4 4 0 118 0v2h1a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1h1zm2-2a2 2 0 114 0v2H6V5z" />
                    </svg>
                </span>}
            </div>
        );
    };

    return (
        <div className="p10-dice-area">
            {/* Obere Zeile: Alle 10 Wuerfel an fester Position, gehaltene als Ghost */}
            <div className="p10-dice-grid">
                {indexedDice.map(d => held[d.index] ? renderDie(d, true) : renderDie(d))}
            </div>

            {/* Untere Zeile: Ausgewaehlte Wuerfel (sortiert nach Wert) */}
            {heldDice.length > 0 && (
                <div className="p10-dice-held-section">
                    <div className="p10-held-separator">
                        <span className="p10-held-label">Ausgewaehlt ({heldDice.length})</span>
                    </div>
                    <div className="p10-dice-held-grid">
                        {heldDice.map(d => renderDie(d))}
                    </div>
                </div>
            )}

            <div className="p10-dice-controls">
                <button
                    className="btn btn-primary btn-lg p10-roll-btn"
                    onClick={onRoll}
                    disabled={!isMyTurn || rollsLeft <= 0 || disabled || rolling}
                >
                    {rollsLeft === 3 ? 'Wuerfeln' : `Nochmal (${rollsLeft} uebrig)`}
                </button>
                <div className="p10-dice-legend">
                    <span className="p10-legend-item p10-legend-low">
                        <span className="p10-legend-dot"></span> 1-4 + Joker
                    </span>
                    <span className="p10-legend-item p10-legend-high">
                        <span className="p10-legend-dot"></span> 5-10
                    </span>
                </div>
            </div>
        </div>
    );
}
