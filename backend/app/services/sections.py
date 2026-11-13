"""Sections the user switched off in Settings. A hidden section is left out of what the AI sees and can change (the
morning brief, Ask Orbit, the assistant, the weekly summary), the same way the app leaves it off its screens. Its rows
are never touched: switching it on again brings everything back."""

import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy.orm import Session

from app.models import Profile
from app.models.profile import SECTIONS

# Switching health off also hides what lives inside it.
INSIDE = {"health": ("food", "exercises", "whoop")}

# The assistant's kinds, by the section they belong to. Kinds not listed (tasks, reminders) are always on.
KIND_SECTIONS = {
    "expense": "finance",
    "bill": "finance",
    "budget": "finance",
    "money_account": "finance",
    "investment": "finance",
    "card": "finance",
    "meal": "food",
    "food": "food",
    "grocery": "food",
    "workout": "health",
    "sleep": "health",
    "weight": "health",
    "habit": "habits",
    "habit_log": "habits",
    "note": "library",
}

# Keys of the AI context dicts (brief, Ask Orbit, weekly summary), by section.
CONTEXT_SECTIONS = {
    "bills": "finance",
    "budgets": "finance",
    "expenses": "finance",
    "expense_totals": "finance",
    "top_spending": "finance",
    "month_spent": "finance",
    "bills_next_week": "finance",
    "habits": "habits",
    "sleep": "health",
    "workouts": "health",
    "whoop": "whoop",
    "recovery": "whoop",
    "saved": "library",
}

# The weekly facts each section owns, and what a hidden one is sent as, so its numbers are neither shown nor summed up.
FACT_SECTIONS: dict[str, tuple[str, Any]] = {
    "workouts": ("health", 0),
    "workout_minutes": ("health", 0),
    "workout_target": ("health", None),
    "sleep_hours_avg": ("health", None),
    "recovery_avg": ("whoop", None),
    "calories_avg": ("food", None),
    "calorie_target": ("food", None),
    "spent": ("finance", []),
    "spent_last_week": ("finance", []),
    "bills_next_week": ("finance", 0),
    "saved": ("library", 0),
}


def expand(names: Iterable[str]) -> frozenset[str]:
    hidden = {name for name in names if name in SECTIONS}
    for parent, children in INSIDE.items():
        if parent in hidden:
            hidden.update(children)
    return frozenset(hidden)


def hidden_for(db: Session, user_id: uuid.UUID) -> frozenset[str]:
    profile = db.get(Profile, user_id)
    return expand(profile.hidden_sections if profile else ())


def drop_hidden(data: dict[str, Any], hidden: frozenset[str]) -> dict[str, Any]:
    """The context without the parts of hidden sections (and their entries under "counts" and "covers")."""
    if not hidden:
        return data
    gone = {key for key, section in CONTEXT_SECTIONS.items() if section in hidden}
    out = {key: value for key, value in data.items() if key not in gone}
    for nested in ("counts", "covers", "no_date_window"):
        if isinstance(out.get(nested), dict):
            out[nested] = drop_hidden(out[nested], hidden)
    return out


def blank_facts(facts: dict[str, Any], hidden: frozenset[str]) -> dict[str, Any]:
    out = dict(facts)
    for key, (section, blank) in FACT_SECTIONS.items():
        if section in hidden and key in out:
            out[key] = blank
    return out


def kind_on(kind: str, hidden: frozenset[str]) -> bool:
    return KIND_SECTIONS.get(kind) not in hidden
