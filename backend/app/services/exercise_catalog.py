"""The exercise catalogue and the rules that fit it to one user's gym and injuries.

Data: free-exercise-db (https://github.com/yuhonas/free-exercise-db), released into the public domain under the
Unlicense. A copy lives in app/data/free_exercise_db.json so the server never needs GitHub to start; only the
exercise photos are loaded from the dataset's repository, by the phone.

Loading: migration 0009 inserts the catalogue when it creates the table. To pick up a newer copy of the file
later, replace the JSON and run `python -m app.services.exercise_catalog` (an upsert; safe to repeat).

Rules for a user:
- Gym: an exercise fits when it needs no equipment ("body only" or none listed) or its equipment is in the
  user's gym list.
- Injuries: each active injury covers some muscles (app.models.fitness.INJURY_AREAS). An exercise whose PRIMARY
  muscle is covered is left out ("avoid"). One that only uses a covered muscle as a SECONDARY muscle stays in,
  marked "caution", because it loads that area lightly and leaving it out would hide most compound lifts.
"""

import json
import os
import sys
from functools import cache
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, Table, create_engine
from sqlalchemy.dialects.postgresql import insert

from app.models.fitness import INJURY_AREAS, Exercise

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "free_exercise_db.json"
IMAGE_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"


@cache
def load_catalog() -> tuple[dict[str, Any], ...]:
    """The dataset as rows for the exercises table."""
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return tuple(
        {
            "id": item["id"],
            "name": item["name"].strip(),
            "category": item["category"],
            "level": item["level"],
            "force": item.get("force"),
            "mechanic": item.get("mechanic"),
            "equipment": item.get("equipment"),
            "primary_muscles": list(item.get("primaryMuscles") or []),
            "secondary_muscles": list(item.get("secondaryMuscles") or []),
            "instructions": [step.strip() for step in item.get("instructions") or [] if step.strip()],
            "images": list(item.get("images") or []),
        }
        for item in raw
    )


def sync_catalog(connection: Connection, table: Table | None = None) -> int:
    """Insert or update every exercise from the file. Never deletes, so nothing that points at an exercise breaks."""
    table = table if table is not None else Exercise.__table__
    rows = list(load_catalog())
    statement = insert(table)
    statement = statement.on_conflict_do_update(
        index_elements=[table.c.id], set_={column.name: statement.excluded[column.name] for column in table.columns if column.name != "id"}
    )
    for start in range(0, len(rows), 200):
        connection.execute(statement, rows[start : start + 200])
    return len(rows)


def image_url(path: str) -> str:
    return IMAGE_BASE_URL + path


def muscles_for(areas: list[str]) -> dict[str, list[str]]:
    """muscle -> the injured areas that cover it."""
    covered: dict[str, list[str]] = {}
    for area in areas:
        for muscle in INJURY_AREAS.get(area, ()):
            covered.setdefault(muscle, [])
            if area not in covered[muscle]:
                covered[muscle].append(area)
    return covered


def conflicts(primary: list[str], secondary: list[str], covered: dict[str, list[str]]) -> tuple[list[str], list[str]]:
    """(avoid, caution): injured areas hit by the exercise's primary muscles, and those hit only by secondary ones."""
    avoid = _areas(primary, covered)
    caution = [area for area in _areas(secondary, covered) if area not in avoid]
    return avoid, caution


def _areas(muscles: list[str], covered: dict[str, list[str]]) -> list[str]:
    found: list[str] = []
    for muscle in muscles:
        for area in covered.get(muscle, ()):
            if area not in found:
                found.append(area)
    return found


if __name__ == "__main__":
    url = os.environ.get("ORBIT_DATABASE_URL")
    if not url:
        sys.exit("Set ORBIT_DATABASE_URL first.")
    with create_engine(url).begin() as conn:
        print(f"Exercises in the catalogue: {sync_catalog(conn)}")
