import { localDateKey } from "@/lib/insights";
import type { DashboardData, Person } from "@/lib/types";

export type BirthdayEvent = {
  person: Person;
  date: string;
  age: number | null;
};

export function favoritePeople(people: Person[]) {
  return people.filter((person) => person.favorite).sort((a, b) => a.name.localeCompare(b.name));
}

export function dueFollowUps(people: Person[], days = 7, now = new Date()) {
  const today = localDateKey(now);
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const endKey = localDateKey(end);

  return people
    .filter((person) => person.next_follow_up_at && person.next_follow_up_at <= endKey)
    .sort((a, b) => (a.next_follow_up_at ?? today).localeCompare(b.next_follow_up_at ?? today));
}

export function overdueFollowUps(people: Person[], now = new Date()) {
  const today = localDateKey(now);
  return people
    .filter((person) => person.next_follow_up_at && person.next_follow_up_at < today)
    .sort((a, b) => (a.next_follow_up_at ?? today).localeCompare(b.next_follow_up_at ?? today));
}

export function upcomingBirthdays(people: Person[], days = 30, now = new Date()): BirthdayEvent[] {
  const today = startOfDay(now);
  const end = startOfDay(now);
  end.setDate(end.getDate() + days);

  return people
    .filter((person) => person.birthday)
    .map((person) => {
      const date = nextBirthdayDate(person.birthday as string, now);
      return { person, date, age: birthdayAge(person.birthday as string, date) };
    })
    .filter((event) => {
      const date = new Date(`${event.date}T12:00:00`);
      return date >= today && date <= end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function peopleSummary(data: Pick<DashboardData, "people">, now = new Date()) {
  const favorites = favoritePeople(data.people);
  const followUps = dueFollowUps(data.people, 7, now);
  const overdue = overdueFollowUps(data.people, now);
  const birthdays = upcomingBirthdays(data.people, 30, now);

  return {
    total: data.people.length,
    favorites,
    dueFollowUps: followUps,
    overdueFollowUps: overdue,
    upcomingBirthdays: birthdays
  };
}

export function nextBirthdayDate(birthday: string, now = new Date()) {
  const [, month, day] = birthday.slice(0, 10).split("-").map(Number);
  const year = now.getFullYear();
  const thisYear = new Date(year, month - 1, day);
  const today = startOfDay(now);
  const next = thisYear < today ? new Date(year + 1, month - 1, day) : thisYear;
  return localDateKey(next);
}

function birthdayAge(birthday: string, date: string) {
  const [birthYear] = birthday.slice(0, 10).split("-").map(Number);
  const [eventYear] = date.slice(0, 10).split("-").map(Number);
  if (!birthYear || !eventYear) return null;
  return Math.max(0, eventYear - birthYear);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
