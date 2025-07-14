
// routes/admin.js
const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Game = require('../models/Game');
const GameRate = require('../models/GameRate');
const Bet = require('../models/Bet');
const HardGame = require("../models/HardGame");
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const STATIC_ADMIN_USERNAME = 'admin';
const STATIC_ADMIN_PASSWORD = 'admin@21';
const router = express.Router();
const { adminAuth } = require('../middleware/auth');


// 1. ADMIN AUTHENTICATION
// Admin Login
// === ADMIN SIGNUP ===
router.post('/signup', async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
      }
  
      // Check if username or email already exists
      const existingAdmin = await Admin.findOne({
        $or: [{ username }, { email }]
      });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }
  
      // Create new admin
      const admin = new Admin({
        username,
        email,
        password,  // Will be hashed by the pre-save middleware
        role: 'admin' // Fixed role
      });
  
      await admin.save();
  
      res.status(201).json({
        message: 'Admin registered successfully',
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  // === ADMIN LOGIN ===
router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
  
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }
  
      // Find admin by username
      const admin = await Admin.findOne({ username });
      if (!admin) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Compare password
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Update last login
      admin.lastLogin = new Date();
      await admin.save();
  
      // Generate JWT Token
      const token = jwt.sign(
        { adminId: admin._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
  
      res.status(200).json({
        message: 'Login successful',
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
// Change Password
router.post('/change-password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const admin = await Admin.findById(req.admin.id);
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/admin-earnings', async (req, res) => {
  try {
    // ✅ Sum all bet amounts from Bet collection
    const totalBets = await Bet.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$betAmount" } } }
    ]);
    const normalBetsTotal = totalBets[0]?.totalAmount || 0;

    // ✅ Sum all bet amounts from HardGame collection
    const totalHardBets = await HardGame.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$betAmount" } } }
    ]);
    const hardGameBetsTotal = totalHardBets[0]?.totalAmount || 0;

    // ✅ Combine both totals
    const totalUserInvestments = normalBetsTotal + hardGameBetsTotal;

    // ✅ Get admin earnings
    const admin = await Admin.findOne();
    const adminEarnings = admin ? admin.earnings : 0;

    // ✅ Send response
    res.status(200).json({
      message: "Summary retrieved successfully",
      totalUserInvestments,
      adminEarnings
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch summary" });
  }
});

//Route: Get total user count
router.get('/users-count', async (req, res) => {
    try {
      const userCount = await User.countDocuments();
      res.json({
        message: 'User count retrieved successfully',
        count: userCount
      });
    } catch (error) {
      console.error('Error fetching user count:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  // Get Total Bid Amount
router.get('/total-bid-amount', async (req, res) => {
  try {
    // Get total bet amount from Bet collection
    const betResult = await Bet.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$betAmount" }
        }
      }
    ]);

    // Get total bet amount from HardGame collection
    const hardGameResult = await HardGame.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$betAmount" }
        }
      }
    ]);

    const totalBetAmount = (betResult[0]?.totalAmount || 0) + (hardGameResult[0]?.totalAmount || 0);

    res.status(200).json({
      message: "Total bid amount retrieved successfully",
      totalBidAmount: totalBetAmount
    });
  } catch (error) {
    console.error("Error getting total bid amount:", error);
    res.status(500).json({ message: "Server error while fetching total bid amount" });
  }
});
// 2. USER MANAGEMENT
// Get all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sortBy = 'registrationDate', order = 'desc' } = req.query;
    
    const query = search ? {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const users = await User.find(query)
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-password');

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user details
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('referredBy', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's betting history
    const bets = await Bet.find({ userId: user._id })
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(10);

    // Get user's transaction history
    const transactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      user,
      recentBets: bets,
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Block/Unblock user
router.patch('/users/:id/block', adminAuth, async (req, res) => {
  try {
    const { isBlocked } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add points to user
router.post('/users/:id/add-points', adminAuth, async (req, res) => {
    try {
      const { amount, notes } = req.body;
  
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Ensure amount is a number
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }
  
      // Initialize balance if it's null or undefined
      if (user.balance == null) user.balance = 0;
  
      user.balance += numericAmount;
      await user.save();
  
      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: 'deposit',
        amount: numericAmount,
        status: 'completed',
        paymentMethod: 'wallet',
        description: notes || 'Points added by admin',
        adminNotes: notes || 'Points added by admin',
        processedAt: new Date()
      });
      await transaction.save();
  
      res.json({
        success: true,
        message: 'Points added successfully',
        user: {
          id: user._id,
          username: user.username,
          balance: user.balance
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
// 3. GAME MANAGEMENT
// Get all games
router.get('/games', adminAuth, async (req, res) => {
  try {
    const games = await Game.find()
    .sort({ createdAt: -1 });
  

    res.json({
      success: true,
      games
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add new game
router.post('/games', adminAuth, async (req, res) => {
  try {
    const { name, type, openTime, closeTime, resultTime, status } = req.body;
    
    const game = new Game({
      name,
      type,
      openTime,
      closeTime,
      resultTime,
      status
    });

    await game.save();

    res.json({
      success: true,
      message: 'Game added successfully',
      game
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Game name already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update game
router.put('/games/:id', adminAuth, async (req, res) => {
  try {
    const { name, type, openTime, closeTime, resultTime, status } = req.body;
    
    const game = await Game.findByIdAndUpdate(
      req.params.id,
      { name, type, openTime, closeTime, resultTime, status, updatedAt: new Date() },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({
      success: true,
      message: 'Game updated successfully',
      game
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete game
router.delete('/games/:id', adminAuth, async (req, res) => {
  try {
    const game = await Game.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 4. GAME RATES MANAGEMENT
// Get rates for a game
router.get('/games/:gameId/rates=', adminAuth, async (req, res) => {
  try {
    const rates = await GameRate.find({ gameId: req.params.gameId })
      .populate('gameId', 'name');

    res.json({
      success: true,
      rates
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add/Update game rate
router.post('/games/:gameId/rates', adminAuth, async (req, res) => {
  try {
    const { rateType, rate, minBet, maxBet } = req.body;
    
    let gameRate = await GameRate.findOne({
      gameId: req.params.gameId,
      rateType
    });

    if (gameRate) {
      gameRate.rate = rate;
      gameRate.minBet = minBet;
      gameRate.maxBet = maxBet;
      await gameRate.save();
    } else {
      gameRate = new GameRate({
        gameId: req.params.gameId,
        rateType,
        rate,
        minBet,
        maxBet
      });
      await gameRate.save();
    }

    res.json({
      success: true,
      message: 'Rate updated successfully',
      rate: gameRate
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 5. RESULT MANAGEMENT
// Get results for a game
router.get('/games/:gameId/results', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const results = await Result.find({ gameId: req.params.gameId })
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Result.countDocuments({ gameId: req.params.gameId });

    res.json({
      success: true,
      results,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Declare result
router.post('/games/:gameId/results', adminAuth, async (req, res) => {
  try {
    const { date, openResult, closeResult, spinnerResult } = req.body;
    
    const result = new Result({
      gameId: req.params.gameId,
      date: new Date(date),
      openResult,
      closeResult,
      spinnerResult
    });

    await result.save();

    // Update bet results
    if (openResult !== undefined) {
      await Bet.updateMany(
        { 
          gameId: req.params.gameId, 
          date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
          session: 'open',
          status: 'pending'
        },
        [
          {
            $set: {
              status: { $cond: [{ $eq: ['$number', openResult] }, 'won', 'lost'] },
              winAmount: { $cond: [{ $eq: ['$number', openResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
              resultDate: new Date()
            }
          }
        ]
      );
    }

    if (closeResult !== undefined) {
      await Bet.updateMany(
        { 
          gameId: req.params.gameId, 
          date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
          session: 'close',
          status: 'pending'
        },
        [
          {
            $set: {
              status: { $cond: [{ $eq: ['$number', closeResult] }, 'won', 'lost'] },
              winAmount: { $cond: [{ $eq: ['$number', closeResult] }, { $multiply: ['$amount', '$rate'] }, 0] },
              resultDate: new Date()
            }
          }
        ]
      );
    }

    // Update user balances for winning bets
    const winningBets = await Bet.find({
      gameId: req.params.gameId,
      date: { $gte: new Date(date), $lt: new Date(new Date(date).getTime() + 24*60*60*1000) },
      status: 'won'
    });

    for (const bet of winningBets) {
      await User.findByIdAndUpdate(bet.userId, {
        $inc: { balance: bet.winAmount, totalWinnings: bet.winAmount }
      });
    }

    res.json({
      success: true,
      message: 'Result declared successfully',
      result
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 6. BET MANAGEMENT
// Get bets for a game
router.get('/games/:gameId/bets', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, date, session } = req.query;
    
    let query = { gameId: req.params.gameId };
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate.getTime() + 24*60*60*1000);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    if (session) {
      query.session = session;
    }

    const bets = await Bet.find(query)
      .populate('userId', 'username mobile')
      .populate('gameId', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Bet.countDocuments(query);

    // Get betting summary
    const summary = await Bet.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$number',
          totalAmount: { $sum: '$amount' },
          totalBets: { $sum: 1 },
          users: { $addToSet: '$userId' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      success: true,
      bets,
      summary,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 7. TRANSACTION MANAGEMENT
// Get withdrawal requests
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'pending' } = req.query;
    
    const withdrawals = await Transaction.find({
      type: 'withdrawal',
      status
    })
      .populate('userId', 'username mobile email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({
      type: 'withdrawal',
      status
    });

    res.json({
      success: true,
      withdrawals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Process withdrawal
router.patch('/withdrawals/:id', adminAuth, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    const withdrawal = await Transaction.findById(req.params.id)
      .populate('userId');

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    withdrawal.status = status;
    withdrawal.adminNotes = adminNotes;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    // If rejected, return money to user balance
    if (status === 'rejected') {
      await User.findByIdAndUpdate(withdrawal.userId._id, {
        $inc: { balance: withdrawal.amount }
      });
    }

    res.json({
      success: true,
      message: `Withdrawal ${status} successfully`,
      withdrawal
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 8. REPORTS
// Bet report
router.get('/reports/bets', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, gameId } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (gameId) {
      query.gameId = gameId;
    }

    const report = await Bet.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            gameId: '$gameId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          },
          totalBets: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalWinAmount: { $sum: '$winAmount' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $lookup: {
          from: 'games',
          localField: '_id.gameId',
          foreignField: '_id',
          as: 'game'
        }
      },
      { $sort: { '_id.date': -1 } }
    ]);

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// User report
router.get('/reports/users', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.registrationDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const totalUsers = await User.countDocuments(query);
    const activeUsers = await User.countDocuments({ ...query, isActive: true });
    const blockedUsers = await User.countDocuments({ ...query, isBlocked: true });

    const userStats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalDeposits: { $sum: '$totalDeposits' },
          totalWithdrawals: { $sum: '$totalWithdrawals' },
          totalWinnings: { $sum: '$totalWinnings' }
        }
      }
    ]);

    res.json({
      success: true,
      report: {
        totalUsers,
        activeUsers,
        blockedUsers,
        stats: userStats[0] || {
          totalBalance: 0,
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalWinnings: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
module.exports = router;