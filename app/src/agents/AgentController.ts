import type { AgentId, AgentProfile, AgentState, AgentStatus } from "./agentTypes.ts";
import { SIM_CONFIG } from "../simulation/simulationConfig.ts";
import { DESK_IDS, LOCATIONS, WALK_CLEARANCE, route, segmentClearance, slotFor } from "../simulation/worldLayout.ts";
import type { LocationId, Vec2 } from "../simulation/worldLayout.ts";

const DESKS = new Set<LocationId>(DESK_IDS);

/**
 * Actions are the only way an agent changes over time. `ambient` actions belong to idle behaviour
 * and are dropped the moment real work arrives; task actions are never interrupted.
 */
export type Action = (
  | { kind: "move"; to: LocationId; slot?: number; activity?: string }
  | { kind: "work"; duration: number; status: "working" | "thinking"; activity: string; onProgress?: (f: number) => void }
  | { kind: "talk"; target: AgentId; duration: number; activity: string; onStart?: () => void }
  | { kind: "emote"; status: "success" | "error"; duration: number; activity: string }
  | { kind: "wait"; until: () => boolean; timeout: number; activity: string; face?: number; status?: "idle" | "working" | "thinking" }
  | { kind: "call"; fn: () => void }
) & { ambient?: boolean };

export interface ControllerHooks {
  walkSpeed: number;
  onArrived(agent: AgentId, location: LocationId): void;
  /** Lets the speaker turn towards a listener without the controller knowing about other agents. */
  positionOf(agent: AgentId): Vec2;
  /** The listener turns to face the speaker only if it is idle, never mid-walk or mid-work. */
  faceIfIdle(listener: AgentId, speaker: AgentId): void;
  /** Every other robot: walks are planned around the ones standing still, and walkers give way to all of them. */
  others(agent: AgentId): { position: Vec2; walking: boolean }[];
}

const headingTo = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

