require('dotenv').config();
const twilio = require('twilio');

async function directTest() {
  console.log('Direct Twilio SMS Test');
  console.log('======================');
  
  // Initialize Twilio client
  const client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_SECRET, {
    accountSid: process.env.TWILIO_ACCOUNT_SID
  });
  
  console.log('Account SID:', process.env.TWILIO_ACCOUNT_SID);
  console.log('From Number:', process.env.TWILIO_PHONE_NUMBER);
  console.log('To Number: +254743177132');
  
  try {
    console.log('\nAttempting to send SMS...');
    
    const message = await client.messages.create({
      body: 'Hello from Gkash! This is a test SMS to verify your Twilio integration is working. 🚀',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: '+254743177132'  // Your exact verified number
    });
    
    console.log('✅ SUCCESS!');
    console.log('Message SID:', message.sid);
    console.log('Status:', message.status);
    console.log('To:', message.to);
    console.log('From:', message.from);
    console.log('\nCheck your phone for the SMS! 📱');
    
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    console.log('Error Code:', error.code);
    if (error.moreInfo) {
      console.log('More Info:', error.moreInfo);
    }
  }
}

directTest();