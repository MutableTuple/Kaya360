// Geography: regions → states → cities, with priority tiers and city-centre
// coordinates (used only as clearly-labelled approximate map positions when a
// project has no geocoded address).

export type Region = "west" | "north" | "south" | "east" | "central";

export interface StateDef { name: string; region: Region; priority: 1 | 2; cities: string[] }

export const STATES: StateDef[] = [
  { name: "Maharashtra", region: "west", priority: 1, cities: ["Mumbai", "Thane", "Mira-Bhayandar", "Navi Mumbai", "Pune", "Nashik", "Nagpur", "Chhatrapati Sambhajinagar", "Kalyan", "Kolhapur"] },
  { name: "Gujarat", region: "west", priority: 1, cities: ["Ahmedabad", "Gandhinagar", "Surat", "Vadodara", "Rajkot", "GIFT City"] },
  { name: "Goa", region: "west", priority: 1, cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"] },
  { name: "Delhi", region: "north", priority: 1, cities: ["Delhi", "New Delhi"] },
  { name: "Haryana", region: "north", priority: 1, cities: ["Gurugram", "Faridabad", "Panipat", "Sonipat", "Karnal"] },
  { name: "Uttar Pradesh", region: "north", priority: 1, cities: ["Noida", "Greater Noida", "Ghaziabad", "Lucknow", "Kanpur", "Varanasi", "Agra", "Meerut"] },
  { name: "Rajasthan", region: "north", priority: 1, cities: ["Jaipur", "Udaipur", "Jodhpur", "Kota"] },
  { name: "Punjab", region: "north", priority: 1, cities: ["Mohali", "Ludhiana", "Amritsar", "Jalandhar"] },
  { name: "Chandigarh", region: "north", priority: 1, cities: ["Chandigarh"] },
  { name: "Karnataka", region: "south", priority: 2, cities: ["Bengaluru", "Mysuru", "Mangaluru"] },
  { name: "Telangana", region: "south", priority: 2, cities: ["Hyderabad"] },
  { name: "Tamil Nadu", region: "south", priority: 2, cities: ["Chennai", "Coimbatore"] },
  { name: "Kerala", region: "south", priority: 2, cities: ["Kochi", "Thiruvananthapuram"] },
  { name: "West Bengal", region: "east", priority: 2, cities: ["Kolkata"] },
  { name: "Odisha", region: "east", priority: 2, cities: ["Bhubaneswar"] },
  { name: "Madhya Pradesh", region: "central", priority: 2, cities: ["Indore", "Bhopal"] },
  { name: "Chhattisgarh", region: "central", priority: 2, cities: ["Raipur"] },
];

export const REGION_LABEL: Record<Region, string> = {
  west: "West India", north: "North India", south: "South India", east: "East India", central: "Central India",
};

export const NCR_CITIES = ["Delhi", "New Delhi", "Gurugram", "Noida", "Greater Noida", "Faridabad", "Ghaziabad"];

export const CITY_COORDS: Record<string, [number, number]> = {
  Mumbai: [19.076, 72.8777], Thane: [19.2183, 72.9781], "Mira-Bhayandar": [19.2952, 72.8544], "Navi Mumbai": [19.033, 73.0297],
  Pune: [18.5204, 73.8567], Nashik: [19.9975, 73.7898], Nagpur: [21.1458, 79.0882], "Chhatrapati Sambhajinagar": [19.8762, 75.3433],
  Aurangabad: [19.8762, 75.3433], Kalyan: [19.2403, 73.1305], Kolhapur: [16.705, 74.2433],
  Ahmedabad: [23.0225, 72.5714], Gandhinagar: [23.2156, 72.6369], Surat: [21.1702, 72.8311], Vadodara: [22.3072, 73.1812],
  Rajkot: [22.3039, 70.8022], "GIFT City": [23.1612, 72.6835],
  Panaji: [15.4909, 73.8278], Margao: [15.2832, 73.9862], "Vasco da Gama": [15.3982, 73.8113], Mapusa: [15.5937, 73.8142],
  Delhi: [28.7041, 77.1025], "New Delhi": [28.6139, 77.209], Gurugram: [28.4595, 77.0266], Gurgaon: [28.4595, 77.0266],
  Noida: [28.5355, 77.391], "Greater Noida": [28.4744, 77.504], Faridabad: [28.4089, 77.3178], Ghaziabad: [28.6692, 77.4538],
  Panipat: [29.3909, 76.9635], Sonipat: [28.9931, 77.0151], Karnal: [29.6857, 76.9905],
  Jaipur: [26.9124, 75.7873], Udaipur: [24.5854, 73.7125], Jodhpur: [26.2389, 73.0243], Kota: [25.2138, 75.8648],
  Chandigarh: [30.7333, 76.7794], Mohali: [30.7046, 76.7179], Ludhiana: [30.901, 75.8573], Amritsar: [31.634, 74.8723], Jalandhar: [31.326, 75.5762],
  Lucknow: [26.8467, 80.9462], Kanpur: [26.4499, 80.3319], Varanasi: [25.3176, 82.9739], Agra: [27.1767, 78.0081], Meerut: [28.9845, 77.7064],
  Bengaluru: [12.9716, 77.5946], Bangalore: [12.9716, 77.5946], Mysuru: [12.2958, 76.6394], Mangaluru: [12.9141, 74.856],
  Hyderabad: [17.385, 78.4867], Chennai: [13.0827, 80.2707], Coimbatore: [11.0168, 76.9558], Kochi: [9.9312, 76.2673],
  Thiruvananthapuram: [8.5241, 76.9366], Kolkata: [22.5726, 88.3639], Bhubaneswar: [20.2961, 85.8245],
  Indore: [22.7196, 75.8577], Bhopal: [23.2599, 77.4126], Raipur: [21.2514, 81.6296],
};

export function stateOfCity(city?: string | null): StateDef | undefined {
  if (!city) return undefined;
  const c = city.trim().toLowerCase();
  return STATES.find((s) => s.cities.some((x) => x.toLowerCase() === c));
}

export function regionOf(state?: string | null, city?: string | null): Region | undefined {
  const s = state ? STATES.find((x) => x.name.toLowerCase() === state.trim().toLowerCase()) : stateOfCity(city);
  return s?.region;
}

export function isPriorityRegion(state?: string | null, city?: string | null): boolean {
  const r = regionOf(state, city);
  return r === "west" || r === "north";
}

export function cityCoords(city?: string | null): [number, number] | undefined {
  if (!city) return undefined;
  const key = Object.keys(CITY_COORDS).find((k) => k.toLowerCase() === city.trim().toLowerCase());
  return key ? CITY_COORDS[key] : undefined;
}

/** Resolve a geography selection into a concrete list of {state, city} targets. */
export interface GeoSelection { scope: "all" | "west" | "north" | "states" | "cities" | "custom"; states?: string[]; cities?: string[]; custom?: string }
export function resolveGeography(sel: GeoSelection): { label: string; places: string[] } {
  switch (sel.scope) {
    case "west":
    case "north": {
      const st = STATES.filter((s) => s.region === sel.scope);
      return { label: REGION_LABEL[sel.scope], places: st.flatMap((s) => s.cities.slice(0, 4)) };
    }
    case "states": {
      const st = STATES.filter((s) => (sel.states ?? []).includes(s.name));
      return { label: st.map((s) => s.name).join(", "), places: st.flatMap((s) => s.cities.slice(0, 5)) };
    }
    case "cities":
      return { label: (sel.cities ?? []).join(", "), places: sel.cities ?? [] };
    case "custom":
      return { label: sel.custom ?? "Custom", places: (sel.custom ?? "").split(",").map((x) => x.trim()).filter(Boolean) };
    default: {
      // All India: priority-1 markets first, then secondary metros.
      const p1 = STATES.filter((s) => s.priority === 1).flatMap((s) => s.cities.slice(0, 2));
      const p2 = ["Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Indore", "Bhopal"];
      return { label: "All India", places: [...p1, ...p2] };
    }
  }
}
