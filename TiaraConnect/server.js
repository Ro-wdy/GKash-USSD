/*
  Gkash USSD Server (Express)
  Clean single implementation that:
  - Uses in-memory stores for development
  - New users register with OTP validation then PIN
  - Existing users adding accounts require PIN only
  - If a user has multiple accounts, Invest/Withdraw force account selection first
*/

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const { sendSMS, sendOTP, generateOTP } = require("./tiaraService");
const {
  initiateSTKPush,
  initiateB2CPayment,
  normalizePhoneNumber,
} = require("./mpesaService");
const {
  isPostgresEnabled,
  initPostgres,
  upsertAccount,
  loadAccounts,
  upsertUser,
  loadUsers,
  upsertTransactions,
  loadTransactions,
} = require("./postgresService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Data persistence file paths
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load data from files or initialize empty
function loadData() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const usersData = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
      Object.entries(usersData).forEach(([key, value]) =>
        users.set(key, value)
      );
      console.log(`[Persistence] Loaded ${users.size} users`);
    }
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const accountsData = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
      Object.entries(accountsData).forEach(([key, value]) =>
        accounts.set(key, value)
      );
      console.log(`[Persistence] Loaded ${accounts.size} accounts`);
    }
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const transactionsData = JSON.parse(
        fs.readFileSync(TRANSACTIONS_FILE, "utf8")
      );
      Object.entries(transactionsData).forEach(([key, value]) =>
        transactions.set(key, value)
      );
      console.log(
        `[Persistence] Loaded ${
          Object.keys(transactionsData).length
        } transaction histories`
      );
    }
  } catch (error) {
    console.error("[Persistence] Error loading data:", error);
  }
}

// Save data to files
function saveData() {
  try {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(Object.fromEntries(users), null, 2)
    );
    fs.writeFileSync(
      ACCOUNTS_FILE,
      JSON.stringify(Object.fromEntries(accounts), null, 2)
    );
    fs.writeFileSync(
      TRANSACTIONS_FILE,
      JSON.stringify(Object.fromEntries(transactions), null, 2)
    );
    persistAllToPostgres();
  } catch (error) {
    console.error("[Persistence] Error saving data:", error);
  }
}

let pgPersistInFlight = false;
function persistAllToPostgres() {
  if (!isPostgresEnabled() || pgPersistInFlight) return;

  pgPersistInFlight = true;
  (async () => {
    try {
      await initPostgres();

      for (const account of accounts.values()) {
        await upsertAccount(account);
      }

      for (const [phone, user] of users.entries()) {
        await upsertUser(phone, user);
      }

      for (const [accountId, txList] of transactions.entries()) {
        await upsertTransactions(accountId, txList || []);
      }
    } catch (error) {
      console.error("[Postgres] Persist snapshot failed:", error.message);
    } finally {
      pgPersistInFlight = false;
    }
  })();
}

// Auto-save every 30 seconds
setInterval(saveData, 30000);

// Save on graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Persistence] SIGTERM received, saving data...");
  saveData();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Persistence] SIGINT received, saving data...");
  saveData();
  process.exit(0);
});

// In-memory stores with persistence
const users = new Map(); // phone -> { name, email, pin, defaultAccountId, accounts: { accountId: { fund } } }
const accounts = new Map(); // accountId -> { id, phone, fund, name, balance, createdAt }
const transactions = new Map(); // accountId -> [{ type, amount, createdAt }]
const pendingOTPs = new Map(); // phone -> { otp, expiresAt, data: { fund, name, email, pin, userPhone } }
const pendingPayments = new Map(); // reference -> { type, phone, accountId, amount, status, createdAt, payload }

// Load persisted data on startup
loadData();

const FUNDS = {
  1: "Money Market Fund",
  2: "Fixed Income Fund",
  3: "Balanced Fund",
  4: "Stock Market",
};

function generateAccountId() {
  return "GK" + Math.floor(10000000 + Math.random() * 90000000);
}
function getUserAccounts(phone) {
  return Array.from(accounts.values()).filter((a) => a.phone === phone);
}
function toK(n) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n);
}

