// direct-test.js
const { sendOTP } = require("./src/smsService");

async function directTest() {
  const testPhone = "0743177132";

  try {
    console.log("🔹 Sending random OTP via SMS Leopard...");
    const result = await sendOTP(testPhone, "Test User");

    if (result.success) {
      console.log("✅ OTP sent successfully!");
      console.log(`OTP: ${result.otp}`); // For testing only, remove in production
      console.log("Response:", result.data);
    } else {
      console.error("❌ Failed to send OTP:", result.error);
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error.message);
  }
}

directTest();
