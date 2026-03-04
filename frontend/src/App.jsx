import { Routes, Route } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import GameView from './pages/GameView';
import Highscores from './pages/Highscores';
import Login from './pages/Login';
import ManageGame from './pages/ManageGame';
import Admin from './pages/Admin';
import MultiplayerLobby from './pages/MultiplayerLobby';
import MultiplayerGame from './pages/MultiplayerGame';

export default function App() {
    return (
        <SocketProvider>
            <div className="app-layout">
                <Navbar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/spiele" element={<Dashboard />} />
                        <Route path="/spiel/:id" element={<GameView />} />
                        <Route path="/highscores" element={<Highscores />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/multiplayer" element={<MultiplayerLobby />} />
                        <Route path="/multiplayer/game/:roomCode" element={<MultiplayerGame />} />
                        <Route path="/manage" element={
                            <ProtectedRoute requiredRole="gamemaster">
                                <ManageGame />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin" element={
                            <ProtectedRoute requiredRole="admin">
                                <Admin />
                            </ProtectedRoute>
                        } />
                    </Routes>
                </main>
                <Footer />
            </div>
        </SocketProvider>
    );
}

