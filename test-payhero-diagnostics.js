const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "TiaraConnect", ".env") });

const BASE_URL = (process.env.PAYHERO_BASE_URL || "https://backend.payhero.co.ke/api/v2").replace(/\/+$/, "");
const USERNAME = process.env.PAYHERO_USERNAME || "";
const PASSWORD = process.env.PAYHERO_PASSWORD || "";
const TOKEN = process.env.PAYHERO_AUTH_TOKEN || "";
const CONFIGURED_CHANNEL_ID = Number(process.env.PAYHERO_CHANNEL_ID || 0);
const TEST_PHONE = process.env.TEST_PHONE || "";

function normalizePhoneNumber(phone) {
  let normalized = String(phone || "").trim().replace(/\s+/g, "").replace(/^\+/, "");
  if (normalized.startsWith("0")) normalized = `254${normalized.slice(1)}`;
  else if (normalized && !normalized.startsWith("254")) normalized = `254${normalized}`;
  return normalized;
}

function getAuthHeader() {
  if (TOKEN) {
    const clean = TOKEN.replace(/^Basic\s+/i, "").trim();
    return `Basic ${clean}`;
  }
  if (!USERNAME || !PASSWORD) {
    throw new Error("PAYHERO_USERNAME/PAYHERO_PASSWORD (or PAYHERO_AUTH_TOKEN) not set");
  }
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`;
}

async function request(method, endpoint, data, params) {
  return axios({
    method,
    url: `${BASE_URL}${endpoint}`,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    data,
    params,
    timeout: 30000,
  });
}

function line(title, value) {
  console.log(`${title}: ${value}`);
}

function printError(label, error) {
  const status = error.response?.status || "n/a";
  const body = error.response?.data || error.message;
  console.log(`✗ ${label} (status: ${status})`);
  console.log(body);
}

async function run() {
  const args = process.argv.slice(2);
  const shouldRunWithdraw = args.includes("--run-withdraw");
  const amountArg = args.find((a) => a.startsWith("--amount="));
  const phoneArg = args.find((a) => a.startsWith("--phone="));
  const amount = amountArg ? Number(amountArg.split("=")[1]) : 1;
  const phone = normalizePhoneNumber(phoneArg ? phoneArg.split("=")[1] : TEST_PHONE);

  console.log("\n=== PayHero Diagnostics ===\n");
  line("Base URL", BASE_URL);
  line("Configured channel ID", CONFIGURED_CHANNEL_ID || "(missing)");
  line("Test phone", phone || "(missing)");

  try {
    const tx = await request("get", "/transactions", undefined, { per: 1 });
    const first = tx.data?.transactions?.[0];
    console.log("\n✓ Auth check OK via /transactions");
    if (first) {
      line("Last transaction channel_id", first.channel_id ?? "null");
      line("Last transaction type", first.transaction_type || "n/a");
      line("Last transaction gateway", first.gateway || "n/a");
    }
  } catch (error) {
    printError("Auth check via /transactions", error);
    process.exit(1);
  }

  let channels = [];
  try {
    const channelsResp = await request("get", "/payment_channels", undefined, {
      is_active: true,
      per: 100,
    });
    channels = channelsResp.data?.payment_channels || [];
    console.log(`\n✓ Loaded active payment channels: ${channels.length}`);
    channels.slice(0, 10).forEach((channel) => {
      console.log(
        `  - id=${channel.id} type=${channel.transaction_type} channel_type=${channel.channel_type} short_code=${channel.short_code}`
      );
    });
  } catch (error) {
    printError("Load /payment_channels", error);
  }

  const configured = channels.find((channel) => Number(channel.id) === CONFIGURED_CHANNEL_ID);
  if (!configured) {
    console.log("\n⚠ Configured PAYHERO_CHANNEL_ID was not found in active payment channels.");
    console.log("  This is the most likely reason for withdraw failures.");
  } else {
    console.log("\n✓ Configured channel is present in active channel list.");
    line("Configured channel type", configured.channel_type || "n/a");
    line("Configured transaction type", configured.transaction_type || "n/a");
  }

  if (CONFIGURED_CHANNEL_ID) {
    try {
      const detail = await request("get", `/payment_channels/${CONFIGURED_CHANNEL_ID}`);
      console.log("\n✓ Channel detail lookup succeeded.");
      line("Detail id", detail.data?.id ?? "n/a");
      line("Detail channel_type", detail.data?.channel_type ?? "n/a");
      line("Detail short_code", detail.data?.short_code ?? "n/a");
    } catch (error) {
      printError(`Channel detail /payment_channels/${CONFIGURED_CHANNEL_ID}`, error);
      console.log("  This confirms channel ID may be invalid for wallet operations.");
    }
  }

  if (!shouldRunWithdraw) {
    console.log("\nRead-only diagnostics complete.");
    console.log("To run a live withdraw test, execute:");
    console.log("  node test-payhero-diagnostics.js --run-withdraw --amount=1 --phone=2547XXXXXXXX");
    return;
  }

  if (!phone || !Number.isFinite(amount) || amount <= 0) {
    console.log("\n✗ Cannot run live withdraw test. Provide valid --phone and --amount.");
    process.exit(1);
  }

  const reference = `WDR-DIAG-${Date.now()}`;
  const payload = {
    external_reference: reference,
    amount,
    phone_number: phone,
    network_code: "63902",
    channel: "mobile",
    channel_id: CONFIGURED_CHANNEL_ID,
    payment_service: "b2c",
    callback_url:
      process.env.PAYHERO_CALLBACK_URL || "https://tiara-connect-otp.onrender.com/payhero/callback",
  };

  try {
    const withdraw = await request("post", "/withdraw", payload);
    console.log("\n✓ Live withdraw request accepted by PayHero.");
    console.log(withdraw.data);
  } catch (error) {
    printError("Live withdraw /withdraw", error);
  }
}

run().catch((error) => {
  console.error("\nDiagnostics failed:", error.message);
  process.exit(1);
});
