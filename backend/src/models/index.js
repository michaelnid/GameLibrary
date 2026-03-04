const User = require('./User');
const Game = require('./Game');
const Player = require('./Player');
const Score = require('./Score');
const MultiplayerRoom = require('./MultiplayerRoom');
const MultiplayerPlayer = require('./MultiplayerPlayer');

// Associations
User.hasMany(Game, { foreignKey: 'createdBy', as: 'games' });
Game.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Game.hasMany(Player, { foreignKey: 'gameId', as: 'players', onDelete: 'CASCADE' });
Player.belongsTo(Game, { foreignKey: 'gameId', as: 'game' });

Player.hasMany(Score, { foreignKey: 'playerId', as: 'scores', onDelete: 'CASCADE' });
Score.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });

// Player → User (unified profiles)
User.hasMany(Player, { foreignKey: 'profileId', as: 'gamePlayers' });
Player.belongsTo(User, { foreignKey: 'profileId', as: 'profile' });

// Multiplayer associations
User.hasMany(MultiplayerRoom, { foreignKey: 'createdBy', as: 'createdRooms' });
MultiplayerRoom.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

MultiplayerRoom.belongsTo(User, { foreignKey: 'currentTurnUserId', as: 'currentTurnUser' });

MultiplayerRoom.hasMany(MultiplayerPlayer, { foreignKey: 'roomId', as: 'players', onDelete: 'CASCADE' });
MultiplayerPlayer.belongsTo(MultiplayerRoom, { foreignKey: 'roomId', as: 'room' });

User.hasMany(MultiplayerPlayer, { foreignKey: 'userId', as: 'multiplayerSessions' });
MultiplayerPlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = { User, Game, Player, Score, MultiplayerRoom, MultiplayerPlayer };
