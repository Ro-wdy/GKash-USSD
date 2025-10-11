/*
  Gkash USSD Server (Express)
  Menu flow:
  - *384*83656#
  - Welcome to Gkash, Learn.Invest.Grow
    1. Create account
    2. Invest
    3. Withdraw
    4. Check balance
    5. Track account
*/

require("dotenv").config();
const express = require("express");
const AfricasTalking = require("africastalking")({
  apiKey:
    "atsk_ee7869b8feba48dca696dcd830031ed2118ab4c164ff91a115c868782c68e44c42652954",
  username: "sandbox",
});
const { sendOTP } = require("./tiaraService");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Store OTP data (use a database in production)
const otpStore = new Map();

// Helper to store OTP
function storeOTP(phone, otp) {
  otpStore.set(phone, {
    otp,
    createdAt: Date.now(),
    attempts: 0,
  });
}

// Helper to verify OTP
function verifyOTP(phone, inputOTP) {
  const otpData = otpStore.get(phone);

  if (!otpData) {
    return {
      success: false,
      message: "No OTP found. Please request a new one.",
    };
  }

  // Check expiration (45 seconds)
  if (Date.now() - otpData.createdAt > 45 * 1000) {
    otpStore.delete(phone);
    return {
      success: false,
      message: "OTP expired. Please request a new one.",
    };
  }

  // Check attempts
  if (otpData.attempts >= 3) {
    otpStore.delete(phone);
    return {
      success: false,
      message: "Too many attempts. Please request a new OTP.",
    };
  }

  // Increment attempts
  otpData.attempts++;
  otpStore.set(phone, otpData);

  // Verify OTP
  if (otpData.otp === inputOTP) {
    otpStore.delete(phone); // Clear after successful verification
    return { success: true, message: "OTP verified successfully." };
  }

  return { success: false, message: "Invalid OTP. Please try again." };
}

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// In-memory data stores (replace with a database in production)
const FUNDS = {
  1: "Money Market Fund",
  2: "Fixed Income Fund",
  3: "Balanced Fund",
  4: "Stock Market",
};

const users = new Map(); // phone -> { name, idNumber, pin, fund }
const balances = new Map(); // phone -> number
const transactions = new Map(); // phone -> [{ type: 'INVEST'|'WITHDRAW', amount, at }]

function getBalance(phone) {
  return balances.get(phone) || 0;
}

function setBalance(phone, value) {
  balances.set(phone, value);
}

function addTx(phone, tx) {
  const list = transactions.get(phone) || [];
  list.unshift({ ...tx, at: new Date().toISOString() });
  // keep last 20
  transactions.set(phone, list.slice(0, 20));
}

function toK(shillings) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(
    shillings
  );
}

function welcomeMenu() {
  return [
    "CON Welcome to Gkash, Learn.Invest.Grow",
    "1. Create account",
    "2. Invest",
    "3. Withdraw",
    "4. Check balance",
    "5. Track account",
  ].join("\n");
}

function fundMenu(prefix) {
  console.log(">>> fundMenu called with prefix:", prefix);

  let menu = "CON ";
  if (prefix && prefix.trim()) {
    menu += prefix.trim() + "\n";
  }
  menu += "Select fund type:\n";
  menu += "1. Money Market Fund\n";
  menu += "2. Fixed Income Fund\n";
  menu += "3. Balanced Fund\n";
  menu += "4. Stock Market";

  console.log(">>> Generated fund menu:", menu);
  return menu;
}

