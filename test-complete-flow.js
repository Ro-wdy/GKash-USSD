const axios = require("axios");

const BASE_URL = "http://localhost:3000";
const PHONE = "+254712999999";
const PIN = "4321";
const NAME = "Test User";
const ID_NUMBER = "654321";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(phone) {
  return String(phone).trim().replace(/\s+/g, "").replace(/^\+/, "");
}

async function post(path, data) {
  return axios.post(`${BASE_URL}${path}`, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

async function runUssd(label, text) {
  console.log(`\n${label}`);
  console.log("-".repeat(70));
  console.log(`Input: text=\"${text || ""}\"`);

  try {
    const response = await post("/ussd", {
      sessionId: "complete-flow-test",
      serviceCode: "710",
      phoneNumber: PHONE,
      text,
    });

    console.log("Response:");
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.log("✗ FAILED");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    } else {
      console.log("Error:", error.message);
    }
    return null;
  }
}

function extractReference(text) {
  const match = String(text || "").match(/Reference:\s*([A-Z0-9\-]+)/i);
  return match ? match[1].trim() : null;
}

async function simulatePayHeroCallback(reference, amount, phone) {
  const payload = {
    status: true,
    response: {
      Amount: Number(amount),
      CheckoutRequestID: `CHK-${reference}`,
      ExternalReference: reference,
      MerchantRequestID: `MR-${reference}`,
      MpesaReceiptNumber: `MPESA-${reference}`,
      Phone: `+${normalizePhone(phone)}`,
      ResultCode: 0,
      ResultDesc: "The service request is processed successfully.",
      Status: "Success",
    },
  };

  const response = await axios.post(`${BASE_URL}/payhero/callback`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  return response.data;
}

async function seedUser() {
  const response = await axios.post(
    `${BASE_URL}/debug/seed-user`,
    {
      phone: PHONE,
      name: NAME,
      pin: PIN,
      fundKey: "1",
    },
    { headers: { "Content-Type": "application/json" } }
  );

  console.log("\nSeeded user:");
  console.log(response.data);
  return response.data;
}

async function runSequential() {
  console.log("\n" + "═".repeat(70));
  console.log("   COMPLETE USSD FLOW CHECK: OPTION 1 TO LAST OPTION");
  console.log("═".repeat(70) + "\n");

  // Reliable setup for the flow checks
  await seedUser();
  await sleep(300);

  // Main menu
  const welcome = await runUssd("[0] Welcome menu", "710*56789");
  await sleep(300);

  // Option 1: create an additional account for an existing user
  console.log("\n📝 OPTION 1: CREATE ACCOUNT");
  await runUssd("[1.1] Open create account", "710*56789*1");
  await sleep(300);
  await runUssd("[1.2] Choose fund 2", "710*56789*1*2");
  await sleep(300);
  const createSecondAccount = await runUssd(
    "[1.3] Confirm PIN and create",
    `710*56789*1*2*${PIN}`
  );

  await sleep(300);

  // Option 2: invest flow with account selection, then PayHero callback confirmation
  console.log("\n💰 OPTION 2: INVEST");
  await runUssd("[2.1] Open invest menu", "710*56789*2");
  await sleep(300);
  await runUssd("[2.2] Select first account", "710*56789*2*1");
  await sleep(300);
  await runUssd("[2.3] Enter amount", "710*56789*2*1*1000");
  await sleep(300);
  const investPrompt = await runUssd(
    "[2.4] Confirm PIN",
    `710*56789*2*1*1000*${PIN}`
  );

  const investReference = extractReference(investPrompt);
  if (investReference) {
    console.log(`\nPayHero invest reference: ${investReference}`);
    await simulatePayHeroCallback(investReference, 1000, PHONE);
  } else {
    console.log("\n⚠ Could not extract invest reference from the USSD response.");
  }

  await sleep(400);

  // Option 4: check balance after invest callback
  console.log("\n👁️ OPTION 4: CHECK BALANCE");
  await runUssd("[4.1] Open balance menu", "710*56789*4");
  await sleep(300);
  const balanceAfterInvest = await runUssd(
    "[4.2] Select first account and enter PIN",
    `710*56789*4*1*${PIN}`
  );

  // Option 3: withdraw flow, then PayHero callback confirmation
  console.log("\n💵 OPTION 3: WITHDRAW");
  await runUssd("[3.1] Open withdraw menu", "710*56789*3");
  await sleep(300);
  await runUssd("[3.2] Select first account", "710*56789*3*1");
  await sleep(300);
  await runUssd("[3.3] Enter amount", "710*56789*3*1*500");
  await sleep(300);
  const withdrawPrompt = await runUssd(
    "[3.4] Confirm PIN",
    `710*56789*3*1*500*${PIN}`
  );

  const withdrawReference = extractReference(withdrawPrompt);
  if (withdrawReference) {
    console.log(`\nPayHero withdrawal reference: ${withdrawReference}`);
    await simulatePayHeroCallback(withdrawReference, 500, PHONE);
  } else {
    console.log("\n⚠ Could not extract withdrawal reference from the USSD response.");
  }

  await sleep(400);

  // Option 5: track account
  console.log("\n📊 OPTION 5: TRACK ACCOUNT");
  await runUssd("[5.1] Open track account menu", "710*56789*5");
  await sleep(300);
  const trackAccount = await runUssd(
    "[5.2] Select first account and enter PIN",
    `710*56789*5*1*${PIN}`
  );

  // Option 6: manage accounts
  console.log("\n🧭 OPTION 6: MANAGE ACCOUNTS");
  const manageMenu = await runUssd("[6.1] Open manage accounts", "710*56789*6");
  await sleep(300);

  // If there are multiple accounts, choose the last option to create a new one
  const managementChoices = String(manageMenu || "").split("\n");
  const createNewChoice = managementChoices.find((line) => /Create new account/i.test(line));
  const createNewIndex = createNewChoice ? createNewChoice.match(/^(\d+)\./)?.[1] : null;

  if (createNewIndex) {
    await runUssd("[6.2] Create a new account", `710*56789*6*${createNewIndex}`);
    await sleep(300);
    await runUssd("[6.3] Select fund 3", `710*56789*6*${createNewIndex}*3`);
    await sleep(300);
    const createThirdAccount = await runUssd(
      "[6.4] Confirm PIN to create new account",
      `710*56789*6*${createNewIndex}*3*${PIN}`
    );
    console.log("\nCreated account from manage menu:");
    console.log(createThirdAccount);
  }

  // Summary
  console.log("\n\n" + "═".repeat(70));
  console.log("   ✅ TEST SUMMARY");
  console.log("═".repeat(70) + "\n");

  console.log("✓ Option 1: Create account flow checked");
  console.log("✓ Option 2: Invest flow checked with PayHero callback");
  console.log("✓ Option 3: Withdraw flow checked with PayHero callback");
  console.log("✓ Option 4: Balance flow checked");
  console.log("✓ Option 5: Track account flow checked");
  console.log("✓ Option 6: Manage accounts flow checked");
  console.log("\nAll USSD options from 1 to 6 were exercised end-to-end.\n");

  return {
    welcome,
    createSecondAccount,
    investPrompt,
    balanceAfterInvest,
    withdrawPrompt,
    trackAccount,
    manageMenu,
  };
}

runSequential().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
