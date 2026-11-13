import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card, type } from "@/components/drift";
import { Chips } from "@/components/chips";
import { Chip } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { toggleItem } from "@/lib/exercises";
import { isArabic } from "@/lib/i18n";
import { defaultWeekdays, GOALS, LEVELS, planApi, pt, splitFor, WEEK_ORDER, type Goal, type Level, type Weekday } from "@/lib/plan";

// The plan's choices: goal, level and the days you can go. Saving lays the coming days out again.
export default function PlanSetup() {
  const { toast } = useOverlays();
  const [goal, setGoal] = useState<Goal>("muscle");
  const [level, setLevel] = useState<Level>("intermediate");
  const [weekdays, setWeekdays] = useState<Weekday[]>(defaultWeekdays(3));
  const [existing, setExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    planApi
      .get(getApi())
      .then((plan) => {
        if (!plan) return;
        setGoal(plan.goal);
        setLevel(plan.level);
        setWeekdays(plan.weekdays);
        setExisting(true);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!weekdays.length) return toast(pt.pickDay);
    setSaving(true);
    try {
      await planApi.save(getApi(), { goal, level, weekdays: [...weekdays].sort((a, b) => a - b) });
      toast(pt.saved);
      router.back();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : String(saveError));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const split = splitFor(weekdays.length, level);

  return (
    <Screen>
      <Card title={pt.goal}>
        <Chips options={GOALS} value={goal} onChange={setGoal} label={(option) => pt.goals[option]} />
      </Card>
      <Card title={pt.level}>
        <Chips options={LEVELS} value={level} onChange={setLevel} label={(option) => pt.levels[option]} />
      </Card>
      <Card title={pt.days} action={<Text style={type.rowSubtitle}>{pt.daysCount(weekdays.length)}</Text>}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {WEEK_ORDER.map((day) => (
            <Chip key={day} label={pt.weekdays[day]} on={weekdays.includes(day)} onPress={() => setWeekdays(toggleItem(weekdays, day))} />
          ))}
        </View>
        {weekdays.length ? <Text style={[type.rowSubtitle, { paddingTop: 12 }]}>{`${pt.split}: ${split.map((kind) => pt.kinds[kind]).join(isArabic ? " ← " : " → ")}`}</Text> : null}
      </Card>
      <Button variant="primary" title={existing ? pt.save : pt.build} disabled={saving || !weekdays.length} onPress={() => void save()} />
    </Screen>
  );
}
