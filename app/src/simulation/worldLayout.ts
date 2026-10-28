// Pure layout data in metres. x: left(-)/right(+), z: back(-)/front(+).
// Heading convention: heading = atan2(dx, dz), so heading π faces -z (towards the back wall).
//
// The floor is zoned (see `ZONES`, and `npm run layout:map` for the grid map): the Focus Zone (desks, hub,
// mission control, Kanban, whiteboard, library, server room, aquarium, zen garden) across the back; the Transit
// Spine, a 2 m walkway right across the floor; then the Meeting Pods & War Room on the left and the Play & Recharge
// Lounge on the right. Every walkway is at least 2.5 robots wide and every room door 1.8 m, so routes never squeeze.

export interface Vec2 {
  x: number;
  z: number;
}

/** An axis-aligned rectangle on the floor. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type LocationId =
  | "hub"
  | "ops"
  | "research"
  | "product"
  | "dev"
  | "testing"
  | "review"
  | "planning"
  | "collab"
  | "lounge"
  | "pantry"
  | "snacks"
  | "fridge"
  | "library"
  | "servers"
  | "arcade"
  | "claw"
  | "foosball"
  | "chess"
  | "beanbags"
  | "warroom"
  | "whiteboard"
  | "aquarium"
  | "garden";

export type ZoneId = "focus" | "transit" | "meeting" | "play";

export interface LocationDef {
  id: LocationId;
  label: string;
  slots: Vec2[];
  /** Heading per slot (same length as slots). */
  facing: number[];
  zone: ZoneId;
}

export const FLOOR = { width: 30, depth: 21, minX: -15, maxX: 15, minZ: -9.5, maxZ: 11.5 } as const;

// ───────────────────────── sizing standards ─────────────────────────

/** A robot is about this wide across the body. */
export const ROBOT_DIAMETER = 0.7;
/** The widest robot across its arms (Orion's shoulder pads): places to stand are at least this far apart. */
export const ROBOT_SPAN = 1.1;
/** A robot keeps its centre this far from furniture, so even Orion's shoulder pads clear a tall cabinet. */
export const WALK_CLEARANCE = 0.5;
/** Main walkways are at least 2.5 robots wide, so two robots pass each other without stopping. */
export const MIN_WALKWAY = 2.5 * ROBOT_DIAMETER;
/** Room doors are as wide as a walkway: after clearance on both sides that leaves 0.9 m (4–5 grid cells) for a robot's centre. */
export const DOOR_WIDTH = 1.8;
/** Pathfinding grid cell. */
export const GRID_CELL = 0.2;
/** Centre line of the Transit Spine. */
export const CORRIDOR_Z = 2.9;

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });

export const ZONES: readonly (Rect & { id: ZoneId; label: string; tint: string })[] = [
  { id: "focus", label: "Focus Zone", tint: "#7fa8ff", ...rect(-15, 15, -9.5, 1.8) },
  { id: "transit", label: "Transit Spine", tint: "#7cc4d6", ...rect(-15, 15, 1.8, 4.0) },
  { id: "meeting", label: "Meeting Pods & War Room", tint: "#5fdcb6", ...rect(-15, -1.9, 4.0, 11.5) },
  { id: "play", label: "Play & Recharge Lounge", tint: "#ffb36b", ...rect(-1.9, 15, 4.0, 11.5) },
];

/** Floor kept clear for walking. Each is at least `MIN_WALKWAY` wide and no furniture stands on it. */
export const WALKWAYS: readonly (Rect & { id: string; label: string })[] = [
  { id: "spine", label: "Transit Spine", ...rect(-14.6, 14.6, 1.9, 3.9) },
  { id: "hub-west", label: "Hub aisle west", ...rect(-2.95, -1.15, -5.4, 1.9) },
  { id: "hub-east", label: "Hub aisle east", ...rect(1.15, 2.95, -5.4, 1.9) },
  // Between the back-row desks (a seated robot and its chair reach to z −3.33) and the front-row desks (from −1.35).
  { id: "pods-west", label: "Research pod aisle", ...rect(-13.9, -3.4, -3.3, -1.38) },
  { id: "pods-east", label: "Dev pod aisle", ...rect(3.4, 13.9, -3.3, -1.38) },
  { id: "outer-west", label: "West wall aisle", ...rect(-13.9, -11.2, -6.6, 1.5) },
  { id: "outer-east", label: "East wall aisle", ...rect(11.2, 13.9, -6.6, 1.5) },
  { id: "play", label: "Play aisle", ...rect(-0.6, 1.2, 3.9, 8.3) },
  { id: "bar", label: "Bar aisle", ...rect(12.0, 13.95, 3.9, 10.1) },
];

export const HUB_CENTER: Vec2 = { x: 0, z: -0.6 };
export const MISSION_CONTROL: Vec2 = { x: 0, z: -7.4 };
const LOUNGE_CENTER: Vec2 = { x: 8.7, z: 7.65 };
const deg = (d: number) => (d * Math.PI) / 180;

// ───────────────────────── rooms ─────────────────────────

