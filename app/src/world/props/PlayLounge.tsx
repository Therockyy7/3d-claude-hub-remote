"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CLAW_ROUND, clawWins } from "@/agents/AgentAnimator";
import { PROPS } from "@/simulation/worldLayout";
import { useWorldStore } from "@/state/useWorldStore";
import { Instanced } from "@/world/Instanced";
import type { InstanceSpec } from "@/world/Instanced";
import { canvasTexture, glowTexture, hash, uiFont } from "@/world/proceduralTextures";
import { geometries, materials, sharedGeometry, sharedMaterial } from "@/world/sharedResources";
import { useRenderCount } from "@/world/renderCounts";
import { CANDY, UseClock, glowMaterial, inUse, ramp, userAt } from "@/world/props/propKit";

/**
 * Play & Recharge Lounge (worldLayout `PROPS`): the coffee bar with a juice dispenser, a self-serve snack bar and a
 * glowing smart fridge along the east wall; two arcade cabinets, a claw machine, a foosball table, a chess table and
 * a beanbag corner; floor lamps and a string of party lights over it all. Each game comes alive while a robot plays
 * it (screens, the claw, the rods, a chess move); the fridge door swings open for whoever takes a drink.
 */

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** A sign: text on a dark rounded plate, drawn once. */
function signTexture(text: string, color: string, w = 256, h = 64): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = "#0b1020";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = color;
    g.font = `800 ${Math.round(h * 0.5)}px ${uiFont()}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function useSign(text: string, color: string) {
  const { texture, material } = useMemo(() => {
    const texture = signTexture(text, color);
    return { texture, material: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) };
  }, [text, color]);
  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture],
  );
  return material;
}

// ───────────────────────── coffee bar ─────────────────────────

const MUG_COLORS = ["#f2ede4", "#e76f51", "#2a9d8f", "#e9c46a", "#f2ede4"];

function CoffeeBar() {
  useRenderCount("CoffeeBar");
  const { counter: c, coffeeMachine: m, dispenser: d } = PROPS;
  const lightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffb24a", toneMapped: false }), []);
  useEffect(() => () => lightMat.dispose(), [lightMat]);
  const juice = sharedMaterial("juiceGlass", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.75 }));
  const sign = useSign("COFFEE", "#ffb24a");
  const parts = useMemo(() => {
    const mugs: InstanceSpec[] = MUG_COLORS.map((col, i) => ({ p: [c.x + 0.12 - (i % 2) * 0.16, c.h + 0.06, c.z + 0.35 + i * 0.16], s: [0.085, 0.11, 0.085], c: col }));
    const tanks: InstanceSpec[] = [
      { p: [d.x, c.h + 0.33, d.z - 0.13], s: [0.2, 0.42, 0.2], c: "#ffa94d" },
      { p: [d.x, c.h + 0.33, d.z + 0.13], s: [0.2, 0.42, 0.2], c: "#8ce99a" },
    ];
    const fruit: InstanceSpec[] = [0, 1, 2, 3, 4].map((k) => ({ p: [c.x + 0.05 + Math.sin(k * 2.4) * 0.06, c.h + 0.07 + (k > 2 ? 0.05 : 0), c.z - 1.05 + Math.cos(k * 2.4) * 0.06], s: 0.08, c: ["#ff6b6b", "#ffd43b", "#ff922b", "#94d82d", "#ff6b6b"][k]! }));
    return { mugs, tanks, fruit };
  }, [c, d]);
  const level = useRef(0);
  const lightRef = useRef<THREE.Mesh>(null);

  useFrame((state, rawDt) => {
    const light = lightRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (!light) return;
    const dt = Math.min(rawDt, 0.1);
    // The machine's light pulses while it brews for a robot standing at it.
    level.current = THREE.MathUtils.damp(level.current, inUse("pantry", 0) ? 1 : 0, 4, dt);
    const pulse = useWorldStore.getState().reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 5);
    light.color.set("#ffb24a").multiplyScalar(0.35 + level.current * (0.9 + 0.8 * pulse));
  });

  return (
    <group name="coffee-bar">
      <mesh geometry={geometries.box()} material={materials.desk()} position={[c.x, (c.h - 0.05) / 2, c.z]} scale={[c.sx, c.h - 0.05, c.sz]} castShadow receiveShadow />
      <mesh geometry={geometries.roundedBox()} material={materials.wood()} position={[c.x - 0.02, c.h - 0.02, c.z]} scale={[c.sx + 0.08, 0.06, c.sz + 0.06]} castShadow receiveShadow />
      <mesh geometry={geometries.plane()} material={sign} position={[c.x + c.sx / 2 - 0.02, 1.9, c.z]} rotation={[0, -Math.PI / 2, 0]} scale={[1.2, 0.3, 1]} />
      {/* Coffee machine, facing the room (-x). */}
      <mesh geometry={geometries.roundedBox()} material={materials.darkMetal()} position={[m.x, c.h + 0.3, m.z]} scale={[0.42, 0.58, 0.44]} castShadow />
      <mesh geometry={geometries.box()} material={materials.metal()} position={[m.x - 0.13, c.h + 0.03, m.z]} scale={[0.2, 0.03, 0.28]} />
      <mesh geometry={geometries.cylinderLow()} material={materials.metal()} position={[m.x - 0.17, c.h + 0.32, m.z]} scale={[0.05, 0.07, 0.05]} />
      <mesh geometry={geometries.cylinderLow()} material={materials.ceramic()} position={[m.x - 0.15, c.h + 0.1, m.z]} scale={[0.08, 0.1, 0.08]} />
      <mesh ref={lightRef} geometry={geometries.box()} material={lightMat} position={[m.x - 0.222, c.h + 0.47, m.z]} scale={[0.01, 0.05, 0.2]} />
      {/* Juice dispenser: two clear tanks on a steel base, taps towards the room. */}
      <mesh geometry={geometries.box()} material={materials.metal()} position={[d.x, c.h + 0.06, d.z]} scale={[0.3, 0.12, 0.52]} castShadow />
      <Instanced geometry={geometries.cylinder()} material={juice} items={parts.tanks} receiveShadow={false} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.instanceWhite()} items={parts.mugs} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.fruit} />
    </group>
  );
}

// ───────────────────────── snack bar ─────────────────────────

function SnackBar() {
  useRenderCount("SnackBar");
  const s = PROPS.snacks;
  const sign = useSign("SNACKS", "#ffd166");
  const parts = useMemo(() => {
    const frame: InstanceSpec[] = [
      { p: [s.x + s.sx / 2 - 0.03, s.h / 2, s.z], s: [0.06, s.h, s.sz] },
      { p: [s.x, s.h / 2, s.z - s.sz / 2 + 0.03], s: [s.sx, s.h, 0.06] },
      { p: [s.x, s.h / 2, s.z + s.sz / 2 - 0.03], s: [s.sx, s.h, 0.06] },
      { p: [s.x, s.h, s.z], s: [s.sx + 0.04, 0.05, s.sz + 0.04] },
    ];
    const shelves: InstanceSpec[] = [];
    const boxes: InstanceSpec[] = [];
    const jars: InstanceSpec[] = [];
    [0.32, 0.62, 0.92, 1.22].forEach((y, row) => {
      // Shelves tip towards the room so the snacks show.
      shelves.push({ p: [s.x - 0.02, y, s.z], r: [0, 0, -0.18], s: [s.sx - 0.1, 0.03, s.sz - 0.1] });
      for (let k = 0; k < 7; k++) {
        const z = s.z - s.sz / 2 + 0.17 + k * 0.21;
        const col = CANDY[(row * 3 + k) % CANDY.length]!;
        if (row === 3) jars.push({ p: [s.x - 0.12, y + 0.1, z], s: [0.12, 0.18, 0.12], c: col });
        else boxes.push({ p: [s.x - 0.08 + hash(row, k, 2) * 0.06, y + 0.09, z], r: [0, 0, -0.18], s: [0.16, 0.16 + hash(row, k, 3) * 0.06, 0.13], c: col });
      }
    });
    return { frame, shelves, boxes, jars };
  }, [s]);
  return (
    <group name="snack-bar">
      <Instanced geometry={geometries.box()} material={materials.wood()} items={parts.frame} castShadow />
      <Instanced geometry={geometries.box()} material={materials.wood()} items={parts.shelves} />
      <Instanced geometry={geometries.roundedBox()} material={materials.instanceWhite()} items={parts.boxes} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.instanceWhite()} items={parts.jars} />
      <mesh geometry={geometries.plane()} material={sign} position={[s.x - s.sx / 2 + 0.06, s.h + 0.28, s.z]} rotation={[0, -Math.PI / 2, 0]} scale={[1.1, 0.28, 1]} />
    </group>
  );
}

// ───────────────────────── smart fridge ─────────────────────────

/** Glass-door fridge glowing from inside; the door swings open (towards −x) for the robot taking a drink. */
function SmartFridge() {
  useRenderCount("SmartFridge");
  const f = PROPS.fridge;
  const front = f.x - f.sx / 2;
  const hinge = { x: front, z: f.z + f.sz / 2 };
  const door = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const clock = useRef(new UseClock());
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#bfefff", toneMapped: false }), []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const display = useSign("4°C", "#7cf0ff");
  const glass = sharedMaterial("fridgeGlass", () => new THREE.MeshStandardMaterial({ color: "#cfefff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
  const parts = useMemo(() => {
    const bottles: InstanceSpec[] = [];
    const shelves: InstanceSpec[] = [];
    [0.35, 0.75, 1.15, 1.55].forEach((y, row) => {
      shelves.push({ p: [f.x, y - 0.02, f.z], s: [f.sx - 0.1, 0.02, f.sz - 0.1] });
      for (let k = 0; k < 5; k++) {
        bottles.push({ p: [f.x - 0.12 + (k % 2) * 0.12, y + 0.11, f.z - 0.28 + k * 0.14], s: [0.07, 0.22, 0.07], c: CANDY[(row * 2 + k) % CANDY.length]! });
      }
    });
    return { bottles, shelves };
  }, [f]);

  useFrame((state, rawDt) => {
    const g = door.current;
    const glowM = glowRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (!g || !glowM) return;
    const dt = Math.min(rawDt, 0.1);
    const t = clock.current.update(userAt("fridge", 0), dt);
    // Open while the robot reaches in, then shut. The door swings out to about 80°; the robot stands south-west of its
    // sweep, so the door's edge passes in front of it and the reaching hand goes in only once the door is out of the way.
    const open = t > 0 ? ramp(t, 0.35, 1.2) * (1 - ramp(t, 2.9, 3.7)) : 0;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, open * 1.45, 10, dt);
    glowM.color.set("#bfefff").multiplyScalar(0.75 + open * 0.6 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05);
  });

  return (
    <group name="smart-fridge">
      <mesh geometry={geometries.roundedBox()} material={materials.whiteboard()} position={[f.x + 0.03, f.h / 2, f.z]} scale={[f.sx - 0.06, f.h, f.sz]} castShadow receiveShadow />
      {/* Lit interior seen through the glass door: a glowing back panel, shelves and bottles. */}
      <mesh ref={glowRef} geometry={geometries.box()} material={glowMat} position={[front + 0.02, f.h / 2, f.z]} scale={[0.01, f.h - 0.2, f.sz - 0.12]} />
      <Instanced geometry={geometries.box()} material={materials.metal()} items={parts.shelves} receiveShadow={false} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.instanceWhite()} items={parts.bottles} receiveShadow={false} />
      <group ref={door} position={[hinge.x - 0.03, 0, hinge.z]}>
        <mesh geometry={geometries.box()} material={glass} position={[-0.01, f.h / 2, -f.sz / 2]} scale={[0.02, f.h - 0.06, f.sz - 0.02]} />
        <mesh geometry={geometries.box()} material={glowMaterial("fridgeLed", "#7cf0ff")} position={[-0.02, f.h - 0.04, -f.sz / 2]} scale={[0.012, 0.012, f.sz - 0.04]} />
        <mesh geometry={geometries.box()} material={glowMaterial("fridgeLed", "#7cf0ff")} position={[-0.02, 0.04, -f.sz / 2]} scale={[0.012, 0.012, f.sz - 0.04]} />
        <mesh geometry={geometries.box()} material={materials.metal()} position={[-0.05, 1.0, -f.sz + 0.08]} scale={[0.025, 0.55, 0.025]} />
        <mesh geometry={geometries.plane()} material={display} position={[-0.025, 1.62, -f.sz / 2 + 0.15]} rotation={[0, -Math.PI / 2, 0]} scale={[0.22, 0.07, 1]} />
      </group>
    </group>
  );
}

// ───────────────────────── arcade ─────────────────────────

/** A little shoot-'em-up attract screen; scrolled sideways while idle and while played. */
function arcadeTexture(seed: number): THREE.CanvasTexture {
  const t = canvasTexture(128, 96, (g, w, h) => {
    g.fillStyle = "#05030d";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(Math.floor(hash(i, 1, seed) * w), Math.floor(hash(i, 2, seed) * h), 1, 1);
    }
    const colors = ["#ff4fd8", "#4ff0ff", "#ffe14f", "#7dff4f"];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        g.fillStyle = colors[(row + seed) % colors.length]!;
        const x = 8 + col * 14;
        const y = 10 + row * 12;
        g.fillRect(x, y, 8, 5);
        g.fillRect(x - 2, y + 5, 3, 3);
        g.fillRect(x + 7, y + 5, 3, 3);
      }
    }
    g.fillStyle = "#4ff0ff";
    g.fillRect(56, 80, 14, 6);
    g.fillRect(61, 76, 4, 4);
    g.fillStyle = "#ffffff";
    g.fillRect(62, 60, 2, 8);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

const CABINET_COLORS = ["#ff4fd8", "#4ff0ff"];

function ArcadeCabinet({ index }: { index: number }) {
  useRenderCount("ArcadeCabinet");
  const { x, z } = PROPS.arcade[index]!;
  const accent = CABINET_COLORS[index % CABINET_COLORS.length]!;
  const { screen, texture, marquee } = useMemo(() => {
    const texture = arcadeTexture(index + 3);
    return {
      texture,
      screen: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
      marquee: new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }),
    };
  }, [index, accent]);
  useEffect(
    () => () => {
      screen.dispose();
      marquee.dispose();
      texture.dispose();
    },
    [screen, marquee, texture],
  );
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.1 }), [accent]);
  useEffect(() => () => side.dispose(), [side]);
  const level = useRef(0.4);
  const screenRef = useRef<THREE.Mesh>(null);
  const marqueeRef = useRef<THREE.Mesh>(null);

  useFrame((state, rawDt) => {
    const sm = screenRef.current?.material as THREE.MeshBasicMaterial | undefined;
    const mm = marqueeRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (!sm?.map || !mm) return;
    const dt = Math.min(rawDt, 0.1);
    const playing = inUse("arcade", index);
    level.current = THREE.MathUtils.damp(level.current, playing ? 1.25 : 0.45, 3, dt);
    const t = state.clock.elapsedTime;
    const reduced = useWorldStore.getState().reducedMotion;
    sm.map.offset.x = (sm.map.offset.x + dt * (playing ? 0.35 : 0.06) * (reduced ? 0.3 : 1)) % 1;
    const flicker = playing && !reduced ? 0.12 * Math.sin(t * 23) * Math.sin(t * 7) : 0;
    sm.color.setScalar(level.current + flicker);
    mm.color.set(accent).multiplyScalar(0.55 + level.current * 0.5);
  });

  return (
    <group name={`arcade-${index}`} position={[x, 0, z]}>
      <mesh geometry={geometries.box()} material={materials.plastic()} position={[0, 0.9, 0]} scale={[0.62, 1.8, 0.78]} castShadow receiveShadow />
      <mesh geometry={geometries.box()} material={side} position={[0, 0.9, 0.395]} scale={[0.6, 1.7, 0.012]} />
      <mesh geometry={geometries.box()} material={side} position={[0, 0.9, -0.395]} scale={[0.6, 1.7, 0.012]} />
      <mesh ref={marqueeRef} geometry={geometries.box()} material={marquee} position={[0.32, 1.68, 0]} scale={[0.04, 0.2, 0.68]} />
      <mesh ref={screenRef} geometry={geometries.plane()} material={screen} position={[0.317, 1.27, 0]} rotation={[0, Math.PI / 2, 0]} scale={[0.6, 0.46, 1]} />
      {/* Control panel tilted towards the player, a joystick and three buttons. */}
      <mesh geometry={geometries.box()} material={materials.darkMetal()} position={[0.42, 0.97, 0]} rotation={[0, 0, -0.22]} scale={[0.34, 0.07, 0.74]} castShadow />
      <mesh geometry={geometries.cylinderLow()} material={materials.metal()} position={[0.45, 1.05, -0.16]} scale={[0.025, 0.12, 0.025]} />
      <mesh geometry={geometries.sphere()} material={glowMaterial("arcadeStick", "#ff3b3b")} position={[0.45, 1.12, -0.16]} scale={0.065} />
      {[0.04, 0.14, 0.24].map((dz, k) => (
        <mesh key={k} geometry={geometries.cylinderLow()} material={glowMaterial(`arcadeButton${k}`, ["#ffe14f", "#4ff0ff", "#7dff4f"][k]!)} position={[0.45, 1.02, dz]} scale={[0.05, 0.025, 0.05]} />
      ))}
    </group>
  );
}

// ───────────────────────── claw machine ─────────────────────────

const PLUSH = 18;

/**
 * A claw machine facing +x: a glass case full of plush toys over a pink cabinet. While a robot plays, the claw roams,
 * drops, grabs, lifts and carries to the chute every `CLAW_ROUND` seconds; on rounds `clawWins` it brings a toy, and the
 * robot playing cheers on the same rounds.
 */
function ClawMachine() {
  useRenderCount("ClawMachine");
  const c = PROPS.claw;
  const carriage = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const prongs = useRef<(THREE.Mesh | null)[]>([]);
  const prize = useRef<THREE.Mesh>(null);
  const clock = useRef(new UseClock());
  const sign = useSign("CLAW", "#ff8fab");
  const glass = sharedMaterial("clawGlass", () => new THREE.MeshStandardMaterial({ color: "#e8f6ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }));
  const pink = sharedMaterial("clawBody", () => new THREE.MeshStandardMaterial({ color: "#ff6fae", roughness: 0.45, metalness: 0.15 }));
  const plush = useMemo<InstanceSpec[]>(
    () =>
      Array.from({ length: PLUSH }, (_, k) => ({
        p: [c.x - 0.3 + hash(k, 1, 5) * 0.5, 0.95 + hash(k, 2, 5) * 0.12, c.z - 0.33 + hash(k, 3, 5) * 0.5],
        s: 0.13 + hash(k, 4, 5) * 0.05,
        c: CANDY[k % CANDY.length]!,
      })),
    [c],
  );

  useFrame((_, rawDt) => {
    const g = carriage.current;
    const cab = cable.current;
    const h = head.current;
    if (!g || !cab || !h) return;
    const t = clock.current.update(userAt("claw", 0), Math.min(rawDt, 0.1));
    const round = Math.floor(t / CLAW_ROUND);
    const k = t % CLAW_ROUND;
    const win = t > 0 && clawWins(round);
    // Home is over the chute (front-right corner). Each round the claw roams for 3.6 s, holds still while it drops,
    // grabs and lifts, then glides home and lets go.
    const s = round * CLAW_ROUND + Math.min(k, 3.6);
    const away = t > 0 ? ramp(k, 0, 0.6) * (1 - ramp(k, 6.6, 7.6)) : 0;
    g.position.set(c.x - 0.02 + THREE.MathUtils.lerp(0.3, Math.sin(s * 1.3) * 0.22, away), 1.66, c.z + THREE.MathUtils.lerp(0.3, Math.sin(s * 0.9 + 1) * 0.22, away));
    const drop = t > 0 ? ramp(k, 3.6, 4.8) * (1 - ramp(k, 5.4, 6.5)) : 0;
    const len = 0.1 + drop * 0.5;
    cab.scale.set(0.012, len, 0.012);
    cab.position.y = -len / 2;
    h.position.y = -len - 0.04;
    const closed = t > 0 ? ramp(k, 4.9, 5.3) * (1 - ramp(k, 7.6, 7.9)) : 0;
    prongs.current.forEach((p, i) => {
      if (!p) return;
      const a = (i / 3) * Math.PI * 2;
      const spread = 0.55 - closed * 0.45;
      tmpE.set(Math.cos(a) * spread, 0, -Math.sin(a) * spread);
      p.rotation.copy(tmpE);
    });
    const carrying = win && k > 5.4 && k < 7.8;
    const pr = prize.current;
    if (pr) {
      pr.visible = carrying;
      pr.position.y = -len - 0.13;
    }
  });

  return (
    <group name="claw-machine">
      <mesh geometry={geometries.roundedBox()} material={pink} position={[c.x, 0.43, c.z]} scale={[0.95, 0.86, 0.95]} castShadow receiveShadow />
      <mesh geometry={geometries.box()} material={glass} position={[c.x, 1.3, c.z]} scale={[0.9, 0.86, 0.9]} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={geometries.box()} material={materials.metal()} position={[c.x + sx * 0.45, 1.3, c.z + sz * 0.45]} scale={[0.04, 0.88, 0.04]} />),
      )}
      <mesh geometry={geometries.roundedBox()} material={pink} position={[c.x, 1.86, c.z]} scale={[0.98, 0.28, 0.98]} castShadow />
      <mesh geometry={geometries.plane()} material={sign} position={[c.x + 0.5, 1.86, c.z]} rotation={[0, Math.PI / 2, 0]} scale={[0.8, 0.22, 1]} />
      {/* The chute in the front-right corner, and the control panel on the front. */}
      <mesh geometry={geometries.box()} material={materials.darkMetal()} position={[c.x + 0.28, 0.9, c.z + 0.28]} scale={[0.26, 0.04, 0.26]} />
      <mesh geometry={geometries.box()} material={materials.darkMetal()} position={[c.x + 0.52, 0.95, c.z]} scale={[0.14, 0.08, 0.6]} castShadow />
      <mesh geometry={geometries.cylinderLow()} material={materials.metal()} position={[c.x + 0.54, 1.03, c.z - 0.12]} scale={[0.022, 0.1, 0.022]} />
      <mesh geometry={geometries.sphere()} material={glowMaterial("clawStick", "#ffd166")} position={[c.x + 0.54, 1.09, c.z - 0.12]} scale={0.055} />
      <mesh geometry={geometries.cylinderLow()} material={glowMaterial("clawButton", "#06d6a0")} position={[c.x + 0.54, 1.0, c.z + 0.12]} scale={[0.06, 0.03, 0.06]} />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={plush} />
      <group ref={carriage}>
        <mesh geometry={geometries.box()} material={materials.metal()} scale={[0.1, 0.05, 0.1]} />
        <mesh ref={cable} geometry={geometries.cylinderLow()} material={materials.darkMetal()} />
        <group ref={head}>
          <mesh geometry={geometries.cylinderLow()} material={materials.metal()} scale={[0.07, 0.05, 0.07]} />
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              ref={(m) => {
                prongs.current[i] = m;
              }}
              geometry={sharedGeometry("clawProng", () => new THREE.BoxGeometry(0.012, 0.12, 0.012).translate(0, -0.06, 0))}
              material={materials.metal()}
            />
          ))}
          <mesh ref={prize} geometry={geometries.sphere()} material={glowMaterial("clawPrize", "#ff8fab")} scale={0.12} visible={false} />
        </group>
      </group>
    </group>
  );
}

// ───────────────────────── foosball ─────────────────────────

/** Rods from one goal to the other: [x offset, figures, team]. Red's handles stick out on −z, blue's on +z. */
const RODS: readonly (readonly [number, number, 0 | 1])[] = [
  [-0.52, 1, 0],
  [-0.38, 2, 0],
  [-0.23, 3, 1],
  [-0.08, 5, 0],
  [0.08, 5, 1],
  [0.23, 3, 0],
  [0.38, 2, 1],
  [0.52, 1, 1],
];
const FIGURES = RODS.reduce((n, r) => n + r[1], 0);
const TEAM = ["#e63946", "#3a86ff"];
/** A figure hangs from its rod, most of it below. */
const HANG = new THREE.Matrix4().makeTranslation(0, -0.3, 0);

/** A foosball table, goals along x: rods slide and spin and the ball zips about while anyone plays. */
function Foosball() {
  useRenderCount("Foosball");
  const f = PROPS.foosball;
  const rods = useRef<THREE.InstancedMesh>(null);
  const handles = useRef<THREE.InstancedMesh>(null);
  const figures = useRef<THREE.InstancedMesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const clock = useRef(new UseClock());
  const field = useMemo(() => {
    const texture = canvasTexture(256, 148, (g, w, h) => {
      g.fillStyle = "#2f9e44";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.beginPath();
      g.moveTo(w / 2, 6);
      g.lineTo(w / 2, h - 6);
      g.stroke();
      g.beginPath();
      g.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
      g.stroke();
      g.strokeRect(6, h / 2 - 30, 26, 60);
      g.strokeRect(w - 32, h / 2 - 30, 26, 60);
    });
    return { texture, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0 }) };
  }, []);
  useEffect(
    () => () => {
      field.material.dispose();
      field.texture.dispose();
    },
    [field],
  );
  const team = useMemo(() => TEAM.map((c) => new THREE.Color(c)), []);

  useLayoutEffect(() => {
    const fig = figures.current;
    if (!fig) return;
    let n = 0;
    RODS.forEach(([, count, side]) => {
      for (let k = 0; k < count; k++) fig.setColorAt(n++, team[side]!);
    });
    if (fig.instanceColor) fig.instanceColor.needsUpdate = true;
  }, [team]);

  const last = useRef(-1);
  useFrame((_, rawDt) => {
    const r = rods.current;
    const hd = handles.current;
    const fig = figures.current;
    const b = ball.current;
    if (!r || !hd || !fig || !b) return;
    const t = clock.current.update(userAt("foosball", 0) ?? userAt("foosball", 1), Math.min(rawDt, 0.1));
    if (t === 0 && last.current === 0) return;
    last.current = t;
    let n = 0;
    RODS.forEach(([dx, count, side], i) => {
      // Each rod slides in and out and kicks (a quick spin of its figures) on its own beat.
      const slide = t > 0 ? Math.sin(t * (2.1 + i * 0.37) + i) * 0.07 : 0;
      const kick = t > 0 ? Math.max(0, Math.sin(t * (1.3 + i * 0.21) + i * 2)) ** 6 * 2.2 : 0;
      const x = f.x + dx;
      // Rods and handles lie along z: the unit cylinder (along y) turned onto z.
      tmpQ.setFromEuler(tmpE.set(Math.PI / 2, 0, 0));
      r.setMatrixAt(i, tmpM.compose(tmpP.set(x, 0.9, f.z + slide), tmpQ, tmpS.set(0.018, 1.2, 0.018)));
      hd.setMatrixAt(i, tmpM.compose(tmpP.set(x, 0.9, f.z + (side === 0 ? -0.56 : 0.56) + slide), tmpQ, tmpS.set(0.04, 0.12, 0.04)));
      tmpQ.setFromEuler(tmpE.set(0, 0, kick));
      for (let k = 0; k < count; k++) {
        const fz = f.z + slide + (count === 1 ? 0 : (k / (count - 1) - 0.5) * 0.5);
        fig.setMatrixAt(n++, tmpM.compose(tmpP.set(x, 0.9, fz), tmpQ, tmpS.set(0.035, 0.13, 0.05)).multiply(HANG));
      }
    });
    r.instanceMatrix.needsUpdate = true;
    hd.instanceMatrix.needsUpdate = true;
    fig.instanceMatrix.needsUpdate = true;
    b.position.set(f.x + (t > 0 ? Math.sin(t * 1.7) * 0.48 : 0), 0.9, f.z + (t > 0 ? Math.sin(t * 2.6 + 1) * 0.22 : 0));
  });

  return (
    <group name="foosball">
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={geometries.box()} material={materials.darkMetal()} position={[f.x + sx * 0.55, 0.36, f.z + sz * 0.28]} scale={[0.07, 0.72, 0.07]} />),
      )}
      <mesh geometry={geometries.box()} material={materials.wood()} position={[f.x, 0.8, f.z]} scale={[1.25, 0.18, 0.72]} castShadow receiveShadow />
      <mesh geometry={geometries.floorPlane()} material={field.material} position={[f.x, 0.895, f.z]} scale={[1.18, 1, 0.66]} />
      {[-1, 1].map((sz) => (
        <mesh key={sz} geometry={geometries.box()} material={materials.wood()} position={[f.x, 0.96, f.z + sz * 0.35]} scale={[1.25, 0.14, 0.03]} />
      ))}
      <instancedMesh ref={rods} args={[geometries.cylinderLow(), materials.metal(), RODS.length]} frustumCulled={false} />
      <instancedMesh ref={handles} args={[geometries.cylinderLow(), materials.joint(), RODS.length]} frustumCulled={false} />
      <instancedMesh ref={figures} args={[geometries.box(), materials.instanceWhite(), FIGURES]} castShadow frustumCulled={false} />
      <mesh ref={ball} geometry={geometries.sphere()} material={materials.whiteboard()} position={[f.x, 0.9, f.z]} scale={0.035} />
    </group>
  );
}

// ───────────────────────── chess ─────────────────────────

const CHESS_SQUARES = 8;
/** Width of the chessboard on the 0.75 m table top. */
const BOARD_W = 0.56;

/**
 * A bar-height chess table, played standing (no chairs: the players stand where chairs would be); a piece hops to a
 * new square every few seconds in a game.
 */
function ChessTable() {
  useRenderCount("ChessTable");
  const ch = PROPS.chess;
  // The board lies a few millimetres above the table top, never level with it (that flickers).
  const boardY = ch.h + 0.006;
  const pieces = useRef<THREE.InstancedMesh>(null);
  const clock = useRef(new UseClock());
  const board = useMemo(() => {
    const texture = canvasTexture(128, 128, (g, w) => {
      const sq = w / CHESS_SQUARES;
      for (let i = 0; i < CHESS_SQUARES; i++) for (let j = 0; j < CHESS_SQUARES; j++) {
        g.fillStyle = (i + j) % 2 ? "#6b4f3a" : "#f0e2c8";
        g.fillRect(i * sq, j * sq, sq, sq);
      }
    });
    texture.magFilter = THREE.NearestFilter;
    return { texture, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0 }) };
  }, []);
  useEffect(
    () => () => {
      board.material.dispose();
      board.texture.dispose();
    },
    [board],
  );
  const sq = BOARD_W / CHESS_SQUARES;
  const setup = useMemo(() => {
    const list: { i: number; j: number; white: boolean; tall: number }[] = [];
    for (let j = 0; j < CHESS_SQUARES; j++) {
      list.push({ i: 0, j, white: true, tall: j === 3 || j === 4 ? 1.6 : 1.2 }, { i: 1, j, white: true, tall: 0.8 });
      list.push({ i: 7, j, white: false, tall: j === 3 || j === 4 ? 1.6 : 1.2 }, { i: 6, j, white: false, tall: 0.8 });
    }
    return list;
  }, []);

  const lastMove = useRef(-1);
  const pieceColor = useMemo(() => [new THREE.Color("#f8f1e3"), new THREE.Color("#2b2d42")], []);
  useFrame((_, rawDt) => {
    const mesh = pieces.current;
    if (!mesh) return;
    const t = clock.current.update(userAt("chess", 0) ?? userAt("chess", 1), Math.min(rawDt, 0.1));
    const move = Math.floor(t / 5.5);
    const k = t % 5.5;
    // One piece per move: lift, glide one or two squares forward, land.
    const mover = t > 0 ? Math.floor(hash(move, 3, 9) * setup.length) : -1;
    const key = mover * 1000 + Math.round(k * 30);
    if (key === lastMove.current) return;
    lastMove.current = key;
    setup.forEach((p, n) => {
      let { i } = p;
      let lift = 0;
      if (n === mover) {
        const step = p.white ? 1 + (move % 2) : -1 - (move % 2);
        const f = ramp(k, 4.0, 4.8);
        i = THREE.MathUtils.lerp(p.i, p.i + step, f);
        lift = Math.sin(f * Math.PI) * 0.06;
      }
      const x = ch.x - BOARD_W / 2 + (i + 0.5) * sq;
      const z = ch.z - BOARD_W / 2 + (p.j + 0.5) * sq;
      mesh.setMatrixAt(n,tmpM.compose(tmpP.set(x, boardY + lift + 0.03 * p.tall, z), tmpQ.identity(), tmpS.set(0.04, 0.06 * p.tall, 0.04)));
      mesh.setColorAt(n, pieceColor[p.white ? 0 : 1]!);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="chess-table">
      <mesh geometry={geometries.box()} material={materials.wood()} position={[ch.x, ch.h - 0.02, ch.z]} scale={[0.75, 0.04, 0.75]} castShadow receiveShadow />
      <mesh geometry={geometries.floorPlane()} material={board.material} position={[ch.x, boardY, ch.z]} scale={[BOARD_W, 1, BOARD_W]} />
      <mesh geometry={geometries.cylinderLow()} material={materials.darkMetal()} position={[ch.x, ch.h / 2, ch.z]} scale={[0.08, ch.h - 0.04, 0.08]} />
      <mesh geometry={geometries.cylinder()} material={materials.darkMetal()} position={[ch.x, 0.02, ch.z]} scale={[0.5, 0.04, 0.5]} receiveShadow />
      <instancedMesh ref={pieces} args={[geometries.cylinderLow(), materials.instanceWhite(), 32]} castShadow frustumCulled={false} />
    </group>
  );
}

// ───────────────────────── beanbags, lamps, party lights ─────────────────────────

const BEANBAG_COLORS = ["#ff7a59", "#4fb3bf", "#ffd166"];
const BULBS = 30;
const PARTY = { a: { x: -1.6, z: 11.3 }, b: { x: 13.0, z: 11.3 }, top: 2.75, sag: 0.45 } as const;

/** A point along the sagging party-light wire, `u` from 0 (west pole) to 1 (east pole). */
function partyPoint(u: number): { x: number; y: number; z: number } {
  return { x: THREE.MathUtils.lerp(PARTY.a.x, PARTY.b.x, u), y: PARTY.top - PARTY.sag * 4 * u * (1 - u), z: THREE.MathUtils.lerp(PARTY.a.z, PARTY.b.z, u) };
}

/** Party lights strung along the front edge over the play lounge, on two slim poles; they twinkle softly. */
function PartyLights() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { a, b, top } = PARTY;
  const wire = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let k = 0; k < 40; k++) {
      const p = partyPoint(k / 40);
      const q = partyPoint((k + 1) / 40);
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      out.push({ p: [(p.x + q.x) / 2, (p.y + q.y) / 2, p.z], r: [0, 0, Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2], s: [0.008, len, 0.008] });
    }
    return out;
  }, []);
  const bulbs = useMemo(() => Array.from({ length: BULBS }, (_, k) => partyPoint((k + 0.5) / BULBS)), []);
  const colors = useMemo(() => bulbs.map((_, k) => new THREE.Color(["#ffd166", "#ff8fab", "#7cf0ff", "#b8f28b"][k % 4]!)), [bulbs]);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    bulbs.forEach((p, k) => {
      m.setMatrixAt(k, tmpM.compose(tmpP.set(p.x, p.y - 0.06, p.z), tmpQ.identity(), tmpS.set(0.07, 0.09, 0.07)));
      m.setColorAt(k, colors[k]!);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bulbs, colors]);

  useFrame((state) => {
    const m = ref.current;
    if (!m || useWorldStore.getState().reducedMotion) return;
    const t = state.clock.elapsedTime;
    for (let k = 0; k < BULBS; k++) m.setColorAt(k, tmpC.copy(colors[k]!).multiplyScalar(0.75 + 0.45 * Math.max(0, Math.sin(t * 1.7 + k * 1.3))));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group name="party-lights">
      {[a, b].map((p, k) => (
        <mesh key={k} geometry={geometries.cylinderLow()} material={materials.darkMetal()} position={[p.x, top / 2, p.z]} scale={[0.05, top, 0.05]} castShadow />
      ))}
      <Instanced geometry={geometries.cylinderLow()} material={materials.darkMetal()} items={wire} receiveShadow={false} />
      <instancedMesh ref={ref} args={[geometries.sphere(), glowMaterial("partyBulb", "#ffffff"), BULBS]} frustumCulled={false} />
    </group>
  );
}

function Lounging() {
  const parts = useMemo(() => {
    const bags: InstanceSpec[] = PROPS.beanBags.map((b, i) => ({ p: [b.x, 0.24, b.z], r: [0, i * 1.3, 0], s: [0.92, 0.5, 0.88], c: BEANBAG_COLORS[i % BEANBAG_COLORS.length]! }));
    const bases: InstanceSpec[] = PROPS.lamps.map((l) => ({ p: [l.x, 0.015, l.z], s: [0.32, 0.03, 0.32] }));
    const poles: InstanceSpec[] = PROPS.lamps.map((l) => ({ p: [l.x, 0.76, l.z], s: [0.03, 1.48, 0.03] }));
    const shades: InstanceSpec[] = PROPS.lamps.map((l) => ({ p: [l.x, 1.56, l.z], s: [0.4, 0.28, 0.4] }));
    const pools: InstanceSpec[] = PROPS.lamps.map((l) => ({ p: [l.x, 0.012, l.z], s: [2.4, 1, 2.4] }));
    return { bags, bases, poles, shades, pools };
  }, []);
  const shade = glowMaterial("lampShade", "#ffd9a0");
  const pool = sharedMaterial(
    "lampPool",
    () => new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#7a5a2e", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  const rug = sharedMaterial("beanbagRug", () => new THREE.MeshStandardMaterial({ color: "#f4a261", roughness: 0.95, metalness: 0 }));
  const bagsMid = PROPS.beanBags[1]!;
  return (
    <group name="beanbags-and-lamps">
      <mesh geometry={geometries.disc()} material={rug} position={[bagsMid.x - 0.3, 0.007, bagsMid.z]} scale={[1.6, 1, 2.2]} receiveShadow />
      <Instanced geometry={geometries.sphere()} material={materials.instanceWhite()} items={parts.bags} castShadow />
      <Instanced geometry={geometries.cylinder()} material={materials.darkMetal()} items={parts.bases} />
      <Instanced geometry={geometries.cylinderLow()} material={materials.metal()} items={parts.poles} castShadow />
      <Instanced geometry={geometries.cylinder()} material={shade} items={parts.shades} receiveShadow={false} />
      <Instanced geometry={geometries.floorPlane()} material={pool} items={parts.pools} receiveShadow={false} />
    </group>
  );
}

export function PlayLounge() {
  useRenderCount("PlayLounge");
  return (
    <group name="play-lounge">
      <CoffeeBar />
      <SnackBar />
      <SmartFridge />
      {PROPS.arcade.map((_, i) => (
        <ArcadeCabinet key={i} index={i} />
      ))}
      <ClawMachine />
      <Foosball />
      <ChessTable />
      <Lounging />
      <PartyLights />
    </group>
  );
}