function createPaymentReference(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function registerPendingPayment(payload) {
  if (!payload || !payload.reference) return;
  pendingPayments.set(payload.reference, {
    ...payload,
    status: "PENDING",
    createdAt: new Date(),
  });
}

function updatePendingPayment(reference, updates) {
  if (!reference || !pendingPayments.has(reference)) return null;
  const current = pendingPayments.get(reference);
  const next = { ...current, ...updates };
  pendingPayments.set(reference, next);
  return next;
}

function normalizeIncomingPhone(phone) {
  return normalizePhoneNumber(phone || "");
}

function formatPayHeroError(error) {
  if (!error) return "Unknown PayHero error.";
  if (typeof error === "string") return error;
  if (error.error_message) return error.error_message;
  if (error.message) return error.message;
  return JSON.stringify(error);
}

function applyPayHeroCallback(callbackPayload) {
  const parsed =
    callbackPayload?.response || callbackPayload?.Body?.stkCallback || callbackPayload;
  const reference =
    parsed?.ExternalReference ||
    parsed?.external_reference ||
    parsed?.CheckoutRequestID ||
    parsed?.checkout_request_id ||
    parsed?.MerchantRequestID ||
    parsed?.merchant_reference;
  const status = String(parsed?.Status || parsed?.status || "").toLowerCase();
  const success =
    callbackPayload?.status === true ||
    status === "success" ||
    parsed?.ResultCode === 0 ||
    parsed?.success === true;

  const pending = reference ? pendingPayments.get(reference) : null;

  if (!pending) {
    console.log("[PayHero] Callback received without a matching pending payment", {
      reference,
      callbackPayload,
    });
    return { success, matched: false, reference, parsed };
  }

  const account = accounts.get(pending.accountId);
  if (!account) {
    console.log("[PayHero] Pending payment matched but account is missing", {
      reference,
      pending,
    });
    updatePendingPayment(reference, {
      status: success ? "SUCCESS" : "FAILED",
      callback: callbackPayload,
    });
    return { success, matched: true, reference, pending, parsed };
  }

  if (success) {
    if (pending.type === "invest") {
      account.balance = (account.balance || 0) + Number(pending.amount || 0);
      addTxForAccount(account.id, {
        type: "PAYHERO_DEPOSIT",
        amount: Number(pending.amount || 0),
        reference,
        providerReference:
          parsed?.MpesaReceiptNumber || parsed?.provider_reference || reference,
      });
      updatePendingPayment(reference, {
        status: "SUCCESS",
        callback: callbackPayload,
        providerReference:
          parsed?.MpesaReceiptNumber || parsed?.provider_reference || reference,
      });
      pendingPayments.delete(reference);
      return { success: true, matched: true, reference, pending, account };
    }

    if (pending.type === "withdraw") {
      const amount = Number(pending.amount || 0);
      const currentBalance = Number(account.balance || 0);
      account.balance = Math.max(0, currentBalance - amount);
      addTxForAccount(account.id, {
        type: "PAYHERO_WITHDRAWAL",
        amount,
        reference,
        providerReference:
          parsed?.MpesaReceiptNumber || parsed?.provider_reference || reference,
      });
      updatePendingPayment(reference, {
        status: "SUCCESS",
        callback: callbackPayload,
        providerReference:
          parsed?.MpesaReceiptNumber || parsed?.provider_reference || reference,
      });
      pendingPayments.delete(reference);
      return { success: true, matched: true, reference, pending, account };
    }
  } else {
    addTxForAccount(account.id, {
      type:
        pending.type === "invest"
          ? "PAYHERO_DEPOSIT_FAILED"
          : "PAYHERO_WITHDRAWAL_FAILED",
      amount: Number(pending.amount || 0),
      reference,
      providerReference:
        parsed?.MpesaReceiptNumber || parsed?.provider_reference || reference,
    });
    updatePendingPayment(reference, {
      status: "FAILED",
      callback: callbackPayload,
    });
    pendingPayments.delete(reference);
  }

  return { success, matched: true, reference, pending, account, parsed };
}

function createAccount(phone, fundKey, accountName) {
  const id = generateAccountId();
  const acc = {
    id,
    phone,
    fund: FUNDS[fundKey],
    name:
      accountName ||
      `${FUNDS[fundKey]} ${Math.floor(1000 + Math.random() * 9000)}`,
    balance: 0,
    createdAt: new Date(),
  };
  accounts.set(id, acc);
  const user = users.get(phone) || { phone, accounts: {} };
  user.accounts = user.accounts || {};
  user.accounts[id] = { fund: fundKey };
  if (!user.defaultAccountId) user.defaultAccountId = id;
  users.set(phone, user);
  transactions.set(id, []);
  upsertAccount(acc).catch((error) => {
    console.error("[Postgres] Failed to save account:", error.message);
  });
  upsertUser(phone, user).catch((error) => {
    console.error("[Postgres] Failed to save user:", error.message);
  });
  upsertTransactions(id, []).catch((error) => {
    console.error("[Postgres] Failed to initialize account transactions:", error.message);
  });
  saveData(); // Persist data
  return acc;
}

async function syncAccountsFromPostgres() {
  try {
    if (!isPostgresEnabled()) {
      console.log("[Postgres] Not configured. Using local JSON persistence only.");
      return;
    }

    await initPostgres();
    const dbAccounts = await loadAccounts();
    const dbUsers = await loadUsers();
    const dbTransactions = await loadTransactions();

    for (const account of dbAccounts.accounts) {
      if (!accounts.has(account.id)) {
        accounts.set(account.id, account);
      }
      if (!transactions.has(account.id)) {
        transactions.set(account.id, []);
      }
    }

    for (const item of dbUsers.users) {
      users.set(item.phone, item.data || {});
    }

    for (const item of dbTransactions.transactions) {
      transactions.set(item.accountId, item.txList || []);
    }

    console.log(
      `[Postgres] Loaded ${dbAccounts.accounts.length} accounts, ${dbUsers.users.length} users, ${dbTransactions.transactions.length} transaction sets`
    );
  } catch (error) {
    console.error("[Postgres] Startup sync failed:", error.message);
  }
}

function addTxForAccount(accountId, tx) {
  const list = transactions.get(accountId) || [];
  list.unshift({ ...tx, createdAt: new Date() });
  transactions.set(accountId, list.slice(0, 20));
  saveData(); // Persist data
}

function welcomeMenu() {
  return [
    "CON Welcome to Gkash, Learn.Invest.Grow",
    "1. Create account",
    "2. Invest",
    "3. Withdraw",
    "4. Check balance",
    "5. Track account",
    "6. Manage accounts",
  ].join("\n");
}

function fundMenu(prefix) {
  let menu = "CON ";
  if (prefix) menu += prefix + "\n";
  menu +=
    "Select fund type:\n1. Money Market Fund\n2. Fixed Income Fund\n3. Balanced Fund\n4. Stock Market";
  return menu;
}

function showUserAccountsForOperation(phone, prompt) {
  const userAccounts = getUserAccounts(phone);
  if (!userAccounts || userAccounts.length === 0)
    return "END No accounts found. Please create an account first.";
  let r = "CON " + (prompt || "Select account:") + "\n";
  userAccounts.forEach((a, i) => {
    r += `${i + 1}. ${a.name} (${a.id})\n`;
  });
  return r;
}

function resolveSelectedAccount(phone, parts) {
  const userAccounts = getUserAccounts(phone);
  if (!userAccounts || userAccounts.length === 0)
    return { account: null, offset: 1 };
  if (userAccounts.length === 1) return { account: userAccounts[0], offset: 1 };
  const sel = parts[1];
  const idx = parseInt(sel, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= userAccounts.length)
    return { account: null, offset: 1 };
  return { account: userAccounts[idx], offset: 2 };
}

// Create account handler
// New user: fund -> name -> id -> pin -> create (PIN-only)
// Existing user: fund -> PIN -> create
async function handleCreateAccount(parts, phone) {
  const existingUser = users.get(phone);
  if (existingUser) {
    if (parts.length === 1) return fundMenu("");
    if (parts.length === 2) {
      const fund = parts[1];
      if (!FUNDS[fund]) return fundMenu("Invalid choice. Try again.");
      return "CON Enter your PIN";
    }
    if (parts.length === 3) {
      const fund = parts[1];
      const pin = parts[2];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!/^\d{4}$/.test(pin)) return "CON Invalid PIN. Enter 4 digits:";
      if (existingUser.pin !== pin) return "END Invalid PIN";
      const acc = createAccount(
        phone,
        fund,
        `${existingUser.name}'s ${FUNDS[fund]} ${
          Object.keys(existingUser.accounts || {}).length + 1
        }`
      );
      addTxForAccount(acc.id, { type: "ACCOUNT_CREATED", amount: 0 });
      try {
        await sendSMS(phone, `New ${FUNDS[fund]} account created: ${acc.id}`);
      } catch (e) {
        console.error(e);
      }
      return `END New ${FUNDS[fund]} account created successfully!\nAccount No: ${acc.id}`;
    }
    return "END Invalid request.";
  }

  // new user flow: name -> email -> pin -> confirm pin -> phone -> OTP
  try {
    if (parts.length === 1) return fundMenu("");

    // Step 1: Select fund
    if (parts.length === 2) {
      const fund = parts[1];
      if (!FUNDS[fund]) return fundMenu("Invalid choice. Try again.");
      return "CON Enter your full name";
    }

    // Step 2: Enter name
    if (parts.length === 3) {
      const fund = parts[1];
      const name = parts[2];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!name || name.trim().length < 2)
        return "CON Name too short. Enter full name:";
      return "CON Enter your email address";
    }

    // Step 3: Enter email
    if (parts.length === 4) {
      const fund = parts[1];
      const name = parts[2];
      const email = parts[3];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return "CON Invalid email. Enter valid email:";
      return "CON Create a 4-digit PIN";
    }

    // Step 4: Enter PIN
    if (parts.length === 5) {
      const fund = parts[1];
      const name = parts[2];
      const email = parts[3];
      const pin = parts[4];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!/^\d{4}$/.test(pin)) return "CON Invalid PIN. Enter 4 digits:";
      return "CON Confirm your 4-digit PIN";
    }

    // Step 5: Confirm PIN
    if (parts.length === 6) {
      const fund = parts[1];
      const name = parts[2];
      const email = parts[3];
      const pin = parts[4];
      const confirmPin = parts[5];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (pin !== confirmPin) return "CON PINs don't match. Re-enter PIN:";
      return "CON Enter your phone number (e.g. 07xxxxxxxx) to receive OTP";
    }

    // Step 6: Enter phone number and send OTP
    if (parts.length === 7) {
      const fund = parts[1];
      const name = parts[2];
      const email = parts[3];
      const pin = parts[4];
      const confirmPin = parts[5];
      const userPhone = parts[6];

      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (pin !== confirmPin) return "END PIN mismatch. Please start over.";

      // Validate phone number format
      const phoneRegex = /^(0|254|\+254)?[17]\d{8}$/;
      if (!phoneRegex.test(userPhone.replace(/\s+/g, "")))
        return "CON Invalid phone number. Enter valid number:";

      // Normalize phone number
      let normalizedUserPhone = userPhone.replace(/\s+/g, "");
      if (normalizedUserPhone.startsWith("0")) {
        normalizedUserPhone = "254" + normalizedUserPhone.slice(1);
      } else if (normalizedUserPhone.startsWith("+254")) {
        normalizedUserPhone = normalizedUserPhone.slice(1);
      } else if (!normalizedUserPhone.startsWith("254")) {
        normalizedUserPhone = "254" + normalizedUserPhone;
      }

      // Generate and send OTP to user's phone
      try {
        const otpResult = await sendOTP(normalizedUserPhone, name, 6);
        if (!otpResult.success) {
          console.error("sendOTP failed:", otpResult.error);
          return "END Error sending OTP. Please try again.";
        }
        const expiresAt = Date.now() + 60000; // 1 minute
        pendingOTPs.set(normalizedUserPhone, {
          otp: otpResult.otp,
          expiresAt,
          data: {
            fund,
            name: name.trim(),
            email,
            pin,
            userPhone: normalizedUserPhone,
          },
        });
      } catch (e) {
        console.error("OTP sending error:", e);
        return "END Error sending OTP. Please try again.";
      }
      return "CON Enter OTP sent to " + userPhone;
    }

    // Step 7: Verify OTP and create account
    if (parts.length === 8) {
      const fund = parts[1];
      const name = parts[2];
      const email = parts[3];
      const pin = parts[4];
      const confirmPin = parts[5];
      const userPhone = parts[6];
      const otpInput = parts[7];

      // Normalize phone to check pendingOTPs
      let normalizedUserPhone = userPhone.replace(/\s+/g, "");
      if (normalizedUserPhone.startsWith("0")) {
        normalizedUserPhone = "254" + normalizedUserPhone.slice(1);
      } else if (normalizedUserPhone.startsWith("+254")) {
        normalizedUserPhone = normalizedUserPhone.slice(1);
      } else if (!normalizedUserPhone.startsWith("254")) {
        normalizedUserPhone = "254" + normalizedUserPhone;
      }

      const pendingOTP = pendingOTPs.get(normalizedUserPhone);

      if (!pendingOTP) return "END OTP session expired. Please start over.";
      if (Date.now() > pendingOTP.expiresAt) {
        pendingOTPs.delete(normalizedUserPhone);
        return "END OTP expired. Please start over.";
      }
      if (otpInput !== pendingOTP.otp) return "CON Invalid OTP. Try again:";

      // OTP verified! Create account with user's phone number
      const acc = createAccount(
        normalizedUserPhone,
        fund,
        `${name}'s ${FUNDS[fund]}`
      );
      users.set(normalizedUserPhone, {
        name: name.trim(),
        email,
        pin,
        defaultAccountId: acc.id,
        accounts: { [acc.id]: { fund } },
      });
      upsertUser(normalizedUserPhone, users.get(normalizedUserPhone)).catch(
        (error) => {
          console.error("[Postgres] Failed to save user:", error.message);
        }
      );
      addTxForAccount(acc.id, { type: "ACCOUNT_CREATED", amount: 0 });
      pendingOTPs.delete(normalizedUserPhone);

      try {
        await sendSMS(
          normalizedUserPhone,
          `Welcome to Gkash ${name}! Your ${FUNDS[fund]} account is ready. Account No: ${acc.id}`
        );
      } catch (e) {
        console.error(e);
      }
      return `END Registration successful!\nYour ${FUNDS[fund]} has been created.\nAccount No: ${acc.id}`;
    }
    return "END Invalid request.";
  } catch (err) {
    console.error("handleCreateAccount error", err);
    return "END Error creating account. Try again.";
  }
}

