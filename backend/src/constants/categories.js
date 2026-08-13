// backend/src/routes/categories.js
const express = require('express');
const router = express.Router();
const { CATEGORIES_ARRAY } = require('../constants/categories');

// @route   GET /api/categories
// @desc    Get all available categories
// @access  Public
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: CATEGORIES_ARRAY
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/categories/:id
// @desc    Get single category details
// @access  Public
router.get('/:id', (req, res) => {
  try {
    const category = CATEGORIES_ARRAY.find(cat => cat.id === req.params.id);
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;