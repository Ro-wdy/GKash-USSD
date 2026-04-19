const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PAYHERO_BASE_URL = (
  process.env.PAYHERO_BASE_URL || "https://backend.payhero.co.ke/api/v2"
).replace(/\/+$/, "");
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME || "";
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD || "";
const PAYHERO_AUTH_TOKEN = process.env.PAYHERO_AUTH_TOKEN || "";
const PAYHERO_CHANNEL_ID = Number(process.env.PAYHERO_CHANNEL_ID || 0);
const PAYHERO_TILL_NUMBER = process.env.PAYHERO_TILL_NUMBER || "";
const PAYHERO_CALLBACK_URL =
  process.env.PAYHERO_CALLBACK_URL ||
  "https://tiara-connect-otp.onrender.com/payhero/callback";

function normalizePhoneNumber(phone) {
  let normalized = String(phone || "").trim().replace(/\s+/g, "");
  normalized = normalized.replace(/^\+/, "");

  if (normalized.startsWith("0")) {
    normalized = `254${normalized.slice(1)}`;
  } else if (!normalized.startsWith("254") && normalized.length > 0) {
    normalized = `254${normalized}`;
  }

  return normalized;
}

function buildAuthToken() {
  if (PAYHERO_AUTH_TOKEN) {
    return PAYHERO_AUTH_TOKEN.replace(/^Basic\s+/i, "").trim();
  }

  if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD) {
    throw new Error("PayHero credentials are not set");
  }

  return Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString(
    "base64"
  );
}

function buildHeaders() {
  return {
    Authorization: `Basic ${buildAuthToken()}`,
    "Content-Type": "application/json",
  };
}

function buildUrl(path) {
  return `${PAYHERO_BASE_URL}${path}`;
}

function generateReference(prefix = "PH") {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

async function requestPayHero(path, method, data, params) {
  const response = await axios({
    method,
    url: buildUrl(path),
    headers: buildHeaders(),
    data,
    params,
    timeout: 30000,
  });
  return response.data;
}

// Keep legacy name for compatibility with the rest of the app.
async function getAccessToken() {
  return buildAuthToken();
}

async function getPaymentChannels(isActive = true) {
  return requestPayHero(
    "/payment_channels",
    "get",
    undefined,
    typeof isActive === "boolean" ? { is_active: isActive } : undefined
  );
}

async function getTransactionStatus(reference) {
  if (!reference) {
    throw new Error("reference is required");
  }
  return requestPayHero("/transaction-status", "get", undefined, {
    reference,
  });
}

async function initiateSTKPush(
  phone,
  amount,
  accountReference,
  description,
  options = {}
) {
  try {
    const normalizedPhone = normalizePhoneNumber(phone);
    const externalReference =
      options.externalReference || accountReference || generateReference("INV");

    const payload = {
      amount: Number(amount),
      phone_number: normalizedPhone,
      channel_id: Number(options.channelId || PAYHERO_CHANNEL_ID),
      provider: "m-pesa",
      external_reference: externalReference,
      customer_name: options.customerName || options.customer_name,
      callback_url: options.callbackUrl || PAYHERO_CALLBACK_URL,
    };

    if (!payload.channel_id || !Number.isFinite(payload.amount)) {
      throw new Error("PayHero STK push requires a valid channel ID and amount");
    }

    if (!payload.customer_name) {
      payload.customer_name = description || `Gkash customer (${PAYHERO_TILL_NUMBER || "PayHero"})`;
    }

    const data = await requestPayHero("/payments", "post", payload);

    return {
      success: true,
      data,
      reference: data.reference || data.CheckoutRequestID || externalReference,
      externalReference,
    };
  } catch (error) {
    console.error("PayHero STK Push Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

async function initiateB2CPayment(
  phone,
  amount,
  remarks = "Withdrawal from Gkash",
  options = {}
) {
  try {
    const normalizedPhone = normalizePhoneNumber(phone);
    const externalReference =
      options.externalReference || generateReference("WDR");

    const payload = {
      external_reference: externalReference,
      amount: Number(amount),
      phone_number: normalizedPhone,
      network_code: options.networkCode || "63902",
      callback_url: options.callbackUrl || PAYHERO_CALLBACK_URL,
      channel: "mobile",
      channel_id: Number(options.channelId || PAYHERO_CHANNEL_ID),
      payment_service: "b2c",
    };

    if (!payload.channel_id || !Number.isFinite(payload.amount)) {
      throw new Error("PayHero withdrawal requires a valid channel ID and amount");
    }

    const data = await requestPayHero("/withdraw", "post", payload);

    return {
      success: true,
      data,
      reference: data.merchant_reference || data.reference || externalReference,
      externalReference,
      message: remarks,
    };
  } catch (error) {
    console.error("PayHero withdrawal error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

function handleMpesaCallback(callbackData) {
  const response = callbackData?.response || callbackData?.Body?.stkCallback || callbackData;
  const status = String(response?.Status || response?.status || "").toLowerCase();
  const resultCode = response?.ResultCode;
  const success =
    callbackData?.status === true ||
    status === "success" ||
    resultCode === 0 ||
    response?.success === true;

  return {
    success,
    provider: response?.provider || "m-pesa",
    amount: response?.Amount,
    phone: response?.Phone || response?.phone_number,
    reference:
      response?.ExternalReference ||
      response?.external_reference ||
      response?.CheckoutRequestID ||
      response?.checkout_request_id ||
      response?.MerchantRequestID ||
      response?.merchant_reference,
    providerReference:
      response?.MpesaReceiptNumber ||
      response?.provider_reference ||
      response?.CheckoutRequestID ||
      response?.checkout_request_id,
    raw: callbackData,
  };
}

module.exports = {
  initiateSTKPush,
  initiateB2CPayment,
  handleMpesaCallback,
  getAccessToken,
  getPaymentChannels,
  getTransactionStatus,
  normalizePhoneNumber,
};