/** Square glass War Room against the west wall: a hologram table in the middle and a big screen on the wall. */
export const WAR_ROOM = {
  ...rect(-15, -9.3, 4.6, 11.0),
  door: { x: -12.0, z: 4.6, width: DOOR_WIDTH },
  table: { x: -12.15, z: 7.8, r: 0.85 },
  screen: { x: -14.88, z: 7.8, w: 3.0, y: 1.75, h: 1.6 },
} as const;

/** Round glass Meeting Pod: a booth bench round the back, a table with a small hologram, the door facing the spine. */
export const MEETING_POD = {
  x: -5.3,
  z: 7.75,
  r: 3.1,
  /** Ring angle of the door (0 = +z, π = towards the spine). */
  doorAngle: Math.PI,
  table: 0.7,
  /** The bench seat from `inner` to `outer` metres from the centre, its backrest to `back`, between ±`span`. */
  bench: { inner: 2.3, outer: 2.85, back: 3.0, span: deg(140), seat: 0.45 },
  /** Where each robot stands before sitting back onto the bench. */
  slotRadius: 1.95,
  slotAngles: [-115, -69, -23, 23, 69, 115].map(deg),
} as const;

/** Half the angle the pod's door takes out of its glass. */
export const POD_DOOR_HALF = Math.asin(DOOR_WIDTH / 2 / MEETING_POD.r);

/** A straight glass wall, or an arc of the round pod (ring angles, 0 = +z). */
export type GlassWall = { kind: "line"; x0: number; z0: number; x1: number; z1: number } | { kind: "arc"; x: number; z: number; r: number; from: number; to: number };

export const GLASS_WALLS: readonly GlassWall[] = [
  // War Room: north and east glass, and the south glass either side of the door. The west side is the building wall.
  { kind: "line", x0: WAR_ROOM.x0 + 0.05, z0: WAR_ROOM.z1, x1: WAR_ROOM.x1, z1: WAR_ROOM.z1 },
  { kind: "line", x0: WAR_ROOM.x1, z0: WAR_ROOM.z0, x1: WAR_ROOM.x1, z1: WAR_ROOM.z1 },
  { kind: "line", x0: WAR_ROOM.x0 + 0.05, z0: WAR_ROOM.z0, x1: WAR_ROOM.door.x - DOOR_WIDTH / 2, z1: WAR_ROOM.z0 },
  { kind: "line", x0: WAR_ROOM.door.x + DOOR_WIDTH / 2, z0: WAR_ROOM.z0, x1: WAR_ROOM.x1, z1: WAR_ROOM.z0 },
  // Meeting Pod: all the way round except the door.
  { kind: "arc", x: MEETING_POD.x, z: MEETING_POD.z, r: MEETING_POD.r, from: MEETING_POD.doorAngle + POD_DOOR_HALF, to: MEETING_POD.doorAngle + Math.PI * 2 - POD_DOOR_HALF },
];

/** Every room door, for the map and the checks that a robot fits through. */
export const DOORS: readonly { room: string; x: number; z: number; width: number }[] = [
  { room: "War Room", x: WAR_ROOM.door.x, z: WAR_ROOM.door.z, width: DOOR_WIDTH },
  {
    room: "Meeting Pod",
    x: MEETING_POD.x + Math.sin(MEETING_POD.doorAngle) * MEETING_POD.r,
    z: MEETING_POD.z + Math.cos(MEETING_POD.doorAngle) * MEETING_POD.r,
    width: 2 * MEETING_POD.r * Math.sin(POD_DOOR_HALF),
  },
];

// ───────────────────────── furniture and props ─────────────────────────
// Drawn by Workstations.tsx and the props in world/props/; robots walk around their footprints (`OBSTACLES`).

/** Break-room and focus-zone furniture. Boxes are centre + size along x/z (+ height); each spot's slots stand in front. */
export const PROPS = {
  // Play & Recharge: coffee bar, snack bar and smart fridge along the east wall.
  counter: { x: 14.45, z: 5.6, sx: 0.9, sz: 2.6, h: 0.95 },
  // At the front of the counter, within a robot's reach.
  coffeeMachine: { x: 14.25, z: 4.95 },
  dispenser: { x: 14.25, z: 6.25 },
  snacks: { x: 14.48, z: 7.9, sx: 0.85, sz: 1.6, h: 1.5 },
  fridge: { x: 14.5, z: 9.35, sx: 0.8, sz: 0.8, h: 1.95 },
  // Games: two arcade cabinets and a claw machine facing +x, foosball (goals along x), a high chess table (played
  // standing), beanbags. Cabinets sit `ROBOT_SPAN` apart so two players never bump shoulders.
  arcade: [
    { x: -1.3, z: 7.15 },
    { x: -1.3, z: 8.3 },
  ],
  claw: { x: -1.25, z: 9.5 },
  foosball: { x: 2.2, z: 9.6 },
  chess: { x: 2.7, z: 5.5, h: 0.95 },
  beanBags: [
    { x: 4.4, z: 10.45 },
    { x: 4.6, z: 8.95 },
    { x: 4.4, z: 7.45 },
  ],
  // Focus zone: Kanban board and whiteboard on the side walls, library, server racks, aquarium, zen garden.
  kanban: { x: -14.88, z: -3.9, w: 3.4, y: 1.65, h: 1.6 },
  whiteboard: { x: 14.88, z: -3.9, w: 3.0, y: 1.55, h: 1.4 },
  bookshelf: { x: -10.2, z: -9.05, sx: 3.0, sz: 0.42, h: 1.7 },
  armchair: { x: -13.2, z: -7.4 },
  racks: { x: 10.2, z: -9.0, sx: 2.2, sz: 0.75, h: 2.1 },
  aquarium: { x: 7.2, z: -9.0, sx: 2.6, sz: 0.6, h: 1.6 },
  garden: { x: -6.9, z: -8.8, sx: 2.8, sz: 1.0 },
  // Seat and backrest: the backrest stands a little behind the seat, clear of a seated robot's backpack.
  gardenBench: { x: -6.9, z: -6.625, sx: 1.9, sz: 0.6 },
  lamps: [
    { x: -12.3, z: -8.6 },
    { x: 11.75, z: 10.95 },
    { x: 5.3, z: 11.0 },
  ],
} as const;

