const axios = require("axios");
require("dotenv").config();

const TIARA_URL =
  process.env.TIARA_URL || "https://api2.tiaraconnect.io/api/messaging/sendsms";
const API_KEY = process.env.TIARA_API_KEY;
const SENDER_ID = process.env.TIARA_SENDER_ID || "CONNECT";
const TIMEOUT = 10000;

function generateOTP(length = 6) {
  // Using crypto for better randomness
  const crypto = require("crypto");
  const digits = "0123456789";
  let otp = "";

  // Generate random bytes
  const randomBytes = crypto.randomBytes(length);

  // Convert bytes to OTP digits
  for (let i = 0; i < length; i++) {
    otp += digits[randomBytes[i] % 10];
  }

  return otp;
}

function formatPhoneNumber(phone) {
  const cleaned = (phone || "").replace(/\D/g, "");
  if (!cleaned) throw new Error("Invalid phone number");
  // Already in 254 format with 12 digits
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  // 0-format with 10 digits: 0743177132 -> 254743177132
  if (cleaned.startsWith("0") && cleaned.length === 10)
    return "254" + cleaned.slice(1);
  // 9 digits: 743177132 -> 254743177132
  if (cleaned.length === 9) return "254" + cleaned;
  // Otherwise return as-is (might already be valid)
  return cleaned;
}

async function sendSMS(to, message) {
  if (!API_KEY) {
    throw new Error("TIARA_API_KEY environment variable is not set");
  }

  const msisdn = formatPhoneNumber(to);
  console.log(`[SMS] Sending SMS to ${to} (formatted: ${msisdn})`);

  const payload = {
    to: msisdn,
    message,
    from: SENDER_ID,
  };

  try {
    console.log(`[SMS] Payload:`, JSON.stringify(payload));
    const resp = await axios.post(TIARA_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      timeout: TIMEOUT,
    });
    console.log(`[SMS] Success! Response:`, resp.data);
    return { success: true, data: resp.data };
  } catch (err) {
    console.error("=== Tiara Connect SMS Error ===");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data));
    } else {
      console.error("Message:", err.message);
    }
    return {
      success: false,
      error: err.response?.data || err.message,
      status: err.response?.status,
    };
  }
}

async function sendOTP(phone, name = "Customer", length = 6) {
  const otp = generateOTP(length);
  const message = `Hello ${name}, your verification code is ${otp}. It expires in 1 minute. Do not share it.`;
  console.log(`[OTP] Generating OTP for ${phone}: ${otp}`);
  console.log(`[OTP] Attempting to send: "${message}"`);
  const result = await sendSMS(phone, message);
  console.log(`[OTP] SMS Result:`, result);
  return { ...result, otp };
}

module.exports = { generateOTP, formatPhoneNumber, sendSMS, sendOTP };
