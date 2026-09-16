// backend/src/routes/events.js - COMPLETE FILE - FIXED
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const Match = require('../models/Match');
const Message = require('../models/Message');
const ChatCounter = require('../models/ChatCounter');
const Participation = require('../models/Participation');
const PrivateConnection = require('../models/PrivateConnection');
const { getBotUserId } = require('../services/botUser');
const { getOrCreatePrivateConnection, postPrivateNotification, pushIfOffline, sendBotNotice } = require('../services/botNotice');
const { protect, organizer, premium } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Posts a "this event is filled" notice into the invite group's chat the
// moment an event's capacity is reached - whether it filled with group
// members or strangers the organizer accepted. Callers pass whether the
// event just crossed into "full" on this request, so it only fires once.
// GET /api/participations (routes/participations.js) is how a member sees
// events/groups they've joined - including the "Roster" view for a group
// they belong to but don't organize. It reads from its own Participation
// collection, which nothing populated on the normal accept path (only a
// one-off admin fix route did) - so every accepted applicant needs one of
// these created here, or they'd never see what they joined.
async function recordParticipation(event, userId, joinMethod) {
  await Participation.findOneAndUpdate(
    { event: event._id, participant: userId },
    {
      $setOnInsert: {
        event: event._id,
        participant: userId,
        status: 'accepted',
        joinMethod,
        acceptedBy: event.organizer,
        acceptedAt: new Date(),
        isArchived: false
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function notifyGroupIfJustFilled(event, req, justBecameFull) {
  if (!justBecameFull || !event.inviteGroupIds?.length) return;
  try {
    const botId = await getBotUserId();
    const io = req.app.get('io');
    for (const groupId of event.inviteGroupIds) {
      const message = await Message.createEventMessage(
        groupId,
        botId,
        `🎉 "${event.name}" is now filled!`,
        'group'
      );
      if (io) {
        io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
      }
    }
  } catch (error) {
    console.error('⚠️ Failed to post event-filled notice to group chat:', error);
  }
}

// Drops a clickable event-invite card into a group's chat so members can
// see it and join with one tap (POST /:id/quick-join), instead of the
// organizer-approval path strangers go through. Works the same whether
// `event` is an actual event or another group (e.g. inviting a poker
// group's members to join a fantasy football league group) - joining a
// group is just accepting an application with no capacity gate, same as
// joinsDirectly already treats them in POST /join/:code. Used both at
// creation and when a group is added to an existing event/group via
// PUT /:id.
async function postEventInviteCard(event, group, organizerId, req) {
  const inviteCode = event.generateInviteCode(organizerId);
  await event.save();

  const groupChatId = `group-${group._id}`;
  const seq = await ChatCounter.nextSeq(groupChatId);
  const noun = event.type === 'group' ? 'group' : 'event';
  const chatMessage = await Message.create({
    chatType: 'group',
    chatId: groupChatId,
    event: group._id,
    sender: organizerId,
    text: `New ${noun} "${event.name}" - tap to view and join`,
    messageType: 'system',
    systemMessage: {
      type: 'event_invite',
      data: {
        eventId: event._id,
        eventName: event.name,
        eventType: event.type,
        category: event.category,
        eventDate: event.eventDate,
        location: event.location,
        capacity: event.capacity,
        groupSize: event.groupSize,
        currentAttendees: event.currentAttendees,
        inviteCode
      }
    },
    seq
  });
  await chatMessage.populate('sender', 'name photos');

  const io = req.app.get('io');
  if (io) {
    io.to(`${chatMessage.chatType}:${chatMessage.chatId}`).emit('message:new', chatMessage);
  }
}

// getOrCreatePrivateConnection/postPrivateNotification/pushIfOffline/
// sendBotNotice moved to services/botNotice.js so routes/auth.js can also
// send the welcome message at signup.

// A plain-text bot announcement into an event/group's own chat - "X
// joined", "X is now an owner", "X stepped down", "X was removed".
// Non-fatal by design (callers wrap this in try/catch): the roster
// change itself already succeeded by the time this runs, so a failure
// posting the announcement shouldn't undo or fail that.
async function postSystemAnnouncement(event, text, req) {
  const botId = await getBotUserId();
  const message = await Message.createEventMessage(event._id, botId, text, event.type);
  await message.populate('sender', 'name photos');
  const io = req.app.get('io');
  if (io) {
    io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
  }
}

// Promoting someone to owner has to be something they opt into (so an
// organizer can't just hand you responsibility you didn't want) - sent
// as a card in a private message the same way an event/group invite is
// a card in the group chat, rather than applying instantly.
async function postOwnerInviteCard(event, fromUserId, toUserId, req) {
  const connection = await getOrCreatePrivateConnection(fromUserId, toUserId, event._id);

  const uids = [fromUserId.toString(), toUserId.toString()].sort();
  const chatId = `private-${uids[0]}-${uids[1]}`;
  const seq = await ChatCounter.nextSeq(chatId);
  const [inviter, invitedUser] = await Promise.all([
    User.findById(fromUserId).select('name'),
    User.findById(toUserId).select('name')
  ]);
  const message = await Message.create({
    chatType: 'private',
    chatId,
    privateConnection: connection._id,
    sender: fromUserId,
    text: `${inviter?.name || 'Someone'} invited you to be an owner of "${event.name}"`,
    messageType: 'system',
    systemMessage: {
      type: 'owner_invite',
      data: {
        eventId: event._id,
        eventName: event.name,
        eventType: event.type,
        invitedByName: inviter?.name,
        invitedUserName: invitedUser?.name,
        // Both sender and recipient see this same card (it's their
        // shared private chat) - status has to be computed against
        // who was actually invited, not against whoever's currently
        // viewing (the sender is themselves already an owner, which
        // would otherwise make the card look "accepted" to them
        // regardless of what the recipient does).
        invitedUserId: toUserId
      }
    },
    seq
  });
  await message.populate('sender', 'name photos');

  const io = req.app.get('io');
  if (io) {
    io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
  }
  await pushIfOffline(toUserId, {
    title: inviter?.name || 'DRPN',
    body: `Invited you to be an owner of "${event.name}"`,
    url: '/'
  });
}

// Transferring the organizer role has to be opted into by the recipient,
// same reasoning and same card-in-a-private-chat mechanism as
// postOwnerInviteCard - the difference is what accepting it does
// (replaces event.organizer entirely, rather than adding to admins).
async function postTransferOwnershipCard(event, fromUserId, toUserId, req) {
  const connection = await getOrCreatePrivateConnection(fromUserId, toUserId, event._id);

  const uids = [fromUserId.toString(), toUserId.toString()].sort();
  const chatId = `private-${uids[0]}-${uids[1]}`;
  const seq = await ChatCounter.nextSeq(chatId);
  const [fromUser, toUser] = await Promise.all([
    User.findById(fromUserId).select('name'),
    User.findById(toUserId).select('name')
  ]);
  const message = await Message.create({
    chatType: 'private',
    chatId,
    privateConnection: connection._id,
    sender: fromUserId,
    text: `${fromUser?.name || 'Someone'} wants to transfer ownership of "${event.name}" to you`,
    messageType: 'system',
    systemMessage: {
      type: 'transfer_ownership',
      data: {
        eventId: event._id,
        eventName: event.name,
        eventType: event.type,
        fromUserName: fromUser?.name,
        toUserName: toUser?.name,
        invitedUserId: toUserId
      }
    },
    seq
  });
  await message.populate('sender', 'name photos');

  const io = req.app.get('io');
  if (io) {
    io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
  }
  await pushIfOffline(toUserId, {
    title: fromUser?.name || 'DRPN',
    body: `Wants to transfer ownership of "${event.name}" to you`,
    url: '/'
  });
}

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
    
    // Build query - private events/groups ("only people with invite codes
    // can join") are deliberately excluded from public discovery; they're
    // only reachable via their invite code.
    const query = {
      isActive: true,
      isArchived: { $ne: true },
      isPublic: true,
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
    
    // A full event drops out of public discovery - group invitees still
    // reach it directly via their invite code, they just don't need (or
    // get) the public swipe/apply flow once capacity is taken.
    query.$expr = {
      $or: [
        { $ne: ['$type', 'event'] },
        { $lt: ['$currentAttendees', '$capacity'] }
      ]
    };

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
  body('categories').optional().isArray({ min: 1 }).withMessage('Categories must be a non-empty array'),
  body('categories.*').optional().isIn(VALID_CATEGORIES).withMessage(`Each category must be one of: ${VALID_CATEGORIES.join(', ')}`),
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
    
    // If auto-inviting groups, the requester has to actually run each one
    // - otherwise anyone could dump an invite card into a chat they don't
    // belong to.
    const requestedGroupIds = Array.isArray(req.body.inviteGroupIds)
      ? req.body.inviteGroupIds
      : (req.body.inviteGroupId ? [req.body.inviteGroupId] : []); // back-compat with the old singular field
    let inviteGroups = [];
    if (requestedGroupIds.length) {
      inviteGroups = await Event.find({ _id: { $in: requestedGroupIds } });
      const invalid = inviteGroups.length !== requestedGroupIds.length
        || inviteGroups.some(g => g.type !== 'group' || !g.canUserManage(req.user.id));
      if (invalid) {
        return res.status(403).json({
          success: false,
          message: 'You can only auto-invite a group you organize'
        });
      }
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
    
    // Create event data - category stays the single primary category
    // (used for filtering, stock images, badges); categories only carries
    // extra selections for groups, and always includes the primary one.
    const eventData = {
      ...req.body,
      categories: req.body.categories?.length
        ? Array.from(new Set([req.body.category, ...req.body.categories]))
        : undefined,
      inviteGroupIds: inviteGroups.map(g => g._id),
      organizer: req.user.id,
      admins: [req.user.id],
      // The organizer is themselves a member/attendee from the moment the
      // event or group exists - without this, capacity displays as e.g.
      // 0/50 until someone else is accepted, when it's really 1/50.
      currentAttendees: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💾 Creating event in database...');
    const event = await Event.create(eventData);

    // Drop a clickable event-invite card into each invited group's chat
    // so members can see it and join with one tap (POST /:id/quick-join)
    // - group members join directly instead of applying like strangers.
    // A card failing to post shouldn't fail event creation, but it also
    // shouldn't fail silently - collect per-group results so the client
    // can tell the organizer which groups it didn't reach.
    const groupInviteResults = [];
    for (const group of inviteGroups) {
      try {
        await postEventInviteCard(event, group, req.user.id, req);
        groupInviteResults.push({ groupId: group._id, groupName: group.name, success: true });
      } catch (inviteError) {
        console.error(`⚠️ Failed to post invite card to group "${group.name}" (${group._id}):`, inviteError);
        groupInviteResults.push({ groupId: group._id, groupName: group.name, success: false, error: inviteError.message });
      }
    }

    console.log('✅ Event created successfully:', event._id);

    res.status(201).json({
      success: true,
      data: event,
      groupInviteResults,
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

// @route   POST /api/events/:id/photos
// @desc    Upload a custom photo for an event/group (organizer/admin only).
//          The create/edit screens send a picked image as `eventImage`, a
//          plain string field the Event schema has no place for - it was
//          silently dropped on save, which is why a custom photo never
//          actually replaced the category's stock image. Uploading here,
//          right after create/update, is the fix.
// @access  Private
router.post('/:id/photos', [protect, upload.array('photos', 1)], async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const newPhotos = req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    }));

    event.photos.push(...newPhotos);
    await event.save();

    res.json({ success: true, data: event.photos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/events/:id
// @desc    Update an event (organizer only) - UPDATED VALIDATION
// @access  Private
router.put('/:id', [protect,
  body('name').optional().notEmpty().trim(),
  body('description').optional().notEmpty().trim(),
  body('category').optional().isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`), // CHANGED from interests
  body('categories').optional().isArray({ min: 1 }).withMessage('Categories must be a non-empty array'),
  body('categories.*').optional().isIn(VALID_CATEGORIES).withMessage(`Each category must be one of: ${VALID_CATEGORIES.join(', ')}`)
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
    
    // Check if user is organizer or owner. Was
    // `!event.admins.includes(req.user.id)` - comparing an ObjectId to a
    // string is never true, so an owner (as opposed to the organizer)
    // could never actually edit the event/group.
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // CHANGED: Update allowed fields to include category instead of interests
    const allowedUpdates = ['name', 'description', 'category', 'categories', 'eventDate', 'capacity', 'groupSize', 'meetingFrequency', 'ageRange', 'genderPreference', 'location', 'isPublic'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // inviteGroupIds needs its own validation (each id has to be a group
    // this user actually organizes) and drives posting a new invite card
    // to any group that's newly added here - handled separately from the
    // plain field copy above.
    let newlyInvitedGroups = [];
    const requestedGroupIds = Array.isArray(req.body.inviteGroupIds)
      ? req.body.inviteGroupIds
      : (req.body.inviteGroupId !== undefined ? [req.body.inviteGroupId].filter(Boolean) : undefined);
    if (requestedGroupIds !== undefined) {
      const requestedGroups = requestedGroupIds.length
        ? await Event.find({ _id: { $in: requestedGroupIds } })
        : [];
      const invalid = requestedGroups.length !== requestedGroupIds.length
        || requestedGroups.some(g => g.type !== 'group' || !g.canUserManage(req.user.id));
      if (invalid) {
        return res.status(403).json({ success: false, message: 'You can only auto-invite a group you organize' });
      }
      const existingIds = new Set((event.inviteGroupIds || []).map(id => id.toString()));
      newlyInvitedGroups = requestedGroups.filter(g => !existingIds.has(g._id.toString()));
      updates.inviteGroupIds = requestedGroupIds;
    }

    // Keep categories in sync with the primary category, same as on create.
    if (updates.categories?.length) {
      const primary = updates.category || event.category;
      updates.categories = Array.from(new Set([primary, ...updates.categories]));
    }

    // location.type ('Point') marks it as GeoJSON for the 2dsphere index -
    // the app never sends that field back (it only knows about
    // address/city/state/coordinates), so replacing the whole subdocument
    // with what the client sent silently drops it. Mongoose's schema
    // default for it only applies on document creation, not here, so it
    // has to be restored explicitly or the event's location becomes
    // permanently unindexable ("unknown GeoJSON type") on this and every
    // later save.
    if (updates.location) {
      updates.location = { type: 'Point', ...updates.location };
    }

    updates.updatedAt = new Date();
    
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('organizer', 'name photos');

    // Only post to groups that weren't already invited - re-editing other
    // fields shouldn't spam the chat with a duplicate card.
    const groupInviteResults = [];
    for (const group of newlyInvitedGroups) {
      try {
        await postEventInviteCard(updatedEvent, group, req.user.id, req);
        groupInviteResults.push({ groupId: group._id, groupName: group.name, success: true });
      } catch (inviteError) {
        console.error(`⚠️ Failed to post invite card to group "${group.name}" (${group._id}):`, inviteError);
        groupInviteResults.push({ groupId: group._id, groupName: group.name, success: false, error: inviteError.message });
      }
    }

    res.json({
      success: true,
      data: updatedEvent,
      groupInviteResults
    });
  } catch (error) {
    console.error(error);
    // Surfacing the real message here (rather than the generic "Server
    // error" other routes use) while we're still pre-launch and actively
    // debugging - revisit hiding this again before real users are on it.
    res.status(500).json({ success: false, message: error.message || 'Server error' });
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

    // Check if user is organizer or admin. Was `!event.admins.includes(req.user.id)`
    // - comparing an ObjectId to a string is never equal, so an admin
    // (as opposed to the organizer) could never actually pass this check.
    // Has to run before `admins` is populated below - canUserManage's
    // ObjectId.toString() comparison would break against populated User
    // documents instead of raw ids.
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view applicants' });
    }

    await event.populate('admins', 'name');

    // Return only the applicants data with populated user info
    res.json({
      success: true,
      data: event.applicants,
      eventInfo: {
        name: event.name,
        type: event.type,
        capacity: event.capacity || event.groupSize,
        organizer: event.organizer,
        admins: event.admins
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

    // Organizer or a promoted owner can decide applications.
    if (!event.canUserManage(req.user.id)) {
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
    let justBecameFull = false;
    if (decision === 'accept') {
      const wasFull = event.type === 'event' && event.currentAttendees >= event.capacity;
      event.currentAttendees = (event.currentAttendees || 0) + 1;
      event.closeIfFull();
      justBecameFull = !wasFull && event.type === 'event' && event.currentAttendees >= event.capacity;
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
        await recordParticipation(event, userId, 'swipe_application');
      } catch (matchError) {
        console.error('Error creating match:', matchError);
        // Don't fail the entire request if match creation fails
        // The application will still be accepted
      }
    }

    // Save the event with updated application status
    await event.save();

    await notifyGroupIfJustFilled(event, req, justBecameFull);

    if (decision === 'accept') {
      try {
        const joinedUser = await User.findById(userId).select('name');
        await postSystemAnnouncement(event, `${joinedUser?.name || 'Someone'} joined "${event.name}"`, req);
      } catch (announceError) {
        console.error('⚠️ Failed to post join announcement:', announceError);
      }
    }

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
      .populate('organizer', 'name photos bio age')
      .populate('applicants.userId', 'name photos bio age')
      .populate('admins', 'name photos bio age');

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
    
    // Check if user is organizer or owner
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Soft delete - archive instead of removing
    await Event.findByIdAndUpdate(req.params.id, {
      isActive: false,
      isArchived: true,
      archivedAt: new Date()
    });

    // A manual close (this route) always closes the downstream chat for
    // the whole roster, unlike a natural date expiry which never touches
    // Participation - that's what keeps a chat alive after its event just
    // happens to run out the clock. Archiving each accepted member's
    // Participation record both drops the event from their feed (the
    // GET /participations query filters on it) and revokes their chat
    // access (messages.js gates send/read the same way).
    try {
      const rosterIds = event.applicants
        .filter(a => a.status === 'accepted' && a.userId.toString() !== req.user.id)
        .map(a => a.userId);

      await Participation.updateMany(
        { event: event._id, participant: { $in: rosterIds } },
        { isArchived: true }
      );

      const noun = event.type === 'group' ? 'group' : 'event';
      const noticeText = `${req.user.name || 'The organizer'} has cancelled the ${noun} "${event.name}"`;
      await Promise.all(rosterIds.map(userId => sendBotNotice(userId, noticeText, req)));
    } catch (notifyError) {
      console.error('⚠️ Failed to close roster chat access / send close notices:', notifyError);
    }

    res.json({
      success: true,
      message: 'Event cancelled successfully'
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

// @route   POST /api/events/:id/quick-join
// @desc    Accept an event_invite chat card - join immediately, no code
//          needed since group membership itself is the authorization
//          (mirrors the joinsDirectly branch of POST /join/:code).
// @access  Private
router.post('/:id/quick-join', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.inviteGroupIds?.length) {
      return res.status(403).json({ success: false, message: 'This event has no group invite to accept' });
    }

    const groups = await Event.find({ _id: { $in: event.inviteGroupIds } });
    const isGroupMember = groups.some(group =>
      group.organizer.toString() === req.user.id
      || group.applicants.some(app => app.userId.toString() === req.user.id && app.status === 'accepted')
    );
    if (!isGroupMember) {
      return res.status(403).json({ success: false, message: 'Not a member of this group' });
    }

    if (event.hasUserApplied(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You have already joined this event' });
    }

    const requestingUser = await User.findById(req.user.id);
    if (requestingUser.hasPassedEvent(event._id)) {
      return res.status(403).json({ success: false, message: 'You already left or were removed from this - ask the organizer to re-invite you' });
    }

    if (event.type === 'event' && event.currentAttendees >= event.capacity) {
      return res.status(400).json({ success: false, message: 'This event is now full' });
    }

    event.applicants.push({
      userId: req.user.id,
      status: 'accepted',
      respondedAt: new Date()
    });
    event.currentAttendees = (event.currentAttendees || 0) + 1;
    event.closeIfFull();
    const justBecameFull = event.type === 'event' && event.currentAttendees >= event.capacity;
    await event.save();

    await notifyGroupIfJustFilled(event, req, justBecameFull);

    const existingMatch = await Match.findOne({ individual: req.user.id, event: event._id });
    if (!existingMatch) {
      await Match.create({
        individual: req.user.id,
        event: event._id,
        status: 'active',
        matchedAt: new Date()
      });
    }
    await recordParticipation(event, req.user.id, 'invite_code');
    await User.findByIdAndUpdate(req.user.id, {
      $push: { eventsJoined: { eventId: event._id, status: 'accepted' } }
    });

    try {
      await postSystemAnnouncement(event, `${req.user.name || 'Someone'} joined "${event.name}"`, req);
    } catch (announceError) {
      console.error('⚠️ Failed to post join announcement:', announceError);
    }

    res.json({
      success: true,
      data: { eventName: event.name, eventType: event.type },
      message: `Joined ${event.name}!`
    });
  } catch (error) {
    console.error('Error in quick-join:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/pass-invite
// @desc    Dismiss an event_invite chat card - records the pass so the
//          card can't be re-accepted/re-passed after a chat reload.
// @access  Private
router.post('/:id/pass-invite', protect, async (req, res) => {
  try {
    await Event.updateOne(
      { _id: req.params.id },
      { $addToSet: { passedBy: req.user.id } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error in pass-invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/invite-owner
// @desc    Send a roster member an owner-invite card via private message
//          (organizer/existing owner only) - promoting doesn't take
//          effect until they accept it.
// @access  Private
router.post('/:id/invite-owner', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: "You can't invite yourself" });
    }
    if (event.organizer.toString() === userId || event.admins.some(id => id.toString() === userId)) {
      return res.status(400).json({ success: false, message: 'Already an owner' });
    }
    const isMember = event.applicants.some(a => a.userId.toString() === userId && a.status === 'accepted');
    if (!isMember) {
      return res.status(400).json({ success: false, message: 'Only current roster members can be made owners' });
    }

    await postOwnerInviteCard(event, req.user.id, userId, req);

    res.json({ success: true, message: 'Owner invite sent' });
  } catch (error) {
    console.error('Error in invite-owner:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/accept-owner-invite
// @desc    Accept an owner-invite card - the only thing that actually
//          grants owner (admin) status.
// @access  Private
router.post('/:id/accept-owner-invite', protect, async (req, res) => {
  try {
    await Event.updateOne(
      { _id: req.params.id },
      { $addToSet: { admins: req.user.id }, $pull: { ownerInviteDeclinedBy: req.user.id } }
    );
    // Also stamp the response directly onto the specific invite message,
    // if we know which one this was. GET /messages/private/:id previously
    // inferred a card's status by re-checking Event.admins/
    // ownerInviteDeclinedBy at read time - fragile if this event/group's
    // name is shared by more than one document (this app has had
    // duplicate-named test events) or if admin status later changes for
    // an unrelated reason (e.g. stepping down), either of which would
    // make an old, already-answered card silently flip back to looking
    // unanswered. Recording the response on the message itself removes
    // that inference entirely.
    if (req.body.messageId) {
      await Message.updateOne(
        { _id: req.body.messageId },
        { $set: { 'systemMessage.data.responseStatus': 'accepted' } }
      );
    }
    try {
      const event = await Event.findById(req.params.id).select('name type');
      if (event) {
        await postSystemAnnouncement(event, `${req.user.name || 'Someone'} is now an owner of "${event.name}"`, req);
      }
    } catch (announceError) {
      console.error('⚠️ Failed to post owner-accepted announcement:', announceError);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in accept-owner-invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/decline-owner-invite
// @desc    Dismiss an owner-invite card without becoming an owner.
// @access  Private
router.post('/:id/decline-owner-invite', protect, async (req, res) => {
  try {
    await Event.updateOne(
      { _id: req.params.id },
      { $addToSet: { ownerInviteDeclinedBy: req.user.id } }
    );
    if (req.body.messageId) {
      await Message.updateOne(
        { _id: req.body.messageId },
        { $set: { 'systemMessage.data.responseStatus': 'declined' } }
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in decline-owner-invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/transfer-ownership
// @desc    Organizer sends a transfer-ownership card to another roster
//          member. Only takes effect once they accept it.
// @access  Private
router.post('/:id/transfer-ownership', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the organizer can transfer ownership' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: "You can't transfer ownership to yourself" });
    }
    const isMember = event.applicants.some(a => a.userId.toString() === userId && a.status === 'accepted');
    if (!isMember) {
      return res.status(400).json({ success: false, message: 'Only current roster members can be made organizer' });
    }

    await postTransferOwnershipCard(event, req.user.id, userId, req);

    res.json({ success: true, message: 'Transfer request sent' });
  } catch (error) {
    console.error('Error in transfer-ownership:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/accept-transfer-ownership
// @desc    Accept a transfer-ownership card - replaces event.organizer
//          with the accepting user and folds the previous organizer into
//          admins so they don't lose all access.
// @access  Private
router.post('/:id/accept-transfer-ownership', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const previousOrganizer = event.organizer;
    event.organizer = req.user.id;
    // Fold the outgoing organizer into admins (unless they somehow already
    // are one), and drop the new organizer from admins if they were
    // already listed there - they're the organizer now, not just an admin.
    event.admins = event.admins.filter(id => id.toString() !== req.user.id);
    if (!event.admins.some(id => id.toString() === previousOrganizer.toString())) {
      event.admins.push(previousOrganizer);
    }
    // The organizer was never a roster member (organizers don't apply to
    // their own event) - admins alone doesn't grant chat/roster access,
    // that's gated on being the organizer OR having an accepted
    // Participation record. Without this, stepping down from organizer
    // to admin left them with no trace in either place: not shown on the
    // roster, "Not authorized" opening the event/group chat.
    if (!event.applicants.some(a => a.userId.toString() === previousOrganizer.toString())) {
      event.applicants.push({
        userId: previousOrganizer,
        status: 'accepted',
        appliedAt: new Date(),
        respondedAt: new Date()
      });
    }
    await event.save();

    const existingParticipation = await Participation.findOne({
      event: event._id,
      participant: previousOrganizer
    });
    if (!existingParticipation) {
      await Participation.create({
        event: event._id,
        participant: previousOrganizer,
        status: 'accepted',
        joinMethod: 'ownership_transfer',
        acceptedBy: req.user.id,
        acceptedAt: new Date(),
        isArchived: false
      });
    } else if (existingParticipation.isArchived) {
      existingParticipation.isArchived = false;
      existingParticipation.status = 'accepted';
      await existingParticipation.save();
    }

    if (req.body.messageId) {
      await Message.updateOne(
        { _id: req.body.messageId },
        { $set: { 'systemMessage.data.responseStatus': 'accepted' } }
      );
    }
    try {
      await postSystemAnnouncement(event, `${req.user.name || 'Someone'} is now the organizer of "${event.name}"`, req);
    } catch (announceError) {
      console.error('⚠️ Failed to post transfer-accepted announcement:', announceError);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in accept-transfer-ownership:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/decline-transfer-ownership
// @desc    Dismiss a transfer-ownership card - organizer stays unchanged.
// @access  Private
router.post('/:id/decline-transfer-ownership', protect, async (req, res) => {
  try {
    if (req.body.messageId) {
      await Message.updateOne(
        { _id: req.body.messageId },
        { $set: { 'systemMessage.data.responseStatus': 'declined' } }
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in decline-transfer-ownership:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/step-down
// @desc    An owner (not the organizer) voluntarily gives up ownership.
// @access  Private
router.post('/:id/step-down', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'The organizer cannot step down' });
    }
    if (!event.admins.some(id => id.toString() === req.user.id)) {
      return res.status(400).json({ success: false, message: 'You are not an owner of this event' });
    }
    event.admins = event.admins.filter(id => id.toString() !== req.user.id);
    await event.save();
    try {
      await postSystemAnnouncement(event, `${req.user.name || 'Someone'} stepped down as an owner of "${event.name}"`, req);
    } catch (announceError) {
      console.error('⚠️ Failed to post step-down announcement:', announceError);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in step-down:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/kick
// @desc    Remove a roster member (organizer/owner only). Owners can't
//          be kicked - they have to step down themselves - and the
//          organizer can never be kicked.
// @access  Private
router.post('/:id/kick', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (event.organizer.toString() === userId) {
      return res.status(400).json({ success: false, message: "Can't remove the organizer" });
    }
    if (event.admins.some(id => id.toString() === userId)) {
      return res.status(403).json({ success: false, message: "Owners can't remove other owners - they have to step down themselves" });
    }

    const applicantIndex = event.applicants.findIndex(a => a.userId.toString() === userId);
    if (applicantIndex === -1) {
      return res.status(404).json({ success: false, message: 'User not found on the roster' });
    }
    const wasAccepted = event.applicants[applicantIndex].status === 'accepted';
    event.applicants.splice(applicantIndex, 1);
    if (wasAccepted && event.type === 'event') {
      event.currentAttendees = Math.max(0, (event.currentAttendees || 0) - 1);
    }
    await event.save();

    await User.findByIdAndUpdate(userId, { $pull: { eventsJoined: { eventId: event._id } } });
    if (wasAccepted) {
      await Match.deleteOne({ individual: userId, event: event._id });
      await Participation.deleteOne({ event: event._id, participant: userId });
    }

    // Same as leaving voluntarily - record a 'pass' so this doesn't come
    // back around in their swipe feed, and so quick-join/invite-code join
    // both refuse to let them straight back in.
    const kickedUserDoc = await User.findById(userId);
    if (kickedUserDoc) {
      kickedUserDoc.addSwipe(event._id, 'pass');
      await kickedUserDoc.save();
    }

    try {
      const kickedUser = kickedUserDoc;
      await postSystemAnnouncement(event, `${kickedUser?.name || 'Someone'} was removed from "${event.name}"`, req);
      // Tell the person directly, not just the group - so they know who
      // removed them and when, rather than just quietly losing access.
      await postPrivateNotification(
        req.user.id,
        userId,
        event._id,
        `You were removed from "${event.name}" by ${req.user.name} on ${new Date().toLocaleDateString()}.`,
        req
      );
    } catch (notifyError) {
      console.error('⚠️ Failed to post kick notifications:', notifyError);
    }

    res.json({ success: true, message: 'Removed from roster' });
  } catch (error) {
    console.error('Error in kick:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/events/:id/leave
// @desc    A roster member voluntarily leaves an event/group. Mirrors
//          kick's cleanup (this is "kick yourself"), plus records a
//          'pass' swipe so the event doesn't come back around in their
//          LFG feed - without that, leaving would just look like a fresh
//          unswiped event again the next time they browse.
// @access  Private
router.post('/:id/leave', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.organizer.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'The organizer can\'t leave - transfer ownership to someone else first'
      });
    }

    const applicantIndex = event.applicants.findIndex(a => a.userId.toString() === userId);
    if (applicantIndex === -1) {
      return res.status(404).json({ success: false, message: 'You are not on this roster' });
    }
    const wasAccepted = event.applicants[applicantIndex].status === 'accepted';
    event.applicants.splice(applicantIndex, 1);
    event.admins = event.admins.filter(id => id.toString() !== userId);
    if (wasAccepted && event.type === 'event') {
      event.currentAttendees = Math.max(0, (event.currentAttendees || 0) - 1);
    }
    await event.save();

    const user = await User.findById(userId);
    await User.findByIdAndUpdate(userId, { $pull: { eventsJoined: { eventId: event._id } } });
    if (wasAccepted) {
      await Match.deleteOne({ individual: userId, event: event._id });
      await Participation.deleteOne({ event: event._id, participant: userId });
    }
    // Mark it passed for this user specifically - addSwipe overwrites any
    // existing swipe on this event (the 'like' from when they applied),
    // it doesn't just add a second one.
    user.addSwipe(event._id, 'pass');
    await user.save();

    try {
      await postSystemAnnouncement(event, `${user.name || 'Someone'} left "${event.name}"`, req);
    } catch (announceError) {
      console.error('⚠️ Failed to post leave announcement:', announceError);
    }

    res.json({ success: true, message: 'Left the roster' });
  } catch (error) {
    console.error('Error in leave:', error);
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

    const requestingUser = await User.findById(req.user.id);
    if (requestingUser.hasPassedEvent(event._id)) {
      return res.status(403).json({
        success: false,
        message: 'You already left or were removed from this - ask the organizer to re-invite you'
      });
    }

    // A group's own invite code joins the group directly, same as a member
    // of the group this event was auto-invited from joins that event
    // directly - both skip the organizer-approval path strangers go
    // through below. Groups have no hard capacity to gate on.
    let joinsDirectly = event.type === 'group';
    if (!joinsDirectly && event.inviteGroupIds?.length) {
      const groups = await Event.find({ _id: { $in: event.inviteGroupIds } });
      joinsDirectly = groups.some(group =>
        group.organizer.toString() === req.user.id ||
        group.applicants.some(app => app.userId.toString() === req.user.id && app.status === 'accepted')
      );
    }

    if (joinsDirectly) {
      if (event.type === 'event' && event.currentAttendees >= event.capacity) {
        return res.status(400).json({ success: false, message: 'This event is full' });
      }

      event.applicants.push({
        userId: req.user.id,
        inviteCode,
        status: 'accepted',
        respondedAt: new Date()
      });
      event.currentAttendees = (event.currentAttendees || 0) + 1;
      event.closeIfFull();
      const justBecameFull = event.type === 'event' && event.currentAttendees >= event.capacity;
      event.useInviteCode(inviteCode, req.user.id);
      await event.save();

      await notifyGroupIfJustFilled(event, req, justBecameFull);

      const existingMatch = await Match.findOne({ individual: req.user.id, event: event._id });
      if (!existingMatch) {
        await Match.create({
          individual: req.user.id,
          event: event._id,
          status: 'active',
          matchedAt: new Date()
        });
      }
      await recordParticipation(event, req.user.id, 'invite_code');
      await User.findByIdAndUpdate(req.user.id, {
        $push: { eventsJoined: { eventId: event._id, status: 'accepted' } }
      });

      try {
        await postSystemAnnouncement(event, `${req.user.name || 'Someone'} joined "${event.name}"`, req);
      } catch (announceError) {
        console.error('⚠️ Failed to post join announcement:', announceError);
      }

      return res.json({
        success: true,
        data: { eventName: event.name, eventType: event.type },
        message: `Joined ${event.name}!`
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
      data: { eventName: event.name, eventType: event.type },
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
    
    // Check if user is organizer or owner. Was `event.admins.includes(req.user.id)`
    // - comparing an ObjectId to a string is never true.
    const isOrganizer = event.canUserManage(req.user.id);

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