// Invest
async function handleInvest(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1)
    return showUserAccountsForOperation(phone, "Select account to invest into");
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(phone, "Select account to invest into");
  if (parts.length === offset) return "CON Enter amount to invest (KES)";
  const idx = offset;
  const amount = Number(parts[idx]);
  if (!Number.isFinite(amount) || amount <= 0)
    return "CON Invalid amount. Enter a positive number (KES)";
  if (parts.length === idx + 1) return "CON Enter your PIN";
  const pin = parts[idx + 1];
  const user = users.get(phone);
  if (!user)
    return "END No account found for this number. Please create an account first.";
  if (user.pin !== pin) return "END Invalid PIN";
  if (account) {
    const externalReference = createPaymentReference("INV");
    try {
      const stkResult = await initiateSTKPush(
        phone,
        amount,
        account.id,
        `GKash Investment - ${account.name}`,
        {
          externalReference,
          customerName: user.name || account.name,
          callbackUrl:
            process.env.PAYHERO_CALLBACK_URL ||
            "https://tiara-connect-otp.onrender.com/payhero/callback",
          channelId: Number(process.env.PAYHERO_CHANNEL_ID || 0),
        }
      );
      if (stkResult.success) {
        registerPendingPayment({
          reference: externalReference,
          type: "invest",
          phone,
          accountId: account.id,
          amount,
          checkoutRequestId: stkResult.data?.CheckoutRequestID,
          payload: stkResult.data,
        });
        addTxForAccount(account.id, {
          type: "PAYHERO_DEPOSIT_PENDING",
          amount,
          reference: externalReference,
        });
        return `CON PayHero payment prompt sent to your phone.\nTill: ${
          process.env.PAYHERO_TILL_NUMBER || "PayHero"
        }\nAmount: KES ${toK(amount)}\nReference: ${externalReference}\nPlease complete payment.`;
      }
      return `END Failed to start PayHero payment. ${formatPayHeroError(
        stkResult.error
      )}`;
    } catch (e) {
      console.error("PayHero STK Push error:", e);
      return "END Failed to start PayHero payment. Please try again.";
    }
  }
  return "END Account selection error.";
}

