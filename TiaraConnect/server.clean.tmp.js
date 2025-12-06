/*
  Gkash USSD Server (Express)
  Clean single implementation (PIN-only registration, multi-account selection enforced for invest/withdraw).
*/

require('dotenv').config();
const express = require('express');
const { sendSMS } = require('./tiaraService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// In-memory stores (replace with DB in production)
const users = new Map(); // phone -> { name, idNumber, pin, defaultAccountId, accounts: { accountId: { fund } } }
const accounts = new Map(); // accountId -> { id, phone, fund, name, balance, createdAt }
const transactions = new Map(); // accountId -> [{ type, amount, createdAt }]

const FUNDS = {
  1: 'Money Market Fund',
  2: 'Fixed Income Fund',
  3: 'Balanced Fund',
  4: 'Stock Market',
};

function generateAccountId() { return 'GK' + Math.floor(10000000 + Math.random() * 90000000); }
function getUserAccounts(phone) { return Array.from(accounts.values()).filter(a => a.phone === phone); }
function toK(n) { return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(n); }

function createAccount(phone, fundKey, accountName) {
  const id = generateAccountId();
  const acc = { id, phone, fund: FUNDS[fundKey], name: accountName || `${FUNDS[fundKey]} ${Math.floor(1000 + Math.random()*9000)}`, balance: 0, createdAt: new Date() };
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
    'CON Welcome to Gkash, Learn.Invest.Grow',
    '1. Create account',
    '2. Invest',
    '3. Withdraw',
    '4. Check balance',
    '5. Track account',
    '6. Manage accounts',
  ].join('\n');
}

function fundMenu(prefix) {
  let menu = 'CON ';
  if (prefix) menu += prefix + '\n';
  menu += 'Select fund type:\n1. Money Market Fund\n2. Fixed Income Fund\n3. Balanced Fund\n4. Stock Market';
  return menu;
}

function showUserAccountsForOperation(phone, prompt) {
  const userAccounts = getUserAccounts(phone);
  if (!userAccounts || userAccounts.length === 0) return 'END No accounts found. Please create an account first.';
  let r = 'CON ' + (prompt || 'Select account:') + '\n';
  userAccounts.forEach((a, i) => { r += `${i+1}. ${a.name} (${a.id})\n`; });
  return r;
}

function resolveSelectedAccount(phone, parts) {
  const userAccounts = getUserAccounts(phone);
  if (!userAccounts || userAccounts.length === 0) return { account: null, offset: 1 };
  if (userAccounts.length === 1) return { account: userAccounts[0], offset: 1 };
  const sel = parts[1];
  const idx = parseInt(sel, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= userAccounts.length) return { account: null, offset: 1 };
  return { account: userAccounts[idx], offset: 2 };
}

// Create account handler
async function handleCreateAccount(parts, phone) {
  const existingUser = users.get(phone);
  if (existingUser) {
    if (parts.length === 1) return fundMenu('');
    if (parts.length === 2) { const fund = parts[1]; if (!FUNDS[fund]) return fundMenu('Invalid choice. Try again.'); return 'CON Enter your PIN'; }
    if (parts.length === 3) {
      const fund = parts[1]; const pin = parts[2];
      if (!FUNDS[fund]) return 'END Session error. Please start over.';
      if (!/^\d{4}$/.test(pin)) return 'CON Invalid PIN. Enter 4 digits:';
      if (existingUser.pin !== pin) return 'END Invalid PIN';
      const acc = createAccount(phone, fund, `${existingUser.name}'s ${FUNDS[fund]} ${Object.keys(existingUser.accounts || {}).length + 1}`);
      addTxForAccount(acc.id, { type: 'ACCOUNT_CREATED', amount: 0 });
      try { await sendSMS(phone, `New ${FUNDS[fund]} account created: ${acc.id}`); } catch (e) { console.error(e); }
      return `END New ${FUNDS[fund]} account created successfully!\nAccount No: ${acc.id}`;
    }
    return 'END Invalid request.';
  }

  // new user flow without OTP
  try {
    if (parts.length === 1) return fundMenu('');
    if (parts.length === 2) { const fund = parts[1]; if (!FUNDS[fund]) return fundMenu('Invalid choice. Try again.'); return 'CON Enter your full name'; }
    if (parts.length === 3) { const fund = parts[1]; const name = parts[2]; if (!FUNDS[fund]) return 'END Session error. Please start over.'; if (!name || name.trim().length < 2) return 'CON Name too short. Enter full name:'; return 'CON Enter your ID number (digits only)'; }
    if (parts.length === 4) { const fund = parts[1]; const name = parts[2]; const idNumber = parts[3]; if (!FUNDS[fund]) return 'END Session error. Please start over.'; if (!/^\d{6,}$/.test(idNumber)) return 'CON Invalid ID. Enter at least 6 digits:'; return 'CON Create a 4-digit PIN'; }
    if (parts.length === 5) {
      const fund = parts[1]; const name = parts[2]; const idNumber = parts[3]; const pin = parts[4];
      if (!FUNDS[fund]) return 'END Session error. Please start over.';
      if (!/^\d{4}$/.test(pin)) return 'CON Invalid PIN. Enter 4 digits:';
      const acc = createAccount(phone, fund, `${name}'s ${FUNDS[fund]}`);
      users.set(phone, { name: name.trim(), idNumber, pin, defaultAccountId: acc.id, accounts: { [acc.id]: { fund } } });
      addTxForAccount(acc.id, { type: 'ACCOUNT_CREATED', amount: 0 });
      try { await sendSMS(phone, `Welcome to Gkash ${name}! Your ${FUNDS[fund]} account is ready. Account No: ${acc.id}`); } catch (e) { console.error(e); }
      return `END Registration successful!\nYour ${FUNDS[fund]} has been created.\nAccount No: ${acc.id}`;
    }
    return 'END Invalid request.';
  } catch (err) {
    console.error('handleCreateAccount error', err);
    return 'END Error creating account. Try again.';
  }
}

