const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_SECRET, {
  accountSid: process.env.TWILIO_ACCOUNT_SID
});

// In-memory storage for OTPs (replace with database in production)
const otps = new Map(); // phone -> { otp, expiresAt, attempts }

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiration (5 minutes)
 */
function storeOTP(phone, otp) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  otps.set(phone, {
    otp,
    expiresAt,
    attempts: 0
  });
}

/**
 * Verify OTP
 */
function verifyOTP(phone, inputOTP) {
  const otpData = otps.get(phone);
  
  if (!otpData) {
    return { success: false, message: 'No OTP found. Please request a new one.' };
  }
  
  if (new Date() > otpData.expiresAt) {
    otps.delete(phone);
    return { success: false, message: 'OTP expired. Please request a new one.' };
  }
  
  if (otpData.attempts >= 3) {
    otps.delete(phone);
    return { success: false, message: 'Too many attempts. Please request a new OTP.' };
  }
  
  otpData.attempts++;
  
  if (otpData.otp === inputOTP) {
    otps.delete(phone); // Clean up after successful verification
    return { success: true, message: 'OTP verified successfully.' };
  }
  
  return { success: false, message: `Invalid OTP. ${3 - otpData.attempts} attempts remaining.` };
}

/**
 * Send OTP via SMS
 */
async function sendOTP(phone, name = 'Customer') {
  try {
    const otp = generateOTP();
    storeOTP(phone, otp);
    
    const message = `Hello ${name},\\n\\nYour Gkash verification code is: ${otp}\\n\\nThis code will expire in 5 minutes.\\n\\nDo not share this code with anyone.\\n\\nGkash - Learn. Invest. Grow.`;
    
    // Format phone number for Twilio (ensure it starts with +)
    const formattedPhone = phone.startsWith('+') ? phone : `+254${phone.substring(1)}`;
    
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    console.log(`OTP sent to ${phone}: ${result.sid}`);
    return {
      success: true,
      message: `OTP sent to ${phone}`,
      messageSid: result.sid
    };
    
  } catch (error) {
    console.error('Failed to send OTP:', error);
    return {
      success: false,
      message: 'Failed to send OTP. Please try again.',
      error: error.message
    };
  }
}

/**
 * Send account creation confirmation SMS
 */
async function sendAccountConfirmation(phone, name, fund, balance = 0) {
  try {
    const message = `Congratulations ${name}!\\n\\nYour Gkash account has been created successfully.\\n\\nFund: ${fund}\\nInitial Balance: KES ${balance.toLocaleString()}\\n\\nStart investing today with *710*56789#\\n\\nGkash - Learn. Invest. Grow.`;
    
    const formattedPhone = phone.startsWith('+') ? phone : `+254${phone.substring(1)}`;
    
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    console.log(`Confirmation sent to ${phone}: ${result.sid}`);
    return {
      success: true,
      message: `Confirmation sent to ${phone}`,
      messageSid: result.sid
    };
    
  } catch (error) {
    console.error('Failed to send confirmation:', error);
    return {
      success: false,
      message: 'Account created but failed to send confirmation SMS.',
      error: error.message
    };
  }
}

/**
 * Send transaction notification SMS
 */
async function sendTransactionNotification(phone, type, amount, balance, name) {
  try {
    const action = type === 'INVEST' ? 'Investment' : 'Withdrawal';
    const message = `Hello ${name},\\n\\n${action} of KES ${amount.toLocaleString()} successful.\\n\\nNew Balance: KES ${balance.toLocaleString()}\\n\\nThank you for using Gkash.\\n\\nGkash - Learn. Invest. Grow.`;
    
    const formattedPhone = phone.startsWith('+') ? phone : `+254${phone.substring(1)}`;
    
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    console.log(`Transaction notification sent to ${phone}: ${result.sid}`);
    return {
      success: true,
      message: `Notification sent to ${phone}`,
      messageSid: result.sid
    };
    
  } catch (error) {
    console.error('Failed to send transaction notification:', error);
    return {
      success: false,
      message: 'Transaction completed but failed to send notification.',
      error: error.message
    };
  }
}

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendOTP,
  sendAccountConfirmation,
  sendTransactionNotification
};