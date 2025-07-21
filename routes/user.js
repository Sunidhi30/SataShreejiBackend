const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Game = require('../models/Game');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const Result = require('../models/Result');
const HardGame = require('../models/HardGame');
const GameRate = require('../models/GameRate');
const GameWin = require("../models/GameWin")
const Settings = require('../models/Settings');
const Admin = require('../models/Admin'); // Make sure Admin model is imported
const upload= require("../utils/upload")
const cloudinary = require("../utils/cloudinary")
const mongoose = require('mongoose');

// JWT Authentication Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
          return res.status(401).json({ message: 'No token provided' });
        }
    
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
    
        req.user = user;
        next();
      } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
      }
};
const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'user_profiles' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary Upload Error:', error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        stream.end(fileBuffer);
      });
};
// Update User Details API (with profile image upload)
router.put('/update/:userId', upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const {
      username,
      email,
      mobile,
      password,
      paymentDetails
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ Upload profile image to Cloudinary if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      user.profileImage = result.secure_url; // Save Cloudinary URL
    }

    // ✅ Update other fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (mobile) user.mobile = mobile;

    if (paymentDetails) {
      user.paymentDetails = {
        ...user.paymentDetails,
        ...paymentDetails
      };
    }

    // ✅ If password is provided, hash it
    if (password && password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();

    res.status(200).json({ message: 'User details updated successfully', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error while updating user' });
  }
});
// Get Home Dashboard Data
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's results
    const todayResults = await Result.find({
      date: { $gte: today }
    }).populate('gameId').sort({ declaredAt: -1 }).limit(5);

    // Get user's recent bets
    const recentBets = await Bet.find({ user: req.user._id })
      .populate('game')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get user's today's activities
    const todayTransactions = await Transaction.find({
      user: req.user._id,
      createdAt: { $gte: today }
    }).sort({ createdAt: -1 });

    // Get active games
    const activeGames = await Game.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(10);

    // Calculate statistics
    const totalBets = await Bet.countDocuments({ user: req.user._id });
    const totalWins = await Bet.countDocuments({ 
      user: req.user._id, 
      status: 'won' 
    });

    res.json({
      message: 'Dashboard data retrieved successfully',
      data: {
        user: {
          name: req.user.username,
          balance: req.user.wallet.balance,
          totalWinnings: req.user.wallet.totalWinnings,
          referralCode: req.user.referralCode
        },
        todayResults,
        recentBets,
        todayTransactions,
        activeGames,
        statistics: {
          totalBets,
          totalWins,
          winPercentage: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Today's Lucky Number
router.get('/today-number', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayResult = await Result.findOne({
      date: { $gte: today }
    }).populate('gameId').sort({ declaredAt: -1 });

    if (!todayResult) {
      return res.json({
        message: 'No result declared for today yet',
        luckyNumber: null,
        nextResultTime: null
      });
    }

    res.json({
      message: 'Today\'s lucky number retrieved',
      luckyNumber: todayResult.openResult || todayResult.closeResult,
      game: todayResult.gameId.name,
      declaredAt: todayResult.declaredAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get All Games
router.get('/games', authMiddleware, async (req, res) => {
  try {
    const games = await Game.find({ status: 'active' })
      .sort({ createdAt: -1 });

    const gamesWithStatus = await Promise.all(games.map(async (game) => {
      const currentTime = new Date();
      const openTime = new Date();
      const closeTime = new Date();
      
      // Parse time strings (assuming format "HH:MM")
      const [openHour, openMin] = game.openTime.split(':');
      const [closeHour, closeMin] = game.closeTime.split(':');
      
      openTime.setHours(openHour, openMin, 0, 0);
      closeTime.setHours(closeHour, closeMin, 0, 0);

      let gameStatus = 'closed';
      if (currentTime >= openTime && currentTime <= closeTime) {
        gameStatus = 'open';
      }

      // Get total participants
      const totalParticipants = await Bet.countDocuments({ 
        game: game._id,
        betDate: { $gte: new Date().setHours(0, 0, 0, 0) }
      });

      return {
        ...game.toObject(),
        gameStatus,
        totalParticipants
      };
    }));

    res.json({
      message: 'Games retrieved successfully',
      games: gamesWithStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Game Details
router.get('/games/:gameId', authMiddleware, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Get game rates
    const gameRates = await GameRate.find({ 
      gameId: req.params.gameId,
      isActive: true 
    });

    // Get recent results
    const recentResults = await Result.find({ gameId: req.params.gameId })
      .sort({ declaredAt: -1 })
      .limit(10);

    res.json({
      message: 'Game details retrieved successfully',
      game,
      rates: gameRates,
      recentResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Place Bet on Number Game
// router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
//   try {
//     const { betNumber, betAmount, betType, session } = req.body;
//     const gameId = req.params.gameId;

//     // Validate inputs
//     if (!betNumber || !betAmount || !betType || !session) {
//       return res.status(400).json({ message: 'All fields are required' });
//     }

//     if (betAmount < 1) {
//       return res.status(400).json({ message: 'Minimum bet amount is 1' });
//     }

//     // Check if user has sufficient balance
//     if (req.user.wallet.balance < betAmount) {
//       return res.status(400).json({ message: 'Insufficient balance' });
//     }

//     // Check if game exists and is active
//     const game = await Game.findById(gameId);
//     if (!game || game.status !== 'active') {
//       return res.status(400).json({ message: 'Game not available' });
//     }

//     // Check if betting is open
//     const currentTime = new Date();
//     const openTime = new Date();
//     const closeTime = new Date();
    
//     const [openHour, openMin] = game.openTime.split(':');
//     const [closeHour, closeMin] = game.closeTime.split(':');
    
//     openTime.setHours(openHour, openMin, 0, 0);
//     closeTime.setHours(closeHour, closeMin, 0, 0);

//     if (currentTime < openTime || currentTime > closeTime) {
//       return res.status(400).json({ message: 'Betting is closed for this game' });
//     }

//     // Create bet
//     const bet = new Bet({
//       user: req.user._id,
//       game: gameId,
//       gameType: 'regular',
//       session,
//       betNumber,
//       betAmount,
//       betType
//     });

//     await bet.save();

//     // Deduct amount from user wallet
//     await User.findByIdAndUpdate(req.user._id, {
//       $inc: { 'wallet.balance': -betAmount }
//     });

//     // Create transaction record
//     await new Transaction({
//       user: req.user._id,
//       type: 'bet',
//       amount: betAmount,
//       status: 'completed',
//       paymentMethod: 'wallet',
//       description: `Bet placed on ${game.name} - Number ${betNumber}`
//     }).save();

//     res.json({
//       message: 'Bet placed successfully',
//       bet: {
//         betId: bet.betId,
//         betNumber,
//         betAmount,
//         betType,
//         session
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
  try {
    const { betNumber, betAmount, betType, session } = req.body;
    const gameId = req.params.gameId;

    // ✅ Validate inputs
    if (!betNumber || !betAmount || !betType || !session) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (betAmount < 1) {
      return res.status(400).json({ message: 'Minimum bet amount is 1' });
    }

    // ✅ Check if user has sufficient balance
    if (req.user.wallet.balance < betAmount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // ✅ Check if game exists and is active
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active') {
      return res.status(400).json({ message: 'Game not available' });
    }

    // ✅ Check if betting is open
    const currentTime = new Date();
    const openTime = new Date();
    const closeTime = new Date();

    const [openHour, openMin] = game.openTime.split(':');
    const [closeHour, closeMin] = game.closeTime.split(':');

    openTime.setHours(openHour, openMin, 0, 0);
    closeTime.setHours(closeHour, closeMin, 0, 0);

    if (currentTime < openTime || currentTime > closeTime) {
      return res.status(400).json({ message: 'Betting is closed for this game' });
    }

    // ✅ Create bet
    const bet = new Bet({
      user: req.user._id,
      game: gameId,
      gameType: 'regular',
      session,
      betNumber,
      betAmount,
      betType
    });

    await bet.save();

    // ✅ Deduct amount from user wallet
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'wallet.balance': -betAmount }
    });

    // ✅ Add amount to admin earnings
    await Admin.findOneAndUpdate({}, { $inc: { earnings: betAmount } });

    // ✅ Create transaction record
    await new Transaction({
      user: req.user._id,
      type: 'bet',
      amount: betAmount,
      status: 'completed',
      paymentMethod: 'wallet',
      description: `Bet placed on ${game.name} - Number ${betNumber}`
    }).save();

    // ✅ Respond with success and betId
    res.json({
      message: 'Bet placed successfully',
      bet: {
        betId: bet.betId, // ✅ Return betId
        betNumber,
        betAmount,
        betType,
        session
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==============================================
// HARD GAME (SPINNER) ROUTES
// ==============================================

// Get Hard Game Status
router.get('/hard-game/status', authMiddleware, async (req, res) => {
  try {
    const settings = await Settings.findOne({});
    const multiplier = settings?.hardGameMultiplier || 9;

    // Get last 5 results
    const lastResults = await HardGame.find({
      status: { $ne: 'pending' }
    }).sort({ createdAt: -1 }).limit(5);

    // Get next result time (can be dynamic based on admin settings)
    const nextResultTime = new Date();
    nextResultTime.setMinutes(nextResultTime.getMinutes() + 5); // Next result in 5 minutes

    res.json({
      message: 'Hard game status retrieved',
      multiplier,
      lastResults: lastResults.map(r => ({
        number: r.resultNumber,
        time: r.createdAt
      })),
      nextResultTime
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// // Play Hard Game (Spinner)
// User plays the Hard Game
// User plays the Hard Game
// User plays the Hard Game
router.post('/user/play-hardgames', authMiddleware, async (req, res) => {
  try {
    const { gameId, selectedNumber, betAmount } = req.body;

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'Invalid game ID' });
    }
    if (selectedNumber < 0 || selectedNumber > 9) {
      return res.status(400).json({ message: 'Selected number must be between 0 and 9' });
    }
    if (betAmount <= 0) {
      return res.status(400).json({ message: 'Bet amount must be greater than 0' });
    }

    // Find the hard game by ID
    const hardGame = await HardGame.findById(gameId);
    if (!hardGame) {
      return res.status(404).json({ message: 'Hard game not found with this ID' });
    }

    // Fetch user wallet
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check wallet balance
    if (user.walletBalance < betAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Deduct wallet
    user.walletBalance -= betAmount;

    // Prepare the bet
    let status = 'pending';
    let winningAmount = 0;

    // ✅ Check if result already declared
    if (hardGame.resultNumber !== undefined && hardGame.resultNumber !== null) {
      if (selectedNumber === hardGame.resultNumber) {
        // User won
        status = 'won';
        winningAmount = betAmount * 9; // Example payout multiplier
        user.walletBalance += winningAmount; // Credit winnings
      } else {
        // User lost
        status = 'lost';
      }
    }

    // Save updated user wallet
    await user.save();

    // Save the user's bet
    const userBet = new HardGame({
      user: req.user._id,
      betAmount,
      selectedNumber,
      resultNumber: hardGame.resultNumber, // save declared result (if exists)
      winningAmount,
      nextResultTime: hardGame.nextResultTime,
      status
    });
    await userBet.save();

    res.status(201).json({
      message: `Your bet has been placed successfully and is currently "${status}".`,
      walletBalance: user.walletBalance,
      userBet
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get Hard Game history for the logged-in user
router.get('/testing-hardgame/history', authMiddleware, async (req, res) => {
  try {
    // Fetch all HardGame bets for the logged-in user
    const userHistory = await HardGame.find({ user: req.user._id })
      .sort({ createdAt: -1 }); // Latest first

    res.status(200).json({
      message: 'Hard Game history fetched successfully',
      totalBets: userHistory.length,
      history: userHistory
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// ==============================================
// RESULTS & HISTORY ROUTES
// ==============================================

// Get Live Results
router.get('/results/live', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const liveResults = await Result.find({
      date: { $gte: today }
    }).populate('gameId').sort({ declaredAt: -1 });

    res.json({
      message: 'Live results retrieved successfully',
      results: liveResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Last 5 Results
router.get('/results/last-five', authMiddleware, async (req, res) => {
  try {
    const lastResults = await Result.find({})
      .populate('gameId')
      .sort({ declaredAt: -1 })
      .limit(5);

    res.json({
      message: 'Last 5 results retrieved successfully',
      results: lastResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get History of Hard Game Results
router.get('/results/hard-history', authMiddleware, async (req, res) => {
  try {
    const hardGameResults = await Result.find({})
      .populate({
        path: 'gameId',
        match: { gameType: 'hard' } // Only games with gameType 'hard'
      })
      .sort({ declaredAt: -1 }); // Most recent first

    // Remove results where gameId is null (filtered out in populate)
    const filteredResults = hardGameResults.filter(result => result.gameId !== null);

    res.json({
      message: 'Hard game results history retrieved successfully',
      results: filteredResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Result History
router.get('/results/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, gameId } = req.query;

    const filter = {};
    if (gameId) {
      filter.gameId = gameId;
    }

    const results = await Result.find(filter)
      .populate('gameId')
      .sort({ declaredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Result.countDocuments(filter);

    res.json({
      message: 'Result history retrieved successfully',
      results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==============================================
// ACCOUNT MANAGEMENT ROUTES
// ==============================================

// Get User Profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    // Get user statistics
    const totalBets = await Bet.countDocuments({ user: req.user._id });
    const totalWins = await Bet.countDocuments({ 
      user: req.user._id, 
      status: 'won' 
    });
    const totalHardGames = await HardGame.countDocuments({ user: req.user._id });

    res.json({
      message: 'Profile retrieved successfully',
      user,
      statistics: {
        totalBets,
        totalWins,
        totalHardGames,
        winPercentage: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update Profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, mobile, paymentDetails } = req.body;

    const updateData = {};
    if (username) updateData.username = username;
    if (mobile) updateData.mobile = mobile;
    if (paymentDetails) updateData.paymentDetails = paymentDetails;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Bet History
router.get('/bets/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const filter = { user: req.user._id };
    if (status) {
      filter.status = status;
    }

    const bets = await Bet.find(filter)
      .populate('game')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Bet.countDocuments(filter);

    res.json({
      message: 'Bet history retrieved successfully',
      bets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Winning History
router.get('/winnings/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const winnings = await Bet.find({ 
      user: req.user._id, 
      status: 'won' 
    })
      .populate('game')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Bet.countDocuments({ 
      user: req.user._id, 
      status: 'won' 
    });

    res.json({
      message: 'Winning history retrieved successfully',
      winnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==============================================
// REFERRAL SYSTEM ROUTES
// ==============================================

// Get Referral Details
router.get('/referral', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Get referred users
    const referredUsers = await User.find({ 
      referredBy: req.user._id 
    }).select('username email mobile createdAt');

    // Get referral transactions
    const referralTransactions = await Transaction.find({
      user: req.user._id,
      type: 'referral'
    }).sort({ createdAt: -1 });

    res.json({
      message: 'Referral details retrieved successfully',
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings,
      referredUsers,
      referralTransactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==============================================
// SETTINGS AND UTILITIES
// ==============================================

// Get App Settings
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await Settings.findOne({});
    
    res.json({
      message: 'Settings retrieved successfully',
      settings: {
        withdrawalTimings: settings?.withdrawalTimings,
        minimumDeposit: settings?.minimumDeposit || 100,
        minimumWithdrawal: settings?.minimumWithdrawal || 500,
        referralCommission: settings?.referralCommission || 5
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// winning for the users check
// Add this route to check results and update bet status
router.post('/check-results', authMiddleware, async (req, res) => {
    try {
      const { betId } = req.body;
  
      // Find the bet
      const bet = await Bet.findOne({ betId }).populate('game');
      if (!bet) {
        return res.status(404).json({ message: 'Bet not found' });
      }
  
      // Get the result for the bet's game
      const result = await Result.findOne({
        gameId: bet.game._id
      });
  
      if (!result) {
        return res.status(400).json({ message: 'Result not yet declared' });
      }
  
      // Get game rates
      const gameRates = await GameRate.findOne({
        gameId: bet.game._id,
        isActive: true
      });
  
      let hasWon = false;
      let winningAmount = 0;
  
      // Check if bet is winner based on bet type
      if (bet.betType === 'single') {
        const resultNumber = bet.session === 'open' ? result.openResult : result.closeResult;
        if (bet.betNumber === resultNumber) {
          hasWon = true;
          winningAmount = bet.betAmount * (gameRates?.rate || 9);
        }
      } else if (bet.betType === 'jodi') {
        if (result.openResult && result.closeResult) {
          const jodiNumber = parseInt(`${result.openResult}${result.closeResult}`);
          if (bet.betNumber === jodiNumber) {
            hasWon = true;
            winningAmount = bet.betAmount * (gameRates?.rate || 95);
          }
        }
      }
  
      // Update bet status
      bet.status = hasWon ? 'won' : 'lost';
      bet.winningAmount = winningAmount;
      bet.isWinner = hasWon;
      bet.resultNumber =
        bet.betType === 'single'
          ? bet.session === 'open'
            ? result.openResult
            : result.closeResult
          : parseInt(`${result.openResult}${result.closeResult}`);
  
      await bet.save();
  
      // If won, update user's wallet directly
      if (hasWon) {
        await User.findByIdAndUpdate(bet.user, {
          $inc: {
            'wallet.balance': winningAmount,
            'wallet.totalWinnings': winningAmount
          }
        });
      }
  
      // ✅ Respond
      res.json({
        message: 'Result checked successfully',
        bet: {
          betId: bet.betId,
          status: bet.status,
          winningAmount,
          isWinner: hasWon,
          resultNumber: bet.resultNumber
        }
      });
    } catch (error) {
      console.error('Error checking results:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  // POST /wallet/withdraw
router.post('/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { 
      amount, 
      paymentMethod, 
      accountNumber, 
      ifscCode, 
      accountHolderName, 
      upiId, 
      mobileNumber 
    } = req.body;

    // ✅ Validate required fields
    if (!amount || !paymentMethod || (!accountNumber && !upiId)) {
      return res.status(400).json({ message: 'All payment details are required' });
    }

    const settings = await Settings.findOne({});
    const minWithdrawal = settings?.minimumWithdrawal || 500;

    // ✅ Minimum amount check
    if (amount < minWithdrawal) {
      return res.status(400).json({
        message: `Minimum withdrawal amount is ${minWithdrawal}`
      });
    }

    // ✅ Check user balance
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // ✅ Create withdrawal transaction
    const transaction = new Transaction({
      user: req.user._id,
      type: 'withdrawal',
      amount,
      paymentMethod,
      paymentDetails: {
        accountNumber,
        ifscCode,
        accountHolderName,
        upiId,
        mobileNumber
      },
      description: `Withdrawal via ${paymentMethod}`,
      status: 'admin_pending' // 🟡 waiting for admin approval
    });

    await transaction.save();

    res.status(200).json({
      message: 'Withdrawal request sent to admin for approval',
      transaction: {
        id: transaction._id,
        amount,
        status: transaction.status,
        paymentMethod,
        paymentDetails: transaction.paymentDetails
      }
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// GET /api/games/declared
router.get('/games-test/declared', async (req, res) => {
  try {
    // Find all results where declaredAt exists (results declared)
    const declaredResults = await Result.find({ declaredAt: { $ne: null } })
      .populate('gameId', 'name openTime closeTime resultTime currentResult') // populate game details
      .sort({ declaredAt: -1 }); // latest first

    // Map through results to add winners count
    const gamesWithWinners = await Promise.all(
      declaredResults.map(async (result) => {
        // Count winners for this gameId and result
        const winnerCount = await GameWin.countDocuments({
          gameId: result.gameId._id,
          resultId: result._id
        });

        return {
          gameName: result.gameId.name,
          luckyNumber: result.openResult || result.closeResult || result.spinnerResult,
          openTime: result.gameId.openTime,
          closeTime: result.gameId.closeTime,
          resultTime: result.gameId.resultTime,
          declaredAt: result.declaredAt,
          totalWinners: winnerCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: gamesWithWinners.length,
      data: gamesWithWinners
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch declared games',
      error: error.message
    });
  }
});
// users winnings
// ✅ GET /api/games/user-regular
// ✅ GET /api/games/user-regular
router.get('/user-gaming-history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 📝 Step 1: Find all user bets in "regular" games
    const userBets = await Bet.find({
      user: userId,
      gameType: 'regular'
    }).populate('game').lean();

    if (userBets.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'User has not placed bets in any regular games.',
        games: []
      });
    }

    // 📝 Step 2: Group bets by game and sum total invested money
    const gameInvestments = {};
    userBets.forEach(bet => {
      const gameId = bet.game._id.toString();
      if (!gameInvestments[gameId]) {
        gameInvestments[gameId] = {
          gameDetails: bet.game,
          totalInvested: 0
        };
      }
      gameInvestments[gameId].totalInvested += bet.betAmount;
    });

    // 📝 Step 3: Format response
    const gamesWithInvestments = Object.values(gameInvestments).map(item => ({
      _id: item.gameDetails._id,
      name: item.gameDetails.name,
      openTime: item.gameDetails.openTime,
      closeTime: item.gameDetails.closeTime,
      resultTime: item.gameDetails.resultTime,
      status: item.gameDetails.status,
      gameType: item.gameDetails.gameType,
      rates: item.gameDetails.rates,
      totalInvested: item.totalInvested // ✅ user’s total money invested
    }));

    res.status(200).json({
      success: true,
      games: gamesWithInvestments
    });
  } catch (error) {
    console.error('Error fetching user regular games:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});
// ✅ GET /api/games/user-wins
router.get('/user-wins', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 📝 Step 1: Find all bets where user has won
    const winningBets = await Bet.find({
      user: userId,
      status: 'won' // or use isWinner: true
    }).populate('game').lean();

    if (winningBets.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'User has not won in any games yet.',
        games: []
      });
    }

    // 📝 Step 2: Group by game and include bet info
    const wonGames = winningBets.map(bet => ({
      gameId: bet.game._id,
      name: bet.game.name,
      openTime: bet.game.openTime,
      closeTime: bet.game.closeTime,
      resultTime: bet.game.resultTime,
      gameType: bet.game.gameType,
      rates: bet.game.rates,
      betDetails: {
        betId: bet.betId,
        session: bet.session,
        betNumber: bet.betNumber,
        betAmount: bet.betAmount,
        betType: bet.betType,
        winningAmount: bet.winningAmount,
        resultNumber: bet.resultNumber,
        wonAt: bet.updatedAt
      }
    }));

    res.status(200).json({
      success: true,
      games: wonGames
    });
  } catch (error) {
    console.error('Error fetching user won games:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;