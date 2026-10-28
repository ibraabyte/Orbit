"""All tables. Importing this module registers every model on Base.metadata (Alembic relies on that)."""

from app.models.auth import RefreshToken, User
from app.models.base import Base
from app.models.finance import Bill, Expense
from app.models.health import GroceryItem, Meal, MealPlan, SleepLog, WeightLog, Workout
from app.models.library import Attachment, Capture, PushSubscription, Tag, Tagging
from app.models.life import Goal, GoalMilestone, Habit, HabitLog, JournalEntry, Person
from app.models.profile import Profile
from app.models.tasks import FocusSession, Reminder, Task
from app.models.things import Vehicle, WatchItem

__all__ = [
    "Attachment",
    "Base",
    "Bill",
    "Capture",
    "Expense",
    "FocusSession",
    "Goal",
    "GoalMilestone",
    "GroceryItem",
    "Habit",
    "HabitLog",
    "JournalEntry",
    "Meal",
    "MealPlan",
    "Person",
    "Profile",
    "PushSubscription",
    "RefreshToken",
    "Reminder",
    "SleepLog",
    "Tag",
    "Tagging",
    "Task",
    "User",
    "Vehicle",
    "WatchItem",
    "WeightLog",
    "Workout",
]
