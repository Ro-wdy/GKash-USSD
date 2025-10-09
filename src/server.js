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

const express = require('express');

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

function handleCreateAccount(parts) {
  // parts: ['1', fund?, name?, phone?, id?, pin?]
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

  // Save account bound to the entered phone number
  users.set(enteredPhone, { name, idNumber, pin, fund: FUNDS[fund] });
  if (!balances.has(enteredPhone)) setBalance(enteredPhone, 0);
  addTx(enteredPhone, { type: 'ACCOUNT_CREATED', amount: 0 });

  return `END Account created successfully for ${name}.\nFund: ${FUNDS[fund]}`;
}

function requireExistingUser(phoneNumber) {
  const user = users.get(phoneNumber);
  if (!user) {
    return { error: 'END No account found for this number. Please create an account first.' };
  }
  return { user };
}

function handleInvest(parts, phoneNumber) {
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

  return `END Invested KES ${toK(amount)} into ${user.fund}.\nNew balance: KES ${toK(newBal)}`;
}

function handleWithdraw(parts, phoneNumber) {
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

  return `END Withdrawal of KES ${toK(amount)} successful.\nNew balance: KES ${toK(newBal)}`;
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

app.post('/ussd', (req, res) => {
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
    switch (choice) {
      case '1':
        return res.send(handleCreateAccount(parts));
      case '2':
        return res.send(handleInvest(parts, phoneNumber));
      case '3':
        return res.send(handleWithdraw(parts, phoneNumber));
      case '4':
        return res.send(handleCheckBalance(parts, phoneNumber));
      case '5':
        return res.send(handleTrackAccount(parts, phoneNumber));
      default:
        return res.send('END Invalid choice');
    }
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