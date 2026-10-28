"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { deskSeatPhases } from "@/agents/AgentAnimator";
import { getAgent } from "@/agents/AgentRegistry";
import type { AgentId, AgentState } from "@/agents/agentTypes";
import type { LiveWorldState } from "@/integrations/AgentBackend";
import { PHASE_LABEL } from "@/components/ui";
import { isTerminal } from "@/simulation/WorkflowStateMachine";
import { shortTitle } from "@/simulation/workContent";
import { HUB_CENTER, LOCATIONS, MISSION_CONTROL, PROPS, deskLayout } from "@/simulation/worldLayout";
import { liveWorld, useWorldStore } from "@/state/useWorldStore";
import type { Task } from "@/tasks/taskTypes";
import { Instanced } from "@/world/Instanced";
import type { InstanceSpec } from "@/world/Instanced";
import { canvasTexture, glowTexture, screenTexture, uiFont } from "@/world/proceduralTextures";
import { geometries, materials, sharedGeometry, sharedMaterial } from "@/world/sharedResources";
import { agentDisplay } from "@/world/agentMotion";
import { STATIONS } from "@/world/stationOwners";
import type { StationDef } from "@/world/stationOwners";
import { useRenderCount } from "@/world/renderCounts";

/**
 * §6.3. L-shaped desks whose screens glow while their owner works (with an ergonomic chair that rolls in under the
 * robot while it works), the operations hub, the mission-control wall, the Kanban board and the sofa lounge.
 * Furniture repeated across desks is one InstancedMesh per part; only things with their own live state (screens,
 * chairs, the hub ring, the two canvas boards) update per frame. Everything live reads `liveWorld` inside
 * `useFrame` and never re-renders.
 */

const DESK_TOP_Y = 0.76;

function agentOf(id: AgentId): AgentState | undefined {
  return liveWorld.snapshot?.agents.find((a) => a.id === id);
}

/**
 * How brightly a desk's screens glow for its owner's status. Only while the owner is actually at this desk:
 * with robots on screen, a lit desk whose owner is visibly working at the planning board would be a lie.
 */
function glowFor(a: AgentState | undefined, running: boolean, here: boolean): number {
  if (!a || a.paused) return 0.08;
  if (!here) return 0.14;
  switch (a.status) {
    case "working":
      return running ? 2.1 : 1.3;
    case "thinking":
      return 0.6;
    case "communicating":
      return 0.4;
    case "success":
      return 1.2;
    case "error":
      return 0.6;
    default:
      return 0.14;
  }
}

/** Rotate a local (x, z) offset by heading `ry` about +y and add the origin. */
function place(ox: number, oz: number, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}

function monitorLayout(n: number): { dx: number; ry: number }[] {
  if (n >= 3) return [
    { dx: -0.68, ry: 0.32 },
    { dx: 0, ry: 0 },
    { dx: 0.68, ry: -0.32 },
  ];
  return [
    { dx: -0.36, ry: 0.12 },
    { dx: 0.36, ry: -0.12 },
  ];
}

const MONITOR_Y = 1.14;
const MONITOR_Z = -0.2;

// ───────────────────────── desk furniture (instanced across all stations) ─────────────────────────

