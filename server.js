const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const db = require('./utils/db')
const app = express();
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
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/transaction');
const adminRoutes = require('./routes/admin');
const adminGameRoutes = require('./routes/adminGame');
const userGameRoutes = require('./routes/UserGame');
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/games', adminGameRoutes);
app.use('/api/games', userGameRoutes);
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.get("/testing", (req, res) => {
  res.sendFile(__dirname + "/testingpayement.html");
})
app.get("/Spinner", (req, res) => {
  res.sendFile(__dirname + "/Spinner.html");
})
