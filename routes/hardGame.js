// routes/hardGame.js
const express = require('express');
const HardGame = require('../models/HardGame');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get hard game data (last 5 results and next result time)
router.get('/data', auth, async (req, res) => {
  try {
    const lastResults = await HardGame.find({ status: { $ne: 'pending' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('resultNumber createdAt');

    // Next result time (every 5 minutes for example)
    const nextResultTime = new Date();
    nextResultTime.setMinutes(nextResultTime.getMinutes() + 5);

    res.json({
      lastResults: lastResults.map(r => r.resultNumber),
      nextResultTime
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Play hard game
router.post('/play', auth, async (req, res) => {
  try {
    const { selectedNumber, betAmount } = req.body;

    if (selectedNumber < 0 || selectedNumber > 9) {
      return res.status(400).json({ message: 'Invalid number selection' });
    }

    const user = await User.findById(req.user._id);
    if (user.wallet.balance < betAmount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Check minimum and maximum bet limits
    const settings = await Settings.findOne();
    if (betAmount < settings.minBet || betAmount > settings.maxBet) {
      return res.status(400).json({ 
        message: `Bet amount must be between ${settings.minBet} and ${settings.maxBet}` 
      });
    }

    // Next result time (5 minutes from now)
    const nextResultTime = new Date();
    nextResultTime.setMinutes(nextResultTime.getMinutes() + 5);

    const hardGame = new HardGame({
      user: req.user._id,
      selectedNumber,
      betAmount,
      nextResultTime
    });

    await hardGame.save();

    // Deduct amount from user wallet
    user.wallet.balance -= betAmount;
    await user.save();

    // Create transaction record
    const transaction = new Transaction({
      user: req.user._id,
      type: 'bet',
      amount: betAmount,
      description: `Hard Game bet - Selected: ${selectedNumber}`,
      gameType: 'hard',
      gameId: hardGame._id
    });

    await transaction.save();

    res.json({
      message: 'Bet placed successfully',
      gameId: hardGame._id,
      nextResultTime,
      remainingBalance: user.wallet.balance
    });

  } catch (error) {
    console.error('Hard game play error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's hard game history
router.get('/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const games = await HardGame.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('selectedNumber resultNumber betAmount winAmount status createdAt');

    const total = await HardGame.countDocuments({ user: req.user._id });

    res.json({
      games,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific game result
router.get('/result/:gameId', auth, async (req, res) => {
  try {
    const game = await HardGame.findOne({
      _id: req.params.gameId,
      user: req.user._id
    });

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json(game);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;