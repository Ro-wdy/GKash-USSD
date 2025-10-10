require('dotenv').config();
const { sendOTP, sendAccountConfirmation } = require('./src/smsService');

async function testSMS() {
  console.log('Testing Twilio SMS service...');
  console.log('Account SID:', process.env.TWILIO_ACCOUNT_SID);
  console.log('API Key SID:', process.env.TWILIO_API_KEY_SID);
  console.log('Phone Number:', process.env.TWILIO_PHONE_NUMBER);
  
  // Using your actual phone number for testing
  const testPhone = '+254743177132'; // Your registered phone number
  
  try {
    console.log('\n1. Testing OTP SMS...');
    const otpResult = await sendOTP(testPhone, 'Test User');
    console.log('OTP Result:', otpResult);
    
    if (!otpResult.success && otpResult.error && otpResult.error.includes('unverified')) {
      console.log('\n❌ VERIFICATION REQUIRED:');
      console.log('Your phone number needs to be verified for trial accounts.');
      console.log('Please go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
      console.log('Click "Add a new number" and verify +254743177132');
      console.log('After verification, run this test again.');
      return;
    }
    
    if (otpResult.success) {
      console.log('\n✅ OTP SMS sent successfully!');
      console.log('\n2. Testing account confirmation SMS...');
      const confirmResult = await sendAccountConfirmation(testPhone, 'Test User', 'Money Market Fund', 0);
      console.log('Confirmation Result:', confirmResult);
      
      if (confirmResult.success) {
        console.log('\n✅ All SMS tests passed! Your integration is ready.');
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Only run test if this file is executed directly
if (require.main === module) {
  testSMS();
}

module.exports = { testSMS };