// Withdraw
async function handleWithdraw(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1)
    return showUserAccountsForOperation(
      phone,
      "Select account to withdraw from"
    );
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(
      phone,
      "Select account to withdraw from"
    );
  if (parts.length === offset) return "CON Enter amount to withdraw (KES)";
  const idx = offset;
  const amount = Number(parts[idx]);
  if (!Number.isFinite(amount) || amount <= 0)
    return "CON Invalid amount. Enter a positive number (KES)";
  if (parts.length === idx + 1) return "CON Enter your PIN";
  const pin = parts[idx + 1];
  const user = users.get(phone);
  if (!user)
    return "END No account found for this number. Please create an account first.";
  if (user.pin !== pin) return "END Invalid PIN";
  if (account) {
    if (amount > (account.balance || 0))
      return `END Insufficient balance. Available: KES ${toK(
        account.balance || 0
      )}`;
    const externalReference = createPaymentReference("WDR");
    try {
      const b2cResult = await initiateB2CPayment(
        phone,
        amount,
        `Withdrawal from ${account.name}`,
        {
          externalReference,
          callbackUrl:
            process.env.PAYHERO_CALLBACK_URL ||
            "https://tiara-connect-otp.onrender.com/payhero/callback",
          channelId: Number(process.env.PAYHERO_CHANNEL_ID || 0),
          networkCode: "63902",
        }
      );
      if (b2cResult.success) {
        registerPendingPayment({
          reference: externalReference,
          type: "withdraw",
          phone,
          accountId: account.id,
          amount,
          checkoutRequestId: b2cResult.data?.checkout_request_id,
          payload: b2cResult.data,
        });
        addTxForAccount(account.id, {
          type: "PAYHERO_WITHDRAWAL_PENDING",
          amount,
          reference: externalReference,
        });
        return `CON PayHero withdrawal request queued.\nTo mobile: ${normalizeIncomingPhone(
          phone
        )}\nAmount: KES ${toK(amount)}\nReference: ${externalReference}\nTransfer in progress...`;
      }
      return `END Failed to start PayHero withdrawal. ${formatPayHeroError(
        b2cResult.error
      )}`;
    } catch (e) {
      console.error("PayHero withdrawal error:", e);
      return `END Withdrawal failed. Please try again.`;
    }
  }
  return "END Account selection error.";
}

