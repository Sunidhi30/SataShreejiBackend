
// routes/bet.js
const express = require('express');
const Bet = require('../models/Bet');
const Game = require('../models/Game');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Place a bet
router.post('/place', auth, async (req, res) => {
  try {
    const { gameId, betNumber, betAmount, betType, session } = req.body;

    // Validate game
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active') {
      return res.status(400).json({ message: 'Game not available' });
    }

    // Check if user has sufficient balance
    const user = await User.findById(req.user._id);
    if (user.wallet.balance < betAmount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Create bet
    const bet = new Bet({
      user: req.user._id,
      game: gameId,
      betNumber,
      betAmount,
      betType,
      session,
      gameType: 'regular'
    });

    await bet.save();

    // Deduct amount from user wallet
    user.wallet.balance -= betAmount;
    await user.save();

    // Create transaction record
    const transaction = new Transaction({
      user: req.user._id,
      type: 'bet',
      amount: betAmount,
      status: 'completed',
      paymentMethod: 'wallet',
      description: `Bet placed on ${game.name} - Number: ${betNumber}`
    });

    await transaction.save();

    res.json({ 
      message: 'Bet placed successfully', 
      bet,
      remainingBalance: user.wallet.balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's active bets
router.get('/active', auth, async (req, res) => {
  try {
    const bets = await Bet.find({
      user: req.user._id,
      status: 'pending'
    }).populate('game').sort({ createdAt: -1 });

    res.json(bets);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
