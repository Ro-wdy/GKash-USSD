// src/smsService.js
const axios = require("axios");
require("dotenv").config();

const API_URL = "https://api.smsleopard.com/api/v1/send";
const API_KEY = process.env.SMS_LEOPARD_API_KEY;
const SENDER_ID = process.env.SMS_LEOPARD_SENDER_ID || "GKASH";

// Generate random 6-digit OTP
function generateOTP(length = 6) {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

// Format phone number into 2547xxxxxxxx
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, ""); // remove non-numeric
  if (cleaned.startsWith("0")) cleaned = "254" + cleaned.slice(1);
  else if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
  return cleaned;
}

// Send SMS using SMS Leopard v2
async function sendSMS(to, message) {
  const formattedPhone = formatPhoneNumber(to);

  const payload = {
    to: formattedPhone,
    from: SENDER_ID,
    message: message,
    api_key: API_KEY,
  };

  try {
    const response = await axios.post(API_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.error("=== SMS Leopard Error ===");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Message:", error.message);
    }
    return { success: false, error: error.response?.data || error.message };
  }
}

// Send OTP SMS
async function sendOTP(phone, name = "Customer") {
  const otp = generateOTP();
  const message = `Hello ${name}, your OTP code is ${otp}. It expires in 5 minutes. Do not share it with anyone.`;
  const result = await sendSMS(phone, message);
  return { ...result, otp };
}

// Send account confirmation SMS
async function sendAccountConfirmation(phone, name, fund, balance = 0) {
  const message = `Congratulations ${name}!\nYour Gkash account for ${fund} has been created.\nBalance: KES ${balance.toLocaleString()}.`;
  return sendSMS(phone, message);
}

// Send transaction notification SMS
async function sendTransactionNotification(phone, type, amount, balance, name) {
  const action = type === "INVEST" ? "Investment" : "Withdrawal";
  const message = `Hello ${name}, ${action} of KES ${amount.toLocaleString()} successful.\nNew balance: KES ${balance.toLocaleString()}.`;
  return sendSMS(phone, message);
}

module.exports = {
  generateOTP,
  sendSMS,
  sendOTP,
  sendAccountConfirmation,
  sendTransactionNotification,
};
