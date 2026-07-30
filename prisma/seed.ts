import { PrismaClient, Prisma, type City, type PropertyType, type TransactionType, type AvailabilityStatus, type Furnishing } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_LOCALITIES } from "../src/data/localities";
import {
  matchLeadToProperties,
  haversineKm,
  type MatchableLead,
  type MatchableProperty,
} from "../src/lib/matching";
import { defaultPriceUnit } from "../src/lib/domain";
import { runTeleducePull } from "../src/lib/teleduce/sync";
import { getTeleduceClient } from "../src/lib/teleduce/client";

// Load .env when run directly via tsx (Prisma CLI loads it for `prisma db seed`).
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

const prisma = new PrismaClient();

// Deterministic pseudo-random so re-running the seed is stable (idempotent upserts).
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "LocalDemoOnly!2026";

const BUILDERS = [
  "My Home Group", "Aparna Constructions", "Prestige Group", "Brigade Group",
  "Casagrand", "Lodha", "Sobha", "Rajapushpa", "Vasavi", "Radiance Realty",
  "Appaswamy", "DLF", "Ramky", "Salarpuria Sattva",
];
const PROPERTY_TYPES: PropertyType[] = ["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"];

function priceFor(r: () => number, type: PropertyType, txn: TransactionType): number {
  if (txn === "RENT") {
    const base = type === "COMMERCIAL" ? 60000 : type === "VILLA" ? 55000 : 18000;
    return Math.round((base + r() * base * 2.5) / 1000) * 1000;
  }
  // SALE — absolute INR
  switch (type) {
    case "VILLA": return Math.round((1.6e7 + r() * 4.5e7) / 1e5) * 1e5;
    case "COMMERCIAL": return Math.round((6e6 + r() * 5e7) / 1e5) * 1e5;
    case "PLOT": return Math.round((3e6 + r() * 1.5e7) / 1e5) * 1e5;
    default: return Math.round((4.5e6 + r() * 2.2e7) / 1e5) * 1e5; // apartment
  }
}

