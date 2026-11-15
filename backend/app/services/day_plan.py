"""The morning day plan: today's tasks laid out in time around the prayers, the timed things and the energy WHOOP reports.

Two ways to build it, with the same shape out:
- rules (`draft`): no AI and nothing sent anywhere. Fixed things keep their times; the open tasks of today and the
  overdue ones go into the free gaps, most important first, fewer and shorter when recovery is low.
- the user's own AI (`from_ai`): it gets the same facts (titles, times and priorities only: never notes or ids) and
  answers with blocks that point at tasks by a short ref ("t1"). Only what checks out is kept: a task title always comes
  from the database, never from the AI, and a block that runs into a prayer or another block is dropped. If nothing
  usable is left, the rules plan is used.

Prayer times come from the phone, which works them out from its own location; the server never sees the location.
Times are the user's local wall clock as "HH:MM", in the zone saved on their profile (the same one the brief uses).
"""

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlannedWorkout, Reminder, Task, Workout
from app.services import sections, whoop_analytics, workout_plan

PRAYERS = ("fajr", "dhuhr", "asr", "maghrib", "isha")
PRAYER_MINUTES = 20
REMINDER_MINUTES = 15
APPOINTMENT_MINUTES = 30
TASK_MINUTES = {"high": 60, "normal": 45, "low": 30}
# Low energy: every task gets at most this long, and a short break follows it.
LOW_TASK_MINUTES = 30
BREAK_MINUTES = 15
WORKOUT_MINUTES = {"light": 40}
WORKOUT_DEFAULT = 60
# The plan starts no earlier than this and ends at DAY_END; anything that does not fit is counted as left out.
DAY_START = 6 * 60
DAY_END = 23 * 60
STEP = 15
# Most tasks laid out in a day, by energy (None: no WHOOP today, treated as medium).
TASK_CAP = {"high": 6, "medium": 4, "low": 2}
TASK_LIMIT = 12
TEXT_MAX = 100
NOTE_WORDS = 40
BLOCK_LIMIT = 30
AI_KINDS = ("task", "workout", "break")
# The workout goes after this time when there is room (late afternoon), else wherever it fits.
WORKOUT_AFTER = 16 * 60
GREEN, YELLOW = 67, 34


@dataclass
class Block:
    start: int
    end: int
    kind: str  # prayer | reminder | appointment | task | workout | break
    title: str = ""
    task_id: uuid.UUID | None = None
    prayer: str | None = None
    priority: str | None = None
    workout_kind: str | None = None
    ref: str | None = None

    def overlaps(self, other: "Block") -> bool:
        return self.start < other.end and other.start < self.end

    def out(self) -> dict[str, Any]:
        return {
            "start": clock(self.start),
            "end": clock(self.end),
            "kind": self.kind,
            "title": self.title,
            "task_id": self.task_id,
            "prayer": self.prayer,
            "priority": self.priority,
            "workout_kind": self.workout_kind,
        }


@dataclass
class Facts:
    day: date
    start: int
    energy: dict[str, Any] | None
    fixed: list[Block]
    # Flexible tasks, most important first: (ref, task, minutes, latest end or None).
    tasks: list[tuple[str, Task, int, int | None]] = field(default_factory=list)
    workout: Block | None = None
    # The workout plan says rest today (recovery is red).
    rest_day: bool = False


def clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def minutes_of(value: str) -> int | None:
    match = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", value.strip()) if isinstance(value, str) else None
    return int(match[1]) * 60 + int(match[2]) if match else None


def _cut(text: str) -> str:
    return text if len(text) <= TEXT_MAX else text[: TEXT_MAX - 1] + "…"


def _local_minutes(moment: datetime, zone: ZoneInfo) -> int:
    local = moment.astimezone(zone)
    return local.hour * 60 + local.minute


def energy_level(recovery: float | None) -> str | None:
    if recovery is None:
        return None
    return "high" if recovery >= GREEN else "medium" if recovery >= YELLOW else "low"


def _energy(db: Session, user_id: uuid.UUID, day: date, hidden: frozenset[str]) -> dict[str, Any] | None:
    if "whoop" in hidden:
        return None
    latest = whoop_analytics.load_summary(db, user_id, today=day, days=2)["latest"]
    recovery = latest["recovery"]
    sleep = latest["sleep_hours"]
    # Only this morning's numbers: yesterday's recovery says nothing about how today feels.
    score = recovery["value"] if recovery and recovery["date"] == day.isoformat() else None
    hours = sleep["value"] if sleep and sleep["date"] >= (day - timedelta(days=1)).isoformat() else None
    if score is None and hours is None:
        return None
    return {"level": energy_level(score), "recovery": score, "sleep_hours": hours}


