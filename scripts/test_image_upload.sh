#!/usr/bin/env bash
# Test image upload API end-to-end.
# Requires: stack running (make up), valid auth cookie or auth bypass for testing.
#
# Usage:
#   1. Sign up / log in at http://localhost:3000
#   2. Create a page, copy its node ID from the URL: /workspace/<nodeId>
#   3. Run: ./scripts/test_image_upload.sh <nodeId>
#
# Or use curl with session cookie from browser DevTools.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
NODE_ID="${1:-$NODE_ID}"
COOKIE_FILE="${COOKIE_FILE:-}"

if [ -z "$NODE_ID" ]; then
  echo "Usage: $0 <nodeId>"
  echo "  Create a page at ${BASE_URL}, then pass its node ID from the URL."
  exit 1
fi

# Create a tiny 1x1 PNG (valid image file)
TMP_IMG=$(mktemp).png
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$TMP_IMG"

CURL_OPTS=(-s -w "\n%{http_code}" -X POST "${BASE_URL}/api/files")
CURL_OPTS+=(-F "file=@${TMP_IMG};type=image/png" -F "nodeId=${NODE_ID}")

if [ -n "$COOKIE_FILE" ] && [ -f "$COOKIE_FILE" ]; then
  CURL_OPTS+=(-b "$COOKIE_FILE")
fi

echo "Uploading test image to node ${NODE_ID}..."
OUT=$(curl "${CURL_OPTS[@]}")
HTTP_BODY=$(echo "$OUT" | head -n -1)
HTTP_CODE=$(echo "$OUT" | tail -1)

rm -f "$TMP_IMG"

if [ "$HTTP_CODE" = "401" ]; then
  echo "FAIL: Unauthorized. Log in at ${BASE_URL} and pass cookies via COOKIE_FILE or copy cookie from DevTools."
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: HTTP $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi

URL=$(echo "$HTTP_BODY" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
if [ -z "$URL" ]; then
  echo "FAIL: No url in response"
  echo "$HTTP_BODY"
  exit 1
fi

echo "PASS: Uploaded. URL: $URL"
echo "  Verify: curl -I ${BASE_URL}${URL} (with auth cookie)"
