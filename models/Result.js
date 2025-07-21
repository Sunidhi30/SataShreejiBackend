// models/Result.js
const mongoose = require('mongoose');
const resultSchema = new mongoose.Schema({
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    openResult: {
      type: Number
    },
    closeResult: {
      type: Number
    },
    spinnerResult: {
      type: Number
    },
    isActive: {
      type: Boolean,
      default: true
    },
    declaredAt: {
      type: Date,
      default: Date.now
    }
  });
  
  module.exports = mongoose.model('Result', resultSchema);
  