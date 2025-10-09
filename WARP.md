# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Node.js USSD (Unstructured Supplementary Service Data) application for Gkash, a financial service that allows users to learn, invest, and grow their money. The service code is `*710*56789#`.

The application is a single-file Express.js server that handles USSD menu flows for:
- Creating investment accounts with fund selection
- Making investments and withdrawals 
- Checking account balances
- Tracking account details and transaction history

**Important**: This is a demo application using in-memory storage. All data is stored in Maps and will be lost when the server restarts.

## Development Commands

### Setup
```bash
npm install
```

### Running the Server
```bash
# Production mode
npm run start

# Development mode with auto-reload
npm run dev
```

The server runs on `http://localhost:3000` by default (configurable via `PORT` environment variable).

### Testing USSD Flows

Since this is a USSD service, testing requires simulating POST requests with `application/x-www-form-urlencoded` payloads.

#### Start Menu
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text='
```

#### Create Account Flow
```bash
# Step 1: Choose "Create Account" (option 1)
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1'

# Step 2: Select fund type (e.g., option 1 for Money Market)
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=123&serviceCode=*710*56789#&phoneNumber=0712345678&text=1*1'

# Continue flow with: text=1*1*Jane Doe*0712345678*12345678*1234
```

#### Quick Investment Test
```bash
curl -X POST http://localhost:3000/ussd \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'sessionId=456&serviceCode=*710*56789#&phoneNumber=0712345678&text=2*500*1234'
```

## Code Architecture

### Single-File Structure
The entire application logic resides in `src/server.js`. While simple, this architecture separates concerns through well-defined functions:

#### Data Layer (In-Memory)
- `users` Map: Stores user accounts (phone -> {name, idNumber, pin, fund})
- `balances` Map: Tracks account balances (phone -> number)
- `transactions` Map: Transaction history (phone -> array of transactions)
- `FUNDS` Object: Available investment fund types

#### Business Logic Functions
- `handleCreateAccount()`: Multi-step account creation with validation
- `handleInvest()`: Investment processing with PIN verification
- `handleWithdraw()`: Withdrawal processing with balance checks
- `handleCheckBalance()`: Balance inquiry with PIN auth
- `handleTrackAccount()`: Account summary with recent transactions

#### Utility Functions
- `requireExistingUser()`: User existence validation
- `toK()`: Kenyan currency formatting
- `welcomeMenu()`: Main menu generation
- `fundMenu()`: Fund selection menu

### USSD Flow Pattern
All interactions follow the USSD continuation pattern:
- `CON` prefix: Continue session, expect more input
- `END` prefix: Terminate session, show final message
- Input parsing via `*` delimiter (e.g., `1*1*Jane Doe*0712345678`)

### Request/Response Flow
1. USSD gateway POSTs to `/ussd` endpoint
2. Extract `sessionId`, `serviceCode`, `phoneNumber`, `text` from form data
3. Parse `text` into parts using `*` delimiter
4. Route to appropriate handler based on first part (menu choice)
5. Each handler manages multi-step flows through part length analysis
6. Return formatted response with `CON` or `END` prefix

## Key Development Patterns

### State Management
Since USSD is stateless, all state is managed through the `text` parameter which accumulates user inputs separated by `*`. Each handler function analyzes the parts array length to determine the current step.

### Input Validation
- Phone numbers: 10 digits starting with 0
- ID numbers: Minimum 6 digits
- PINs: Exactly 4 digits
- Names: Minimum 2 characters
- Amounts: Positive numbers only

### Error Handling
The application uses a consistent error pattern:
- Invalid inputs trigger `CON` responses with error messages
- Authentication failures return `END Invalid PIN`
- System errors are caught and return generic `END` messages

### Data Operations
- All account operations are keyed by phone number
- Transactions are stored with timestamps and limited to 20 recent entries
- Balance operations are atomic (get/set pattern)

## Production Considerations

When adapting this code for production:
1. Replace in-memory Maps with persistent database storage
2. Add proper logging and monitoring
3. Implement secure PIN hashing (currently plain text)
4. Add transaction idempotency to prevent duplicate operations
5. Implement proper session management if required by USSD gateway
6. Add comprehensive input sanitization and rate limiting
7. Consider adding automated tests for USSD flows

## Testing Strategy

Since there are no automated tests, when adding features:
1. Test the complete USSD flow manually using curl commands
2. Verify both success and error scenarios
3. Test with different phone numbers to ensure proper user isolation
4. Validate input edge cases (empty strings, special characters, etc.)
5. Test session continuity through multi-step flows