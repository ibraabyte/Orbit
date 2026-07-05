"use client";

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { CalendarPlus, Check, Loader2, Plus, Star, Users } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckItem } from "@/components/ui/check-item";
import { Field, Input, Textarea } from "@/components/ui/form";
import { StatTile } from "@/components/ui/stat-tile";
import { formatShortDate, todayInputValue } from "@/lib/dates";
import { markPersonContacted } from "@/lib/people-actions";
import { peopleSummary } from "@/lib/people";
import { getSupabase } from "@/lib/supabase";
import type { Person } from "@/lib/types";

export function PeoplePanel({
  userId,
  people,
  onChanged,
  compact = false
}: {
  userId: string;
  people: Person[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const summary = useMemo(() => peopleSummary({ people }), [people]);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <ModuleCard title="Add person" kicker="Keep birthdays and follow-ups close to the rest of life admin.">
          <PeopleComposer userId={userId} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      <ModuleCard title={compact ? "People" : "People view"} kicker={`${summary.total} people, ${summary.dueFollowUps.length} follow-ups due soon`}>
        <PeopleRecent userId={userId} people={people} onChanged={onChanged} compact={compact} />
      </ModuleCard>
    </div>
  );
}

function PeopleComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [birthday, setBirthday] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await getSupabase().from("people").insert({
      user_id: userId,
      name,
      relationship: relationship.trim() || null,
      contact_method: contactMethod.trim() || null,
      birthday: birthday || null,
      last_contacted_at: null,
      next_follow_up_at: nextFollowUp || null,
      notes: notes.trim() || null,
      favorite
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setName("");
    setRelationship("");
    setContactMethod("");
    setBirthday("");
    setNextFollowUp("");
    setNotes("");
    setFavorite(false);
    setSaving(false);
    await onSaved();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Name" htmlFor="person-name">
        <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Relationship" htmlFor="person-relationship">
          <Input id="person-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Friend, family, coworker" />
        </Field>
        <Field label="Contact" htmlFor="person-contact">
          <Input id="person-contact" value={contactMethod} onChange={(event) => setContactMethod(event.target.value)} placeholder="Phone, WhatsApp, email" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Birthday" htmlFor="person-birthday">
          <Input id="person-birthday" type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
        </Field>
        <Field label="Next follow-up" htmlFor="person-follow-up">
          <Input id="person-follow-up" type="date" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} />
        </Field>
      </div>

      <CheckItem checked={favorite} onChange={setFavorite} label="Favorite" id="person-favorite" />

      <Field label="Notes" htmlFor="person-notes">
        <Textarea id="person-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Save person
      </Button>
    </form>
  );
}

function PeopleRecent({
  userId,
  people,
  onChanged,
  compact
}: {
  userId: string;
  people: Person[];
  onChanged: () => Promise<void> | void;
  compact: boolean;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => peopleSummary({ people }), [people]);
  const visible = compact ? [...summary.overdueFollowUps, ...summary.dueFollowUps, ...summary.upcomingBirthdays.map((event) => event.person), ...summary.favorites].slice(0, 6) : people.slice(0, 18);
  const uniqueVisible = dedupePeople(visible);

  async function markContacted(person: Person, nextFollowUpDays: number | null) {
    setSavingId(person.id);
    setError(null);
    try {
      await markPersonContacted(userId, person.id, nextFollowUpDays);
      await onChanged();
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : `${person.name} could not be updated.`);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleFavorite(person: Person) {
    setSavingId(person.id);
    setError(null);
    try {
      const { error: updateError } = await getSupabase()
        .from("people")
        .update({ favorite: !person.favorite })
        .eq("id", person.id)
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      await onChanged();
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : `${person.name} could not be updated.`);
    } finally {
      setSavingId(null);
    }
  }

  if (!people.length) return <EmptyState>No people yet. Add one person with a birthday or follow-up date.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <PeopleStat icon={<Users size={16} />} label="People" value={summary.total} />
        <PeopleStat icon={<Check size={16} />} label="Follow-ups" value={summary.dueFollowUps.length} />
        <PeopleStat icon={<Star size={16} />} label="Birthdays" value={summary.upcomingBirthdays.length} />
      </div>

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {uniqueVisible.map((person) => {
          const birthday = summary.upcomingBirthdays.find((event) => event.person.id === person.id);
          const overdue = Boolean(person.next_follow_up_at && person.next_follow_up_at < todayInputValue().slice(0, 10));
          return (
            <div className="rounded-tile border border-hairline bg-surface p-3" key={person.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{person.name}</p>
                  <p className="text-[12.5px] text-ink-muted">
                    {[person.relationship, person.contact_method, person.next_follow_up_at ? `follow up ${formatShortDate(person.next_follow_up_at)}` : null, birthday ? `birthday ${formatShortDate(birthday.date)}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                  {person.notes ? <p className="text-[12px] text-ink-muted">{person.notes}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={personTone(overdue, person.favorite)}>{person.favorite ? "favorite" : overdue ? "due" : "person"}</Badge>
                  <Button variant="secondary" size="sm" type="button" onClick={() => toggleFavorite(person)} disabled={savingId === person.id} aria-label={`Toggle favorite for ${person.name}`}>
                    {savingId === person.id ? <Loader2 size={16} aria-hidden="true" /> : <Star size={16} aria-hidden="true" />}
                  </Button>
                </div>
              </div>
              {person.next_follow_up_at ? (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Mark ${person.name} contacted and schedule next follow-up`}>
                  {[7, 30, 90].map((days) => (
                    <Button key={days} variant="ghost" size="sm" type="button" onClick={() => markContacted(person, days)} disabled={savingId === person.id} title={`Follow up in ${days} days`}>
                      {savingId === person.id ? <Loader2 size={14} aria-hidden="true" /> : <CalendarPlus size={14} aria-hidden="true" />}
                      {days}d
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" type="button" onClick={() => markContacted(person, null)} disabled={savingId === person.id} aria-label={`Mark ${person.name} contacted with no next follow-up`} title="Clear follow-up">
                    {savingId === person.id ? <Loader2 size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeopleStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <StatTile icon={icon} label={label} value={value} />;
}

function personTone(overdue: boolean, favorite: boolean): BadgeTone {
  if (overdue) return "warning";
  if (favorite) return "success";
  return "neutral";
}

function dedupePeople(people: Person[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}
