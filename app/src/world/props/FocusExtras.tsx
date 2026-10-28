"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PROPS } from "@/simulation/worldLayout";
import { useWorldStore } from "@/state/useWorldStore";
import { Instanced } from "@/world/Instanced";
import type { InstanceSpec } from "@/world/Instanced";
import { canvasTexture, hash, uiFont } from "@/world/proceduralTextures";
import { geometries, materials, sharedMaterial } from "@/world/sharedResources";
import { useRenderCount } from "@/world/renderCounts";
import { CANDY, anyInUse, glowMaterial } from "@/world/props/propKit";

/**
 * Focus-zone extras (worldLayout `PROPS`): the library wall with a reading chair, two server racks with blinking
 * LEDs, a whiteboard covered in a logic diagram, an aquarium whose fish come to the glass when a robot watches, and a
 * zen garden: a planter with an indoor tree in front of a living green wall, and a bench to sit and look at it.
 */

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

// ───────────────────────── library ─────────────────────────

const BOOK_COLORS = ["#c8553d", "#2f6db5", "#e0b84c", "#3c8e62", "#8c5fa8", "#d9d2c3", "#e07a5f", "#24324a"];
const SHELF_YS = [0.06, 0.46, 0.86, 1.26];

function Library() {
  useRenderCount("Library");
  const b = PROPS.bookshelf;
  const a = PROPS.armchair;
  const { frame, books } = useMemo(() => {
    const frame: InstanceSpec[] = [
      { p: [b.x, b.h / 2, b.z - b.sz / 2 + 0.02], s: [b.sx, b.h, 0.04] },
      { p: [b.x - b.sx / 2 + 0.02, b.h / 2, b.z], s: [0.04, b.h, b.sz] },
      { p: [b.x + b.sx / 2 - 0.02, b.h / 2, b.z], s: [0.04, b.h, b.sz] },
      { p: [b.x, b.h, b.z], s: [b.sx + 0.04, 0.04, b.sz + 0.02] },
      ...SHELF_YS.map((y): InstanceSpec => ({ p: [b.x, y - 0.02, b.z], s: [b.sx - 0.04, 0.04, b.sz] })),
    ];
    const books: InstanceSpec[] = [];
    SHELF_YS.forEach((y, row) => {
      let x = b.x - b.sx / 2 + 0.08;
      for (let k = 0; x < b.x + b.sx / 2 - 0.1; k++) {
        const r = (n: number) => hash(row, k, n);
        const w = 0.035 + r(1) * 0.035;
        // Now and then a gap, or a book leaning on its neighbour.
        if (r(2) > 0.93) {
          x += 0.12;
          continue;
        }
        const h = 0.22 + r(3) * 0.12;
        const lean = r(4) > 0.95 ? 0.25 : 0;
        books.push({ p: [x + w / 2, y + h / 2, b.z + 0.03], r: [0, 0, lean], s: [w, h, 0.26 + r(5) * 0.06], c: BOOK_COLORS[Math.floor(r(6) * BOOK_COLORS.length)]! });
        x += w + 0.004;
      }
    });
    return { frame, books };
  }, [b]);
  const rug = sharedMaterial("libraryRug", () => new THREE.MeshStandardMaterial({ color: "#6b3e3e", roughness: 0.95, metalness: 0 }));
  // The reading chair turns towards the room, diagonally.
  const turn = Math.PI * 0.3;
  return (
    <group name="library">
      <Instanced geometry={geometries.box()} material={materials.wood()} items={frame} castShadow />
      <Instanced geometry={geometries.box()} material={materials.instanceWhite()} items={books} />
      <mesh geometry={geometries.disc()} material={rug} position={[a.x + 0.2, 0.006, a.z + 0.15]} scale={1.25} receiveShadow />
      <group position={[a.x, 0, a.z]} rotation={[0, turn, 0]}>
        <mesh geometry={geometries.roundedBox()} material={materials.fabricWarm()} position={[0, 0.3, 0.02]} scale={[0.82, 0.26, 0.78]} castShadow />
        <mesh geometry={geometries.roundedBox()} material={materials.fabricWarm()} position={[0, 0.68, -0.33]} scale={[0.82, 0.62, 0.16]} castShadow />
        <mesh geometry={geometries.roundedBox()} material={materials.fabricWarm()} position={[-0.42, 0.45, 0.02]} scale={[0.14, 0.36, 0.78]} castShadow />
        <mesh geometry={geometries.roundedBox()} material={materials.fabricWarm()} position={[0.42, 0.45, 0.02]} scale={[0.14, 0.36, 0.78]} castShadow />
      </group>
    </group>
  );
}