function useDeskParts() {
  return useMemo(() => {
    const slabs: InstanceSpec[] = [];
    const wings: InstanceSpec[] = [];
    const legs: InstanceSpec[] = [];
    const laptops: InstanceSpec[] = [];
    const laptopScreens: InstanceSpec[] = [];
    const pots: InstanceSpec[] = [];
    const trunks: InstanceSpec[] = [];
    const foliage: InstanceSpec[] = [];
    const panels: InstanceSpec[] = [];
    const bezels: InstanceSpec[] = [];
    const stands: InstanceSpec[] = [];
    const feet: InstanceSpec[] = [];
    const keyboards: InstanceSpec[] = [];
    const mugs: InstanceSpec[] = [];
    const strips: InstanceSpec[] = [];
    for (const s of STATIONS) {
      const { x, z } = s.position;
      const d = deskLayout(s.id);
      slabs.push({ p: [x, DESK_TOP_Y, z] });
      // The L's return, reaching towards the robot on the outer side, standing on its own two legs at the far end.
      wings.push({ p: [d.wing.x, DESK_TOP_Y - 0.005, d.wing.z], s: [d.wing.sx, 0.06, d.wing.sz] });
      for (const sz of [-0.4, 0.4]) legs.push({ p: [x - d.side * 0.98, DESK_TOP_Y / 2, z + sz], s: [0.06, DESK_TOP_Y, 0.06] });
      for (const sx of [-0.24, 0.24]) legs.push({ p: [d.wing.x + sx, DESK_TOP_Y / 2, d.wing.z + d.wing.sz / 2 - 0.06], s: [0.06, DESK_TOP_Y, 0.06] });
      legs.push({ p: [x + d.side * 0.98, DESK_TOP_Y / 2, z - 0.4], s: [0.06, DESK_TOP_Y, 0.06] });
      // A laptop on the return, open towards the chair, and a bonsai at its far end.
      const turn = -d.side * 0.5;
      const lx = d.wing.x - d.side * 0.02;
      const lz = d.wing.z + 0.05;
      laptops.push({ p: [lx, DESK_TOP_Y + 0.035, lz], r: [0, turn, 0], s: [0.34, 0.016, 0.24] });
      const [sx2, sz2] = place(lx, lz, turn, 0, -0.12);
      laptopScreens.push({ p: [sx2, DESK_TOP_Y + 0.15, sz2], r: [-0.25, turn, 0], s: [0.33, 0.22, 0.012] });
      const bx = d.wing.x + d.side * 0.1;
      const bz = d.wing.z + d.wing.sz / 2 - 0.2;
      // Standing on the return, whose top is a centimetre below the main slab's.
      pots.push({ p: [bx, DESK_TOP_Y + 0.064, bz], s: [0.13, 0.08, 0.13] });
      trunks.push({ p: [bx + 0.01, DESK_TOP_Y + 0.16, bz], r: [0, 0, 0.35], s: [0.025, 0.14, 0.025] });
      for (const [fx, fy, fz, k] of [
        [-0.05, 0.25, 0.0, 0.13],
        [0.05, 0.27, 0.03, 0.11],
        [0.0, 0.31, -0.03, 0.09],
      ] as const)
        foliage.push({ p: [bx + fx, DESK_TOP_Y + fy, bz + fz], s: [k * 1.3, k * 0.8, k * 1.2], c: fx > 0 ? "#3f8a60" : "#2f7a52" });
      panels.push({ p: [x, 0.47, z - 0.4], s: [1.9, 0.42, 0.025] });
      for (const m of monitorLayout(s.monitors)) {
        const [mx, mz] = place(x + m.dx, z + MONITOR_Z, 0, 0, 0);
        bezels.push({ p: [mx, MONITOR_Y, mz], r: [0, m.ry, 0], s: [0.64, 0.4, 0.035] });
        const [px, pz] = place(mx, mz, m.ry, 0, -0.04);
        stands.push({ p: [px, 0.94, pz], s: [0.04, 0.3, 0.04] });
        feet.push({ p: [px, DESK_TOP_Y + 0.045, pz], r: [0, m.ry, 0], s: [0.24, 0.015, 0.15] });
      }
      // Near the front edge, under the hands of a robot sitting tucked in.
      keyboards.push({ p: [x - 0.05, DESK_TOP_Y + 0.045, z + 0.33], s: [0.52, 0.02, 0.17] });
      mugs.push({ p: [x + 0.82, DESK_TOP_Y + 0.085, z + 0.22], s: [0.08, 0.1, 0.08] });
      strips.push({ p: [x, DESK_TOP_Y - 0.02, z + 0.477], s: [1.95, 0.012, 0.012], c: getAgent(s.owner).color });
    }
    return { slabs, wings, legs, laptops, laptopScreens, pots, trunks, foliage, panels, bezels, stands, feet, keyboards, mugs, strips };
  }, []);
}

function DeskFurniture() {
  const parts = useDeskParts();
  const strip = sharedMaterial("deskStrip", () => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  return (
    <group name="desk-furniture">
      <Instanced geometry={geometries.slab()} material={materials.desk()} items={parts.slabs} castShadow />
      <Instanced geometry={geometries.box()} material={materials.metal()} items={parts.legs} castShadow />
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={parts.panels} castShadow />
      <Instanced geometry={geometries.box()} material={materials.plastic()} items={parts.bezels} castShadow />
      <Instanced geometry={geometries.box()} material={materials.metal()} items={parts.stands} />
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={parts.feet} />
      <Instanced geometry={geometries.box()} material={materials.plastic()} items={parts.keyboards} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.ceramic()} items={parts.mugs} />
      <Instanced geometry={geometries.box()} material={strip} items={parts.strips} receiveShadow={false} />
      <Instanced geometry={geometries.roundedBox()} material={materials.desk()} items={parts.wings} castShadow />
      <Instanced geometry={geometries.box()} material={materials.metal()} items={parts.laptops} castShadow />
      <Instanced geometry={geometries.box()} material={laptopGlow()} items={parts.laptopScreens} receiveShadow={false} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.ceramic()} items={parts.pots} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.wood()} items={parts.trunks} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.foliage} />
    </group>
  );
}

const laptopGlow = () => sharedMaterial("laptopScreen", () => new THREE.MeshBasicMaterial({ color: "#3b6f8f", toneMapped: false }));

// ───────────────────────── ergonomic chairs ─────────────────────────

type ChairGeo = "box" | "sphere" | "cylinderLow" | "roundedBox";
type ChairMat = "darkMetal" | "joint" | "metal" | "fabric" | "plastic";

const chairLocal = (p: readonly [number, number, number], s: readonly [number, number, number], r: readonly [number, number, number] = [0, 0, 0]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));

/**
 * An ergonomic chair in its own frame, the sitter facing −z: five-star base on casters, gas lift, seat, tall mesh
 * back with a lumbar bar, headrest and arms. Grouped by (geometry, material): one InstancedMesh per group.
 */