export type PlantKind = "bush" | "monstera" | "palm";

/** Potted plants. A palm is a tall corner pot; a monstera has big split leaves. */
export const PLANTS: readonly { x: number; z: number; size: number; kind: PlantKind }[] = [
  { x: -14.2, z: -8.7, size: 1.3, kind: "palm" },
  { x: 14.2, z: -8.7, size: 1.3, kind: "palm" },
  { x: 5.25, z: -8.7, size: 0.9, kind: "bush" },
  { x: -3.2, z: -0.9, size: 0.7, kind: "bush" },
  { x: 3.2, z: -0.9, size: 0.7, kind: "bush" },
  { x: -4.3, z: 1.0, size: 1.0, kind: "monstera" },
  { x: 4.3, z: 1.0, size: 1.0, kind: "monstera" },
  { x: -14.4, z: 0.4, size: 0.9, kind: "monstera" },
  { x: 14.4, z: 0.4, size: 0.9, kind: "monstera" },
  { x: -14.35, z: 10.4, size: 1.0, kind: "bush" },
  { x: -8.7, z: 5.0, size: 1.0, kind: "palm" },
  { x: 14.2, z: 10.7, size: 1.15, kind: "palm" },
  { x: -1.0, z: 10.9, size: 0.9, kind: "monstera" },
];

/** Floor radius of a plant's pot and leaves. */
export function plantRadius(p: { size: number; kind: PlantKind }): number {
  return (p.kind === "monstera" ? 0.45 : p.kind === "palm" ? 0.4 : 0.32) * p.size;
}

export interface Partition {
  /** Centre on the floor. */
  x: number;
  z: number;
  length: number;
  /** "x": runs along x; "z": runs along z. */
  axis: "x" | "z";
}

/** Low glass between the desk pods and the hub, and at the ends of the spine. */
export const PARTITIONS: Partition[] = [
  { x: -3.2, z: -3.5, length: 4, axis: "z" },
  { x: 3.2, z: -3.5, length: 4, axis: "z" },
  { x: -12.6, z: 1.7, length: 4, axis: "x" },
  { x: 12.6, z: 1.7, length: 4, axis: "x" },
];

export const DESK_IDS = ["ops", "research", "product", "dev", "testing", "review"] as const;
export type DeskId = (typeof DESK_IDS)[number];

/** How far a desk's centre sits in front of its owner's stand slot: the robot stands 0.45 m from the desk's edge. */
export const DESK_SETBACK = 0.925;

/**
 * Sitting down at a desk, measured behind the stand slot (away from the desk): the chair is pulled out to `pulled`,
 * the robot sits back onto it, then robot and chair scoot in together to `tucked`, half a metre from the desk's
 * edge, where its hands reach the keyboard. Standing up runs the same steps backwards.
 */
export const DESK_SEAT = { pulled: 0.45, tucked: 0.05, seatTop: 0.55 } as const;

/**
 * An L-shaped desk `DESK_SETBACK` in front of its owner's stand slot: a 2.1 × 0.95 top with a 0.6 m return reaching
 * towards the robot on the outer side (`side`, towards the nearer side wall), and an ergonomic chair. The chair waits
 * beside the robot on the inner side, turned a little; it is pulled out behind the robot when it sits down to work
 * (`DESK_SEAT`) and put back when it gets up.
 */
export function deskLayout(id: DeskId): {
  x: number;
  z: number;
  side: 1 | -1;
  wing: { x: number; z: number; sx: number; sz: number };
  chairParked: { x: number; z: number; rot: number };
  /** Behind the parked spot, level with where the chair is pulled out to. */
  chairAside: { x: number; z: number };
  chairPulled: { x: number; z: number };
  chairTucked: { x: number; z: number };
} {
  const slot = LOCATIONS[id].slots[0]!;
  const side = slot.x < 0 ? -1 : 1;
  const z = slot.z - DESK_SETBACK;
  return {
    x: slot.x,
    z,
    side,
    wing: { x: slot.x + side * 0.75, z: z + 0.24, sx: 0.6, sz: 1.43 },
    chairParked: { x: slot.x - side * 0.85, z: slot.z + 0.1, rot: -side * 0.35 },
    chairAside: { x: slot.x - side * 0.85, z: slot.z + DESK_SEAT.pulled },
    chairPulled: { x: slot.x, z: slot.z + DESK_SEAT.pulled },
    chairTucked: { x: slot.x, z: slot.z + DESK_SEAT.tucked },
  };
}

