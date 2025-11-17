# Gkash USSD Complete Flow Diagram

## Main Menu Flow

```
┌─────────────────────────────────────┐
│  User dials: *710*56789#            │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │  Welcome to Gkash        │
    │  1. Create account       │
    │  2. Invest               │
    │  3. Withdraw             │
    │  4. Check balance        │
    │  5. Track account        │
    └──────────────────────────┘
            │ │ │ │ │
    ┌───────┘ │ │ │ └────────────┬──────────────┬────────────┐
    │         │ │ │              │              │            │
    ▼         ▼ ▼ ▼              ▼              ▼            ▼

  Option 1  Option 2  Option 3  Option 4  Option 5
  (Account) (Invest) (Withdraw) (Balance) (Track)
```

---

## Option 1: Create Account - Complete Flow

```
┌─────────────────────┐
│ 1 - Create Account  │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────────┐
    │ Select fund type │
    │ 1. Money Market  │
    │ 2. Fixed Income  │
    │ 3. Balanced      │
    │ 4. Stock Market  │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Enter your full  │
    │ name             │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Enter ID number  │
    │ (6+ digits)      │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Create a 4-digit │
    │ PIN              │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ OTP sent to your │
    │ phone.           │
    │ Enter 6-digit    │
    │ code             │
    └────────┬─────────┘
             │
             ▼
        ┌────────────────────────────┐
        │ ✅ Account Created!        │
        │ Welcome SMS sent           │
        │                            │
        │ Welcome to Gkash           │
        │ 1. Create account          │
        │ 2. Invest                  │
        │ 3. Withdraw                │
        │ 4. Check balance           │
        │ 5. Track account           │
        └────────────────────────────┘
                     │
                     └─→ (Return to Menu)
```

---

## Option 2: Invest - Complete Flow

```
┌──────────────┐
│ 2 - Invest   │
└──────┬───────┘
       │
       ▼
   ┌────────────────────┐
   │ Enter amount to    │
   │ invest (KES)       │
   │ e.g., 5000         │
   └────────┬───────────┘
            │
            ▼
   ┌────────────────────┐
   │ Enter your PIN     │
   │ e.g., 1234         │
   └────────┬───────────┘
            │
            ▼
   ┌────────────────────────────────────┐
   │ Validate PIN + Process             │
   │ Update balance                     │
   │ Send SMS notification              │
   └────────┬─────────────────────────────┘
            │
            ├─→ ✅ Success
            │   │
            │   ▼
            │  ┌──────────────────────────────┐
            │  │ Investment of KES 5,000 into │
            │  │ Money Market Fund successful │
            │  │ New balance: KES 4,500       │
            │  │ SMS confirmation sent        │
            │  │                              │
            │  │ Welcome to Gkash             │
            │  │ 1. Create account            │
            │  │ 2. Invest                    │
            │  │ 3. Withdraw                  │
            │  │ 4. Check balance             │
            │  │ 5. Track account             │
            │  └──────────────┬───────────────┘
            │                 │
            │                 └─→ (Return to Menu)
            │
            └─→ ❌ Invalid PIN
                │
                ▼
            "END Invalid PIN"
            (Session ends)
```

---

## Option 3: Withdraw - Complete Flow

```
┌─────────────────┐
│ 3 - Withdraw    │
└────────┬────────┘
         │
         ▼
   ┌──────────────────────┐
   │ Enter amount to      │
   │ withdraw (KES)       │
   │ e.g., 2000           │
   └────────┬─────────────┘
            │
            ▼
   ┌──────────────────┐
   │ Enter your PIN   │
   │ e.g., 1234       │
   └────────┬─────────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ Validate PIN + Check Balance   │
   │ Process withdrawal             │
   │ Send SMS notification          │
   └────────┬───────────────────────┘
            │
            ├─→ ✅ Success
            │   │
            │   ▼
            │  ┌──────────────────────────────┐
            │  │ Withdrawal of KES 2,000      │
            │  │ successful.                  │
            │  │ New balance: KES 2,500       │
            │  │ SMS confirmation sent        │
            │  │                              │
            │  │ Welcome to Gkash             │
            │  │ 1. Create account            │
            │  │ 2. Invest                    │
            │  │ 3. Withdraw                  │
            │  │ 4. Check balance             │
            │  │ 5. Track account             │
            │  └──────────────┬───────────────┘
            │                 │
            │                 └─→ (Return to Menu)
            │
            ├─→ ❌ Insufficient Balance
            │   │
            │   ▼
            │  "END Insufficient balance..."
            │
            └─→ ❌ Invalid PIN
                │
                ▼
            "END Invalid PIN"
```

