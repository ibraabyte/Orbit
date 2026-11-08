import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type } from "@/components/drift";
import { Chip } from "@/components/seerr-parts";
import {
  canRequest4k,
  canRequestAdvanced,
  chosenService,
  mt,
  servicesFor,
  type RequestChoice,
  type SeerrClient,
  type SeerrMediaType,
  type SeerrService,
  type SeerrServiceDetails,
  type SeerrUser
} from "@/lib/seerr";

type Loaded<T> = T | "loading" | "failed";

// What Seerr lets this person pick when requesting: 4K (if a 4K server exists and they may ask for 4K), and the
// server, quality profile and folder (if they have "Advanced requests" or manage requests). Nothing is offered
// otherwise, and the request goes out with Seerr's defaults, like before.
export function useRequestOptions(client: SeerrClient | null, kind: SeerrMediaType, user: SeerrUser | null) {
  const advanced = canRequestAdvanced(user);
  const may4k = canRequest4k(user, kind);
  const [services, setServices] = useState<Loaded<SeerrService[]>>("loading");
  const [details, setDetails] = useState<Record<number, Loaded<SeerrServiceDetails>>>({});

  useEffect(() => {
    if (!client || !user) return;
    if (!advanced && !may4k) return setServices([]);
    let live = true;
    setServices("loading");
    client
      .services(kind)
      .then((list) => live && setServices(Array.isArray(list) ? list : []))
      .catch(() => live && setServices("failed"));
    return () => {
      live = false;
    };
  }, [client, kind, user, advanced, may4k]);

  const list = Array.isArray(services) ? services : [];
  const offer4k = may4k && servicesFor(list, true).length > 0;
  const hasOptions = offer4k || (advanced && list.length > 0) || (advanced && services === "failed");

  const loadDetails = useCallback(
    (serverId: number) => {
      if (!client || !advanced || details[serverId]) return;
      setDetails((before) => ({ ...before, [serverId]: "loading" }));
      client
        .service(kind, serverId)
        .then((found) => setDetails((before) => ({ ...before, [serverId]: found })))
        .catch(() => setDetails((before) => ({ ...before, [serverId]: "failed" })));
    },
    [client, advanced, details, kind]
  );

  return { advanced, offer4k, hasOptions, services, list, details, loadDetails };
}

export type RequestOptionsState = ReturnType<typeof useRequestOptions>;

export function RequestOptions({
  options,
  choice,
  onChange,
  allowStandard = true,
  allow4k = true
}: {
  options: RequestOptionsState;
  choice: RequestChoice;
  onChange: (next: RequestChoice) => void;
  allowStandard?: boolean;
  allow4k?: boolean;
}) {
  const server = chosenService(options.list, choice);
  const servers = servicesFor(options.list, choice.is4k);
  const found = server ? options.details[server.id] : undefined;
  const { loadDetails, advanced } = options;

  const serverId = server?.id ?? null;
  useEffect(() => {
    if (advanced && serverId !== null) loadDetails(serverId);
  }, [advanced, serverId, loadDetails]);

  const loaded = found && found !== "loading" && found !== "failed" ? found : null;
  const defaultProfile = loaded?.profiles.find((profile) => profile.id === server?.activeProfileId);
  const defaultFolder = server?.activeDirectory;
  const failed = options.services === "failed" || found === "failed";

  return (
    <View style={{ gap: 12 }}>
      {options.offer4k ? (
        <Group label={mt.quality}>
          {allowStandard ? <Chip label={mt.standard} selected={!choice.is4k} onPress={() => onChange({ is4k: false, serverId: null, profileId: null, rootFolder: null })} /> : null}
          {allow4k ? <Chip label={mt.fourK} selected={choice.is4k} onPress={() => onChange({ is4k: true, serverId: null, profileId: null, rootFolder: null })} /> : null}
        </Group>
      ) : null}

      {advanced && servers.length > 1 ? (
        <Group label={mt.server}>
          {servers.map((item) => (
            <Chip key={item.id} label={item.name} selected={server?.id === item.id} onPress={() => onChange({ ...choice, serverId: item.id, profileId: null, rootFolder: null })} />
          ))}
        </Group>
      ) : null}

      {advanced && loaded && loaded.profiles.length ? (
        <Group label={mt.profile}>
          <Chip label={defaultProfile ? mt.serverDefault(defaultProfile.name) : mt.serverDefault("—")} selected={choice.profileId === null} onPress={() => onChange({ ...choice, serverId: server?.id ?? null, profileId: null })} />
          {loaded.profiles
            .filter((profile) => profile.id !== defaultProfile?.id)
            .map((profile) => (
              <Chip key={profile.id} label={profile.name} selected={choice.profileId === profile.id} onPress={() => onChange({ ...choice, serverId: server?.id ?? null, profileId: profile.id })} />
            ))}
        </Group>
      ) : null}

      {advanced && loaded && loaded.rootFolders.length > 1 ? (
        <Group label={mt.folder}>
          <Chip label={mt.serverDefault(defaultFolder ?? "—")} selected={choice.rootFolder === null} onPress={() => onChange({ ...choice, serverId: server?.id ?? null, rootFolder: null })} />
          {loaded.rootFolders
            .filter((folder) => folder.path !== defaultFolder)
            .map((folder) => (
              <Chip key={folder.id} label={`\u2068${folder.path}\u2069`} selected={choice.rootFolder === folder.path} onPress={() => onChange({ ...choice, serverId: server?.id ?? null, rootFolder: folder.path })} />
            ))}
        </Group>
      ) : null}

      {advanced && found === "loading" ? <Text style={type.rowSubtitle}>{mt.fetching}…</Text> : null}
      {failed ? <Text style={type.rowSubtitle}>{mt.optionsFailed}</Text> : null}
      {!advanced && options.offer4k ? <Text style={type.rowSubtitle}>{mt.defaultOnly}</Text> : null}
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.tileLabel}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}
