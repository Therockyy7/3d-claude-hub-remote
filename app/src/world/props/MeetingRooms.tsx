"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { DOOR_WIDTH, GLASS_WALLS, MEETING_POD, WAR_ROOM } from "@/simulation/worldLayout";
import type { GlassWall } from "@/simulation/worldLayout";
import { useWorldStore } from "@/state/useWorldStore";
import { Instanced } from "@/world/Instanced";
import type { InstanceSpec } from "@/world/Instanced";
import { canvasTexture, hash, uiFont } from "@/world/proceduralTextures";
import { geometries, materials, sharedGeometry, sharedMaterial } from "@/world/sharedResources";
import { useRenderCount } from "@/world/renderCounts";
import { CANDY, anyInUse, glowMaterial } from "@/world/props/propKit";

/**
 * Meeting Pods & War Room (worldLayout `WAR_ROOM`, `MEETING_POD`, `GLASS_WALLS`): soundproof glass rooms with a
 * frosted band at eye level, metal frames and 1.8 m doors, sticky notes on the glass. The War Room has a hologram
 * table and a big dashboard screen; the round Meeting Pod a booth bench round a table with a small hologram. The
 * holograms spin faster and glow brighter while robots are in the room.
 */

const WALL_H = 2.6;
const BAND = { y: 1.2, h: 0.36 };

const podGlass = () =>
  sharedMaterial("podGlass", () => {
    const m = (materials.glass() as THREE.MeshStandardMaterial).clone();
    m.side = THREE.DoubleSide;
    return m;
  });
