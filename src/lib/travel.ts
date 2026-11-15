import type { ApiClient } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import { digits, formatDate, isArabic } from "@/lib/i18n";

// The travel assistant lives on Orbit's own server (backend/app/routers/travel.py): flight and hotel options from
// Google through the user's own SerpApi key, and a trip turned into a task list. Nothing is booked here; each option
// opens Google to book. Shapes mirror the server's JSON.

export type Airport = { code: string; city: string; city_ar: string; country: string };
export type TravelKey = { connected: boolean; connected_at: string | null };
export type TravelOverview = { key: TravelKey; airports: Airport[]; signup_url: string };
export type KeyConnected = TravelKey & { plan: string | null; searches_left: number | null };

export type Cabin = "economy" | "premium" | "business" | "first";
export type Stops = "any" | "nonstop" | "one";

export type Leg = {
  airline: string;
  flight_number: string | null;
  from_code: string;
  from_name: string | null;
  // Local time at that airport, without a zone ("2026-12-05T08:30:00").
  departs: string | null;
  to_code: string;
  to_name: string | null;
  arrives: string | null;
  minutes: number | null;
};

export type Flight = {
  price: number | null;
  minutes: number | null;
  stops: number;
  airline: string;
  airline_logo: string | null;
  legs: Leg[];
  layovers: string[];
  best: boolean;
  departs: string | null;
  arrives: string | null;
};

export type FlightResults = { flights: Flight[]; google_url: string | null; lowest_price: number | null; price_level: string | null; typical_range: [number, number] | null; currency: string };

export type Hotel = {
  name: string;
  kind: string;
  stars: number | null;
  rating: number | null;
  reviews: number | null;
  per_night: number | null;
  total: number | null;
  link: string | null;
  image: string | null;
  amenities: string[];
  check_in_time: string | null;
  check_out_time: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type HotelResults = { hotels: Hotel[]; google_url: string | null; currency: string };

export type TripSearch = {
  origin: string;
  destination: string;
  depart_on: string;
  return_on: string | null;
  adults: number;
  cabin: Cabin;
  stops: Stops;
  // Where to look for a place to stay; the destination city when left empty.
  place: string;
};

export type TripAdded = { list_id: string; list_name: string; tasks: number; passport_warning: boolean };

type Api = Pick<ApiClient, "get" | "post" | "put" | "delete">;
const language = isArabic ? "ar" : "en";

export const travelApi = {
  overview: (api: Api) => api.get<TravelOverview>("/travel"),
  connect: (api: Api, apiKey: string) => api.put<KeyConnected>("/travel/key", { api_key: apiKey.trim() }),
  disconnect: (api: Api) => api.delete("/travel/key"),
  flights: (api: Api, search: TripSearch) =>
    api.post<FlightResults>("/travel/flights", {
      origin: search.origin,
      destination: search.destination,
      depart_on: search.depart_on,
      return_on: search.return_on,
      adults: search.adults,
      cabin: search.cabin,
      stops: search.stops,
      language
    }),
  hotels: (api: Api, search: TripSearch, place: string) =>
    api.post<HotelResults>("/travel/hotels", { place, check_in: search.depart_on, check_out: search.return_on, adults: search.adults, language }),
  addTrip: (api: Api, body: ReturnType<typeof tripBody>) => api.post<TripAdded>("/travel/trips", body)
};

/** Airports whose code or city (English or Arabic) starts with, or contains, what was typed. Exact code first. */
export function matchAirports(airports: Airport[], query: string, limit = 6): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (airport: Airport) => {
    const names = [airport.city.toLowerCase(), airport.city_ar];
    if (airport.code.toLowerCase() === q) return 0;
    if (names.some((name) => name.startsWith(q))) return 1;
    if (names.some((name) => name.includes(q))) return 2;
    return 9;
  };
  return airports
    .map((airport) => ({ airport, rank: score(airport) }))
    .filter((found) => found.rank < 9)
    .sort((a, b) => a.rank - b.rank || a.airport.city.localeCompare(b.airport.city))
    .slice(0, limit)
    .map((found) => found.airport);
}

export const cityOf = (airport: Airport) => (isArabic ? airport.city_ar : airport.city);
export const airportLabel = (airport: Airport) => `${cityOf(airport)} · ${airport.code}`;

/** A three-letter code typed by hand, for an airport not in the list. */
export const looksLikeCode = (value: string) => /^[A-Za-z]{3}$/.test(value.trim());