async function main() {
  console.log("Seeding Franch Realty…");

  if (process.env.NODE_ENV === "production" && !process.env.SEED_DEFAULT_PASSWORD) {
    throw new Error(
      "SEED_DEFAULT_PASSWORD is required when seeding with NODE_ENV=production.",
    );
  }

  // Mock inventory is for local/demo use. Set SEED_MOCK_INVENTORY=false to seed
  // only the locality master and synthetic user accounts.
  const seedMock = process.env.SEED_MOCK_INVENTORY !== "false";

  // ── 1. Locality master ──
  for (const l of SEED_LOCALITIES) {
    await prisma.locality.upsert({
      where: { city_name: { city: l.city, name: l.name } },
      update: { latitude: l.latitude, longitude: l.longitude, teleduceAreaOfInterestValue: l.teleduceAreaOfInterestValue },
      create: { city: l.city, name: l.name, latitude: l.latitude, longitude: l.longitude, teleduceAreaOfInterestValue: l.teleduceAreaOfInterestValue },
    });
  }
  const localities = await prisma.locality.findMany({ orderBy: { id: "asc" } });
  const locByCity: Record<City, typeof localities> = {
    HYDERABAD: localities.filter((l) => l.city === "HYDERABAD"),
    CHENNAI: localities.filter((l) => l.city === "CHENNAI"),
  };
  console.log(`  Localities: ${localities.length} (HYD ${locByCity.HYDERABAD.length}, CHN ${locByCity.CHENNAI.length})`);

  // ── 2. Synthetic users for local development and demonstrations ──
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const userDefs: { email: string; fullName: string; role: "ADMIN" | "AGENT"; cities: City[] }[] = [
    { email: "admin@example.com", fullName: "Demo Administrator", role: "ADMIN", cities: ["HYDERABAD", "CHENNAI"] },
    { email: "operations@example.com", fullName: "Demo Operations Admin", role: "ADMIN", cities: ["HYDERABAD", "CHENNAI"] },
    { email: "hyderabad.agent@example.com", fullName: "Hyderabad Demo Agent", role: "AGENT", cities: ["HYDERABAD"] },
    { email: "chennai.agent@example.com", fullName: "Chennai Demo Agent", role: "AGENT", cities: ["CHENNAI"] },
    { email: "sales.agent@example.com", fullName: "Cross-city Demo Agent", role: "AGENT", cities: ["HYDERABAD", "CHENNAI"] },
  ];
  for (const u of userDefs) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, role: u.role, cities: u.cities, isActive: true },
      create: { email: u.email, passwordHash, fullName: u.fullName, role: u.role, cities: u.cities },
    });
  }
  const admin = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
  console.log(`  Users: ${userDefs.length} synthetic accounts. Demo password configured.`);

  if (seedMock) {
  // ── 3. Properties (deterministic, idempotent on fileNo) ──
  const STATUSES: AvailabilityStatus[] = ["AVAILABLE", "AVAILABLE", "AVAILABLE", "BOOKED", "SOLD", "RENTED"];
  const FURNISH: Furnishing[] = ["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"];
  const FACINGS = ["East", "West", "North", "South", "North-East", "South-East"];
  let propCount = 0;
  const cityPlan: { city: City; prefix: string; count: number }[] = [
    { city: "HYDERABAD", prefix: "FRHBAN", count: 36 },
    { city: "CHENNAI", prefix: "FRCHEN", count: 24 },
  ];
  for (const plan of cityPlan) {
    for (let i = 1; i <= plan.count; i++) {
      const r = rng(plan.city.charCodeAt(0) * 1000 + i);
      const fileNo = `${plan.prefix}${String(i).padStart(3, "0")}`;
      const loc = pick(r, locByCity[plan.city]);
      const type = pick(r, PROPERTY_TYPES);
      const txn: TransactionType = type === "PLOT" ? "SALE" : r() < 0.7 ? "SALE" : "RENT";
      const usage = type === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL";
      const bhk = type === "PLOT" || type === "COMMERCIAL" ? null : pick(r, [1, 2, 2, 3, 3, 4]);
      const priceInr = priceFor(r, type, txn);
      const builtUp = type === "PLOT" ? null : 500 + Math.floor(r() * 2500);
      const status = pick(r, STATUSES);
      const builder = pick(r, BUILDERS);
      await prisma.property.upsert({
        where: { fileNo },
        update: {
          availabilityStatus: status, priceInr, localityId: loc.id, transactionType: txn,
          propertyType: type, commercialOrResidential: usage, bhk,
        },
        create: {
          fileNo, city: plan.city, localityId: loc.id, transactionType: txn, propertyType: type,
          commercialOrResidential: usage, bhk, builtUpAreaSqft: builtUp,
          secondaryAreaSqft: type === "PLOT" ? null : Math.floor((builtUp ?? 0) * 0.15),
          facing: pick(r, FACINGS), floor: type === "PLOT" ? null : `${1 + Math.floor(r() * 18)}`,
          parkingCount: type === "PLOT" ? 0 : 1 + Math.floor(r() * 2),
          priceInr, priceUnit: defaultPriceUnit(priceInr, txn),
          maintenanceAmount: txn === "RENT" || type === "PLOT" ? null : 1500 + Math.floor(r() * 4000),
          ageYears: type === "PLOT" ? null : Math.floor(r() * 12),
          furnishing: type === "PLOT" ? null : pick(r, FURNISH),
          featuresText: "Gated community, power backup, lift, 24x7 security",
          additionalFeatures: ["Power backup", "Lift", "Security", r() < 0.5 ? "Swimming pool" : "Clubhouse"],
          availabilityStatus: status, builderDeveloperName: builder,
          description: `${bhk ? bhk + " BHK " : ""}${type.toLowerCase()} in ${loc.name}, ${plan.city === "HYDERABAD" ? "Hyderabad" : "Chennai"}.`,
          createdById: admin?.id,
        },
      });
      propCount++;
    }
  }
  console.log(`  Properties: ${propCount}`);

  // ── 4. Showcase properties: guarantee a visible Band 0/1/2/3 spread per city ──
  // Plants matching 3 BHK apartments at increasing distances from each showcase
  // lead's anchor locality (Madhapur / Adyar). The showcase LEADS themselves
  // arrive via the Teleduce mock pull below, anchored at the same localities.
  const showcasePlan: { city: City; anchorName: string; prefix: string; budgetMid: number }[] = [
    { city: "HYDERABAD", anchorName: "Madhapur", prefix: "FRHBSHW", budgetMid: 1.2e7 },
    { city: "CHENNAI", anchorName: "Adyar", prefix: "FRCHSHW", budgetMid: 1.3e7 },
  ];
  let showProps = 0;
  for (const plan of showcasePlan) {
    const cityLocs = locByCity[plan.city];
    const anchor = cityLocs.find((l) => l.name === plan.anchorName) ?? cityLocs[0];
    const distOf = (l: (typeof cityLocs)[number]) =>
      haversineKm(
        { latitude: anchor.latitude, longitude: anchor.longitude },
        { latitude: l.latitude, longitude: l.longitude },
      );
    const byDist = (a: (typeof cityLocs)[number], b: (typeof cityLocs)[number]) =>
      distOf(a) - distOf(b) || a.id - b.id;
    const band1 = cityLocs
      .filter((l) => l.id !== anchor.id && distOf(l) > 0 && distOf(l) <= 3)
      .sort(byDist);
    const band2 = cityLocs.filter((l) => distOf(l) > 3 && distOf(l) <= 5).sort(byDist);
    const band3 = cityLocs.filter((l) => distOf(l) > 7).sort(byDist);
    const buckets: { locs: typeof cityLocs; band: number }[] = [
      { locs: [anchor], band: 0 },
      { locs: band1, band: 1 },
      { locs: band2, band: 2 },
      { locs: band3, band: 3 },
    ];

    let idx = 0;
    for (const bucket of buckets) {
      const n = Math.min(2, bucket.locs.length);
      for (let k = 0; k < n; k++) {
        idx++;
        const loc = bucket.locs[k];
        const r = rng(plan.city.charCodeAt(1) * 7000 + idx);
        const priceInr = Math.round((plan.budgetMid * (0.92 + r() * 0.16)) / 1e5) * 1e5;
        const fileNo = `${plan.prefix}${String(idx).padStart(2, "0")}`;
        await prisma.property.upsert({
          where: { fileNo },
          update: {
            availabilityStatus: "AVAILABLE",
            priceInr,
            localityId: loc.id,
            transactionType: "SALE",
            propertyType: "APARTMENT",
            commercialOrResidential: "RESIDENTIAL",
            bhk: 3,
          },
          create: {
            fileNo,
            city: plan.city,
            localityId: loc.id,
            transactionType: "SALE",
            propertyType: "APARTMENT",
            commercialOrResidential: "RESIDENTIAL",
            bhk: 3,
            builtUpAreaSqft: 1500 + Math.floor(r() * 600),
            secondaryAreaSqft: 200,
            facing: "East",
            floor: `${3 + Math.floor(r() * 10)}`,
            parkingCount: 2,
            priceInr,
            priceUnit: defaultPriceUnit(priceInr, "SALE"),
            maintenanceAmount: 3000,
            ageYears: Math.floor(r() * 6),
            furnishing: "SEMI_FURNISHED",
            featuresText: "Gated community, power backup, lift, 24x7 security",
            additionalFeatures: ["Power backup", "Lift", "Security", "Clubhouse"],
            availabilityStatus: "AVAILABLE",
            builderDeveloperName: pick(r, BUILDERS),
            description: `Showcase 3 BHK apartment in ${loc.name} (Band ${bucket.band} demo).`,
            createdById: admin?.id,
          },
        });
        showProps++;
      }
    }
  }
  console.log(`  Showcase properties: ${showProps}`);
  } // end if (seedMock) — mock + showcase properties

  // ── 5. Leads via the Teleduce pull — the SAME pipeline production runs ──
  // (field mapping, locality matching, idempotent upsert, soft-archive). Mode is
  // resolved from .env: with live TELEDUCE_API_* creds this reads REAL Corefactors
  // leads; with no creds it reads the deterministic mock dataset. Writes a SyncLog
  // so the dashboard sync-health tile lights up.
  const teleduceClient = getTeleduceClient();
  // Bulk backfill: every historical lead reads as "created", so suppress per-lead
  // notifications here — they are not real-time alerts (the 30-min cron re-enables them).
  const pull = await runTeleducePull({
    prisma,
    client: teleduceClient,
    emitNotifications: false,
    // Bulk backfill: assign via the efficient one-pass distributor, not per-lead.
    autoAssign: false,
  });
  console.log(
    `  Leads (${teleduceClient.mode} Teleduce pull): created ${pull.created}, updated ${pull.updated}, skipped ${pull.skipped}, archived ${pull.archived}`,
  );

  if (seedMock) {
  // ── 6. Seed demo matches for the first non-showcase leads (engine + dashboard demo) ──
  // Showcase leads are left unactioned so an agent sees their live finder fresh.
  const allProps = await prisma.property.findMany({ include: { locality: true } });
  const leads = await prisma.lead.findMany({
    where: { teleduceLeadId: { notIn: ["TD-SHOW-HYD", "TD-SHOW-CHE"] } },
    include: { preferredLocalities: true },
    take: 12,
    orderBy: { createdAt: "asc" },
  });
  let matchCount = 0;
  for (const lead of leads) {
    const mLead: MatchableLead = {
      id: lead.id, city: lead.city, transactionTypePref: lead.transactionTypePref,
      propertyTypePref: lead.propertyTypePref, bhkPref: lead.bhkPref,
      budgetMin: lead.budgetMin ? Number(lead.budgetMin) : null,
      budgetMax: lead.budgetMax ? Number(lead.budgetMax) : null,
      preferredLocalityIds: lead.preferredLocalities.map((l) => l.id),
      preferredLocalityPoints: lead.preferredLocalities.map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
    };
    const candidates: MatchableProperty[] = allProps.map((p) => ({
      id: p.id, city: p.city, transactionType: p.transactionType, propertyType: p.propertyType,
      availabilityStatus: p.availabilityStatus, bhk: p.bhk, priceInr: Number(p.priceInr),
      localityId: p.localityId, localityPoint: { latitude: p.locality.latitude, longitude: p.locality.longitude },
      createdAt: p.createdAt,
    }));
    const banded = matchLeadToProperties(mLead, candidates);
    const top = banded.flatMap((b) => b.matches).slice(0, 5);
    for (const m of top) {
      await prisma.match.upsert({
        where: { leadId_propertyId: { leadId: lead.id, propertyId: m.property.id } },
        update: { band: m.band, distanceKm: m.distanceKm < 0 ? null : m.distanceKm, criteriaSnapshot: m.criteria as unknown as Prisma.InputJsonObject },
        create: {
          leadId: lead.id, propertyId: m.property.id, band: m.band,
          distanceKm: m.distanceKm < 0 ? null : m.distanceKm, criteriaSnapshot: m.criteria as unknown as Prisma.InputJsonObject,
          status: "SHORTLISTED", teleduceWritebackStatus: "NOT_REQUIRED",
        },
      });
      matchCount++;
    }
  }
  console.log(`  Matches: ${matchCount}`);
  } // end if (seedMock) — demo matches

  console.log("Seed complete ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