const frosted = () => sharedMaterial("frostedGlass", () => new THREE.MeshStandardMaterial({ color: "#eaf6ff", roughness: 0.9, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
const holoMat = (key: string, opacity: number) =>
  sharedMaterial(key, () => new THREE.MeshBasicMaterial({ color: "#5ff0ff", transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, wireframe: key.endsWith("wire") }));

/** Pieces of a glass wall about `step` metres long: centre, length, and `rot` (like rotation.y) turning +x along it. */
function alongWall(w: GlassWall, step: number): { x: number; z: number; rot: number; len: number }[] {
  if (w.kind === "line") {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const n = Math.max(1, Math.round(len / step));
    const rot = Math.atan2(-(w.z1 - w.z0), w.x1 - w.x0);
    return Array.from({ length: n }, (_, k) => ({ x: w.x0 + ((w.x1 - w.x0) * (k + 0.5)) / n, z: w.z0 + ((w.z1 - w.z0) * (k + 0.5)) / n, rot, len: len / n }));
  }
  const arc = w.to - w.from;
  const n = Math.max(1, Math.round((arc * w.r) / step));
  return Array.from({ length: n }, (_, k) => {
    const a = w.from + (arc * (k + 0.5)) / n;
    // At ring angle a the tangent is (cos a, −sin a): rotation.y = a turns +x onto it.
    return { x: w.x + Math.sin(a) * w.r, z: w.z + Math.cos(a) * w.r, rot: a, len: 2 * w.r * Math.sin(arc / n / 2) };
  });
}

// ───────────────────────── glass walls ─────────────────────────

/** All the glass: panes (straight walls as planes, the pod as an open cylinder), frosted band, rails, posts, door headers. */
function GlassRooms() {
  useRenderCount("GlassRooms");
  const { panes, bands, rails, posts, headers } = useMemo(() => {
    const panes: InstanceSpec[] = [];
    const bands: InstanceSpec[] = [];
    const rails: InstanceSpec[] = [];
    const posts: InstanceSpec[] = [];
    for (const w of GLASS_WALLS) {
      if (w.kind === "line") {
        const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
        const rot = Math.atan2(-(w.z1 - w.z0), w.x1 - w.x0);
        const cx = (w.x0 + w.x1) / 2;
        const cz = (w.z0 + w.z1) / 2;
        panes.push({ p: [cx, WALL_H / 2, cz], r: [0, rot, 0], s: [len, WALL_H, 1] });
        bands.push({ p: [cx, BAND.y, cz], r: [0, rot, 0], s: [len, BAND.h, 1] });
        posts.push({ p: [w.x0, WALL_H / 2, w.z0], s: [0.06, WALL_H, 0.06] }, { p: [w.x1, WALL_H / 2, w.z1], s: [0.06, WALL_H, 0.06] });
      }
      for (const seg of alongWall(w, 0.4)) {
        rails.push({ p: [seg.x, WALL_H, seg.z], r: [0, seg.rot, 0], s: [seg.len + 0.01, 0.06, 0.07] });
        rails.push({ p: [seg.x, 0.035, seg.z], r: [0, seg.rot, 0], s: [seg.len + 0.01, 0.07, 0.08] });
      }
      for (const seg of alongWall(w, 1.5)) posts.push({ p: [seg.x, WALL_H / 2, seg.z], s: [0.04, WALL_H, 0.04] });
    }
    // Door headers over each opening.
    const headers: InstanceSpec[] = [
      { p: [WAR_ROOM.door.x, 2.2, WAR_ROOM.door.z], s: [DOOR_WIDTH + 0.08, 0.1, 0.1] },
      { p: [MEETING_POD.x, 2.2, MEETING_POD.z - MEETING_POD.r * Math.cos(Math.asin(DOOR_WIDTH / 2 / MEETING_POD.r))], s: [DOOR_WIDTH + 0.08, 0.1, 0.1] },
    ];
    return { panes, bands, rails, posts, headers };
  }, []);
  const arc = GLASS_WALLS.find((w): w is Extract<GlassWall, { kind: "arc" }> => w.kind === "arc")!;
  const podPane = sharedGeometry("podPane", () => new THREE.CylinderGeometry(arc.r, arc.r, WALL_H, 72, 1, true, arc.from, arc.to - arc.from));
  const podBand = sharedGeometry("podBand", () => new THREE.CylinderGeometry(arc.r + 0.005, arc.r + 0.005, BAND.h, 72, 1, true, arc.from, arc.to - arc.from));
  return (
    <group name="glass-rooms">
      <Instanced geometry={geometries.plane()} material={materials.glass()} items={panes} receiveShadow={false} />
      <mesh geometry={podPane} material={podGlass()} position={[arc.x, WALL_H / 2, arc.z]} />
      {/* The frosted band lies on the glass. Both are see-through, so the one drawn second tints the other; drawing the
          band last, always, stops that order from flipping (and the band flickering) as the camera turns. */}
      <group renderOrder={1}>
        <Instanced geometry={geometries.plane()} material={frosted()} items={bands} receiveShadow={false} />
        <mesh geometry={podBand} material={frosted()} position={[arc.x, BAND.y, arc.z]} />
      </group>
      <Instanced geometry={geometries.box()} material={materials.metal()} items={rails} castShadow />
      <Instanced geometry={geometries.box()} material={materials.metal()} items={posts} castShadow />
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={headers} castShadow />
    </group>
  );
}

/** Sticky notes on the outside of the glass, in clusters, at eye level. */
function StickyNotes() {
  const notes = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const cluster = (x: number, z: number, rot: number, n: number, seed: number, along: [number, number]) => {
      for (let k = 0; k < n; k++) {
        const u = (hash(k, 1, seed) - 0.5) * 1.1;
        const v = 1.05 + hash(k, 2, seed) * 0.65;
        out.push({
          p: [x + along[0] * u, v, z + along[1] * u],
          r: [0, rot, (hash(k, 3, seed) - 0.5) * 0.3],
          s: [0.085, 0.085, 1],
          c: CANDY[Math.floor(hash(k, 4, seed) * CANDY.length)]!,
        });
      }
    };
    // War Room: east glass (facing +x) and either side of the door on the south glass (facing −z).
    cluster(WAR_ROOM.x1 + 0.012, 6.6, Math.PI / 2, 14, 1, [0, 1]);
    cluster(WAR_ROOM.x1 + 0.012, 9.2, Math.PI / 2, 10, 2, [0, 1]);
    cluster(-14.0, WAR_ROOM.z0 - 0.012, Math.PI, 9, 3, [1, 0]);
    cluster(-10.2, WAR_ROOM.z0 - 0.012, Math.PI, 11, 4, [1, 0]);
    // Meeting Pod: on the curve either side of the door, facing out.
    for (const [deg, seed] of [
      [148, 5],
      [212, 6],
      [110, 7],
    ] as const) {
      const a = (deg * Math.PI) / 180;
      const x = MEETING_POD.x + Math.sin(a) * (MEETING_POD.r + 0.012);
      const z = MEETING_POD.z + Math.cos(a) * (MEETING_POD.r + 0.012);
      cluster(x, z, a, 10, seed, [Math.cos(a) * 0.8, -Math.sin(a) * 0.8]);
    }
    return out;
  }, []);
  const paper = sharedMaterial("stickyPaper", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  return <Instanced name="sticky-notes" geometry={geometries.plane()} material={paper} items={notes} receiveShadow={false} />;
}

// ───────────────────────── holograms ─────────────────────────

const BARS = 10;

/**
 * A hologram over a projector at (x, z): a wireframe globe in orbit rings above a cone of light, ringed by data bars
 * that rise and fall. `scale` shrinks it for the Meeting Pod's table.
 */
function Hologram({ x, z, y, scale, room }: { x: number; z: number; y: number; scale: number; room: "warroom" | "collab" }) {
  const globe = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const cone = useRef<THREE.Mesh>(null);
  const energy = useRef(0.4);
  const spin = useRef(0);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const s = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    const g = globe.current;
    const r = rings.current;
    const b = bars.current;
    const c = cone.current;
    if (!g || !r || !b || !c) return;
    const dt = Math.min(rawDt, 0.1);
    const reduced = useWorldStore.getState().reducedMotion;
    energy.current = THREE.MathUtils.damp(energy.current, anyInUse(room) ? 1 : 0.4, 3, dt);
    const e = energy.current;
    spin.current += dt * (0.25 + e * 0.9) * (reduced ? 0.25 : 1);
    const t = state.clock.elapsedTime;
    g.rotation.y = spin.current;
    g.rotation.x = 0.25 + Math.sin(t * 0.3) * 0.05;
    r.rotation.y = -spin.current * 0.6;
    r.children.forEach((ring, k) => (ring.rotation.z = Math.sin(t * 0.5 + k) * 0.4 + k * 0.9));
    (g.material as THREE.MeshBasicMaterial).opacity = 0.35 + e * 0.45;
    (c.material as THREE.MeshBasicMaterial).opacity = 0.05 + e * 0.1;
    for (let k = 0; k < BARS; k++) {
      const a = (k / BARS) * Math.PI * 2 + spin.current * 0.3;
      const h = (0.12 + (0.5 + 0.5 * Math.sin(t * (1.1 + k * 0.17) + k)) * 0.35 * e) * scale;
      p.set(x + Math.sin(a) * 0.62 * scale, y - 0.25 * scale + h / 2, z + Math.cos(a) * 0.62 * scale);
      b.setMatrixAt(k, m4.compose(p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a), s.set(0.05 * scale, h, 0.05 * scale)));
    }
    b.instanceMatrix.needsUpdate = true;
  });

  const ringGeo = sharedGeometry("holoRing", () => new THREE.TorusGeometry(1, 0.012, 6, 64));
  const globeGeo = sharedGeometry("holoGlobe", () => new THREE.IcosahedronGeometry(1, 2));
  const coneGeo = sharedGeometry("holoCone", () => new THREE.ConeGeometry(1, 1, 32, 1, true).rotateX(Math.PI));
  return (
    <group name={`hologram-${room}`}>
      <mesh ref={cone} geometry={coneGeo} material={holoMat(`holoCone-${room}`, 0.1)} position={[x, y - 0.36 * scale, z]} scale={[0.5 * scale, 0.75 * scale, 0.5 * scale]} />
      <mesh ref={globe} geometry={globeGeo} material={holoMat(`holoGlobe-${room}-wire`, 0.6)} position={[x, y, z]} scale={0.32 * scale} />
      <group ref={rings} position={[x, y, z]}>
        {[0.46, 0.54].map((r) => (
          <mesh key={r} geometry={ringGeo} material={holoMat(`holoRings-${room}`, 0.55)} scale={r * scale} rotation={[Math.PI / 2, 0, 0]} />
        ))}
      </group>
      <instancedMesh ref={bars} args={[geometries.box(), holoMat(`holoBars-${room}`, 0.5), BARS]} frustumCulled={false} />
    </group>
  );
}