// Check balance
function handleCheckBalance(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1)
    return showUserAccountsForOperation(
      phone,
      "Select account to view balance"
    );
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(
      phone,
      "Select account to view balance"
    );
  if (parts.length === offset) return "CON Enter your PIN";
  const pin = parts[offset];
  const user = users.get(phone);
  if (!user)
    return "END No account found for this number. Please create an account first.";
  if (user.pin !== pin) return "END Invalid PIN";
  if (account) {
    return `END Current Balance: KES ${toK(account.balance || 0)}`;
  }
  return "END Account selection error.";
}

// Track account
function handleTrackAccount(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1)
    return showUserAccountsForOperation(phone, "Select account to track");
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(phone, "Select account to track");
  if (parts.length === offset) return "CON Enter your PIN";
  const pin = parts[offset];
  const user = users.get(phone);
  if (!user)
    return "END No account found for this number. Please create an account first.";
  if (user.pin !== pin) return "END Invalid PIN";
  if (account) {
    const txs = transactions.get(account.id) || [];
    const txLines = [
      `CON Account: ${account.name}`,
      `Fund: ${account.fund}`,
      `Balance: KES ${toK(account.balance || 0)}`,
    ];
    if (txs.length) {
      txLines.push("Recent:");
      txs
        .slice(0, 3)
        .forEach((t, i) =>
          txLines.push(
            `${i + 1}. ${t.type} ${t.amount ? "KES " + toK(t.amount) : ""}`
          )
        );
    }
    return txLines.join("\n");
  }
  return "END Account selection error.";
}

