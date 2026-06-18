const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const User = require('../models/User');

async function seedAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  try {
    const email = 'admin@blackrabbit.tn';
    const password = 'Admin@123';

    // Remove existing admin if any
    await User.findOneAndDelete({ email });

    // Create new admin user
    const admin = await User.create({
      email,
      password, // will be automatically hashed by the pre-save hook
      role: 'admin',
    });

    console.log(`✅ Admin user created successfully: ${admin.email}`);
  } catch (err) {
    console.error('Error creating admin:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
