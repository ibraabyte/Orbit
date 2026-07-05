import {
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Command,
  CreditCard,
  Dumbbell,
  Flag,
  Home,
  Inbox,
  Repeat2,
  Search,
  Settings,
  SquareCheckBig,
  Timer,
  Users,
  Utensils,
  type LucideIcon
} from "lucide-react";

export type NavLink = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavLink[] };

/** Full Orbit navigation, grouped. The bottom nav surfaces a subset; /more lists the rest. */
export const navGroups: NavGroup[] = [
  {
    label: "Run the day",
    items: [
      { href: "/dashboard", label: "Today", icon: Home },
      { href: "/plan", label: "Plan", icon: ClipboardList },
      { href: "/review", label: "Review", icon: ClipboardCheck },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/command", label: "Command", icon: Command },
      { href: "/search", label: "Search", icon: Search }
    ]
  },
  {
    label: "Life records",
    items: [
      { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/focus", label: "Focus", icon: Timer },
      { href: "/health", label: "Health", icon: Dumbbell },
      { href: "/food", label: "Food", icon: Utensils },
      { href: "/finance", label: "Finance", icon: CreditCard },
      { href: "/people", label: "People", icon: Users },
      { href: "/habits", label: "Habits", icon: Repeat2 },
      { href: "/goals", label: "Goals", icon: Flag },
      { href: "/journal", label: "Journal", icon: BookOpen },
      { href: "/library", label: "Library", icon: Bookmark }
    ]
  },
  {
    label: "System",
    items: [
      { href: "/insights", label: "Insights", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

export const navItems: NavLink[] = navGroups.flatMap((group) => group.items);