function chairGroups(): { g: ChairGeo; m: ChairMat; locals: THREE.Matrix4[] }[] {
  const parts: [ChairGeo, ChairMat, THREE.Matrix4][] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(["box", "darkMetal", chairLocal([Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15], [0.05, 0.035, 0.3], [0, a, 0])]);
    parts.push(["sphere", "joint", chairLocal([Math.sin(a) * 0.3, 0.035, Math.cos(a) * 0.3], [0.06, 0.06, 0.06])]);
  }
  parts.push(["cylinderLow", "metal", chairLocal([0, 0.28, 0], [0.05, 0.38, 0.05])]);
  parts.push(["roundedBox", "fabric", chairLocal([0, 0.5, 0], [0.52, 0.09, 0.5])]);
  parts.push(["roundedBox", "fabric", chairLocal([0, 0.9, 0.27], [0.48, 0.66, 0.06], [0.16, 0, 0])]);
  parts.push(["roundedBox", "fabric", chairLocal([0, 1.33, 0.34], [0.3, 0.15, 0.07], [0.16, 0, 0])]);
  parts.push(["box", "darkMetal", chairLocal([0, 0.75, 0.31], [0.08, 0.42, 0.03], [0.16, 0, 0])]);
  for (const sx of [-0.28, 0.28]) {
    parts.push(["box", "darkMetal", chairLocal([sx, 0.63, 0.05], [0.035, 0.22, 0.035])]);
    parts.push(["roundedBox", "plastic", chairLocal([sx, 0.75, 0.03], [0.08, 0.035, 0.28])]);
  }
  const groups = new Map<string, { g: ChairGeo; m: ChairMat; locals: THREE.Matrix4[] }>();
  for (const [g, m, local] of parts) {
    const key = `${g}|${m}`;
    const group = groups.get(key) ?? { g, m, locals: [] };
    group.locals.push(local);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const chairM = new THREE.Matrix4();
const chairQ = new THREE.Quaternion();
const chairP = new THREE.Vector3();
const chairS = new THREE.Vector3(1, 1, 1);
const chairOut = new THREE.Matrix4();

/**
 * Where a desk's chair is at a point `q` of its owner's desk-chair timeline (`deskSeatPhases`): parked beside the
 * desk; pulled straight back, then slid in behind the robot; then scooted in with it once it sits. Getting up retraces
 * it. The chair never crosses the robot: it moves behind it, and only moves with it once the robot sits on it.
 */
function chairAt(id: StationDef["id"], q: number): { x: number; z: number; rot: number } {
  const d = deskLayout(id);
  const { pull, scoot } = deskSeatPhases(q);
  const lerp = THREE.MathUtils.lerp;
  const back = Math.min(1, pull / 0.4);
  const across = Math.max(0, (pull - 0.4) / 0.6);
  let x = lerp(lerp(d.chairParked.x, d.chairAside.x, back), d.chairPulled.x, across);
  let z = lerp(lerp(d.chairParked.z, d.chairAside.z, back), d.chairPulled.z, across);
  if (scoot > 0) {
    x = lerp(d.chairPulled.x, d.chairTucked.x, scoot);
    z = lerp(d.chairPulled.z, d.chairTucked.z, scoot);
  }
  return { x, z, rot: lerp(d.chairParked.rot, 0, pull) };
}

/**
 * The six desk chairs. Each follows its owner's desk-chair timeline (published by the robot as `deskSeat`, on the
 * robot's own animation clock, so a paused world holds both still): pulled out when the robot sits down to work,
 * scooted in under it, pushed back and parked when it gets up.
 */
function DeskChairs() {
  useRenderCount("DeskChairs");
  const groups = useMemo(() => chairGroups(), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const last = useRef(STATIONS.map(() => -1));

  useFrame(() => {
    let moved = false;
    STATIONS.forEach((s, i) => {
      const owner = agentDisplay.get(s.owner);
      const q = owner?.state?.location === s.id || (owner?.deskSeat ?? 0) > 0 ? (owner?.deskSeat ?? 0) : 0;
      if (Math.abs(q - last.current[i]!) < 1e-5) return;
      last.current[i] = q;
      moved = true;
      const c = chairAt(s.id, q);
      chairP.set(c.x, 0, c.z);
      chairQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.rot);
      chairM.compose(chairP, chairQ, chairS);
      groups.forEach((group, gi) => {
        const mesh = meshes.current[gi];
        if (!mesh) return;
        group.locals.forEach((local, k) => mesh.setMatrixAt(i * group.locals.length + k, chairOut.multiplyMatrices(chairM, local)));
      });
    });
    if (!moved) return;
    for (const mesh of meshes.current) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="desk-chairs">
      {groups.map((group, gi) => (
        <instancedMesh
          key={`${group.g}|${group.m}`}
          ref={(m) => {
            meshes.current[gi] = m;
          }}
          args={[geometries[group.g](), materials[group.m](), group.locals.length * STATIONS.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// ───────────────────────── per-desk live parts ─────────────────────────

/** The screens of one desk: one InstancedMesh with its own scrolling texture and emissive level. */
function DeskScreens({ station }: { station: StationDef }) {
  useRenderCount("DeskScreens");
  const items = useMemo<InstanceSpec[]>(() => {
    const { x, z } = station.position;
    return monitorLayout(station.monitors).map((m) => {
      const [sx, sz] = place(x + m.dx, z + MONITOR_Z, m.ry, 0, 0.019);
      return { p: [sx, MONITOR_Y + 0.005, sz], r: [0, m.ry, 0], s: [0.6, 0.355, 1] };
    });
  }, [station]);

  const { material, texture } = useMemo(() => {
    const texture = screenTexture().clone();
    texture.repeat.set(1, 0.55);
    texture.offset.set(0, Math.abs(Math.sin(station.position.x)) % 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#03060b",
      roughness: 0.22,
      metalness: 0.2,
      emissive: "#ffffff",
      emissiveMap: texture,
      emissiveIntensity: 0.14,
    });
    return { material, texture };
  }, [station]);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );

  const meshRef = useRef<THREE.InstancedMesh>(null);
  useFrame((_, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const dt = Math.min(rawDt, 0.1);
    const snap = liveWorld.snapshot;
    const running = snap?.status === "running";
    const owner = agentOf(station.owner);
    const here = owner?.location === station.id;
    const goal = glowFor(owner, running, here);
    mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, goal, 3, dt);
    const working = here && owner?.status === "working" && !owner.paused;
    // Scrolling code says "working"; reduced motion keeps it, slower.
    const scroll = (working && running ? 0.09 : 0.004) * (useWorldStore.getState().reducedMotion ? 0.3 : 1);
    if (mat.emissiveMap) mat.emissiveMap.offset.y = (mat.emissiveMap.offset.y + dt * scroll) % 1;
  });

  return <Instanced name={`screens-${station.id}`} meshRef={meshRef} geometry={geometries.plane()} material={material} items={items} receiveShadow={false} />;
}

/** Floor glow under a desk while it is hovered or its owner is selected. */
function DeskHighlight({ station }: { station: StationDef }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: getAgent(station.owner).color,
        map: glowTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    [station],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = useWorldStore.getState();
    const hovered = st.hovered === `station:${station.id}`;
    const selected = st.selectedAgentId === station.owner && st.selectedAgentId !== null;
    const goal = hovered ? 0.5 : selected ? 0.3 : 0;
    const mesh = ref.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.damp(mat.opacity, goal, 8, dt);
    mesh.visible = mat.opacity > 0.004;
  });
  return (
    <mesh
      ref={ref}
      geometry={geometries.floorPlane()}
      material={material}
      position={[station.position.x, 0.012, station.position.z + 0.3]}
      scale={[3.6, 1, 2.6]}
      visible={false}
      renderOrder={1}
    />
  );
}

function Desks() {
  return (
    <group name="desks">
      <DeskFurniture />
      <DeskChairs />
      {STATIONS.map((s) => (
        <group key={s.id}>
          <DeskScreens station={s} />
          <DeskHighlight station={s} />
        </group>
      ))}
    </group>
  );
}

// ───────────────────────── operations hub ─────────────────────────

function OperationsHub() {
  const color = getAgent("orion").color;
  const ringRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const topRef = useRef<THREE.Mesh>(null);
  const torus = sharedGeometry("hubTorus", () => new THREE.TorusGeometry(0.98, 0.035, 10, 72).rotateX(Math.PI / 2));
  const { ringMat, haloMat, topMat } = useMemo(
    () => ({
      ringMat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, toneMapped: false }),
      haloMat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      topMat: new THREE.MeshStandardMaterial({ color: "#070b12", emissive: color, emissiveIntensity: 0.06, roughness: 0.15, metalness: 0.4 }),
    }),
    [color],
  );
  useEffect(
    () => () => {
      ringMat.dispose();
      haloMat.dispose();
      topMat.dispose();
    },
    [ringMat, haloMat, topMat],
  );
  const level = useRef(0.3);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime;
    const snap = liveWorld.snapshot;
    const running = snap?.status === "running";
    const orion = agentOf("orion");
    const working = !!orion && !orion.paused && orion.location === "hub" && (orion.status === "working" || orion.status === "thinking") && running;
    level.current = THREE.MathUtils.damp(level.current, working ? 1 : 0.3, 3, dt);
    const reduced = useWorldStore.getState().reducedMotion;
    const pulse = working && !reduced ? 0.5 + 0.5 * Math.sin(t * 4.2) : 0.5;
    const ring = ringRef.current;
    const top = topRef.current;
    if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + level.current * (0.35 + 0.35 * pulse);
    if (top) (top.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04 + level.current * 0.14;
    if (haloRef.current) {
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + level.current * 0.22 * (0.6 + 0.4 * pulse);
      if (!reduced) {
        haloRef.current.rotation.y += dt * (0.15 + level.current * 0.6);
        haloRef.current.position.y = 1.28 + Math.sin(t * 1.3) * 0.03;
      }
    }
  });

  const { x, z } = HUB_CENTER;
  return (
    <group name="operations-hub" position={[x, 0, z]}>
      <mesh geometry={geometries.cylinder()} material={materials.desk()} position={[0, 0.42, 0]} scale={[2.0, 0.84, 2.0]} castShadow receiveShadow />
      <mesh geometry={geometries.cylinder()} material={materials.darkMetal()} position={[0, 0.04, 0]} scale={[2.2, 0.08, 2.2]} receiveShadow />
      <mesh ref={topRef} geometry={geometries.cylinder()} material={topMat} position={[0, 0.875, 0]} scale={[1.9, 0.05, 1.9]} receiveShadow />
      <mesh ref={ringRef} geometry={torus} material={ringMat} position={[0, 0.9, 0]} />
      <mesh ref={haloRef} geometry={geometries.ring()} material={haloMat} position={[0, 1.28, 0]} scale={[0.62, 1, 0.62]} />
    </group>
  );
}

// ───────────────────────── mission control wall screen ─────────────────────────

const MC_W = 1024;
const MC_H = 384;
const MC_REDRAW_MS = 250;

function missionSignature(tasks: readonly Task[], agents: readonly AgentState[], simulated: boolean, live: LiveWorldState | undefined): string {
  let sig = `${simulated ? 1 : 0}|${tasks.length}|`;
  if (live) {
    sig += `${live.focus.mode}:${live.focus.sessionId ?? ""}|`;
    for (const s of live.sessions) sig += `${s.sessionId}:${s.status}:${s.title};`;
  }
  for (const t of tasks) sig += `${t.id}:${t.phase}:${t.status}:${t.assignedAgentId ?? ""}:${t.iteration}:${Math.round(t.progress * 50)};`;
  for (const a of agents) sig += `${a.status}${a.paused ? "p" : ""};`;
  return sig;
}

/**
 * Live with several sessions: the wall shows the session the robots follow (its tasks only), and a line for the rest.
 * Returns the tasks to list and the header/footer text; with no live state it is the whole task list as before.
 */
function focusView(tasks: readonly Task[], live: LiveWorldState | undefined): { tasks: readonly Task[]; following: string | null; others: string | null } {
  if (!live || live.sessions.length === 0) return { tasks, following: null, others: null };
  const focused = live.sessions.find((s) => s.sessionId === live.focus.sessionId) ?? null;
  const mine = focused ? tasks.filter((t) => !t.origin || t.origin.sessionId === focused.sessionId) : tasks;
  const rest = live.sessions.filter((s) => s.sessionId !== live.focus.sessionId && s.status !== "ended");
  const waiting = rest.filter((s) => s.status === "waiting").length;
  const running = rest.filter((s) => s.status === "running").length;
  const detail = [running ? `${running} running` : "", waiting ? `${waiting} waiting for you` : ""].filter(Boolean).join(", ");
  return {
    tasks: mine,
    following: focused ? `${live.focus.mode === "pinned" ? "PINNED" : "FOLLOWING"}: ${shortTitle(focused.title, 34)}${focused.project ? ` · ${focused.project}` : ""}` : null,
    others: rest.length ? `+${rest.length} other session${rest.length === 1 ? "" : "s"}${detail ? ` (${detail})` : ""}` : null,
  };
}

function drawMissionControl(g: CanvasRenderingContext2D, allTasks: readonly Task[], agents: readonly AgentState[], simulated: boolean, live?: LiveWorldState): void {
  const view = focusView(allTasks, live);
  const tasks = view.tasks;
  const font = uiFont();
  g.fillStyle = "#060a11";
  g.fillRect(0, 0, MC_W, MC_H);
  // faint grid
  g.strokeStyle = "rgba(124,196,214,0.05)";
  g.lineWidth = 1;
  for (let x = 0; x < MC_W; x += 32) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, MC_H);
    g.stroke();
  }
  g.textBaseline = "alphabetic";
  g.fillStyle = "#7c8797";
  g.font = `600 17px ${font}`;
  g.textAlign = "left";
  g.fillText(`MISSION CONTROL  ·  ${simulated ? "SIMULATION · NO LIVE INFERENCE" : view.following ?? "LIVE BACKEND"}`, 28, 38);
  const done = tasks.filter((t) => t.phase === "done").length;
  const open = tasks.filter((t) => !isTerminal(t.phase)).length;
  g.textAlign = "right";
  g.fillText(`${done} shipped · ${open} open`, MC_W - 28, 38);
  g.textAlign = "left";
  g.fillStyle = "rgba(124,196,214,0.25)";
  g.fillRect(28, 50, MC_W - 56, 1);

  const active = tasks.filter((t) => !isTerminal(t.phase)).slice(0, view.others ? 4 : 5);
  if (view.others) {
    g.fillStyle = "#f2b46a";
    g.font = `600 16px ${font}`;
    g.fillText(view.others, 28, MC_H - 72);
  }
  if (active.length === 0) {
    g.fillStyle = "#b7c1cf";
    g.font = `500 26px ${font}`;
    g.fillText(simulated ? "No task in flight." : "Waiting for the live session…", 28, 120);
    g.fillStyle = "#7c8797";
    g.font = `500 18px ${font}`;
    g.fillText(simulated ? "Press Run demo, or create a task, to watch the team pick it up." : "Tasks appear here as the backend reports them.", 28, 152);
  }
  active.forEach((t, i) => {
    const y = 88 + i * 48;
    const owner = t.assignedAgentId ? getAgent(t.assignedAgentId) : null;
    g.fillStyle = "#eef2f7";
    g.font = `600 20px ${font}`;
    g.fillText(`${t.id}  ${shortTitle(t.title, 44)}`, 28, y);
    g.fillStyle = t.status === "blocked" ? "#f2b46a" : owner ? owner.color : "#7c8797";
    g.font = `500 16px ${font}`;
    const phase = t.status === "blocked" ? "Blocked" : PHASE_LABEL[t.phase];
    g.textAlign = "right";
    g.fillText(`${phase}${owner ? ` · ${owner.name}` : ""}${t.iteration > 1 ? ` · rework ${t.iteration - 1}` : ""}`, MC_W - 28, y);
    g.textAlign = "left";
    g.fillStyle = "#1c2534";
    g.fillRect(28, y + 10, MC_W - 56, 6);
    g.fillStyle = t.status === "blocked" ? "#f2b46a" : owner ? owner.color : "#7cc4d6";
    g.fillRect(28, y + 10, (MC_W - 56) * Math.min(1, Math.max(0, t.progress)), 6);
  });

  // Agent status row
  g.fillStyle = "rgba(124,196,214,0.18)";
  g.fillRect(28, MC_H - 58, MC_W - 56, 1);
  const ids: AgentId[] = ["orion", "piper", "iris", "kai", "quinn", "rex"];
  // A status strip, drawn as screen UI (colour bar, caps name, status under it) rather than "● Name · status":
  // close up, the old one-line form read as stray DOM speech bubbles floating over the scene (phase 6).
  ids.forEach((id, i) => {
    const p = getAgent(id);
    const a = agents.find((x) => x.id === id);
    const x = 28 + i * 163;
    g.fillStyle = p.color;
    g.fillRect(x, MC_H - 48, 3, 34);
    g.fillStyle = "#7f8a9b";
    g.font = `600 12px ${font}`;
    g.fillText(p.name.toUpperCase(), x + 12, MC_H - 36);
    g.fillStyle = "#c9d2de";
    g.font = `500 15px ${font}`;
    g.fillText(a ? (a.paused ? "paused" : a.status) : "offline", x + 12, MC_H - 16);
  });
}

