"use client";

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Plus, ShoppingBasket, Utensils, X } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { formatShortDate, todayInputValue } from "@/lib/dates";
import { foodSummary, formatMacros, groceryCategories, mealLogFromPlan, mealTypeLabel } from "@/lib/food";
import { getSupabase } from "@/lib/supabase";
import { createTaggings, ensureTags, parseTagInput, tagsForTarget } from "@/lib/tag-actions";
import type { GroceryCategory, GroceryItem, GroceryStatus, MealPlan, MealPlanStatus, MealPlanType, Tag, Tagging } from "@/lib/types";

type FoodMode = "meal" | "grocery";

const mealTypes: MealPlanType[] = ["breakfast", "lunch", "dinner", "snack", "other"];

const FOOD_MODES: { value: FoodMode; label: string }[] = [
  { value: "meal", label: "Meal" },
  { value: "grocery", label: "Grocery" }
];

export function FoodPanel({
  userId,
  mealPlans,
  groceryItems,
  tags = [],
  taggings = [],
  onChanged,
  compact = false
}: {
  userId: string;
  mealPlans: MealPlan[];
  groceryItems: GroceryItem[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const summary = useMemo(() => foodSummary({ mealPlans, groceryItems }), [groceryItems, mealPlans]);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <ModuleCard title="Plan food" kicker="Meals ahead, groceries before they become errands.">
          <FoodComposer userId={userId} mealPlans={mealPlans} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      <ModuleCard title={compact ? "Food plan" : "Food view"} kicker={`${summary.todayPlannedMeals} meals today, ${summary.neededGroceries.length} groceries needed`}>
        <FoodRecent userId={userId} mealPlans={mealPlans} groceryItems={groceryItems} tags={tags} taggings={taggings} onChanged={onChanged} compact={compact} />
      </ModuleCard>
    </div>
  );
}

function FoodComposer({
  userId,
  mealPlans,
  onSaved
}: {
  userId: string;
  mealPlans: MealPlan[];
  onSaved: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<FoodMode>("meal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [planDate, setPlanDate] = useState(todayInputValue().slice(0, 10));
  const [mealType, setMealType] = useState<MealPlanType>("lunch");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("other");
  const [mealPlanId, setMealPlanId] = useState("");
  const [tagInput, setTagInput] = useState("");

  const linkablePlans = mealPlans.filter((plan) => plan.status !== "skipped").slice(0, 20);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedTags = parseTagInput(tagInput);

      if (mode === "meal") {
        const { data, error: insertError } = await getSupabase()
          .from("meal_plans")
          .insert({
            user_id: userId,
            name,
            plan_date: planDate,
            meal_type: mealType,
            calories: Number(calories || 0),
            protein_g: protein ? Number(protein) : null,
            carbs_g: carbs ? Number(carbs) : null,
            fat_g: fat ? Number(fat) : null,
            note: note.trim() || null,
            status: "planned"
          })
          .select()
          .single();
        if (insertError) throw new Error(insertError.message);
        if (data) await tagTarget(userId, "meal_plan", data.id, parsedTags);
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
      }

      if (mode === "grocery") {
        const { data, error: insertError } = await getSupabase()
          .from("grocery_items")
          .insert({
            user_id: userId,
            meal_plan_id: mealPlanId || null,
            name,
            quantity: quantity.trim() || null,
            category,
            status: "needed",
            due_at: planDate || null
          })
          .select()
          .single();
        if (insertError) throw new Error(insertError.message);
        if (data) await tagTarget(userId, "grocery_item", data.id, parsedTags);
        setQuantity("");
      }

      setName("");
      setNote("");
      setTagInput("");
      await onSaved();
    } catch (foodError) {
      setError(foodError instanceof Error ? foodError.message : "Food save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Segmented ariaLabel="Food entry type" size="sm" options={FOOD_MODES} value={mode} onChange={setMode} />

      <Field label={mode === "meal" ? "Meal" : "Item"} htmlFor="food-name">
        <Input id="food-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={mode === "meal" ? "Planned for" : "Needed by"} htmlFor="food-date">
          <Input id="food-date" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} required />
        </Field>
        {mode === "meal" ? (
          <Field label="Type" htmlFor="food-meal-type">
            <Select id="food-meal-type" value={mealType} onChange={(event) => setMealType(event.target.value as MealPlanType)}>
              {mealTypes.map((type) => (
                <option value={type} key={type}>
                  {mealTypeLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Category" htmlFor="food-category">
            <Select id="food-category" value={category} onChange={(event) => setCategory(event.target.value as GroceryCategory)}>
              {groceryCategories.map((item) => (
                <option value={item} key={item}>
                  {labelize(item)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {mode === "meal" ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="food-calories" label="Calories" value={calories} onChange={setCalories} />
          <NumberField id="food-protein" label="Protein g" value={protein} onChange={setProtein} />
          <NumberField id="food-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <NumberField id="food-fat" label="Fat g" value={fat} onChange={setFat} />
        </div>
      ) : (
        <>
          <Field label="Quantity" htmlFor="food-quantity">
            <Input id="food-quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="2 lb, 1 carton, 4 cans" />
          </Field>
          <Field label="Linked meal" htmlFor="food-linked-meal">
            <Select id="food-linked-meal" value={mealPlanId} onChange={(event) => setMealPlanId(event.target.value)}>
              <option value="">None</option>
              {linkablePlans.map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.plan_date} · {plan.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <Field label="Tags" htmlFor="food-tags">
        <Input id="food-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="meal prep, family, groceries" />
      </Field>

      {mode === "meal" ? (
        <Field label="Note" htmlFor="food-note">
          <Textarea id="food-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      ) : null}

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : mode === "meal" ? <Utensils size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Save {mode === "meal" ? "meal" : "item"}
      </Button>
    </form>
  );
}

function FoodRecent({
  userId,
  mealPlans,
  groceryItems,
  tags,
  taggings,
  onChanged,
  compact
}: {
  userId: string;
  mealPlans: MealPlan[];
  groceryItems: GroceryItem[];
  tags: Tag[];
  taggings: Tagging[];
  onChanged: () => Promise<void> | void;
  compact: boolean;
}) {
  const summary = useMemo(() => foodSummary({ mealPlans, groceryItems }), [groceryItems, mealPlans]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plans = compact ? summary.upcomingMealPlans.slice(0, 4) : summary.upcomingMealPlans.slice(0, 8);
  const groceryLimit = compact ? 5 : 12;
  let shownGroceryCount = 0;
  const grocerySections = summary.grocerySections
    .map((section) => {
      const remaining = groceryLimit - shownGroceryCount;
      const items = remaining > 0 ? section.items.slice(0, remaining) : [];
      shownGroceryCount += items.length;
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
  const hiddenGroceryCount = Math.max(0, summary.dueGroceries.length - shownGroceryCount);
  const missingPlans = summary.missingGroceryPlans.slice(0, compact ? 2 : 4);
  const hiddenMissingPlans = Math.max(0, summary.missingGroceryPlans.length - missingPlans.length);
  const coveredMeals = summary.mealGroceryCoverage.filter((coverage) => coverage.hasGroceries).length;
  const coverageValue = summary.mealGroceryCoverage.length ? `${coveredMeals}/${summary.mealGroceryCoverage.length}` : "0";

  async function updateMealStatus(plan: MealPlan, status: MealPlanStatus) {
    setSavingId(plan.id);
    setError(null);
    try {
      const supabase = getSupabase();
      const { error: statusError } = await supabase.from("meal_plans").update({ status }).eq("id", plan.id).eq("user_id", userId);
      if (statusError) throw new Error(statusError.message);

      if (status === "eaten") {
        const { error: mealError } = await supabase.from("meals").insert(mealLogFromPlan(plan));
        if (mealError) {
          await supabase.from("meal_plans").update({ status: plan.status }).eq("id", plan.id).eq("user_id", userId);
          throw new Error(mealError.message);
        }
      }
      await onChanged();
    } catch (foodError) {
      setError(foodError instanceof Error ? foodError.message : "Meal status could not be updated.");
    } finally {
      setSavingId(null);
    }
  }

  async function updateGroceryStatus(item: GroceryItem, status: GroceryStatus) {
    setSavingId(item.id);
    setError(null);
    try {
      const { error: statusError } = await getSupabase().from("grocery_items").update({ status }).eq("id", item.id).eq("user_id", userId);
      if (statusError) throw new Error(statusError.message);
      await onChanged();
    } catch (foodError) {
      setError(foodError instanceof Error ? foodError.message : "Grocery status could not be updated.");
    } finally {
      setSavingId(null);
    }
  }

  if (!mealPlans.length && !groceryItems.length) {
    return <EmptyState>No food plan yet. Add one planned meal or one grocery item.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <FoodStat icon={<Utensils size={16} />} label="Today" value={summary.todayPlannedMeals} />
        <FoodStat icon={<Utensils size={16} />} label="Calories" value={summary.todayPlannedCalories} />
        <FoodStat icon={<ShoppingBasket size={16} />} label="Groceries" value={summary.neededGroceries.length} />
        <FoodStat icon={<ShoppingBasket size={16} />} label="Covered" value={coverageValue} />
      </div>

      {plans.length ? (
        <div className="flex flex-col gap-2">
          <SectionHeading title="Planned meals" meta="Prep, eat, or skip from the same queue." />
          <div className="flex flex-col gap-1.5">
            {plans.map((plan) => {
              const planTags = tagsForTarget(tags, taggings, "meal_plan", plan.id);
              const macros = formatMacros({ protein: plan.protein_g, carbs: plan.carbs_g, fat: plan.fat_g });
              return (
                <div className="rounded-tile border border-hairline bg-surface p-3" key={plan.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{plan.name}</p>
                      <p className="text-[12.5px] text-ink-muted">
                        {formatShortDate(plan.plan_date)} · {mealTypeLabel(plan.meal_type)} · {plan.calories} calories
                        {macros ? ` · ${macros}` : ""}
                      </p>
                      {planTags.length ? <p className="text-[12px] text-ink-muted">{planTags.map((tag) => `#${tag.name}`).join(" ")}</p> : null}
                    </div>
                    <Badge tone={mealStatusTone(plan.status)}>{plan.status}</Badge>
                  </div>
                  {plan.status === "planned" || plan.status === "prepped" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan.status === "planned" ? (
                        <Button variant="ghost" size="sm" type="button" onClick={() => updateMealStatus(plan, "prepped")} disabled={savingId === plan.id}>
                          {savingId === plan.id ? <Loader2 size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                          Prep
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" type="button" onClick={() => updateMealStatus(plan, "eaten")} disabled={savingId === plan.id}>
                        {savingId === plan.id ? <Loader2 size={14} aria-hidden="true" /> : <Utensils size={14} aria-hidden="true" />}
                        Eat
                      </Button>
                      {plan.status === "planned" ? (
                        <Button variant="ghost" size="sm" type="button" onClick={() => updateMealStatus(plan, "skipped")} disabled={savingId === plan.id}>
                          {savingId === plan.id ? <Loader2 size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                          Skip
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {missingPlans.length ? (
        <div className="flex flex-col gap-2">
          <SectionHeading title="Meals missing groceries" meta="Planned meals with no linked grocery items yet." badge={`${summary.missingGroceryPlans.length} open`} tone="warning" />
          <div className="flex flex-col gap-1.5">
            {missingPlans.map((plan) => (
              <div className="rounded-tile border border-hairline bg-surface p-3" key={plan.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{plan.name}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {formatShortDate(plan.plan_date)} · {mealTypeLabel(plan.meal_type)} · add groceries from the grocery composer
                    </p>
                  </div>
                  <Badge tone="warning">list missing</Badge>
                </div>
              </div>
            ))}
          </div>
          {hiddenMissingPlans ? (
            <EmptyState>
              {hiddenMissingPlans} more planned meal{hiddenMissingPlans === 1 ? "" : "s"} need grocery coverage.
            </EmptyState>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <SectionHeading title="Grocery list" meta="Grouped by shopping category with meal context when linked." badge={`${summary.dueGroceries.length} due`} />
        {grocerySections.length ? (
          grocerySections.map((section) => (
            <div className="flex flex-col gap-1.5" key={section.category}>
              <div className="flex items-center justify-between gap-2">
                <Badge>
                  <ShoppingBasket size={13} aria-hidden="true" />
                  {labelize(section.category)}
                </Badge>
                <span className="text-[12px] text-ink-muted">
                  {section.items.length} item{section.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {section.items.map(({ item, mealPlan }) => {
                  const itemTags = tagsForTarget(tags, taggings, "grocery_item", item.id);
                  return (
                    <div className="rounded-tile border border-hairline bg-surface p-3" key={item.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-ink">{item.name}</p>
                          <p className="text-[12.5px] text-ink-muted">
                            {item.quantity || "Quantity open"}
                            {item.due_at ? ` · by ${formatShortDate(item.due_at)}` : ""}
                            {mealPlan ? ` · for ${mealPlan.name}` : ""}
                          </p>
                          {itemTags.length ? <p className="text-[12px] text-ink-muted">{itemTags.map((tag) => `#${tag.name}`).join(" ")}</p> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone="warning">needed</Badge>
                          <Button variant="primary" size="sm" type="button" onClick={() => updateGroceryStatus(item, "bought")} disabled={savingId === item.id} aria-label={`Mark ${item.name} bought`}>
                            {savingId === item.id ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <EmptyState>No groceries due this week. Linked items will appear here by category.</EmptyState>
        )}
        {hiddenGroceryCount ? (
          <EmptyState>
            {hiddenGroceryCount} more grocery item{hiddenGroceryCount === 1 ? "" : "s"} due this week.
          </EmptyState>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeading({ title, meta, badge, tone }: { title: string; meta: string; badge?: string; tone?: "warning" }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[12.5px] text-ink-muted">{meta}</p>
      </div>
      {badge ? <Badge tone={tone === "warning" ? "warning" : "neutral"}>{badge}</Badge> : null}
    </div>
  );
}

function FoodStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <StatTile icon={icon} label={label} value={value} />;
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} type="number" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function mealStatusTone(status: MealPlanStatus): BadgeTone {
  if (status === "eaten" || status === "prepped") return "success";
  if (status === "skipped") return "warning";
  return "neutral";
}

async function tagTarget(userId: string, targetType: "meal_plan" | "grocery_item", targetId: string, tagNames: string[]) {
  const tags = await ensureTags(userId, tagNames);
  await createTaggings(userId, targetType, targetId, tags);
}

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
