#!/usr/bin/env python3
"""Phase 4 — open N WebSocket connections briefly (needs websockets lib optional).

Usage:
  pip install websockets
  python scripts/load_test_ws_ping.py --url ws://localhost:8000/api/v1/guardian/ws --n 5
"""

from __future__ import annotations

import argparse
import asyncio
import time


async def one(url: str, token: str, hold: float) -> tuple[bool, float]:
    try:
        import websockets
    except ImportError:
        return False, 0.0
    t0 = time.perf_counter()
    try:
        u = url
        if token and "token=" not in url:
            sep = "&" if "?" in url else "?"
            u = f"{url}{sep}token={token}"
        async with websockets.connect(u, open_timeout=10) as ws:
            await asyncio.sleep(hold)
            await ws.close()
        return True, (time.perf_counter() - t0) * 1000
    except Exception:
        return False, (time.perf_counter() - t0) * 1000


async def run(url: str, n: int, token: str, hold: float) -> int:
    results = await asyncio.gather(*[one(url, token, hold) for _ in range(n)])
    ok = sum(1 for o, _ in results if o)
    ms = [m for _, m in results]
    print(f"ws n={n} ok={ok}/{n} avg_ms={sum(ms)/len(ms):.0f} max_ms={max(ms):.0f}")
    return 0 if ok == n else 1


def main() -> int:
    import os
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8000/api/v1/guardian/ws")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--hold", type=float, default=0.5)
    ap.add_argument("--token", default=os.getenv("TOKEN", ""))
    args = ap.parse_args()
    return asyncio.run(run(args.url, args.n, args.token, args.hold))


if __name__ == "__main__":
    raise SystemExit(main())
