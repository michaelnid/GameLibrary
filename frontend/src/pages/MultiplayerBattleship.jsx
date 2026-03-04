import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

const BS_SIZE = 10;
const SHIP_DEFS = [
    { id: 'carrier', name: 'Schlachtschiff', size: 5 },
    { id: 'cruiser', name: 'Kreuzer', size: 4 },
    { id: 'destroyer', name: 'Zerstoerer', size: 3 },
    { id: 'submarine', name: 'U-Boot', size: 3 },
    { id: 'patrol', name: 'Patrouillenboot', size: 2 }
];

const SHIP_COLORS = {
    carrier: { bg: 'rgba(59, 130, 246, 0.4)', border: 'rgba(59, 130, 246, 0.7)', solid: '#3b82f6' },
    cruiser: { bg: 'rgba(168, 85, 247, 0.4)', border: 'rgba(168, 85, 247, 0.7)', solid: '#a855f7' },
    destroyer: { bg: 'rgba(34, 197, 94, 0.4)', border: 'rgba(34, 197, 94, 0.7)', solid: '#22c55e' },
    submarine: { bg: 'rgba(245, 158, 11, 0.4)', border: 'rgba(245, 158, 11, 0.7)', solid: '#f59e0b' },
    patrol: { bg: 'rgba(236, 72, 153, 0.4)', border: 'rgba(236, 72, 153, 0.7)', solid: '#ec4899' }
};
const BS_COL_LABELS = Array.from({ length: BS_SIZE }, (_, i) => String.fromCharCode(65 + i));
const BS_ROW_LABELS = Array.from({ length: BS_SIZE }, (_, i) => i + 1);

function cellKey(r, c) { return `${r},${c}`; }

function getShipCells(startRow, startCol, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
        cells.push({
            row: horizontal ? startRow : startRow + i,
            col: horizontal ? startCol + i : startCol
        });
    }
    return cells;
}

function isValidPlacement(cells, placedShips, excludeId) {
    for (const cell of cells) {
        if (cell.row < 0 || cell.row >= BS_SIZE || cell.col < 0 || cell.col >= BS_SIZE) return false;
    }
    const newKeys = new Set(cells.map(c => cellKey(c.row, c.col)));
    for (const ship of placedShips) {
        if (ship.id === excludeId) continue;
        for (const c of ship.cells) {
            if (newKeys.has(cellKey(c.row, c.col))) return false;
        }
    }
    return true;
}

function randomPlaceAll() {
    const ships = [];
    for (const def of SHIP_DEFS) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 500) {
            const horizontal = Math.random() > 0.5;
            const maxRow = horizontal ? BS_SIZE : BS_SIZE - def.size;
            const maxCol = horizontal ? BS_SIZE - def.size : BS_SIZE;
            const row = Math.floor(Math.random() * maxRow);
            const col = Math.floor(Math.random() * maxCol);
            const cells = getShipCells(row, col, def.size, horizontal);
            if (isValidPlacement(cells, ships, null)) {
                ships.push({ id: def.id, cells });
                placed = true;
            }
            attempts++;
        }
    }
    return ships.length === SHIP_DEFS.length ? ships : null;
}

function resolveRematchVotes(state) {
    if (!Array.isArray(state?.rematchVotes)) return [];
    return Array.from(new Set(
        state.rematchVotes
            .map(v => Number.parseInt(v, 10))
            .filter(v => Number.isInteger(v) && v > 0)
    ));
}

