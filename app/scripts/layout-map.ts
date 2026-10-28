// The office floor as a grid map (npm run layout:map [-- --json]). Plain Node: everything comes from worldLayout,
// so the map is always the layout the robots actually walk. 1 tile = 0.5 m; the back wall is at the top.
import {
  DOORS,
  DOOR_WIDTH,
  FLOOR,
  FURNITURE,
  GLASS_OBSTACLES,
  GRID_CELL,
  LOCATIONS,
  MIN_WALKWAY,
  ROBOT_DIAMETER,
  WALKWAYS,
  WALK_CLEARANCE,
  ZONES,
  clearance,
  distanceTo,
} from "../src/simulation/worldLayout.ts";
import type { LocationId, Obstacle } from "../src/simulation/worldLayout.ts";

const TILE = 0.5;

/** One character per location; a desk's visitor slot uses the lower case. */
export const CODES: Record<LocationId, string> = {
  hub: "H",
  ops: "O",
  research: "R",
  product: "P",
  dev: "E",
  testing: "Q",
  review: "V",
  planning: "K",
  whiteboard: "T",
  library: "B",
  servers: "S",
  aquarium: "Z",
  garden: "G",
  collab: "M",
  warroom: "W",
  lounge: "L",
  pantry: "C",
  snacks: "N",
  fridge: "I",
  arcade: "A",
  claw: "U",
  foosball: "F",
  chess: "X",
  beanbags: "J",
};

const DESKS = new Set<LocationId>(["hub", "ops", "research", "product", "dev", "testing", "review"]);

function hits(list: readonly Obstacle[], x: number, z: number, within = 0): boolean {
  // 4 × 4 samples from the tile's near edge, so thin glass on a tile boundary and small stools still show, once.
  const at = [-0.25, -0.125, 0, 0.125].map((k) => k * (TILE / 0.5));
  for (const dx of at) for (const dz of at) if (list.some((o) => distanceTo(o, x + dx, z + dz) < within)) return true;
  return false;
}

export function asciiMap(): string[] {
  const cols = Math.round(FLOOR.width / TILE);
  const rows = Math.round(FLOOR.depth / TILE);
  const tiles: string[][] = [];
  for (let j = 0; j < rows; j++) {
    const z = FLOOR.minZ + (j + 0.5) * TILE;
    const row: string[] = [];
    for (let i = 0; i < cols; i++) {
      const x = FLOOR.minX + (i + 0.5) * TILE;
      const door = DOORS.some((d) => Math.abs(z - d.z) <= TILE / 2 && Math.abs(x - d.x) < d.width / 2);
      const walk = WALKWAYS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);
      row.push(door ? "D" : hits(GLASS_OBSTACLES, x, z, 0.065) ? "=" : hits(FURNITURE, x, z) ? "#" : walk ? ":" : ".");
    }
    tiles.push(row);
  }
  for (const def of Object.values(LOCATIONS)) {
    def.slots.forEach((s, k) => {
      const i = Math.floor((s.x - FLOOR.minX) / TILE);
      const j = Math.floor((s.z - FLOOR.minZ) / TILE);
      const code = CODES[def.id];
      tiles[j]![i] = DESKS.has(def.id) && k === 1 ? code.toLowerCase() : code;
    });
  }
  const ruler = "        " + Array.from({ length: cols / 4 }, (_, k) => String(FLOOR.minX + k * 2).padEnd(4)).join("");
  const out = [ruler];
  tiles.forEach((row, j) => {
    const z = FLOOR.minZ + j * TILE;
    out.push(`${(j % 2 === 0 ? z.toFixed(1) : "").padStart(6)} |${row.join("")}|`);
  });
  return out;
}

const w = (r: { x0: number; x1: number; z0: number; z1: number }) => `${(r.x1 - r.x0).toFixed(2)} × ${(r.z1 - r.z0).toFixed(2)} m`;

function report(): string {
  const lines = [
    "OFFICE GRID MAP — 1 tile = 0.5 m · x → right (−15 … 15) · z ↓ (back window −9.5 … open front 11.5)",
    "",
    ...asciiMap(),
    "",
    "Legend: # furniture / static obstacle   = glass wall   D door   : transit path (kept clear)   . open floor",
    "        " +
      (Object.entries(CODES) as [LocationId, string][])
        .map(([id, c]) => `${c} ${LOCATIONS[id].label}`)
        .join(" · "),
    "        lower-case letter: the visitor spot beside that desk",
    "",
    `Standards: robot Ø ${ROBOT_DIAMETER} m · centre keeps ${WALK_CLEARANCE} m from furniture · walkways ≥ ${MIN_WALKWAY.toFixed(2)} m (2.5 × Ø) · doors ${DOOR_WIDTH} m · pathfinding grid ${GRID_CELL} m`,
    "",
    "Zones:",
    ...ZONES.map((z) => `  ${z.label.padEnd(26)} x ${z.x0} … ${z.x1}, z ${z.z0} … ${z.z1}  (${w(z)})`),
    "",
    "Transit paths:",
    ...WALKWAYS.map((p) => `  ${p.label.padEnd(26)} x ${p.x0} … ${p.x1}, z ${p.z0} … ${p.z1}  (${w(p)}, clear width ${Math.min(p.x1 - p.x0, p.z1 - p.z0).toFixed(2)} m)`),
    "",
    "Doors:",
    ...DOORS.map((d) => {
      const free = 2 * clearance({ x: d.x, z: d.z }) - 2 * WALK_CLEARANCE;
      return `  ${d.room.padEnd(26)} centre (${d.x.toFixed(2)}, ${d.z.toFixed(2)}), opening ${d.width.toFixed(2)} m, room for a robot's centre ${free.toFixed(2)} m`;
    }),
  ];
  return lines.join("\n");
}

function json(): unknown {
  const round = (v: unknown): unknown => (typeof v === "number" ? Math.round(v * 1000) / 1000 : Array.isArray(v) ? v.map(round) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);
  return round({
    units: "m",
    floor: FLOOR,
    standards: { robotDiameter: ROBOT_DIAMETER, walkClearance: WALK_CLEARANCE, minWalkway: MIN_WALKWAY, doorWidth: DOOR_WIDTH, gridCell: GRID_CELL },
    zones: ZONES,
    walkways: WALKWAYS,
    doors: DOORS,
    locations: Object.values(LOCATIONS).map((l) => ({ id: l.id, label: l.label, zone: l.zone, code: CODES[l.id], slots: l.slots.map((s, k) => ({ ...s, facing: l.facing[k] })) })),
    obstacles: { furniture: FURNITURE, glass: GLASS_OBSTACLES },
    tilemap: { tile: TILE, rows: asciiMap().slice(1).map((r) => r.slice(8, -1)) },
  });
}

if (process.argv[1]?.endsWith("layout-map.ts")) console.log(process.argv.includes("--json") ? JSON.stringify(json(), null, 2) : report());
