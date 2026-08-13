// Replace your backend/src/routes/matches.js with this fixed version

const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const Event = require('../models/Event');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

// Helper function to get events where user is organizer (with error handling)
async function getOrganizerEvents(userId) {
  try {
    const events = await Event.find({ 
      $or: [
        { organizer: userId },
        { admins: userId }
      ]
    }).select('_id');
    return events.map(e => e._id);
  } catch (error) {
    console.error('Error getting organizer events:', error);
    return [];
  }
}

// @route   GET /api/matches
// @desc    Get user's matches
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    console.log('Loading matches for user:', req.user.id);
    
    // Get user's organized events first
    const organizerEventIds = await getOrganizerEvents(req.user.id);
    console.log('User organizes events:', organizerEventIds);

    // Build query to find matches
    const matchQuery = {
      $or: [
        { individual: req.user.id }, // User applied to events
        { event: { $in: organizerEventIds } } // User's events that others applied to
      ],
      status: 'active'
    };

    console.log('Match query:', JSON.stringify(matchQuery, null, 2));

    // Find matches with proper population
    const matches = await Match.find(matchQuery)
      .populate({
        path: 'individual',
        select: 'name photos',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'event',
        select: 'name photos type eventDate organizer',
        populate: {
          path: 'organizer',
          select: 'name photos'
        },
        options: { strictPopulate: false }
      })
      .sort('-lastMessageAt -acceptedAt')
      .lean(); // Use lean() for better performance

    console.log(`Found ${matches.length} matches`);

    // Filter out any matches with missing data
    const validMatches = matches.filter(match => {
      const hasValidEvent = match.event && match.event._id;
      const hasValidIndividual = match.individual && match.individual._id;
      
      if (!hasValidEvent || !hasValidIndividual) {
        console.warn('Filtering out invalid match:', match._id);
        return false;
      }
      
      return true;
    });

    console.log(`Returning ${validMatches.length} valid matches`);

    res.json({ 
      success: true, 
      data: validMatches,
      debug: {
        totalFound: matches.length,
        validMatches: validMatches.length,
        userOrganizedEvents: organizerEventIds.length
      }
    });

  } catch (error) {
    console.error('Error in GET /matches:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error loading matches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/matches/:id
// @desc    Get single match details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('individual', 'name photos bio interests')
      .populate({
        path: 'event',
        populate: {
          path: 'organizer',
          select: 'name photos'
        }
      });

    if (!match) {
      return res.status(404).json({ 
        success: false, 
        message: 'Match not found' 
      });
    }

    // Verify user has access to this match
    const userEvents = await getOrganizerEvents(req.user.id);
    const hasAccess = match.individual._id.toString() === req.user.id ||
                      userEvents.some(eventId => eventId.toString() === match.event._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view this match' 
      });
    }

    res.json({ success: true, data: match });
  } catch (error) {
    console.error('Error in GET /matches/:id:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/matches/:id/unmatch
// @desc    Unmatch/leave an event
// @access  Private
router.put('/:id/unmatch', protect, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);

    if (!match) {
      return res.status(404).json({ 
        success: false, 
        message: 'Match not found' 
      });
    }

    // Update match status
    match.status = 'cancelled';
    await match.save();

    // Update event attendee count if it's an event
    try {
      const event = await Event.findById(match.event);
      if (event && event.type === 'event') {
        event.currentAttendees = Math.max(0, event.currentAttendees - 1);
        await event.save();
      }
    } catch (eventError) {
      console.error('Error updating event attendee count:', eventError);
      // Don't fail the whole request if this fails
    }

    res.json({ success: true, message: 'Unmatched successfully' });
  } catch (error) {
    console.error('Error in PUT /matches/:id/unmatch:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;