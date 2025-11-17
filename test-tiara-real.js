const axios = require("axios");

const BASE_URL = "http://localhost:3000";

// Tests simulating actual Tiara Connect USSD flow
// Tiara sends the full USSD string including the short code
const tests = [
  {
    name: "Initial Request - User dials *710*56789#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789", // Tiara sends this format
    },
  },
  {
    name: "User presses 1 (Create Account) - Dial *710*56789*1#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789*1", // Tiara sends this format
    },
  },
  {
    name: "User selects Fund 1 - Dial *710*56789*1*1#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789*1*1",
    },
  },
  {
    name: "User enters name 'Jane Smith' - Dial *710*56789*1*1*Jane Smith#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789*1*1*Jane Smith",
    },
  },
  {
    name: "User enters ID '987654' - Dial *710*56789*1*1*Jane Smith*987654#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789*1*1*Jane Smith*987654",
    },
  },
  {
    name: "User enters PIN '5678' - Dial *710*56789*1*1*Jane Smith*987654*5678#",
    data: {
      sessionId: "tiara-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789*1*1*Jane Smith*987654*5678",
    },
  },
];

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("   GKASH USSD - TIARA CONNECT SIMULATION");
  console.log("   Testing actual USSD flow from real devices");
  console.log("=".repeat(60) + "\n");

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n[TEST ${i + 1}] ${test.name}`);
    console.log("-".repeat(60));
    console.log(`Input: text="${test.data.text}"`);

    try {
      const response = await axios.post(`${BASE_URL}/ussd`, test.data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      console.log("✓ SUCCESS");
      console.log("\nResponse:");
      console.log(response.data);
    } catch (error) {
      console.log("✗ FAILED");
      if (error.response) {
        console.log("Status:", error.response.status);
        console.log("Data:", error.response.data);
      } else {
        console.log("Error:", error.message);
      }
    }

    // Wait 1 second between requests
    if (i < tests.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("   TEST SUITE COMPLETED");
  console.log("=".repeat(60) + "\n");
}

// Run tests
runTests().catch((err) => {
  console.error("Test suite error:", err.message);
  process.exit(1);
});
