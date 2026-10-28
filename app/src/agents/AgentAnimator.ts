import type { AgentState, AgentStatus } from "./agentTypes.ts";
import { DESK_IDS, DESK_SEAT, LOCATIONS } from "../simulation/worldLayout.ts";
import type { LocationId } from "../simulation/worldLayout.ts";

/**
 * Procedural pose blending (§6.4). Pure TypeScript, no three/React: every `AnimationState` is a pure function
 * of (animation time, walk phase, speed, seed) that returns a full `Pose`. The animator keeps one weight per
 * state, damps the weights towards the state the backend reports (frame-rate independent), and returns the
 * weighted sum. Time runs at 0.15× while the agent is paused or the simulation is not running, so a paused
 * world visibly holds still without snapping to a T-pose.
 *
 * Conventions (robot faces +z, joints rotate about their local axes):
 *   pitch < 0 swings a limb forward (+z); knees bend with pitch > 0; spine lean > 0 bends forward;
 *   headPitch > 0 looks down; yaw > 0 turns left (towards +x); roll > 0 tilts towards +x;
 *   ankles keep the feet flat on their own, and an ankle pitch > 0 on top of that points the toes down.
 *
 * Robots use the furniture (`interactionFor`). At its desk a working robot sits on its ergonomic chair (the chair
 * rolls in under it) and types, or leans back to think; at the Kanban board it moves sticky notes. On a break it sits
 * back on a sofa, the meeting-pod bench, a beanbag or the garden bench, makes a coffee, grabs a snack, takes a drink
 * from the fridge, takes a book off the shelf, plays the arcade, the claw machine, foosball or chess, checks the
 * server racks, works the war-room hologram, sketches on the whiteboard or watches the fish.
 */

/** What a robot does with the furniture where it is. */
export type Interaction =
  | "deskWork"
  | "deskThink"
  | "kanban"
  | "sofa"
  | "bench"
  | "beanbag"
  | "garden"
  | "coffee"
  | "snack"
  | "fridge"
  | "read"
  | "play"
  | "claw"
  | "foosball"
  | "chess"
  | "inspect"
  | "hologram"
  | "sketch"
  | "aquarium";

export type AnimationState = "idle" | "walk" | "work" | "think" | "talk" | "success" | "error" | Interaction;

const INTERACTIONS: readonly Interaction[] = [
  "deskWork",
  "deskThink",
  "kanban",
  "sofa",
  "bench",
  "beanbag",
  "garden",
  "coffee",
  "snack",
  "fridge",
  "read",
  "play",
  "claw",
  "foosball",
  "chess",
  "inspect",
  "hologram",
  "sketch",
  "aquarium",
];

export const ANIMATION_STATES: readonly AnimationState[] = ["idle", "walk", "work", "think", "talk", "success", "error", ...INTERACTIONS];

/** States that sit the robot back onto a seat. Desk chairs have their own timeline (`deskSeatPhases`). */
const SEATED: readonly AnimationState[] = ["sofa", "bench", "beanbag", "garden"];

const BREAK_AT: Partial<Record<LocationId, Interaction>> = {
  lounge: "sofa",
  collab: "bench",
  beanbags: "beanbag",
  garden: "garden",
  pantry: "coffee",
  snacks: "snack",
  fridge: "fridge",
  library: "read",
  arcade: "play",
  claw: "claw",
  foosball: "foosball",
  chess: "chess",
  servers: "inspect",
  warroom: "hologram",
  whiteboard: "sketch",
  aquarium: "aquarium",
};

const DESKS = new Set<LocationId>(DESK_IDS);

/**
 * What a robot is doing with the furniture where it stands: working or thinking at its own desk (seated), working at
 * the Kanban board, or a break-spot activity while idle there. Null while it walks, talks, celebrates, or stands
 * anywhere else.
 */
export function interactionFor(a: Pick<AgentState, "status" | "location" | "path" | "position">): Interaction | null {
  if (!a.location || a.path.length > 0) return null;
  if (a.status === "working" || a.status === "thinking") {
    if (a.location === "planning") return a.status === "working" ? "kanban" : null;
    if (!DESKS.has(a.location)) return null;
    const slot = LOCATIONS[a.location].slots[0]!;
    if (Math.hypot(a.position.x - slot.x, a.position.z - slot.z) > 0.3) return null;
    return a.status === "working" ? "deskWork" : "deskThink";
  }
  if (a.status !== "idle") return null;
  return BREAK_AT[a.location] ?? null;
}

/** The claw machine plays rounds of this many seconds; the machine and the robot agree on which rounds win. */
export const CLAW_ROUND = 9;

export function clawWins(round: number): boolean {
  const s = Math.sin(round * 127.1 + 311.7 * 7 + 74.7 * 11) * 43758.5453;
  return s - Math.floor(s) > 0.45;
}

export const POSE_KEYS = [
  "bob",
  "lean",
  "twist",
  "sway",
  "headPitch",
  "headYaw",
  "headRoll",
  "lShoulderPitch",
  "lShoulderRoll",
  "lElbow",
  "rShoulderPitch",
  "rShoulderRoll",
  "rElbow",
  "lHip",
  "lKnee",
  "rHip",
  "rKnee",
  /** Extra ankle pitch on top of keeping the foot flat (> 0 points the toes down). */
  "lAnkle",
  "rAnkle",
  /** Whole body forward (+) or back (−) from where the robot stands, in metres: how it sits back onto a seat. */
  "shiftZ",
  /** Chest / eye glow multiplier, 1 = neutral. */
  "glow",
  /** Eye lights closing: 0 open, 1 shut. */
  "blink",
  /** How much of a held prop shows (0 hidden, 1 in hand): a cup, a book, a marker, a can, a snack, a plush toy. */
  "cup",
  "book",
  "marker",
  "can",
  "snack",
  "plush",
] as const;

export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

/** World-space leg sizes of one robot (rig sizes × scale), so a seated pose puts its feet on the floor. */
export interface BodyDims {
  scale: number;
  hipHeight: number;
  thigh: number;
  shin: number;
}

const DEFAULT_BODY: BodyDims = { scale: 1, hipHeight: 0.66, thigh: 0.29, shin: 0.29 };

export interface PoseContext {
  /** Animation time in seconds (already scaled by the freeze factor). */
  t: number;
  /** Walk-cycle phase in radians, advanced by actual ground speed. */
  walkPhase: number;
  /** Ground speed normalised to the configured walk speed (0 standing, ~1 walking). */
  speed: number;
  /** Per-agent constant in [0, 1) so six robots never move in lockstep. */
  seed: number;
  /** Seconds since the current status began (animation time); drives one-shot emotes. */
  sinceStatus: number;
  /**
   * Amplitude of decorative motion: 1 normally, `REDUCED_MOTION` with `prefers-reduced-motion`. It damps sway,
   * breathing, typing, gestures, hops and shakes. Poses themselves (arms up on success, the slump on error, the
   * leg cycle while walking) keep their full size, because they carry information.
   */
  motion: number;
  /** How fast the robot is turning, rad/s (> 0 towards its +x side). */
  turn: number;
  /** Ground acceleration along the walk, m/s² (< 0 braking). */
  accel: number;
  body: BodyDims;
  /** Desk-chair timeline, 0 standing … 1 seated and tucked in (`deskSeatPhases`). */
  deskSeat: number;
}

