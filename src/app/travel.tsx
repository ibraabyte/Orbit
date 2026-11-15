import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Chip, Chips } from "@/components/chips";
import { Badge, Card, EmptyState, IconTile, ListRow, type } from "@/components/drift";
import { toDateKey, useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi, hasServer } from "@/lib/backend";
import {
  addDays,
  airportLabel,
  dayText,
  defaultDates,
  flightLine,
  flightTitle,
  hotelLine,
  hotelPrice,
  matchAirports,
  placeName,
  priceLevelText,
  priceText,
  searchProblem,
  travelApi,
  tripBody,
  tx,
  type Airport,
  type Cabin,
  type Flight,
  type FlightResults,
  type Hotel,
  type HotelResults,
  type Stops,
  type TravelKey,
  type TravelOverview,
  type TripSearch
} from "@/lib/travel";

const CABINS: Cabin[] = ["economy", "premium", "business", "first"];
const STOPS: Stops[] = ["any", "nonstop", "one"];
const TRIP_KINDS = ["round", "oneway"] as const;
const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));

// Travel: where from, where to and the days; flight and hotel options from Google through the person's own SerpApi
// key; pick one of each and the trip lands in Tasks as its own list. Nothing is booked here.
export default function Travel() {
  const onServer = hasServer();
  const { pickDate, toast } = useOverlays();
  // The new tasks show up in Tasks and on Today straight away.
  const { refresh: refreshTasks } = useDashboardData();
  const today = toDateKey(new Date());
  const [overview, setOverview] = useState<TravelOverview | null>(null);
  const [loading, setLoading] = useState(onServer);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<TripSearch>(() => ({ origin: "RUH", destination: "", adults: 1, cabin: "economy", stops: "any", place: "", ...defaultDates(today) }));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [flights, setFlights] = useState<FlightResults | null>(null);
  const [hotels, setHotels] = useState<HotelResults | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [passportWarning, setPassportWarning] = useState(false);

  const load = useCallback(async () => {
    if (!onServer) return;
    setLoading(true);
    try {
      setOverview(await travelApi.overview(getApi()));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [onServer]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const airports = overview?.airports ?? [];
  const change = (next: Partial<TripSearch>) => {
    setSearch((current) => ({ ...current, ...next }));
    // New days or places: old results no longer match.
    setFlights(null);
    setHotels(null);
    setFlight(null);
    setHotel(null);
  };

  const run = async () => {
    const problem = searchProblem(search, today);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setPassportWarning(false);
    const place = search.place.trim() || placeName(airports, search.destination);
    const [foundFlights, foundHotels] = await Promise.allSettled([
      travelApi.flights(getApi(), search),
      search.return_on ? travelApi.hotels(getApi(), search, place) : Promise.resolve(null)
    ]);
    setFlights(foundFlights.status === "fulfilled" ? foundFlights.value : null);
    setHotels(foundHotels.status === "fulfilled" ? foundHotels.value : null);
    setFlight(null);
    setHotel(null);
    const failed = [foundFlights, foundHotels].find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
    setBusy(false);
  };

  const addTrip = async () => {
    const problem = searchProblem(search, today);
    if (problem) {
      setError(problem);
      return;
    }
    setAdding(true);
    try {
      const place = placeName(airports, search.destination);
      const added = await travelApi.addTrip(getApi(), tripBody(search, place, flight, hotel, flights?.google_url ?? null, flights?.currency ?? hotels?.currency ?? "SAR"));
      setPassportWarning(added.passport_warning);
      await refreshTasks();
      toast(tx.tripAdded(added.tasks));
      if (!added.passport_warning) router.push("/tasks");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setAdding(false);
    }
  };

  const chooseDay = async (which: "depart_on" | "return_on") => {
    const picked = await pickDate(which === "depart_on" ? tx.dayOut : tx.dayBack, search[which] ?? search.depart_on);
    if (!picked) return;
    if (which === "depart_on" && search.return_on && search.return_on <= picked) change({ depart_on: picked, return_on: null });
    else change({ [which]: picked });
  };

  if (!onServer || (!overview && !loading)) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <EmptyState icon="plane">{error ?? tx.keyNeeded}</EmptyState>
      </Screen>
    );
  }
  if (!overview) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <Loading />
      </Screen>
    );
  }

  const linked = overview.key.connected;
  const destination = search.destination ? placeName(airports, search.destination) : "";
  const levelLine = flights ? priceLevelText(flights) : null;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Card>
        <Text style={type.rowSubtitle}>{tx.intro}</Text>
        <AirportField label={tx.from} airports={airports} value={search.origin} onChange={(origin) => change({ origin })} />
        <AirportField label={tx.to} airports={airports} value={search.destination} onChange={(destination) => change({ destination })} />
        <Chips options={TRIP_KINDS} value={search.return_on ? "round" : "oneway"} label={(kind) => (kind === "round" ? tx.roundTrip : tx.oneWay)} onChange={(kind) => change({ return_on: kind === "round" ? addDays(search.depart_on, 5) : null })} />
        <ListRow first leading={<IconTile name="calendar" />} title={tx.dayOut} subtitle={dayText(search.depart_on)} onPress={() => void chooseDay("depart_on")} chevron />
        {search.return_on ? (
          <ListRow leading={<IconTile name="calendar" />} title={tx.dayBack} subtitle={dayText(search.return_on)} onPress={() => void chooseDay("return_on")} chevron />
        ) : null}
        <Chips options={["1", "2", "3", "4"] as const} value={String(Math.min(search.adults, 4)) as "1" | "2" | "3" | "4"} label={(n) => tx.travelers(Number(n))} onChange={(n) => change({ adults: Number(n) })} />
        <Chips options={CABINS} value={search.cabin} label={(cabin) => tx.cabin[cabin]} onChange={(cabin) => change({ cabin })} />
        <Chips options={STOPS} value={search.stops} label={(stops) => tx.stopsChoice[stops]} onChange={(stops) => change({ stops })} />
        {search.return_on ? <Input accessibilityLabel={tx.stayIn} placeholder={destination ? tx.stayInPh(destination) : tx.stayIn} value={search.place} onChangeText={(place) => setSearch((current) => ({ ...current, place }))} maxLength={120} /> : null}
        <Button title={busy ? tx.searching : tx.search} disabled={busy || !linked} onPress={() => void run()} />
        <Text style={type.rowSubtitle}>{linked ? tx.searchCost : tx.keyNeeded}</Text>
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Card>

      {flights ? (
        <Card title={tx.flights}>
          {levelLine ? <Text style={type.rowSubtitle}>{levelLine}</Text> : null}
          {search.return_on && flights.flights.length ? <Text style={type.rowSubtitle}>{tx.roundTripPrice}</Text> : null}
          {!flights.flights.length ? <Text style={type.rowSubtitle}>{tx.noFlights}</Text> : null}
          {flights.flights.map((option, index) => {
            const picked = flight === option;
            return (
              <ListRow
                key={index}
                first={index === 0}
                leading={<IconTile name="plane" tone={picked ? "accent" : "neutral"} />}
                title={flightTitle(option)}
                badges={picked ? <Badge tone="success">{tx.picked}</Badge> : option.best ? <Badge tone="accent">{tx.best}</Badge> : undefined}
                subtitle={`${priceText(option.price, flights.currency)}\n${flightLine(option)}`}
                onPress={() => setFlight(picked ? null : option)}
              />
            );
          })}
          {flights.google_url ? <Button variant="outline" title={tx.openGoogle} onPress={() => open(flights.google_url!)} /> : null}
        </Card>
      ) : null}

      {hotels ? (
        <Card title={tx.hotels}>
          {!hotels.hotels.length ? <Text style={type.rowSubtitle}>{tx.noHotels}</Text> : null}
          {hotels.hotels.map((option, index) => {
            const picked = hotel === option;
            return (
              <ListRow
                key={index}
                first={index === 0}
                leading={<IconTile name="bed" tone={picked ? "accent" : "neutral"} />}
                title={option.name}
                badges={picked ? <Badge tone="success">{tx.picked}</Badge> : undefined}
                subtitle={[hotelPrice(option, hotels.currency), hotelLine(option)].filter(Boolean).join("\n")}
                onPress={() => setHotel(picked ? null : option)}
                trailing={option.link ? <Chip label={tx.openHotel} onPress={() => open(option.link!)} /> : undefined}
              />
            );
          })}
          {hotels.google_url ? <Button variant="outline" title={tx.openGoogle} onPress={() => open(hotels.google_url!)} /> : null}
        </Card>
      ) : null}

      {flights || hotels ? (
        <Card>
          {!flight && !hotel ? <Text style={type.rowSubtitle}>{tx.addHint}</Text> : null}
          <Button variant="primary" title={adding ? tx.addingTrip : tx.addTrip} disabled={adding} onPress={() => void addTrip()} />
          {passportWarning ? (
            <>
              <Text style={ui.error}>{tx.passportWarning}</Text>
              <Button variant="outline" title={tx.openTasks} onPress={() => router.push("/tasks")} />
            </>
          ) : null}
        </Card>
      ) : null}

      <KeyCard status={overview.key} signupUrl={overview.signup_url} onChange={load} />
    </Screen>
  );
}