function MissionControl() {
  useRenderCount("MissionControl");
  const { texture, material } = useMemo(() => {
    const texture = canvasTexture(MC_W, MC_H, () => undefined);
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    return { texture, material };
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );
  const last = useRef({ at: -Infinity, sig: "" });
  const screenRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const screen = screenRef.current;
    const map = screen ? (screen.material as THREE.MeshBasicMaterial).map : null;
    const ctx = map ? (map.image as HTMLCanvasElement).getContext("2d") : null;
    if (!map || !ctx) return;
    const now = performance.now();
    if (now - last.current.at < MC_REDRAW_MS) return;
    last.current.at = now;
    const snap = liveWorld.snapshot;
    const simulated = useWorldStore.getState().backend.simulated;
    const tasks = snap?.tasks ?? [];
    const agents = snap?.agents ?? [];
    const sig = missionSignature(tasks, agents, simulated, snap?.live);
    if (sig === last.current.sig) return;
    last.current.sig = sig;
    drawMissionControl(ctx, tasks, agents, simulated, snap?.live);
    map.needsUpdate = true;
  });

  const { x, z } = MISSION_CONTROL;
  const W = 9;
  const H = W * (MC_H / MC_W);
  const frame = useMemo<InstanceSpec[]>(
    () => [
      { p: [x, 2.35, z - 0.09], s: [W + 0.3, H + 0.3, 0.12] },
      { p: [x - W / 2 + 0.6, 4.05, z - 0.12], s: [0.06, 0.95, 0.06] },
      { p: [x + W / 2 - 0.6, 4.05, z - 0.12], s: [0.06, 0.95, 0.06] },
      // low console under the screen
      { p: [x, 0.4, z + 0.15], s: [6.4, 0.8, 0.55] },
    ],
    [x, z, H],
  );
  const consoleGlow = sharedMaterial("mcGlow", () => new THREE.MeshBasicMaterial({ color: "#7cc4d6", transparent: true, opacity: 0.55, toneMapped: false }));
  return (
    <group name="mission-control">
      <Instanced geometry={geometries.box()} material={materials.wallTrim()} items={frame} castShadow />
      <mesh ref={screenRef} geometry={geometries.plane()} material={material} position={[x, 2.35, z - 0.02]} scale={[W, H, 1]} />
      <mesh geometry={geometries.box()} material={consoleGlow} position={[x, 0.81, z + 0.43]} scale={[6.3, 0.012, 0.012]} />
    </group>
  );
}

