// routes/spinnerGame.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const HardGame = require('../models/HardGame');
const User = require('../models/User');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

// const authMiddleware = require('../middleware/authMiddleware');


// ==================== GAME MANAGEMENT ====================
const adminAuthMiddleware = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
      // 🛠 Use the correct key here
      const admin = await Admin.findById(decoded.adminId);
  
      if (!admin || !admin.isActive) {
        return res.status(401).json({ message: 'Invalid admin token' });
      }
  
      req.admin = admin;
      next();
    } catch (error) {
      console.error("Token verification failed:", error);
      res.status(401).json({ message: 'Invalid token' });
    }
  };
  
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
          return res.status(401).json({ message: 'No token provided' });
        }
    
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'Apple');
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

// Create a new game round (Admin only)

// Updated Admin Create Game Round API
router.post('/admin/create-game-round', adminAuthMiddleware, async (req, res) => {
    try {
      const { gameName, resultInterval } = req.body; // Changed from nextResultTime to resultInterval
  
      // Validate result interval (should be positive number in minutes)
      if (!resultInterval || resultInterval <= 0) {
        return res.status(400).json({ message: 'Result interval must be a positive number (in minutes)' });
      }
  
      // Calculate next result time from current time + result interval
      const nextResultTime = new Date(Date.now() + resultInterval * 60 * 1000);
  
      // Create a template game round (no specific user, but with calculated next result time)
      const gameRound = new HardGame({
        gameName: gameName || 'Spinner Game',
        resultInterval: resultInterval, // Store interval for reference
        nextResultTime: nextResultTime, // Calculate from current time + interval
        status: 'pending'
      });
  
      await gameRound.save();
  
      res.status(201).json({
        message: 'Game round template created successfully',
        gameRound: {
          _id: gameRound._id,
          gameName: gameRound.gameName,
          resultInterval: gameRound.resultInterval,
          nextResultTime: gameRound.nextResultTime
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
// Updated Admin Create Game Round API
// router.post('/admin/create-game-round', adminAuthMiddleware, async (req, res) => {
//     try {
//       const { gameName, resultInterval } = req.body; // Changed from nextResultTime to resultInterval
  
//       // Validate result interval (should be positive number in minutes)
//       if (!resultInterval || resultInterval <= 0) {
//         return res.status(400).json({ message: 'Result interval must be a positive number (in minutes)' });
//       }
  
//       // Create a template game round (no specific user, no next result time yet)
//       const gameRound = new HardGame({
//         gameName: gameName || 'Spinner Game',
//         resultInterval: resultInterval, // Store interval instead of fixed time
//         nextResultTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Set far future as placeholder
//         status: 'pending'
//       });
  
//       await gameRound.save();
  
//       res.status(201).json({
//         message: 'Game round template created successfully',
//         gameRound: {
//           _id: gameRound._id,
//           gameName: gameRound.gameName,
//           resultInterval: gameRound.resultInterval
//         }
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Server error', error: error.message });
//     }
//   });

// Get active game rounds
router.get('/active-games', async (req, res) => {
  try {
    const currentTime = new Date();
    
    // Find games where result time is in future and no result declared
    const activeGames = await HardGame.find({
      nextResultTime: { $gt: currentTime },
      resultNumber: { $exists: false }
    }).select('_id gameName nextResultTime').sort({ nextResultTime: 1 });

    res.status(200).json({
      message: 'Active games retrieved successfully',
      games: activeGames
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/admin/game-rounds', async (req, res) => {
    try {
      const gameRounds = await HardGame.find().select('gameName resultInterval nextResultTime');
  
      res.status(200).json({
        message: 'Game rounds fetched successfully',
        gameRounds: gameRounds
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  

// ==================== USER BETTING ====================

// Place bet on spinner game
// router.post('/user/place-bet', authMiddleware, async (req, res) => {
//   try {
//     const { gameId, selectedNumber, betAmount } = req.body;

//     // Validate inputs
//     if (!mongoose.Types.ObjectId.isValid(gameId)) {
//       return res.status(400).json({ message: 'Invalid game ID' });
//     }
//     if (selectedNumber < 0 || selectedNumber > 9) {
//       return res.status(400).json({ message: 'Selected number must be between 0 and 9' });
//     }
//     if (betAmount <= 0) {
//       return res.status(400).json({ message: 'Bet amount must be greater than 0' });
//     }

//     // Find the game round
//     const gameRound = await HardGame.findById(gameId);
//     if (!gameRound) {
//       return res.status(404).json({ message: 'Game round not found' });
//     }

//     // Check if game is still accepting bets
//     if (new Date() >= gameRound.nextResultTime) {
//       return res.status(400).json({ message: 'Betting time has expired for this game' });
//     }

//     // Check if result already declared
//     if (gameRound.resultNumber !== undefined && gameRound.resultNumber !== null) {
//       return res.status(400).json({ message: 'Result already declared for this game' });
//     }

//     // Fetch user and check wallet balance
//     const user = await User.findById(req.user._id);
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (user.wallet < betAmount) {
//       return res.status(400).json({ message: 'Insufficient wallet balance' });
//     }

//     // Check if user already bet on this game
//     const existingBet = await HardGame.findOne({
//       user: req.user._id,
//       nextResultTime: gameRound.nextResultTime,
//       betAmount: { $exists: true }
//     });

//     if (existingBet) {
//       return res.status(400).json({ message: 'You have already placed a bet on this game round' });
//     }

//     // Deduct amount from wallet
//     user.wallet -= betAmount;
//     console.log("users wallet balance : "+user.wallet);
//     await user.save();

//     // Create user bet record
//     const userBet = new HardGame({
//       user: req.user._id,
//       gameName: gameRound.gameName,
//       betAmount,
//       selectedNumber,
//       nextResultTime: gameRound.nextResultTime,
//       status: 'pending'
//     });

//     await userBet.save();

//     res.status(201).json({
//       message: 'Bet placed successfully',
//       walletBalance: user.walletBalance,
//       userBet: {
//         _id: userBet._id,
//         selectedNumber: userBet.selectedNumber,
//         betAmount: userBet.betAmount,
//         status: userBet.status,
//         nextResultTime: userBet.nextResultTime
//       }
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// Updated User Play Game API
router.post('/play-game', authMiddleware, async (req, res) => {
    try {
      const { gameId, betAmount, selectedNumber } = req.body;
      const userId = req.user.id;
  
      // Validate inputs
      if (!gameId || !betAmount || selectedNumber === undefined) {
        return res.status(400).json({ message: 'Game ID, bet amount, and selected number are required' });
      }
  
      if (betAmount < 1 || selectedNumber < 0 || selectedNumber > 9) {
        return res.status(400).json({ message: 'Invalid bet amount or selected number' });
      }
  
      // Find the game template
      const gameTemplate = await HardGame.findById(gameId);
      if (!gameTemplate) {
        return res.status(404).json({ message: 'Game not found' });
      }
  
      // Check if user has already played this game
      const existingPlay = await HardGame.findOne({
        gameName: gameTemplate.gameName,
        user: userId,
        status: 'pending'
      });
  
      if (existingPlay) {
        return res.status(400).json({ message: 'You have already played this game. Wait for result.' });
      }
  
      // Calculate next result time based on current time + interval
      const nextResultTime = new Date(Date.now() + gameTemplate.resultInterval * 60 * 1000);
  
      // Create user's game entry
      const userGame = new HardGame({
        gameName: gameTemplate.gameName,
        user: userId,
        betAmount: betAmount,
        selectedNumber: selectedNumber,
        nextResultTime: nextResultTime,
        resultInterval: gameTemplate.resultInterval,
        status: 'pending'
      });
  
      await userGame.save();
  
      res.status(201).json({
        message: 'Game played successfully',
        game: {
          _id: userGame._id,
          gameName: userGame.gameName,
          betAmount: userGame.betAmount,
          selectedNumber: userGame.selectedNumber,
          nextResultTime: userGame.nextResultTime,
          status: userGame.status
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
// ==================== ADMIN RESULT DECLARATION ====================

// Admin declares result
// Admin API to declare results
router.post('/admin/declare-result', adminAuthMiddleware, async (req, res) => {
    try {
      const { gameId, resultNumber } = req.body;
  
      // Validate inputs
      if (!mongoose.Types.ObjectId.isValid(gameId)) {
        return res.status(400).json({ message: 'Invalid game ID' });
      }
      if (resultNumber < 0 || resultNumber > 9) {
        return res.status(400).json({ message: 'Result number must be between 0 and 9' });
      }
  
      // Find the specific game round
      const game = await HardGame.findById(gameId);
  
      if (!game) {
        return res.status(404).json({ message: 'Game round not found' });
      }
  
      if (game.status !== 'pending') {
        return res.status(400).json({ message: 'Result already declared for this game' });
      }
  
      // Update game result
      game.resultNumber = resultNumber;
  
      if (game.selectedNumber === resultNumber) {
        game.status = 'won';
        game.winningAmount = game.betAmount * 9; // 9x multiplier for win
      } else {
        game.status = 'lost';
        game.winningAmount = 0;
      }
  
      await game.save();
  
      res.status(200).json({
        message: 'Result declared successfully',
        gameId: game._id,
        resultNumber: resultNumber,
        status: game.status,
        winningAmount: game.winningAmount
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
// router.post('/admin/declare-result', adminAuthMiddleware, async (req, res) => {
//   try {
//     const { gameId, resultNumber } = req.body;

//     // Validate inputs
//     if (!mongoose.Types.ObjectId.isValid(gameId)) {
//       return res.status(400).json({ message: 'Invalid game ID' });
//     }
//     if (resultNumber < 0 || resultNumber > 9) {
//       return res.status(400).json({ message: 'Result number must be between 0 and 9' });
//     }

//     // Find the game round
//     const gameRound = await HardGame.findById(gameId);
//     if (!gameRound) {
//       return res.status(404).json({ message: 'Game round not found' });
//     }

//     // Check if result already declared
//     if (gameRound.resultNumber !== undefined && gameRound.resultNumber !== null) {
//       return res.status(400).json({ message: 'Result already declared for this game' });
//     }

//     // Check if result time has passed
//     // if (new Date() < gameRound.nextResultTime) {
//     //   return res.status(400).json({ message: 'Cannot declare result before scheduled time' });
//     // }

//     // Find all bets for this game round
//     const userBets = await HardGame.find({
//       nextResultTime: gameRound.nextResultTime,
//       user: { $exists: true },
//       betAmount: { $exists: true }
//     }).populate('user');

//     let totalWinnings = 0;
//     let totalEarnings = 0;

//     // Process each bet
//     for (let bet of userBets) {
//       if (bet.selectedNumber === resultNumber) {
//         // User won
//         const winningAmount = bet.betAmount * 9; // 9x multiplier
//         bet.status = 'won';
//         bet.winningAmount = winningAmount;
//         bet.resultNumber = resultNumber;

//         // Credit winning to user wallet
//         const user = await User.findById(bet.user._id);
//         user.wallet = Number(user.wallet) + winningAmount;

//         await user.save();

//         totalWinnings += winningAmount;
//       } else {
//         // User lost
//         bet.status = 'lost';
//         bet.winningAmount = 0;
//         bet.resultNumber = resultNumber;
//         totalEarnings += bet.betAmount; // Admin earns the bet amount
//       }
      
//       await bet.save();
//     }

//     // Update admin earnings
//     const admin = await Admin.findById(req.admin._id);
//     admin.earnings += totalEarnings;
//     await admin.save();

//     // Update the game round with result
//     gameRound.resultNumber = resultNumber;
//     gameRound.status = 'completed';
//     await gameRound.save();

//     res.status(200).json({
//       message: 'Result declared successfully',
//       resultNumber,
//       totalBets: userBets.length,
//       totalWinnings,
//       totalEarnings,
//       gameRound
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// ==================== USER RESULT CHECKING ====================

// Check result for a specific bet
router.get('/user/check-result/:betId', authMiddleware, async (req, res) => {
  try {
    const { betId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(betId)) {
      return res.status(400).json({ message: 'Invalid bet ID' });
    }

    const bet = await HardGame.findOne({
      _id: betId,
      user: req.user._id
    });

    if (!bet) {
      return res.status(404).json({ message: 'Bet not found' });
    }

    let message;
    if (bet.status === 'pending') {
      message = 'Result not yet declared. Please wait.';
    } else if (bet.status === 'won') {
      message = `Congratulations! You won ₹${bet.winningAmount}. Amount credited to your account.`;
    } else {
      message = 'Sorry, you lost this round. Better luck next time!';
    }

    res.status(200).json({
      message,
      bet: {
        _id: bet._id,
        selectedNumber: bet.selectedNumber,
        resultNumber: bet.resultNumber,
        betAmount: bet.betAmount,
        winningAmount: bet.winningAmount,
        status: bet.status,
        gameDate: bet.gameDate
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's betting history
router.get('/user/betting-history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const bets = await HardGame.find({
      user: req.user._id,
      betAmount: { $exists: true }
    })
    .sort({ gameDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .select('selectedNumber resultNumber betAmount winningAmount status gameDate nextResultTime');

    const total = await HardGame.countDocuments({
      user: req.user._id,
      betAmount: { $exists: true }
    });

    res.status(200).json({
      message: 'Betting history retrieved successfully',
      bets,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalBets: total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get game statistics
router.get('/user/game-stats', authMiddleware, async (req, res) => {
  try {
    const stats = await HardGame.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          betAmount: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalWagered: { $sum: '$betAmount' },
          totalWon: { $sum: '$winningAmount' },
          gamesWon: {
            $sum: {
              $cond: [{ $eq: ['$status', 'won'] }, 1, 0]
            }
          },
          gamesLost: {
            $sum: {
              $cond: [{ $eq: ['$status', 'lost'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const userStats = stats[0] || {
      totalBets: 0,
      totalWagered: 0,
      totalWon: 0,
      gamesWon: 0,
      gamesLost: 0
    };

    userStats.winRate = userStats.totalBets > 0 
      ? ((userStats.gamesWon / userStats.totalBets) * 100).toFixed(2) 
      : 0;

    res.status(200).json({
      message: 'Game statistics retrieved successfully',
      stats: userStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==================== ADMIN DASHBOARD ====================

// Get all game rounds (Admin)
router.get('/admin/game-rounds', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }

    const gameRounds = await HardGame.find({
      ...query,
      user: { $exists: false } // Only get game rounds, not user bets
    })
    .sort({ nextResultTime: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await HardGame.countDocuments({
      ...query,
      user: { $exists: false }
    });

    res.status(200).json({
      message: 'Game rounds retrieved successfully',
      gameRounds,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRounds: total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get detailed game analysis (Admin)
router.get('/admin/game-analysis/:gameId', adminAuthMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'Invalid game ID' });
    }

    const gameRound = await HardGame.findById(gameId);
    if (!gameRound) {
      return res.status(404).json({ message: 'Game round not found' });
    }

    // Get all bets for this game round
    const bets = await HardGame.find({
      nextResultTime: gameRound.nextResultTime,
      user: { $exists: true }
    }).populate('user', 'username email');

    // Calculate statistics
    const totalBets = bets.length;
    const totalWagered = bets.reduce((sum, bet) => sum + bet.betAmount, 0);
    const totalWinnings = bets.reduce((sum, bet) => sum + bet.winningAmount, 0);
    const winners = bets.filter(bet => bet.status === 'won').length;
    const losers = bets.filter(bet => bet.status === 'lost').length;

    // Number distribution
    const numberDistribution = {};
    for (let i = 0; i <= 9; i++) {
      numberDistribution[i] = bets.filter(bet => bet.selectedNumber === i).length;
    }

    res.status(200).json({
      message: 'Game analysis retrieved successfully',
      gameRound,
      analysis: {
        totalBets,
        totalWagered,
        totalWinnings,
        adminEarnings: totalWagered - totalWinnings,
        winners,
        losers,
        numberDistribution
      },
      bets
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;