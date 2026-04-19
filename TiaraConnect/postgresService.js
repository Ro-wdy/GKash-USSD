const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

let pool = null;

function isPostgresEnabled() {
  return Boolean(
    process.env.DATABASE_URL ||
      (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
  );
}

function getPool() {
  if (!isPostgresEnabled()) {
    return null;
  }

  if (!pool) {
    const useConnectionString = Boolean(process.env.DATABASE_URL);
    pool = new Pool(
      useConnectionString
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl:
              process.env.PGSSLMODE === "disable"
                ? false
                : { rejectUnauthorized: false },
          }
        : {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            ssl:
              process.env.PGSSLMODE === "disable"
                ? false
                : { rejectUnauthorized: false },
          }
    );
  }

  return pool;
}

async function initPostgres() {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false };
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      fund_key TEXT,
      fund TEXT NOT NULL,
      name TEXT NOT NULL,
      balance NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS fund_key TEXT;
  `);

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts(phone);
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      name TEXT,
      pin TEXT,
      email TEXT,
      default_account_id TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS account_transactions (
      account_id TEXT PRIMARY KEY,
      tx_list JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return { enabled: true };
}

async function upsertAccount(account) {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false };
  }

  await pgPool.query(
    `
      INSERT INTO accounts (id, phone, fund_key, fund, name, balance, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO UPDATE SET
        phone = EXCLUDED.phone,
        fund_key = EXCLUDED.fund_key,
        fund = EXCLUDED.fund,
        name = EXCLUDED.name,
        balance = EXCLUDED.balance,
        updated_at = NOW();
    `,
    [
      account.id,
      account.phone,
      account.fundKey || account.fund_key || null,
      account.fund,
      account.name,
      Number(account.balance || 0),
      account.createdAt || new Date(),
    ]
  );

  return { enabled: true };
}

async function loadAccounts() {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false, accounts: [] };
  }

  const result = await pgPool.query(
    `
      SELECT id, phone, fund_key, fund, name, balance, created_at
      FROM accounts
      ORDER BY created_at ASC;
    `
  );

  const accounts = result.rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    fundKey: row.fund_key,
    fund: row.fund,
    name: row.name,
    balance: Number(row.balance || 0),
    createdAt: row.created_at,
  }));

  return { enabled: true, accounts };
}

async function upsertUser(phone, userData) {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false };
  }

  await pgPool.query(
    `
      INSERT INTO users (phone, name, pin, email, default_account_id, data, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        pin = EXCLUDED.pin,
        email = EXCLUDED.email,
        default_account_id = EXCLUDED.default_account_id,
        data = EXCLUDED.data,
        updated_at = NOW();
    `,
    [
      phone,
      userData?.name || null,
      userData?.pin || null,
      userData?.email || null,
      userData?.defaultAccountId || null,
      JSON.stringify(userData || {}),
    ]
  );

  return { enabled: true };
}

async function loadUsers() {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false, users: [] };
  }

  const result = await pgPool.query(
    `
      SELECT phone, data
      FROM users
      ORDER BY updated_at ASC;
    `
  );

  const users = result.rows.map((row) => ({
    phone: row.phone,
    data: row.data || {},
  }));

  return { enabled: true, users };
}

async function upsertTransactions(accountId, txList) {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false };
  }

  await pgPool.query(
    `
      INSERT INTO account_transactions (account_id, tx_list, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        tx_list = EXCLUDED.tx_list,
        updated_at = NOW();
    `,
    [accountId, JSON.stringify(txList || [])]
  );

  return { enabled: true };
}

async function loadTransactions() {
  const pgPool = getPool();
  if (!pgPool) {
    return { enabled: false, transactions: [] };
  }

  const result = await pgPool.query(
    `
      SELECT account_id, tx_list
      FROM account_transactions
      ORDER BY updated_at ASC;
    `
  );

  const transactions = result.rows.map((row) => ({
    accountId: row.account_id,
    txList: row.tx_list || [],
  }));

  return { enabled: true, transactions };
}

module.exports = {
  isPostgresEnabled,
  initPostgres,
  upsertAccount,
  loadAccounts,
  upsertUser,
  loadUsers,
  upsertTransactions,
  loadTransactions,
};
