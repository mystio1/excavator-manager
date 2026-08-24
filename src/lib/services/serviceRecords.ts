import { db } from "@/lib/db";
import { NOT_ACTIONED, type AddComponentInput, type CreateServiceRecordInput } from "@/lib/validation/serviceRecord";

// Inspect/Service-trigger hours sourced from the general 20-ton excavator
// maintenance interval guide (OEM-independent planning reference). Where the
// guide gives a range (e.g. "50-100 h"), the lower/more conservative bound is
// used. Components that are condition- or event-based rather than hour-based
// (O-Rings, Cleaning, Repair) are intentionally left without an interval —
// see the "never fabricate an interval" rule in createServiceRecord below.
const GUIDE_INTERVAL_HOURS: Record<string, number> = {
  "Engine Oil": 500,
  "Oil Filter": 500,
  "Fuel Filter": 500,
  "Air Filter": 250,
  Coolant: 500,
  "Fan Belt": 250,
  "Engine Belt": 250,
  "Starter Motor": 500,
  Alternator: 500,
  Turbocharger: 1000,
  Injector: 1000,
  "Fuel Pump": 500,
  "Water Pump": 1000,
  "Hydraulic Oil": 250,
  "Hydraulic Filter": 1000,
  "Hydraulic Pump": 500,
  "Hydraulic Cylinder": 500,
  "Hydraulic Hose": 250,
  "Hydraulic Motor": 500,
  "Control Valve": 500,
  Seals: 500,
  "Track Chain": 250,
  "Track Pad": 250,
  "Track Roller": 250,
  "Carrier Roller": 250,
  Idler: 250,
  Sprocket: 250,
  "Track Tensioner": 250,
  "Boom Cylinder": 250,
  "Arm Cylinder": 250,
  "Bucket Cylinder": 250,
  "Boom Pins": 250,
  "Arm Pins": 250,
  Bushings: 250,
  "Bucket Teeth": 50,
  "Bucket Adapter": 50,
  "Bucket Pins": 250,
  "Cutting Edge": 250,
  Battery: 250,
  Wiring: 250,
  Sensors: 500,
  Lights: 250,
  Horn: 500,
  "Ignition System": 500,
  Fuse: 250,
  Seat: 500,
  AC: 500,
  "Control Lever": 500,
  "Display Panel": 500,
  Door: 500,
  Wiper: 250,
  Greasing: 50,
  "General Inspection": 250,
  Welding: 500,
  Other: 250,
};

export const DEFAULT_COMPONENT_LIBRARY: { name: string; category: string; defaultIntervalHours: number | null }[] = [
  // Engine
  ...[
    "Engine Oil",
    "Oil Filter",
    "Fuel Filter",
    "Air Filter",
    "Coolant",
    "Fan Belt",
    "Engine Belt",
    "Starter Motor",
    "Alternator",
    "Turbocharger",
    "Injector",
    "Fuel Pump",
    "Water Pump",
  ].map((name) => ({ name, category: "Engine" })),
  // Hydraulic System
  ...[
    "Hydraulic Oil",
    "Hydraulic Filter",
    "Hydraulic Pump",
    "Hydraulic Cylinder",
    "Hydraulic Hose",
    "Hydraulic Motor",
    "Control Valve",
    "Seals",
    "O-Rings",
  ].map((name) => ({ name, category: "Hydraulic System" })),
  // Undercarriage
  ...["Track Chain", "Track Pad", "Track Roller", "Carrier Roller", "Idler", "Sprocket", "Track Tensioner"].map(
    (name) => ({ name, category: "Undercarriage" }),
  ),
  // Boom and Arm
  ...["Boom Cylinder", "Arm Cylinder", "Bucket Cylinder", "Boom Pins", "Arm Pins", "Bushings"].map((name) => ({
    name,
    category: "Boom and Arm",
  })),
  // Bucket
  ...["Bucket Teeth", "Bucket Adapter", "Bucket Pins", "Cutting Edge"].map((name) => ({ name, category: "Bucket" })),
  // Electrical System
  ...["Battery", "Wiring", "Sensors", "Lights", "Horn", "Ignition System", "Fuse"].map((name) => ({
    name,
    category: "Electrical System",
  })),
  // Cabin
  ...["Seat", "AC", "Control Lever", "Display Panel", "Door", "Wiper"].map((name) => ({ name, category: "Cabin" })),
  // Other
  ...["Greasing", "General Inspection", "Cleaning", "Welding", "Repair", "Other"].map((name) => ({
    name,
    category: "Other",
  })),
].map((c) => ({ ...c, defaultIntervalHours: GUIDE_INTERVAL_HOURS[c.name] ?? null }));