// ───────────────────────── War Room ─────────────────────────

function dashboardTexture(): THREE.CanvasTexture {
  return canvasTexture(768, 410, (g, w, h) => {
    const font = uiFont();
    g.fillStyle = "#061019";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#5ff0ff";
    g.font = `700 26px ${font}`;
    g.fillText("WAR ROOM · SPRINT OVERVIEW", 24, 40);
    // KPI tiles.
    ["VELOCITY 42", "BUGS 3", "UPTIME 99.9%", "NPS +61"].forEach((kpi, k) => {
      const x = 24 + k * 182;
      g.fillStyle = "#0e2533";
      g.fillRect(x, 60, 168, 64);
      g.fillStyle = ["#ffd166", "#ff6b6b", "#06d6a0", "#c77dff"][k]!;
      g.font = `700 22px ${font}`;
      g.fillText(kpi, x + 12, 102);
    });
    // Burndown line chart.
    g.strokeStyle = "#1e3a4c";
    for (let k = 0; k < 6; k++) g.strokeRect(24, 150 + k * 40, 430, 0.5);
    g.strokeStyle = "#5ff0ff";
    g.lineWidth = 4;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const x = 24 + k * 43;
      const y = 160 + k * 18 + Math.sin(k * 1.7) * 14;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // Bars.
    for (let k = 0; k < 8; k++) {
      const bh = 40 + ((k * 37) % 120);
      g.fillStyle = CANDY[k % CANDY.length]!;
      g.fillRect(490 + k * 32, 380 - bh, 22, bh);
    }
    g.fillStyle = "#7c8797";
    g.font = `500 16px ${font}`;
    g.fillText("burndown", 24, 395);
    g.fillText("throughput by team", 490, 395);
  });
}

