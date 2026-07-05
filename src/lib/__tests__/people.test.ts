import { describe, expect, it } from "vitest";
import { dueFollowUps, favoritePeople, nextBirthdayDate, overdueFollowUps, peopleSummary, upcomingBirthdays } from "@/lib/people";
import type { Person } from "@/lib/types";

const now = new Date("2026-07-01T12:00:00.000Z");

function person(overrides: Partial<Person>): Person {
  return {
    id: "person-1",
    user_id: "user-1",
    name: "Sara",
    relationship: null,
    contact_method: null,
    birthday: null,
    last_contacted_at: null,
    next_follow_up_at: null,
    notes: null,
    favorite: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("people helpers", () => {
  it("sorts favorites and follow-ups by the dates that need attention", () => {
    const people = [
      person({ id: "future", name: "Zed", next_follow_up_at: "2026-07-20", favorite: true }),
      person({ id: "due", name: "Mona", next_follow_up_at: "2026-07-05" }),
      person({ id: "overdue", name: "Ali", next_follow_up_at: "2026-06-30", favorite: true })
    ];

    expect(favoritePeople(people).map((item) => item.name)).toEqual(["Ali", "Zed"]);
    expect(dueFollowUps(people, 7, now).map((item) => item.id)).toEqual(["overdue", "due"]);
    expect(overdueFollowUps(people, now).map((item) => item.id)).toEqual(["overdue"]);
  });

  it("finds upcoming birthdays across the current year boundary", () => {
    const people = [
      person({ id: "soon", name: "Sara", birthday: "1996-07-03" }),
      person({ id: "later", name: "Omar", birthday: "1990-08-20" })
    ];

    expect(nextBirthdayDate("1996-06-30", now)).toBe("2027-06-30");
    expect(upcomingBirthdays(people, 7, now)).toEqual([
      expect.objectContaining({ date: "2026-07-03", age: 30, person: expect.objectContaining({ id: "soon" }) })
    ]);
  });

  it("builds a compact summary for dashboard and planning surfaces", () => {
    const summary = peopleSummary(
      {
        people: [
          person({ id: "favorite", favorite: true }),
          person({ id: "overdue", next_follow_up_at: "2026-06-30" }),
          person({ id: "birthday", birthday: "1996-07-10" })
        ]
      },
      now
    );

    expect(summary.total).toBe(3);
    expect(summary.favorites).toHaveLength(1);
    expect(summary.dueFollowUps).toHaveLength(1);
    expect(summary.overdueFollowUps).toHaveLength(1);
    expect(summary.upcomingBirthdays).toHaveLength(1);
  });
});
