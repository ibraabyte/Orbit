"""All tables. Importing this module registers every model on Base.metadata (Alembic relies on that)."""

from app.models.auth import RefreshToken, ServerSettings, User
from app.models.bank_sms import BankSmsEvent, BankSmsToken, BankTransaction
from app.models.base import Base
from app.models.chatgpt import ChatgptConnection
from app.models.finance import Bill, Budget, Card, Expense, Investment, MoneyAccount, Obligation, ObligationInstallment
from app.models.health import GroceryItem, Meal, MealPlan, SleepLog, WeightLog, Workout
from app.models.integrations import AiConnection, ServiceConnection
from app.models.library import Attachment, Capture, PushSubscription, Tag, Tagging
from app.models.life import Goal, GoalMilestone, Habit, HabitLog, JournalEntry, Person
from app.models.profile import Profile
from app.models.tasks import FocusSession, Reminder, Task
from app.models.things import Vehicle, WatchItem
from app.models.whoop import WhoopConnection, WhoopCycle, WhoopInsight, WhoopRecovery, WhoopSleep, WhoopWorkout

__all__ = [
    "AiConnection",
    "Attachment",
    "BankSmsEvent",
    "BankSmsToken",
    "BankTransaction",
    "Base",
    "Bill",
    "Budget",
    "Capture",
    "Card",
    "ChatgptConnection",
    "Expense",
    "FocusSession",
    "Goal",
    "GoalMilestone",
    "GroceryItem",
    "Habit",
    "HabitLog",
    "Investment",
    "JournalEntry",
    "Meal",
    "MealPlan",
    "MoneyAccount",
    "Obligation",
    "ObligationInstallment",
    "Person",
    "Profile",
    "PushSubscription",
    "RefreshToken",
    "ServerSettings",
    "ServiceConnection",
    "Reminder",
    "SleepLog",
    "Tag",
    "Tagging",
    "Task",
    "User",
    "Vehicle",
    "WatchItem",
    "WeightLog",
    "WhoopConnection",
    "WhoopCycle",
    "WhoopInsight",
    "WhoopRecovery",
    "WhoopSleep",
    "WhoopWorkout",
    "Workout",
]