function WarRoom() {
  useRenderCount("WarRoom");
  const t = WAR_ROOM.table;
  const sc = WAR_ROOM.screen;
  const { texture, material } = useMemo(() => {
    const texture = dashboardTexture();
    return { texture, material: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) };
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );
  const scan = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const m = scan.current;
    if (!m) return;
    // A scan line sweeps the dashboard while the room is in use.
    m.visible = anyInUse("warroom");
    m.position.z = sc.z - sc.w / 2 + ((state.clock.elapsedTime * 0.35) % 1) * sc.w;
  });
  const carpet = sharedMaterial("warroomCarpet", () => new THREE.MeshStandardMaterial({ color: "#1b3346", roughness: 0.95, metalness: 0 }));
  const edge = sharedGeometry("holoEdge", () => new THREE.TorusGeometry(1, 0.02, 8, 64).rotateX(Math.PI / 2));
  return (
    <group name="war-room">
      <mesh geometry={geometries.floorPlane()} material={carpet} position={[(WAR_ROOM.x0 + WAR_ROOM.x1) / 2, 0.005, (WAR_ROOM.z0 + WAR_ROOM.z1) / 2]} scale={[WAR_ROOM.x1 - WAR_ROOM.x0 - 0.1, 1, WAR_ROOM.z1 - WAR_ROOM.z0 - 0.1]} receiveShadow />
      <mesh geometry={geometries.cylinder()} material={materials.darkMetal()} position={[t.x, 0.4, t.z]} scale={[0.6, 0.8, 0.6]} castShadow />
      <mesh geometry={geometries.cylinder()} material={materials.screenOff()} position={[t.x, 0.82, t.z]} scale={[t.r * 2, 0.06, t.r * 2]} castShadow receiveShadow />
      <mesh geometry={edge} material={glowMaterial("holoTableEdge", "#5ff0ff")} position={[t.x, 0.85, t.z]} scale={t.r} />
      <mesh geometry={geometries.cylinder()} material={glowMaterial("holoProjector", "#bff8ff")} position={[t.x, 0.86, t.z]} scale={[0.24, 0.02, 0.24]} />
      <Hologram x={t.x} z={t.z} y={1.55} scale={1} room="warroom" />
      {/* The big dashboard on the west wall, facing +x. */}
      <mesh geometry={geometries.box()} material={materials.wallTrim()} position={[sc.x - 0.03, sc.y, sc.z]} scale={[0.06, sc.h + 0.12, sc.w + 0.12]} />
      <mesh geometry={geometries.plane()} material={material} position={[sc.x + 0.005, sc.y, sc.z]} rotation={[0, Math.PI / 2, 0]} scale={[sc.w, sc.h, 1]} />
      <mesh ref={scan} geometry={geometries.plane()} material={holoMat("dashScan", 0.35)} position={[sc.x + 0.01, sc.y, sc.z]} rotation={[0, Math.PI / 2, 0]} scale={[0.04, sc.h, 1]} visible={false} />
    </group>
  );
}

