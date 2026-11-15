import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { EmptyState, ListRow } from "@/components/drift";
import { Chip, openSeerrUser, StatusPill, UserAvatar } from "@/components/seerr-parts";
import { BleedRow, Button, Screen, SearchBar } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { formatDate, t } from "@/lib/i18n";
import { avatarUrl, mt, USER_SORTS, type SeerrUser, type UserSort } from "@/lib/seerr";

const PAGE = 25;

// Seerr's Users page: everyone with a Seerr account, searchable, by name, most requests or newest. For people
// who manage users.
export default function Users() {
  const seerr = useSeerr();
  const client = seerr.client;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<UserSort>("displayname");
  const [items, setItems] = useState<SeerrUser[]>([]);
  const [pages, setPages] = useState({ page: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [searched, setSearched] = useState("");

  const load = useCallback(
    async (page: number) => {
      if (!client) return;
      setLoading(true);
      try {
        const body = await client.userPage(searched, sort, (page - 1) * PAGE, PAGE);
        setItems((before) => (page === 1 ? body.results : [...before, ...body.results.filter((user) => !before.some((old) => old.id === user.id))]));
        setPages({ page, pages: body.pageInfo.pages });
        setFailed(null);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : t.tryAgain);
      } finally {
        setLoading(false);
      }
    },
    [client, searched, sort]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return (
    <Screen title={mt.users} refreshing={loading && pages.page <= 1} onRefresh={() => load(1)}>
      <SearchBar placeholder={mt.searchUsers} value={query} onChangeText={(text) => (setQuery(text), text.trim() ? undefined : setSearched(""))} onSubmitEditing={() => setSearched(query)} returnKeyType="search" />
      <BleedRow>
        {USER_SORTS.map((option) => (
          <Chip key={option} label={mt.userSorts[option]} selected={option === sort} onPress={() => setSort(option)} />
        ))}
      </BleedRow>
      {failed ? <EmptyState>{failed}</EmptyState> : null}
      <View>
        {items.map((user, index) => {
          const name = user.displayName ?? `#${user.id}`;
          return (
            <ListRow
              key={user.id}
              first={index === 0}
              leading={<UserAvatar uri={avatarUrl(user.avatar, seerr.serverUrl)} name={name} />}
              title={name}
              badges={(user.permissions & 2) !== 0 ? <StatusPill badge={{ label: mt.roleAdmin, glyph: "★", tone: "accent" }} /> : undefined}
              subtitle={[user.userType ? mt.userTypes[user.userType] : null, mt.requestCount(user.requestCount ?? 0), user.createdAt ? mt.joined(formatDate(user.createdAt)) : null].filter(Boolean).join(" · ")}
              onPress={() => openSeerrUser(user.id)}
            />
          );
        })}
      </View>
      {!items.length && !failed ? <EmptyState>{loading || !seerr.ready ? `${t.loading}…` : mt.nothingFound}</EmptyState> : null}
      {pages.page > 0 && pages.page < pages.pages ? <Button variant="outline" title={loading ? `${t.loading}…` : mt.loadMore} disabled={loading} onPress={() => load(pages.page + 1)} /> : null}
    </Screen>
  );
}
