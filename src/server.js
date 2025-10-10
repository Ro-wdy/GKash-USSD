/*
  Gkash USSD Server (Express)
  Menu flow:
  - *710*56789#
  - Welcome to Gkash, Learn.Invest.Grow
    1. Create account
    2. Invest
    3. Withdraw
    4. Check balance
    5. Track account
*/

require('dotenv').config();
const express = require('express');
const { sendOTP, verifyOTP, sendAccountConfirmation, sendTransactionNotification } = require('./smsService');

const app = express();
const PORT = process.env.PORT || 3000;

// Tiara Connect typically posts application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// In-memory data stores (replace with a database in production)
const FUNDS = {
  '1': 'Money Market Fund',
  '2': 'Fixed Income Fund',
  '3': 'Balanced Fund',
  '4': 'Stock Market',
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
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(shillings);
}

function welcomeMenu() {
  return [
    'CON Welcome to Gkash, Learn.Invest.Grow',
    '1. Create account',
    '2. Invest',
    '3. Withdraw',
    '4. Check balance',
    '5. Track account',
  ].join('\n');
}

function fundMenu(prefix) {
  return [
    `CON ${prefix}`.trim(),
    'Select fund type:',
    '1. Money Market Fund',
    '2. Fixed Income Fund',
    '3. Balanced Fund',
    '4. Stock Market',
  ].join('\n');
}

