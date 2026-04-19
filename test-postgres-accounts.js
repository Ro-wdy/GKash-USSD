const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "TiaraConnect", ".env") });

const {
  isPostgresEnabled,
  initPostgres,
  loadAccounts,
  loadUsers,
  loadTransactions,
} = require("./TiaraConnect/postgresService");

async function run() {
  console.log("\n=== PostgreSQL Accounts Check ===\n");

  if (!isPostgresEnabled()) {
    console.log("PostgreSQL is not configured.");
    console.log("Set either DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE in TiaraConnect/.env");
    process.exit(0);
  }

  await initPostgres();
  const data = await loadAccounts();
  const users = await loadUsers();
  const tx = await loadTransactions();

  console.log(`Connected: yes`);
  console.log(`Accounts in DB: ${data.accounts.length}`);
  console.log(`Users in DB: ${users.users.length}`);
  console.log(`Transaction sets in DB: ${tx.transactions.length}`);

  if (data.accounts.length) {
    const latest = data.accounts[data.accounts.length - 1];
    console.log("Latest account:");
    console.log(latest);
  }
}

run().catch((error) => {
  console.error("\nPostgreSQL accounts check failed:", error.message);
  process.exit(1);
});