// ── Placement Phase Component ──
function PlacementPhase({ user, room, onPlaceShips, error, submitting, placementReady }) {
    const [placedShips, setPlacedShips] = useState([]);
    const [selectedShipId, setSelectedShipId] = useState(SHIP_DEFS[0].id);
    const [hoverCells, setHoverCells] = useState([]);
    const [hoverValid, setHoverValid] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [dragging, setDragging] = useState(null); // { shipId, offsetRow, offsetCol }
    const boardRef = useRef(null);
    const mouseDownInfo = useRef(null);
    const hoverCellsRef = useRef([]);
    const hoverValidRef = useRef(false);

    const selectedDef = SHIP_DEFS.find(d => d.id === selectedShipId);
    const alreadyPlaced = placedShips.find(s => s.id === selectedShipId);
    const allPlaced = placedShips.length === SHIP_DEFS.length;

    // Fetch true server state on mount and restore or auto-random
    const initialLoadDone = useRef(false);
    useEffect(() => {
        if (initialLoadDone.current) return;
        initialLoadDone.current = true;
        (async () => {
            try {
                const res = await api.get(`/multiplayer/rooms/${room.code}`);
                const serverRoom = res.data;
                const myKey = String(user?.id);
                const myBoard = serverRoom?.diceState?.boards?.[myKey];
                if (myBoard?.ships?.length > 0) {
                    // Server has saved ships → restore
                    setPlacedShips(myBoard.ships.map(s => ({ id: s.id, cells: s.cells })));
                    return;
                }
            } catch (e) {
                // Fetch failed, fall through to random
            }
            // No draft on server → auto-random + save immediately
            const ships = randomPlaceAll();
            if (ships) {
                setPlacedShips(ships);
                api.post(`/multiplayer/rooms/${room.code}/draft-ships`, { ships }).catch(() => { });
            }
        })();
    }, []);

    // Debounced auto-save draft ships on user edits
    useEffect(() => {
        if (!initialLoadDone.current || submitted || placedShips.length === 0) return;
        const timer = setTimeout(() => {
            api.post(`/multiplayer/rooms/${room.code}/draft-ships`, { ships: placedShips }).catch(() => { });
        }, 500);
        return () => clearTimeout(timer);
    }, [placedShips, submitted, room?.code]);

    useEffect(() => {
        if (placementReady?.includes(user?.id)) {
            setSubmitted(true);
        }
    }, [placementReady, user?.id]);

    // Keep refs in sync with state for global handlers
    useEffect(() => { hoverCellsRef.current = hoverCells; }, [hoverCells]);
    useEffect(() => { hoverValidRef.current = hoverValid; }, [hoverValid]);

    // Build maps for coloring
    const cellToShipId = new Map();
    for (const ship of placedShips) {
        for (const c of ship.cells) cellToShipId.set(cellKey(c.row, c.col), ship.id);
    }

    const occupiedSet = new Set();
    for (const ship of placedShips) {
        for (const c of ship.cells) occupiedSet.add(cellKey(c.row, c.col));
    }

    // Detect overlapping cells between ships
    const overlapCells = new Set();
    const cellCountMap = new Map();
    for (const ship of placedShips) {
        for (const c of ship.cells) {
            const key = cellKey(c.row, c.col);
            cellCountMap.set(key, (cellCountMap.get(key) || 0) + 1);
        }
    }
    for (const [key, count] of cellCountMap) {
        if (count > 1) overlapCells.add(key);
    }
    // Check out-of-bounds ships
    const outOfBoundsCells = new Set();
    for (const ship of placedShips) {
        for (const c of ship.cells) {
            if (c.row < 0 || c.row >= BS_SIZE || c.col < 0 || c.col >= BS_SIZE) {
                outOfBoundsCells.add(cellKey(c.row, c.col));
            }
        }
    }
    const hasConflicts = overlapCells.size > 0 || outOfBoundsCells.size > 0;

    // Get cell position from touch/mouse coordinates
    const getCellFromPoint = useCallback((clientX, clientY) => {
        if (!boardRef.current) return null;
        const rect = boardRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        const col = Math.floor((x / rect.width) * BS_SIZE);
        const row = Math.floor((y / rect.height) * BS_SIZE);
        if (row < 0 || row >= BS_SIZE || col < 0 || col >= BS_SIZE) return null;
        return { row, col };
    }, []);

    // Rotate a placed ship (always executes, clamps to bounds)
    const rotateShip = useCallback((shipId) => {
        setPlacedShips(prev => prev.map(s => {
            if (s.id !== shipId) return s;
            const def = SHIP_DEFS.find(d => d.id === shipId);
            if (!def) return s;
            const isHoriz = s.cells.length > 1 && s.cells[0].row === s.cells[1].row;
            let startRow = s.cells[0].row;
            let startCol = s.cells[0].col;
            // Clamp to board boundaries after rotation
            if (isHoriz) {
                // Rotating to vertical: clamp row
                if (startRow + def.size > BS_SIZE) startRow = BS_SIZE - def.size;
            } else {
                // Rotating to horizontal: clamp col
                if (startCol + def.size > BS_SIZE) startCol = BS_SIZE - def.size;
            }
            const newCells = getShipCells(startRow, startCol, def.size, !isHoriz);
            return { ...s, cells: newCells };
        }));
    }, []);

    const handleCellHover = (row, col) => {
        if (submitted) { setHoverCells([]); return; }
        if (dragging) {
            const def = SHIP_DEFS.find(d => d.id === dragging.shipId);
            if (!def) return;
            const dragShip = placedShips.find(s => s.id === dragging.shipId);
            const isHoriz = dragShip ? (dragShip.cells[0].row === dragShip.cells[dragShip.cells.length - 1].row) : true;
            const startRow = row - dragging.offsetRow;
            const startCol = col - dragging.offsetCol;
            const cells = getShipCells(startRow, startCol, def.size, isHoriz);
            const valid = isValidPlacement(cells, placedShips, dragging.shipId);
            setHoverCells(cells);
            setHoverValid(valid);
            return;
        }
        if (!selectedDef || alreadyPlaced) { setHoverCells([]); return; }
        const cells = getShipCells(row, col, selectedDef.size, true);
        const valid = isValidPlacement(cells, placedShips, null);
        setHoverCells(cells);
        setHoverValid(valid);
    };

    const handleCellClick = (row, col) => {
        if (submitted) return;
        // Skip if mouse handled this interaction
        if (mouseDownInfo.current?.handled) { mouseDownInfo.current = null; return; }
        // Normal placement on empty cell
        if (!selectedDef || alreadyPlaced) return;
        const cells = getShipCells(row, col, selectedDef.size, true);
        if (!isValidPlacement(cells, placedShips, null)) return;
        const newShips = [...placedShips, { id: selectedDef.id, cells }];
        setPlacedShips(newShips);
        const nextUnplaced = SHIP_DEFS.find(d => !newShips.find(s => s.id === d.id));
        if (nextUnplaced) setSelectedShipId(nextUnplaced.id);
    };

    // Touch events
    const touchStartInfo = useRef(null);

    const handleTouchStart = useCallback((e) => {
        if (submitted) return;
        const touch = e.touches[0];
        const cell = getCellFromPoint(touch.clientX, touch.clientY);
        if (!cell) return;
        const clickedShipId = cellToShipId.get(cellKey(cell.row, cell.col));
        if (clickedShipId) {
            e.preventDefault();
            const ship = placedShips.find(s => s.id === clickedShipId);
            if (ship) {
                touchStartInfo.current = { shipId: clickedShipId, row: cell.row, col: cell.col, hasMoved: false };
                const offsetRow = cell.row - ship.cells[0].row;
                const offsetCol = cell.col - ship.cells[0].col;
                setDragging({ shipId: clickedShipId, offsetRow, offsetCol });
                setSelectedShipId(clickedShipId);
            }
        }
    }, [submitted, cellToShipId, placedShips, getCellFromPoint]);

    const handleTouchMove = useCallback((e) => {
        if (!touchStartInfo.current) return;
        e.preventDefault();
        const touch = e.touches[0];
        const cell = getCellFromPoint(touch.clientX, touch.clientY);
        if (!cell) { setHoverCells([]); return; }
        if (cell.row !== touchStartInfo.current.row || cell.col !== touchStartInfo.current.col) {
            touchStartInfo.current.hasMoved = true;
        }
        const shipId = touchStartInfo.current.shipId;
        const def = SHIP_DEFS.find(d => d.id === shipId);
        if (!def) return;
        const dragShip = placedShips.find(s => s.id === shipId);
        const isHoriz = dragShip ? (dragShip.cells[0].row === dragShip.cells[dragShip.cells.length - 1].row) : true;
        const offsetRow = touchStartInfo.current.row - (dragShip?.cells[0]?.row || 0);
        const offsetCol = touchStartInfo.current.col - (dragShip?.cells[0]?.col || 0);
        const startRow = cell.row - offsetRow;
        const startCol = cell.col - offsetCol;
        const cells = getShipCells(startRow, startCol, def.size, isHoriz);
        const valid = isValidPlacement(cells, placedShips, shipId);
        setHoverCells(cells);
        setHoverValid(valid);
    }, [getCellFromPoint, placedShips]);

    // Touch end is handled by global listener for reliability
    const handleTouchEnd = useCallback((e) => {
        e.preventDefault();
    }, []);

    // Mouse drag handlers
    const handleMouseDown = useCallback((e) => {
        if (submitted || e.button !== 0) return;
        const cell = getCellFromPoint(e.clientX, e.clientY);
        if (!cell) return;
        const clickedShipId = cellToShipId.get(cellKey(cell.row, cell.col));
        if (clickedShipId) {
            e.preventDefault();
            const ship = placedShips.find(s => s.id === clickedShipId);
            if (ship) {
                mouseDownInfo.current = {
                    shipId: clickedShipId,
                    row: cell.row,
                    col: cell.col,
                    offsetRow: cell.row - ship.cells[0].row,
                    offsetCol: cell.col - ship.cells[0].col,
                    hasMoved: false,
                    handled: false
                };
            }
        }
    }, [submitted, cellToShipId, placedShips, getCellFromPoint]);

    const handleMouseMove = useCallback((e) => {
        if (!mouseDownInfo.current) return;
        const cell = getCellFromPoint(e.clientX, e.clientY);
        if (!cell) return;
        // Only start drag if moved to a different cell
        if (cell.row !== mouseDownInfo.current.row || cell.col !== mouseDownInfo.current.col) {
            mouseDownInfo.current.hasMoved = true;
            if (!dragging) {
                setDragging({
                    shipId: mouseDownInfo.current.shipId,
                    offsetRow: mouseDownInfo.current.offsetRow,
                    offsetCol: mouseDownInfo.current.offsetCol
                });
            }
            // Update hover preview
            const def = SHIP_DEFS.find(d => d.id === mouseDownInfo.current.shipId);
            if (!def) return;
            const dragShip = placedShips.find(s => s.id === mouseDownInfo.current.shipId);
            const isHoriz = dragShip ? (dragShip.cells[0].row === dragShip.cells[dragShip.cells.length - 1].row) : true;
            const startRow = cell.row - mouseDownInfo.current.offsetRow;
            const startCol = cell.col - mouseDownInfo.current.offsetCol;
            const cells = getShipCells(startRow, startCol, def.size, isHoriz);
            const valid = isValidPlacement(cells, placedShips, mouseDownInfo.current.shipId);
            setHoverCells(cells);
            setHoverValid(valid);
        }
    }, [dragging, getCellFromPoint, placedShips]);

    const handleMouseUp = useCallback(() => {
        if (!mouseDownInfo.current) return;
        if (!mouseDownInfo.current.hasMoved) {
            // Click without move = rotate!
            rotateShip(mouseDownInfo.current.shipId);
            mouseDownInfo.current.handled = true;
        } else if (dragging && hoverCells.length > 0 && hoverValid) {
            // Drag drop
            setPlacedShips(prev => prev.map(s => s.id === dragging.shipId ? { ...s, cells: hoverCells } : s));
            mouseDownInfo.current.handled = true;
        } else {
            mouseDownInfo.current.handled = true;
        }
        setDragging(null);
        setHoverCells([]);
        setHoverValid(false);
        // Keep mouseDownInfo.current alive briefly so click handler can see .handled
        setTimeout(() => { mouseDownInfo.current = null; }, 0);
    }, [dragging, hoverCells, hoverValid, rotateShip]);

    // Global mouseup to cancel drag if mouse leaves board
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (!mouseDownInfo.current) return;
            if (mouseDownInfo.current.handled) {
                // Board handler already processed - don't touch (click handler still needs .handled)
                return;
            }
            // Mouse was released outside the board - handle here
            if (!mouseDownInfo.current.hasMoved) {
                rotateShip(mouseDownInfo.current.shipId);
            }
            setDragging(null);
            setHoverCells([]);
            setHoverValid(false);
            mouseDownInfo.current = null;
        };
        // Global touchend for rotation AND drag-drop
        const handleGlobalTouchEnd = () => {
            if (touchStartInfo.current) {
                if (!touchStartInfo.current.hasMoved) {
                    rotateShip(touchStartInfo.current.shipId);
                } else if (hoverCellsRef.current.length > 0 && hoverValidRef.current) {
                    const shipId = touchStartInfo.current.shipId;
                    const newCells = hoverCellsRef.current;
                    setPlacedShips(prev => prev.map(s => s.id === shipId ? { ...s, cells: newCells } : s));
                }
                setDragging(null);
                setHoverCells([]);
                setHoverValid(false);
                touchStartInfo.current = null;
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('touchend', handleGlobalTouchEnd);
        window.addEventListener('touchcancel', handleGlobalTouchEnd);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('touchend', handleGlobalTouchEnd);
            window.removeEventListener('touchcancel', handleGlobalTouchEnd);
        };
    }, [rotateShip]);

    const handleRemoveShip = (shipId) => {
        if (submitted) return;
        setPlacedShips(prev => prev.filter(s => s.id !== shipId));
        setSelectedShipId(shipId);
        setDragging(null);
    };

    const handleSubmit = () => {
        if (!allPlaced || submitted) return;
        setSubmitted(true);
        onPlaceShips(placedShips);
    };


    const handleRandomPlace = () => {
        if (submitted) return;
        const ships = randomPlaceAll();
        if (ships) {
            setPlacedShips(ships);
            setDragging(null);
            setHoverCells([]);
        }
    };

    const hoverSet = new Set(hoverCells.map(c => cellKey(c.row, c.col)));
    const activePreviewShipId = dragging ? dragging.shipId : selectedShipId;

    const myReady = submitted || (placementReady?.includes(user?.id));

    return (
        <div className="bs-placement bs-game">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">Schiffe Versenken</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    <span className="mp-turn-badge mp-turn-mine">Platziere deine Schiffe</span>
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            <div className="bs-placement-layout">
                <div className="bs-ship-list card">
                    <h3>Schiffe</h3>
                    {SHIP_DEFS.map(def => {
                        const isPlaced = placedShips.find(s => s.id === def.id);
                        const isSelected = selectedShipId === def.id && !isPlaced;
                        const isDraggingThis = dragging?.shipId === def.id;
                        return (
                            <div
                                key={def.id}
                                className={`bs-ship-item ${isSelected || isDraggingThis ? 'bs-ship-selected' : ''} ${isPlaced && !isDraggingThis ? 'bs-ship-placed' : ''}`}
                                onClick={() => {
                                    if (submitted) return;
                                    if (dragging) { setDragging(null); setHoverCells([]); return; }
                                    if (isPlaced) {
                                        handleRemoveShip(def.id);
                                    } else {
                                        setSelectedShipId(def.id);
                                    }
                                }}
                            >
                                <div className="bs-ship-item-info">
                                    <span className="bs-ship-name">{def.name}</span>
                                    <span className="bs-ship-size">{def.size} Felder</span>
                                </div>
                                <div className="bs-ship-preview">
                                    {Array.from({ length: def.size }).map((_, i) => (
                                        <div key={i} className={`bs-ship-block ${isPlaced ? 'bs-ship-block-placed' : ''}`}
                                            style={{ background: SHIP_COLORS[def.id]?.solid || 'var(--color-primary)' }} />
                                    ))}
                                </div>
                                {isPlaced && !submitted && (
                                    <button className="bs-ship-remove" onClick={(e) => { e.stopPropagation(); handleRemoveShip(def.id); }}>
                                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    <div className="bs-placement-btns">
                        <button className="btn btn-ghost btn-sm bs-random-btn" onClick={handleRandomPlace} disabled={submitted}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="4" />
                                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                                <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                            </svg>
                            Zufaellig
                        </button>
                    </div>
                </div>

                <div className="bs-board-container">
                    <div
                        className={`bs-board bs-board-own ${dragging ? 'bs-board-dragging' : ''}`}
                        ref={boardRef}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        {Array.from({ length: BS_SIZE }).map((_, row) => (
                            <div key={row} className="bs-row">
                                {Array.from({ length: BS_SIZE }).map((_, col) => {
                                    const key = cellKey(row, col);
                                    const hasShip = occupiedSet.has(key);
                                    const shipId = cellToShipId.get(key);
                                    const shipColor = shipId ? SHIP_COLORS[shipId] : null;
                                    const isHover = hoverSet.has(key);
                                    const isInvalidHover = isHover && !hoverValid;
                                    const isValidHover = isHover && hoverValid;
                                    const isDragSource = dragging && shipId === dragging.shipId;
                                    const isOverlap = overlapCells.has(key);
                                    const classes = [
                                        'bs-cell',
                                        hasShip && !isDragSource ? 'bs-cell-ship' : '',
                                        isDragSource ? 'bs-cell-drag-source' : '',
                                        hasShip && !dragging ? 'bs-cell-moveable' : '',
                                        isInvalidHover ? 'bs-cell-preview-invalid' : '',
                                        isOverlap ? 'bs-cell-overlap' : ''
                                    ].filter(Boolean).join(' ');
                                    let cellStyle;
                                    if (isOverlap && hasShip) {
                                        cellStyle = { background: 'rgba(239, 68, 68, 0.35)', borderColor: 'rgba(239, 68, 68, 0.7)' };
                                    } else if (isDragSource) {
                                        cellStyle = shipColor ? { background: shipColor.bg, borderColor: shipColor.border, opacity: 0.3 } : undefined;
                                    } else if (hasShip && shipColor) {
                                        cellStyle = { background: shipColor.bg, borderColor: shipColor.border };
                                    } else if (isValidHover && activePreviewShipId) {
                                        const previewColor = SHIP_COLORS[activePreviewShipId];
                                        if (previewColor) {
                                            cellStyle = { background: previewColor.bg, borderColor: previewColor.border };
                                        }
                                    }
                                    return (
                                        <div
                                            key={key}
                                            className={classes}
                                            style={cellStyle}
                                            onClick={() => handleCellClick(row, col)}
                                            onMouseEnter={() => handleCellHover(row, col)}
                                            onMouseLeave={() => { if (!dragging) { setHoverCells([]); setHoverValid(false); } }}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bs-placement-actions">
                {myReady ? (
                    <div className="bs-waiting-badge">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        Warte auf Gegner...
                    </div>
                ) : (
                    <button className="btn btn-success btn-lg" onClick={handleSubmit} disabled={!allPlaced || submitting || hasConflicts}>
                        {hasConflicts ? 'Konflikte beheben!' : allPlaced ? 'Schiffe bestaetigen' : `Noch ${SHIP_DEFS.length - placedShips.length} Schiffe platzieren`}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Attack Phase Component ──
function AttackPhase({ room, user, isMyTurn, error, submitting, onMove, onRematch, onLeave }) {
    const VIEW_SWITCH_DELAY_MS = 2000;
    const VIEW_SWITCH_DELAY_SECONDS = 2;

    const state = room?.diceState || {};
    const boards = state.boards || {};
    const myKey = String(user?.id);
    const opponentKey = Object.keys(boards).find(k => k !== myKey) || '';
    const myBoard = boards[myKey] || { ships: [], attacks: [] };
    const opponentBoard = boards[opponentKey] || { ships: [], attacks: [] };

    const winnerUserId = state.winnerUserId || null;
    const isCompleted = room.status === 'completed';
    const rematchVotes = resolveRematchVotes(state);
    const meReadyForRematch = rematchVotes.includes(user?.id);

    const winnerPlayer = winnerUserId ? room.players.find(p => p.userId === winnerUserId) : null;
    const currentTurnPlayer = room.players.find(p => p.userId === room.currentTurnUserId);
    const canAttack = !isCompleted && isMyTurn && !submitting;
    const targetViewMode = isCompleted ? 'both' : (isMyTurn ? 'opponent' : 'own');

    const [lastHit, setLastHit] = useState(null);
    const [sunkPopup, setSunkPopup] = useState(null);
    const [displayViewMode, setDisplayViewMode] = useState(targetViewMode);
    const [awaitingShotResult, setAwaitingShotResult] = useState(false);
    const [isDelayedSwitchActive, setIsDelayedSwitchActive] = useState(false);
    const [switchCountdown, setSwitchCountdown] = useState(0);
    const [recentOutgoingAttack, setRecentOutgoingAttack] = useState(null);
    const [recentIncomingAttack, setRecentIncomingAttack] = useState(null);
    const pendingAttackCountRef = useRef(0);
    const switchTimerRef = useRef(null);
    const countdownTimerRef = useRef(null);
    const outgoingAttackTimerRef = useRef(null);
    const incomingAttackTimerRef = useRef(null);
    const outgoingInitDoneRef = useRef(false);
    const incomingInitDoneRef = useRef(false);
    const prevOutgoingCountRef = useRef(0);
    const prevIncomingCountRef = useRef(0);
    const prevTargetViewModeRef = useRef(targetViewMode);

    const clearSwitchTimers = useCallback(() => {
        if (switchTimerRef.current) {
            clearTimeout(switchTimerRef.current);
            switchTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }, []);

    const startDelayedViewSwitch = useCallback((nextMode) => {
        clearSwitchTimers();
        setIsDelayedSwitchActive(true);
        setSwitchCountdown(VIEW_SWITCH_DELAY_SECONDS);
        countdownTimerRef.current = setInterval(() => {
            setSwitchCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        switchTimerRef.current = setTimeout(() => {
            setDisplayViewMode(nextMode);
            setIsDelayedSwitchActive(false);
            setSwitchCountdown(0);
            clearSwitchTimers();
        }, VIEW_SWITCH_DELAY_MS);
    }, [clearSwitchTimers]);

    const showOwnBoard = displayViewMode !== 'opponent';
    const showOpponentBoard = displayViewMode !== 'own';
    const showSingleBoard = displayViewMode !== 'both';
    const showTargetStatusCard = !isCompleted && showSingleBoard;

    // Build attack maps
    const myAttacksOnOpponent = new Map();
    for (const a of opponentBoard.attacks) {
        myAttacksOnOpponent.set(cellKey(a.row, a.col), a);
    }

    const opponentAttacksOnMe = new Map();
    for (const a of myBoard.attacks) {
        opponentAttacksOnMe.set(cellKey(a.row, a.col), a);
    }

    // Cell-to-shipId maps for coloring
    const myCellToShipId = new Map();
    for (const ship of myBoard.ships) {
        for (const c of ship.cells) myCellToShipId.set(cellKey(c.row, c.col), ship.id);
    }

    const opponentCellToShipId = new Map();
    for (const ship of opponentBoard.ships) {
        if (ship.hits?.every(Boolean)) {
            for (const c of ship.cells) opponentCellToShipId.set(cellKey(c.row, c.col), ship.id);
        }
    }

    // My ship cells
    const myShipCells = new Set();
    for (const ship of myBoard.ships) {
        for (const c of ship.cells) myShipCells.add(cellKey(c.row, c.col));
    }

    // Sunk opponent ships (visible) - defense-in-depth: only show truly sunk ships
    const opponentSunkCells = new Set();
    for (const ship of opponentBoard.ships) {
        if (ship.hits?.every(Boolean)) {
            for (const c of ship.cells) opponentSunkCells.add(cellKey(c.row, c.col));
        }
    }

    const statusBoard = displayViewMode === 'own' ? myBoard : opponentBoard;
    const statusTitle = displayViewMode === 'own' ? 'Deine Flotte' : 'Gegnerflotte';
    const statusShips = SHIP_DEFS
        .map(def => {
            const ship = statusBoard.ships.find(s => s.id === def.id);
            const hits = Array.isArray(ship?.hits) ? ship.hits : [];
            const hitCount = hits.filter(Boolean).length;
            const isSunk = hits.length > 0 && hitCount === hits.length;
            return { ...def, hitCount, isSunk };
        })
        .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
    const statusSunkCount = statusShips.filter(s => s.isSunk).length;

    // Detect newly sunk ships and show popup
    const prevSunkRef = useRef(new Set());
    useEffect(() => {
        const currentSunk = new Set(opponentBoard.ships.filter(s => s.hits?.every(Boolean)).map(s => s.id));
        for (const id of currentSunk) {
            if (!prevSunkRef.current.has(id)) {
                const def = SHIP_DEFS.find(d => d.id === id);
                if (def) {
                    setSunkPopup(def.name);
                    setTimeout(() => setSunkPopup(null), 2000);
                }
            }
        }
        prevSunkRef.current = currentSunk;
    }, [opponentBoard.ships]);

    // Completed game always shows both boards and clears pending turn switch timers.
    useEffect(() => {
        if (!isCompleted) return;
        clearSwitchTimers();
        setIsDelayedSwitchActive(false);
        setSwitchCountdown(0);
        setAwaitingShotResult(false);
        setDisplayViewMode('both');
    }, [isCompleted, clearSwitchTimers]);

    // Delay board-side switch for both players whenever turn ownership changes.
    useEffect(() => {
        if (isCompleted) {
            prevTargetViewModeRef.current = targetViewMode;
            return;
        }
        const prevMode = prevTargetViewModeRef.current;
        prevTargetViewModeRef.current = targetViewMode;
        if (prevMode === targetViewMode) return;
        startDelayedViewSwitch(targetViewMode);
    }, [isCompleted, targetViewMode, startDelayedViewSwitch]);

    // Wait until my shot result is visible before leaving "awaiting shot result" mode.
    useEffect(() => {
        if (!awaitingShotResult) return;
        if (opponentBoard.attacks.length < pendingAttackCountRef.current) return;

        setAwaitingShotResult(false);
    }, [awaitingShotResult, opponentBoard.attacks.length]);

    // Animate newly resolved outgoing attack (my shot on opponent board).
    useEffect(() => {
        const count = opponentBoard.attacks.length;
        if (!outgoingInitDoneRef.current) {
            outgoingInitDoneRef.current = true;
            prevOutgoingCountRef.current = count;
            return;
        }
        if (count > prevOutgoingCountRef.current) {
            const latest = opponentBoard.attacks[count - 1];
            if (latest) {
                setRecentOutgoingAttack({ row: latest.row, col: latest.col, result: latest.result });
                if (outgoingAttackTimerRef.current) clearTimeout(outgoingAttackTimerRef.current);
                outgoingAttackTimerRef.current = setTimeout(() => {
                    setRecentOutgoingAttack(null);
                    outgoingAttackTimerRef.current = null;
                }, 1200);
            }
        } else if (count < prevOutgoingCountRef.current) {
            setRecentOutgoingAttack(null);
        }
        prevOutgoingCountRef.current = count;
    }, [opponentBoard.attacks]);

    // Animate newly received incoming attack (opponent shot on my board).
    useEffect(() => {
        const count = myBoard.attacks.length;
        if (!incomingInitDoneRef.current) {
            incomingInitDoneRef.current = true;
            prevIncomingCountRef.current = count;
            return;
        }
        if (count > prevIncomingCountRef.current) {
            const latest = myBoard.attacks[count - 1];
            if (latest) {
                setRecentIncomingAttack({ row: latest.row, col: latest.col, result: latest.result });
                if (incomingAttackTimerRef.current) clearTimeout(incomingAttackTimerRef.current);
                incomingAttackTimerRef.current = setTimeout(() => {
                    setRecentIncomingAttack(null);
                    incomingAttackTimerRef.current = null;
                }, 1200);
            }
        } else if (count < prevIncomingCountRef.current) {
            setRecentIncomingAttack(null);
        }
        prevIncomingCountRef.current = count;
    }, [myBoard.attacks]);

    // If request fails / no new attack entry arrived, cancel waiting state.
    useEffect(() => {
        if (!awaitingShotResult) return;
        if (submitting) return;
        if (opponentBoard.attacks.length >= pendingAttackCountRef.current) return;
        setAwaitingShotResult(false);
    }, [awaitingShotResult, submitting, opponentBoard.attacks.length]);

    useEffect(() => {
        return () => {
            clearSwitchTimers();
            if (outgoingAttackTimerRef.current) {
                clearTimeout(outgoingAttackTimerRef.current);
                outgoingAttackTimerRef.current = null;
            }
            if (incomingAttackTimerRef.current) {
                clearTimeout(incomingAttackTimerRef.current);
                incomingAttackTimerRef.current = null;
            }
        };
    }, [clearSwitchTimers]);

    const handleAttack = (row, col) => {
        if (!canAttack) return;
        const key = cellKey(row, col);
        if (myAttacksOnOpponent.has(key)) return;
        setLastHit({ row, col });
        pendingAttackCountRef.current = opponentBoard.attacks.length + 1;
        setAwaitingShotResult(true);
        onMove({ row, col });
    };

    return (
        <div className="mp-game mp-playing bs-game">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">Schiffe Versenken</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {isCompleted
                        ? (
                            <span className="mp-turn-badge mp-turn-other">
                                {winnerPlayer?.displayName || 'Unbekannt'} hat gewonnen!
                            </span>
                        )
                        : isDelayedSwitchActive
                            ? <span className="mp-turn-badge mp-turn-mine">Ansicht wechselt in {Math.max(switchCountdown, 1)}s...</span>
                            : isMyTurn
                            ? <span className="mp-turn-badge mp-turn-mine">Du bist dran! Waehle ein Feld zum Angriff.</span>
                            : <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>
                    }
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            {sunkPopup && (
                <div className="bs-sunk-popup">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                    <span>{sunkPopup} versenkt!</span>
                </div>
            )}

            <div className={`bs-attack-layout${showTargetStatusCard ? ' bs-attack-layout-with-panel' : ''}`}>
                <div className={`bs-boards-container${showSingleBoard ? ' bs-boards-single' : ''}${isCompleted ? ' bs-boards-completed' : ''}`}>
                    {showOwnBoard && (
                        <div className={`bs-board-wrapper${showSingleBoard ? ' bs-board-wrapper-single' : ''}`}>
                            <h3 className="bs-board-label">Dein Feld</h3>
                            <div className="bs-board-shell">
                                <div className="bs-axis-top">
                                    {BS_COL_LABELS.map(label => <span key={label}>{label}</span>)}
                                </div>
                                <div className="bs-board-rowwrap">
                                    <div className="bs-axis-left">
                                        {BS_ROW_LABELS.map(label => <span key={label}>{label}</span>)}
                                    </div>
                                    <div className="bs-board bs-board-own">
                                        {Array.from({ length: BS_SIZE }).map((_, row) => (
                                            <div key={row} className="bs-row">
                                                {Array.from({ length: BS_SIZE }).map((_, col) => {
                                                    const key = cellKey(row, col);
                                                    const shipId = myCellToShipId.get(key);
                                                    const shipColor = shipId ? SHIP_COLORS[shipId] : null;
                                                    const attack = opponentAttacksOnMe.get(key);
                                                    const isRecentIncoming = recentIncomingAttack && recentIncomingAttack.row === row && recentIncomingAttack.col === col;
                                                    const classes = [
                                                        'bs-cell',
                                                        shipId ? 'bs-cell-ship' : '',
                                                        attack?.result === 'miss' ? 'bs-cell-miss' : '',
                                                        attack?.result === 'hit' ? 'bs-cell-hit' : '',
                                                        attack?.result === 'sunk' ? 'bs-cell-sunk' : '',
                                                        isRecentIncoming && (attack?.result === 'hit' || attack?.result === 'sunk') ? 'bs-cell-impact-hit' : '',
                                                        isRecentIncoming && attack?.result === 'miss' ? 'bs-cell-impact-miss' : ''
                                                    ].filter(Boolean).join(' ');
                                                    const cellStyle = shipColor ? { background: shipColor.bg, borderColor: shipColor.border } : {};
                                                    return (
                                                        <div key={key} className={classes} style={cellStyle}>
                                                            {attack?.result === 'miss' && (
                                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
                                                                    <circle cx="12" cy="12" r="3" />
                                                                </svg>
                                                            )}
                                                            {(attack?.result === 'hit' || attack?.result === 'sunk') && (
                                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {showOpponentBoard && (
                        <div className={`bs-board-wrapper${showSingleBoard ? ' bs-board-wrapper-single' : ''}${canAttack ? ' bs-board-active' : ''}`}>
                            <h3 className="bs-board-label">Gegner</h3>
                            <div className="bs-board-shell">
                                <div className="bs-axis-top">
                                    {BS_COL_LABELS.map(label => <span key={label}>{label}</span>)}
                                </div>
                                <div className="bs-board-rowwrap">
                                    <div className="bs-axis-left">
                                        {BS_ROW_LABELS.map(label => <span key={label}>{label}</span>)}
                                    </div>
                                    <div className="bs-board bs-board-opponent">
                                        {Array.from({ length: BS_SIZE }).map((_, row) => (
                                            <div key={row} className="bs-row">
                                                {Array.from({ length: BS_SIZE }).map((_, col) => {
                                                    const key = cellKey(row, col);
                                                    const attack = myAttacksOnOpponent.get(key);
                                                    const isSunkCell = opponentSunkCells.has(key);
                                                    const sunkShipId = opponentCellToShipId.get(key);
                                                    const sunkColor = sunkShipId ? SHIP_COLORS[sunkShipId] : null;
                                                    const isLastHit = lastHit && lastHit.row === row && lastHit.col === col;
                                                    const isRecentOutgoing = recentOutgoingAttack && recentOutgoingAttack.row === row && recentOutgoingAttack.col === col;
                                                    const classes = [
                                                        'bs-cell',
                                                        canAttack && !attack ? 'bs-cell-attackable' : '',
                                                        attack?.result === 'miss' ? 'bs-cell-miss' : '',
                                                        attack?.result === 'hit' ? 'bs-cell-hit' : '',
                                                        attack?.result === 'sunk' ? 'bs-cell-sunk' : '',
                                                        isSunkCell ? 'bs-cell-sunk-ship' : '',
                                                        isLastHit && attack ? 'bs-cell-last-hit' : '',
                                                        isRecentOutgoing && (attack?.result === 'hit' || attack?.result === 'sunk') ? 'bs-cell-impact-hit' : '',
                                                        isRecentOutgoing && attack?.result === 'miss' ? 'bs-cell-impact-miss' : ''
                                                    ].filter(Boolean).join(' ');
                                                    const cellStyle = sunkColor ? { background: sunkColor.bg, borderColor: sunkColor.border } : {};
                                                    return (
                                                        <div
                                                            key={key}
                                                            className={classes}
                                                            style={cellStyle}
                                                            onClick={() => handleAttack(row, col)}
                                                        >
                                                            {attack?.result === 'miss' && (
                                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
                                                                    <circle cx="12" cy="12" r="3" />
                                                                </svg>
                                                            )}
                                                            {(attack?.result === 'hit' || attack?.result === 'sunk') && (
                                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {showTargetStatusCard && (
                    <div className="bs-side-panel-wrapper">
                        <h3 className="bs-board-label">{statusTitle}</h3>
                        <aside className="bs-target-card card">
                            <div className="bs-target-head">
                                <h4>Flottenstatus</h4>
                                <span>{statusSunkCount}/{SHIP_DEFS.length} versenkt</span>
                            </div>
                            <div className="bs-target-list">
                                {statusShips.map(ship => (
                                    <div key={ship.id} className={`bs-target-item${ship.isSunk ? ' bs-target-item-sunk' : ''}`}>
                                        <div className="bs-target-ship-visual">
                                            <span className="bs-target-size">{ship.size}er</span>
                                            <div className="bs-target-blocks">
                                                {Array.from({ length: ship.size }).map((_, idx) => {
                                                    const isHitBlock = idx < ship.hitCount;
                                                    const color = SHIP_COLORS[ship.id]?.solid || '#64748b';
                                                    const blockStyle = {
                                                        background: color,
                                                        opacity: isHitBlock ? 0.95 : 0.32,
                                                        borderColor: isHitBlock ? color : 'rgba(148, 163, 184, 0.34)'
                                                    };
                                                    const blockClass = `bs-target-block${isHitBlock ? ' bs-target-block-hit' : ''}`;
                                                    return <span key={idx} className={blockClass} style={blockStyle} />;
                                                })}
                                            </div>
                                        </div>
                                        <span className={`bs-target-state ${ship.isSunk ? 'bs-target-state-sunk' : ship.hitCount > 0 ? 'bs-target-state-hit' : 'bs-target-state-open'}`}>
                                            {ship.isSunk ? 'versenkt' : ship.hitCount > 0 ? `${ship.hitCount}/${ship.size}` : 'intakt'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </div>
                )}
            </div>

            {isCompleted && (
                <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                    <div className="flex-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div className="text-muted">
                            Rematch bereit: {rematchVotes.length}/{room.players.length}
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

// ── Main Battleship Component ──
export default function MultiplayerBattleship({
    room,
    user,
    isMyTurn,
    error,
    submitting,
    onPlaceShips,
    onMove,
    onRematch,
    onLeave
}) {
    const state = room?.diceState || {};
    const phase = state.phase || 'placing';

    if (phase === 'placing') {
        return (
            <PlacementPhase
                user={user}
                room={room}
                onPlaceShips={onPlaceShips}
                error={error}
                submitting={submitting}
                placementReady={state.placementReady}
            />
        );
    }

    return (
        <AttackPhase
            room={room}
            user={user}
            isMyTurn={isMyTurn}
            error={error}
            submitting={submitting}
            onMove={onMove}
            onRematch={onRematch}
            onLeave={onLeave}
        />
    );
}