async function handleCreateAccount(parts, phoneNumber) {
  console.log("\n--- handleCreateAccount START ---");
  console.log("Parts:", JSON.stringify(parts));
  console.log("Parts length:", parts.length);
  console.log("Phone:", phoneNumber);

  try {
    // Step 1: Show fund menu
    if (parts.length === 1) {
      console.log("STEP 1: Showing fund selection");
      const menu = fundMenu("");
      console.log("Returning menu:", menu);
      return menu;
    }

    // Step 2: Get fund selection, ask for name
    if (parts.length === 2) {
      const fund = parts[1];
      console.log("STEP 2: Fund selection =", fund);
      console.log("FUNDS object:", FUNDS);
      console.log("Is valid fund?", !!FUNDS[fund]);

      if (!FUNDS[fund]) {
        console.log("Invalid fund, showing menu again");
        return fundMenu("Invalid choice. Try again.");
      }

      console.log("Valid fund:", FUNDS[fund]);
      return "CON Enter your full name";
    }

    // Step 3: Get name, ask for ID
    if (parts.length === 3) {
      const fund = parts[1];
      const name = parts[2];
      console.log("STEP 3: Name =", name);

      if (!FUNDS[fund]) {
        return "END Session error. Please start over.";
      }

      if (!name || name.trim().length < 2) {
        console.log("Name too short");
        return "CON Name too short. Enter full name:";
      }

      return "CON Enter your ID number (digits only)";
    }

    // Step 4: Get ID, ask for PIN
    if (parts.length === 4) {
      const fund = parts[1];
      const name = parts[2];
      const idNumber = parts[3];
      console.log("STEP 4: ID =", idNumber);

      if (!FUNDS[fund]) {
        return "END Session error. Please start over.";
      }

      if (!/^\d{6,}$/.test(idNumber)) {
        console.log("Invalid ID format");
        return "CON Invalid ID. Enter at least 6 digits:";
      }

      return "CON Create a 4-digit PIN";
    }

    // Step 5: Get PIN, send OTP
    if (parts.length === 5) {
      const fund = parts[1];
      const name = parts[2];
      const idNumber = parts[3];
      const pin = parts[4];
      console.log("STEP 5: PIN =", pin);

      if (!FUNDS[fund]) {
        return "END Session error. Please start over.";
      }

      if (!/^\d{4}$/.test(pin)) {
        console.log("Invalid PIN format");
        return "CON Invalid PIN. Enter 4 digits:";
      }

      // Check if account exists
      if (users.has(phoneNumber)) {
        console.log("Account already exists");
        return "END Account already exists for this number.";
      }

      console.log("Attempting to send OTP...");
      try {
        const otpResult = await sendOTP(phoneNumber, name);
        console.log("OTP Result:", otpResult);

        if (otpResult.success) {
          storeOTP(phoneNumber, otpResult.otp);
          console.log("OTP stored successfully");
          return "CON OTP sent to your phone.\nEnter 6-digit code:";
        } else {
          console.error("OTP send failed:", otpResult);
          return `END Failed to send OTP: ${
            otpResult.message || "Unknown error"
          }`;
        }
      } catch (error) {
        console.error("OTP send exception:", error);
        return "END Error sending OTP. Try again later.";
      }
    }

    // Step 6: Verify OTP and create account
    if (parts.length === 6) {
      const fund = parts[1];
      const name = parts[2];
      const idNumber = parts[3];
      const pin = parts[4];
      const inputOTP = parts[5];
      console.log("STEP 6: Verifying OTP =", inputOTP);

      if (!FUNDS[fund]) {
        return "END Session error. Please start over.";
      }

      if (!/^\d{6}$/.test(inputOTP)) {
        return "CON Invalid OTP format. Enter 6 digits:";
      }

      const verification = verifyOTP(phoneNumber, inputOTP);
      console.log("Verification result:", verification);

      if (!verification.success) {
        return `CON ${verification.message}\nTry again:`;
      }

      // Create account
      console.log("Creating account...");
      users.set(phoneNumber, {
        name: name.trim(),
        idNumber,
        pin,
        fund: FUNDS[fund],
      });

      if (!balances.has(phoneNumber)) {
        setBalance(phoneNumber, 0);
      }

      addTx(phoneNumber, { type: "ACCOUNT_CREATED", amount: 0 });
      console.log("Account created successfully");

      // Send SMS
      try {
        await AfricasTalking.SMS.send({
          to: phoneNumber,
          message: `Welcome to Gkash ${name}! Your ${FUNDS[fund]} account is ready.`,
          from: "GKASH",
        });
        console.log("Welcome SMS sent");
      } catch (error) {
        console.error("SMS error:", error);
      }

      return `END Success! Account created.\nName: ${name}\nFund: ${FUNDS[fund]}\nSMS sent.`;
    }

    console.log("Unexpected parts length:", parts.length);
    return "END Invalid request. Please start over.";
  } catch (error) {
    console.error("!!! handleCreateAccount ERROR !!!", error);
    console.error("Error stack:", error.stack);
    return "END Error creating account. Try again.";
  } finally {
    console.log("--- handleCreateAccount END ---\n");
  }
}

function requireExistingUser(phoneNumber) {
  const user = users.get(phoneNumber);
  if (!user) {
    return {
      error:
        "END No account found for this number. Please create an account first.",
    };
  }
  return { user };
}

