// models/Bet.js
const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  betId: {
    type: String,
    unique: true,
    required: false
  },
  gameType: {
    type: String,
    enum: ['regular', 'hard'],
    required: true
  },
  session: {
    type: String,
    enum: ['open', 'close'],
    required: true
  },
  betNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 99
  },
  betAmount: {
    type: Number,
    required: true,
    min: 1
  },
  betType: {
    type: String,
    enum: ['single', 'jodi'],
    required: true
  },
  winningAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'won', 'lost'],
    default: 'pending'
  },
  resultNumber: {
    type: Number
  },
  isWinner: {
    type: Boolean,
    default: false
  },
  betDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate bet ID
betSchema.pre('save', function(next) {
  if (!this.betId) {
    this.betId = 'BET' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Bet', betSchema);