// ───────────────────────── where robots stand ─────────────────────────

function ring(center: Vec2, radius: number, count: number): { slots: Vec2[]; facing: number[] } {
  return around(
    center,
    radius,
    Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2),
  );
}

/** Slots at the given ring angles round `center`, facing it. */
function around(center: Vec2, radius: number, angles: readonly number[]): { slots: Vec2[]; facing: number[] } {
  const slots = angles.map((a) => ({ x: center.x + Math.sin(a) * radius, z: center.z + Math.cos(a) * radius }));
  return { slots, facing: slots.map((s) => Math.atan2(center.x - s.x, center.z - s.z)) };
}

/**
 * A desk: its owner stands at slot 0; slot 1 is where a visitor stands to talk to them (beside, towards the corridor).
 * At a desk with a chair the visitor stands a little further out, clear of the parked chair.
 */
function desk(x: number, z: number, facing: number, chair = true) {
  const inner = x > 0 ? -1 : 1;
  const visitor = chair ? { x: x + inner * 1.3, z: z + 0.85 } : { x: x + inner * 1.15, z: z + 0.55 };
  return { slots: [{ x, z }, visitor], facing: [facing, Math.atan2(x - visitor.x, z - visitor.z)] };
}

/** Slots given as [x, z, heading]. */
function spots(...list: readonly (readonly [number, number, number])[]): { slots: Vec2[]; facing: number[] } {
  return { slots: list.map(([x, z]) => ({ x, z })), facing: list.map(([, , h]) => h) };
}

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const BACK = Math.PI;
const FRONT = 0;

export const LOCATIONS: Record<LocationId, LocationDef> = {
  hub: { id: "hub", label: "Operations Hub", zone: "focus", ...desk(0, 1.15, Math.PI, false) },
  ops: { id: "ops", label: "Ops Console", zone: "focus", ...desk(-8.25, 0.05, Math.PI) },
  research: { id: "research", label: "Research Station", zone: "focus", ...desk(-10, -3.75, Math.PI) },
  product: { id: "product", label: "Product Station", zone: "focus", ...desk(-6.5, -3.75, Math.PI) },
  dev: { id: "dev", label: "Engineering Station", zone: "focus", ...desk(6.5, -3.75, Math.PI) },
  testing: { id: "testing", label: "QC Lab", zone: "focus", ...desk(10, -3.75, Math.PI) },
  review: { id: "review", label: "Review Station", zone: "focus", ...desk(8.25, 0.05, Math.PI) },
  planning: { id: "planning", label: "Kanban Board", zone: "focus", ...spots([-14.2, -4.6, WEST], [-14.2, -3.2, WEST]) },
  whiteboard: { id: "whiteboard", label: "Whiteboard", zone: "focus", ...spots([14.2, -4.5, EAST], [14.2, -3.3, EAST]) },
  library: { id: "library", label: "Library", zone: "focus", ...spots([PROPS.bookshelf.x - 0.7, -8.25, BACK], [PROPS.bookshelf.x + 0.7, -8.25, BACK]) },
  servers: { id: "servers", label: "Server Room", zone: "focus", ...spots([PROPS.racks.x - 0.55, -8.15, BACK], [PROPS.racks.x + 0.55, -8.15, BACK]) },
  aquarium: { id: "aquarium", label: "Aquarium", zone: "focus", ...spots([PROPS.aquarium.x - 0.6, -8.0, BACK], [PROPS.aquarium.x + 0.6, -8.0, BACK]) },
  // Robots face the garden and sit back onto the bench behind them.
  garden: { id: "garden", label: "Zen Garden", zone: "focus", ...spots([PROPS.gardenBench.x - 0.55, -7.3, BACK], [PROPS.gardenBench.x + 0.55, -7.3, BACK]) },
  collab: { id: "collab", label: "Meeting Pod", zone: "meeting", ...around(MEETING_POD, MEETING_POD.slotRadius, MEETING_POD.slotAngles) },
  warroom: { id: "warroom", label: "War Room", zone: "meeting", ...around(WAR_ROOM.table, 1.55, [0, 90, 180, 270].map(deg)) },
  lounge: { id: "lounge", label: "Sofa Lounge", zone: "play", ...ring(LOUNGE_CENTER, 2.1, 6) },
  // Slot 0 at the coffee machine, slot 1 at the juice dispenser.
  pantry: { id: "pantry", label: "Coffee Bar", zone: "play", ...spots([PROPS.coffeeMachine.x - 0.75, PROPS.coffeeMachine.z, EAST], [PROPS.dispenser.x - 0.75, PROPS.dispenser.z, EAST]) },
  snacks: { id: "snacks", label: "Snack Bar", zone: "play", ...spots([PROPS.snacks.x - 1.03, PROPS.snacks.z - 0.15, EAST]) },
  // The door hinges on the north side and its edge sweeps a 0.8 m quarter circle: the robot stands south-west of it,
  // clear of the sweep and a robot span from the snack bar's slot, turned towards the middle of the fridge's front.
  fridge: { id: "fridge", label: "Smart Fridge", zone: "play", ...spots([PROPS.fridge.x - 1.23, PROPS.fridge.z - 0.49, Math.atan2(0.83, 0.49)]) },
  arcade: { id: "arcade", label: "Arcade", zone: "play", ...spots(...PROPS.arcade.map((c) => [c.x + 0.97, c.z, WEST] as const)) },
  claw: { id: "claw", label: "Claw Machine", zone: "play", ...spots([PROPS.claw.x + 1.05, PROPS.claw.z, WEST]) },
  foosball: { id: "foosball", label: "Foosball", zone: "play", ...spots([PROPS.foosball.x, PROPS.foosball.z - 1.05, FRONT], [PROPS.foosball.x, PROPS.foosball.z + 1.05, BACK]) },
  // A bar-height table: the players stand either side and lean over the board.
  chess: { id: "chess", label: "Chess Table", zone: "play", ...spots([PROPS.chess.x - 0.75, PROPS.chess.z, EAST], [PROPS.chess.x + 0.75, PROPS.chess.z, WEST]) },
  // Robots turn their back to a beanbag and sink into it, looking at the games.
  beanbags: { id: "beanbags", label: "Beanbag Corner", zone: "play", ...spots(...PROPS.beanBags.map((b) => [b.x - 0.8, b.z, WEST] as const)) },
};

