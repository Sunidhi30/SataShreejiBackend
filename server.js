const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const db = require('./utils/db')
const app = express();
// Middleware
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

require('dotenv').config()
db();

db().then(function (db) {
  console.log(`Db connnected`)
})
// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const betRoutes = require('./routes/bet');
const walletRoutes = require('./routes/transaction');
const adminRoutes = require('./routes/admin');
const hardGameRoutes = require('./routes/hardGame');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/bet', betRoutes);
app.use('/api', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hard-game', hardGameRoutes);

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.get("/testing", (req, res) => {
  res.sendFile(__dirname + "/testingpayement.html");
})