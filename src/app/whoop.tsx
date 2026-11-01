import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, GoalBar, Hero, ListRow, Metric, RingGauge, toneGlyph, toneToBadge, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen, ui } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import { getApi, hasServer } from "@/lib/backend";
import { t } from "@/lib/i18n";
import {
  connectResultMessage,
  describeChange,
  metricLabels,
  recentRecovery,
  syncedAgo,
  whoopApi,
  zoneFor,
  type WhoopInsight,
  type WhoopStatus,
  type WhoopSummary
} from "@/lib/whoop";

export default function Whoop() {
  const onServer = hasServer();
  const { sheet } = useOverlays();
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
      setNotice({ ok: true, message: t.saved });
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
    sheet({
      title: `${t.disconnect} WHOOP`,
      options: [
        { label: t.keepData, run: () => void disconnectWith(false) },
        { label: t.deleteData, destructive: true, run: () => void disconnectWith(true) }
      ]
    });

  const noticeView = notice ? <Text style={notice.ok ? styles.ok : ui.error}>{notice.message}</Text> : null;

  if (!onServer || !status || !status.configured) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {noticeView}
        {loading ? <Loading /> : <Gate title={t.whoop} detail={!onServer || status ? t.whoopNotSetUp : t.error} />}
      </Screen>
    );
  }

  if (!status.connected) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {noticeView}
        <Gate title={t.connectWhoop} detail={`${t.recovery} · ${t.sleep} · ${t.strain}`}>
          <Button title={busy === "connect" ? t.connecting : t.connectWhoop} disabled={busy !== null} onPress={connect} />
        </Gate>
      </Screen>
    );
  }

  const latest = summary?.latest;
  const show = (key: keyof NonNullable<typeof latest>, format: (value: number) => string) => {
    const item = latest?.[key];
    return item ? format(item.value) : "–";
  };
  const recovery = latest?.recovery?.value ?? null;
  const bars = summary ? recentRecovery(summary.daily) : [];
  const strainVsRecovery = summary?.strain_vs_recovery;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      {noticeView}
      {summary && !summary.has_data ? <EmptyState>{t.connecting}</EmptyState> : null}

      <Hero>
        <RingGauge value={(recovery ?? 0) / 100} size={96} thickness={11} label={recovery === null ? "–" : `${Math.round(recovery)}%`} sublabel={t.recovery} color={colors.accentInk} track="rgba(0,0,0,0.14)" hole={colors.accent} labelColor={colors.accentInk} />
        <View style={{ flex: 1, gap: 10 }}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Metric onLime label="HRV" value={show("hrv", (v) => `${Math.round(v)}`)} unit="ms" />
            </View>
            <View style={{ flex: 1 }}>
              <Metric onLime label={t.rhr} value={show("resting_hr", (v) => `${Math.round(v)}`)} />
            </View>
          </View>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Metric onLime label={t.strain} value={show("strain", (v) => v.toFixed(1))} />
            </View>
            <View style={{ flex: 1 }}>
              <Metric onLime label={t.sleepPerf} value={show("sleep_performance", (v) => `${Math.round(v)}%`)} />
            </View>
          </View>
        </View>
      </Hero>

      {bars.length ? (
        <Card
          title={t.recovery14}
          action={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={type.tileLabel}>● {t.good}</Text>
              <Text style={type.tileLabel}>◐ {t.mid}</Text>
              <Text style={type.tileLabel}>○ {t.poor}</Text>
            </View>
          }
        >
          <View style={styles.chart} accessibilityRole="image" accessibilityLabel={t.recovery14}>
            {bars.map((bar) => {
              const zone = bar.zone ?? zoneFor(bar.value);
              return (
                <View key={bar.date} style={styles.barSlot}>
                  <View style={[styles.bar, bar.value === null ? styles.barEmpty : { height: `${Math.max(4, bar.value) * 0.8}%` }, zone === "green" && { backgroundColor: colors.accent }, zone === "yellow" && { backgroundColor: colors.sage }, zone === "red" && styles.barPoor]} />
                  <Text style={styles.barGlyph}>{zone === "green" ? "●" : zone === "yellow" ? "◐" : zone === "red" ? "○" : " "}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {summary?.has_data ? (
        <Card title={`${t.week} · −1`}>
          {summary.metrics.map((metric) => {
            const change = describeChange(metric);
            const { label, format } = metricLabels[metric.key];
            return <ListRow key={metric.key} title={label} subtitle={change?.text ?? (metric.prev7 === null ? null : format(metric.prev7))} badges={change && change.tone !== "neutral" ? <Badge tone={toneToBadge(change.tone)} glyph={toneGlyph(change.tone)}>{metric.prev7 === null ? "" : format(metric.prev7)}</Badge> : undefined} meta={metric.last7 === null ? "–" : format(metric.last7)} />;
          })}
        </Card>
      ) : null}

      {strainVsRecovery && strainVsRecovery.after_high_strain !== null && strainVsRecovery.after_lower_strain !== null ? (
        <Card title={`${t.strain} → ${t.recovery}`}>
          <GoalBar label={`${t.strain} ${strainVsRecovery.high_strain_threshold}+ · ${strainVsRecovery.high_strain_days}`} value={`${Math.round(strainVsRecovery.after_high_strain)}%`} percent={strainVsRecovery.after_high_strain} color={colors.ink} />
          <GoalBar label={`${t.strain} <${strainVsRecovery.high_strain_threshold}`} value={`${Math.round(strainVsRecovery.after_lower_strain)}%`} percent={strainVsRecovery.after_lower_strain} />
        </Card>
      ) : null}

      {summary?.workouts.count ? (
        <Card title={t.workouts}>
          {summary.workouts.by_sport.slice(0, 6).map((sport) => (
            <ListRow key={sport.sport} title={sport.sport.replace(/-/g, " ")} subtitle={`${sport.count} ×`} meta={`${sport.minutes} ${t.min}`} />
          ))}
        </Card>
      ) : null}

      <Card title={t.aiSummary}>
        {!status.ai_configured ? (
          <EmptyState>{t.notYet}</EmptyState>
        ) : insight ? (
          <View style={{ gap: 4 }}>
            <Text style={styles.arabic}>{insight.summary}</Text>
            {[...insight.highlights, ...insight.recommendations].map((line) => (
              <Text key={line} style={styles.arabic}>
                {`• ${line}`}
              </Text>
            ))}
            <Text style={[type.rowSubtitle, { marginTop: 4 }]}>
              {insight.period_start} → {insight.period_end}
            </Text>
          </View>
        ) : (
          <EmptyState>{t.notYet}</EmptyState>
        )}
        {status.ai_configured ? <Button variant="outline" title={busy === "insight" ? t.generating : t.regenerate} disabled={busy !== null || !summary?.has_data} onPress={writeInsight} /> : null}
      </Card>

      <Card title={t.connection}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={type.rowSubtitle}>{t.lastSync}</Text>
          <Text style={[type.barValue, { flexShrink: 1 }]}>{status.last_sync_error ?? syncedAgo(status.last_synced_at)}</Text>
        </View>
        {status.last_sync_error?.includes("again") ? <Button variant="outline" title={t.connectWhoop} disabled={busy !== null} onPress={connect} /> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title={busy === "sync" ? `${t.syncNow}…` : t.syncNow} disabled={busy !== null} onPress={sync} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="outline" title={t.disconnect} disabled={busy !== null} onPress={disconnect} />
          </View>
        </View>
      </Card>
    </Screen>
  );
}

/** Not connected, or not set up: the WHOOP mark, a line, and the way forward. */
function Gate({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
      <View style={styles.gateMark}>
        <Text style={styles.gateGlyph}>W</Text>
      </View>
      <Text style={type.h2}>{title}</Text>
      <Text style={[type.rowSubtitle, { fontSize: 13, textAlign: "center" }]}>{detail}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  ok: { fontFamily: fonts.medium, fontSize: 14, color: colors.accent },
  heroRow: { flexDirection: "row", gap: 10 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 72, gap: 4 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 3 },
  bar: { width: "100%", flexShrink: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barEmpty: { height: 4, backgroundColor: colors.hairline },
  barPoor: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink },
  barGlyph: { fontSize: 9, color: colors.inkMuted },
  gateMark: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  gateGlyph: { fontFamily: fonts.bold, fontSize: 22, color: colors.urgentInk },
  // The AI summary is Arabic: right-to-left, whatever the rest of the screen does.
  arabic: { fontFamily: "Almarai_400Regular", fontSize: 14, lineHeight: 25, color: colors.ink, writingDirection: "rtl", textAlign: "right" }
});
