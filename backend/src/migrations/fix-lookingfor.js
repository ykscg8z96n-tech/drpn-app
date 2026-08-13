//backend/src/migrations/fix-lookingfor.js

const mongoose = require('mongoose');
require('dotenv').config();

const fixLookingForFields = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dating-app');
    console.log('✅ Connected to MongoDB');

    // Find all users with array lookingFor
    const usersWithArrayLookingFor = await mongoose.connection.db
      .collection('users')
      .find({ lookingFor: { $type: 'array' } })
      .toArray();

    console.log(`📊 Found ${usersWithArrayLookingFor.length} users with array lookingFor`);

    // Convert array to string
    for (const user of usersWithArrayLookingFor) {
      let newLookingFor = 'both'; // Default

      if (Array.isArray(user.lookingFor)) {
        if (user.lookingFor.includes('events') && user.lookingFor.includes('groups')) {
          newLookingFor = 'both';
        } else if (user.lookingFor.includes('events')) {
          newLookingFor = 'events';
        } else if (user.lookingFor.includes('groups')) {
          newLookingFor = 'groups';
        }
      }

      await mongoose.connection.db
        .collection('users')
        .updateOne(
          { _id: user._id },
          { $set: { lookingFor: newLookingFor } }
        );

      console.log(`✅ Updated user ${user._id}: ${JSON.stringify(user.lookingFor)} → ${newLookingFor}`);
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run if this file is executed directly
if (require.main === module) {
  fixLookingForFields();
}

module.exports = { fixLookingForFields };