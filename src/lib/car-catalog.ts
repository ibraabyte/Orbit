// ponytail: hand-kept list of cars common in Saudi Arabia, in Latin names. Anything missing is typed in the picker.
const catalog: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "Yaris", "Avalon", "Crown", "Raize", "Corolla Cross", "RAV4", "Rush", "Fortuner", "Highlander", "Prado", "Land Cruiser", "Land Cruiser 70", "Sequoia", "Hilux", "Tundra", "Hiace", "Coaster", "Innova", "Prius", "FJ Cruiser"],
  Lexus: ["ES", "IS", "LS", "UX", "NX", "RX", "GX", "LX", "RC", "LC", "LM"],
  Hyundai: ["Accent", "Elantra", "Sonata", "Azera", "Venue", "Creta", "Kona", "Tucson", "Santa Fe", "Palisade", "Staria", "H1", "Ioniq 5", "Ioniq 6"],
  Genesis: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
  Kia: ["Pegas", "Picanto", "Rio", "Cerato", "K5", "K8", "K9", "Sonet", "Seltos", "Sportage", "Sorento", "Telluride", "Carnival", "Soul", "EV6", "EV9"],
  Nissan: ["Sunny", "Sentra", "Altima", "Maxima", "Kicks", "X-Trail", "Pathfinder", "Armada", "Patrol", "Patrol Safari", "Navara", "Urvan", "Z"],
  Infiniti: ["Q50", "QX50", "QX55", "QX60", "QX80"],
  Honda: ["City", "Civic", "Accord", "HR-V", "ZR-V", "CR-V", "Pilot", "Odyssey"],
  Mazda: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-50", "CX-9", "CX-60", "CX-90", "BT-50"],
  Mitsubishi: ["Attrage", "Mirage", "ASX", "Xpander", "Eclipse Cross", "Outlander", "Montero Sport", "Pajero", "L200"],
  Suzuki: ["Dzire", "Baleno", "Ciaz", "Swift", "Fronx", "Ertiga", "Vitara", "Grand Vitara", "Jimny"],
  Isuzu: ["D-Max", "MU-X"],
  Chevrolet: ["Spark", "Malibu", "Impala", "Camaro", "Corvette", "Groove", "Captiva", "Equinox", "Blazer", "Traverse", "Tahoe", "Suburban", "Silverado"],
  GMC: ["Terrain", "Acadia", "Yukon", "Yukon XL", "Sierra", "Canyon", "Hummer EV"],
  Cadillac: ["CT4", "CT5", "XT4", "XT5", "XT6", "Escalade", "Lyriq"],
  Ford: ["Taurus", "Mustang", "Territory", "Escape", "Edge", "Bronco", "Explorer", "Expedition", "Ranger", "F-150", "Transit"],
  Lincoln: ["Corsair", "Nautilus", "Aviator", "Navigator"],
  Dodge: ["Charger", "Challenger", "Durango", "Hornet"],
  Chrysler: ["300C", "Pacifica"],
  Jeep: ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator"],
  Ram: ["1500", "2500"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  Lucid: ["Air", "Gravity"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "CLA", "CLE", "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class", "V-Class", "EQS"],
  BMW: ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "8 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "XM", "i4", "i7", "iX"],
  Audi: ["A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "e-tron GT"],
  Volkswagen: ["Polo", "Golf", "Jetta", "Passat", "T-Roc", "Tiguan", "Touareg", "Teramont"],
  Porsche: ["911", "718", "Panamera", "Macan", "Cayenne", "Taycan"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Velar", "Range Rover Evoque"],
  Jaguar: ["XE", "XF", "E-Pace", "F-Pace", "F-Type", "I-Pace"],
  Volvo: ["S60", "S90", "XC40", "XC60", "XC90"],
  Renault: ["Duster", "Koleos", "Megane", "Symbol", "Talisman"],
  Peugeot: ["301", "508", "2008", "3008", "5008"],
  Geely: ["Emgrand", "Coolray", "Tugella", "Monjaro", "Okavango", "Geometry C"],
  Changan: ["Alsvin", "Eado", "CS35 Plus", "CS55 Plus", "CS75 Plus", "CS85", "CS95", "UNI-K", "UNI-T", "Hunter"],
  MG: ["MG3", "MG5", "MG6", "MG7", "GT", "ZS", "HS", "RX5", "RX8"],
  Haval: ["Jolion", "H6", "H9", "Dargo"],
  GWM: ["Poer", "Tank 300", "Tank 500"],
  Chery: ["Arrizo 5", "Arrizo 6", "Tiggo 2", "Tiggo 4", "Tiggo 7", "Tiggo 8"],
  Jetour: ["X70", "X90", "Dashing", "T2"],
  BYD: ["Seal", "Atto 3", "Han", "Song Plus"]
};

export const carMakes = Object.keys(catalog).sort((a, b) => a.localeCompare(b));

export function carModels(make: string) {
  return catalog[make] ?? [];
}

// Newest first. Next year is included because model years start early.
export function carYears(now = new Date()) {
  const newest = now.getFullYear() + 1;
  return Array.from({ length: newest - 1979 }, (_, index) => String(newest - index));
}

export function carName(make: string, model: string, year: string) {
  return [make, model, year].map((part) => part.trim()).join(" ");
}

const squash = (text: string) => text.toLowerCase().replace(/[\s-]/g, "");

// `typed` is what the user wrote, when it is not already one of the choices.
export function filterChoices(choices: string[], query: string) {
  const wanted = squash(query);
  return {
    matches: choices.filter((choice) => squash(choice).includes(wanted)),
    typed: wanted && !choices.some((choice) => squash(choice) === wanted) ? query.trim() : null
  };
}

// An Arabic keyboard types ٠-٩, which \d does not match.
export function parseKm(value: string) {
  const digits = value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  return digits ? Number(digits) : null;
}
