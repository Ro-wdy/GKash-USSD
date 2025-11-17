const axios = require("axios");

const BASE_URL = "http://localhost:3000";

// Test data
const tests = [
  {
    name: "Initial Request (Welcome Menu)",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "",
    },
  },
  {
    name: "Select Option 1 (Create Account)",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "1",
    },
  },
  {
    name: "Select Fund 1 (Money Market Fund)",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "1*1",
    },
  },
  {
    name: "Enter Full Name",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "1*1*John Doe",
    },
  },
  {
    name: "Enter ID Number",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "1*1*John Doe*123456",
    },
  },
  {
    name: "Enter PIN",
    data: {
      sessionId: "test-session-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "1*1*John Doe*123456*1234",
    },
  },
];

async function runTests() {
  console.log("\n========================================");
  console.log("   GKASH USSD TEST SUITE");
  console.log("========================================\n");

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n[TEST ${i + 1}] ${test.name}`);
    console.log("-".repeat(50));

    try {
      const response = await axios.post(`${BASE_URL}/ussd`, test.data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      console.log("✓ Request successful");
      console.log("\nResponse:");
      console.log(response.data);
    } catch (error) {
      console.log("✗ Request failed");
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

  console.log("\n" + "=".repeat(50));
  console.log("   TEST SUITE COMPLETED");
  console.log("=".repeat(50) + "\n");
}

// Run tests
runTests().catch((err) => {
  console.error("Test suite error:", err.message);
  process.exit(1);
});
