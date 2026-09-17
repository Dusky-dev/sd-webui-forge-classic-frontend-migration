from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from modules.shared_cmd_options import cmd_opts


@dataclass
class Record:
    label: str
    seconds: float
    components: int | None = None


_records: list[Record] = []


def enabled() -> bool:
    return bool(getattr(cmd_opts, "log_ui_performance", False))


def reset() -> None:
    if enabled():
        _records.clear()


def start() -> float | None:
    return time.perf_counter() if enabled() else None


def component_count(value: Any) -> int | None:
    if value is None:
        return None

    blocks = getattr(value, "blocks", None)
    if blocks is not None:
        return len(blocks)

    if isinstance(value, (list, tuple)):
        counts = [component_count(item) for item in value]
        known_counts = [count for count in counts if count is not None]
        return sum(known_counts) if known_counts else None

    # A component returned directly from an extension Script.ui().
    if hasattr(value, "get_block_name"):
        return 1

    return None


def record(label: str, started: float | None, value: Any = None, *, components: int | None = None) -> None:
    if started is None:
        return

    if components is None:
        components = component_count(value)

    _records.append(Record(label, time.perf_counter() - started, components))


def source_label(filename: str) -> str:
    path = Path(filename)
    parts = path.parts

    for marker in ("extensions", "extensions-builtin"):
        if marker in parts:
            index = parts.index(marker)
            return "/".join(parts[index:index + 3])

    return path.name


def report() -> None:
    if not enabled():
        return

    print("\n[Forge UI performance] Python UI construction (slowest first)")  # noqa: T201
    for entry in sorted(_records, key=lambda item: item.seconds, reverse=True):
        component_text = "" if entry.components is None else f", {entry.components} components"
        print(f"  {entry.seconds * 1000:8.1f} ms  {entry.label}{component_text}")  # noqa: T201
    print("[Forge UI performance] Browser metrics will be printed in the browser console.\n")  # noqa: T201