async function handleCreateAccount(parts) {
  // parts: ['1', fund?, name?, phone?, id?, pin?, otp?]
  if (parts.length === 1) {
    return fundMenu('');
  }
  const fund = parts[1];
  if (!FUNDS[fund]) {
    return fundMenu('Invalid choice.');
  }
  if (parts.length === 2) {
    return 'CON Enter your full name';
  }
  const name = parts[2];
  if (!name || name.trim().length < 2) {
    return 'CON Enter your full name (at least 2 characters)';
  }
  if (parts.length === 3) {
    return 'CON Enter your phone number (e.g., 07XXXXXXXX)';
  }
  const enteredPhone = parts[3];
  if (!/^0\d{9}$/.test(enteredPhone)) {
    return 'CON Invalid phone. Enter a valid phone number starting with 0 (10 digits)';
  }
  if (parts.length === 4) {
    return 'CON Enter your ID number';
  }
  const idNumber = parts[4];
  if (!/^\d{6,}$/.test(idNumber)) {
    return 'CON Invalid ID. Enter digits only (min 6)';
  }
  if (parts.length === 5) {
    return 'CON Set a 4-digit PIN';
  }
  const pin = parts[5];
  if (!/^\d{4}$/.test(pin)) {
    return 'CON Invalid PIN. Enter a 4-digit PIN';
  }
  
  // New step: Send OTP for verification
  if (parts.length === 6) {
    // Check if user already exists
    if (users.has(enteredPhone)) {
      return 'END Account already exists for this phone number.';
    }
    
    try {
      const otpResult = await sendOTP(enteredPhone, name);
      if (otpResult.success) {
        return 'CON An OTP has been sent to your phone. Enter the 6-digit code to verify:';
      } else {
        return `END Failed to send OTP: ${otpResult.message}`;
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      return 'END Failed to send OTP. Please try again later.';
    }
  }
  
  // Verify OTP and create account
  if (parts.length === 7) {
    const inputOTP = parts[6];
    if (!/^\d{6}$/.test(inputOTP)) {
      return 'CON Invalid OTP format. Enter a 6-digit code:';
    }
    
    const verification = verifyOTP(enteredPhone, inputOTP);
    if (!verification.success) {
      return `CON ${verification.message}`;
    }
    
    // OTP verified successfully, create account
    users.set(enteredPhone, { name, idNumber, pin, fund: FUNDS[fund] });
    if (!balances.has(enteredPhone)) setBalance(enteredPhone, 0);
    addTx(enteredPhone, { type: 'ACCOUNT_CREATED', amount: 0 });
    
    // Send confirmation SMS (don't wait for it)
    sendAccountConfirmation(enteredPhone, name, FUNDS[fund], 0)
      .then(result => {
        if (result.success) {
          console.log(`Confirmation SMS sent to ${enteredPhone}`);
        } else {
          console.error(`Failed to send confirmation SMS: ${result.message}`);
        }
      })
      .catch(error => {
        console.error('Error sending confirmation SMS:', error);
      });
    
    return `END Account created successfully for ${name}.\nFund: ${FUNDS[fund]}\nA confirmation SMS has been sent.`;
  }
  
  return 'END Invalid request.';
}

function requireExistingUser(phoneNumber) {
  const user = users.get(phoneNumber);
  if (!user) {
    return { error: 'END No account found for this number. Please create an account first.' };
  }
  return { user };
}

async function handleInvest(parts, phoneNumber) {
  // parts: ['2', amount?, pin?]
  if (parts.length === 1) {
    return 'CON Enter amount to invest (KES)';
  }
  const amount = Number(parts[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'CON Invalid amount. Enter a positive number (KES)';
  }
  if (parts.length === 2) {
    return 'CON Enter your PIN';
  }
  const pin = parts[2];
  const { user, error } = requireExistingUser(phoneNumber);
  if (error) return error;
  if (user.pin !== pin) return 'END Invalid PIN';

  const newBal = getBalance(phoneNumber) + amount;
  setBalance(phoneNumber, newBal);
  addTx(phoneNumber, { type: 'INVEST', amount });
  
  // Send SMS notification (don't wait for it)
  sendTransactionNotification(phoneNumber, 'INVEST', amount, newBal, user.name)
    .then(result => {
      if (result.success) {
        console.log(`Investment SMS sent to ${phoneNumber}`);
      } else {
        console.error(`Failed to send investment SMS: ${result.message}`);
      }
    })
    .catch(error => {
      console.error('Error sending investment SMS:', error);
    });

  return `END Invested KES ${toK(amount)} into ${user.fund}.\nNew balance: KES ${toK(newBal)}\nSMS confirmation sent.`;
}

async function handleWithdraw(parts, phoneNumber) {
  // parts: ['3', amount?, pin?]
  if (parts.length === 1) {
    return 'CON Enter amount to withdraw (KES)';
  }
  const amount = Number(parts[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'CON Invalid amount. Enter a positive number (KES)';
  }
  if (parts.length === 2) {
    return 'CON Enter your PIN';
  }
  const pin = parts[2];
  const { user, error } = requireExistingUser(phoneNumber);
  if (error) return error;
  if (user.pin !== pin) return 'END Invalid PIN';

  const bal = getBalance(phoneNumber);
  if (amount > bal) {
    return `END Insufficient balance. Available: KES ${toK(bal)}`;
  }
  const newBal = bal - amount;
  setBalance(phoneNumber, newBal);
  addTx(phoneNumber, { type: 'WITHDRAW', amount });
  
  // Send SMS notification (don't wait for it)
  sendTransactionNotification(phoneNumber, 'WITHDRAW', amount, newBal, user.name)
    .then(result => {
      if (result.success) {
        console.log(`Withdrawal SMS sent to ${phoneNumber}`);
      } else {
        console.error(`Failed to send withdrawal SMS: ${result.message}`);
      }
    })
    .catch(error => {
      console.error('Error sending withdrawal SMS:', error);
    });

  return `END Withdrawal of KES ${toK(amount)} successful.\nNew balance: KES ${toK(newBal)}\nSMS confirmation sent.`;
}

function handleCheckBalance(parts, phoneNumber) {
  // parts: ['4', pin?]
  if (parts.length === 1) return 'CON Enter your PIN';
  const pin = parts[1];
  const { user, error } = requireExistingUser(phoneNumber);
  if (error) return error;
  if (user.pin !== pin) return 'END Invalid PIN';
  const bal = getBalance(phoneNumber);
  return `END Balance: KES ${toK(bal)}`;
}

function handleTrackAccount(parts, phoneNumber) {
  // parts: ['5', pin?]
  if (parts.length === 1) return 'CON Enter your PIN';
  const pin = parts[1];
  const { user, error } = requireExistingUser(phoneNumber);
  if (error) return error;
  if (user.pin !== pin) return 'END Invalid PIN';

  const bal = getBalance(phoneNumber);
  const txs = (transactions.get(phoneNumber) || []).slice(0, 3);
  const lines = [
    `END Account: ${user.name}`,
    `Fund: ${user.fund}`,
    `Balance: KES ${toK(bal)}`,
  ];
  if (txs.length) {
    lines.push('Recent:');
    txs.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.type} ${t.amount ? 'KES ' + toK(t.amount) : ''}`.trim());
    });
  }
  return lines.join('\n');
}

app.post('/ussd', async (req, res) => {
  // Typical payload fields for USSD gateways
  const { sessionId, serviceCode, phoneNumber, text = '' } = req.body || {};

  // Ensure plain text response
  res.set('Content-Type', 'text/plain');

  const cleaned = String(text).trim();
  if (cleaned === '') {
    return res.send(welcomeMenu());
  }
  const parts = cleaned.split('*');
  const choice = parts[0];

  try {
    let response;
    switch (choice) {
      case '1':
        response = await handleCreateAccount(parts);
        break;
      case '2':
        response = await handleInvest(parts, phoneNumber);
        break;
      case '3':
        response = await handleWithdraw(parts, phoneNumber);
        break;
      case '4':
        response = handleCheckBalance(parts, phoneNumber);
        break;
      case '5':
        response = handleTrackAccount(parts, phoneNumber);
        break;
      default:
        response = 'END Invalid choice';
    }
    return res.send(response);
  } catch (err) {
    console.error('USSD handler error:', err);
    return res.send('END An error occurred. Please try again later.');
  }
});

app.get('/', (_req, res) => {
  res.type('text').send('Gkash USSD service is running. POST /ussd with USSD payload.');
});

app.listen(PORT, () => {
  console.log(`USSD server listening on port ${PORT}`);
});