// ───────────────────────── planning board ─────────────────────────

/** The Kanban board on the west wall, facing +x. */
const BOARD = { x: PROPS.kanban.x + 0.06, z: PROPS.kanban.z, y: PROPS.kanban.y, w: PROPS.kanban.w, h: PROPS.kanban.h };
export const MAX_STICKIES = 24;
const STICKY_TODO = "#ffd98a";
const STICKY_DOING = "#ff9fb8";
const STICKY_DONE = "#9fe3b8";
const COLUMNS = ["TO DO", "DOING", "DONE"] as const;

/** Latest in-flight task with subtasks, else the latest that had any. */
function boardTask(tasks: readonly Task[]): Task | null {
  for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i]!.subtasks.length && !isTerminal(tasks[i]!.phase)) return tasks[i]!;
  for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i]!.subtasks.length) return tasks[i]!;
  return null;
}

function drawBoard(g: CanvasRenderingContext2D, w: number, h: number, task: Task | null): void {
  const font = uiFont();
  g.fillStyle = "#e9ecf1";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#3a4558";
  g.font = `700 22px ${font}`;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("KANBAN BOARD", 22, 36);
  g.font = `500 16px ${font}`;
  g.fillStyle = "#5b6678";
  g.textAlign = "right";
  g.fillText(task ? `${task.id} · ${shortTitle(task.title, 30)}` : "Waiting for a plan", w - 22, 36);
  g.textAlign = "left";
  g.fillStyle = "#c7ced9";
  g.fillRect(22, 50, w - 44, 2);
  const tints = ["#f4c95d", "#f27fa0", "#5fc98f"];
  COLUMNS.forEach((name, c) => {
    const x0 = 22 + ((w - 44) / 3) * c;
    if (c > 0) g.fillRect(x0 - 1, 62, 2, h - 80);
    g.fillStyle = tints[c]!;
    g.fillRect(x0 + 4, 64, 6, 16);
    g.fillStyle = "#7c8797";
    g.font = `600 15px ${font}`;
    g.fillText(name, x0 + 16, 78);
    g.fillStyle = "#c7ced9";
  });
}