// ───────────────────────── server racks ─────────────────────────

const LED_COLORS = ["#4dff9a", "#4dff9a", "#59c8ff", "#ffb84d"];
const LED_ROWS = 12;

function ServerRacks() {
  useRenderCount("ServerRacks");
  const r = PROPS.racks;
  const front = r.z + r.sz / 2;
  const { bodies, doors, leds, base } = useMemo(() => {
    const bodies: InstanceSpec[] = [];
    const doors: InstanceSpec[] = [];
    const leds: InstanceSpec[] = [];
    const base: THREE.Color[] = [];
    for (const dx of [-0.55, 0.55]) {
      const x = r.x + dx;
      bodies.push({ p: [x, r.h / 2, r.z], s: [1.0, r.h, r.sz] });
      doors.push({ p: [x, r.h / 2 + 0.04, front + 0.006], s: [0.9, r.h - 0.2, 0.012] });
      for (let u = 0; u < LED_ROWS; u++) {
        for (let k = 0; k < 4; k++) {
          const col = LED_COLORS[(u + k) % LED_COLORS.length]!;
          leds.push({ p: [x - 0.36 + k * 0.05, 0.3 + u * 0.14, front + 0.015], s: [0.026, 0.018, 0.01], c: col });
          base.push(new THREE.Color(col));
        }
      }
    }
    return { bodies, doors, leds, base };
  }, [r, front]);
  const ledRef = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Color(), []);
  const last = useRef(-1);

  useFrame((state) => {
    const mesh = ledRef.current;
    if (!mesh) return;
    // Disk and network activity: each LED flickers on its own beat, busier while a robot checks the racks.
    const busy = anyInUse("servers");
    const step = Math.floor(state.clock.elapsedTime * (busy ? 14 : 6));
    if (step === last.current) return;
    last.current = step;
    for (let i = 0; i < base.length; i++) {
      const on = hash(i, step, 9) > (busy ? 0.35 : 0.55) || i % 4 === 0;
      mesh.setColorAt(i, tmp.copy(base[i]!).multiplyScalar(on ? 1.4 : 0.15));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="server-racks">
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={bodies} castShadow />
      <Instanced geometry={geometries.box()} material={materials.screenOff()} items={doors} receiveShadow={false} />
      <Instanced name="rack-leds" meshRef={ledRef} geometry={geometries.box()} material={glowMaterial("rackLed", "#ffffff")} items={leds} receiveShadow={false} />
    </group>
  );
}

// ───────────────────────── whiteboard ─────────────────────────

/** A logic flowchart in marker: start → read → decide → ship / fix-and-loop, plus scribbled notes. */
function drawLogic(g: CanvasRenderingContext2D, w: number, h: number): void {
  const font = uiFont();
  g.fillStyle = "#fbfcfd";
  g.fillRect(0, 0, w, h);
  g.lineWidth = 4;
  g.lineCap = "round";
  const box = (x: number, y: number, bw: number, bh: number, text: string, color: string) => {
    g.strokeStyle = color;
    g.beginPath();
    g.roundRect(x - bw / 2, y - bh / 2, bw, bh, 14);
    g.stroke();
    g.fillStyle = color;
    g.font = `700 22px ${font}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, x, y);
  };
  const arrow = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.lineTo(x1 - Math.cos(a - 0.4) * 14, y1 - Math.sin(a - 0.4) * 14);
    g.moveTo(x1, y1);
    g.lineTo(x1 - Math.cos(a + 0.4) * 14, y1 - Math.sin(a + 0.4) * 14);
    g.stroke();
  };
  const blue = "#1c64d6";
  const red = "#d63a3a";
  const green = "#16915a";
  const black = "#2b2d42";
  box(110, 70, 150, 54, "START", black);
  arrow(185, 70, 255, 70, black);
  box(350, 70, 180, 54, "read hooks", blue);
  arrow(440, 70, 520, 70, black);
  // Decision diamond.
  g.strokeStyle = red;
  g.beginPath();
  g.moveTo(600, 30);
  g.lineTo(680, 70);
  g.lineTo(600, 110);
  g.lineTo(520, 70);
  g.closePath();
  g.stroke();
  g.fillStyle = red;
  g.font = `700 20px ${font}`;
  g.fillText("tests ok?", 600, 70);
  arrow(680, 70, 760, 70, green);
  g.fillStyle = green;
  g.fillText("yes", 720, 52);
  box(850, 70, 150, 54, "SHIP ✓", green);
  arrow(600, 110, 600, 190, red);
  g.fillStyle = red;
  g.fillText("no", 622, 150);
  box(600, 225, 170, 54, "fix + retry", red);
  arrow(515, 225, 350, 225, black);
  arrow(350, 200, 350, 100, black);
  // Scribbles: a mini state machine and a todo list.
  g.strokeStyle = blue;
  for (const [cx, cy] of [
    [120, 330],
    [240, 330],
    [360, 330],
  ] as const) {
    g.beginPath();
    g.arc(cx, cy, 28, 0, Math.PI * 2);
    g.stroke();
  }
  arrow(150, 330, 210, 330, blue);
  arrow(270, 330, 330, 330, blue);
  g.fillStyle = black;
  g.font = `600 18px ${font}`;
  g.textAlign = "left";
  ["☑ walkways 2.5×", "☑ doors 1.8 m", "☐ more snacks", "☐ beat Học at chess"].forEach((line, k) => g.fillText(line, 560, 310 + k * 30));
}

function Whiteboard() {
  useRenderCount("Whiteboard");
  const wb = PROPS.whiteboard;
  const { texture, material } = useMemo(() => {
    const texture = canvasTexture(1024, 460, drawLogic);
    texture.anisotropy = 8;
    return { texture, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3, metalness: 0 }) };
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );
  const markers = useMemo<InstanceSpec[]>(
    () => ["#1c64d6", "#d63a3a", "#16915a", "#2b2d42"].map((c, k) => ({ p: [wb.x - 0.1, wb.y - wb.h / 2 - 0.02, wb.z - 0.3 + k * 0.15], r: [Math.PI / 2, 0, 0], s: [0.025, 0.13, 0.025], c })),
    [wb],
  );
  return (
    <group name="whiteboard">
      <mesh geometry={geometries.box()} material={materials.metal()} position={[wb.x + 0.02, wb.y, wb.z]} scale={[0.05, wb.h + 0.08, wb.w + 0.08]} castShadow />
      <mesh geometry={geometries.plane()} material={material} position={[wb.x - 0.01, wb.y, wb.z]} rotation={[0, -Math.PI / 2, 0]} scale={[wb.w, wb.h, 1]} />
      <mesh geometry={geometries.box()} material={materials.metal()} position={[wb.x - 0.07, wb.y - wb.h / 2 - 0.05, wb.z]} scale={[0.12, 0.025, wb.w * 0.9]} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.instanceWhite()} items={markers} />
    </group>
  );
}

// ───────────────────────── aquarium ─────────────────────────

const FISH = 9;
const FISH_COLORS = ["#ff8c42", "#ffd166", "#4cc9f0", "#ff6b6b", "#c77dff", "#ff8c42", "#06d6a0", "#ffffff", "#ffd166"];
const BUBBLES = 14;

/** A long tank on a wooden cabinet; fish loop about, bubbles rise, and the fish crowd the glass when someone watches. */
function Aquarium() {
  useRenderCount("Aquarium");
  const aq = PROPS.aquarium;
  const cabH = 0.75;
  const tank = { y0: cabH + 0.04, y1: aq.h - 0.05 };
  const fish = useRef<THREE.InstancedMesh>(null);
  const tails = useRef<THREE.InstancedMesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const weeds = useRef<THREE.InstancedMesh>(null);
  const near = useRef(0);
  const water = sharedMaterial("aquaWater", () => new THREE.MeshStandardMaterial({ color: "#2fa8d8", emissive: "#0c4f73", emissiveIntensity: 0.6, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false }));
  const glass = sharedMaterial("aquaGlass", () => new THREE.MeshStandardMaterial({ color: "#e8f8ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.15, depthWrite: false }));
  const fishColors = useMemo(() => FISH_COLORS.map((c) => new THREE.Color(c)), []);
  const rocks = useMemo<InstanceSpec[]>(
    () => Array.from({ length: 7 }, (_, k) => ({ p: [aq.x - 1.0 + k * 0.33, tank.y0 + 0.06, aq.z - 0.1 + hash(k, 1, 4) * 0.15], s: [0.12 + hash(k, 2, 4) * 0.1, 0.08 + hash(k, 3, 4) * 0.08, 0.1], c: hash(k, 5, 4) > 0.5 ? "#8d99ae" : "#6c757d" })),
    [aq, tank.y0],
  );

  useLayoutEffect(() => {
    const f = fish.current;
    const t = tails.current;
    if (!f || !t) return;
    for (let k = 0; k < FISH; k++) {
      f.setColorAt(k, fishColors[k]!);
      t.setColorAt(k, fishColors[k]!);
    }
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
  }, [fishColors]);

  useFrame((state, rawDt) => {
    const f = fish.current;
    const tl = tails.current;
    const bb = bubbles.current;
    const wd = weeds.current;
    if (!f || !tl || !bb || !wd) return;
    const dt = Math.min(rawDt, 0.1);
    const reduced = useWorldStore.getState().reducedMotion;
    const t = state.clock.elapsedTime * (reduced ? 0.3 : 1);
    // Someone watching: the fish drift to the front glass.
    near.current = THREE.MathUtils.damp(near.current, anyInUse("aquarium") ? 1 : 0, 1.5, dt);
    for (let k = 0; k < FISH; k++) {
      const speed = 0.25 + hash(k, 1, 6) * 0.3;
      const phase = hash(k, 2, 6) * 10;
      const u = Math.sin(t * speed + phase);
      const vx = Math.cos(t * speed + phase);
      const x = aq.x + u * (aq.sx / 2 - 0.2);
      const y = tank.y0 + 0.15 + hash(k, 3, 6) * (tank.y1 - tank.y0 - 0.3) + Math.sin(t * 0.8 + k) * 0.03;
      const zBack = aq.z - 0.15 + hash(k, 4, 6) * 0.3;
      const z = THREE.MathUtils.lerp(zBack, aq.z + aq.sz / 2 - 0.08, near.current * (0.6 + 0.4 * hash(k, 5, 6)));
      const facing = vx >= 0 ? 0 : Math.PI;
      const wiggle = Math.sin(t * 9 + k) * 0.25;
      tmpQ.setFromEuler(tmpE.set(0, facing + wiggle * 0.3, 0));
      const size = 0.7 + hash(k, 6, 6) * 0.5;
      f.setMatrixAt(k, tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(0.1 * size, 0.055 * size, 0.035 * size)));
      tmpQ.setFromEuler(tmpE.set(0, facing + wiggle, Math.PI / 2));
      const back = vx >= 0 ? -1 : 1;
      tl.setMatrixAt(k, tmpM.compose(tmpP.set(x + back * 0.06 * size, y, z), tmpQ, tmpS.set(0.04 * size, 0.05 * size, 0.012)));
    }
    for (let k = 0; k < BUBBLES; k++) {
      const rise = (t * (0.12 + hash(k, 1, 8) * 0.1) + hash(k, 2, 8)) % 1;
      const bx = aq.x + 0.95 + Math.sin(t * 2 + k) * 0.02 + (k % 3) * 0.04;
      bb.setMatrixAt(k, tmpM.compose(tmpP.set(bx, tank.y0 + rise * (tank.y1 - tank.y0), aq.z + (k % 2) * 0.05), tmpQ.identity(), tmpS.setScalar(0.012 + (k % 3) * 0.006)));
    }
    for (let k = 0; k < 8; k++) {
      const sway = Math.sin(t * 1.2 + k) * 0.18;
      tmpQ.setFromEuler(tmpE.set(sway * 0.4, 0, sway));
      wd.setMatrixAt(k, tmpM.compose(tmpP.set(aq.x - 1.1 + k * 0.31, tank.y0 + 0.2, aq.z - 0.18 + (k % 2) * 0.08), tmpQ, tmpS.set(0.03, 0.4 + (k % 3) * 0.08, 0.01)));
    }
    f.instanceMatrix.needsUpdate = true;
    tl.instanceMatrix.needsUpdate = true;
    bb.instanceMatrix.needsUpdate = true;
    wd.instanceMatrix.needsUpdate = true;
  });

  const tankH = tank.y1 - tank.y0;
  return (
    <group name="aquarium">
      <mesh geometry={geometries.box()} material={materials.wood()} position={[aq.x, cabH / 2, aq.z]} scale={[aq.sx, cabH, aq.sz]} castShadow receiveShadow />
      <mesh geometry={geometries.box()} material={water} position={[aq.x, tank.y0 + tankH / 2, aq.z]} scale={[aq.sx - 0.06, tankH - 0.04, aq.sz - 0.06]} />
      <mesh geometry={geometries.box()} material={glass} position={[aq.x, tank.y0 + tankH / 2, aq.z]} scale={[aq.sx, tankH, aq.sz]} />
      <mesh geometry={geometries.box()} material={sharedMaterial("aquaSand", () => new THREE.MeshStandardMaterial({ color: "#e9d8a6", roughness: 1, metalness: 0 }))} position={[aq.x, tank.y0 + 0.03, aq.z]} scale={[aq.sx - 0.06, 0.06, aq.sz - 0.06]} />
      <mesh geometry={geometries.box()} material={materials.darkMetal()} position={[aq.x, aq.h, aq.z]} scale={[aq.sx + 0.04, 0.06, aq.sz + 0.04]} castShadow />
      <mesh geometry={geometries.box()} material={glowMaterial("aquaLight", "#bdf3ff")} position={[aq.x, aq.h - 0.035, aq.z + aq.sz / 2 - 0.05]} scale={[aq.sx - 0.1, 0.01, 0.03]} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={rocks} />
      <instancedMesh ref={weeds} args={[geometries.box(), materials.leaf(), 8]} frustumCulled={false} />
      <instancedMesh ref={fish} args={[geometries.sphere(), materials.instanceWhite(), FISH]} frustumCulled={false} />
      <instancedMesh ref={tails} args={[geometries.plane(), sharedMaterial("fishTail", () => new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.6 })), FISH]} frustumCulled={false} />
      <instancedMesh ref={bubbles} args={[geometries.sphere(), glowMaterial("aquaBubble", "#dff7ff"), BUBBLES]} frustumCulled={false} />
    </group>
  );
}

// ───────────────────────── zen garden ─────────────────────────

/** Planter with an indoor tree, moss and pebbles, a living green wall behind it, and a bench facing it. */
function ZenGarden() {
  useRenderCount("ZenGarden");
  const g = PROPS.garden;
  const bench = PROPS.gardenBench;
  const parts = useMemo(() => {
    const pebbles: InstanceSpec[] = [];
    for (let k = 0; k < 26; k++) {
      pebbles.push({ p: [g.x - g.sx / 2 + 0.15 + hash(k, 1, 13) * (g.sx - 0.3), 0.47, g.z + 0.2 + hash(k, 2, 13) * 0.25], s: [0.08 + hash(k, 3, 13) * 0.06, 0.03, 0.07], c: hash(k, 4, 13) > 0.5 ? "#e9ecef" : "#adb5bd" });
    }
    const canopy: InstanceSpec[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      canopy.push({ p: [g.x + Math.sin(a) * 0.55, 2.55 + hash(k, 1, 14) * 0.35, g.z + Math.cos(a) * 0.3], s: [0.75 + hash(k, 2, 14) * 0.3, 0.6, 0.6], c: ["#4caf63", "#3e9a55", "#5cbf6d"][k % 3]! });
    }
    canopy.push({ p: [g.x, 2.95, g.z], s: [0.9, 0.7, 0.7], c: "#58b86a" });
    const wallLeaves: InstanceSpec[] = [];
    for (let k = 0; k < 140; k++) {
      const flower = hash(k, 5, 15) > 0.93;
      wallLeaves.push({
        p: [g.x - 1.45 + hash(k, 1, 15) * 2.9, 0.55 + hash(k, 2, 15) * 2.4, -9.36 + hash(k, 3, 15) * 0.05],
        s: flower ? [0.07, 0.07, 0.07] : [0.16 + hash(k, 4, 15) * 0.1, 0.12, 0.05],
        c: flower ? CANDY[k % CANDY.length]! : ["#2f8f52", "#3fae62", "#57c278", "#26773f"][k % 4]!,
      });
    }
    // Five seat slats from the front edge; two backrest slats reclining away from the sitter (the upper one further
    // back), on the back legs, which run up to carry them.
    const slats: InstanceSpec[] = [];
    for (let k = 0; k < 5; k++) slats.push({ p: [bench.x, 0.45, bench.z - bench.sz / 2 + 0.06 + k * 0.11], s: [bench.sx, 0.035, 0.09] });
    for (let k = 0; k < 2; k++) slats.push({ p: [bench.x, 0.62 + k * 0.14, bench.z + bench.sz / 2 - 0.06 + k * 0.02], r: [0.15, 0, 0], s: [bench.sx, 0.08, 0.03] });
    const legs: InstanceSpec[] = [];
    for (const dx of [-bench.sx / 2 + 0.1, bench.sx / 2 - 0.1]) {
      legs.push({ p: [bench.x + dx, 0.22, bench.z - bench.sz / 2 + 0.06], s: [0.05, 0.44, 0.05] });
      legs.push({ p: [bench.x + dx, 0.42, bench.z + bench.sz / 2 - 0.03], s: [0.05, 0.84, 0.05] });
    }
    return { pebbles, canopy, wallLeaves, slats, legs };
  }, [g, bench]);
  const moss = sharedMaterial("moss", () => new THREE.MeshStandardMaterial({ color: "#4f8f3a", roughness: 1, metalness: 0 }));
  const wallBack = sharedMaterial("greenWallBack", () => new THREE.MeshStandardMaterial({ color: "#1d4d2f", roughness: 1, metalness: 0 }));
  return (
    <group name="zen-garden">
      <mesh geometry={geometries.box()} material={materials.wood()} position={[g.x, 0.22, g.z]} scale={[g.sx, 0.44, g.sz]} castShadow receiveShadow />
      <mesh geometry={geometries.box()} material={moss} position={[g.x, 0.445, g.z]} scale={[g.sx - 0.08, 0.02, g.sz - 0.08]} receiveShadow />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.pebbles} />
      <mesh geometry={geometries.cylinder()} material={materials.wood()} position={[g.x, 1.35, g.z]} rotation={[0, 0, 0.06]} scale={[0.14, 1.85, 0.14]} castShadow />
      <mesh geometry={geometries.cylinder()} material={materials.wood()} position={[g.x + 0.25, 2.2, g.z]} rotation={[0, 0, -0.7]} scale={[0.07, 0.7, 0.07]} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.canopy} castShadow />
      <mesh geometry={geometries.box()} material={wallBack} position={[g.x, 1.75, -9.4]} scale={[3.0, 2.5, 0.04]} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.wallLeaves} receiveShadow={false} />
      <Instanced geometry={geometries.box()} material={materials.wood()} items={parts.slats} castShadow />
      <Instanced geometry={geometries.box()} material={materials.darkMetal()} items={parts.legs} />
    </group>
  );
}

export function FocusExtras() {
  useRenderCount("FocusExtras");
  return (
    <group name="focus-extras">
      <Library />
      <ServerRacks />
      <Whiteboard />
      <Aquarium />
      <ZenGarden />
    </group>
  );
}
