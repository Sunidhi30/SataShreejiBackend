const mongoose = require('mongoose');

const hardGameSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  betAmount: {
    type: Number,
    required: true,
    min: 1
  },
  selectedNumber: {
    type: Number,
    required: true,
    min: 0,
    max: 9
  },
  resultNumber: {
    type: Number,
    min: 0,
    max: 9
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
  nextResultTime: {
    type: Date,
    required: true
  },
  gameDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('HardGame', hardGameSchema);