/** Sticky slot: column `col`, the `k`-th card in it (board-local metres from the centre; u to the right from the front). */
function stickySlot(col: number, k: number): { u: number; v: number } {
  const colW = (BOARD.w - 0.2) / 3;
  const u0 = -BOARD.w / 2 + 0.1 + col * colW;
  return { u: u0 + 0.28 + (k % 2) * 0.5, v: BOARD.h / 2 - 0.45 - Math.floor(k / 2) * 0.3 };
}

function PlanningBoard() {
  const cards = useRef<THREE.InstancedMesh>(null);
  const { texture, material } = useMemo(() => {
    const texture = canvasTexture(768, 360, (g, w, h) => drawBoard(g, w, h, null));
    texture.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4, metalness: 0 });
    return { texture, material };
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );
  const cardMat = sharedMaterial("sticky", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, metalness: 0 }));
  const last = useRef({ at: -Infinity, sig: "" });

  useLayoutEffect(() => {
    const mesh = cards.current;
    if (!mesh) return;
    const c = new THREE.Color(STICKY_TODO);
    for (let i = 0; i < MAX_STICKIES; i++) mesh.setColorAt(i, c);
    mesh.count = 0;
  }, []);

  const boardRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = cards.current;
    const board = boardRef.current;
    const map = board ? (board.material as THREE.MeshStandardMaterial).map : null;
    const ctx = map ? (map.image as HTMLCanvasElement).getContext("2d") : null;
    if (!mesh || !map || !ctx) return;
    const now = performance.now();
    if (now - last.current.at < MC_REDRAW_MS) return;
    last.current.at = now;
    const task = boardTask(liveWorld.snapshot?.tasks ?? []);
    const sig = task ? `${task.id}|${task.title}|${task.subtasks.map((s) => (s.done ? 1 : 0)).join("")}` : "none";
    if (sig === last.current.sig) return;
    last.current.sig = sig;
    drawBoard(ctx, 768, 360, task);
    map.needsUpdate = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI / 2);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(0.36, 0.26, 0.012);
    const col = new THREE.Color();
    const subtasks = task?.subtasks.slice(0, MAX_STICKIES) ?? [];
    // The first open card is the one in progress; the rest wait in TO DO.
    const doing = subtasks.findIndex((st) => !st.done);
    const counts = [0, 0, 0];
    subtasks.forEach((st, i) => {
      const column = st.done ? 2 : i === doing ? 1 : 0;
      const slot = stickySlot(column, Math.min(counts[column]++, 7));
      // Board faces +x; its local +u runs towards −z in the world.
      const tilt = ((i * 37) % 7) / 7 - 0.5;
      q.setFromEuler(new THREE.Euler(0, Math.PI / 2, tilt * 0.08));
      p.set(BOARD.x + 0.06, BOARD.y + slot.v, BOARD.z - slot.u);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
      mesh.setColorAt(i, col.set(column === 2 ? STICKY_DONE : column === 1 ? STICKY_DOING : STICKY_TODO));
    });
    mesh.count = subtasks.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const frame = useMemo<InstanceSpec[]>(
    () => [
      // Hung on the wall: a frame, a marker tray and two wall brackets.
      { p: [BOARD.x - 0.02, BOARD.y, BOARD.z], s: [0.06, BOARD.h + 0.12, BOARD.w + 0.12] },
      { p: [BOARD.x + 0.1, BOARD.y - BOARD.h / 2 - 0.04, BOARD.z], s: [0.16, 0.03, BOARD.w * 0.9] },
      { p: [BOARD.x - 0.08, BOARD.y + BOARD.h / 2 - 0.1, BOARD.z - BOARD.w / 2 + 0.3], s: [0.1, 0.06, 0.06] },
      { p: [BOARD.x - 0.08, BOARD.y + BOARD.h / 2 - 0.1, BOARD.z + BOARD.w / 2 - 0.3], s: [0.1, 0.06, 0.06] },
    ],
    [],
  );
  return (
    <group name="planning-board">
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={frame} castShadow />
      <mesh ref={boardRef} geometry={geometries.plane()} material={material} position={[BOARD.x + 0.015, BOARD.y, BOARD.z]} rotation={[0, Math.PI / 2, 0]} scale={[BOARD.w, BOARD.h, 1]} receiveShadow />
      <instancedMesh ref={cards} args={[geometries.box(), cardMat, MAX_STICKIES]} castShadow={false} receiveShadow frustumCulled={false} />
    </group>
  );
}