async function handleInvest(parts, phoneNumber) {
  console.log("\n--- handleInvest START ---");
  console.log("Parts:", JSON.stringify(parts));
  console.log("Phone:", phoneNumber);

  try {
    // parts: ['2', amount?, pin?]
    if (parts.length === 1) {
      return "CON Enter amount to invest (KES)";
    }

    const amount = Number(parts[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "CON Invalid amount. Enter a positive number (KES)";
    }

    if (parts.length === 2) {
      return "CON Enter your PIN";
    }

    const pin = parts[2];
    const { user, error } = requireExistingUser(phoneNumber);
    if (error) return error;
    if (user.pin !== pin) return "END Invalid PIN";

    const newBal = getBalance(phoneNumber) + amount;
    setBalance(phoneNumber, newBal);
    addTx(phoneNumber, { type: "INVEST", amount });

    // Send investment notification using Africa's Talking
    try {
      await AfricasTalking.SMS.send({
        to: phoneNumber,
        message: `Investment of KES ${toK(
          amount
        )} successful. New balance: KES ${toK(newBal)}`,
        from: "GKASH",
      });
      console.log(`Investment SMS sent to ${phoneNumber}`);
    } catch (error) {
      console.error("Error sending investment SMS:", error);
    }

    return `END Invested KES ${toK(amount)} into ${
      user.fund
    }.\nNew balance: KES ${toK(newBal)}\nSMS confirmation sent.`;
  } catch (error) {
    console.error("!!! handleInvest ERROR !!!", error);
    return "END Error processing investment. Try again.";
  } finally {
    console.log("--- handleInvest END ---\n");
  }
}

async function handleWithdraw(parts, phoneNumber) {
  console.log("\n--- handleWithdraw START ---");
  console.log("Parts:", JSON.stringify(parts));
  console.log("Phone:", phoneNumber);

  try {
    // parts: ['3', amount?, pin?]
    if (parts.length === 1) {
      return "CON Enter amount to withdraw (KES)";
    }

    const amount = Number(parts[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "CON Invalid amount. Enter a positive number (KES)";
    }

    if (parts.length === 2) {
      return "CON Enter your PIN";
    }

    const pin = parts[2];
    const { user, error } = requireExistingUser(phoneNumber);
    if (error) return error;
    if (user.pin !== pin) return "END Invalid PIN";

    const bal = getBalance(phoneNumber);
    if (amount > bal) {
      return `END Insufficient balance. Available: KES ${toK(bal)}`;
    }

    const newBal = bal - amount;
    setBalance(phoneNumber, newBal);
    addTx(phoneNumber, { type: "WITHDRAW", amount });

    // Send withdrawal notification using Africa's Talking
    try {
      await AfricasTalking.SMS.send({
        to: phoneNumber,
        message: `Withdrawal of KES ${toK(
          amount
        )} successful. New balance: KES ${toK(newBal)}`,
        from: "GKASH",
      });
      console.log(`Withdrawal SMS sent to ${phoneNumber}`);
    } catch (error) {
      console.error("Error sending withdrawal SMS:", error);
    }

    return `END Withdrawal of KES ${toK(
      amount
    )} successful.\nNew balance: KES ${toK(newBal)}\nSMS confirmation sent.`;
  } catch (error) {
    console.error("!!! handleWithdraw ERROR !!!", error);
    return "END Error processing withdrawal. Try again.";
  } finally {
    console.log("--- handleWithdraw END ---\n");
  }
}

function handleCheckBalance(parts, phoneNumber) {
  console.log("\n--- handleCheckBalance START ---");
  console.log("Parts:", JSON.stringify(parts));
  console.log("Phone:", phoneNumber);

  try {
    // parts: ['4', pin?]
    if (parts.length === 1) return "CON Enter your PIN";

    const pin = parts[1];
    const { user, error } = requireExistingUser(phoneNumber);
    if (error) return error;
    if (user.pin !== pin) return "END Invalid PIN";

    const bal = getBalance(phoneNumber);
    return `END Balance: KES ${toK(bal)}`;
  } catch (error) {
    console.error("!!! handleCheckBalance ERROR !!!", error);
    return "END Error checking balance. Try again.";
  } finally {
    console.log("--- handleCheckBalance END ---\n");
  }
}

function handleTrackAccount(parts, phoneNumber) {
  console.log("\n--- handleTrackAccount START ---");
  console.log("Parts:", JSON.stringify(parts));
  console.log("Phone:", phoneNumber);

  try {
    // parts: ['5', pin?]
    if (parts.length === 1) return "CON Enter your PIN";

    const pin = parts[1];
    const { user, error } = requireExistingUser(phoneNumber);
    if (error) return error;
    if (user.pin !== pin) return "END Invalid PIN";

    const bal = getBalance(phoneNumber);
    const txs = (transactions.get(phoneNumber) || []).slice(0, 3);
    const lines = [
      `END Account: ${user.name}`,
      `Fund: ${user.fund}`,
      `Balance: KES ${toK(bal)}`,
    ];
    if (txs.length) {
      lines.push("Recent:");
      txs.forEach((t, i) => {
        lines.push(
          `${i + 1}. ${t.type} ${t.amount ? "KES " + toK(t.amount) : ""}`.trim()
        );
      });
    }
    return lines.join("\n");
  } catch (error) {
    console.error("!!! handleTrackAccount ERROR !!!", error);
    return "END Error tracking account. Try again.";
  } finally {
    console.log("--- handleTrackAccount END ---\n");
  }
}

// USSD endpoint
app.post("/ussd", async (req, res) => {
  try {
    console.log("\n========== NEW USSD REQUEST ==========");
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    console.log("Raw request body:", JSON.stringify(req.body, null, 2));
    console.log("Session ID:", sessionId);
    console.log("Service Code:", serviceCode);
    console.log("Phone Number:", phoneNumber);
    console.log("Text:", text);
    console.log("Text type:", typeof text);
    console.log("Text length:", text ? text.length : 0);
    console.log("======================================\n");

    // Set content type
    res.set("Content-Type", "text/plain");

    // Handle initial request (empty text)
    if (!text || text === "" || text.trim() === "") {
      console.log(">>> INITIAL REQUEST - Showing welcome menu");
      const menu = welcomeMenu();
      console.log(">>> Sending:", menu);
      return res.send(menu);
    }

    // Clean and parse the text
    const cleaned = String(text).trim();
    const parts = cleaned.split("*");

    console.log(">>> Cleaned text:", cleaned);
    console.log(">>> Split parts:", JSON.stringify(parts));
    console.log(">>> Number of parts:", parts.length);
    console.log(">>> First choice:", parts[0]);

    const choice = parts[0];
    let response;

    switch (choice) {
      case "1":
        console.log(">>> OPTION 1 SELECTED - Create Account");
        response = await handleCreateAccount(parts, phoneNumber);
        break;
      case "2":
        console.log(">>> OPTION 2 SELECTED - Invest");
        response = await handleInvest(parts, phoneNumber);
        break;
      case "3":
        console.log(">>> OPTION 3 SELECTED - Withdraw");
        response = await handleWithdraw(parts, phoneNumber);
        break;
      case "4":
        console.log(">>> OPTION 4 SELECTED - Check Balance");
        response = handleCheckBalance(parts, phoneNumber);
        break;
      case "5":
        console.log(">>> OPTION 5 SELECTED - Track Account");
        response = handleTrackAccount(parts, phoneNumber);
        break;
      default:
        console.log(">>> INVALID CHOICE:", choice);
        response = "END Invalid choice. Please try again.";
    }

    console.log(">>> FINAL RESPONSE:", response);
    console.log(">>> Response length:", response.length);
    console.log("========== END REQUEST ==========\n");

    return res.send(response);
  } catch (err) {
    console.error("!!! USSD HANDLER ERROR !!!", err);
    console.error("Error stack:", err.stack);
    return res.send("END An error occurred. Please try again later.");
  }
});

// API Endpoints for Mobile App

// Send OTP
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const result = await sendOTP(phone, name || "User");

    if (result.success) {
      // Store OTP for verification
      storeOTP(phone, result.otp);

      // Don't send OTP in response for security
      return res.json({
        success: true,
        message: "OTP sent successfully",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to send OTP",
      });
    }
  } catch (error) {
    console.error("Send OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Verify OTP
app.post("/api/auth/verify-otp", (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const result = verifyOTP(phone, otp);
    return res.json(result);
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Health check endpoint
app.get("/", (_req, res) => {
  res
    .type("text")
    .send("Gkash USSD service is running. POST /ussd with USSD payload.");
});

app.listen(PORT, () => {
  console.log(`USSD server listening on port ${PORT}`);
});
