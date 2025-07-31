const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const Settings = require('../models/AdminSetting');
const Admin = require('../models/Admin');
const cloudinary = require('../utils/cloudinary'); // adjust path
const fs = require('fs');
// Use Multer with memoryStorage since we don't need to store files locally
const storage = multer.memoryStorage();
const streamifier = require('streamifier');

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});
// Middleware to verify admin token
const adminMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const secret = process.env.JWT_SECRET || 'Apple';
    const decoded = jwt.verify(token, secret);

    const admin = await Admin.findById(decoded.adminId || decoded.userId);
    if (!admin) return res.status(401).json({ message: 'Admin not found' });

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};
// GET: Get current settings
router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    res.json({ message: 'Settings retrieved successfully', settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// PUT: Update payment details
router.put('/settings/payment-details', adminMiddleware, async (req, res) => {
  try {
    const { bankDetails, upiDetails, paytmDetails, googlePayDetails } = req.body;

    let settings = await Settings.findOne({});
    if (!settings) settings = new Settings({});

    if (bankDetails) settings.adminPaymentDetails.bankDetails = {
      ...settings.adminPaymentDetails.bankDetails,
      ...bankDetails
    };

    if (upiDetails) settings.adminPaymentDetails.upiDetails = {
      ...settings.adminPaymentDetails.upiDetails,
      ...upiDetails
    };

    if (paytmDetails) settings.adminPaymentDetails.paytmDetails = {
      ...settings.adminPaymentDetails.paytmDetails,
      ...paytmDetails
    };

    if (googlePayDetails) settings.adminPaymentDetails.googlePayDetails = {
      ...settings.adminPaymentDetails.googlePayDetails,
      ...googlePayDetails
    };

    await settings.save();

    res.json({
      message: 'Payment details updated successfully',
      settings: settings.adminPaymentDetails
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// POST: Upload QR code for a specific payment method
router.post('/settings/upload-qr/:paymentType', adminMiddleware, upload.single('qrCode'), async (req, res) => {
    try {
      const { paymentType } = req.params;
  
      if (!req.file) {
        return res.status(400).json({ message: 'QR code image is required' });
      }
  
      if (!['upi', 'paytm', 'googlepay'].includes(paymentType)) {
        return res.status(400).json({ message: 'Invalid payment type' });
      }
  
      // Stream upload to Cloudinary
      const uploadToCloudinary = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'qr-codes',
              resource_type: 'image'
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };
      
  
      const result = await uploadToCloudinary();
      const qrCodeUrl = result.secure_url;
  
      // Update settings
      let settings = await Settings.findOne({});
      if (!settings) settings = new Settings({});
  
      if (paymentType === 'upi') {
        settings.adminPaymentDetails.upiDetails.qrCodeUrl = qrCodeUrl;
      } else if (paymentType === 'paytm') {
        settings.adminPaymentDetails.paytmDetails.qrCodeUrl = qrCodeUrl;
      } else if (paymentType === 'googlepay') {
        settings.adminPaymentDetails.googlePayDetails.qrCodeUrl = qrCodeUrl;
      }
  
      await settings.save();
  
      res.json({
        message: `${paymentType.toUpperCase()} QR code uploaded successfully`,
        qrCodeUrl
      });
  
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
module.exports = router;
