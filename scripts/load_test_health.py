#!/usr/bin/env python3
"""Phase 4 — light load probe against /health (no auth).

Usage:
  python scripts/load_test_health.py --base http://localhost:8000 --n 50 --concurrency 10
"""

from __future__ import annotations

import argparse
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def one(url: str, timeout: float) -> tuple[bool, float]:
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            ok = 200 <= resp.status < 300
    except Exception:
        ok = False
    return ok, (time.perf_counter() - t0) * 1000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--path", default="/health")
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--timeout", type=float, default=5.0)
    args = ap.parse_args()
    url = args.base.rstrip("/") + args.path

    latencies: list[float] = []
    ok_n = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(one, url, args.timeout) for _ in range(args.n)]
        for f in as_completed(futs):
            ok, ms = f.result()
            if ok:
                ok_n += 1
            latencies.append(ms)

    latencies.sort()
    p95 = latencies[int(0.95 * (len(latencies) - 1))] if latencies else 0
    print(
        f"url={url} n={args.n} ok={ok_n}/{args.n} "
        f"avg_ms={statistics.mean(latencies):.1f} p95_ms={p95:.1f} "
        f"max_ms={max(latencies):.1f}"
    )
    return 0 if ok_n == args.n else 1


if __name__ == "__main__":
    raise SystemExit(main())
