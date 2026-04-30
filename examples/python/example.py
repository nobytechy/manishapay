"""ManishaPay — Python example.

Run:
    API_KEY=mp_test_xxx python example.py

Requires: requests (`pip install requests`).
"""
import os
import sys
import time
import requests

API_BASE = os.environ.get("API_BASE", "https://api.manishapay.dev")
API_KEY = os.environ.get("API_KEY")

if not API_KEY:
    sys.exit("Set API_KEY=mp_test_xxx first.")


def pay():
    payload = {
        "reference": f"INV-{int(time.time())}",
        "amount": "10.00",
        "description": "Pro plan",
        "email": "buyer@test.com",
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-Request-Id": f"py-{int(time.time())}",
    }
    r = requests.post(f"{API_BASE}/v1/pay", json=payload, headers=headers, timeout=15)
    if r.status_code >= 400:
        print("ManishaPay error:", r.json().get("error", r.text))
        return
    body = r.json()
    print("Browser URL:", body["data"].get("browser_url"))
    print("Reference  :", body["data"].get("reference"))
    print("Trace      :", body.get("requestId"))


if __name__ == "__main__":
    pay()
