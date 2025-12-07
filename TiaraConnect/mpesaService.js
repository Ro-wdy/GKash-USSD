const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

// M-Pesa API credentials
const CONSUMER_KEY =
  process.env.MPESA_CONSUMER_KEY ||
  "7FmuvDlDqRWd1WigJykD1EWEPf7hj2hjgdmRQEW25qjbE3VP";
const CONSUMER_SECRET =
  process.env.MPESA_CONSUMER_SECRET ||
  "qPUpuMPe8ouiKsDIkp6sTsAHpzDMAWjqfAG4haY8dSgjj0b9mQFGB39iZA7AynyZ";
const MPESA_ENV = (process.env.MPESA_ENV || "sandbox").toLowerCase(); // 'sandbox' or 'production'
const MPESA_BUSINESS_SHORTCODE = process.env.MPESA_SHORTCODE || "174379";
const MPESA_PASSKEY =
  process.env.MPESA_PASSKEY ||
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const MPESA_INITIATOR_NAME = process.env.MPESA_INITIATOR_NAME || "testapi";
const MPESA_INITIATOR_PASSWORD =
  process.env.MPESA_INITIATOR_PASSWORD || "Safaricom123!!";
const MPESA_PARTY_A = process.env.MPESA_PARTY_A || "600990";
const MPESA_PARTY_B = process.env.MPESA_PARTY_B || "600000";

// M-Pesa API endpoints (switch based on environment)
const MPESA_AUTH_URL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const MPESA_STKPUSH_URL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
    : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
const MPESA_B2C_URL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
    : "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";
const MPESA_CALLBACK_URL =
  process.env.MPESA_CALLBACK_URL ||
  "https://tiara-connect-otp.onrender.com/mpesa/callback";

// Generate security credential (for B2C)
function generateSecurityCredential() {
  if (!MPESA_INITIATOR_PASSWORD) {
    throw new Error("MPESA_INITIATOR_PASSWORD is not set in environment");
  }

  // Accept public key with escaped newlines or full PEM
  let publicKey = MPESA_PUBLIC_KEY || "";
  if (!publicKey) {
    throw new Error("MPESA_PUBLIC_KEY is not set in environment");
  }

  // If the env contains literal \\n+  // sequences, convert them to real newlines
  if (publicKey.indexOf("\\n") !== -1) {
    publicKey = publicKey.replace(/\\n/g, "\n");
  }

  // Ensure PEM wrapper exists
  if (!publicKey.includes("BEGIN")) {
    publicKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
  }

  const buffer = Buffer.from(MPESA_INITIATOR_PASSWORD);
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return encrypted.toString("base64");
}

// Get M-Pesa access token
async function getAccessToken() {
  try {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString(
      "base64"
    );
    const response = await axios.get(MPESA_AUTH_URL, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
    return response.data.access_token;
  } catch (error) {
    console.error("M-Pesa Auth Error:", error.response?.data || error.message);
    throw new Error("Failed to get M-Pesa access token");
  }
}

// Generate password for STK Push
function generatePassword(shortcode, passkey, timestamp) {
  const str = shortcode + passkey + timestamp;
  return Buffer.from(str).toString("base64");
}

// Initiate STK Push (for deposits)
async function initiateSTKPush(phone, amount, accountReference, description) {
  try {
    // Normalize phone number: remove + prefix if present
    let normalizedPhone = String(phone).replace(/^\+/, "");
    if (normalizedPhone.startsWith("254")) {
      // Already in correct format
    } else if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "254" + normalizedPhone.slice(1);
    }

    const accessToken = await getAccessToken();
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, -3);
    const password = generatePassword(
      MPESA_BUSINESS_SHORTCODE,
      MPESA_PASSKEY,
      timestamp
    );

    const response = await axios.post(
      MPESA_STKPUSH_URL,
      {
        BusinessShortCode: MPESA_BUSINESS_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: normalizedPhone,
        PartyB: MPESA_BUSINESS_SHORTCODE,
        PhoneNumber: normalizedPhone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: accountReference,
        TransactionDesc: description || "Deposit to Gkash",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("STK Push Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Initiate B2C payment (for withdrawals)
async function initiateB2CPayment(
  phone,
  amount,
  remarks = "Withdrawal from Gkash"
) {
  try {
    // Normalize phone number: remove + prefix if present
    let normalizedPhone = String(phone).replace(/^\+/, "");
    if (normalizedPhone.startsWith("254")) {
      // Already in correct format
    } else if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "254" + normalizedPhone.slice(1);
    }

    const accessToken = await getAccessToken();
    const securityCredential = generateSecurityCredential();

    const response = await axios.post(
      MPESA_B2C_URL,
      {
        InitiatorName: MPESA_INITIATOR_NAME,
        SecurityCredential: securityCredential,
        CommandID: "BusinessPayment",
        Amount: amount,
        PartyA: MPESA_SHORTCODE,
        PartyB: normalizedPhone,
        Remarks: remarks,
        QueueTimeOutURL: `${MPESA_CALLBACK_URL}/b2c/timeout`,
        ResultURL: `${MPESA_CALLBACK_URL}/b2c/result`,
        Occasion: "Withdrawal",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("B2C Payment Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Handle M-Pesa callback
function handleMpesaCallback(callbackData) {
  // Process the callback data from M-Pesa
  // This should be implemented based on your business logic
  console.log("M-Pesa Callback:", callbackData);
  return { success: true, data: callbackData };
}

module.exports = {
  initiateSTKPush,
  initiateB2CPayment,
  handleMpesaCallback,
  getAccessToken,
};
