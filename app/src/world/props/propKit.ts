import * as THREE from "three";
import { FROZEN_TIME_SCALE } from "@/agents/AgentAnimator";
import type { AgentState } from "@/agents/agentTypes";
import { LOCATIONS } from "@/simulation/worldLayout";
import type { LocationId } from "@/simulation/worldLayout";
import { liveWorld } from "@/state/useWorldStore";
import { sharedMaterial } from "@/world/sharedResources";

/** The robot standing at `slot` of `location`, done walking, if any. */
export function userAt(location: LocationId, slot: number): AgentState | undefined {
  const p = LOCATIONS[location].slots[slot]!;
  return liveWorld.snapshot?.agents.find((a) => a.location === location && a.path.length === 0 && Math.hypot(a.position.x - p.x, a.position.z - p.z) < 0.3);
}

/** True while some robot stands at `slot` of `location`, done walking. */
export function inUse(location: LocationId, slot: number): boolean {
  return userAt(location, slot) !== undefined;
}

/** True while any slot of `location` is in use. */
export function anyInUse(location: LocationId): boolean {
  return LOCATIONS[location].slots.some((_, i) => inUse(location, i));
}

/**
 * How long a prop has been in use: 0 while free. Kept in a ref, one per prop, so a prop's own little show (a fridge
 * door opening, a claw going down) starts when its robot arrives. It runs on the robots' animation clock, slowing
 * down with them while its user is paused or the simulation is not, so the show stays in step with the robot.
 */
export class UseClock {
  private t = -1;

  update(user: AgentState | undefined, dt: number): number {
    if (!user) {
      this.t = -1;
      return 0;
    }
    const frozen = user.paused || liveWorld.snapshot?.status !== "running";
    this.t = this.t < 0 ? 0 : this.t + dt * (frozen ? FROZEN_TIME_SCALE : 1);
    return this.t;
  }
}

/** Unlit, untonemapped colour: screens, LEDs, signs. */
export const glowMaterial = (key: string, color: string) => sharedMaterial(key, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));

/** Smooth 0..1 rise between `a` and `b`. */
export function ramp(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Colourful, slightly pastel palette for snacks, plush toys, sticky notes. */
export const CANDY = ["#ff6b6b", "#ffd166", "#06d6a0", "#4cc9f0", "#f78c6b", "#c77dff", "#90be6d", "#ff8fab"];
