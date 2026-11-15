import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { Card, EmptyState, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { openTitle, Poster, PosterRail, StatusPill, UserAvatar } from "@/components/seerr-parts";
import { Button, Screen } from "@/components/screen";
import { colors, space } from "@/components/theme";
import { useSeerr } from "@/hooks/use-seerr";
import { formatDate, t } from "@/lib/i18n";
import {
  avatarUrl,
  canManageUsers,
  flipPermission,
  mt,
  quotaLine,
  requestBadge,
  seerrTitle,
  USER_PERMISSIONS,
  type SeerrQuota,
  type SeerrRequest,
  type SeerrResult,
  type SeerrUser
} from "@/lib/seerr";

const ADMIN = 2;
type Look = { title: string; posterPath?: string | null };

// One Seerr user, like their profile in Seerr: who they are, their quota, recent requests and watchlist, and for
// people who manage users, their permissions and deleting the account.
export default function SeerrUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const seerr = useSeerr();
  const client = seerr.client;
  const { sheet } = useOverlays();
  const [user, setUser] = useState<SeerrUser | null>(null);
  const [quota, setQuota] = useState<SeerrQuota | null>(null);
  const [requests, setRequests] = useState<SeerrRequest[]>([]);
  const [looks, setLooks] = useState<Record<number, Look>>({});
  const [watchlist, setWatchlist] = useState<SeerrResult[]>([]);
  const [permissions, setPermissions] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manages = canManageUsers(seerr.user);

  const load = useCallback(() => {
    if (!client || !userId) return;
    void client.user(userId).then(
      (next) => {
        setUser(next);
        setPermissions(next.permissions);
      },
      (error: Error) => setFailed(error.message)
    );
    void client.quota(userId).then(setQuota, () => setQuota(null));
    void client.userWatchlist(userId).then(setWatchlist, () => setWatchlist([]));
    void client.userRequests(userId, 10).then(
      (body) => {
        setRequests(body.results);
        for (const request of body.results) {
          void client
            .details(request.type, request.media.tmdbId)
            .then((item) => setLooks((before) => ({ ...before, [request.id]: { title: seerrTitle(item), posterPath: item.posterPath } })))
            .catch(() => undefined);
        }
      },
      () => setRequests([])
    );
  }, [client, userId]);

  useEffect(load, [load]);

  if (!user || permissions === null) {
    return (
      <Screen title={mt.users}>
        <EmptyState>{failed ?? `${t.loading}…`}</EmptyState>
      </Screen>
    );
  }

  const name = user.displayName ?? `#${user.id}`;
  const quotas = [quotaLine(quota?.movie, "movie"), quotaLine(quota?.tv, "tv")].filter(Boolean) as string[];
  const isAdmin = (permissions & ADMIN) !== 0;
  const changed = permissions !== user.permissions;

  const save = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (after) after();
      else load();
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={name} onRefresh={load} refreshing={false}>
      <Card style={{ gap: space.md, paddingVertical: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <UserAvatar uri={avatarUrl(user.avatar, seerr.serverUrl)} name={name} size={64} />
          <View style={{ flex: 1, gap: space.xxs }}>
            <Text style={type.rowTitle}>{name}</Text>
            {user.email ? <Text style={type.rowSubtitle}>{user.email}</Text> : null}
            <Text style={type.rowSubtitle}>
              {[(user.permissions & ADMIN) !== 0 ? mt.roleAdmin : mt.roleUser, user.userType ? mt.userTypes[user.userType] : null, mt.requestCount(user.requestCount ?? 0), user.createdAt ? mt.joined(formatDate(user.createdAt)) : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>
        {quotas.map((line) => (
          <Text key={line} style={type.rowSubtitle}>
            {line}
          </Text>
        ))}
      </Card>

      {requests.length ? (
        <Card title={mt.recentRequests}>
          {requests.map((request, index) => {
            const look = looks[request.id];
            const title = look?.title ?? (request.type === "tv" ? mt.series : mt.movie);
            return (
              <ListRow
                key={request.id}
                first={index === 0}
                leading={<Poster path={look?.posterPath} title={title} width={36} />}
                title={title}
                badges={<StatusPill badge={requestBadge(request.status)} />}
                subtitle={formatDate(request.createdAt)}
                onPress={() => openTitle(request.type, request.media.tmdbId)}
              />
            );
          })}
        </Card>
      ) : null}

      <PosterRail title={mt.rows.watchlist} items={watchlist} />

      {manages ? (
        <Card title={mt.permissions}>
          {USER_PERMISSIONS.filter((permission) => !isAdmin || permission.bit === ADMIN).map((permission, index) => (
            <View key={permission.key} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.surfaceInset }}>
              <Text style={[type.rowTitle, { flex: 1 }]}>{mt.permissionNames[permission.key]}</Text>
              <Switch
                value={(permissions & permission.bit) !== 0}
                // The owner (user 1) can't lose admin.
                disabled={busy || (user.id === 1 && permission.bit === ADMIN)}
                onValueChange={() => setPermissions(flipPermission(permissions, permission.bit))}
                trackColor={{ true: colors.accent, false: colors.hairline }}
              />
            </View>
          ))}
          {isAdmin ? <Text style={type.rowSubtitle}>{mt.adminHasAll}</Text> : null}
          {changed ? (
            <View style={{ gap: space.sm, paddingTop: space.sm }}>
              <Button variant="primary" disabled={busy} title={mt.savePermissions} onPress={() => void save(() => client!.setPermissions(user.id, permissions))} />
              <Button variant="outline" title={t.cancel} onPress={() => setPermissions(user.permissions)} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {manages && user.id !== 1 && user.id !== seerr.user?.id ? (
        <Button
          variant="outline"
          disabled={busy}
          title={mt.deleteUser}
          onPress={() => sheet({ title: mt.deleteUser, detail: `${name}\n${mt.deleteUserDetail}`, options: [{ label: mt.deleteUser, destructive: true, run: () => void save(() => client!.deleteUser(user.id), () => router.back()) }] })}
        />
      ) : null}
    </Screen>
  );
}
