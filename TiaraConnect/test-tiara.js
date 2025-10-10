// test-tiara.js
require("dotenv").config();
const { sendOTP } = require("./tiaraService");

async function test() {
  const phone = process.env.TEST_PHONE || "0743177132"; // set TEST_PHONE in .env
  try {
    console.log("Sending OTP to", phone);
    const res = await sendOTP(phone, "Test User");
    console.log("Result:", res);
  } catch (err) {
    console.error("Error:", err.message || err);
  }
}

if (require.main === module) test();

module.exports = { test };
