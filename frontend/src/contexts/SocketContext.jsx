import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const { user, loading } = useAuth();

    // Track joined rooms so we can rejoin on reconnect.
    const gameRoomsRef = useRef(new Set());
    const mpRoomsRef = useRef(new Set());
    const listenersRef = useRef(new Map());

    function attachRegisteredListeners(socket) {
        listenersRef.current.forEach((callbacks, eventName) => {
            callbacks.forEach((callback) => {
                socket.on(eventName, callback);
            });
        });
    }

    function registerListener(eventName, callback) {
        if (typeof callback !== 'function') return () => { };

        const existing = listenersRef.current.get(eventName) || new Set();
        existing.add(callback);
        listenersRef.current.set(eventName, existing);

        if (socketRef.current) {
            socketRef.current.on(eventName, callback);
        }

        return () => {
            const callbacks = listenersRef.current.get(eventName);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    listenersRef.current.delete(eventName);
                }
            }

            if (socketRef.current) {
                socketRef.current.off(eventName, callback);
            }
        };
    }

    useEffect(() => {
        if (loading) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setConnected(false);
            return undefined;
        }

        const socket = io(window.location.origin, {
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            setConnected(true);
            // Re-join all rooms after reconnect.
            gameRoomsRef.current.forEach((gameId) => {
                socket.emit('joinGame', gameId);
            });
            mpRoomsRef.current.forEach(code => {
                socket.emit('mp:joinRoom', code);
            });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));

        attachRegisteredListeners(socket);
        socketRef.current = socket;

        // iPad/iOS: Reconnect when tab becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && socketRef.current) {
                if (!socketRef.current.connected) {
                    socketRef.current.connect();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            socket.disconnect();
            socketRef.current = null;
            setConnected(false);
        };
    }, [loading, user?.id, user?.role]);

    const joinGame = useCallback((gameId) => {
        if (gameId !== undefined && gameId !== null) {
            gameRoomsRef.current.add(gameId);
        }
        if (socketRef.current) {
            socketRef.current.emit('joinGame', gameId);
        }
    }, []);

    const leaveGame = useCallback((gameId) => {
        gameRoomsRef.current.delete(gameId);
        if (socketRef.current) {
            socketRef.current.emit('leaveGame', gameId);
        }
    }, []);

    const onScoreUpdate = useCallback((callback) => {
        return registerListener('scoreUpdate', callback);
    }, []);

    const onGameCompleted = useCallback((callback) => {
        return registerListener('gameCompleted', callback);
    }, []);

    const emitDiceSelected = useCallback((gameId, dice, currentPlayerId) => {
        if (socketRef.current) {
            socketRef.current.emit('diceSelected', { gameId, dice, currentPlayerId });
        }
    }, []);

    const emitTurnChanged = useCallback((gameId, currentPlayerId) => {
        if (socketRef.current) {
            socketRef.current.emit('turnChanged', { gameId, currentPlayerId });
        }
    }, []);

    const onDiceSelected = useCallback((callback) => {
        return registerListener('diceSelected', callback);
    }, []);

    const onTurnChanged = useCallback((callback) => {
        return registerListener('turnChanged', callback);
    }, []);

    const joinMpRoom = useCallback((roomCode) => {
        if (!roomCode) return;
        mpRoomsRef.current.add(roomCode);
        if (socketRef.current) {
            socketRef.current.emit('mp:joinRoom', roomCode);
        }
    }, []);

    const leaveMpRoom = useCallback((roomCode) => {
        if (!roomCode) return;
        mpRoomsRef.current.delete(roomCode);
        if (socketRef.current) {
            socketRef.current.emit('mp:leaveRoom', roomCode);
        }
    }, []);

    const onMpEvent = useCallback((eventName, callback) => {
        return registerListener(eventName, callback);
    }, []);

    return (
        <SocketContext.Provider value={{
            socket: socketRef.current,
            connected, joinGame, leaveGame,
            onScoreUpdate, onGameCompleted,
            emitDiceSelected, emitTurnChanged,
            onDiceSelected, onTurnChanged,
            joinMpRoom, leaveMpRoom, onMpEvent
        }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const context = useContext(SocketContext);
    if (!context) throw new Error('useSocket must be used within SocketProvider');
    return context;
}
