#!/usr/bin/env python3
"""
E2E test: sign up, sign in, create page, upload image.
Usage: BASE_URL=http://localhost:3000 python scripts/test_image_upload_e2e.py
"""

import json
import os
import sys
import uuid
import urllib.request
import urllib.error
import http.cookiejar

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
EMAIL = f"test-{uuid.uuid4().hex[:8]}@example.com"
PASSWORD = "TestPass123!"

# Tiny valid 1x1 PNG
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f"
    b"\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def main():
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    def req(method, path, body=None, content_type="application/json"):
        url = f"{BASE_URL}{path}"
        data = json.dumps(body).encode() if body and content_type == "application/json" else body
        req_obj = urllib.request.Request(url, data=data, method=method)
        req_obj.add_header("Content-Type", content_type)
        try:
            r = opener.open(req_obj)
            return r.getcode(), r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    print(f"1. Sign up {EMAIL}...")
    code, _ = req("POST", "/api/auth/signup", {"email": EMAIL, "password": PASSWORD})
    if code != 201:
        print(f"   FAIL: signup returned {code}")
        return 1

    print("2. Get CSRF token...")
    code, body = req("GET", "/api/auth/csrf")
    if code != 200:
        print(f"   FAIL: csrf returned {code}")
        return 1
    csrf = json.loads(body).get("csrfToken") or json.loads(body).get("token", "")

    print("3. Sign in...")
    form = f"csrfToken={csrf}&email={EMAIL}&password={PASSWORD}&json=true"
    req_obj = urllib.request.Request(f"{BASE_URL}/api/auth/callback/credentials", data=form.encode(), method="POST")
    req_obj.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        r = opener.open(req_obj)
        code, body = r.getcode(), r.read().decode()
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode()
    if code not in (200, 302):
        print(f"   FAIL: signin returned {code}: {body[:200]}")
        return 1

    print("4. Create page node...")
    code, body = req("POST", "/api/nodes", {"type": "page", "title": "E2E Test Page"})
    if code != 200:
        print(f"   FAIL: create node returned {code}: {body[:200]}")
        return 1
    node_id = json.loads(body).get("id")
    if not node_id:
        print(f"   FAIL: no id in response")
        return 1

    print(f"5. Upload image to node {node_id}...")
    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    upload_body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.png\"\r\n"
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + PNG_BYTES + (
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"nodeId\"\r\n\r\n"
        f"{node_id}\r\n--{boundary}--\r\n"
    ).encode()
    req_obj = urllib.request.Request(f"{BASE_URL}/api/files", data=upload_body, method="POST")
    req_obj.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        r = opener.open(req_obj)
        code, body = r.getcode(), r.read().decode()
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode()
    if code != 200:
        print(f"   FAIL: upload returned {code}: {body[:300]}")
        return 1
    url = json.loads(body).get("url")
    if not url:
        print(f"   FAIL: no url in response: {body[:200]}")
        return 1

    print(f"   PASS: uploaded, url={url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