export function slotFor(location: LocationId, seat: number): { position: Vec2; facing: number } {
  const def = LOCATIONS[location];
  const i = ((seat % def.slots.length) + def.slots.length) % def.slots.length;
  return { position: def.slots[i]!, facing: def.facing[i]! };
}

/** Where an idle robot goes for a break, and what it is doing there (the app animates it from the location). */
export const BREAK_SPOTS: readonly { at: LocationId; activity: string }[] = [
  { at: "lounge", activity: "Relaxing on the sofa" },
  { at: "collab", activity: "Catching up in the meeting pod" },
  { at: "pantry", activity: "Grabbing a coffee" },
  { at: "snacks", activity: "Grabbing a snack" },
  { at: "fridge", activity: "Getting a cold drink" },
  { at: "library", activity: "Reading a book" },
  { at: "arcade", activity: "Playing a quick game" },
  { at: "claw", activity: "Trying the claw machine" },
  { at: "foosball", activity: "Playing foosball" },
  { at: "chess", activity: "Playing chess" },
  { at: "beanbags", activity: "Lounging on a beanbag" },
  { at: "servers", activity: "Checking on the servers" },
  { at: "warroom", activity: "Studying the hologram" },
  { at: "whiteboard", activity: "Sketching on the whiteboard" },
  { at: "aquarium", activity: "Watching the fish" },
  { at: "garden", activity: "Resting in the zen garden" },
];

/**
 * A break for one robot: starting from the spot `roll` (in [0, 1)) lands on, the first break spot with a slot that
 * nobody stands on or is walking to (`taken`), trying the robot's own `seat` first. Null when every slot is taken.
 */
export function pickBreak(roll: number, seat: number, taken: readonly Vec2[]): { at: LocationId; slot: number; activity: string } | null {
  const first = Math.floor(roll * BREAK_SPOTS.length);
  for (let k = 0; k < BREAK_SPOTS.length; k++) {
    const spot = BREAK_SPOTS[(first + k) % BREAK_SPOTS.length]!;
    const slots = LOCATIONS[spot.at].slots;
    for (let j = 0; j < slots.length; j++) {
      const slot = (seat + j) % slots.length;
      const p = slots[slot]!;
      if (!taken.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5)) return { at: spot.at, slot, activity: spot.activity };
    }
  }
  return null;
}

// ───────────────────────── footprints ─────────────────────────

/** A floor footprint: a circle, or a box with half sizes along its own x/z, turned by `rot` like `rotation.y`. */
export type Obstacle = { kind: "circle"; x: number; z: number; r: number } | { kind: "box"; x: number; z: number; hx: number; hz: number; rot: number };

const circle = (x: number, z: number, r: number): Obstacle => ({ kind: "circle", x, z, r });
const box = (x: number, z: number, hx: number, hz: number, rot = 0): Obstacle => ({ kind: "box", x, z, hx, hz, rot });
const sized = (b: { x: number; z: number; sx: number; sz: number }) => box(b.x, b.z, b.sx / 2, b.sz / 2);
const SIX = [0, 1, 2, 3, 4, 5].map((i) => (i / 6) * Math.PI * 2);

/** Boxes along a ring band (`inner`..`outer` from `c`) between two ring angles, in steps of about `step`. */
function arcBoxes(c: Vec2, inner: number, outer: number, from: number, to: number, step: number): Obstacle[] {
  const n = Math.max(1, Math.ceil((to - from) / step));
  const d = (to - from) / n;
  const mid = (inner + outer) / 2;
  return Array.from({ length: n }, (_, k) => {
    const a = from + (k + 0.5) * d;
    return box(c.x + Math.sin(a) * mid, c.z + Math.cos(a) * mid, outer * Math.sin(d / 2) + 0.02, (outer - inner) / 2, a);
  });
}

