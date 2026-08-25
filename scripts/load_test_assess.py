#!/usr/bin/env python3
"""Phase 4 — sequential assess latency probe (needs JWT).

Usage:
  export TOKEN=...
  python scripts/load_test_assess.py --base http://localhost:8000 --n 10
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
import urllib.error
import urllib.request


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--path", default="/api/v1/transactions/assess")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--token", default=os.getenv("TOKEN", ""))
    args = ap.parse_args()
    if not args.token:
        print("TOKEN env or --token required")
        return 2

    url = args.base.rstrip("/") + args.path
    body = json.dumps(
        {
            "amount": 500000,
            "currency": "VND",
            "payee_account": "00000006878",
            "payee_name": "Load Test",
            "bank_code": "VCB",
            "note": "phase4 load probe",
        }
    ).encode()

    lat: list[float] = []
    ok = 0
    for i in range(args.n):
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Authorization": f"Bearer {args.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                if 200 <= resp.status < 300:
                    ok += 1
                    _ = resp.read()
        except Exception as e:
            print(f"#{i} fail: {e}")
        lat.append((time.perf_counter() - t0) * 1000)

    lat.sort()
    p95 = lat[int(0.95 * (len(lat) - 1))] if lat else 0
    print(
        f"assess n={args.n} ok={ok}/{args.n} "
        f"avg_ms={statistics.mean(lat):.0f} p95_ms={p95:.0f} max_ms={max(lat):.0f}"
    )
    return 0 if ok == args.n else 1


if __name__ == "__main__":
    raise SystemExit(main())
