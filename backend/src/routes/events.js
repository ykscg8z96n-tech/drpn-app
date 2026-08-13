// backend/src/routes/events.js - COMPLETE FILE - FIXED
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const Match = require('../models/Match');
const { protect, organizer, premium } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Define valid categories directly in this file
const VALID_CATEGORIES = ['tabletop', 'cards', 'fantasy', 'sports', 'golf', 'health'];

// @route   POST /api/events/fix-missing-matches
// @desc    Create missing matches for already accepted applications (one-time fix)
// @access  Private
router.post('/fix-missing-matches', protect, async (req, res) => {
  try {
    console.log('Starting to fix missing matches...');
    
    // Find all events with accepted applications
    const events = await Event.find({
      'applicants.status': 'accepted'
    });

    let matchesCreated = 0;
    let matchesSkipped = 0;

    for (const event of events) {
      const acceptedApplicants = event.applicants.filter(app => app.status === 'accepted');
      
      for (const applicant of acceptedApplicants) {
        // Check if match already exists
        const existingMatch = await Match.findOne({
          individual: applicant.userId,
          event: event._id
        });

        if (!existingMatch) {
          // Create the missing match
          const newMatch = new Match({
            individual: applicant.userId,
            event: event._id,
            status: 'active',
            matchedAt: applicant.respondedAt || new Date()
          });

          await newMatch.save();
          matchesCreated++;
          console.log(`Created match: User ${applicant.userId} <-> Event ${event._id}`);
        } else {
          matchesSkipped++;
        }
      }
    }

    console.log(`Fix complete: ${matchesCreated} matches created, ${matchesSkipped} already existed`);

    res.json({
      success: true,
      message: 'Missing matches fix completed',
      data: {
        matchesCreated,
        matchesSkipped,
        totalProcessed: matchesCreated + matchesSkipped
      }
    });

  } catch (error) {
    console.error('Error fixing missing matches:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing missing matches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/events/nearby
// @desc    Get nearby events/groups based on location
// @access  Private
router.get('/nearby', protect, async (req, res) => {
  try {
    const { 
      latitude = 0, 
      longitude = 0, 
      radius = 50000, // Default 50km
      type, // 'event', 'group', or undefined for both
      category, // CHANGED: Single category filter instead of interests
      page = 1,
      limit = 20,
      showAll = false // Debug parameter
    } = req.query;
    
    console.log('🔍 Fetching nearby events with params:', {
      latitude, longitude, radius, type, category, page, limit
    });
    
    // Get user's swipes efficiently
    let swipedEventIds = [];
    try {
      const user = await User.findById(req.user.id).select('swipes').lean();
      swipedEventIds = user?.swipes?.map(swipe => swipe.targetId) || [];
    } catch (userError) {
      console.warn('⚠️ Failed to get user swipes:', userError.message);
    }
    
    // Build query
    const query = {
      isActive: true,
      isArchived: { $ne: true },
      organizer: { $ne: req.user.id }
    };
    
    if (swipedEventIds.length > 0) {
      query._id = { $nin: swipedEventIds };
    }
    
    // CHANGED: Add category filter instead of interests
    if (category && VALID_CATEGORIES.includes(category)) {
      query.category = category;
    }
    
    // Add type filter
    if (type && ['event', 'group'].includes(type)) {
      query.type = type;
    }
    
    // For events, only show future ones
    if (type === 'event' || !type) {
      query.$or = [
        { type: 'group' },
        { type: 'event', eventDate: { $gte: new Date() } }
      ];
    }
    
    // Add geospatial query if coordinates are valid
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const hasValidCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    
    if (hasValidCoords && !showAll) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: parseInt(radius)
        }
      };
    }
    
    console.log('🔍 MongoDB query:', JSON.stringify(query, null, 2));
    
    // Execute query with timeout protection
    const events = await Promise.race([
      Event.find(query)
        .populate('organizer', 'name photos')
        .sort({ boostLevel: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 8000)
      )
    ]);
    
    console.log(`✅ Found ${events.length} events`);
    
    res.json({
      success: true,
      data: events,
      page: parseInt(page),
      hasMore: events.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error(`❌ Error fetching events:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch events',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
});

// @route   POST /api/events
// @desc    Create new event or group - UPDATED VALIDATION
// @access  Private
router.post('/', [protect, 
  body('type').isIn(['event', 'group']).withMessage('Type must be event or group'),
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('category').isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`), // CHANGED from interests
  body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Location coordinates must be an array of 2 numbers'),
  body('location.address').notEmpty().trim().withMessage('Location address is required')
], async (req, res) => {
  try {
    console.log('📝 Creating event with data:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ 
        success: false, 
        errors: errors.array(),
        message: 'Validation failed'
      });
    }
    
    // Type-specific validation
    if (req.body.type === 'event') {
      if (!req.body.eventDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Event date is required for events' 
        });
      }
      if (!req.body.capacity || req.body.capacity < 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid capacity is required for events' 
        });
      }
      // Check if date is in the future
      if (new Date(req.body.eventDate) <= new Date()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Event date must be in the future' 
        });
      }
    } else if (req.body.type === 'group') {
      if (!req.body.groupSize || req.body.groupSize < 2) {
        return res.status(400).json({ 
          success: false, 
          message: 'Group size must be at least 2' 
        });
      }
      if (!req.body.meetingFrequency) {
        return res.status(400).json({ 
          success: false, 
          message: 'Meeting frequency is required for groups' 
        });
      }
    }
    
    // Create event data
    const eventData = {
      ...req.body,
      organizer: req.user.id,
      admins: [req.user.id],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('💾 Creating event in database...');
    const event = await Event.create(eventData);
    
    // Update user to organizer if not already
    if (!req.user.isOrganizer) {
      await User.findByIdAndUpdate(req.user.id, { isOrganizer: true });
      console.log('👤 Updated user to organizer status');
    }
    
    console.log('✅ Event created successfully:', event._id);
    
    res.status(201).json({
      success: true,
      data: event,
      message: `${req.body.type === 'event' ? 'Event' : 'Group'} created successfully!`
    });
    
  } catch (error) {
    console.error('❌ Error creating event:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({ 
        success: false, 
        message: 'Database validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/events/:id
// @desc    Update an event (organizer only) - UPDATED VALIDATION
// @access  Private
router.put('/:id', [protect,
  body('name').optional().notEmpty().trim(),
  body('description').optional().notEmpty().trim(),
  body('category').optional().isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`) // CHANGED from interests
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if user is organizer or admin
    if (event.organizer.toString() !== req.user.id && !event.admins.includes(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // CHANGED: Update allowed fields to include category instead of interests
    const allowedUpdates = ['name', 'description', 'category', 'eventDate', 'capacity', 'groupSize', 'meetingFrequency', 'ageRange', 'genderPreference', 'location', 'isPublic'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    updates.updatedAt = new Date();
    
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('organizer', 'name photos');
    
    res.json({
      success: true,
      data: updatedEvent
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/events/:id/applicants
// @desc    Get event applicants (organizer only)
// @access  Private
router.get('/:id/applicants', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('applicants.userId', 'name photos age bio')
      .populate('organizer', 'name');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if user is organizer or admin
    if (event.organizer._id.toString() !== req.user.id && !event.admins.includes(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view applicants' });
    }
    
    // Return only the applicants data with populated user info
    res.json({
      success: true,
      data: event.applicants,
      eventInfo: {
        name: event.name,
        type: event.type,
        capacity: event.capacity || event.groupSize
      }
    });
  } catch (error) {
    console.error('Error fetching applicants:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/decide
// @desc    Accept or reject an application
// @access  Private (Organizer only)
router.post('/:id/decide', protect, async (req, res) => {
  try {
    const { userId, decision } = req.body;
    
    if (!userId || !decision) {
      return res.status(400).json({
        success: false,
        message: 'UserId and decision are required'
      });
    }

    if (!['accept', 'reject'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Decision must be accept or reject'
      });
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user is the organizer
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage this event'
      });
    }

    // Find the application
    const application = event.applicants.find(
      app => app.userId.toString() === userId.toString()
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Application already processed'
      });
    }

    // Update application status
    application.status = decision === 'accept' ? 'accepted' : 'rejected';
    application.respondedAt = new Date();

    // If accepting, create a Match record
    if (decision === 'accept') {
      try {
        // Check if match already exists (shouldn't happen, but safety check)
        const existingMatch = await Match.findOne({
          individual: userId,
          event: event._id
        });

        if (!existingMatch) {
          const newMatch = new Match({
            individual: userId,
            event: event._id,
            status: 'active',
            matchedAt: new Date()
          });

          await newMatch.save();
          console.log(`Created match: User ${userId} <-> Event ${event._id}`);
        } else {
          console.log(`Match already exists: User ${userId} <-> Event ${event._id}`);
        }
      } catch (matchError) {
        console.error('Error creating match:', matchError);
        // Don't fail the entire request if match creation fails
        // The application will still be accepted
      }
    }

    // Save the event with updated application status
    await event.save();

    // Update the user's eventsJoined status as well
    try {
      const user = await User.findById(userId);
      
      if (user) {
        const joinedEvent = user.eventsJoined.find(
          joined => joined.eventId.toString() === event._id.toString()
        );
        
        if (joinedEvent) {
          joinedEvent.status = decision;
          await user.save();
          console.log(`Updated user's eventsJoined status to: ${decision}`);
        }
      }
    } catch (userUpdateError) {
      console.error('Error updating user eventsJoined:', userUpdateError);
      // Don't fail the request if user update fails
    }

    res.json({
      success: true,
      message: `Application ${decision}ed successfully`,
      data: {
        eventId: event._id,
        userId: userId,
        decision: decision,
        matchCreated: decision === 'accept'
      }
    });

  } catch (error) {
    console.error('Error in /events/:id/decide:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/events/:id
// @desc    Get single event details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'name photos')
      .populate('applicants.userId', 'name photos');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/events/:id
// @desc    Delete an event (organizer only)
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if user is organizer
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // Soft delete - archive instead of removing
    await Event.findByIdAndUpdate(req.params.id, {
      isActive: false,
      isArchived: true,
      archivedAt: new Date()
    });
    
    res.json({
      success: true,
      message: 'Event archived successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/events/organizer/my-events
// @desc    Get organizer's events
// @access  Private
router.get('/organizer/my-events', protect, async (req, res) => {
  try {
    const events = await Event.find({ 
      organizer: req.user.id,
      isArchived: { $ne: true }
    })
    .populate('organizer', 'name photos')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/invite
// @desc    Generate invite code for event
// @access  Private
router.post('/:id/invite', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if user can manage this event
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // Generate invite code
    const inviteCode = event.generateInviteCode(req.user.id);
    await event.save();
    
    // Create shareable URL (you can customize this)
    const shareUrl = `${process.env.FRONTEND_URL || 'https://yourapp.com'}/join/${inviteCode}`;
    
    res.json({
      success: true,
      data: {
        inviteCode,
        shareUrl,
        eventName: event.name,
        eventType: event.type
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/join/:code
// @desc    Join event using invite code
// @access  Private
router.post('/join/:code', protect, async (req, res) => {
  try {
    const inviteCode = req.params.code.toUpperCase();
    
    // Find event with this invite code
    const event = await Event.findOne({
      'inviteCodes.code': inviteCode,
      'inviteCodes.isActive': true
    }).populate('organizer', 'name');
    
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired invite code' 
      });
    }
    
    // Check if user already applied
    if (event.hasUserApplied(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied to this event'
      });
    }
    
    // Add user to applicants
    event.applicants.push({
      userId: req.user.id,
      inviteCode: inviteCode,
      status: 'pending'
    });
    
    // Mark invite code as used
    event.useInviteCode(inviteCode, req.user.id);
    
    await event.save();
    
    res.json({
      success: true,
      data: event,
      message: `Successfully applied to ${event.name}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/fix-missing-participations  
// @desc    Create missing participation records for accepted applications
// @access  Private
router.post('/fix-missing-participations', protect, async (req, res) => {
  try {
    console.log('🔧 Starting to fix missing participations...');
    
    const Participation = require('../models/Participation');
    
    // Find all events with accepted applications
    const events = await Event.find({
      'applicants.status': 'accepted'
    }).populate('applicants.userId', 'name email');

    let participationsCreated = 0;
    let participationsSkipped = 0;
    let errors = [];

    for (const event of events) {
      console.log(`📋 Processing event: ${event.name} (${event._id})`);
      
      const acceptedApplicants = event.applicants.filter(app => app.status === 'accepted');
      console.log(`   Found ${acceptedApplicants.length} accepted applicants`);
      
      for (const applicant of acceptedApplicants) {
        try {
          // Check if participation already exists
          const existingParticipation = await Participation.findOne({
            event: event._id,
            participant: applicant.userId._id
          });

          if (!existingParticipation) {
            // Create the missing participation
            const newParticipation = await Participation.create({
              event: event._id,
              participant: applicant.userId._id,
              status: 'accepted',
              joinMethod: 'swipe_application',
              acceptedBy: event.organizer,
              originalApplication: {
                appliedAt: applicant.appliedAt,
                message: applicant.application,
                isSuperSwipe: applicant.isSuperSwipe || false
              },
              acceptedAt: applicant.respondedAt || new Date(),
              isArchived: false
            });

            participationsCreated++;
            console.log(`   ✅ Created participation: ${applicant.userId.name} -> ${event.name}`);
          } else {
            participationsSkipped++;
            console.log(`   ⏭️  Participation already exists: ${applicant.userId.name} -> ${event.name}`);
          }
        } catch (error) {
          console.error(`   ❌ Error creating participation for ${applicant.userId._id}:`, error);
          errors.push({
            eventId: event._id,
            eventName: event.name,
            userId: applicant.userId._id,
            userName: applicant.userId.name,
            error: error.message
          });
        }
      }
    }

    console.log(`🎉 Fix complete: ${participationsCreated} participations created, ${participationsSkipped} already existed`);

    res.json({
      success: true,
      message: 'Missing participations fix completed',
      data: {
        participationsCreated,
        participationsSkipped,
        totalProcessed: participationsCreated + participationsSkipped,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('❌ Error fixing missing participations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing missing participations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   POST /api/events/fix-organizer-applications
// @desc    Remove organizer's own applications from their events
// @access  Private
router.post('/fix-organizer-applications', protect, async (req, res) => {
  try {
    console.log(`🔧 Cleaning up organizer self-applications for user: ${req.user.id}`);
    
    // Find all events where user is organizer
    const events = await Event.find({ organizer: req.user.id });
    
    let totalFixed = 0;
    let eventsFixed = [];
    
    for (const event of events) {
      console.log(`📋 Checking event: ${event.name}`);
      
      // Find organizer's own applications in this event
      const organizerApplications = event.applicants.filter(
        app => app.userId.toString() === req.user.id
      );
      
      if (organizerApplications.length > 0) {
        console.log(`❌ Found ${organizerApplications.length} self-applications in ${event.name}`);
        
        // Remove organizer's applications
        event.applicants = event.applicants.filter(
          app => app.userId.toString() !== req.user.id
        );
        
        await event.save();
        
        totalFixed += organizerApplications.length;
        eventsFixed.push({
          eventId: event._id,
          eventName: event.name,
          removedApplications: organizerApplications.length
        });
        
        console.log(`✅ Removed self-applications from ${event.name}`);
      } else {
        console.log(`✅ No self-applications found in ${event.name}`);
      }
    }
    
    console.log(`🎉 Cleanup complete: ${totalFixed} applications removed from ${eventsFixed.length} events`);
    
    res.json({
      success: true,
      message: 'Organizer self-applications cleanup completed',
      data: {
        totalApplicationsRemoved: totalFixed,
        eventsFixed: eventsFixed.length,
        details: eventsFixed
      }
    });
    
  } catch (error) {
    console.error('❌ Error cleaning up organizer applications:', error);
    res.status(500).json({
      success: false,
      message: 'Error during cleanup',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   GET /api/events/:id/participants
// @desc    Get event participants (for roster view)
// @access  Private
router.get('/:id/participants', protect, async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // First check if event exists and user has access
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if user is organizer or participant
    const isOrganizer = event.organizer.toString() === req.user.id || 
                       event.admins.includes(req.user.id);
    
    let hasAccess = isOrganizer;
    
    if (!isOrganizer) {
      // Check if user is an accepted participant
      const userApplication = event.applicants.find(
        app => app.userId.toString() === req.user.id && app.status === 'accepted'
      );
      hasAccess = !!userApplication;
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view participants' 
      });
    }
    
    // Get all accepted participants
    const acceptedApplicants = event.applicants.filter(app => app.status === 'accepted');
    const participantIds = acceptedApplicants.map(app => app.userId);
    
    // Add organizer to participants list
    if (!participantIds.includes(event.organizer)) {
      participantIds.push(event.organizer);
    }
    
    // Get participant details with existing connection status
    const participants = await User.find({
      _id: { $in: participantIds }
    }).select('name photos age bio');
    
    // Check existing private connections for current user
    const existingConnections = await PrivateConnection.find({
      $or: [
        { 
          participant: req.user.id, 
          otherUser: { $in: participantIds },
          originEvent: eventId 
        },
        { 
          otherUser: req.user.id, 
          participant: { $in: participantIds },
          originEvent: eventId 
        }
      ]
    }).select('participant otherUser status');
    
    // Build connection status map
    const connectionMap = {};
    existingConnections.forEach(conn => {
      const otherUserId = conn.participant.toString() === req.user.id 
        ? conn.otherUser.toString() 
        : conn.participant.toString();
      connectionMap[otherUserId] = conn.status;
    });
    
    // Enhance participants with connection status
    const enhancedParticipants = participants
      .filter(p => p._id.toString() !== req.user.id) // Remove current user
      .map(participant => ({
        ...participant.toObject(),
        connectionStatus: connectionMap[participant._id.toString()] || 'none',
        isOrganizer: participant._id.toString() === event.organizer.toString()
      }));
    
    res.json({
      success: true,
      data: enhancedParticipants,
      eventInfo: {
        _id: event._id,
        name: event.name,
        type: event.type,
        organizerId: event.organizer
      }
    });
    
  } catch (error) {
    console.error('Error getting event participants:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;