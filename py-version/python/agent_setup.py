from __future__ import annotations

import threading
from datetime import datetime

from agents import Agent, function_tool
from agents.tool import WebSearchTool


def parse_iso_datetime(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@function_tool
def schedule_alarm(time_iso: str, label: str) -> str:
    """Schedule a virtual alarm at a specific ISO datetime."""
    target = parse_iso_datetime(time_iso)
    if target is None:
        return f"Could not parse alarm time: {time_iso}"

    now = datetime.now(target.tzinfo)
    delay = (target - now).total_seconds()
    if delay <= 0:
        return f"Alarm time is in the past: {time_iso}"

    def fire_alarm() -> None:
        print(f"[ALARM] {label} ({time_iso})", flush=True)

    timer = threading.Timer(delay, fire_alarm)
    timer.start()
    return f"Alarm set for {time_iso} — {label}"


def build_agent() -> Agent:
    return Agent(
        name="Alarm Assistant",
        instructions=(
            "You are a CLI assistant that schedules virtual alarms and confirms them. "
            "When a request requires up-to-date info (events, schedules), use web_search "
            "and extract a specific datetime. "
            "If the user gives a specific time, convert it to ISO and call schedule_alarm. "
            "If the date/time is ambiguous, ask a short follow-up question."
        ),
        tools=[WebSearchTool(), schedule_alarm],
    )