/** The glass walls as thin boxes (8 cm): what robots must not walk through. */
export const GLASS_OBSTACLES: readonly Obstacle[] = GLASS_WALLS.flatMap((w) => {
  if (w.kind === "arc") return arcBoxes(w, w.r - 0.04, w.r + 0.04, w.from, w.to, deg(7.5));
  const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
  return [box((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, len / 2, 0.04, Math.atan2(-(w.z1 - w.z0), w.x1 - w.x0))];
});

/** Everything else robots walk around. */
export const FURNITURE: readonly Obstacle[] = [
  // L-shaped desks and their parked chairs.
  ...DESK_IDS.flatMap((id) => {
    const d = deskLayout(id);
    return [box(d.x, d.z, 1.05, 0.475), sized(d.wing), circle(d.chairParked.x, d.chairParked.z, 0.32)];
  }),
  circle(HUB_CENTER.x, HUB_CENTER.z, 1.1),
  // Mission control: the console, and the wall screen whose frame hangs down to half a metre.
  box(MISSION_CONTROL.x, MISSION_CONTROL.z + 0.15, 3.2, 0.275),
  box(MISSION_CONTROL.x, MISSION_CONTROL.z - 0.09, 4.65, 0.06),
  // Wall boards.
  box(PROPS.kanban.x + 0.06, PROPS.kanban.z, 0.12, PROPS.kanban.w / 2 + 0.05),
  box(PROPS.whiteboard.x - 0.05, PROPS.whiteboard.z, 0.11, PROPS.whiteboard.w / 2 + 0.05),
  // Library, server racks, aquarium, the garden planter and its bench.
  sized(PROPS.bookshelf),
  circle(PROPS.armchair.x, PROPS.armchair.z, 0.55),
  sized(PROPS.racks),
  sized(PROPS.aquarium),
  sized(PROPS.garden),
  sized(PROPS.gardenBench),
  // War Room hologram table; Meeting Pod table and its curved bench round the back.
  circle(WAR_ROOM.table.x, WAR_ROOM.table.z, WAR_ROOM.table.r),
  circle(MEETING_POD.x, MEETING_POD.z, MEETING_POD.table),
  ...arcBoxes(MEETING_POD, MEETING_POD.bench.inner, MEETING_POD.bench.back, -MEETING_POD.bench.span, MEETING_POD.bench.span, deg(14)),
  // Sofa lounge: coffee table and six sofas (seat and back) at the slot angles.
  circle(LOUNGE_CENTER.x, LOUNGE_CENTER.z, 0.85),
  ...SIX.map((a) => box(LOUNGE_CENTER.x + Math.sin(a) * 2.89, LOUNGE_CENTER.z + Math.cos(a) * 2.89, 0.625, 0.35, a)),
  // Bar.
  sized(PROPS.counter),
  sized(PROPS.snacks),
  sized(PROPS.fridge),
  // Games: arcade cabinets (with control panels reaching towards the player), claw machine, foosball (rods and
  // handles stick out both sides), the high chess table, beanbags.
  box(PROPS.arcade[0].x + 0.1, (PROPS.arcade[0].z + PROPS.arcade[1].z) / 2, 0.42, Math.abs(PROPS.arcade[1].z - PROPS.arcade[0].z) / 2 + 0.4),
  box(PROPS.claw.x, PROPS.claw.z, 0.48, 0.48),
  box(PROPS.foosball.x, PROPS.foosball.z, 0.68, 0.55),
  box(PROPS.chess.x, PROPS.chess.z, 0.38, 0.38),
  ...PROPS.beanBags.map((b) => circle(b.x, b.z, 0.42)),
  ...PROPS.lamps.map((l) => circle(l.x, l.z, 0.2)),
  ...PARTITIONS.map((p) => (p.axis === "x" ? box(p.x, p.z, p.length / 2, 0.04) : box(p.x, p.z, 0.04, p.length / 2))),
  ...PLANTS.map((p) => circle(p.x, p.z, plantRadius(p))),
];

export const OBSTACLES: readonly Obstacle[] = [...FURNITURE, ...GLASS_OBSTACLES];

/** Signed distance from `p` to an obstacle's edge (negative inside). */
export function distanceTo(o: Obstacle, x: number, z: number): number {
  if (o.kind === "circle") return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = x - o.x;
  const dz = z - o.z;
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  const lx = Math.abs(dx * c - dz * s) - o.hx;
  const lz = Math.abs(dx * s + dz * c) - o.hz;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
}

/** How far `p` is from the nearest furniture, glass or the floor's edge, in metres (negative inside). */
export function clearance(p: Vec2): number {
  let d = Math.min(p.x - FLOOR.minX, FLOOR.maxX - p.x, p.z - FLOOR.minZ, FLOOR.maxZ - p.z);
  for (const o of OBSTACLES) d = Math.min(d, distanceTo(o, p.x, p.z));
  return d;
}

/** The least clearance along the segment a → b, sampled every 10 cm. */
export function segmentClearance(a: Vec2, b: Vec2): number {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
  let d = Infinity;
  for (let k = 0; k <= n; k++) d = Math.min(d, clearance({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }));
  return d;
}

// ───────────────────────── walking routes ─────────────────────────

/** Around a robot standing still, nobody plans to pass closer than this (centre to centre). */
const STANDING_GAP = 0.95;
/**
 * Slots sit close to their furniture (a lounge slot is 0.44 m from its sofa), so round both ends of a walk the cells
 * within this distance are opened up, as long as they keep `ENDPOINT_CLEAR` from the furniture themselves.
 */
const ENDPOINT_FREE = WALK_CLEARANCE + 0.05;
const ENDPOINT_CLEAR = 0.32;
/** A metre on a transit path costs this much against 1 elsewhere: robots keep to the walkways unless that is a long way round. */
const WALKWAY_COST = 0.7;
const CELL = GRID_CELL;
const COLS = Math.round(FLOOR.width / CELL);
const ROWS = Math.round(FLOOR.depth / CELL);

const cellX = (i: number) => FLOOR.minX + (i + 0.5) * CELL;
const cellZ = (j: number) => FLOOR.minZ + (j + 0.5) * CELL;
const colOf = (x: number) => Math.min(COLS - 1, Math.max(0, Math.floor((x - FLOOR.minX) / CELL)));
const rowOf = (z: number) => Math.min(ROWS - 1, Math.max(0, Math.floor((z - FLOOR.minZ) / CELL)));

/** Each cell's clearance from the furniture, and 1 where a robot's centre may not be. Built on first use. */
let clearGrid: Float32Array | null = null;
let furnitureGrid: Uint8Array | null = null;

function baseGrid(): Uint8Array {
  if (furnitureGrid) return furnitureGrid;
  const c = new Float32Array(COLS * ROWS);
  const g = new Uint8Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      c[j * COLS + i] = clearance({ x: cellX(i), z: cellZ(j) });
      if (c[j * COLS + i]! < WALK_CLEARANCE) g[j * COLS + i] = 1;
    }
  }
  clearGrid = c;
  furnitureGrid = g;
  return g;
}

