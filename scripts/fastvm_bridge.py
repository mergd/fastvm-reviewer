import asyncio
import json
import os
import sys

from fastvm import FastVM


async def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        async with FastVM(
            api_key=os.environ.get("FASTVM_API_KEY"),
            base_url=os.environ.get("FASTVM_BASE_URL", "https://api.fastvm.org"),
        ) as client:
            action = payload["action"]

            if action == "launch":
                machine = await client.launch(
                    machine=payload.get("machine", "c1m2"),
                    name=payload.get("name"),
                )
                print(json.dumps({"ok": True, "machine": machine.__dict__}))
                return

            if action == "restore":
                machine = await client.restore(
                    payload["snapshot"],
                    name=payload.get("name"),
                )
                print(json.dumps({"ok": True, "machine": machine.__dict__}))
                return

            if action == "run":
                result = await client.run(
                    payload["vm"],
                    payload["command"],
                    timeout_sec=payload.get("timeoutSec"),
                )
                print(json.dumps({"ok": True, "result": result.__dict__}))
                return

            if action == "snapshot":
                snapshot = await client.snapshot(
                    payload["vm"],
                    name=payload.get("name", ""),
                )
                print(json.dumps({"ok": True, "snapshot": snapshot.__dict__}))
                return

            if action == "remove":
                await client.remove(payload["vm"])
                print(json.dumps({"ok": True}))
                return

            if action == "remove_snapshot":
                await client.remove_snapshot(payload["snapshot"])
                print(json.dumps({"ok": True}))
                return

            if action == "list_snapshots":
                snapshots = await client.list_snapshots()
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "snapshots": [snapshot.__dict__ for snapshot in snapshots],
                        }
                    )
                )
                return

            raise ValueError(f"Unsupported action: {action}")
    except Exception as error:  # pragma: no cover - bridge path
        print(json.dumps({"ok": False, "error": str(error)}))
        raise


if __name__ == "__main__":
    asyncio.run(main())
