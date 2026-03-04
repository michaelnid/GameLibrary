const express = require('express');
const { listGameDefinitions, listLocalGameDefinitions } = require('../games');

const router = express.Router();

// GET /api/game-types - Public: list supported game types
// ?local=true returns only game types playable in local mode
router.get('/', (req, res) => {
    if (req.query.local === 'true') {
        return res.json(listLocalGameDefinitions());
    }
    res.json(listGameDefinitions());
});

module.exports = router;