/** Cost per metre of every cell (`WALKWAY_COST` on a transit path). Built on first use. */
let costGrid: Float32Array | null = null;

function cellCosts(): Float32Array {
  if (costGrid) return costGrid;
  const c = new Float32Array(COLS * ROWS).fill(1);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const x = cellX(i);
      const z = cellZ(j);
      if (WALKWAYS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1)) c[j * COLS + i] = WALKWAY_COST;
    }
  }
  costGrid = c;
  return c;
}

/** The cost of walking the straight line a → b. */
function legCost(a: Vec2, b: Vec2): number {
  const c = cellCosts();
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / (CELL / 2)));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += c[rowOf(a.z + ((b.z - a.z) * (k + 0.5)) / n) * COLS + colOf(a.x + ((b.x - a.x) * (k + 0.5)) / n)]!;
  return (sum * len) / n;
}

/**
 * Set every cell whose centre lies within `r` of `p` to `value`, skipping cells within `keep` of any `spare` point and,
 * when opening cells up, cells closer than `minClear` to the furniture.
 */
function stamp(g: Uint8Array, p: Vec2, r: number, value: 0 | 1, spare: readonly Vec2[] = [], keep = 0, minClear = -Infinity): void {
  for (let j = rowOf(p.z - r); j <= rowOf(p.z + r); j++) {
    for (let i = colOf(p.x - r); i <= colOf(p.x + r); i++) {
      const x = cellX(i);
      const z = cellZ(j);
      if (Math.hypot(x - p.x, z - p.z) > r) continue;
      if (spare.some((s) => Math.hypot(x - s.x, z - s.z) < keep)) continue;
      if (clearGrid![j * COLS + i]! < minClear) continue;
      g[j * COLS + i] = value;
    }
  }
}

/**
 * The grid for one walk: furniture, robots standing in the way (not on top of the goal, nor of the start unless
 * `nearStart` says to keep those too: a walker blocked right in front replans round the robot blocking it), both ends
 * reachable.
 */
function walkGrid(from: Vec2, to: Vec2, standing: readonly Vec2[], nearStart = false): Uint8Array {
  const g = baseGrid().slice();
  for (const p of standing) stamp(g, p, STANDING_GAP, 1, nearStart ? [to] : [from, to], STANDING_GAP + 0.15);
  stamp(g, from, ENDPOINT_FREE, 0, [], 0, ENDPOINT_CLEAR);
  stamp(g, to, ENDPOINT_FREE, 0, [], 0, ENDPOINT_CLEAR);
  return g;
}

function lineFree(g: Uint8Array, a: Vec2, b: Vec2): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2)));
  for (let k = 0; k <= n; k++) {
    if (g[rowOf(a.z + ((b.z - a.z) * k) / n) * COLS + colOf(a.x + ((b.x - a.x) * k) / n)]) return false;
  }
  return true;
}

