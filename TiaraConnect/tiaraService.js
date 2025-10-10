const axios = require("axios");
require("dotenv").config();

const TIARA_URL = "https://api2.tiaraconnect.io/api/messaging/sendsms";
const API_KEY =
  "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI2NTAiLCJvaWQiOjY1MCwidWlkIjoiZDM2NTFjYzItZmRjNS00NmM1LTgxNzQtOTA4YWE0ZGE2YjA4IiwiYXBpZCI6NjUzLCJpYXQiOjE3NjAxMDgyMjIsImV4cCI6MjEwMDEwODIyMn0.MrReTPTpMf1GaDQnzXpF7DNLfcltEWTcWa0PL-3T1l4bum0xX6W7lnU0bq3iJShjM8xbwImMyrUIjQ2DS0GrjQ";
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
  if (cleaned.startsWith("254") && cleaned.length >= 12) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 10)
    return "254" + cleaned.slice(1);
  if (cleaned.length === 9) return "254" + cleaned;
  return cleaned;
}

async function sendSMS(to, message) {
  if (!API_KEY) {
    throw new Error("TIARA_API_KEY environment variable is not set");
  }

  const msisdn = formatPhoneNumber(to);

  const payload = {
    to: msisdn,
    message,
    from: SENDER_ID,
  };

  try {
    const resp = await axios.post(TIARA_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      timeout: TIMEOUT,
    });
    return { success: true, data: resp.data };
  } catch (err) {
    console.error("=== Tiara Connect Error ===");
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
  const message = `Hello ${name}, your verification code is ${otp}. It expires in 5 minutes. Do not share it.`;
  const result = await sendSMS(phone, message);
  return { ...result, otp };
}

module.exports = { generateOTP, formatPhoneNumber, sendSMS, sendOTP };
