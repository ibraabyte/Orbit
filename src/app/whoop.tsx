import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button, Empty, Loading, Row, Screen, Section, shell, Stats, ui } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import { getApi, hasServer } from "@/lib/backend";
import {
  connectResultMessage,
  describeChange,
  formatHours,
  metricLabels,
  recentRecovery,
  recoveryTone,
  syncedAgo,
  whoopApi,
  zoneFor,
  type WhoopInsight,
  type WhoopStatus,
  type WhoopSummary
} from "@/lib/whoop";

const zoneColors = { green: colors.success, yellow: colors.warning, red: colors.danger } as const;

export default function Whoop() {
  const onServer = hasServer();
  const params = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [summary, setSummary] = useState<WhoopSummary | null>(null);
  const [insight, setInsight] = useState<WhoopInsight | null>(null);
  const [loading, setLoading] = useState(onServer);
  const [busy, setBusy] = useState<"connect" | "sync" | "insight" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(connectResultMessage(params.status ? `?status=${params.status}` : null));

  const load = useCallback(async () => {
    if (!onServer) return;
    setLoading(true);
    try {
      const api = getApi();
      const next = await whoopApi.status(api);
      setStatus(next);
      if (next.connected) {
        const [nextSummary, nextInsight] = await Promise.all([whoopApi.summary(api), whoopApi.latestInsight(api)]);
        setSummary(nextSummary);
        setInsight(nextInsight);
      } else {
        setSummary(null);
        setInsight(null);
      }
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [onServer]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    run("connect", async () => {
      // The server sends the browser back to this link, which also closes the sign-in sheet.
      const returnTo = Linking.createURL("whoop");
      const { url } = await whoopApi.connectUrl(getApi(), returnTo);
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (result.type === "success") setNotice(connectResultMessage(result.url));
      await load();
    });

  const sync = () =>
    run("sync", async () => {
      await whoopApi.sync(getApi());
      setNotice({ ok: true, message: "Synced with WHOOP." });
      await load();
    });

  const writeInsight = () =>
    run("insight", async () => {
      setInsight(await whoopApi.writeInsight(getApi()));
    });

  const disconnectWith = (deleteData: boolean) =>
    run("sync", async () => {
      await whoopApi.disconnect(getApi(), deleteData);
      setNotice({ ok: true, message: deleteData ? "WHOOP disconnected and its data deleted." : "WHOOP disconnected. Synced data kept." });
      await load();
    });

  const disconnect = () =>
    Alert.alert("Disconnect WHOOP?", "Orbit stops syncing. You can keep the data already synced or delete it.", [
      { text: "Keep data", onPress: () => void disconnectWith(false) },
      { text: "Delete data", style: "destructive", onPress: () => void disconnectWith(true) },
      { text: "Cancel", style: "cancel" }
    ]);

  if (!onServer) {
    return (
      <Screen>
        <Empty>WHOOP works with Orbit's own server. Set EXPO_PUBLIC_API_URL to use it.</Empty>
      </Screen>
    );
  }

  const noticeView = notice ? <Text style={notice.ok ? styles.ok : ui.error}>{notice.message}</Text> : null;

  if (!status) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {noticeView}
        {loading ? <Loading /> : <Empty>Couldn't load WHOOP. Pull to try again.</Empty>}
      </Screen>
    );
  }

  if (!status.configured) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <Empty>WHOOP isn't set up on the server yet. It needs the WHOOP app keys in the server settings.</Empty>
      </Screen>
    );
  }

  if (!status.connected) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {noticeView}
        <Section title="WHOOP">
          <Text style={shell.muted}>Connect your WHOOP to see recovery, sleep, strain and heart rate here, with a written summary of how you're doing.</Text>
          <Button title={busy === "connect" ? "Opening WHOOP…" : "Connect WHOOP"} disabled={busy !== null} onPress={connect} />
        </Section>
      </Screen>
    );
  }

  const latest = summary?.latest;
  const show = (key: keyof NonNullable<typeof latest>, format: (value: number) => string) => {
    const item = latest?.[key];
    return item ? format(item.value) : "-";
  };
  const bars = summary ? recentRecovery(summary.daily) : [];
  const strainVsRecovery = summary?.strain_vs_recovery;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      {noticeView}
      {summary && !summary.has_data ? <Empty>No WHOOP data yet. The first sync can take a minute; pull to refresh.</Empty> : null}

      <Stats
        items={[
          ["Recovery", show("recovery", (v) => `${Math.round(v)}%`)],
          ["HRV", show("hrv", (v) => `${Math.round(v)} ms`)],
          ["Resting HR", show("resting_hr", (v) => `${Math.round(v)}`)],
          ["Strain", show("strain", (v) => v.toFixed(1))],
          ["Sleep", show("sleep_hours", formatHours)],
          ["Sleep perf", show("sleep_performance", (v) => `${Math.round(v)}%`)]
        ]}
      />

      {bars.length ? (
        <Section title="Recovery, last 14 days">
          <View style={[ui.card, styles.chart]} accessibilityLabel="Daily recovery bars">
            {bars.map((bar) => (
              <View key={bar.date} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    bar.value === null
                      ? styles.barEmpty
                      : { height: `${Math.max(4, bar.value) * 0.85}%`, backgroundColor: zoneColors[bar.zone ?? zoneFor(bar.value) ?? "yellow"] }
                  ]}
                />
                <Text style={styles.barLabel}>{Number(bar.date.slice(8))}</Text>
              </View>
            ))}
          </View>
          {summary ? (
            <Text style={shell.muted}>
              {summary.days} days: {summary.recovery_zones.green} green, {summary.recovery_zones.yellow} yellow, {summary.recovery_zones.red} red
            </Text>
          ) : null}
        </Section>
      ) : null}

      {summary?.has_data ? (
        <Section title="This week vs last">
          {summary.metrics.map((metric) => {
            const change = describeChange(metric);
            const { label, format } = metricLabels[metric.key];
            return (
              <Row
                key={metric.key}
                title={label}
                detail={change?.text ?? (metric.average === null ? "No data" : `${summary.days}-day average ${format(metric.average)}`)}
                tone={change?.tone}
                right={metric.last7 === null ? "-" : format(metric.last7)}
              />
            );
          })}
        </Section>
      ) : null}

      {strainVsRecovery && strainVsRecovery.after_high_strain !== null && strainVsRecovery.after_lower_strain !== null ? (
        <Section title="Strain and next-day recovery">
          <Row
            title={`After hard days (strain ${strainVsRecovery.high_strain_threshold}+)`}
            detail={`${strainVsRecovery.high_strain_days} days`}
            tone={recoveryTone(zoneFor(strainVsRecovery.after_high_strain))}
            right={`${Math.round(strainVsRecovery.after_high_strain)}%`}
          />
          <Row title="After easier days" tone={recoveryTone(zoneFor(strainVsRecovery.after_lower_strain))} right={`${Math.round(strainVsRecovery.after_lower_strain)}%`} />
        </Section>
      ) : null}

      {summary?.workouts.count ? (
        <Section title={`Workouts, ${summary.days} days`}>
          {summary.workouts.by_sport.slice(0, 6).map((sport) => (
            <Row key={sport.sport} title={sport.sport.replace(/-/g, " ")} detail={`${sport.count}× · strain ${sport.strain}`} right={`${sport.minutes}m`} />
          ))}
        </Section>
      ) : null}

      <Section title="Summary">
        {!status.ai_configured ? (
          <Empty>The written summary isn't set up on the server yet.</Empty>
        ) : insight ? (
          <View style={ui.card}>
            <Text style={styles.arabic}>{insight.summary}</Text>
            {insight.highlights.map((line) => (
              <Text key={`h-${line}`} style={[styles.arabic, styles.muted]}>
                {`• ${line}`}
              </Text>
            ))}
            {insight.recommendations.length ? <Text style={[styles.arabic, styles.heading]}>توصيات</Text> : null}
            {insight.recommendations.map((line) => (
              <Text key={`r-${line}`} style={styles.arabic}>
                {`• ${line}`}
              </Text>
            ))}
            <Text style={[ui.muted, { fontSize: 13 }]}>
              {insight.period_start} to {insight.period_end}
            </Text>
          </View>
        ) : (
          <Empty>No summary yet.</Empty>
        )}
        {status.ai_configured ? (
          <Button
            title={busy === "insight" ? "Writing… (about a minute)" : insight ? "Write a new summary" : "Write a summary"}
            disabled={busy !== null || !summary?.has_data}
            onPress={writeInsight}
          />
        ) : null}
      </Section>

      <Section title="Connection">
        <Row title="WHOOP" detail={status.last_sync_error ?? syncedAgo(status.last_synced_at)} tone={status.last_sync_error ? "danger" : "success"} />
        {status.last_sync_error?.includes("again") ? <Button variant="secondary" title="Connect again" disabled={busy !== null} onPress={connect} /> : null}
        <Button variant="secondary" title={busy === "sync" ? "Syncing…" : "Sync now"} disabled={busy !== null} onPress={sync} />
        <Button variant="danger" title="Disconnect" disabled={busy !== null} onPress={disconnect} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ok: { fontFamily: fonts.medium, fontSize: 15, color: colors.accent },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 4 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  bar: { width: "100%", borderRadius: 4 },
  barEmpty: { height: 4, backgroundColor: colors.hairline },
  barLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.inkMuted },
  // The AI summary is Arabic: right-to-left, whatever the rest of the screen does.
  // System font on purpose: Space Grotesk has no Arabic letters.
  arabic: { fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: "rtl", textAlign: "right" },
  muted: { color: colors.inkMuted },
  heading: { fontWeight: "600", marginTop: 6 }
});
