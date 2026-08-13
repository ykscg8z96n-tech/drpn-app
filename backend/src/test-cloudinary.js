// backend/src/test-cloudinary.js
require('dotenv').config();
const cloudinary = require('./config/cloudinary');
const fs = require('fs');
const path = require('path');

async function testCloudinary() {
  try {
    console.log('Testing Cloudinary connection...');
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    
    // Method 1: Test with a base64 image (small test image)
    console.log('\n1. Testing with base64 image...');
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    try {
      const result = await cloudinary.uploader.upload(base64Image, {
        folder: 'dating-app/test',
        public_id: 'test-image-' + Date.now(),
        resource_type: 'auto'
      });
      
      console.log('✅ Upload successful!');
      console.log('URL:', result.secure_url);
      console.log('Public ID:', result.public_id);
      
      // Test delete
      await cloudinary.uploader.destroy(result.public_id);
      console.log('✅ Delete successful!');
    } catch (error) {
      console.error('❌ Base64 upload failed:', error.message);
    }
    
    // Method 2: Test with a different public URL
    console.log('\n2. Testing with public image URL...');
    try {
      const result2 = await cloudinary.uploader.upload(
        'https://res.cloudinary.com/demo/image/upload/sample.jpg', 
        {
          folder: 'dating-app/test',
          public_id: 'test-url-image-' + Date.now()
        }
      );
      
      console.log('✅ URL upload successful!');
      console.log('URL:', result2.secure_url);
      
      await cloudinary.uploader.destroy(result2.public_id);
      console.log('✅ Delete successful!');
    } catch (error) {
      console.error('❌ URL upload failed:', error.message);
    }
    
    // Method 3: Test API connection
    console.log('\n3. Testing API connection...');
    try {
      const apiTest = await cloudinary.api.ping();
      console.log('✅ API connection successful!', apiTest);
    } catch (error) {
      console.error('❌ API connection failed:', error.message);
    }
    
    // Method 4: Test configuration
    console.log('\n4. Testing configuration...');
    try {
      const usage = await cloudinary.api.usage();
      console.log('✅ Configuration valid! Current usage:');
      console.log(`   Storage: ${(usage.storage.usage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Bandwidth: ${(usage.bandwidth.usage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Transformations: ${usage.transformations.usage}`);
    } catch (error) {
      console.error('❌ Configuration test failed:', error.message);
      console.error('   Make sure your API credentials are correct in .env file');
    }
    
  } catch (error) {
    console.error('❌ Cloudinary test failed:', error);
  }
}

// Alternative test - create a simple test image file
async function testWithLocalFile() {
  console.log('\n5. Testing with local file...');
  
  // Create a simple test image using Canvas (if available)
  try {
    // Create a test file path
    const testImagePath = path.join(__dirname, 'test-image.txt');
    
    // Write a simple text file (as a test)
    fs.writeFileSync(testImagePath, 'This is a test file');
    
    // Try uploading the text file (will fail, but tests connection)
    const result = await cloudinary.uploader.upload(testImagePath, {
      folder: 'dating-app/test',
      resource_type: 'raw'
    });
    
    console.log('✅ File upload successful!');
    console.log('URL:', result.secure_url);
    
    // Clean up
    await cloudinary.uploader.destroy(result.public_id, { resource_type: 'raw' });
    fs.unlinkSync(testImagePath);
    
  } catch (error) {
    console.log('Local file test error (expected):', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== Cloudinary Test Suite ===\n');
  
  // Check environment variables first
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Missing Cloudinary credentials in .env file!');
    console.error('Please add:');
    console.error('CLOUDINARY_CLOUD_NAME=your_cloud_name');
    console.error('CLOUDINARY_API_KEY=your_api_key');
    console.error('CLOUDINARY_API_SECRET=your_api_secret');
    return;
  }
  
  await testCloudinary();
  await testWithLocalFile();
  
  console.log('\n=== Test Complete ===');
}

runAllTests();