// Manage accounts
function showManageAccountsMenu(phone) {
  const userAccounts = getUserAccounts(phone);
  if (!userAccounts || userAccounts.length === 0)
    return "CON You have no accounts.\n1. Create account";
  let resp = "CON Manage accounts:\n";
  userAccounts.forEach((acc, idx) => {
    resp += `${idx + 1}. ${acc.name} (${acc.id})\n`;
  });
  resp += `${userAccounts.length + 1}. Create new account`;
  return resp;
}

async function handleAccountManagement(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (parts.length === 1) return showManageAccountsMenu(phone);
  const sel = parseInt(parts[1], 10);
  if (isNaN(sel) || sel < 1) return "CON Invalid choice. Try again.";
  const createNewIdx = (userAccounts?.length || 0) + 1;

  // Continue nested create-account flow from Manage Accounts path:
  // 6*<createNewIdx>*<fund>*<pin>
  if (sel === createNewIdx) {
    const createParts = ["1", ...parts.slice(2)];
    return await handleCreateAccount(createParts, phone);
  }

  if ((!userAccounts || userAccounts.length === 0) && sel === 1)
    return await handleCreateAccount(["1"], phone);
  const idx = sel - 1;
  if (idx >= 0 && idx < userAccounts.length) {
    const acc = userAccounts[idx];
    const user = users.get(phone) || {};
    user.defaultAccountId = acc.id;
    users.set(phone, user);
    upsertUser(phone, user).catch((error) => {
      console.error("[Postgres] Failed to save user:", error.message);
    });
    return `END Switched default account to ${acc.name} (${acc.id})`;
  }
  return "END Invalid selection.";
}

// Debug: seed user (dev only)
app.post("/debug/seed-user", (req, res) => {
  try {
    const { phone, name, pin, fundKey } = req.body;
    if (!phone)
      return res
        .status(400)
        .json({ success: false, message: "phone required" });
    let p = String(phone).trim();
    if (/^0\d+/.test(p)) p = "+254" + p.slice(1);
    if (!p.startsWith("+")) p = p;
    if (users.has(p))
      return res.json({ success: false, message: "user exists", phone: p });
    const fk = fundKey || "1";
    const acc = createAccount(p, fk, `${name || "Test"}'s ${FUNDS[fk]}`);
    users.set(p, {
      name: name || "Test",
      idNumber: "00000000",
      pin: pin || "1234",
      defaultAccountId: acc.id,
      accounts: { [acc.id]: { fund: fk } },
    });
    upsertUser(p, users.get(p)).catch((error) => {
      console.error("[Postgres] Failed to save user:", error.message);
    });
    addTxForAccount(acc.id, { type: "SEED", amount: 0 });
    return res.json({ success: true, phone: p, account: acc });
  } catch (e) {
    console.error("seed error", e);
    return res.status(500).json({ success: false });
  }
});

// ===========================
// Standalone OTP API Endpoints
// ===========================