---

## Option 4: Check Balance - Complete Flow

```
┌──────────────────────┐
│ 4 - Check Balance    │
└────────┬─────────────┘
         │
         ▼
   ┌──────────────────┐
   │ Enter your PIN   │
   │ e.g., 1234       │
   └────────┬─────────┘
            │
            ▼
   ┌─────────────────────┐
   │ Retrieve balance    │
   └────────┬────────────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ ✅ Current Balance:            │
   │    KES 4,500                   │
   │                                │
   │ Welcome to Gkash               │
   │ 1. Create account              │
   │ 2. Invest                      │
   │ 3. Withdraw                    │
   │ 4. Check balance               │
   │ 5. Track account               │
   └────────┬───────────────────────┘
            │
            └─→ (Return to Menu)
```

---

## Option 5: Track Account - Complete Flow

```
┌─────────────────────┐
│ 5 - Track Account   │
└────────┬────────────┘
         │
         ▼
   ┌──────────────────┐
   │ Enter your PIN   │
   │ e.g., 1234       │
   └────────┬─────────┘
            │
            ▼
   ┌────────────────────────────────────┐
   │ Retrieve account info              │
   │ Fetch recent transactions          │
   └────────┬───────────────────────────┘
            │
            ▼
   ┌────────────────────────────────────┐
   │ Account: John Doe                  │
   │ Fund: Money Market Fund            │
   │ Balance: KES 4,500                 │
   │                                    │
   │ Recent:                            │
   │ 1. INVEST KES 5,000               │
   │ 2. ACCOUNT_CREATED                │
   │                                    │
   │ Welcome to Gkash                   │
   │ 1. Create account                  │
   │ 2. Invest                          │
   │ 3. Withdraw                        │
   │ 4. Check balance                   │
   │ 5. Track account                   │
   └────────┬───────────────────────────┘
            │
            └─→ (Return to Menu)
```

---

## User Journey Example

```
User's Phone                          Gkash USSD Server
     │                                     │
     │──── Dial *710*56789# ───────→      │
     │                               Show Welcome Menu
     │←──── Welcome Menu Response ───────│
     │                                     │
     │──── Press 1 + Send ───────→        │
     │     (*710*56789*1#)           Process Create Account
     │                               Show Fund Selection
     │←──── Fund Menu ────────────────────│
     │                                     │
     │──── Select Fund 1 ───────→         │
     │     (*710*56789*1*1#)          Ask for Name
     │                                     │
     │←──── "Enter your full name" ──────│
     │                                     │
     │──── Type "John Doe" ───────→       │
     │     (*710*56789*1*1*John Doe#) Ask for ID
     │                                     │
     │←──── "Enter ID number" ────────────│
     │                                     │
     │──── Type "123456" ───────→         │
     │     (*710*56789*1*1*John Doe*123456#)
     │                               Ask for PIN
     │←──── "Create 4-digit PIN" ────────│
     │                                     │
     │──── Type "1234" ───────→           │
     │     (*710*56789*1*1*John Doe*123456*1234#)
     │                               Send OTP via SMS
     │←──── "OTP sent" ───────────────────│
     │                                     │
     │──── (Receive SMS with OTP) ──→     │
     │──── Type "123456" ───────→         │
     │     (*710*56789*1*1*John Doe*123456*1234*123456#)
     │                               ✅ Create Account
     │                               Send Welcome SMS
     │←──── Account Created + Menu ──────│
     │                                     │
     │──── Press 2 (Invest) ───────→      │
     │                               Ask for Amount
     │←──── "Enter amount" ───────────────│
     │                                     │
     │──── Type "5000" ───────→           │
     │                               Ask for PIN
     │←──── "Enter PIN" ──────────────────│
     │                                     │
     │──── Type "1234" ───────→           │
     │                               ✅ Process Investment
     │                               Send Confirmation SMS
     │←──── Success + Menu ───────────────│
     │                                     │
     │──── User can continue or exit ──→  │
```

---

## Key Points

✅ **All options work end-to-end**
✅ **After any transaction, user returns to menu**
✅ **User can continue with more transactions**
✅ **Session continues until explicitly ended**
✅ **SMS notifications sent for all transactions**
