// backend/src/middleware/upload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const path = require('path');

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine folder based on the route
    let folder = 'drpn';
    
    if (req.baseUrl.includes('users')) {
      folder = 'drpn/users';
    } else if (req.baseUrl.includes('events')) {
      folder = 'drpn/events';
    }
    
    // Generate a unique filename. The original name is client-controlled,
    // so it's sanitized before touching any Cloudinary param (arbitrary
    // argument injection via '&'-bearing params - GHSA-g4mf-96x5-5m2c).
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = path.parse(file.originalname).name
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 60) || 'photo';
    const publicId = `${safeName}-${uniqueSuffix}`;

    return {
      folder: folder,
      public_id: publicId,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [
        { 
          width: 1200, 
          height: 1200, 
          crop: 'limit',
          quality: 'auto:good',
          fetch_format: 'auto'
        }
      ],
      // Add tags for easier management
      tags: ['drpn', req.baseUrl.includes('users') ? 'user-photo' : 'event-photo']
    };
  }
});

// Configure multer with file validation
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed`), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 5 files'
      });
    }
  }
  next(err);
};

module.exports = { 
  upload, 
  handleMulterError 
};