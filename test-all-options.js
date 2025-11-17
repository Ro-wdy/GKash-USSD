const axios = require("axios");

const BASE_URL = "http://localhost:3000";

// Test all menu options with complete flows
const testSuites = {
  // Option 2: Invest Flow
  invest: [
    {
      name: "Menu - Select Invest (Option 2)",
      data: {
        sessionId: "invest-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*2",
      },
    },
    {
      name: "Enter Investment Amount: 5000",
      data: {
        sessionId: "invest-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*2*5000",
      },
    },
    {
      name: "Enter PIN: 1234",
      data: {
        sessionId: "invest-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*2*5000*1234",
      },
    },
  ],

  // Option 3: Withdraw Flow
  withdraw: [
    {
      name: "Menu - Select Withdraw (Option 3)",
      data: {
        sessionId: "withdraw-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*3",
      },
    },
    {
      name: "Enter Withdrawal Amount: 2000",
      data: {
        sessionId: "withdraw-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*3*2000",
      },
    },
    {
      name: "Enter PIN: 1234",
      data: {
        sessionId: "withdraw-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*3*2000*1234",
      },
    },
  ],

  // Option 4: Check Balance Flow
  balance: [
    {
      name: "Menu - Select Check Balance (Option 4)",
      data: {
        sessionId: "balance-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*4",
      },
    },
    {
      name: "Enter PIN: 1234",
      data: {
        sessionId: "balance-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*4*1234",
      },
    },
  ],

  // Option 5: Track Account Flow
  track: [
    {
      name: "Menu - Select Track Account (Option 5)",
      data: {
        sessionId: "track-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*5",
      },
    },
    {
      name: "Enter PIN: 1234",
      data: {
        sessionId: "track-001",
        serviceCode: "710",
        phoneNumber: "+254712345678",
        text: "710*56789*5*1234",
      },
    },
  ],
};

async function runTestSuite(suiteName, tests) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`   TESTING: ${suiteName.toUpperCase()}`);
  console.log(`${"=".repeat(70)}\n`);

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n[STEP ${i + 1}/${tests.length}] ${test.name}`);
    console.log("-".repeat(70));

    try {
      const response = await axios.post(`${BASE_URL}/ussd`, test.data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      console.log("✓ SUCCESS\n");
      console.log("Response:");
      console.log(response.data);
    } catch (error) {
      console.log("✗ FAILED");
      if (error.response) {
        console.log("Status:", error.response.status);
        console.log("Data:", error.response.data);
      } else {
        console.log("Error:", error.message);
      }
      // Continue to next test even if this one fails
    }

    // Wait between requests
    if (i < tests.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

async function runAllTests() {
  console.log("\n" + "╔" + "═".repeat(68) + "╗");
  console.log(
    "║" + " ".repeat(15) + "ALL OPTIONS FLOW TEST SUITE" + " ".repeat(25) + "║"
  );
  console.log(
    "║" +
      " ".repeat(12) +
      "Testing all menu options end-to-end" +
      " ".repeat(20) +
      "║"
  );
  console.log("╚" + "═".repeat(68) + "╝");

  // Note: Account must exist first
  console.log(
    "\n⚠️  NOTE: These tests assume an account already exists for +254712345678"
  );
  console.log("       with PIN: 1234");
  console.log(
    "\nIf you haven't created an account yet, run: node test-tiara-real.js"
  );

  try {
    // Run each test suite
    await runTestSuite("OPTION 2 - INVEST", testSuites.invest);
    await runTestSuite("OPTION 3 - WITHDRAW", testSuites.withdraw);
    await runTestSuite("OPTION 4 - CHECK BALANCE", testSuites.balance);
    await runTestSuite("OPTION 5 - TRACK ACCOUNT", testSuites.track);

    console.log("\n" + "╔" + "═".repeat(68) + "╗");
    console.log(
      "║" + " ".repeat(20) + "ALL TESTS COMPLETED" + " ".repeat(28) + "║"
    );
    console.log("╚" + "═".repeat(68) + "╝\n");
  } catch (error) {
    console.error("\n✗ Test suite error:", error.message);
    process.exit(1);
  }
}

// Run all tests
runAllTests();
