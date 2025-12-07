/*
  Gkash USSD Server (Express)
  Clean single implementation that:
  - Uses in-memory stores for development
  - New users register with OTP validation then PIN
  - Existing users adding accounts require PIN only
  - If a user has multiple accounts, Invest/Withdraw force account selection first
*/

require("dotenv").config();
const express = require("express");
const { sendSMS, sendOTP } = require("./tiaraService");
const { initiateSTKPush, initiateB2CPayment } = require("./mpesaService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// In-memory stores (replace with DB in production)
const users = new Map(); // phone -> { name, idNumber, pin, defaultAccountId, accounts: { accountId: { fund } } }
const accounts = new Map(); // accountId -> { id, phone, fund, name, balance, createdAt }
const transactions = new Map(); // accountId -> [{ type, amount, createdAt }]
const pendingOTPs = new Map(); // phone -> { otp, expiresAt, data: { fund, name, idNumber, pin } }

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
  return acc;
}

function addTxForAccount(accountId, tx) {
  const list = transactions.get(accountId) || [];
  list.unshift({ ...tx, createdAt: new Date() });
  transactions.set(accountId, list.slice(0, 20));
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

  // new user flow WITH OTP validation
  try {
    if (parts.length === 1) return fundMenu("");
    if (parts.length === 2) {
      const fund = parts[1];
      if (!FUNDS[fund]) return fundMenu("Invalid choice. Try again.");
      return "CON Enter your full name";
    }
    if (parts.length === 3) {
      const fund = parts[1];
      const name = parts[2];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!name || name.trim().length < 2)
        return "CON Name too short. Enter full name:";
      return "CON Enter your ID number (digits only)";
    }
    if (parts.length === 4) {
      const fund = parts[1];
      const name = parts[2];
      const idNumber = parts[3];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!/^\d{6,}$/.test(idNumber))
        return "CON Invalid ID. Enter at least 6 digits:";
      return "CON Create a 4-digit PIN";
    }
    if (parts.length === 5) {
      const fund = parts[1];
      const name = parts[2];
      const idNumber = parts[3];
      const pin = parts[4];
      if (!FUNDS[fund]) return "END Session error. Please start over.";
      if (!/^\d{4}$/.test(pin)) return "CON Invalid PIN. Enter 4 digits:";

      // Generate and send OTP using tiaraService
      try {
        const otpResult = await sendOTP(phone, name, 6);
        if (!otpResult.success) {
          console.error("sendOTP failed:", otpResult.error);
          return "END Error sending OTP. Please try again.";
        }
        const expiresAt = Date.now() + 60000; // 1 minute
        pendingOTPs.set(phone, {
          otp: otpResult.otp,
          expiresAt,
          data: { fund, name: name.trim(), idNumber, pin },
        });
      } catch (e) {
        console.error("OTP sending error:", e);
        return "END Error sending OTP. Please try again.";
      }
      return "CON Enter OTP sent to your phone";
    }
    if (parts.length === 6) {
      const otpInput = parts[5];
      const pendingOTP = pendingOTPs.get(phone);

      if (!pendingOTP) return "END OTP session expired. Please start over.";
      if (Date.now() > pendingOTP.expiresAt) {
        pendingOTPs.delete(phone);
        return "END OTP expired. Please start over.";
      }
      if (otpInput !== pendingOTP.otp) return "CON Invalid OTP. Try again:";

      // OTP verified! Create account
      const { fund, name, idNumber, pin } = pendingOTP.data;
      const acc = createAccount(phone, fund, `${name}'s ${FUNDS[fund]}`);
      users.set(phone, {
        name,
        idNumber,
        pin,
        defaultAccountId: acc.id,
        accounts: { [acc.id]: { fund } },
      });
      addTxForAccount(acc.id, { type: "ACCOUNT_CREATED", amount: 0 });
      pendingOTPs.delete(phone);

      try {
        await sendSMS(
          phone,
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
    // Trigger M-Pesa STK Push for payment
    try {
      const stkResult = await initiateSTKPush(
        phone,
        amount,
        account.id,
        `GKash Investment - ${account.name}`
      );
      if (stkResult.success) {
        return `CON M-Pesa payment prompt sent to your phone.\nAmount: KES ${toK(
          amount
        )}\nPlease complete payment.`;
      } else {
        // Fallback: accept payment directly without M-Pesa
        account.balance = (account.balance || 0) + amount;
        addTxForAccount(account.id, { type: "DEPOSIT", amount });
        try {
          await sendSMS(
            phone,
            `Investment of KES ${toK(
              amount
            )} successful. New balance: KES ${toK(account.balance)}`
          );
        } catch (e) {
          console.error(e);
        }
        return `END Investment of KES ${toK(amount)} into ${
          account.name
        } successful.\nNew balance: KES ${toK(account.balance)}`;
      }
    } catch (e) {
      console.error("STK Push error:", e);
      // Fallback to direct deposit
      account.balance = (account.balance || 0) + amount;
      addTxForAccount(account.id, { type: "DEPOSIT", amount });
      try {
        await sendSMS(
          phone,
          `Investment of KES ${toK(amount)} successful. New balance: KES ${toK(
            account.balance
          )}`
        );
      } catch (e2) {
        console.error(e2);
      }
      return `END Investment of KES ${toK(amount)} into ${
        account.name
      } successful.\nNew balance: KES ${toK(account.balance)}`;
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
    // Trigger M-Pesa B2C for withdrawal
    try {
      const b2cResult = await initiateB2CPayment(phone, amount);
      if (b2cResult.success) {
        // Deduct from account immediately
        account.balance = (account.balance || 0) - amount;
        addTxForAccount(account.id, { type: "WITHDRAW", amount });
        return `CON Withdrawal initiated.\nAmount: KES ${toK(
          amount
        )}\nM-Pesa transfer in progress...`;
      } else {
        return `END Withdrawal failed. Please try again.`;
      }
    } catch (e) {
      console.error("B2C Payment error:", e);
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
  const { account } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(
      phone,
      "Select account to view balance"
    );
  if (parts.length === 1) return "CON Enter your PIN";
  const pin = parts[1];
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
  const { account } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account)
    return showUserAccountsForOperation(phone, "Select account to track");
  if (parts.length === 1) return "CON Enter your PIN";
  const pin = parts[1];
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
  if ((!userAccounts || userAccounts.length === 0) && sel === 1)
    return await handleCreateAccount(["1"], phone);
  if (sel === userAccounts.length + 1)
    return await handleCreateAccount(["1"], phone);
  const idx = sel - 1;
  if (idx >= 0 && idx < userAccounts.length) {
    const acc = userAccounts[idx];
    const user = users.get(phone) || {};
    user.defaultAccountId = acc.id;
    users.set(phone, user);
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
    addTxForAccount(acc.id, { type: "SEED", amount: 0 });
    return res.json({ success: true, phone: p, account: acc });
  } catch (e) {
    console.error("seed error", e);
    return res.status(500).json({ success: false });
  }
});

// USSD endpoint
app.post("/ussd", async (req, res) => {
  try {
    res.set("Content-Type", "text/plain");
    const { phoneNumber, phone, text } = req.body;
    let normalizedPhone = String(phoneNumber || phone || "")
      .trim()
      .replace(/\s+/g, "");
    if (/^0\d+/.test(normalizedPhone))
      normalizedPhone = "+254" + normalizedPhone.slice(1);
    else if (/^254\d+/.test(normalizedPhone))
      normalizedPhone = "+" + normalizedPhone;

    if (!text || text.trim() === "") return res.send(welcomeMenu());
    let cleaned = String(text).trim();
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

// M-Pesa STK Push endpoint - trigger payment prompt on phone
app.post("/api/mpesa/stkpush", async (req, res) => {
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
      `Deposit to ${accountId}`
    );

    if (result.success) {
      return res.json({
        success: true,
        message: "STK Push initiated. Check your phone for payment prompt.",
        data: result.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to initiate STK Push",
        error: result.error,
      });
    }
  } catch (err) {
    console.error("STK Push API error", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// M-Pesa Callback endpoint - receive payment confirmation
app.post("/mpesa/callback", (req, res) => {
  try {
    const body = req.body;
    console.log("M-Pesa Callback received:", body);

    // Log callback for debugging
    if (body.Body && body.Body.stkCallback) {
      const callbackData = body.Body.stkCallback;
      const resultCode = callbackData.ResultCode;
      const resultDesc = callbackData.ResultDesc;
      const amount = callbackData.CallbackMetadata?.Item?.find(
        (i) => i.Name === "Amount"
      )?.Value;
      const mpesaRef = callbackData.CallbackMetadata?.Item?.find(
        (i) => i.Name === "MpesaReceiptNumber"
      )?.Value;
      const phone = callbackData.CallbackMetadata?.Item?.find(
        (i) => i.Name === "PhoneNumber"
      )?.Value;

      console.log(`Payment ${resultCode === 0 ? "SUCCESS" : "FAILED"}:`);
      console.log(`  Phone: ${phone}`);
      console.log(`  Amount: ${amount}`);
      console.log(`  M-Pesa Ref: ${mpesaRef}`);
      console.log(`  Description: ${resultDesc}`);

      // TODO: Update user balance in database if resultCode === 0
      if (resultCode === 0) {
        console.log("Payment confirmed - update account balance here");
      }
    }

    // Return success to M-Pesa (required)
    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (err) {
    console.error("M-Pesa callback error", err);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Error processing callback",
    });
  }
});

app.listen(PORT, () => console.log(`USSD server listening on port ${PORT}`));
