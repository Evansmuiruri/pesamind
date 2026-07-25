#!/bin/bash

# Complete test suite for all 4 modules
BASE_URL="${API_URL:-http://localhost:5000/api}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
PASSED=0
FAILED=0

echo "🐄 Pesa Mind - Complete Module Tests"
echo "========================================"
echo "Base URL: $BASE_URL"
echo ""

# ============================================
# 1. AUTHENTICATION TESTS
# ============================================
echo -e "${BLUE}📋 AUTHENTICATION TESTS${NC}"
echo "----------------------------------------"

echo -n "Test 1: Register new user... "
RANDOM_EMAIL="test_$(date +%s)@example.com"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123!\"}")
if echo "$REGISTER_RESPONSE" | grep -q "token"; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

echo -n "Test 2: Login... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123!\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Skipping remaining tests (no token)${NC}"
  exit 1
fi

echo ""

# ============================================
# 2. PERSONAL FINANCE TESTS
# ============================================
echo -e "${BLUE}💰 PERSONAL FINANCE TESTS${NC}"
echo "----------------------------------------"

echo -n "Test 3: Parse SMS (sent)... "
PARSE=$(curl -s -X POST "$BASE_URL/transactions/parse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Confirmed. Ksh 1,500 sent to Naivas Supermarket on 10/07/2026"}')
if echo "$PARSE" | grep -q "success"; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

echo -n "Test 4: Get transactions... "
TX=$(curl -s -X GET "$BASE_URL/transactions" \
  -H "Authorization: Bearer $TOKEN")
if echo "$TX" | grep -q "transactions"; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

echo -n "Test 5: Get summary... "
SUMMARY=$(curl -s -X GET "$BASE_URL/transactions/summary?period=month" \
  -H "Authorization: Bearer $TOKEN")
if echo "$SUMMARY" | grep -q "summary"; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

echo -n "Test 6: Get insights... "
INSIGHTS=$(curl -s -X GET "$BASE_URL/insights?period=month" \
  -H "Authorization: Bearer $TOKEN")
if echo "$INSIGHTS" | grep -q "insights"; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

echo ""

# ============================================
# 3. BUSINESS MODULE TESTS
# ============================================
echo -e "${BLUE}🏢 BUSINESS MODULE TESTS${NC}"
echo "----------------------------------------"

echo -n "Test 7: Create business... "
BUSINESS=$(curl -s -X POST "$BASE_URL/business" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Business","type":"retail","location":"Nakuru"}')
BUSINESS_ID=$(echo "$BUSINESS" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ -n "$BUSINESS_ID" ]; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

if [ -n "$BUSINESS_ID" ]; then
  echo -n "Test 8: Add business transaction... "
  BIZ_TX=$(curl -s -X POST "$BASE_URL/business/$BUSINESS_ID/transactions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"type\":\"income\",\"amount\":10000,\"counterparty\":\"Test Client\",\"category\":\"Sales\"}")
  if echo "$BIZ_TX" | grep -q "success"; then
    echo -e "${GREEN}✅ PASSED${NC}"
    PASSED=$((PASSED+1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED=$((FAILED+1))
  fi
else
  echo -e "${YELLOW}⚠️  Skipping test 8 (no business ID)${NC}"
fi

echo ""

# ============================================
# 4. AGRICULTURE MODULE TESTS
# ============================================
echo -e "${BLUE}🌾 AGRICULTURE MODULE TESTS${NC}"
echo "----------------------------------------"

echo -n "Test 9: Create farm... "
FARM=$(curl -s -X POST "$BASE_URL/agriculture/farms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Farm","location":"Njoro","size":10,"crop_type":"Maize"}')
FARM_ID=$(echo "$FARM" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ -n "$FARM_ID" ]; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

if [ -n "$FARM_ID" ]; then
  echo -n "Test 10: Create season... "
  SEASON=$(curl -s -X POST "$BASE_URL/agriculture/farms/$FARM_ID/seasons" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test Season","start_date":"2026-03-01","crop_type":"Maize"}')
  SEASON_ID=$(echo "$SEASON" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  if [ -n "$SEASON_ID" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    PASSED=$((PASSED+1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED=$((FAILED+1))
  fi
else
  echo -e "${YELLOW}⚠️  Skipping test 10 (no farm ID)${NC}"
fi

echo ""

# ============================================
# 5. DAIRY MODULE TESTS
# ============================================
echo -e "${BLUE}🐄 DAIRY MODULE TESTS${NC}"
echo "----------------------------------------"

echo -n "Test 11: Create animal... "
ANIMAL=$(curl -s -X POST "$BASE_URL/dairy/animals" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tag_id":"TEST001","name":"Test Cow","breed":"Friesian","gender":"female"}')
ANIMAL_ID=$(echo "$ANIMAL" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ -n "$ANIMAL_ID" ]; then
  echo -e "${GREEN}✅ PASSED${NC}"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAILED=$((FAILED+1))
fi

if [ -n "$ANIMAL_ID" ]; then
  echo -n "Test 12: Add milk production... "
  MILK=$(curl -s -X POST "$BASE_URL/dairy/animals/$ANIMAL_ID/milk" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"date":"2026-07-10","morning_yield":12.5,"evening_yield":10.2}')
  if echo "$MILK" | grep -q "success"; then
    echo -e "${GREEN}✅ PASSED${NC}"
    PASSED=$((PASSED+1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED=$((FAILED+1))
  fi
else
  echo -e "${YELLOW}⚠️  Skipping test 12 (no animal ID)${NC}"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${BLUE}📊 TEST SUMMARY${NC}"
echo "========================================"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo "Total: $((PASSED+FAILED)) tests"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED! All 4 modules working!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Check the errors above.${NC}"
  exit 1
fi