// POST /api/otp/send - Generate and send OTP
app.post("/api/otp/send", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    // Normalize phone number
    let normalizedPhone = String(phone).trim();
    if (normalizedPhone.startsWith("+")) {
      normalizedPhone = normalizedPhone.slice(1);
    }
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "254" + normalizedPhone.slice(1);
    }
    if (!normalizedPhone.startsWith("254")) {
      normalizedPhone = "254" + normalizedPhone;
    }

    // Validate phone format
    const phoneRegex = /^254[17]\d{8}$/;
    if (!phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number format. Must be a valid Kenyan number (07xx or 01xx)",
      });
    }

    // Generate and send OTP via SMS
    const smsResult = await sendOTP(normalizedPhone, name);

    if (smsResult && smsResult.success && smsResult.otp) {
      const otp = smsResult.otp;
      const expiresAt = Date.now() + 60000; // 60 seconds

      // Store OTP session
      pendingOTPs.set(normalizedPhone, {
        otp,
        expiresAt,
        name,
        attempts: 0,
      });

      return res.json({
        success: true,
        message: "OTP sent successfully",
        phone: normalizedPhone,
        expiresIn: 60,
      });
    } else {
      // Clean up failed OTP
      pendingOTPs.delete(normalizedPhone);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("[OTP API] Send error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// POST /api/otp/verify - Verify OTP code
app.post("/api/otp/verify", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Phone number is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "OTP code is required",
      });
    }

    // Normalize phone number
    let normalizedPhone = String(phone).trim();
    if (normalizedPhone.startsWith("+")) {
      normalizedPhone = normalizedPhone.slice(1);
    }
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "254" + normalizedPhone.slice(1);
    }
    if (!normalizedPhone.startsWith("254")) {
      normalizedPhone = "254" + normalizedPhone;
    }

    // Get OTP session
    const otpSession = pendingOTPs.get(normalizedPhone);

    if (!otpSession) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "No OTP session found. Please request a new OTP.",
      });
    }

    // Check expiration
    if (Date.now() > otpSession.expiresAt) {
      pendingOTPs.delete(normalizedPhone);
      return res.status(400).json({
        success: false,
        valid: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Check attempts (max 3)
    if (otpSession.attempts >= 3) {
      pendingOTPs.delete(normalizedPhone);
      return res.status(400).json({
        success: false,
        valid: false,
        message:
          "Maximum verification attempts exceeded. Please request a new OTP.",
      });
    }

    // Increment attempts
    otpSession.attempts += 1;

    // Verify OTP
    if (String(otp).trim() === String(otpSession.otp)) {
      // OTP is valid - clean up session
      pendingOTPs.delete(normalizedPhone);
      return res.json({
        success: true,
        valid: true,
        message: "OTP verified successfully",
        phone: normalizedPhone,
      });
    } else {
      // Invalid OTP
      return res.status(400).json({
        success: false,
        valid: false,
        message: `Invalid OTP. ${3 - otpSession.attempts} attempts remaining.`,
        attemptsRemaining: 3 - otpSession.attempts,
      });
    }
  } catch (error) {
    console.error("[OTP API] Verify error:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      message: "Internal server error",
    });
  }
});

// Store recent USSD requests for debugging
const recentRequests = [];
const MAX_REQUESTS = 20;

// Debug endpoint to view recent USSD requests
app.get("/debug/recent-requests", (req, res) => {
  res.json({
    count: recentRequests.length,
    requests: recentRequests,
  });
});

// USSD endpoint
app.post("/ussd", async (req, res) => {
  try {
    // Store request for debugging
    recentRequests.unshift({
      timestamp: new Date().toISOString(),
      headers: req.headers,
      body: req.body,
      query: req.query,
    });
    if (recentRequests.length > MAX_REQUESTS) {
      recentRequests.pop();
    }

    // Enhanced logging for debugging real phone issues
    console.log("=== USSD Request Received ===");
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("Query:", JSON.stringify(req.query, null, 2));
    console.log("Raw Body:", req.rawBody);
    console.log("============================");

    res.set("Content-Type", "text/plain");

    // Tiara Connect sends: msisdn, input, serviceCode, sessionId
    // Also support: phone/phoneNumber, text (for testing/other gateways)
    const { phoneNumber, phone, msisdn, text, input } = req.body;

    let normalizedPhone = String(msisdn || phoneNumber || phone || "")
      .trim()
      .replace(/\s+/g, "");
    if (/^0\d+/.test(normalizedPhone))
      normalizedPhone = "+254" + normalizedPhone.slice(1);
    else if (/^254\d+/.test(normalizedPhone))
      normalizedPhone = "+" + normalizedPhone;

    // Use input (Tiara) or text (testing) for user selections
    const userInput = input !== undefined ? input : text;

    if (!userInput || String(userInput).trim() === "")
      return res.send(welcomeMenu());
    let cleaned = String(userInput).trim();
    let parts = cleaned.split("*");
    if (parts.length >= 2 && parts[0] === "710" && parts[1] === "56789")
      parts = parts.slice(2);
    if (parts.length === 0 || (parts.length === 1 && parts[0] === ""))
      parts = [];
    if (parts.length === 0) return res.send(welcomeMenu());

    const choice = parts[0];
    let response = "END Invalid choice. Please try again.";
    switch (choice) {
      case "1":
        response = await handleCreateAccount(parts, normalizedPhone);
        break;
      case "2":
        response = await handleInvest(parts, normalizedPhone);
        break;
      case "3":
        response = await handleWithdraw(parts, normalizedPhone);
        break;
      case "4":
        response = handleCheckBalance(parts, normalizedPhone);
        break;
      case "5":
        response = handleTrackAccount(parts, normalizedPhone);
        break;
      case "6":
        response = await handleAccountManagement(parts, normalizedPhone);
        break;
    }

    return res.send(response);
  } catch (err) {
    console.error("USSD error", err);
    return res.send("END An error occurred. Please try again later.");
  }
});