/** Extra inputs for one animation frame. */
export interface MotionExtras {
  interaction?: Interaction | null;
  turn?: number;
  accel?: number;
}

/** Decorative-motion amplitude under `prefers-reduced-motion: reduce`. */
export const REDUCED_MOTION = 0.2;

export function neutralPose(): Pose {
  const p = {} as Pose;
  resetPose(p);
  return p;
}

function resetPose(p: Pose): void {
  for (const k of POSE_KEYS) p[k] = 0;
  p.glow = 1;
}

const TAU = Math.PI * 2;

/** Slow, non-repeating wander in about [-1, 1]: a sum of incommensurate sines. */
function wander(t: number, seed: number, rate = 1): number {
  const s = seed * 17.3;
  return 0.55 * Math.sin(t * 0.31 * rate + s) + 0.3 * Math.sin(t * 0.73 * rate + s * 2.1) + 0.15 * Math.sin(t * 1.37 * rate + s * 3.7);
}

/** Smooth 0..1 window that is 1 for `on` seconds out of every `period`, with soft edges. */
function every(t: number, period: number, on: number, offset: number): number {
  const u = (((t + offset * period) % period) + period) % period;
  const edge = Math.min(0.6, on / 3);
  if (u < edge) return smooth(u / edge);
  if (u < on - edge) return 1;
  if (u < on) return smooth((on - u) / edge);
  return 0;
}

/** Smooth 0..1 rise from `a` to `b` seconds. */
function ramp(k: number, a: number, b: number): number {
  return smooth((k - a) / (b - a));
}