// ───────────────────────── sofa lounge ─────────────────────────

function ringCenter(id: "lounge"): { x: number; z: number } {
  const slots = LOCATIONS[id].slots;
  return slots.reduce((a, s) => ({ x: a.x + s.x / slots.length, z: a.z + s.z / slots.length }), { x: 0, z: 0 });
}

/** Seat i of a ring, pushed out to `radius`, using the same angles as the stand slots (§5). */
function ringSeat(id: "lounge", i: number, radius: number): { x: number; z: number; angle: number } {
  const c = ringCenter(id);
  const angle = (i / LOCATIONS[id].slots.length) * Math.PI * 2;
  return { x: c.x + Math.sin(angle) * radius, z: c.z + Math.cos(angle) * radius, angle };
}

/** Sofa colours round the ring: a cheerful, warm-and-fresh mix. */
const SOFA_COLORS = ["#d9735b", "#3d9e8f", "#e8b75a", "#6f9fd8", "#c96f9a", "#76b37e"];
const CUSHION_COLORS = ["#f2e3c6", "#ffd27a", "#f6a6a1", "#bfe3d0", "#ffe9a8", "#cfd8f5"];

function Lounge() {
  const c = ringCenter("lounge");
  const parts = useMemo(() => {
    const seats: InstanceSpec[] = [];
    const backs: InstanceSpec[] = [];
    const cushions: InstanceSpec[] = [];
    const flowers: InstanceSpec[] = [];
    for (let i = 0; i < 6; i++) {
      const s = ringSeat("lounge", i, 2.85);
      seats.push({ p: [s.x, 0.2, s.z], r: [0, s.angle, 0], s: [1.25, 0.36, 0.62], c: SOFA_COLORS[i]! });
      const [bx, bz] = place(s.x, s.z, s.angle, 0, 0.3);
      backs.push({ p: [bx, 0.42, bz], r: [0, s.angle, 0], s: [1.25, 0.5, 0.18], c: SOFA_COLORS[i]! });
      // Two throw cushions leaning on the back at the ends.
      for (const u of [-0.42, 0.42]) {
        const [cx, cz] = place(s.x, s.z, s.angle, u, 0.17);
        cushions.push({ p: [cx, 0.5, cz], r: [-0.35, s.angle, u * 0.4], s: [0.3, 0.28, 0.1], c: CUSHION_COLORS[(i + (u > 0 ? 1 : 0)) % 6]! });
      }
    }
    // A bunch of flowers in the middle of the coffee table.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      flowers.push({ p: [c.x + Math.sin(a) * 0.09, 0.66 + (k % 2) * 0.05, c.z + Math.cos(a) * 0.09], s: 0.09, c: ["#ff8fa3", "#ffd166", "#ffffff", "#f78c6b"][k % 4]! });
    }
    flowers.push({ p: [c.x, 0.7, c.z], s: 0.08, c: "#ffe066" });
    return { seats, backs, cushions, flowers };
  }, [c]);
  const rug = sharedMaterial("loungeRug", () => new THREE.MeshStandardMaterial({ color: "#2c5560", roughness: 0.95, metalness: 0 }));
  return (
    <group name="lounge">
      <mesh geometry={geometries.disc()} material={rug} position={[c.x, 0.006, c.z]} scale={3.5} receiveShadow />
      <mesh geometry={geometries.cylinder()} material={materials.wood()} position={[c.x, 0.4, c.z]} scale={[1.7, 0.05, 1.7]} castShadow receiveShadow />
      <mesh geometry={geometries.cylinder()} material={materials.darkMetal()} position={[c.x, 0.2, c.z]} scale={[1.2, 0.36, 1.2]} castShadow />
      <mesh geometry={geometries.cylinder()} material={materials.ceramic()} position={[c.x, 0.52, c.z]} scale={[0.16, 0.2, 0.16]} />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.seats} castShadow />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.backs} castShadow />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.cushions} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.flowers} />
    </group>
  );
}

export function Workstations() {
  useRenderCount("Workstations");
  return (
    <group name="workstations">
      <Desks />
      <OperationsHub />
      <MissionControl />
      <PlanningBoard />
      <Lounge />
    </group>
  );
}
