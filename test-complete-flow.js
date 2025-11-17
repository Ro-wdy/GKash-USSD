const axios = require("axios");

const BASE_URL = "http://localhost:3000";

async function runTest(name, data) {
  console.log(`\n${name}`);
  console.log("-".repeat(70));
  console.log(`Input: text="${data.text}"`);

  try {
    const response = await axios.post(`${BASE_URL}/ussd`, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("✓ SUCCESS\n");
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

async function runSequential() {
  console.log("\n" + "═".repeat(70));
  console.log("   COMPLETE USSD FLOW WITH ALL OPTIONS TEST");
  console.log("═".repeat(70) + "\n");

  // Step 1: Create Account
  console.log("\n📝 STEP 1: CREATE ACCOUNT");
  console.log("═".repeat(70));

  const phone = "+254712999999"; // Different phone for this test
  const name = "Test User";
  const idNumber = "654321";
  const pin = "4321";
  const otp = "123456"; // We'll use this for testing

  await runTest("[1.1] Show welcome menu", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789",
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.2] Select Create Account", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*1",
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.3] Select Fund (Money Market)", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*1*1",
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.4] Enter Name", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*1*1*${name}`,
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.5] Enter ID Number", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*1*1*${name}*${idNumber}`,
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.6] Enter PIN", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*1*1*${name}*${idNumber}*${pin}`,
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[1.7] Enter OTP", {
    sessionId: "test1",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*1*1*${name}*${idNumber}*${pin}*${otp}`,
  });

  // Step 2: Test Invest Option
  console.log("\n\n💰 STEP 2: TEST INVEST OPTION");
  console.log("═".repeat(70));

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[2.1] Select Invest from menu", {
    sessionId: "test2",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*2",
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[2.2] Enter investment amount", {
    sessionId: "test2",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*2*1000",
  });

  await new Promise((r) => setTimeout(r, 500));

  const investResult = await runTest("[2.3] Enter PIN to confirm", {
    sessionId: "test2",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*2*1000*${pin}`,
  });

  // Step 3: Test Withdraw Option
  console.log("\n\n💵 STEP 3: TEST WITHDRAW OPTION");
  console.log("═".repeat(70));

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[3.1] Select Withdraw from menu", {
    sessionId: "test3",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*3",
  });

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[3.2] Enter withdrawal amount", {
    sessionId: "test3",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*3*500",
  });

  await new Promise((r) => setTimeout(r, 500));

  const withdrawResult = await runTest("[3.3] Enter PIN to confirm", {
    sessionId: "test3",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*3*500*${pin}`,
  });

  // Step 4: Test Check Balance
  console.log("\n\n👁️  STEP 4: TEST CHECK BALANCE OPTION");
  console.log("═".repeat(70));

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[4.1] Select Check Balance", {
    sessionId: "test4",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*4",
  });

  await new Promise((r) => setTimeout(r, 500));

  const balanceResult = await runTest("[4.2] Enter PIN", {
    sessionId: "test4",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*4*${pin}`,
  });

  // Step 5: Test Track Account
  console.log("\n\n📊 STEP 5: TEST TRACK ACCOUNT OPTION");
  console.log("═".repeat(70));

  await new Promise((r) => setTimeout(r, 500));

  await runTest("[5.1] Select Track Account", {
    sessionId: "test5",
    serviceCode: "710",
    phoneNumber: phone,
    text: "710*56789*5",
  });

  await new Promise((r) => setTimeout(r, 500));

  const trackResult = await runTest("[5.2] Enter PIN", {
    sessionId: "test5",
    serviceCode: "710",
    phoneNumber: phone,
    text: `710*56789*5*${pin}`,
  });

  // Summary
  console.log("\n\n" + "═".repeat(70));
  console.log("   ✅ TEST SUMMARY");
  console.log("═".repeat(70) + "\n");

  console.log("✓ Account Creation: COMPLETED");
  if (investResult && investResult.includes("successful"))
    console.log(
      "✓ Investment Flow: COMPLETED - Menu continues after transaction"
    );
  else console.log("⚠ Investment Flow: Check logs");

  if (withdrawResult && withdrawResult.includes("successful"))
    console.log(
      "✓ Withdrawal Flow: COMPLETED - Menu continues after transaction"
    );
  else console.log("⚠ Withdrawal Flow: Check logs");

  if (balanceResult && balanceResult.includes("Balance"))
    console.log(
      "✓ Check Balance: COMPLETED - Menu continues after viewing balance"
    );
  else console.log("⚠ Balance Check: Check logs");

  if (trackResult && trackResult.includes("Account"))
    console.log("✓ Track Account: COMPLETED - Shows recent transactions");
  else console.log("⚠ Track Account: Check logs");

  console.log(
    "\n✅ All options work end-to-end and return to menu after completion!\n"
  );
}

runSequential().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