/** The place a hotel search and the task list are named after: the city when known, otherwise the code. */
export function placeName(airports: Airport[], code: string) {
  const found = airports.find((airport) => airport.code === code.toUpperCase());
  return found ? cityOf(found) : code.toUpperCase();
}

export function addDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function nightsBetween(from: string, to: string | null) {
  if (!to) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The search form's opening days: two weeks out, back five nights later. */
export function defaultDates(today: string) {
  const out = addDays(today, 14);
  return { depart_on: out, return_on: addDays(out, 5) };
}

export function searchProblem(search: TripSearch, today: string): string | null {
  if (!looksLikeCode(search.origin) || !looksLikeCode(search.destination)) return tx.pickAirports;
  if (search.origin.toUpperCase() === search.destination.toUpperCase()) return tx.sameAirport;
  if (search.depart_on < today) return tx.pastDay;
  if (search.return_on && search.return_on <= search.depart_on) return tx.backBeforeOut;
  return null;
}

// The time part of a local "2026-12-05T08:30:00", read as written (no zone shifting).
export const clockOf = (local: string | null) => (local && /T(\d\d:\d\d)/.exec(local)?.[1]) || null;

export function formatMinutes(minutes: number | null) {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  // Arabic: one number then the word ("3:05 ساعة"), so the line keeps its right-to-left order.
  if (isArabic) return digits(h ? `${h}:${String(m).padStart(2, "0")} ساعة` : `${m} دقيقة`);
  return digits([h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" "));
}

export const stopsText = (flight: Flight) => (flight.stops === 0 ? tx.nonstop : flight.stops === 1 ? tx.oneStop(flight.layovers[0] ?? null) : tx.stops(flight.stops));

/** Whether the arrival is on a later day than the departure, written "+1". */
export function dayShift(flight: Flight) {
  if (!flight.departs || !flight.arrives) return 0;
  return nightsBetween(flight.departs.slice(0, 10), flight.arrives.slice(0, 10));
}

export function flightTitle(flight: Flight) {
  const start = clockOf(flight.departs);
  const end = clockOf(flight.arrives);
  const shift = dayShift(flight);
  if (!start) return flight.airline;
  if (!end) return digits(start);
  return digits(`${start} → ${end}${shift > 0 ? ` +${shift}` : ""}`);
}

export function flightLine(flight: Flight) {
  const numbers = flight.legs.map((leg) => leg.flight_number).filter(Boolean).join(", ");
  // Arabic leads with the Arabic words, so a line that mixes in airline names still reads right to left.
  const parts = isArabic ? [stopsText(flight), formatMinutes(flight.minutes), flight.airline, numbers] : [flight.airline, numbers, formatMinutes(flight.minutes), stopsText(flight)];
  return parts.filter(Boolean).join(" · ");
}

export const priceText = (price: number | null, currency: string) => (price === null ? tx.noPrice : formatMoney(price, currency));

export function hotelLine(hotel: Hotel) {
  const stars = hotel.stars ? tx.stars(hotel.stars) : hotel.kind === "vacation rental" ? tx.rental : null;
  const rating = hotel.rating !== null ? tx.rating(digits(hotel.rating.toFixed(1)), hotel.reviews ? digits(hotel.reviews) : null) : null;
  return [stars, rating].filter(Boolean).join(" · ");
}

export function hotelPrice(hotel: Hotel, currency: string) {
  if (hotel.per_night === null) return tx.noPrice;
  const night = tx.perNight(formatMoney(hotel.per_night, currency));
  return hotel.total !== null ? `${night} · ${tx.inAll(formatMoney(hotel.total, currency))}` : night;
}

export function priceLevelText(results: FlightResults) {
  if (!results.price_level) return null;
  const range = results.typical_range ? ` (${tx.usually(formatMoney(results.typical_range[0], results.currency), formatMoney(results.typical_range[1], results.currency))})` : "";
  const level = results.price_level === "low" ? tx.priceLow : results.price_level === "high" ? tx.priceHigh : tx.priceTypical;
  return `${level}${range}`;
}

/** What the server needs to turn the search and the picks into a task list. */
export function tripBody(search: TripSearch, place: string, flight: Flight | null, hotel: Hotel | null, flightsUrl: string | null, currency: string) {
  return {
    place: place.slice(0, 40),
    origin: search.origin.toUpperCase(),
    destination: search.destination.toUpperCase(),
    depart_on: search.depart_on,
    return_on: search.return_on,
    currency,
    flight: flight
      ? {
          airline: flight.airline.slice(0, 120),
          flight_numbers: flight.legs.map((leg) => leg.flight_number).filter((n): n is string => Boolean(n)).slice(0, 6),
          from_code: flight.legs[0]?.from_code || search.origin.toUpperCase(),
          to_code: flight.legs[flight.legs.length - 1]?.to_code || search.destination.toUpperCase(),
          departs: flight.departs,
          price: flight.price,
          stops: flight.stops
        }
      : null,
    hotel: hotel ? { name: hotel.name.slice(0, 160), per_night: hotel.per_night, total: hotel.total, link: hotel.link?.startsWith("https://") ? hotel.link : null } : null,
    flights_url: flightsUrl?.startsWith("https://") ? flightsUrl : null,
    language
  };
}

export const dayText = (key: string) => formatDate(`${key}T12:00:00`, { weekday: "short", day: "numeric", month: "short" });

const en = {
  travel: "Travel",
  rowDetail: "Flights and hotels for a trip, then the trip in your tasks",
  intro: "Pick where from, where to and the days. Orbit shows flight and hotel prices from Google, and puts the trip in your tasks: booking, passport, packing, check-in and when to leave. Nothing is booked or paid here.",
  from: "From",
  to: "To",
  airportPh: "City or airport code",
  dayOut: "Day out",
  dayBack: "Day back",
  oneWay: "One way",
  roundTrip: "Round trip",
  travelers: (n: number) => (n === 1 ? "1 traveler" : `${digits(n)} travelers`),
  cabin: { economy: "Economy", premium: "Premium", business: "Business", first: "First" } as Record<Cabin, string>,
  stopsChoice: { any: "Any stops", nonstop: "Nonstop", one: "1 stop at most" } as Record<Stops, string>,
  stayIn: "Stay in (optional)",
  stayInPh: (city: string) => `e.g. ${city} downtown`,
  search: "Find flights and hotels",
  searching: "Looking…",
  searchCost: "Uses 2 of your SerpApi searches (1 with no hotel for a one-way trip).",
  flights: "Flights",
  hotels: "Places to stay",
  best: "Best",
  picked: "Picked",
  pick: "Pick",
  noFlights: "No flights found for those days.",
  noHotels: "No places to stay found there.",
  roundTripPrice: "Prices are for the trip there and back. The way back is picked on Google when you book.",
  openGoogle: "See everything on Google",
  openHotel: "Open",
  nonstop: "Nonstop",
  oneStop: (code: string | null) => (code ? `1 stop (${code})` : "1 stop"),
  stops: (n: number) => `${digits(n)} stops`,
  stars: (n: number) => `${digits(n)}-star`,
  rating: (score: string, reviews: string | null) => `★ ${score}${reviews ? ` (${reviews})` : ""}`,
  rental: "Rental",
  noPrice: "No price",
  perNight: (price: string) => `${price} a night`,
  inAll: (price: string) => `${price} in all`,
  usually: (low: string, high: string) => `usually ${low}–${high}`,
  priceLow: "Prices are low now",
  priceTypical: "Prices are typical",
  priceHigh: "Prices are high now",
  addTrip: "Add the trip to my tasks",
  addingTrip: "Adding…",
  addHint: "Pick a flight and a hotel first, or add the trip without them.",
  tripAdded: (n: number) => `Trip added: ${digits(n)} tasks`,
  passportWarning: "Your passport runs out within 6 months of the trip. There's a task to renew it.",
  openTasks: "Open tasks",
  pickAirports: "Pick both airports.",
  sameAirport: "Pick two different airports.",
  pastDay: "The day out has passed.",
  backBeforeOut: "The day back must be after the day out.",
  key: "SerpApi",
  keyIntro: "Flight and hotel prices come from Google through your own SerpApi account. The free plan has 250 searches a month. Sign up, copy your private API key from the dashboard and paste it here.",
  keyPh: "SerpApi private API key",
  keyConnect: "Link SerpApi",
  keyConnecting: "Checking the key…",
  keyLinked: "Linked",
  keyConnected: "SerpApi is linked.",
  keySearchesLeft: (n: number) => `${digits(n)} searches left this month.`,
  keyOpenSite: "Open SerpApi to sign up",
  keyDisconnect: "Unlink SerpApi",
  keyUnlinkTitle: "Unlink SerpApi?",
  keyUnlinkDetail: "Orbit forgets the key. Trips already in your tasks stay.",
  keyUnlinked: "SerpApi unlinked.",
  keyNeeded: "Link your SerpApi key below to search."
};

const ar: typeof en = {
  travel: "السفر",
  rowDetail: "طيران وفنادق للرحلة، والرحلة في مهامك",
  intro: "اختر من وين وإلى وين والأيام. يعرض لك Orbit أسعار الطيران والفنادق من قوقل، ويحط الرحلة في مهامك: الحجز والجواز والشنطة وتسجيل الدخول ووقت الطلعة للمطار. ما فيه حجز ولا دفع من هنا.",
  from: "من",
  to: "إلى",
  airportPh: "المدينة أو رمز المطار",
  dayOut: "يوم الذهاب",
  dayBack: "يوم العودة",
  oneWay: "ذهاب فقط",
  roundTrip: "ذهاب وعودة",
  travelers: (n: number) => (n === 1 ? "مسافر واحد" : `${digits(n)} مسافرين`),
  cabin: { economy: "سياحي", premium: "سياحي مميز", business: "أعمال", first: "أولى" },
  stopsChoice: { any: "أي توقف", nonstop: "مباشر", one: "توقف واحد بالأكثر" },
  stayIn: "السكن في (اختياري)",
  stayInPh: (city: string) => `مثلاً وسط ${city}`,
  search: "دوّر طيران وفنادق",
  searching: "أدوّر…",
  searchCost: "ياخذ بحثين من حساب SerpApi (بحث واحد لو ذهاب فقط بدون فندق).",
  flights: "الطيران",
  hotels: "أماكن السكن",
  best: "الأفضل",
  picked: "مختار",
  pick: "اختر",
  noFlights: "ما لقيت رحلات بهالأيام.",
  noHotels: "ما لقيت سكن هناك.",
  roundTripPrice: "الأسعار للذهاب والعودة. رحلة العودة تختارها في قوقل وقت الحجز.",
  openGoogle: "شوف الكل في قوقل",
  openHotel: "افتح",
  nonstop: "مباشر",
  oneStop: (code: string | null) => (code ? `توقف واحد (${code})` : "توقف واحد"),
  stops: (n: number) => `${digits(n)} توقفات`,
  stars: (n: number) => `فندق ${digits(n)} نجوم`,
  rating: (score: string, reviews: string | null) => `تقييم ${score}${reviews ? ` من ${reviews} مراجعة` : ""}`,
  rental: "شقة",
  noPrice: "بدون سعر",
  perNight: (price: string) => `الليلة ${price}`,
  inAll: (price: string) => `المجموع ${price}`,
  usually: (low: string, high: string) => `عادةً ${low} إلى ${high}`,
  priceLow: "الأسعار رخيصة الحين",
  priceTypical: "الأسعار عادية",
  priceHigh: "الأسعار غالية الحين",
  addTrip: "أضف الرحلة لمهامي",
  addingTrip: "أضيف…",
  addHint: "اختر رحلة وفندق، أو أضف الرحلة بدونها.",
  tripAdded: (n: number) => `انضافت الرحلة: ${digits(n)} مهام`,
  passportWarning: "جوازك ينتهي خلال ٦ أشهر من الرحلة. أضفت لك مهمة تجدده.",
  openTasks: "افتح المهام",
  pickAirports: "اختر المطارين.",
  sameAirport: "اختر مطارين مختلفين.",
  pastDay: "يوم الذهاب فات.",
  backBeforeOut: "يوم العودة لازم يكون بعد يوم الذهاب.",
  key: "SerpApi",
  keyIntro: "أسعار الطيران والفنادق تجي من قوقل عن طريق حسابك في SerpApi. الخطة المجانية فيها ٢٥٠ بحث بالشهر. سجّل، وانسخ مفتاحك الخاص من لوحة التحكم، والصقه هنا.",
  keyPh: "مفتاح SerpApi الخاص",
  keyConnect: "اربط SerpApi",
  keyConnecting: "أتأكد من المفتاح…",
  keyLinked: "مربوط",
  keyConnected: "حساب SerpApi مربوط.",
  keySearchesLeft: (n: number) => `باقي لك ${digits(n)} بحث هالشهر.`,
  keyOpenSite: "افتح SerpApi للتسجيل",
  keyDisconnect: "افصل SerpApi",
  keyUnlinkTitle: "تفصل SerpApi؟",
  keyUnlinkDetail: "ينسى Orbit المفتاح، والرحلات اللي في مهامك تبقى.",
  keyUnlinked: "انفصل حساب SerpApi.",
  keyNeeded: "اربط مفتاح SerpApi تحت عشان تدوّر."
};

export const tx = isArabic ? ar : en;
