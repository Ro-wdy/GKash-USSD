// test-sms.js
const {
  sendOTP,
  sendAccountConfirmation,
  sendTransactionNotification,
} = require("./src/smsService");

async function testSMS() {
  console.log("Testing SMS Leopard service...");
  console.log("=====================================\n");

  const testPhone = "0743177132";

  try {
    // 1️⃣ Send OTP
    console.log("1. Sending OTP...");
    const otpResult = await sendOTP(testPhone, "Test User");
    console.log("Result:", otpResult);
    if (!otpResult.success) throw new Error("OTP sending failed");
    console.log("✅ OTP sent!\n");

    // 2️⃣ Send Account Confirmation
    await new Promise((res) => setTimeout(res, 2000));
    console.log("2. Sending Account Confirmation...");
    const confirmResult = await sendAccountConfirmation(
      testPhone,
      "Test User",
      "Money Market Fund",
      5000
    );
    console.log("Result:", confirmResult);
    if (!confirmResult.success) throw new Error("Confirmation failed");
    console.log("✅ Confirmation sent!\n");

    // 3️⃣ Send Transaction Notification
    await new Promise((res) => setTimeout(res, 2000));
    console.log("3. Sending Transaction Notification...");
    const transactionResult = await sendTransactionNotification(
      testPhone,
      "INVEST",
      1000,
      6000,
      "Test User"
    );
    console.log("Result:", transactionResult);
    if (!transactionResult.success) throw new Error("Transaction failed");
    console.log("✅ Transaction notification sent!\n");

    console.log("🎉 ALL TESTS PASSED! Check your phone for 3 messages 📱");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testSMS();
