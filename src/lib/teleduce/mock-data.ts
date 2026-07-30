import type { TeleduceLead } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic mock "Teleduce" dataset. This is the single source of demo leads:
// the mock TeleduceClient returns it, and the seed imports it (so re-running the
// mock pull is idempotent and never spuriously archives a seeded lead). Values use
// production-shaped Corefactors option labels so field mapping exercises the same
// code path as live data without carrying client records or credentials.
// ─────────────────────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

// Area-of-Interest labels that exist in the seeded locality master (so they map
// to a locality centroid). Unmatched labels degrade gracefully to no locality.
const HYD_AREAS = [
  "Madhapur", "Gachibowli", "Kondapur", "Hitech City", "Kukatpally", "Miyapur",
  "Mehdipatnam", "LB Nagar", "Begumpet", "Ameerpet", "Banjara hills", "Jubilee hills",
  "Manikonda", "Kompally", "Uppal",
];
const CHN_AREAS = [
  "Adyar", "Velacherry", "Anna nagar", "Tnagar", "Porur", "Tambaram", "Guindy",
  "Besant Nagar", "Thoraipakkam", "Omr", "Medavakkam", "Chromepet", "Vadapalani", "Kilpauk",
];

const FIRST = ["Rajesh", "Priya", "Anil", "Sneha", "Vikram", "Ananya", "Suresh", "Kavitha", "Mohan", "Deepika", "Karthik", "Lakshmi", "Sanjay", "Meera", "Arjun", "Divya", "Naveen", "Pooja", "Ravi", "Shreya"];
const LAST = ["Kumar", "Reddy", "Sharma", "Nair", "Rao", "Iyer", "Gupta", "Menon", "Verma", "Pillai", "Krishnan", "Naidu", "Chowdary", "Subramaniam"];
const SOURCES = ["Magic Bricks Hyderabad", "99acres Hyderabad", "Housing", "Digital Marketing", "Facebook", "Newspaper Ad", "Landing Page", "Call list"];
const OWNERS_HYD = ["hyderabad.agent@example.com", "sales.agent@example.com"];
const OWNERS_CHN = ["chennai.agent@example.com", "sales.agent@example.com"];
const PROP_TYPES = ["Apartment", "Apartment", "Apartment", "Villa", "Plot", "Office"];
const BEDROOMS = ["1 BHK", "2 BHK", "2 BHK", "3 BHK", "3 BHK", "4 BHK"];

// Stages (id + display) straight from the real config; mostly active, a few closed.
const ACTIVE = [
  { id: 22042, display: "Not yet contacted" },
  { id: 22044, display: "Contacted but busy call back later" },
  { id: 22046, display: "Site visit scheduled" },
  { id: 22047, display: "Under negotiation" },
  { id: 18511, display: "Contacted and Details Shared" },
  { id: 14277, display: "Site visit completed" },
  { id: 22388, display: "RNR" },
];
const CLOSED = [
  { id: 14282, display: "Registration completed" },
  { id: 22045, display: "Contacted but not interested" },
  { id: 23591, display: "Purchased elsewhere" },
];

// Fixed epoch so updatedAt is stable across runs (no Date.now()).
const BASE_TS = Date.parse("2026-06-10T09:00:00+05:30");

function generated(): TeleduceLead[] {
  const out: TeleduceLead[] = [];
  for (let i = 1; i <= 28; i++) {
    const r = rng(7000 + i);
    const isHyd = i % 2 === 1;
    const areas = isHyd ? HYD_AREAS : CHN_AREAS;
    // Keep a small ownerless subset so local/dev exercises the round-robin path.
    const owner = i % 7 === 0 ? null : pick(r, isHyd ? OWNERS_HYD : OWNERS_CHN);
    const propertyType = pick(r, PROP_TYPES);
    const usage = propertyType === "Office" || propertyType === "Retail" || propertyType === "RnR"
      ? "Commercial"
      : "Residential";
    const txnSale = r() < 0.7;
    const leadType = `${usage} ${txnSale ? "Sale" : "Rental"}`;
    const nAreas = 1 + Math.floor(r() * 2);
    const areaOfInterest = [...new Set(Array.from({ length: nAreas }, () => pick(r, areas)))];
    const isLand = propertyType === "Plot" || propertyType === "Office";
    const bedrooms = isLand ? ["0"] : [pick(r, BEDROOMS)];
    // Budget: sale ₹60L–₹3Cr, rent ₹18k–₹85k/month (absolute INR ceiling).
    const budget = txnSale
      ? Math.round((6_000_000 + r() * 24_000_000) / 1e5) * 1e5
      : Math.round((18_000 + r() * 67_000) / 1000) * 1000;
    const closed = r() < 0.18;
    const stage = closed ? pick(r, CLOSED) : pick(r, ACTIVE);
    const fn = pick(r, FIRST);
    const ln = pick(r, LAST);
    out.push({
      teleduceLeadId: `TD-${10000 + i}`,
      firstName: fn,
      lastName: ln,
      mobile: `+91 9${String(800000000 + i * 137).slice(0, 9)}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`,
      budget,
      city: isHyd ? "Hyderabad" : "Chennai",
      areaOfInterest,
      propertyType,
      bedrooms,
      leadType,
      leadSource: pick(r, SOURCES),
      leadOwner: owner,
      stageId: stage.id,
      stageDisplay: stage.display,
      updatedAt: new Date(BASE_TS - i * 3_600_000).toISOString(),
      raw: { source: "mock", index: i },
    });
  }
  return out;
}

// Two explicit showcase leads whose budget windows cover the band-demo properties
// seeded in their anchor localities (Madhapur / Adyar) — guarantees a visible
// Band 0/1/2/3 spread when an agent opens them.
const SHOWCASE: TeleduceLead[] = [
  {
    teleduceLeadId: "TD-SHOW-HYD",
    firstName: "Showcase",
    lastName: "Hyderabad Buyer",
    mobile: "+91 90000 00001",
    email: "showcase.hyderabad@example.com",
    budget: 13_500_000,
    city: "Hyderabad",
    areaOfInterest: ["Madhapur"],
    propertyType: "Apartment",
    bedrooms: ["3 BHK"],
    leadType: "Residential Sale",
    leadSource: "Landing Page",
    leadOwner: "hyderabad.agent@example.com",
    stageId: 22046,
    stageDisplay: "Site visit scheduled",
    updatedAt: new Date(BASE_TS).toISOString(),
    raw: { source: "mock", showcase: true },
  },
  {
    teleduceLeadId: "TD-SHOW-CHE",
    firstName: "Showcase",
    lastName: "Chennai Buyer",
    mobile: "+91 90000 00002",
    email: "showcase.chennai@example.com",
    budget: 14_500_000,
    city: "Chennai",
    areaOfInterest: ["Adyar"],
    propertyType: "Apartment",
    bedrooms: ["3 BHK"],
    leadType: "Residential Sale",
    leadSource: "Landing Page",
    leadOwner: "chennai.agent@example.com",
    stageId: 22046,
    stageDisplay: "Site visit scheduled",
    updatedAt: new Date(BASE_TS).toISOString(),
    raw: { source: "mock", showcase: true },
  },
];

export const MOCK_TELEDUCE_LEADS: TeleduceLead[] = [...generated(), ...SHOWCASE];
