// routes/game.js
const express = require('express');
const Game = require('../models/Game');
const Bet = require('../models/Bet');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get all active games
router.get('/active', auth, async (req, res) => {
  try {
    const games = await Game.find({ status: 'active' }).sort({ createdAt: -1 });
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get game details
router.get('/:id', auth, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get last 5 results for all games
router.get('/results/latest', auth, async (req, res) => {
  try {
    const games = await Game.find({ status: 'active' })
      .select('name lastResults currentResult')
      .sort({ createdAt: -1 });
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;