app.get("/", (_req, res) =>
  res
    .type("text")
    .send("Gkash USSD service is running. POST /ussd with USSD payload.")
);

// Health check endpoint for Render
app.get("/health", (_req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "gkash-ussd"
  });
});

// PayHero STK Push endpoint - trigger payment prompt on phone
app.post(["/api/payhero/stkpush", "/api/mpesa/stkpush"], async (req, res) => {
  try {
    const { phone, amount, accountId, accountReference } = req.body;

    if (!phone || !amount || !accountId) {
      return res.status(400).json({
        success: false,
        message: "phone, amount, and accountId are required",
      });
    }

    const result = await initiateSTKPush(
      phone,
      amount,
      accountReference || accountId,
      `Deposit to ${accountId}`,
      {
        externalReference:
          accountReference || createPaymentReference("INV-API"),
        customerName: req.body.customerName || req.body.customer_name,
        callbackUrl:
          process.env.PAYHERO_CALLBACK_URL ||
          "https://tiara-connect-otp.onrender.com/payhero/callback",
        channelId: Number(process.env.PAYHERO_CHANNEL_ID || 0),
      }
    );

    if (result.success) {
      return res.json({
        success: true,
        message:
          "PayHero STK Push initiated. Check your phone for payment prompt.",
        data: result.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to initiate PayHero STK Push",
        error: result.error,
      });
    }
  } catch (err) {
    console.error("PayHero STK Push API error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/api/payhero/withdraw", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "phone and amount are required",
      });
    }

    const externalReference = createPaymentReference("WDR-API");
    const result = await initiateB2CPayment(
      phone,
      amount,
      "PayHero withdrawal",
      {
        externalReference,
        callbackUrl:
          process.env.PAYHERO_CALLBACK_URL ||
          "https://tiara-connect-otp.onrender.com/payhero/callback",
        channelId: Number(process.env.PAYHERO_CHANNEL_ID || 0),
        networkCode: "63902",
      }
    );

    if (result.success) {
      return res.json({
        success: true,
        message: "PayHero withdrawal queued successfully.",
        data: result.data,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Failed to initiate PayHero withdrawal",
      error: result.error,
    });
  } catch (err) {
    console.error("PayHero withdrawal API error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// PayHero callback endpoint - receive payment confirmation
app.post(["/payhero/callback", "/mpesa/callback"], async (req, res) => {
  try {
    const body = req.body;
    console.log("PayHero Callback received:", body);

    const result = applyPayHeroCallback(body);

    if (result.matched && result.account && result.pending) {
      const amount = Number(result.pending.amount || 0);
      const phone = result.pending.phone;
      const account = result.account;

      if (result.pending.type === "invest" && result.success) {
        try {
          await sendSMS(
            phone,
            `Investment of KES ${toK(amount)} successful. New balance: KES ${toK(
              account.balance || 0
            )}`
          );
        } catch (e) {
          console.error("PayHero callback SMS error:", e);
        }
      }

      if (result.pending.type === "withdraw" && result.success) {
        try {
          await sendSMS(
            phone,
            `Withdrawal of KES ${toK(amount)} successful. New balance: KES ${toK(
              account.balance || 0
            )}`
          );
        } catch (e) {
          console.error("PayHero callback SMS error:", e);
        }
      }

      if (!result.success) {
        try {
          await sendSMS(
            phone,
            `PayHero transaction for KES ${toK(amount)} failed. Reference: ${
              result.pending.reference || result.reference
            }`
          );
        } catch (e) {
          console.error("PayHero callback failure SMS error:", e);
        }
      }
    }

    return res.json({
      success: true,
      status: "accepted",
    });
  } catch (err) {
    console.error("PayHero callback error", err);
    return res.status(500).json({
      success: false,
      message: "Error processing callback",
    });
  }
});

syncAccountsFromPostgres().finally(() => {
  app.listen(PORT, () => console.log(`USSD server listening on port ${PORT}`));
});