/** The free cell nearest to `start` (breadth first), or `start` itself when nothing is free nearby. */
function nearestFree(g: Uint8Array, start: number): number {
  if (!g[start]) return start;
  const seen = new Set([start]);
  let ring = [start];
  for (let depth = 0; depth < 20 && ring.length > 0; depth++) {
    const next: number[] = [];
    for (const c of ring) {
      const i = c % COLS;
      const j = (c - i) / COLS;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
        const n = nj * COLS + ni;
        if (seen.has(n)) continue;
        if (!g[n]) return n;
        seen.add(n);
        next.push(n);
      }
    }
    ring = next;
  }
  return start;
}

const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** A* over the grid, 8-connected, never cutting a blocked corner. Returns the cells from start to goal, or null. */
function search(g: Uint8Array, from: Vec2, to: Vec2): number[] | null {
  const start = nearestFree(g, rowOf(from.z) * COLS + colOf(from.x));
  const goal = nearestFree(g, rowOf(to.z) * COLS + colOf(to.x));
  const gi = goal % COLS;
  const gj = (goal - gi) / COLS;
  const cc = cellCosts();
  // Octile distance at the cheapest cost per cell, so the estimate never overshoots.
  const h = (c: number) => {
    const dx = Math.abs((c % COLS) - gi);
    const dz = Math.abs(Math.floor(c / COLS) - gj);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * WALKWAY_COST;
  };
  const cost = new Float64Array(COLS * ROWS).fill(Infinity);
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  // Binary min-heap of cells keyed by f = cost + h.
  const heap: number[] = [];
  const f: number[] = [];
  const push = (c: number, key: number) => {
    heap.push(c);
    f.push(key);
    let k = heap.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (f[up]! <= f[k]!) break;
      [heap[up], heap[k]] = [heap[k]!, heap[up]!];
      [f[up], f[k]] = [f[k]!, f[up]!];
      k = up;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const lastC = heap.pop()!;
    const lastF = f.pop()!;
    if (heap.length > 0) {
      heap[0] = lastC;
      f[0] = lastF;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && f[l]! < f[m]!) m = l;
        if (r < heap.length && f[r]! < f[m]!) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        [f[m], f[k]] = [f[k]!, f[m]!];
        k = m;
      }
    }
    return top;
  };
  cost[start] = 0;
  push(start, h(start));
  while (heap.length > 0) {
    const c = pop();
    if (c === goal) {
      const cells = [c];
      for (let p = came[c]!; p !== -1; p = came[p]!) cells.push(p);
      return cells.reverse();
    }
    if (closed[c]) continue;
    closed[c] = 1;
    const i = c % COLS;
    const j = (c - i) / COLS;
    for (const [di, dj, w] of STEPS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const n = nj * COLS + ni;
      if (g[n] || closed[n]) continue;
      if (di !== 0 && dj !== 0 && (g[j * COLS + ni] || g[nj * COLS + i])) continue;
      const next = cost[c]! + (w * (cc[c]! + cc[n]!)) / 2;
      if (next < cost[n]!) {
        cost[n] = next;
        came[n] = c;
        push(n, next + h(n));
      }
    }
  }
  return null;
}

/**
 * Keep only the turns: from each point, jump to the farthest later point in plain sight whose straight line costs no
 * more than the grid path it replaces (so a shortcut never drags the walk off a transit path for long).
 */
function pull(g: Uint8Array, points: Vec2[]): Vec2[] {
  const cum = [0];
  for (let k = 1; k < points.length; k++) cum.push(cum[k - 1]! + legCost(points[k - 1]!, points[k]!));
  const out = [points[0]!];
  for (let i = 0; i < points.length - 1; ) {
    let j = points.length - 1;
    while (j > i + 1 && !(lineFree(g, points[i]!, points[j]!) && legCost(points[i]!, points[j]!) <= (cum[j]! - cum[i]!) * 1.02)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

/**
 * The way from `from` to `to` around the furniture and glass, keeping `WALK_CLEARANCE`, through room doors, and
 * around robots standing at `standing` when there is a way past them: the cheapest grid path (walkways cost less, so
 * robots keep to the transit paths) pulled taut. A short hop in plain sight is a straight line. Ends exactly at `to`;
 * never returns the start point. `nearStart`: also keep clear of robots right next to the start (replanning round a
 * robot in the way).
 */
export function route(from: Vec2, to: Vec2, standing: readonly Vec2[] = [], nearStart = false): Vec2[] {
  if (Math.hypot(to.x - from.x, to.z - from.z) < 1e-3) return [];
  const end = { x: to.x, z: to.z };
  let g = walkGrid(from, to, standing, nearStart);
  // A short hop in plain sight needs no planning; anything longer may be cheaper along a walkway.
  if (Math.hypot(to.x - from.x, to.z - from.z) < 2 && lineFree(g, from, to)) return [end];
  let cells = search(g, from, to);
  if (!cells && standing.length > 0) {
    g = walkGrid(from, to, []);
    cells = search(g, from, to);
  }
  if (!cells) return [end];
  const points = [from, ...cells.map((c) => ({ x: cellX(c % COLS), z: cellZ(Math.floor(c / COLS)) })), end];
  return pull(g, points).slice(1);
}

export function pathLength(from: Vec2, path: Vec2[]): number {
  let total = 0;
  let prev = from;
  for (const p of path) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}
