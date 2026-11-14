"""All tables. Importing this module registers every model on Base.metadata (Alembic relies on that)."""

from app.models.auth import RefreshToken, ServerSettings, User
from app.models.bank_sms import BankSmsEvent, BankSmsToken, BankTransaction
from app.models.base import Base
from app.models.calls import PhoneCall, PhoneConnection
from app.models.chatgpt import ChatgptConnection
from app.models.finance import Bill, Budget, Card, Expense, Investment, MoneyAccount, Obligation, ObligationInstallment
from app.models.fitness import Exercise, GymEquipment, Injury
from app.models.food import Food
from app.models.health import GroceryItem, Meal, MealPlan, SleepLog, WeightLog, Workout
from app.models.integrations import AiConnection, ServiceConnection, VoiceConnection
from app.models.library import Attachment, Capture, PushSubscription, Tag, Tagging
from app.models.life import Habit, HabitLog
from app.models.medications import Medication, MedicationDose
from app.models.plan import PlannedExercise, PlannedWorkout, TrainingPlan
from app.models.profile import Profile
from app.models.tasks import Reminder, Task, TaskList, TaskStep
from app.models.things import Vehicle, WatchItem
from app.models.training import BodyMeasurement, WorkoutExercise, WorkoutSet
from app.models.whoop import WhoopConnection, WhoopCycle, WhoopInsight, WhoopRecovery, WhoopSleep, WhoopWorkout

__all__ = [
    "AiConnection",
    "Attachment",
    "BankSmsEvent",
    "BankSmsToken",
    "BankTransaction",
    "Base",
    "Bill",
    "BodyMeasurement",
    "Budget",
    "Capture",
    "Card",
    "ChatgptConnection",
    "Exercise",
    "Expense",
    "Food",
    "GroceryItem",
    "GymEquipment",
    "Habit",
    "HabitLog",
    "Injury",
    "Investment",
    "Meal",
    "MealPlan",
    "Medication",
    "MedicationDose",
    "MoneyAccount",
    "Obligation",
    "ObligationInstallment",
    "PhoneCall",
    "PhoneConnection",
    "PlannedExercise",
    "PlannedWorkout",
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
    "TaskList",
    "TaskStep",
    "TrainingPlan",
    "User",
    "Vehicle",
    "VoiceConnection",
    "WatchItem",
    "WeightLog",
    "WhoopConnection",
    "WhoopCycle",
    "WhoopInsight",
    "WhoopRecovery",
    "WhoopSleep",
    "WhoopWorkout",
    "Workout",
    "WorkoutExercise",
    "WorkoutSet",
]
