import asyncio
import json
import os
import sys

from fastvm import FastVM


def to_jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]

    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}

    attributes = {}
    for name in dir(value):
        if name.startswith("_"):
            continue
        attr = getattr(value, name)
        if callable(attr):
            continue
        attributes[name] = to_jsonable(attr)

    return attributes


async def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        async with FastVM(
            api_key=os.environ.get("FASTVM_API_KEY"),
        ) as client:
            action = payload["action"]

            if action == "launch":
                machine = await client.launch(
                    machine=payload.get("machine", "c1m2"),
                    name=payload.get("name"),
                )
                print(json.dumps({"ok": True, "machine": to_jsonable(machine)}))
                return

            if action == "restore":
                machine = await client.restore(
                    payload["snapshot"],
                    name=payload.get("name"),
                )
                print(json.dumps({"ok": True, "machine": to_jsonable(machine)}))
                return

            if action == "run":
                result = await client.run(
                    payload["vm"],
                    payload["command"],
                    timeout_sec=payload.get("timeoutSec"),
                )
                print(json.dumps({"ok": True, "result": to_jsonable(result)}))
                return

            if action == "snapshot":
                snapshot = await client.snapshot(
                    payload["vm"],
                    name=payload.get("name", ""),
                )
                print(json.dumps({"ok": True, "snapshot": to_jsonable(snapshot)}))
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
                            "snapshots": [to_jsonable(snapshot) for snapshot in snapshots],
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
