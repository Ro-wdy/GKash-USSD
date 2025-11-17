#!/bin/bash

# Security Check Script - Verifies no sensitive data will be pushed
# Usage: bash check-security.sh

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     🔒 GKASH USSD - SECURITY CHECK BEFORE PUSH                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"

FAILED=0

echo -e "\n📋 Running security checks...\n"

# Check 1: .env file is not staged
echo "[1/6] Checking .env files are not staged..."
if git diff --cached --name-only | grep -q "\.env$"; then
    echo "  ❌ FAILED: .env file is staged for commit!"
    echo "     Run: git reset HEAD .env"
    FAILED=1
else
    echo "  ✅ PASSED: No .env files staged"
fi

# Check 2: No API keys in staged files
echo -e "\n[2/6] Checking for API keys (JWT pattern)..."
if git diff --cached | grep -q "eyJhbGc"; then
    echo "  ❌ FAILED: JWT/API key pattern found in staged files!"
    FAILED=1
else
    echo "  ✅ PASSED: No JWT patterns found"
fi

# Check 3: No Bearer tokens
echo -e "\n[3/6] Checking for Bearer tokens..."
if git diff --cached | grep -i "bearer"; then
    echo "  ❌ FAILED: Bearer token pattern found!"
    FAILED=1
else
    echo "  ✅ PASSED: No Bearer tokens found"
fi

# Check 4: No common secret patterns
echo -e "\n[4/6] Checking for common secret patterns..."
if git diff --cached | grep -E "sk_|pk_|secret|password" | grep -i "eyJ\|http\|api"; then
    echo "  ⚠️  WARNING: Possible secret patterns detected"
    echo "     Review: git diff --cached | grep -E 'sk_|pk_|secret'"
else
    echo "  ✅ PASSED: No obvious secret patterns"
fi

# Check 5: Verify .env.example exists
echo -e "\n[5/6] Checking .env.example template exists..."
if [ -f "TiaraConnect/.env.example" ]; then
    echo "  ✅ PASSED: .env.example template found"
else
    echo "  ❌ FAILED: .env.example template missing!"
    FAILED=1
fi

# Check 6: Verify tiaraService.js uses env vars
echo -e "\n[6/6] Checking tiaraService.js uses environment variables..."
if grep -q "process.env.TIARA_API_KEY" TiaraConnect/tiaraService.js; then
    echo "  ✅ PASSED: Using process.env for API key"
else
    echo "  ⚠️  WARNING: Check if tiaraService.js properly uses env vars"
fi

# Final summary
echo -e "\n╔════════════════════════════════════════════════════════════════╗"

if [ $FAILED -eq 0 ]; then
    echo "║     ✅ ALL SECURITY CHECKS PASSED - SAFE TO PUSH              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "\n🚀 You can safely push with:\n"
    echo "   git push origin main\n"
    exit 0
else
    echo "║     ❌ SECURITY CHECKS FAILED - DO NOT PUSH YET               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "\n⚠️  Please fix the issues above before pushing.\n"
    exit 1
fi
