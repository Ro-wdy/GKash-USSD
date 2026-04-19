const fs = require("fs");
const path = require("path");

const accountsPath = path.join(
  __dirname,
  "..",
  "TiaraConnect",
  "data",
  "accounts.json"
);
const usersPath = path.join(
  __dirname,
  "..",
  "TiaraConnect",
  "data",
  "users.json"
);
const transactionsPath = path.join(
  __dirname,
  "..",
  "TiaraConnect",
  "data",
  "transactions.json"
);
const {
  initPostgres,
  isPostgresEnabled,
  upsertAccount,
  upsertUser,
  upsertTransactions,
} = require("../TiaraConnect/postgresService");

async function run() {
  if (!isPostgresEnabled()) {
    console.log("PostgreSQL is not configured. Set DATABASE_URL in TiaraConnect/.env first.");
    process.exit(1);
  }

  const rawAccounts = fs.existsSync(accountsPath)
    ? JSON.parse(fs.readFileSync(accountsPath, "utf8"))
    : {};
  const rawUsers = fs.existsSync(usersPath)
    ? JSON.parse(fs.readFileSync(usersPath, "utf8"))
    : {};
  const rawTransactions = fs.existsSync(transactionsPath)
    ? JSON.parse(fs.readFileSync(transactionsPath, "utf8"))
    : {};

  const accountEntries = Object.values(rawAccounts || {});
  const userEntries = Object.entries(rawUsers || {});
  const transactionEntries = Object.entries(rawTransactions || {});

  await initPostgres();

  let importedAccounts = 0;
  for (const account of accountEntries) {
    await upsertAccount({
      id: account.id,
      phone: account.phone,
      fund: account.fund,
      name: account.name,
      balance: Number(account.balance || 0),
      createdAt: account.createdAt || new Date(),
    });
    importedAccounts += 1;
  }

  let importedUsers = 0;
  for (const [phone, userData] of userEntries) {
    await upsertUser(phone, userData || {});
    importedUsers += 1;
  }

  let importedTransactions = 0;
  for (const [accountId, txList] of transactionEntries) {
    await upsertTransactions(accountId, txList || []);
    importedTransactions += 1;
  }

  console.log(
    `Imported ${importedAccounts} account(s), ${importedUsers} user(s), ${importedTransactions} transaction set(s) from JSON to PostgreSQL.`
  );
}

run().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