/** `a` minus `b`, wrapped into (-π, π]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export class AgentController {
  readonly profile: AgentProfile;
  state: AgentState;
  private queue: Action[] = [];
  private current: Action | null = null;
  private elapsed = 0;
  /** Ground speed of the walk in progress, m/s. */
  private speed = 0;
  /** Sitting at its own desk (working or thinking there): the app shows it on its chair. */
  private seated = false;
  /** Time left getting up from the desk chair, and how much of it the walk in progress still waits for. */
  private rising = 0;
  private standUp = 0;
  /** How long the walk has been stopped by a robot in front, since the last replan and in all. */
  private blocked = 0;
  private stuck = 0;
  private hooks: ControllerHooks;

  constructor(profile: AgentProfile, hooks: ControllerHooks) {
    this.profile = profile;
    this.hooks = hooks;
    this.state = AgentController.homeState(profile);
  }

  static homeState(profile: AgentProfile): AgentState {
    const home = slotFor(profile.home, 0);
    return {
      id: profile.id,
      status: "idle",
      activity: "Idle",
      currentTaskId: null,
      progress: 0,
      location: profile.home,
      destination: null,
      position: { ...home.position },
      heading: home.facing,
      path: [],
      facingAgentId: null,
      paused: false,
    };
  }

  resetToHome(): void {
    this.queue = [];
    this.current = null;
    this.elapsed = 0;
    this.speed = 0;
    this.seated = false;
    this.rising = 0;
    this.standUp = 0;
    this.blocked = 0;
    this.stuck = 0;
    this.state = AgentController.homeState(this.profile);
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** True when everything pending is ambient and can be dropped for real work. */
  get onlyAmbient(): boolean {
    return (!this.current || this.current.ambient === true) && this.queue.every((a) => a.ambient === true);
  }

  get isIdleStill(): boolean {
    return !this.busy || (this.current?.kind === "wait" && (this.current.status ?? "idle") === "idle" && this.queue.length === 0);
  }

  /** Drop everything pending, ambient or not. Live sources use this when the real session moves on. */
  clear(): void {
    this.queue = [];
    this.current = null;
    this.elapsed = 0;
    this.speed = 0;
    this.state.path = [];
    this.state.destination = null;
    this.state.facingAgentId = null;
    this.state.progress = 0;
    this.setStatus("idle", "Idle");
  }

  enqueue(...actions: Action[]): void {
    this.queue.push(...actions);
  }

  /** Drop ambient actions; the agent stops where it is (next move routes from the current position). */
  interruptAmbient(): void {
    if (!this.onlyAmbient) return;
    this.queue = [];
    this.current = null;
    this.elapsed = 0;
    this.speed = 0;
    this.state.path = [];
    this.state.destination = null;
    this.state.facingAgentId = null;
    this.setStatus("idle", "Idle");
  }

  step(dt: number): void {
    if (this.state.paused) return;
    this.rising = Math.max(0, this.rising - dt);
    let budget = dt;
    // Instant actions (call, zero-length) chain within one tick; timed ones consume the budget.
    for (let guard = 0; guard < 64; guard++) {
      if (!this.current) {
        const next = this.queue.shift();
        if (!next) {
          if (this.state.status !== "idle") this.setStatus("idle", "Idle");
          this.state.progress = 0;
          return;
        }
        this.begin(next);
      }
      const left = this.advance(this.current!, budget);
      if (left === null) return;
      this.current = null;
      budget = left;
    }
  }

  private setStatus(status: AgentStatus, activity: string): void {
    this.state.status = status;
    this.state.activity = activity;
    // Working or thinking at its own desk it sits on its chair; when that ends it takes `standUp` s to get up.
    const wasSeated = this.seated;
    this.seated = (status === "working" || status === "thinking") && this.atDesk();
    if (wasSeated && !this.seated) this.rising = SIM_CONFIG.gait.standUp;
  }

  /** At the stand slot of a desk (where its chair is). */
  private atDesk(): boolean {
    const loc = this.state.location;
    if (!loc || !DESKS.has(loc) || this.state.path.length > 0) return false;
    const slot = LOCATIONS[loc].slots[0]!;
    return Math.hypot(this.state.position.x - slot.x, this.state.position.z - slot.z) < 0.3;
  }

  private begin(a: Action): void {
    this.current = a;
    this.elapsed = 0;
    switch (a.kind) {
      case "move": {
        const target = slotFor(a.to, a.slot ?? 0).position;
        const standing = this.hooks.others(this.profile.id).filter((o) => !o.walking).map((o) => o.position);
        this.state.path = route(this.state.position, target, standing);
        this.speed = 0;
        this.blocked = 0;
        this.stuck = 0;
        this.state.destination = a.to;
        this.state.location = null;
        this.state.facingAgentId = null;
        this.setStatus("walking", a.activity ?? `Walking to ${a.to}`);
        // Still getting up from the desk chair (perhaps only just now): the first step waits for that.
        this.standUp = this.rising;
        break;
      }
      case "work":
        this.setStatus(a.status, a.activity);
        break;
      case "talk":
        this.state.facingAgentId = a.target;
        this.state.heading = headingTo(this.state.position, this.hooks.positionOf(a.target));
        this.setStatus("communicating", a.activity);
        this.hooks.faceIfIdle(a.target, this.profile.id);
        a.onStart?.();
        break;
      case "emote":
        this.setStatus(a.status, a.activity);
        break;
      case "wait":
        if (a.face !== undefined) this.state.heading = a.face;
        this.setStatus(a.status ?? "idle", a.activity);
        break;
      case "call":
        break;
    }
  }

  /**
   * One tick of a walk. A robot getting up from its desk chair finishes that first. Then it turns towards the way it is
   * going before it sets off (it never walks sideways or backwards), speeds up and brakes instead of starting and
   * stopping dead, slows for sharp corners, gives way to the other robots, and at the end turns on the spot to face the
   * way the slot faces. Returns leftover dt once there.
   */
  private walk(a: Extract<Action, { kind: "move" }>, dt: number): number | null {
    const s = this.state;
    const { accel, decel, minSpeed } = SIM_CONFIG.gait;
    const top = this.hooks.walkSpeed;
    let t = dt;
    if (this.standUp > 0) {
      const used = Math.min(this.standUp, t);
      this.standUp -= used;
      t -= used;
      if (t <= 0) return null;
    }
    const crowd = s.path.length > 0 ? this.giveWay(t) : 1;
    for (let guard = 0; guard < 64; guard++) {
      const p = s.path[0];
      if (!p) {
        this.speed = 0;
        const left = this.turnTo(slotFor(a.to, a.slot ?? 0).facing, t);
        if (left === null) return null;
        s.location = a.to;
        s.destination = null;
        this.hooks.onArrived(this.profile.id, a.to);
        return left;
      }
      const dx = p.x - s.position.x;
      const dz = p.z - s.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-9) {
        s.path.shift();
        continue;
      }
      const want = Math.atan2(dx, dz);
      this.turnTo(want, t);
      // Facing well away from the way to go: turn on the spot first, then set off.
      const align = Math.min(1, Math.max(0, (Math.cos(angleDiff(want, s.heading)) - 0.2) / 0.8));
      const after = s.path[1];
      const corner = after ? Math.max(0.3, Math.cos(Math.abs(angleDiff(Math.atan2(after.x - p.x, after.z - p.z), want)) / 2)) * top : minSpeed;
      const goal = Math.min(top * crowd, Math.sqrt(corner * corner + 2 * decel * d)) * align;
      this.speed = this.speed < goal ? Math.min(goal, this.speed + accel * t) : Math.max(goal, this.speed - 2 * decel * t);
      if (goal > 0) this.speed = Math.max(this.speed, minSpeed * align);
      const step = this.speed * t;
      if (step < d) {
        s.position = { x: s.position.x + (dx / d) * step, z: s.position.z + (dz / d) * step };
        return null;
      }
      s.position = { x: p.x, z: p.z };
      s.path.shift();
      t -= d / this.speed;
    }
    return null;
  }

  /** Turn towards `goal` at the gait's turn rate for `dt`; returns the time left over once facing it, else null. */
  private turnTo(goal: number, dt: number): number | null {
    const rate = SIM_CONFIG.gait.turnRate;
    const d = angleDiff(goal, this.state.heading);
    if (Math.abs(d) <= rate * dt) {
      this.state.heading = goal;
      return dt - Math.abs(d) / rate;
    }
    this.state.heading = angleDiff(this.state.heading + Math.sign(d) * rate * dt, 0);
    return null;
  }

  /**
   * Make room for the other robots: step aside from anyone close ahead (never closer to furniture than the walk
   * already goes) and slow down behind someone in the way. Never step into a robot: closer than `minGap` with it in
   * front, stop (still stepping aside); stopped for `replanAfter` s, find a way round every robot; only after
   * `giveUpAfter` s, or on the last stretch to its own spot (someone may be standing on it), squeeze past. Returns the
   * speed factor.
   */
  private giveWay(dt: number): number {
    const s = this.state;
    const p = s.path[0]!;
    const end = s.path[s.path.length - 1]!;
    const { personalSpace, sidestep, minGap, replanAfter, giveUpAfter } = SIM_CONFIG.gait;
    const d = Math.hypot(p.x - s.position.x, p.z - s.position.z);
    if (d < 1e-9) return 1;
    const ux = (p.x - s.position.x) / d;
    const uz = (p.z - s.position.z) / d;
    const others = this.hooks.others(this.profile.id);
    const insist = this.stuck < giveUpAfter && Math.hypot(end.x - s.position.x, end.z - s.position.z) > 0.9;
    let push = 0;
    let factor = 1;
    let blocked = false;
    for (const o of others) {
      const rx = o.position.x - s.position.x;
      const rz = o.position.z - s.position.z;
      const dist = Math.hypot(rx, rz);
      const ahead = rx * ux + rz * uz;
      if (dist >= personalSpace || ahead < -0.2) continue;
      // side > 0: the other robot is to the -n side, n = (uz, -ux), so step towards +n. Head-on (side 0) both
      // walkers step to their own -n, which takes them apart.
      const side = ux * rz - uz * rx;
      push += (side > 0 ? 1 : -1) * (1 - dist / personalSpace);
      if (ahead > 0 && Math.abs(side) < 0.8) factor = Math.min(factor, Math.min(1, Math.max(0.15, (dist - 0.7) / 0.6)));
      if (insist && ahead > 0.05 && dist < minGap && Math.abs(side) < minGap) blocked = true;
    }
    if (blocked) {
      factor = 0;
      this.blocked += dt;
      this.stuck += dt;
      if (this.blocked > replanAfter) {
        this.blocked = 0;
        s.path = route(s.position, end, others.map((o) => o.position), true);
      }
    } else this.blocked = 0;
    const shift = Math.max(-1, Math.min(1, push)) * sidestep * dt;
    if (Math.abs(shift) > 1e-6) {
      const next = { x: s.position.x + uz * shift, z: s.position.z - ux * shift };
      if (segmentClearance(next, p) >= Math.min(WALK_CLEARANCE, segmentClearance(s.position, p))) s.position = next;
    }
    return factor;
  }

  /** Returns leftover dt when the action finished, or null while still running. */
  private advance(a: Action, dt: number): number | null {
    switch (a.kind) {
      case "call":
        a.fn();
        return dt;
      case "move":
        return this.walk(a, dt);
      case "work":
      case "talk":
      case "emote":
      case "wait": {
        if (a.kind === "wait" && a.until()) return dt;
        const duration = a.kind === "wait" ? a.timeout : a.duration;
        this.elapsed += dt;
        const f = duration > 0 ? Math.min(1, this.elapsed / duration) : 1;
        if (a.kind === "work") {
          this.state.progress = f;
          a.onProgress?.(f);
        }
        if (f < 1) return null;
        const left = this.elapsed - duration;
        if (a.kind === "talk") this.state.facingAgentId = null;
        if (a.kind === "work") this.state.progress = 0;
        return Math.max(0, left);
      }
    }
  }
}
