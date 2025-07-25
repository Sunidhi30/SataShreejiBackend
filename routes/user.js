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
const Notice = require("../models/Notice")
const moment = require('moment-timezone');
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
// Get Today's Lucky Number
router.get('/timings-today-number', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Find the most recent result declared today
    const todayResult = await Result.findOne({
      date: { $gte: startOfDay }
    })
      .populate('gameId')
      .sort({ declaredAt: -1 });

    if (!todayResult) {
      // No result yet: find the next upcoming game's result time
      const nextGame = await Game.findOne({
        resultDateTime: { $gte: now },
        status: 'active'
      }).sort({ resultDateTime: 1 }); // Nearest upcoming game

      return res.json({
        message: 'No result declared for today yet',
        luckyNumber: null,
        nextResultTime: nextGame ? nextGame.resultDateTime : null,
        nextGame: nextGame ? nextGame.name : null
      });
    }

    // Result is available
    res.json({
      message: 'Today\'s lucky number retrieved',
      luckyNumber: todayResult.openResult || todayResult.closeResult,
      game: todayResult.gameId.name,
      declaredAt: todayResult.declaredAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/games', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id; // ✅ Get logged-in user

    // 🔥 Step 1: Get all active games
    const activeGames = await Game.find({ status: 'active' }).sort({ createdAt: -1 });

    // 🔥 Step 2: Add game status (open/closed) and participant count
    const enrichedGames = await Promise.all(
      activeGames.map(async (game) => {
        const now = new Date();

        const isOpen = now >= game.openDateTime && now <= game.closeDateTime;
        const gameStatus = isOpen ? 'open' : 'closed';

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0); // midnight today

        const totalParticipants = await Bet.countDocuments({
          game: game._id,
          betDate: { $gte: startOfDay } // only today's participants
        });

        return {
          ...game.toObject(),
          gameStatus,
          totalParticipants
        };
      })
    );

    // ✅ Send response
    res.json({
      message: 'Games retrieved successfully',
      games: enrichedGames
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// // Get All Games
// router.get('/games', authMiddleware, async (req, res) => {
//   try {
//     const userId = req.user._id; // 👈 Get the logged-in user's ID

//     // Step 1: Find all active games
//     const games = await Game.find({ status: 'active' }).sort({ createdAt: -1 });

//     // Step 2: Filter out games where user has already placed a bet today
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0); // midnight today

//     const userBets = await Bet.find({
//       user: userId,
//       betDate: { $gte: startOfDay }
//     }).select('game'); // only get the game IDs the user bet on

//     const betGameIds = userBets.map(bet => bet.game.toString()); // array of game IDs user bet on

//     const gamesUserNotInvested = games.filter(game =>
//       !betGameIds.includes(game._id.toString())
//     );

//     // Step 3: Add open/closed status and total participants
//     const gamesWithStatus = await Promise.all(
//       gamesUserNotInvested.map(async (game) => {
//         const currentTime = new Date();

//         // Directly use openDateTime and closeDateTime
//         const openTime = new Date(game.openDateTime);
//         const closeTime = new Date(game.closeDateTime);

//         let gameStatus = 'closed';
//         if (currentTime >= openTime && currentTime <= closeTime) {
//           gameStatus = 'open';
//         }

//         const totalParticipants = await Bet.countDocuments({
//           game: game._id,
//           betDate: { $gte: startOfDay }
//         });

//         return {
//           ...game.toObject(),
//           gameStatus,
//           totalParticipants
//         };
//       })
//     );

//     res.json({
//       message: 'Games retrieved successfully',
//       games: gamesWithStatus
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

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
// Updated Betting Route
router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { betNumber, betAmount, date } = req.body;

    // ✅ Validate inputs
    if (typeof betNumber !== 'number' || typeof betAmount !== 'number' || betAmount <= 0) {
      return res.status(400).json({ message: "Invalid betNumber or betAmount" });
    }
    if (!date) {
      return res.status(400).json({ message: "Bet date is required" });
    }

    // 🕑 Convert user's date to IST
    const userBetDateUTC = new Date(date);
    if (isNaN(userBetDateUTC.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    const userBetDateIST = moment(userBetDateUTC).tz("Asia/Kolkata");

    // ✅ Fetch game
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    const openTimeIST = moment(game.openDateTime).tz("Asia/Kolkata");
    const closeTimeIST = moment(game.closeDateTime).tz("Asia/Kolkata");

    // ✅ Check bet timing
    if (userBetDateIST.isBefore(openTimeIST)) {
      return res.status(400).json({
        message: "Betting has not opened yet for this game",
        gameOpenTime: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
        userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
      });
    }
    if (userBetDateIST.isAfter(closeTimeIST)) {
      return res.status(400).json({
        message: "Betting has already closed for this game",
        gameCloseTime: closeTimeIST.format("YYYY-MM-DD HH:mm:ss"),
        userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
      });
    }

    // ✅ Fetch user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Check wallet balance
    if (user.wallet.balance < betAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    // ✅ Deduct wallet balance
    user.wallet.balance -= betAmount;
  // ✅ Atomically update admin's bidAmount
await Admin.findOneAndUpdate(
  { role: 'admin' },
  { $inc: { bidAmount: betAmount } }
);
    await user.save();

    // ✅ Check if user already has a bet for this game
    let bet = await Bet.findOne({ user: user._id, game: game._id });
    
    if (bet) {
      // 🟢 User has existing bets for this game
      const existingBetIndex = bet.betNumbers.findIndex(b => b.number === betNumber);
      
      if (existingBetIndex !== -1) {
        // 📈 Same number - add to existing amount
        bet.betNumbers[existingBetIndex].amount += betAmount;
      } else {
        // 🆕 New number - add to betNumbers array
        bet.betNumbers.push({
          number: betNumber,
          amount: betAmount
        });
      }
      
      await bet.save();
    } else {
      // 🆕 Create new bet with first number
      bet = new Bet({
        user: user._id,
        game: game._id,
        betNumbers: [{
          number: betNumber,
          amount: betAmount
        }],
        gameType: 'regular',
        betDate: userBetDateUTC
      });
      await bet.save();
    }

    return res.status(200).json({
      success: true,
      message: "Bet placed successfully",
      betDetails: {
        betId: bet.betId,
        betNumbers: bet.betNumbers,
        totalBetAmount: bet.totalBetAmount
      },
      walletBalance: user.wallet.balance,
      userBetTimeIST: userBetDateIST.format("YYYY-MM-DD HH:mm:ss"),
      gameOpenTimeIST: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
      gameCloseTimeIST: closeTimeIST.format("YYYY-MM-DD HH:mm:ss")
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Get User's Bet History for a Game
router.get('/games/:gameId/my-bets', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const bet = await Bet.findOne({ 
      user: req.user._id, 
      game: gameId 
    }).populate('game', 'name status currentResult');
    
    if (!bet) {
      return res.status(404).json({ message: "No bets found for this game" });
    }
    
    return res.status(200).json({
      success: true,
      bet: {
        betId: bet.betId,
        betNumbers: bet.betNumbers,
        totalBetAmount: bet.totalBetAmount,
        status: bet.status,
        winningAmount: bet.winningAmount,
        winningNumbers: bet.winningNumbers,
        game: bet.game
      }
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// router.post('/games/:gameId/bet', authMiddleware, async (req, res) => {
//   try {
//     const { gameId } = req.params;
//     const { betNumber, betAmount, date } = req.body;

//     // ✅ Validate inputs
//     if (typeof betNumber !== 'number' || typeof betAmount !== 'number' || betAmount <= 0) {
//       return res.status(400).json({ message: "Invalid betNumber or betAmount" });
//     }
//     if (!date) {
//       return res.status(400).json({ message: "Bet date is required" });
//     }

//     // 🕑 Convert user's date to IST
//     const userBetDateUTC = new Date(date);
//     if (isNaN(userBetDateUTC.getTime())) {
//       return res.status(400).json({ message: "Invalid date format" });
//     }
//     const userBetDateIST = moment(userBetDateUTC).tz("Asia/Kolkata");

//     // ✅ Fetch game
//     const game = await Game.findById(gameId);
//     if (!game) {
//       return res.status(404).json({ message: "Game not found" });
//     }

//     const openTimeIST = moment(game.openDateTime).tz("Asia/Kolkata");
//     const closeTimeIST = moment(game.closeDateTime).tz("Asia/Kolkata");

//     // ✅ Check bet timing
//     if (userBetDateIST.isBefore(openTimeIST)) {
//       return res.status(400).json({
//         message: "Betting has not opened yet for this game",
//         gameOpenTime: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//         userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
//       });
//     }
//     if (userBetDateIST.isAfter(closeTimeIST)) {
//       return res.status(400).json({
//         message: "Betting has already closed for this game",
//         gameCloseTime: closeTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//         userTime: userBetDateIST.format("YYYY-MM-DD HH:mm:ss")
//       });
//     }

//     // ✅ Fetch user
//     const user = await User.findById(req.user._id);
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // ✅ Check wallet balance
//     if (user.wallet.balance < betAmount) {
//       return res.status(400).json({ message: "Insufficient wallet balance" });
//     }

//     // ✅ Deduct wallet balance
//     user.wallet.balance -= betAmount;
//     await user.save();

//     // ✅ Check if user already has a bet for this game
//     let bet = await Bet.findOne({ user: user._id, game: game._id });
//     if (bet) {
//       // 🟢 Check if betNumber is different
//       if (bet.betNumber !== betNumber) {
//         // Save previous number to history
//         if (!bet.betNumbersHistory.includes(bet.betNumber)) {
//           bet.betNumbersHistory.push(bet.betNumber);
//         }
//         // Update betNumber
//         bet.betNumber = betNumber;
//       }
//       // Increment betAmount
//       bet.betAmount += betAmount;
//       await bet.save();
//     } else {
//       // 🆕 Create new bet
//       bet = new Bet({
//         user: user._id,
//         game: game._id,
//         betNumber,
//         betAmount,
//         gameType: 'regular', // Default for now
//         betDate: userBetDateUTC
//       });
//       await bet.save();
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Bet placed successfully",
//       bet,
//       walletBalance: user.wallet.balance,
//       userBetTimeIST: userBetDateIST.format("YYYY-MM-DD HH:mm:ss"),
//       gameOpenTimeIST: openTimeIST.format("YYYY-MM-DD HH:mm:ss"),
//       gameCloseTimeIST: closeTimeIST.format("YYYY-MM-DD HH:mm:ss")
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

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
router.get('/testing-hardgame',  async (req, res) => {
  try {
    const hardGames = await HardGame.find().sort({ createdAt: -1 }); // latest first
    res.status(200).json({
      message: 'Hard games fetched successfully',
      hardGames: hardGames
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
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
    System

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
// 🪙 GET /api/user/wallet
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id; // ✅ Get logged-in user ID from auth middleware

    // Find the user by ID
    const user = await User.findById(userId).select('wallet'); // only get wallet field
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Wallet retrieved successfully',
      wallet: user.wallet
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
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
//hardgames users history
router.get('/hardgame/user/historys', authMiddleware, async (req, res) => {
  try {
    // ✅ Get the user ID from the token
    const userId = req.user._id;

    // ✅ Fetch the user's hard game history
    const userResults = await HardGame.find({ user: userId })
      .populate('user', 'username email profileImage') // Fetch user details
      .sort({ createdAt: -1 }); // Latest first

    if (!userResults || userResults.length === 0) {
      return res.status(404).json({ message: 'No hard game results found for this user.' });
    }

    res.status(200).json({
      message: 'Hard Game results fetched successfully',
      totalResults: userResults.length,
      results: userResults
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// ✅ Get all notices (latest first)
router.get('/notices', async (req, res) => {
  try {
    const notices = await Notice.find()
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Notices retrieved successfully',
      notices
    });
  } catch (err) {
    console.error('Get Notices Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;