/** Smooth window: rises over [a, a + edge], holds, falls over [b − edge, b]. */
function span(k: number, a: number, b: number, edge = 0.35): number {
  return Math.min(ramp(k, a, a + edge), 1 - ramp(k, b - edge, b));
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Deterministic noise in [0, 1). */
function noise(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Pose functions write into `p`, which arrives reset to the neutral pose (no allocation per frame).

/** Idle fidgets: one now and then, picked per cycle so each robot has its own habits. */
const FIDGETS = 5;

/** Standing at ease: breathing, glancing about, shifting weight from foot to foot. */
function stand(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const breathe = Math.sin(c.t * 1.6 + c.seed * TAU) * m;
  p.bob = breathe * 0.012;
  p.lean = -0.02 + breathe * 0.012;
  p.headYaw = wander(c.t, c.seed, 0.8) * 0.35 * m;
  p.headPitch = -0.04 + wander(c.t + 40, c.seed, 0.6) * 0.06 * m;
  p.headRoll = wander(c.t + 11, c.seed, 0.5) * 0.05 * m;
  p.lShoulderPitch = 0.04 + breathe * 0.03;
  p.rShoulderPitch = 0.04 - breathe * 0.03;
  p.lShoulderRoll = -0.1;
  p.rShoulderRoll = 0.1;
  p.lElbow = -0.18;
  p.rElbow = -0.18;
  // Shift weight from foot to foot now and then.
  const shift = wander(c.t + 7, c.seed, 0.4) * m;
  p.sway = shift * 0.035;
  p.lKnee = Math.max(0, shift) * 0.12;
  p.rKnee = Math.max(0, -shift) * 0.12;
}

function idle(c: PoseContext, p: Pose): void {
  stand(c, p);
  const m = c.motion;
  // Every 8–13 s, a short fidget: look around, stretch, check the wrist, tap a foot, or roll the neck.
  const period = 8 + c.seed * 5;
  const local = c.t + c.seed * 3.1 * period;
  const cycle = Math.floor(local / period);
  const u = local / period - cycle;
  const on = 2.8 / period;
  const w = (u < on ? Math.min(smooth(u / (on * 0.3)), smooth((on - u) / (on * 0.3))) : 0) * m;
  if (w <= 0) return;
  const k = u / on;
  switch (Math.floor(noise(cycle, c.seed * 13) * FIDGETS)) {
    case 0: {
      const look = Math.sin(k * TAU);
      p.headYaw += look * 0.75 * w;
      p.twist += look * 0.16 * w;
      break;
    }
    case 1:
      p.lShoulderPitch += (-2.75 - p.lShoulderPitch) * w;
      p.rShoulderPitch += (-2.75 - p.rShoulderPitch) * w;
      p.lShoulderRoll += -0.25 * w;
      p.rShoulderRoll += 0.25 * w;
      p.lElbow += 0.1 * w;
      p.rElbow += 0.1 * w;
      p.lean += -0.14 * w;
      p.headPitch += -0.3 * w;
      p.bob += 0.025 * w;
      p.lAnkle += 0.25 * w;
      p.rAnkle += 0.25 * w;
      break;
    case 2:
      p.lShoulderPitch += (-1.05 - p.lShoulderPitch) * w;
      p.lShoulderRoll += 0.5 * w;
      p.lElbow += (-1.7 - p.lElbow) * w;
      p.headPitch += 0.38 * w;
      p.headYaw += (-0.25 - p.headYaw) * w;
      break;
    case 3:
      p.rAnkle += -Math.max(0, Math.sin(c.t * 9)) * 0.4 * w;
      p.rKnee += 0.06 * w;
      p.headPitch += 0.08 * w;
      break;
    default:
      p.headRoll += Math.sin(k * TAU) * 0.28 * w;
      p.headPitch += Math.cos(k * TAU) * 0.12 * w;
      p.glow += Math.max(0, Math.sin(k * TAU * 3)) * 0.4 * w;
      break;
  }
}

function walk(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const amp = Math.min(1.15, c.speed);
  const s = Math.sin(c.walkPhase);
  const s2 = Math.sin(c.walkPhase * 2);
  // The stride stays (it says "walking"); the bounce, twist and sway on top of it are decoration.
  p.bob = (Math.abs(Math.cos(c.walkPhase)) * 0.045 * amp - 0.02 * amp) * m;
  // Lean into the walk, harder while speeding up, back a little while braking.
  p.lean = 0.07 * amp + Math.max(-0.08, Math.min(0.1, c.accel * 0.025));
  p.twist = s * 0.09 * amp * m;
  // Bank into turns, and look where the turn is going.
  const bank = Math.max(-0.14, Math.min(0.14, c.turn * amp * 0.07));
  p.sway = s * 0.025 * amp * m + bank;
  p.headPitch = -0.02;
  p.headYaw = -s * 0.06 * amp * m + Math.max(-0.45, Math.min(0.45, c.turn * 0.16));
  p.headRoll = -bank * 0.5;
  p.lHip = -s * 0.55 * amp;
  p.rHip = s * 0.55 * amp;
  // Knees bend in the swing phase of each leg.
  p.lKnee = Math.max(0, -Math.cos(c.walkPhase + 0.4)) * 0.75 * amp + 0.05;
  p.rKnee = Math.max(0, Math.cos(c.walkPhase + 0.4)) * 0.75 * amp + 0.05;
  // Heel strike (toes up as the leg reaches forward) and toe-off (pushing away behind).
  const toe = (x: number, swing: number) => (-0.24 * Math.max(0, x) + 0.32 * Math.max(0, -x) * Math.max(0, swing)) * amp;
  p.lAnkle = toe(s, -Math.cos(c.walkPhase));
  p.rAnkle = toe(-s, Math.cos(c.walkPhase));
  const arm = 0.5 * amp * (0.4 + 0.6 * m);
  p.lShoulderPitch = s * arm;
  p.rShoulderPitch = -s * arm;
  p.lShoulderRoll = -0.08;
  p.rShoulderRoll = 0.08;
  p.lElbow = -0.35 - Math.max(0, s) * 0.3 * amp * m;
  p.rElbow = -0.35 - Math.max(0, -s) * 0.3 * amp * m;
  p.glow = 1 + s2 * 0.02 * m;
}

function work(c: PoseContext, p: Pose): void {
  const m = c.motion;
  // Every ~9 s sit back for a moment and glance up at the screens; otherwise type. Now and then reach for the mouse.
  const glance = every(c.t, 9.5, 2.2, c.seed) * m;
  const mouse = every(c.t, 13, 2.6, c.seed + 0.55) * (1 - glance) * m;
  const type = 1 - glance;
  const tapL = Math.sin(c.t * 15 + c.seed * 9) * 0.08 * type * m;
  const tapR = Math.sin(c.t * 15 + c.seed * 9 + 1.9) * 0.08 * type * (1 - mouse) * m;
  p.lean = 0.2 - glance * 0.12;
  p.bob = -0.015 + Math.sin(c.t * 2.2) * 0.004 * m;
  p.sway = wander(c.t + 3, c.seed, 0.5) * 0.02 * m;
  p.headPitch = 0.22 * type - 0.12 * glance + Math.max(0, Math.sin(c.t * 1.7)) * 0.04 * m;
  p.headYaw = wander(c.t, c.seed, 0.5) * 0.12 * m + glance * 0.18 * Math.sin(c.seed * 20) + mouse * 0.12;
  p.lShoulderPitch = -0.95 + tapL + glance * 0.45;
  p.rShoulderPitch = -0.95 + tapR + glance * 0.25 + mouse * 0.25;
  p.lShoulderRoll = -0.05;
  p.rShoulderRoll = 0.05 + mouse * 0.32 + Math.sin(c.t * 3.1) * 0.05 * mouse;
  p.lElbow = -0.7 + tapL * 1.4 - glance * 0.2;
  p.rElbow = -0.7 + tapR * 1.4 - glance * 0.9 + mouse * 0.15;
  p.lKnee = 0.06;
  p.rKnee = 0.06;
  p.glow = 1.25 + Math.sin(c.t * 4.5) * 0.18 * m;
}

function think(c: PoseContext, p: Pose): void {
  const m = c.motion;
  // Hand to chin, other arm across the body; now and then look up and tap the temple instead.
  const look = every(c.t, 11, 3, c.seed + 0.3) * m;
  const tap = Math.max(0, Math.sin(c.t * 7)) * look;
  p.lean = -0.04;
  p.bob = Math.sin(c.t * 1.2 + c.seed * TAU) * 0.01 * m;
  p.headPitch = -0.12 - look * 0.16;
  p.headYaw = wander(c.t, c.seed, 0.45) * 0.3 * m;
  p.headRoll = 0.14 - look * 0.05;
  p.rShoulderPitch = -1.25 - look * 0.75;
  p.rShoulderRoll = -0.32 + look * 0.1;
  p.rElbow = -1.95 + look * 0.4 - tap * 0.15;
  p.lShoulderPitch = -0.45;
  p.lShoulderRoll = 0.4;
  p.lElbow = -1.3;
  p.sway = 0.02;
  p.rKnee = 0.12;
  p.glow = 0.95 + (0.5 + 0.5 * Math.sin(c.t * 2.2) * m) * 0.35;
}

function talk(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const g = Math.sin(c.t * 4.2 + c.seed * 5) * m;
  const g2 = Math.sin(c.t * 2.3 + c.seed * 3) * m;
  // Every few seconds the other hand takes over the explaining.
  const swap = every(c.t, 5.5, 2.2, c.seed + 0.2) * m;
  p.lean = 0.03;
  p.bob = Math.abs(Math.sin(c.t * 3.4)) * 0.012 * m;
  p.twist = g2 * 0.08;
  p.headPitch = Math.sin(c.t * 3.1) * 0.07 * m + Math.max(0, Math.sin(c.t * 1.9 + c.seed)) * 0.06 * m;
  p.headYaw = g2 * 0.12;
  // The raised, open hand stays: it is what "talking" looks like from across the room.
  p.rShoulderPitch = -0.95 + g * 0.3 + swap * 0.55;
  p.rShoulderRoll = 0.25 + g2 * 0.15;
  p.rElbow = -0.85 + g * 0.35 + swap * 0.3;
  p.lShoulderPitch = -0.5 - g2 * 0.25 - swap * (0.5 + g * 0.3);
  p.lShoulderRoll = -0.3 - swap * 0.1;
  p.lElbow = -0.9 - swap * 0.1;
  p.glow = 1.2 + Math.max(0, g) * 0.3;
}

function success(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  // Two little hops with both arms up in a V, waving. Reduced motion keeps the V, drops most of the hop.
  const hop = Math.max(0, Math.sin(k * 8.5)) * (k < 1.6 ? 1 : 0.4) * m;
  const wave = Math.sin(c.t * 10) * m;
  p.bob = hop * 0.16;
  p.lean = -0.12;
  p.headPitch = -0.28;
  p.lShoulderPitch = -2.75 + wave * 0.12;
  p.rShoulderPitch = -2.75 - wave * 0.12;
  p.lShoulderRoll = -0.45;
  p.rShoulderRoll = 0.45;
  p.lElbow = -0.25;
  p.rElbow = -0.25;
  p.lKnee = (1 - hop) * 0.3;
  p.rKnee = (1 - hop) * 0.3;
  p.lHip = -(1 - hop) * 0.12;
  p.rHip = -(1 - hop) * 0.12;
  // Toes point down in the air.
  p.lAnkle = hop * 0.4;
  p.rAnkle = hop * 0.4;
  p.glow = 1.7;
}

function error(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  // A short head shake, then a slump: shoulders drop, head down, arms hang. Reduced motion keeps the slump.
  const shake = k < 0.9 ? Math.sin(k * 22) * (0.9 - k) * 0.5 * m : 0;
  p.lean = 0.32;
  p.bob = -0.06;
  p.headPitch = 0.5;
  p.headYaw = shake;
  p.headRoll = -0.1;
  p.sway = -0.03;
  p.lShoulderPitch = 0.12;
  p.rShoulderPitch = 0.12;
  p.lShoulderRoll = 0.08;
  p.rShoulderRoll = -0.08;
  p.lElbow = -0.08;
  p.rElbow = -0.08;
  p.lKnee = 0.22;
  p.rKnee = 0.22;
  p.lHip = -0.12;
  p.rHip = -0.12;
  p.glow = 0.55 + Math.max(0, Math.sin(c.t * 9)) * 0.25 * m;
  p.blink = 0.35;
}

// ───────────────────────── using the furniture ─────────────────────────

/**
 * Sit back onto a seat whose top is `seatTop` m high and whose middle is `back` m behind where the robot stood: the
 * hips drop onto it, the thighs reach forward and the shins come down so the feet rest on the floor.
 */
function seated(c: PoseContext, p: Pose, seatTop: number, back: number): void {
  const b = c.body;
  const hip = seatTop + 0.06;
  // Thigh angle from straight down that brings the feet (shin vertical) to the floor.
  const reach = Math.acos(Math.max(-0.35, Math.min(0.95, (hip - b.shin - 0.09) / b.thigh)));
  p.shiftZ = -back;
  p.bob = (hip - b.hipHeight) / b.scale;
  p.lHip = -reach;
  p.rHip = -reach;
  p.lKnee = reach;
  p.rKnee = reach;
}

function sofa(c: PoseContext, p: Pose): void {
  const m = c.motion;
  seated(c, p, 0.38, 0.62);
  // Lean back into the cushions, hands on the thighs; now and then an arm along the backrest, or a chat.
  const arm = every(c.t, 14, 6, c.seed + 0.4) * m;
  const breathe = Math.sin(c.t * 1.3 + c.seed * TAU) * m;
  // Leaning into the cushions, not through them (Orion's cape is the deepest back).
  p.lean = -0.2 + breathe * 0.012;
  p.bob += breathe * 0.006;
  p.headPitch = -0.08 + wander(c.t + 5, c.seed, 0.5) * 0.08 * m;
  p.headYaw = wander(c.t, c.seed, 0.6) * 0.5 * m;
  p.headRoll = wander(c.t + 9, c.seed, 0.4) * 0.08 * m;
  p.lShoulderPitch = -0.55 + arm * 0.45;
  p.lShoulderRoll = -0.12 - arm * 1.1;
  p.lElbow = -0.75 + arm * 0.35;
  p.rShoulderPitch = -0.55;
  p.rShoulderRoll = 0.12;
  p.rElbow = -0.75;
  // One knee drifts out and back, the way a relaxed sitter's does.
  p.rHip += wander(c.t + 21, c.seed, 0.3) * 0.08 * m;
  p.glow = 0.9;
}

/** On the Meeting Pod's booth bench: hands on the knees, nodding along, and now and then talking with both hands. */
function bench(c: PoseContext, p: Pose): void {
  const m = c.motion;
  // Forward of the seat's middle, so a backpack only just meets the upholstered backrest.
  seated(c, p, 0.45, 0.57);
  const nod = Math.max(0, Math.sin(c.t * 2.4 + c.seed * 4)) * every(c.t, 7, 2.5, c.seed) * m;
  const speak = every(c.t, 9, 3.2, c.seed + 0.5) * m;
  const g = Math.sin(c.t * 4 + c.seed * 3) * speak;
  p.lean = -0.04 + speak * 0.08;
  p.headPitch = 0.02 + nod * 0.12 - speak * 0.05;
  p.headYaw = wander(c.t, c.seed, 0.7) * 0.55 * m;
  p.lShoulderPitch = -0.62 - speak * (0.35 + g * 0.2);
  p.rShoulderPitch = -0.62 - speak * (0.45 - g * 0.2);
  p.lShoulderRoll = 0.1 - speak * 0.25;
  p.rShoulderRoll = -0.1 + speak * 0.25;
  p.lElbow = -0.45 - speak * 0.5;
  p.rElbow = -0.45 - speak * 0.5;
}

/** Sunk into a beanbag: legs out, leaning right back with hands behind the head, laughing at the games now and then. */
function beanbag(c: PoseContext, p: Pose): void {
  const m = c.motion;
  seated(c, p, 0.3, 0.6);
  const laugh = every(c.t, 8, 1.4, c.seed + 0.3) * m;
  const breathe = Math.sin(c.t * 1.1 + c.seed * TAU) * m;
  p.lHip = -1.2;
  p.rHip = -1.05;
  p.lKnee = 0.6;
  p.rKnee = 0.9;
  p.lAnkle = 0.2;
  p.lean = -0.5 + breathe * 0.01 + laugh * Math.abs(Math.sin(c.t * 10)) * 0.06;
  p.headPitch = -0.12 + wander(c.t, c.seed, 0.4) * 0.06 * m;
  p.headYaw = wander(c.t + 4, c.seed, 0.5) * 0.4 * m;
  p.lShoulderPitch = -2.55;
  p.rShoulderPitch = -2.55;
  p.lShoulderRoll = -0.6;
  p.rShoulderRoll = 0.6;
  p.lElbow = -2.15;
  p.rElbow = -2.15;
  p.glow = 0.95 + laugh * 0.3;
}

/** On the garden bench looking up at the tree: still, slow breathing, eyes half shut for a while. */
function garden(c: PoseContext, p: Pose): void {
  const m = c.motion;
  // Sitting upright, a little forward of the backrest: the deepest backpack still clears it.
  seated(c, p, 0.47, 0.5);
  const breathe = Math.sin(c.t * 0.9 + c.seed * TAU) * m;
  const rest = every(c.t, 12, 5, c.seed + 0.2);
  p.lean = -0.08 + breathe * 0.015;
  p.headPitch = -0.28 + rest * 0.3 + wander(c.t, c.seed, 0.2) * 0.04 * m;
  p.headYaw = wander(c.t + 2, c.seed, 0.25) * 0.3 * m;
  p.lShoulderPitch = -0.6 + breathe * 0.02;
  p.rShoulderPitch = -0.6 + breathe * 0.02;
  p.lShoulderRoll = 0.12;
  p.rShoulderRoll = -0.12;
  p.lElbow = -0.55;
  p.rElbow = -0.55;
  p.blink = rest * 0.6;
  p.glow = 0.8 - rest * 0.15;
}

/** Reach into the snack bar, take something, then nibble it with a little chewing nod. */
function snack(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  const reach = span(k, 0, 1.6);
  const hold = ramp(k, 1.3, 1.9);
  const bite = hold * every(c.t, 2.6, 0.9, c.seed) * (0.7 + 0.3 * m);
  stand(c, p);
  const rest = 1 - Math.min(1, reach + hold);
  p.lean = 0.12 * reach;
  p.headPitch = 0.18 * reach + bite * (-0.08 + Math.sin(c.t * 14) * 0.04 * m) + p.headPitch * rest;
  p.rShoulderPitch = -1.35 * reach + (-0.7 - 0.5 * bite) * hold + p.rShoulderPitch * rest;
  p.rShoulderRoll = 0.05 * reach + (-0.1 - 0.2 * bite) * hold + p.rShoulderRoll * rest;
  p.rElbow = -0.3 * reach + (-1.4 - 0.85 * bite) * hold + p.rElbow * rest;
  p.snack = ramp(k, 1.1, 1.4);
}

/** Open the fridge with the left hand, reach in with the right, take a can, shut the door, then drink. */
function fridge(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  const pull = span(k, 0.1, 1.5, 0.45);
  const reach = span(k, 1.0, 2.6, 0.45);
  const shut = span(k, 2.5, 3.5, 0.35);
  const hold = ramp(k, 2.4, 3.0);
  const sip = hold * every(c.t, 3.2, 1.2, c.seed) * (0.7 + 0.3 * m);
  stand(c, p);
  const restL = 1 - Math.min(1, pull + shut);
  const restR = 1 - Math.min(1, reach + hold);
  p.lean = 0.16 * reach + 0.05 * pull;
  p.twist = 0.12 * pull - 0.1 * shut;
  p.headPitch = 0.12 * reach - 0.3 * sip + p.headPitch * (1 - reach);
  // Left hand on the handle: forward and across, then swinging out with the door; back across to shut it.
  p.lShoulderPitch = -1.1 * pull - 0.9 * shut + p.lShoulderPitch * restL;
  p.lShoulderRoll = (0.3 - ramp(k, 0.6, 1.3) * 0.75) * pull + 0.25 * shut + p.lShoulderRoll * restL;
  p.lElbow = -0.4 * pull - 0.5 * shut + p.lElbow * restL;
  p.rShoulderPitch = -1.35 * reach + (-0.6 - 0.45 * sip) * hold + p.rShoulderPitch * restR;
  p.rShoulderRoll = 0.08 * reach + (-0.12 - 0.12 * sip) * hold + p.rShoulderRoll * restR;
  p.rElbow = -0.25 * reach + (-1.55 - 0.6 * sip) * hold + p.rElbow * restR;
  p.can = ramp(k, 2.1, 2.4);
}

/**
 * At the claw machine: steer with the left hand for most of a round, slap the button, lean in to watch the claw, then
 * cheer with a plush toy on a winning round (`clawWins`) or shake the head and slump on a losing one.
 */
function claw(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const round = Math.floor(c.sinceStatus / CLAW_ROUND);
  const k = c.sinceStatus % CLAW_ROUND;
  const win = clawWins(round);
  const steer = 1 - ramp(k, 3.4, 3.8);
  const press = span(k, 3.3, 4.1, 0.2);
  const watch = span(k, 3.8, 6.8, 0.4);
  const react = span(k, 6.6, 8.6, 0.35);
  stand(c, p);
  p.lean = 0.1 + watch * 0.12 - react * (win ? 0.15 : -0.1);
  p.headPitch = 0.1 * steer - 0.05 * watch + react * (win ? -0.3 : 0.4);
  p.headYaw = react > 0 && !win ? Math.sin(k * 14) * 0.35 * react * m : p.headYaw * 0.3;
  p.lShoulderPitch = (-0.85 + Math.sin(c.t * 4.3) * 0.1 * m) * steer + (win ? -2.6 : 0.15) * react;
  p.lShoulderRoll = (0.18 + Math.sin(c.t * 5.1) * 0.12 * m) * steer + (win ? -0.4 : 0) * react;
  p.lElbow = -0.65 * steer - 0.2 * react;
  p.rShoulderPitch = -0.95 * press - 0.3 * watch + (win ? -2.6 : 0.15) * react;
  p.rShoulderRoll = 0.1 + (win ? 0.4 : 0) * react;
  p.rElbow = -0.35 * press - 0.4 * watch - 0.2 * react;
  const hop = win ? Math.max(0, Math.sin(k * 9)) * react * m : 0;
  p.bob = hop * 0.1 - (win ? 0 : react * 0.04);
  p.lAnkle = hop * 0.3;
  p.rAnkle = hop * 0.3;
  p.plush = win ? ramp(k, 6.7, 7.0) * (1 - ramp(k, 8.6, 8.9)) : 0;
  p.glow = 1 + (win ? react * 0.7 : -react * 0.3);
}

/** Foosball: crouched over the rods, hands working them fast, eyes on the ball; a fist pump after a goal. */
function foosball(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const goal = every(c.t, 10, 1.3, c.seed + 0.15) * m;
  const play = 1 - goal;
  const a = Math.sin(c.t * 7.5 + c.seed * 3) * m;
  const b = Math.sin(c.t * 8.7 + c.seed * 5 + 1.3) * m;
  p.lean = 0.28 * play + 0.05 * goal;
  p.lHip = -0.18;
  p.rHip = -0.18;
  p.lKnee = 0.3;
  p.rKnee = 0.3;
  p.bob = -0.05 * play + Math.max(0, Math.sin(c.t * 9)) * 0.06 * goal;
  p.twist = Math.sin(c.t * 3.1) * 0.14 * m * play;
  p.headPitch = 0.38 * play - 0.2 * goal;
  // The ball runs goal to goal along the table: follow it.
  p.headYaw = Math.sin(c.t * 1.7) * 0.3 * m * play;
  p.lShoulderPitch = (-0.68 + a * 0.16) * play - 0.3 * goal;
  p.rShoulderPitch = (-0.68 + b * 0.16) * play - 2.55 * goal;
  p.lShoulderRoll = 0.15;
  p.rShoulderRoll = -0.15 + goal * 0.25;
  p.lElbow = (-0.55 + a * 0.2) * play - 0.5 * goal;
  p.rElbow = (-0.55 + b * 0.2) * play - 1.1 * goal;
  p.glow = 1.1 + goal * 0.5;
}

/**
 * Chess at the high table: standing, leaning over the board with a hand at the chin; on its turn (the two players'
 * seeds take turns) it reaches out and moves a piece, in step with the table's own move every 5.5 s.
 */
function chess(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const move = Math.floor(c.sinceStatus / 5.5);
  const k = c.sinceStatus % 5.5;
  const mine = move % 2 === (c.seed > 0.5 ? 0 : 1);
  const reach = mine ? span(k, 3.7, 5.1, 0.35) : 0;
  const ponder = 1 - reach;
  stand(c, p);
  p.lean = 0.3 + reach * 0.12;
  p.lKnee = 0.08;
  p.rKnee = 0.08;
  p.headPitch = 0.42 + wander(c.t, c.seed, 0.3) * 0.05 * m;
  p.headYaw = wander(c.t + 3, c.seed, 0.4) * 0.12 * m;
  p.headRoll = 0.08 * ponder;
  p.rShoulderPitch = -1.25 * ponder - 0.85 * reach;
  p.rShoulderRoll = -0.32 * ponder + 0.05 * reach;
  p.rElbow = -1.95 * ponder - 0.25 * reach;
  // The other hand rests on the table's edge.
  p.lShoulderPitch = -0.7;
  p.lShoulderRoll = 0.2;
  p.lElbow = -0.55;
  p.glow = 1 + reach * 0.3;
}

/** Standing at the war-room hologram, both hands in it: pinching, spreading, and now and then a big swipe. */
function hologram(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const spread = (0.5 + 0.5 * Math.sin(c.t * 1.3 + c.seed * 4)) * m;
  const swipe = every(c.t, 6.5, 1.0, c.seed + 0.4) * m;
  const across = Math.sin(((c.t + c.seed * 6.5) % 6.5) * Math.PI);
  stand(c, p);
  p.lean = 0.06;
  p.headPitch = -0.1 + wander(c.t, c.seed, 0.6) * 0.06 * m;
  p.headYaw = swipe * across * 0.3;
  p.twist = swipe * across * 0.18;
  p.lShoulderPitch = -1.25 - spread * 0.1;
  p.rShoulderPitch = -1.3 + spread * 0.1 - swipe * 0.2;
  p.lShoulderRoll = -0.12 - spread * 0.28;
  p.rShoulderRoll = 0.12 + spread * 0.28 - swipe * (0.6 + across * 0.5);
  p.lElbow = -0.6;
  p.rElbow = -0.55;
  p.glow = 1.25 + spread * 0.25;
}

/** Drawing on the whiteboard with a marker in small loops, stepping back now and then to look at it. */
function sketch(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const look = every(c.t, 8, 2.2, c.seed + 0.35) * m;
  const draw = 1 - look;
  stand(c, p);
  p.lean = 0.04 * draw - 0.08 * look;
  p.headPitch = -0.15 * draw - 0.05 * look + Math.sin(c.t * 2.3) * 0.04 * m;
  p.headYaw = Math.sin(c.t * 1.1) * 0.12 * m * draw;
  p.headRoll = look * 0.15;
  p.rShoulderPitch = (-1.6 + Math.sin(c.t * 2.3) * 0.12 * m) * draw - 0.7 * look;
  p.rShoulderRoll = (0.1 + Math.sin(c.t * 3.1) * 0.15 * m) * draw + 0.05 * look;
  p.rElbow = (-0.35 + Math.sin(c.t * 4.1) * 0.1 * m) * draw - 0.3 * look;
  p.lShoulderPitch = -0.35;
  p.lShoulderRoll = -0.05;
  p.lElbow = -1.0;
  p.marker = 1;
}

/** Bent over the aquarium, head following the fish, now and then a gentle tap on the glass. */
function aquarium(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const tap = every(c.t, 7, 1.2, c.seed + 0.6) * m;
  stand(c, p);
  p.lean = 0.26;
  p.bob = -0.035;
  p.lHip = -0.12;
  p.rHip = -0.12;
  p.lKnee = 0.22;
  p.rKnee = 0.22;
  p.headPitch = 0.08;
  p.headYaw = Math.sin(c.t * 0.6 + c.seed * 5) * 0.45 * m;
  p.lShoulderPitch = -0.35;
  p.lShoulderRoll = 0.15;
  p.lElbow = -0.4;
  p.rShoulderPitch = -0.35 - tap * 0.85;
  p.rShoulderRoll = -0.15 + tap * 0.1;
  p.rElbow = -0.4 + tap * 0.15 - tap * Math.max(0, Math.sin(c.t * 16)) * 0.15;
  p.glow = 1 + Math.sin(c.t * 1.4) * 0.1 * m;
}

/** At the Kanban board: sticky pad in the left hand, the right placing and moving cards, stepping back to look. */
function kanban(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const look = every(c.t, 6, 1.8, c.seed + 0.1) * m;
  const place = 1 - look;
  const tap = Math.max(0, Math.sin(c.t * 5.5)) * place * m;
  stand(c, p);
  p.lean = 0.05 * place - 0.06 * look;
  p.headPitch = -0.22 * place - 0.3 * look;
  p.headYaw = Math.sin(c.t * 0.9) * 0.2 * m;
  p.rShoulderPitch = (-1.85 + Math.sin(c.t * 0.7) * 0.15 * m) * place - 0.4 * look - tap * 0.06;
  p.rShoulderRoll = (0.1 + Math.sin(c.t * 0.45) * 0.25 * m) * place;
  p.rElbow = -0.3 * place - 0.5 * look;
  p.lShoulderPitch = -0.8;
  p.lShoulderRoll = 0.3;
  p.lElbow = -1.4;
  p.glow = 1.15;
}

// ───────────────────────── sitting down at a desk ─────────────────────────

/**
 * The desk-chair timeline, from `q` = 0 (standing at the desk) to 1 (seated and tucked in): `pull` the chair out behind
 * the robot, `sit` back onto it, `scoot` in to the desk together. Getting up runs it backwards. The chair in the scene
 * follows the same phases, so robot and chair never pass through each other.
 */
export function deskSeatPhases(q: number): { pull: number; sit: number; scoot: number } {
  return { pull: smooth(q / 0.35), sit: smooth((q - 0.3) / 0.4), scoot: smooth((q - 0.65) / 0.35) };
}

/** Seconds to go from standing to tucked in, and back (getting up fits in the controller's `standUp` pause). */
const DESK_SIT_TIME = 1.3;
const DESK_RISE_TIME = 0.75;

/**
 * Working at its desk, seated (the seat itself comes from the desk-chair timeline): leaning in over the keyboard,
 * hands low on the keys, typing, now and then a glance up at the screens or a reach for the mouse. Until it is tucked
 * in, the arms stay relaxed and the head looks down at the seat.
 */
function deskWork(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const { sit, scoot } = deskSeatPhases(c.deskSeat);
  stand(c, p);
  const glance = every(c.t, 9.5, 2.2, c.seed) * m;
  const mouse = every(c.t, 13, 2.6, c.seed + 0.55) * (1 - glance) * m;
  const type = 1 - glance;
  const tapL = Math.sin(c.t * 15 + c.seed * 9) * 0.07 * type * m;
  const tapR = Math.sin(c.t * 15 + c.seed * 9 + 1.9) * 0.07 * type * (1 - mouse) * m;
  const f = scoot;
  const r = 1 - f;
  p.lean = 0.3 * f - glance * 0.15 * f + 0.1 * sit * r;
  p.headPitch = (0.12 * type - 0.08 * glance) * f + 0.25 * sit * r;
  p.headYaw = (wander(c.t, c.seed, 0.5) * 0.1 * m + mouse * 0.12) * f + p.headYaw * r;
  p.lShoulderPitch = (-0.78 + tapL * 0.6 + glance * 0.35) * f + p.lShoulderPitch * r;
  p.rShoulderPitch = (-0.78 + tapR * 0.6 + glance * 0.2 + mouse * 0.1) * f + p.rShoulderPitch * r;
  p.lShoulderRoll = -0.06 * f + p.lShoulderRoll * r;
  p.rShoulderRoll = (0.06 + mouse * 0.3) * f + p.rShoulderRoll * r;
  p.lElbow = (-0.55 + tapL * 1.2 - glance * 0.3) * f + p.lElbow * r;
  p.rElbow = (-0.55 + tapR * 1.2 - glance * 0.8) * f + p.rElbow * r;
  p.glow = 1 + 0.25 * f + Math.sin(c.t * 4.5) * 0.15 * m * f;
}

/** Scratch for `deskThink` (pose functions never allocate). */
const thinkBase: Pose = {} as Pose;

/** Thinking at its desk, seated: leaning back in the chair, hand to chin, swivelling a little. */
function deskThink(c: PoseContext, p: Pose): void {
  const { scoot } = deskSeatPhases(c.deskSeat);
  stand(c, p);
  for (const key of POSE_KEYS) thinkBase[key] = p[key];
  think(c, p);
  for (const key of POSE_KEYS) p[key] = thinkBase[key] + (p[key] - thinkBase[key]) * scoot;
  p.lean = -0.14 * scoot;
  p.twist = Math.sin(c.t * 0.5 + c.seed * 3) * 0.1 * c.motion * scoot;
}

/** Press the button, wait for the brew, take the cup, then sip from it now and then. */
function coffee(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  const press = span(k, 0, 1.7);
  const wait = span(k, 1.4, 3.8);
  const take = span(k, 3.5, 4.6);
  const hold = ramp(k, 4.3, 4.9);
  const sip = hold * every(c.t, 3.6, 1.3, c.seed) * (0.7 + 0.3 * m);
  stand(c, p);
  p.headPitch = 0.22 * (press + take) - 0.05 * wait + -0.22 * sip;
  p.headYaw *= 0.4;
  p.lean = 0.08 * (press + take) - 0.02;
  // Right arm: forward to the machine, press (a small poke), down to the drip tray, then the cup at the chest or lips.
  const poke = Math.max(0, Math.sin(k * 9)) * 0.08 * span(k, 0.6, 1.5, 0.2);
  p.rShoulderPitch = -1.25 * press - 0.95 * take + (-0.55 - 0.45 * sip) * hold + p.rShoulderPitch * (1 - Math.min(1, press + take + hold));
  p.rShoulderRoll = 0.1 - 0.15 * hold - 0.12 * sip;
  p.rElbow = (-0.35 - poke) * press - 0.55 * take + (-1.55 - 0.6 * sip) * hold + p.rElbow * (1 - Math.min(1, press + take + hold));
  // Left hand on the hip while waiting.
  p.lShoulderPitch += 0.2 * wait;
  p.lShoulderRoll += -0.35 * wait;
  p.lElbow += -1.2 * wait;
  p.cup = ramp(k, 3.9, 4.3);
}

/** Reach up for a book, bring it down, and read it in both hands, turning a page now and then. */
function read(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const k = c.sinceStatus;
  const reach = span(k, 0, 1.8, 0.5);
  const hold = ramp(k, 1.5, 2.3);
  const page = hold * every(c.t, 4.5, 0.9, c.seed) * m;
  stand(c, p);
  const rest = 1 - Math.min(1, reach + hold);
  p.headPitch = -0.3 * reach + 0.42 * hold + p.headPitch * rest;
  p.headYaw = p.headYaw * rest + wander(c.t, c.seed, 0.3) * 0.08 * hold;
  p.lean = -0.06 * reach + 0.08 * hold;
  // On tiptoe for the top shelf.
  p.lAnkle += 0.3 * reach;
  p.rAnkle += 0.3 * reach;
  p.bob += 0.03 * reach;
  p.rShoulderPitch = -2.35 * reach + (-0.9 + 0.25 * page) * hold + p.rShoulderPitch * rest;
  p.rShoulderRoll = -0.05 * reach + (-0.28 + 0.35 * page) * hold + p.rShoulderRoll * rest;
  p.rElbow = -0.25 * reach + (-1.15 - 0.2 * page) * hold + p.rElbow * rest;
  p.lShoulderPitch = -0.9 * hold + p.lShoulderPitch * (1 - hold);
  p.lShoulderRoll = 0.3 * hold + p.lShoulderRoll * (1 - hold);
  p.lElbow = -1.2 * hold + p.lElbow * (1 - hold);
  p.book = ramp(k, 1.1, 1.5);
}

/** Hands on the controls: the left works the stick, the right mashes buttons; a little hop on a good run. */
function play(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const cheer = every(c.t, 9, 1.1, c.seed + 0.6) * m;
  const busy = 1 - cheer;
  const hop = Math.max(0, Math.sin(c.t * 9)) * cheer;
  p.lean = 0.14 * busy - 0.08 * cheer;
  p.bob = -0.015 * busy + hop * 0.1;
  p.sway = Math.sin(c.t * 2.1 + c.seed) * 0.035 * m * busy;
  p.twist = Math.sin(c.t * 1.3) * 0.05 * m * busy;
  p.headPitch = 0.08 * busy - 0.25 * cheer;
  p.headYaw = Math.sin(c.t * 1.7) * 0.06 * m;
  p.lShoulderPitch = (-0.78 + Math.sin(c.t * 5.3) * 0.09 * m) * busy - 2.5 * cheer;
  p.lShoulderRoll = (0.12 + Math.sin(c.t * 7.1) * 0.1 * m) * busy - 0.4 * cheer;
  p.lElbow = -0.8 * busy - 0.3 * cheer;
  p.rShoulderPitch = -0.78 * busy - 2.5 * cheer;
  p.rShoulderRoll = -0.12 * busy + 0.4 * cheer;
  p.rElbow = (-0.8 - Math.max(0, Math.sin(c.t * 15)) * 0.14 * m) * busy - 0.3 * cheer;
  p.lKnee = 0.08 * busy + (1 - hop) * 0.2 * cheer;
  p.rKnee = 0.08 * busy + (1 - hop) * 0.2 * cheer;
  p.lAnkle = hop * 0.35;
  p.rAnkle = hop * 0.35;
  p.glow = 1.15 + cheer * 0.5;
}

/** Peer at the racks and tap the panel, hand on hip; now and then crouch to check the lower units. */
function inspect(c: PoseContext, p: Pose): void {
  const m = c.motion;
  const crouch = every(c.t, 10, 3.2, c.seed + 0.25) * (0.6 + 0.4 * m);
  const upright = 1 - crouch;
  const tap = Math.max(0, Math.sin(c.t * 6.5)) * 0.1 * m;
  p.lean = 0.14 * upright + 0.32 * crouch;
  p.bob = -0.17 * crouch;
  p.headPitch = (0.05 + wander(c.t, c.seed, 0.6) * 0.12 * m) * upright + 0.25 * crouch;
  p.headRoll = 0.16 * upright * (0.6 + 0.4 * Math.sin(c.t * 0.7 + c.seed));
  p.headYaw = wander(c.t + 3, c.seed, 0.8) * 0.3 * m;
  p.rShoulderPitch = (-1.3 + tap) * upright - 0.9 * crouch;
  p.rShoulderRoll = 0.08;
  p.rElbow = (-0.55 - tap) * upright - 0.4 * crouch;
  p.lShoulderPitch = 0.12 * upright - 0.5 * crouch;
  p.lShoulderRoll = -0.4 * upright;
  p.lElbow = -1.35 * upright - 0.6 * crouch;
  p.lHip = -0.7 * crouch;
  p.rHip = -0.7 * crouch;
  p.lKnee = 1.05 * crouch + 0.05;
  p.rKnee = 1.05 * crouch + 0.05;
  p.glow = 1.1;
}

export const POSE_FUNCTIONS: Record<AnimationState, (c: PoseContext, out: Pose) => void> = {
  idle,
  walk,
  work,
  think,
  talk,
  success,
  error,
  deskWork,
  deskThink,
  kanban,
  sofa,
  bench,
  beanbag,
  garden,
  coffee,
  snack,
  fridge,
  read,
  play,
  claw,
  foosball,
  chess,
  inspect,
  hologram,
  sketch,
  aquarium,
};

export function animationStateFor(status: AgentStatus): AnimationState {
  switch (status) {
    case "walking":
      return "walk";
    case "working":
      return "work";
    case "thinking":
      return "think";
    case "communicating":
      return "talk";
    case "success":
      return "success";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

/** Animation speed multiplier: 0.15 when the agent is paused or the simulation is not running. */
export const FROZEN_TIME_SCALE = 0.15;
const WEIGHT_LAMBDA = 7;
/** Full stride (2π) per this many metres at speed 1. */
const STRIDE_M = 1.45;

export class AgentAnimator {
  readonly weights = Object.fromEntries(ANIMATION_STATES.map((s) => [s, s === "idle" ? 1 : 0])) as Record<AnimationState, number>;
  readonly pose: Pose = neutralPose();
  private time = 0;
  private walkPhase = 0;
  /** Stepping phase while turning on the spot. */
  private turnPhase = 0;
  private statusTime = 0;
  private lastState: AnimationState = "idle";
  private readonly seed: number;
  /** Desk-chair timeline (0 standing … 1 tucked in at the desk); the scene's chair follows it. */
  private seat = 0;

  constructor(seed: number, body: BodyDims = DEFAULT_BODY) {
    this.seed = seed;
    this.time = seed * 50;
    this.ctx.body = body;
  }

  /** Reused every frame: the context passed to the pose functions and the scratch pose they write. */
  private readonly ctx: PoseContext = { t: 0, walkPhase: 0, speed: 0, seed: 0, sinceStatus: 0, motion: 1, turn: 0, accel: 0, body: DEFAULT_BODY, deskSeat: 0 };
  private readonly scratch: Pose = neutralPose();
  private readonly seatLegs: Pose = neutralPose();

  /** Where the desk-chair timeline is, 0 … 1. */
  get deskSeat(): number {
    return this.seat;
  }

  /** How seated the robot is, 0 … 1, on any seat: while seated it neither turns nor steps on the spot. */
  get seatedWeight(): number {
    let w = deskSeatPhases(this.seat).sit;
    for (const s of SEATED) w += this.weights[s];
    return Math.min(1, w);
  }

  /**
   * Advance by `dt` real seconds and return the blended pose (the same object every call; nothing is
   * allocated). `groundSpeed` is the displayed root's speed in m/s; `walkSpeed` normalises it. `motion` is
   * the decorative-motion amplitude (1, or `REDUCED_MOTION`). `extra` says what the robot is using at a break spot
   * (it overrides the status pose) and how it is turning and speeding up.
   */
  update(dt: number, status: AgentStatus, frozen: boolean, groundSpeed: number, walkSpeed: number, motion = 1, extra: MotionExtras = {}): Pose {
    const k = frozen ? FROZEN_TIME_SCALE : 1;
    const adt = dt * k;
    this.time += adt;
    const state = extra.interaction ?? animationStateFor(status);
    if (state !== this.lastState) {
      this.lastState = state;
      this.statusTime = 0;
    } else this.statusTime += adt;

    const speed = Math.min(1.3, groundSpeed / Math.max(0.01, walkSpeed));
    this.walkPhase += (groundSpeed * adt * TAU) / STRIDE_M;
    const turn = extra.turn ?? 0;

    const decay = 1 - Math.exp(-WEIGHT_LAMBDA * dt * k);
    let total = 0;
    for (const s of ANIMATION_STATES) {
      const target = s === state ? 1 : 0;
      this.weights[s] += (target - this.weights[s]) * decay;
      total += this.weights[s];
    }
    // Sit down at the desk (pull the chair out, sit, scoot in) or get up, at a steady pace on the animation clock.
    const atDesk = state === "deskWork" || state === "deskThink";
    this.seat = Math.min(1, Math.max(0, this.seat + (atDesk ? adt / DESK_SIT_TIME : -adt / DESK_RISE_TIME)));

    const ctx = this.ctx;
    ctx.deskSeat = this.seat;
    ctx.t = this.time;
    ctx.walkPhase = this.walkPhase;
    ctx.speed = state === "walk" ? speed : Math.min(speed, 0.6);
    ctx.seed = this.seed;
    ctx.sinceStatus = this.statusTime;
    ctx.motion = motion;
    ctx.turn = turn;
    ctx.accel = extra.accel ?? 0;
    const out = this.pose;
    const p = this.scratch;
    for (const key of POSE_KEYS) out[key] = 0;
    for (const s of ANIMATION_STATES) {
      const w = this.weights[s] / (total || 1);
      if (w < 1e-4) continue;
      resetPose(p);
      POSE_FUNCTIONS[s](ctx, p);
      for (const key of POSE_KEYS) out[key] += p[key] * w;
    }
    // Still sliding after the walk ended (the root damps into place): keep the legs honest.
    if (state !== "walk" && speed > 0.2) {
      const s = Math.sin(this.walkPhase) * Math.min(1, speed) * 0.4;
      out.lHip += -s;
      out.rHip += s;
    }
    // At the desk: sit back onto the pulled-out chair, then scoot in with it (the seat timeline, not the weights).
    if (this.seat > 0) {
      const { sit, scoot } = deskSeatPhases(this.seat);
      resetPose(this.seatLegs);
      seated(ctx, this.seatLegs, DESK_SEAT.seatTop, 0);
      for (const key of ["bob", "lHip", "rHip", "lKnee", "rKnee", "lAnkle", "rAnkle"] as const) out[key] += (this.seatLegs[key] - out[key]) * sit;
      out.shiftZ -= DESK_SEAT.pulled * sit - (DESK_SEAT.pulled - DESK_SEAT.tucked) * scoot;
    }
    // Turning on the spot: small alternating steps instead of spinning on planted feet.
    const seatedW = this.seatedWeight;
    const stepping = Math.min(1, Math.max(0, (Math.abs(turn) - 0.5) / 1.5)) * Math.max(0, 1 - this.weights.walk * Math.min(1, speed * 2) - seatedW);
    this.turnPhase += Math.abs(turn) * adt * 2.6;
    if (stepping > 0.01) {
      const l = Math.max(0, Math.sin(this.turnPhase)) * stepping;
      const r = Math.max(0, -Math.sin(this.turnPhase)) * stepping;
      out.lHip -= l * 0.28;
      out.lKnee += l * 0.55;
      out.rHip -= r * 0.28;
      out.rKnee += r * 0.55;
      out.sway += Math.sin(this.turnPhase) * 0.03 * stepping;
    }
    // Blink: a quick close of the eye lights every few seconds, now and then twice.
    const period = 3.1 + this.seed * 2.4;
    const u = (this.time + this.seed * 7) % period;
    const shut = (x: number) => (x >= 0 && x < 0.15 ? Math.sin((x / 0.15) * Math.PI) : 0);
    const twice = noise(Math.floor((this.time + this.seed * 7) / period), this.seed) > 0.75 ? shut(u - 0.25) : 0;
    out.blink = Math.min(1, out.blink + Math.max(shut(u), twice) * (0.4 + 0.6 * motion));
    return out;
  }
}
