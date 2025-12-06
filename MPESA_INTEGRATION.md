# M-Pesa Daraja Integration Guide

## Overview

This document explains how the M-Pesa STK Push integration works for deposits and investments in the Gkash USSD system.

## Sandbox Credentials Configured

```
Business Short Code: 174379
Passkey: bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
Initiator Name: testapi
Initiator Password: Safaricom123!!
Party A (Pay Bill Account): 600990
Party B (Store ID): 600000
Test Phone Number: 254708374149
```

## How It Works

### 1. STK Push Endpoint

**Endpoint**: `POST /api/mpesa/stkpush`

Triggers an M-Pesa payment prompt on the user's phone.

**Request**:

```json
{
  "phone": "254708374149",
  "amount": 5000,
  "accountId": "GK29216923",
  "accountReference": "GK29216923"
}
```

**Response**:

```json
{
  "success": true,
  "message": "STK Push initiated. Check your phone for payment prompt.",
  "data": {
    "MerchantRequestID": "...",
    "CheckoutRequestID": "...",
    "ResponseCode": "0",
    "ResponseDescription": "Success. Request accepted for processing"
  }
}
```

### 2. Callback URL

**Endpoint**: `POST /mpesa/callback`

M-Pesa sends payment confirmation here after user completes/cancels the prompt.

**Expected Payload**:

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "...",
      "CheckoutRequestID": "...",
      "ResultCode": 0,
      "ResultDesc": "The service request has been processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 5000 },
          { "Name": "MpesaReceiptNumber", "Value": "OPT..." },
          { "Name": "PhoneNumber", "Value": 254708374149 }
        ]
      }
    }
  }
}
```

**Response** (to M-Pesa):

```json
{
  "ResultCode": 0,
  "ResultDesc": "Accepted"
}
```

## Integration with USSD Flow

### Current USSD Invest Flow (Manual PIN)

```
User dials: *710*56789#
  ↓
Select 2 (Invest)
  ↓
Select account (if multiple)
  ↓
Enter amount
  ↓
Enter PIN
  ↓
"Investment successful"
```

### Future Integration Option 1: STK Push After PIN

```
User dials: *710*56789#
  ↓
Select 2 (Invest)
  ↓
Select account
  ↓
Enter amount
  ↓
Enter PIN
  ↓
Server calls /api/mpesa/stkpush
  ↓
User receives M-Pesa prompt on phone
  ↓
User enters M-Pesa PIN
  ↓
Payment confirmed → Balance updated
```

### Future Integration Option 2: Direct STK Push from Web App

Mobile app users can directly call:

```bash
curl -X POST https://tiara-connect-otp.onrender.com/api/mpesa/stkpush \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "254708374149",
    "amount": 5000,
    "accountId": "GK29216923"
  }'
```

## Testing Steps

### 1. Test STK Push Endpoint

```bash
curl -X POST http://localhost:3000/api/mpesa/stkpush \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "254708374149",
    "amount": 5000,
    "accountId": "GK29216923",
    "accountReference": "GK29216923"
  }'
```

Expected: Payment prompt appears on phone 254708374149

### 2. Handle Callback

When user completes payment, M-Pesa sends callback to `/mpesa/callback`. Server logs the transaction details and updates account balance.

## Next Steps

1. **Update USSD Invest Flow**: After user confirms amount and PIN, trigger STK Push instead of instant balance update
2. **Database Integration**: Store M-Pesa transactions in database
3. **Payment Verification**: Update account balance only after M-Pesa confirmation
4. **Error Handling**: Handle failed/cancelled payments gracefully
5. **Production Credentials**: Switch to production credentials when going live

## Troubleshooting

| Issue                                         | Solution                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| STK Push fails with 401                       | Check CONSUMER_KEY and CONSUMER_SECRET                                   |
| STK Push fails with 400                       | Verify phone format (254...), amount is numeric, shortcode is correct    |
| No callback received                          | Verify callback URL is reachable and MPESA_CALLBACK_URL is correctly set |
| Payment shows in logs but balance not updated | Database integration needed (currently in-memory)                        |

## Security Notes

⚠️ **Credentials in Code**:

- Sandbox credentials are hardcoded for testing
- For production, use environment variables only
- Never commit real credentials to git

⚠️ **Callback Verification**:

- TODO: Implement signature verification for callbacks
- Implement rate limiting on callback endpoint

⚠️ **Transaction Logging**:

- All transactions are currently logged to console only
- Migrate to database for audit trail and reconciliation

## Useful Links

- [M-Pesa API Docs](https://developer.safaricom.co.ke/)
- [Daraja C2B](https://developer.safaricom.co.ke/docs#c2b-api)
- [STK Push](https://developer.safaricom.co.ke/docs#lipa-na-m-pesa-online-stk-push)
- [Testing Phone Numbers](https://developer.safaricom.co.ke/test-api-phones)