// ───────────────────────── Meeting Pod ─────────────────────────

function MeetingPod() {
  useRenderCount("MeetingPod");
  const { x, z, bench } = MEETING_POD;
  const parts = useMemo(() => {
    const seats: InstanceSpec[] = [];
    const backs: InstanceSpec[] = [];
    const n = 20;
    const step = (bench.span * 2) / n;
    for (let k = 0; k < n; k++) {
      const a = -bench.span + (k + 0.5) * step;
      const seatR = (bench.inner + bench.outer) / 2;
      const backR = (bench.outer + bench.back) / 2;
      const tone = k % 2 ? "#3fb8a9" : "#46c2b2";
      seats.push({ p: [x + Math.sin(a) * seatR, bench.seat / 2, z + Math.cos(a) * seatR], r: [0, a, 0], s: [2 * bench.outer * Math.sin(step / 2) + 0.01, bench.seat, bench.outer - bench.inner], c: tone });
      backs.push({ p: [x + Math.sin(a) * backR, bench.seat + 0.26, z + Math.cos(a) * backR], r: [0, a, 0], s: [2 * bench.back * Math.sin(step / 2) + 0.01, 0.52, bench.back - bench.outer], c: "#2f8f86" });
    }
    return { seats, backs };
  }, [x, z, bench]);
  const carpet = sharedMaterial("podCarpet", () => new THREE.MeshStandardMaterial({ color: "#24464f", roughness: 0.95, metalness: 0 }));
  return (
    <group name="meeting-pod">
      <mesh geometry={geometries.disc()} material={carpet} position={[x, 0.005, z]} scale={MEETING_POD.r - 0.05} receiveShadow />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.seats} castShadow />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.backs} castShadow />
      <mesh geometry={geometries.cylinder()} material={materials.whiteboard()} position={[x, 0.74, z]} scale={[MEETING_POD.table * 2, 0.05, MEETING_POD.table * 2]} castShadow receiveShadow />
      <mesh geometry={geometries.cylinderLow()} material={materials.metal()} position={[x, 0.37, z]} scale={[0.1, 0.72, 0.1]} />
      <mesh geometry={geometries.cylinder()} material={materials.metal()} position={[x, 0.02, z]} scale={[0.6, 0.04, 0.6]} receiveShadow />
      <mesh geometry={geometries.cylinder()} material={glowMaterial("holoProjector", "#bff8ff")} position={[x, 0.775, z]} scale={[0.14, 0.02, 0.14]} />
      <Hologram x={x} z={z} y={1.12} scale={0.55} room="collab" />
    </group>
  );
}

export function MeetingRooms() {
  useRenderCount("MeetingRooms");
  return (
    <group name="meeting-rooms">
      <GlassRooms />
      <StickyNotes />
      <WarRoom />
      <MeetingPod />
    </group>
  );
}