def gather(db: Session, user_id: uuid.UUID, zone: ZoneInfo, day: date, now: int, prayers: list[tuple[str, int]]) -> Facts:
    hidden = sections.hidden_for(db, user_id)
    start = max(DAY_START, -(-now // STEP) * STEP)
    begin = datetime.combine(day, time.min, zone)
    end = datetime.combine(day + timedelta(days=1), time.min, zone)

    fixed = [Block(at, at + PRAYER_MINUTES, "prayer", prayer=name) for name, at in prayers if at + PRAYER_MINUTES > start]

    for reminder in db.scalars(
        select(Reminder)
        .where(Reminder.user_id == user_id, Reminder.status == "scheduled", Reminder.remind_at >= begin, Reminder.remind_at < end)
        .order_by(Reminder.remind_at)
        .limit(TASK_LIMIT)
    ):
        # A reminder of a task shows once, as that task.
        if reminder.task_id is not None:
            continue
        at = _local_minutes(reminder.remind_at, zone)
        if at + REMINDER_MINUTES > start:
            fixed.append(Block(at, min(at + REMINDER_MINUTES, 24 * 60), "reminder", title=_cut(reminder.title)))

    open_tasks = select(Task).where(Task.user_id == user_id, Task.status == "open")
    today = list(db.scalars(open_tasks.where(Task.due_at >= begin, Task.due_at < end).order_by(Task.due_at).limit(TASK_LIMIT)))
    late = list(db.scalars(open_tasks.where(Task.due_at < begin).order_by(Task.due_at.desc()).limit(max(0, TASK_LIMIT - len(today)))))
    energy = _energy(db, user_id, day, hidden)
    level = energy["level"] if energy else None
    flexible: list[tuple[Task, int, int | None]] = []
    for task in [*today, *late]:
        due = _local_minutes(task.due_at, zone) if task.due_at >= begin else None
        # A task with a reminder today has a set time: it is an appointment at its due time.
        if due is not None and task.reminder_at is not None and begin <= task.reminder_at < end:
            if due + APPOINTMENT_MINUTES > start:
                fixed.append(Block(due, min(due + APPOINTMENT_MINUTES, 24 * 60), "appointment", title=_cut(task.title), task_id=task.id))
            continue
        minutes = TASK_MINUTES.get(task.priority, TASK_MINUTES["normal"])
        if level == "low":
            minutes = min(minutes, LOW_TASK_MINUTES)
        # A due time later today is a deadline; midnight or one already past is not.
        flexible.append((task, minutes, due if due and due > start else None))
    rank = {"high": 0, "normal": 1, "low": 2}
    flexible.sort(key=lambda item: (rank.get(item[0].priority, 1), item[2] if item[2] is not None else 24 * 60))
    tasks = [(f"t{index + 1}", task, minutes, deadline) for index, (task, minutes, deadline) in enumerate(flexible)]

    workout, rest_day = None, False
    if "exercises" not in hidden:
        planned = db.scalar(select(PlannedWorkout).where(PlannedWorkout.user_id == user_id, PlannedWorkout.plan_date == day))
        done = planned is not None and planned.workout_id is not None and db.get(Workout, planned.workout_id) is not None
        if planned is not None and not done:
            adjustment = workout_plan.adjustment_for(energy["recovery"] if energy else None)
            if adjustment == "rest":
                rest_day = True
            else:
                length = WORKOUT_MINUTES.get(adjustment, WORKOUT_DEFAULT)
                workout = Block(0, length, "workout", workout_kind=planned.kind, ref="w1")

    fixed.sort(key=lambda block: block.start)
    return Facts(day=day, start=start, energy=energy, fixed=fixed, tasks=tasks, workout=workout, rest_day=rest_day)


def _gaps(taken: list[Block], start: int, end: int) -> list[tuple[int, int]]:
    gaps, cursor = [], start
    for block in sorted(taken, key=lambda item: item.start):
        if block.start > cursor:
            gaps.append((cursor, min(block.start, end)))
        cursor = max(cursor, block.end)
    if cursor < end:
        gaps.append((cursor, end))
    return [(a, b) for a, b in gaps if b > a]


def _place(taken: list[Block], start: int, minutes: int, latest: int | None, after: int | None = None) -> int | None:
    """The earliest start that fits `minutes` in a free gap (from `after` if it can, before `latest` if it must)."""
    for lower in [after, start] if after is not None and after > start else [start]:
        for a, b in _gaps(taken, lower, DAY_END):
            if b - a >= minutes and (latest is None or a + minutes <= latest):
                return a
    # A deadline that can't be met still gets a slot after it: late is better than missing from the plan.
    if latest is not None:
        return _place(taken, start, minutes, None, after)
    return None


def draft(facts: Facts) -> tuple[list[Block], int]:
    """(blocks, left out): the rules plan."""
    level = (facts.energy or {}).get("level") or "medium"
    blocks = list(facts.fixed)
    left = 0
    for index, (_, task, minutes, deadline) in enumerate(facts.tasks):
        if index >= TASK_CAP[level]:
            left += 1
            continue
        at = _place(blocks, facts.start, minutes, deadline)
        if at is None:
            left += 1
            continue
        blocks.append(Block(at, at + minutes, "task", title=_cut(task.title), task_id=task.id, priority=task.priority))
        if level == "low":
            pause = _place(blocks, at + minutes, BREAK_MINUTES, at + minutes + BREAK_MINUTES)
            if pause == at + minutes:
                blocks.append(Block(pause, pause + BREAK_MINUTES, "break"))
    if facts.workout is not None:
        length = facts.workout.end - facts.workout.start
        at = _place(blocks, facts.start, length, None, after=WORKOUT_AFTER)
        if at is not None:
            blocks.append(Block(at, at + length, "workout", workout_kind=facts.workout.workout_kind))
    blocks.sort(key=lambda block: block.start)
    return blocks, left


def context(facts: Facts) -> dict[str, Any]:
    """What the AI reads: titles, times and priorities. No ids, no notes."""
    return {
        "date": facts.day.isoformat(),
        "plan_from": clock(facts.start),
        "plan_until": clock(DAY_END),
        "energy": facts.energy,
        "fixed": [
            {"start": clock(b.start), "end": clock(b.end), "kind": b.kind, "title": b.prayer if b.kind == "prayer" else b.title}
            for b in facts.fixed
        ],
        "tasks": [
            {
                "ref": ref,
                "title": _cut(task.title),
                "priority": task.priority,
                "minutes": minutes,
                "due_by": clock(deadline) if deadline else None,
            }
            for ref, task, minutes, deadline in facts.tasks
        ],
        "workout": (
            {"ref": "w1", "kind": facts.workout.workout_kind, "minutes": facts.workout.end - facts.workout.start} if facts.workout else None
        ),
        "rest_day": facts.rest_day,
    }


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def _limit(text: str, count: int) -> str:
    words = text.split()
    return text.strip() if len(words) <= count else " ".join(words[:count]) + "…"


def from_ai(facts: Facts, text: str) -> tuple[list[Block], int, str | None] | None:
    """(blocks, left out, note) from the AI's JSON, or None when nothing usable came back."""
    try:
        value = json.loads(_FENCE.sub("", text.strip()))
    except ValueError:
        return None
    if not isinstance(value, dict) or not isinstance(value.get("blocks"), list):
        return None
    note = value.get("note")
    note = _limit(note, NOTE_WORDS) if isinstance(note, str) and note.strip() else None
    tasks = {ref: (task, minutes) for ref, task, minutes, _ in facts.tasks}
    blocks = list(facts.fixed)
    used: set[str] = set()
    for item in value["blocks"][:BLOCK_LIMIT]:
        if not isinstance(item, dict) or item.get("kind") not in AI_KINDS:
            continue
        start, end = minutes_of(item.get("start", "")), minutes_of(item.get("end", ""))
        if start is None or end is None or not facts.start <= start < end <= DAY_END:
            continue
        kind, ref = item["kind"], item.get("ref")
        if kind == "task":
            if ref not in tasks or ref in used:
                continue
            task, _ = tasks[ref]
            block = Block(start, end, "task", title=_cut(task.title), task_id=task.id, priority=task.priority)
        elif kind == "workout":
            if facts.workout is None or "w1" in used:
                continue
            ref = "w1"
            block = Block(start, end, "workout", workout_kind=facts.workout.workout_kind)
        else:
            title = item.get("title")
            block = Block(start, min(end, start + 60), "break", title=_cut(title.strip())[:40] if isinstance(title, str) else "")
        if any(block.overlaps(other) for other in blocks):
            continue
        if ref:
            used.add(ref)
        blocks.append(block)
    if facts.tasks and not any(block.kind == "task" for block in blocks):
        return None
    blocks.sort(key=lambda block: block.start)
    left = sum(1 for ref in tasks if ref not in used)
    return blocks, left, note


def reply(facts: Facts, blocks: list[Block], left: int, source: str, note: str | None = None) -> dict[str, Any]:
    return {
        "date": facts.day,
        "start": clock(facts.start),
        "energy": facts.energy,
        "rest_day": facts.rest_day,
        "note": note,
        "source": source,
        "blocks": [block.out() for block in blocks],
        "left_out": left,
    }