// One airport: the picked one as a chip (tap to change), or a field that suggests airports as you type. A code not in
// the list can be typed in full.
function AirportField({ label, airports, value, onChange }: { label: string; airports: Airport[]; value: string; onChange: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchAirports(airports, query), [airports, query]);
  const picked = airports.find((airport) => airport.code === value);
  if (value) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={type.sectionLabel}>{label}</Text>
        <View style={{ flexDirection: "row" }}>
          <Chip selected label={picked ? airportLabel(picked) : value} accessibilityLabel={`${label}: ${picked ? airportLabel(picked) : value}`} onPress={() => onChange("")} />
        </View>
      </View>
    );
  }
  const typedCode = /^[A-Za-z]{3}$/.test(query.trim()) && !matches.some((airport) => airport.code === query.trim().toUpperCase());
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.sectionLabel}>{label}</Text>
      <Input accessibilityLabel={label} placeholder={tx.airportPh} value={query} onChangeText={setQuery} autoCorrect={false} />
      {matches.length || typedCode ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {matches.map((airport) => (
            <Chip
              key={airport.code}
              label={airportLabel(airport)}
              onPress={() => {
                setQuery("");
                onChange(airport.code);
              }}
            />
          ))}
          {typedCode ? (
            <Chip
              label={query.trim().toUpperCase()}
              onPress={() => {
                onChange(query.trim().toUpperCase());
                setQuery("");
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// The person's own SerpApi key: paste it once, see that it is linked, unlink.
function KeyCard({ status, signupUrl, onChange }: { status: TravelKey; signupUrl: string; onChange: () => void | Promise<void> }) {
  const { sheet } = useOverlays();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const connect = async () => {
    setBusy(true);
    try {
      const linked = await travelApi.connect(getApi(), key);
      setKey("");
      setNotice({ ok: true, message: linked.searches_left === null ? tx.keyConnected : `${tx.keyConnected} ${tx.keySearchesLeft(linked.searches_left)}` });
      await onChange();
    } catch (connectError) {
      setNotice({ ok: false, message: connectError instanceof Error ? connectError.message : String(connectError) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    sheet({
      title: tx.keyUnlinkTitle,
      detail: tx.keyUnlinkDetail,
      options: [
        {
          label: tx.keyDisconnect,
          destructive: true,
          run: () =>
            void (async () => {
              setBusy(true);
              try {
                await travelApi.disconnect(getApi());
                setNotice({ ok: true, message: tx.keyUnlinked });
                await onChange();
              } catch (disconnectError) {
                setNotice({ ok: false, message: disconnectError instanceof Error ? disconnectError.message : String(disconnectError) });
              } finally {
                setBusy(false);
              }
            })()
        }
      ]
    });

  return (
    <Card title={tx.key} action={status.connected ? <Badge tone="success">{tx.keyLinked}</Badge> : null}>
      {notice ? <Text style={notice.ok ? { color: colors.success } : ui.error}>{notice.message}</Text> : null}
      {status.connected ? (
        <>
          <ListRow first leading={<IconTile name="search" />} title="SerpApi" subtitle={tx.keyConnected} />
          <Button variant="outline" title={tx.keyDisconnect} disabled={busy} onPress={disconnect} />
        </>
      ) : (
        <>
          <Text style={type.rowSubtitle}>{tx.keyIntro}</Text>
          <Input accessibilityLabel={tx.keyPh} placeholder={tx.keyPh} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
          <Button title={busy ? tx.keyConnecting : tx.keyConnect} disabled={busy || key.trim().length < 20} onPress={() => void connect()} />
          <Button variant="outline" title={tx.keyOpenSite} onPress={() => open(signupUrl)} />
        </>
      )}
    </Card>
  );
}