// Invest
async function handleInvest(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1) return showUserAccountsForOperation(phone, 'Select account to invest into');
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account) return showUserAccountsForOperation(phone, 'Select account to invest into');
  if (parts.length === offset - 1 || parts.length === 1) return 'CON Enter amount to invest (KES)';
  const idx = offset; const amount = Number(parts[idx]); if (!Number.isFinite(amount) || amount <= 0) return 'CON Invalid amount. Enter a positive number (KES)';
  if (parts.length === idx + 1) return 'CON Enter your PIN';
  const pin = parts[idx + 1]; const user = users.get(phone); if (!user) return 'END No account found for this number. Please create an account first.'; if (user.pin !== pin) return 'END Invalid PIN';
  if (account) {
    account.balance = (account.balance || 0) + amount;
    addTxForAccount(account.id, { type: 'DEPOSIT', amount });
    try { await sendSMS(phone, `Investment of KES ${toK(amount)} successful. New balance: KES ${toK(account.balance)}`); } catch (e) { console.error(e); }
    return `END Investment of KES ${toK(amount)} into ${account.name} successful.\nNew balance: KES ${toK(account.balance)}`;
  }
  return 'END Account selection error.';
}

// Withdraw
async function handleWithdraw(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1) return showUserAccountsForOperation(phone, 'Select account to withdraw from');
  const { account, offset } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account) return showUserAccountsForOperation(phone, 'Select account to withdraw from');
  if (parts.length === offset - 1 || parts.length === 1) return 'CON Enter amount to withdraw (KES)';
  const idx = offset; const amount = Number(parts[idx]); if (!Number.isFinite(amount) || amount <= 0) return 'CON Invalid amount. Enter a positive number (KES)';
  if (parts.length === idx + 1) return 'CON Enter your PIN';
  const pin = parts[idx + 1]; const user = users.get(phone); if (!user) return 'END No account found for this number. Please create an account first.'; if (user.pin !== pin) return 'END Invalid PIN';
  if (account) {
    if (amount > (account.balance || 0)) return `END Insufficient balance. Available: KES ${toK(account.balance||0)}`;
    account.balance = (account.balance || 0) - amount;
    addTxForAccount(account.id, { type: 'WITHDRAW', amount });
    try { await sendSMS(phone, `Withdrawal of KES ${toK(amount)} successful. New balance: KES ${toK(account.balance)}`); } catch (e) { console.error(e); }
    return `END Withdrawal of KES ${toK(amount)} successful.\nNew balance: KES ${toK(account.balance)}`;
  }
  return 'END Account selection error.';
}

// Check balance
function handleCheckBalance(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1) return showUserAccountsForOperation(phone, 'Select account to view balance');
  const { account } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account) return showUserAccountsForOperation(phone, 'Select account to view balance');
  if (parts.length === 1) return 'CON Enter your PIN';
  const pin = parts[1]; const user = users.get(phone); if (!user) return 'END No account found for this number. Please create an account first.'; if (user.pin !== pin) return 'END Invalid PIN';
  if (account) { return `END Current Balance: KES ${toK(account.balance||0)}`; }
  return 'END Account selection error.';
}

// Track account
function handleTrackAccount(parts, phone) {
  const userAccounts = getUserAccounts(phone);
  if (userAccounts.length > 1 && parts.length === 1) return showUserAccountsForOperation(phone, 'Select account to track');
  const { account } = resolveSelectedAccount(phone, parts);
  if (userAccounts.length > 1 && !account) return showUserAccountsForOperation(phone, 'Select account to track');
  if (parts.length === 1) return 'CON Enter your PIN';
  const pin = parts[1]; const user = users.get(phone); if (!user) return 'END No account found for this number. Please create an account first.'; if (user.pin !== pin) return 'END Invalid PIN';
  if (account) {
    const txs = transactions.get(account.id) || [];
    const lines = [`CON Account: ${account.name}`, `Fund: ${account.fund}`, `Balance: KES ${toK(account.balance||0)}`];
    if (txs.length) { lines.push('Recent:'); txs.slice(0,3).forEach((t,i)=> lines.push(`${i+1}. ${t.type} ${t.amount? 'KES '+toK(t.amount):''}`)); }
    return lines.join('\n');
}
*** End Patch