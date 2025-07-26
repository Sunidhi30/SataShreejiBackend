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
    status: {  // ⬅️ Add this field
      type: String,
      enum: ['draft', 'published'],
      default: 'published'
    },
    scheduledPublishTime: {  // ⬅️ Add this field
      type: Date
    },
    declaredAt: {
      type: Date,
      default: Date.now
    }
  });
  
  module.exports = mongoose.model('Result', resultSchema);
  