export async function seedDefaultComponents(businessId: string) {
  await db.serviceItem.createMany({
    data: DEFAULT_COMPONENT_LIBRARY.map((c) => ({
      businessId,
      name: c.name,
      category: c.category,
      isDefault: true,
      defaultIntervalHours: c.defaultIntervalHours,
    })),
  });
}

export async function listComponentCatalog(businessId: string) {
  const items = await db.serviceItem.findMany({
    where: { businessId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }
  return Array.from(grouped.entries()).map(([category, components]) => ({ category, components }));
}

export async function createCustomComponent(businessId: string, input: AddComponentInput) {
  return db.serviceItem.create({
    data: { businessId, name: input.name, category: input.category, isDefault: false },
  });
}

/** The "Previous Service Summary" / smart-suggestions panel: what happened
 * to each component last time, flagging anything Not Done / Not Required so
 * it resurfaces until it's actually addressed. */
export async function getPreviousServiceSummary(businessId: string, excavatorId: string) {
  const lastRecord = await db.serviceRecord.findFirst({
    where: { businessId, excavatorId },
    orderBy: { serviceDate: "desc" },
    include: { items: { include: { serviceItem: true } } },
  });

  if (!lastRecord) return { lastRecord: null, items: [], flagged: [] };

  const items = lastRecord.items.map((item) => ({
    id: item.id,
    serviceItemId: item.serviceItemId,
    name: item.serviceItem.name,
    category: item.serviceItem.category,
    action: item.action,
    notes: item.notes,
  }));

  const flagged = items.filter((i) => NOT_ACTIONED.has(i.action));

  return { lastRecord: { id: lastRecord.id, serviceDate: lastRecord.serviceDate }, items, flagged };
}

export async function getComponentHistory(businessId: string, excavatorId: string, serviceItemId: string) {
  return db.serviceRecordItem.findMany({
    where: { serviceItemId, serviceRecord: { businessId, excavatorId } },
    orderBy: { serviceRecord: { serviceDate: "desc" } },
    include: { serviceRecord: { select: { serviceDate: true, hourMeterAtService: true } } },
  });
}

export async function getReplacementHistory(businessId: string, excavatorId: string) {
  return db.serviceRecordItem.findMany({
    where: { action: "Replaced", serviceRecord: { businessId, excavatorId } },
    orderBy: { serviceRecord: { serviceDate: "desc" } },
    include: {
      serviceItem: { select: { name: true, category: true } },
      serviceRecord: { select: { serviceDate: true, hourMeterAtService: true } },
    },
  });
}

export async function listServiceHistory(businessId: string, excavatorId: string) {
  return db.serviceRecord.findMany({
    where: { businessId, excavatorId },
    orderBy: { serviceDate: "desc" },
    include: { items: { include: { serviceItem: true } } },
  });
}

/**
 * nextServiceDueHour is derived from whichever serviced component has the
 * soonest projected due hour among the ones with a configured
 * defaultIntervalHours (never fabricated for components the owner hasn't
 * configured an interval for) — falls back to null (business/machine
 * default interval keeps driving computeServiceStatus in that case).
 */
export async function createServiceRecord(businessId: string, input: CreateServiceRecordInput) {
  const excavator = await db.excavator.findFirst({ where: { id: input.excavatorId, businessId } });
  if (!excavator) return { error: "Machine not found" } as const;

  const serviceItems = await db.serviceItem.findMany({
    where: { id: { in: input.items.map((i) => i.serviceItemId) }, businessId },
  });
  const intervalById = new Map(serviceItems.map((s) => [s.id, s.defaultIntervalHours]));

  let nextServiceDueHour: number | null = null;
  for (const item of input.items) {
    if (NOT_ACTIONED.has(item.action)) continue;
    const interval = intervalById.get(item.serviceItemId);
    if (interval == null) continue;
    const due = input.hourMeterAtService + interval;
    if (nextServiceDueHour == null || due < nextServiceDueHour) nextServiceDueHour = due;
  }

  const totalCost = Math.round(input.items.reduce((sum, i) => sum + (i.cost ?? 0), 0) * 100) / 100;

  const record = await db.serviceRecord.create({
    data: {
      businessId,
      excavatorId: input.excavatorId,
      serviceDate: new Date(input.serviceDate),
      hourMeterAtService: input.hourMeterAtService,
      cost: totalCost,
      notes: input.notes || null,
      nextServiceDueHour,
      items: {
        create: input.items.map((i) => ({
          serviceItemId: i.serviceItemId,
          action: i.action,
          done: !NOT_ACTIONED.has(i.action),
          cost: i.cost ?? 0,
          brand: i.brand || null,
          notes: i.notes || null,
        })),
      },
    },
  });

  if (input.hourMeterAtService > excavator.currentHourMeter) {
    await db.excavator.update({
      where: { id: excavator.id },
      data: { currentHourMeter: input.hourMeterAtService },
    });
  }

  return { record } as const;
}
