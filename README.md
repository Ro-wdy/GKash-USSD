# Gkash USSD (Tiara Connect)

A Node.js (Express) USSD application for Gkash: Learn. Invest. Grow.

Service code: `*710*56789#`

## Features
- Create account: choose fund, set name, phone, ID, and PIN
  - Funds: Money Market, Fixed Income, Balanced, Stock Market
- Invest: enter amount and PIN
- Withdraw: enter amount and PIN
- Check balance: enter PIN
- Track account: view account details and recent transactions with PIN

Note: This demo uses in-memory storage. Replace with a database for production use.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm run start
   # or during development with auto-reload
   npm run dev
   ```

Server listens on `http://localhost:3000` by default.

## Simulate USSD requests
Most USSD gateways POST `application/x-www-form-urlencoded` with fields like `sessionId`, `serviceCode`, `phoneNumber`, and `text`.

### Start menu
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text='
```

### Create account flow (example)
```bash
# 1) Pick Create Account (1)
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1'

# 2) Choose fund (e.g., 1)
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1'

# 3) Enter name
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1*Jane Doe'

# 4) Enter phone
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1*Jane Doe*0712345678'

# 5) Enter ID
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1*Jane Doe*0712345678*12345678'

# 6) Set 4-digit PIN
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1*Jane Doe*0712345678*12345678*1234'
```

### Invest
```bash
# Enter amount then PIN
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=456&serviceCode=*710*56789#&phoneNumber=0712345678&text=2*500*1234'
```

### Withdraw
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=789&serviceCode=*710*56789#&phoneNumber=0712345678&text=3*200*1234'
```

### Check balance
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=321&serviceCode=*710*56789#&phoneNumber=0712345678&text=4*1234'
```

### Track account
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=654&serviceCode=*710*56789#&phoneNumber=0712345678&text=5*1234'
```