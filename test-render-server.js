const axios = require("axios");

// Configuration
const RENDER_URL =
  process.env.RENDER_URL || "https://your-render-service.onrender.com";
const LOCAL_URL = "http://localhost:3000";

console.log(`
╔════════════════════════════════════════════════════════════╗
║         RENDER SERVER HEALTH CHECK & CALLBACK TEST         ║
╚════════════════════════════════════════════════════════════╝
`);

async function testServer(url, label) {
  console.log(`\n📍 Testing: ${label}`);
  console.log(`   URL: ${url}`);
  console.log("-".repeat(60));

  try {
    // Test health endpoint
    const healthResponse = await axios.get(`${url}/`, {
      timeout: 5000,
    });

    console.log(`✅ Server is UP`);
    console.log(`   Response: ${healthResponse.data.substring(0, 80)}...`);

    // Test USSD endpoint with initial request
    console.log(`\n📤 Testing USSD callback...`);
    const ussdResponse = await axios.post(`${url}/ussd`, {
      sessionId: "test-render-001",
      serviceCode: "710",
      phoneNumber: "+254712345678",
      text: "710*56789",
    });

    console.log(`✅ USSD endpoint responds`);
    console.log(`   Response preview:`);
    const preview = ussdResponse.data.split("\n").slice(0, 3).join("\n   ");
    console.log(`   ${preview}`);

    // Test OTP endpoint
    console.log(`\n📤 Testing OTP endpoint...`);
    const otpResponse = await axios.post(`${url}/api/auth/send-otp`, {
      phone: "+254712345678",
      name: "Test User",
    });

    console.log(`✅ OTP endpoint responds`);
    console.log(
      `   Status: ${otpResponse.data.success ? "Success" : "Failed"}`
    );
    console.log(`   Message: ${otpResponse.data.message}`);

    return { success: true, label, url };
  } catch (error) {
    console.log(`❌ Server is DOWN or unreachable`);
    if (error.code === "ECONNREFUSED") {
      console.log(`   Error: Connection refused (server not running)`);
    } else if (error.code === "ENOTFOUND") {
      console.log(`   Error: Domain not found (check URL)`);
    } else if (error.response) {
      console.log(
        `   HTTP ${error.response.status}: ${error.response.statusText}`
      );
    } else {
      console.log(`   Error: ${error.message}`);
    }
    return { success: false, label, url, error: error.message };
  }
}

async function runTests() {
  const results = [];

  // Test local server first
  console.log(`\n\n🔍 PHASE 1: Testing LOCAL server (development)`);
  const localResult = await testServer(LOCAL_URL, "LOCAL - localhost:3000");
  results.push(localResult);

  console.log(`\n\n${"═".repeat(60)}`);

  // Test render server
  if (RENDER_URL === "https://your-render-service.onrender.com") {
    console.log(`\n\n⚠️  PHASE 2: Render Server Test SKIPPED`);
    console.log(`   Reason: RENDER_URL not configured`);
    console.log(`\n   To test your Render server, set environment variable:`);
    console.log(`   export RENDER_URL=https://your-service-name.onrender.com`);
    console.log(`\n   Then run:`);
    console.log(
      `   RENDER_URL=https://your-service.onrender.com node test-render-server.js`
    );
  } else {
    console.log(`\n\n🔍 PHASE 2: Testing RENDER server (production)`);
    const renderResult = await testServer(
      RENDER_URL,
      `RENDER - ${RENDER_URL.replace("https://", "")}`
    );
    results.push(renderResult);
  }

  // Summary
  console.log(`\n\n${"═".repeat(60)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${"═".repeat(60)}`);

  results.forEach((result) => {
    const status = result.success ? "✅ UP" : "❌ DOWN";
    console.log(`${status}  ${result.label}`);
  });

  const allSuccess = results.every((r) => r.success);

  console.log(`\n`);
  if (allSuccess) {
    console.log(`✅ ALL TESTS PASSED - Servers are healthy!`);
    console.log(`   Callback URL is ready for Tiara configuration.`);
  } else {
    console.log(`⚠️  SOME TESTS FAILED - Review results above.`);
  }

  console.log(`\n`);
  console.log(`📋 NEXT STEPS:`);
  console.log(
    `   1. Ensure server is running: cd TiaraConnect && node server.js`
  );
  console.log(`   2. For Render deployment:`);
  console.log(`      - Push to GitHub`);
  console.log(`      - Connect Render service`);
  console.log(`      - Set TIARA_API_KEY environment variable in Render`);
  console.log(`      - Add callback URL to Tiara dashboard`);
  console.log(`\n`);
}

// Run tests
runTests().catch((err) => {
  console.error("\n❌ Test suite error:", err.message);
  process.exit(1);
});
