// Headless engine checks (npm test). Plain Node, no framework: prints ✓/✗ and exits 1 on failure.
import { SimulationEngine } from "../src/simulation/SimulationEngine.ts";
import { canTransition, isTerminal } from "../src/simulation/WorkflowStateMachine.ts";
import { GENERIC_TEMPLATE, templateFor } from "../src/simulation/workContent.ts";
import { SIM_CONFIG } from "../src/simulation/simulationConfig.ts";
import { AGENTS } from "../src/agents/AgentRegistry.ts";
import { isCommunication } from "../src/events/eventTypes.ts";
import type { AgentEvent } from "../src/events/eventTypes.ts";
import { DEMO_TASK } from "../src/tasks/taskActions.ts";
import { HOTFIX_TITLE, MIGRATION_TITLE, SPRINT_TASKS, TASK_BACKLOG, pickRandomTask } from "../src/tasks/taskBacklog.ts";
import type { Task } from "../src/tasks/taskTypes.ts";
import { AgentController } from "../src/agents/AgentController.ts";
import { DOORS, DOOR_WIDTH, LOCATIONS, MIN_WALKWAY, OBSTACLES, ROBOT_SPAN, WALKWAYS, clearance, distanceTo, route, segmentClearance, slotFor } from "../src/simulation/worldLayout.ts";
import type { LocationId, Vec2 } from "../src/simulation/worldLayout.ts";

const DT = 1 / SIM_CONFIG.tickHz;
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

function runUntil(engine: SimulationEngine, done: () => boolean, maxSim: number): void {
  while (!done() && engine.getClock() < maxSim) engine.tick(DT);
}

function phaseOrder(t: Task): string {
  return [t.history[0]?.from ?? t.phase, ...t.history.map((h) => h.to)].join(" → ");
}

/** The parts of an event that must be identical across runs (wall-clock timestamp excluded). */
const fingerprint = (e: AgentEvent) => `${e.type}|${e.agentId ?? ""}|${e.targetAgentId ?? ""}|${e.taskId ?? ""}|${e.simTime.toFixed(6)}|${e.message}`;

function runDemo(): { engine: SimulationEngine; task: Task; events: AgentEvent[]; finishedAt: number } {
  const engine = new SimulationEngine({ now: () => 0 });
  const events: AgentEvent[] = [];
  engine.events.subscribe((e) => events.push(e));
  engine.emitBootEvents();
  engine.start();
  const { id } = engine.submitTask(DEMO_TASK);
  runUntil(engine, () => isTerminal(engine.getTask(id)!.phase) && events.some((e) => e.type === "task.completed"), 300);
  return { engine, task: engine.getTask(id)!, events, finishedAt: engine.getClock() };
}

// 1 ───────────────────────────────────────────────
section("1. State machine");
check("testing --tests_failed--> allowed", canTransition("testing", "tests_failed"));
check("queued --approved--> rejected", !canTransition("queued", "approved"));
check("done is terminal", isTerminal("done") && !canTransition("done", "abort"));
{
  const dev = slotFor("dev", 0).position;
  check("route() to where you already stand is empty", route(dev, dev).length === 0);
  const slots = (Object.keys(LOCATIONS) as LocationId[]).flatMap((id) => LOCATIONS[id].slots);
  let ends = true;
  let closest = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      const r = route(a, b);
      ends &&= r.at(-1)!.x === b.x && r.at(-1)!.z === b.z;
      r.forEach((p, k) => (closest = Math.min(closest, segmentClearance(r[k - 1] ?? a, p))));
    }
  }
  check("route() between any two slots ends exactly on the slot", ends);
  check("route() never brushes furniture or glass: ≥ 0.3 m from every desk, chair, table, sofa, prop, plant and wall", closest >= 0.3, `${closest.toFixed(3)} m`);
  const from = { x: -3, z: 3 };
  const to = { x: 3, z: 3 };
  check("route() along the spine is one straight leg", route(from, to).length === 1);
  /** Closest the walk `start` → `path` comes to `q`. */
  const passBy = (start: Vec2, path: Vec2[], q: Vec2) => {
    let d = Infinity;
    path.forEach((p, i) => {
      const a = path[i - 1] ?? start;
      const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.z - a.z) / 0.05));
      for (let k = 0; k <= n; k++) d = Math.min(d, Math.hypot(a.x + ((p.x - a.x) * k) / n - q.x, a.z + ((p.z - a.z) * k) / n - q.z));
    });
    return d;
  };
  const standing = { x: 0, z: 3 };
  const around = route(from, to, [standing]);
  const passes = passBy(from, around, standing);
  check("route() goes around a robot standing in the way", passes >= 0.6 && around.at(-1)!.x === to.x, `${passes.toFixed(2)} m`);

  // Zoning: walkways wide enough for 2.5 robots and empty, doors a robot fits through, rooms entered by their door.
  const furnitureIn = (w: { x0: number; x1: number; z0: number; z1: number }) => {
    let d = Infinity;
    for (let x = w.x0; x <= w.x1 + 1e-9; x += 0.05) for (let z = w.z0; z <= w.z1 + 1e-9; z += 0.05) for (const o of OBSTACLES) d = Math.min(d, distanceTo(o, x, z));
    return d;
  };
  const narrow = WALKWAYS.filter((w) => Math.min(w.x1 - w.x0, w.z1 - w.z0) < MIN_WALKWAY - 1e-9).map((w) => w.id);
  check(`every transit path is at least 2.5 robots wide (${MIN_WALKWAY.toFixed(2)} m)`, narrow.length === 0, narrow.join(", "));
  const blocked = WALKWAYS.filter((w) => furnitureIn(w) < 0).map((w) => w.id);
  check("no furniture stands on a transit path", blocked.length === 0, blocked.join(", "));
  const tight = DOORS.filter((d) => clearance(d) < DOOR_WIDTH / 2 - 0.05).map((d) => `${d.room} ${(2 * clearance(d)).toFixed(2)} m`);
  check(`every room door is open at least ${DOOR_WIDTH - 0.1} m`, tight.length === 0, tight.join(", "));
  const spine = { x: 0, z: 2.9 };
  const doorOf = (room: string) => DOORS.find((d) => d.room === room)!;
  const missed = (["warroom", "collab"] as const).flatMap((id) =>
    LOCATIONS[id].slots.filter((s) => passBy(spine, route(spine, s), doorOf(id === "warroom" ? "War Room" : "Meeting Pod")) > 0.6).map(() => id),
  );
  check("robots enter the War Room and the Meeting Pod through their doors", missed.length === 0, missed.join(", "));
  let crowd = Infinity;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) crowd = Math.min(crowd, Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z));
  check(`no two places to stand are closer than the widest robot (${ROBOT_SPAN} m)`, crowd >= ROBOT_SPAN - 1e-9, `${crowd.toFixed(2)} m`);

  // Getting up from the desk chair comes before the first step away from the desk.
  const kai = AGENTS.find((p) => p.id === "kai")!;
  const c = new AgentController(kai, { walkSpeed: SIM_CONFIG.walkSpeed, onArrived: () => {}, positionOf: () => ({ x: 0, z: 0 }), faceIfIdle: () => {}, others: () => [] });
  c.enqueue({ kind: "work", duration: 1, status: "working", activity: "Typing" }, { kind: "move", to: "lounge" });
  const start = { ...c.state.position };
  let firstStep = -1;
  for (let k = 1; k <= 120 && firstStep < 0; k++) {
    c.step(DT);
    if (Math.hypot(c.state.position.x - start.x, c.state.position.z - start.z) > 1e-6) firstStep = k * DT;
  }
  check("a robot gets up from its desk chair before it walks off", firstStep >= 1 + SIM_CONFIG.gait.standUp - 1e-6, `first step at ${firstStep.toFixed(2)} s`);
}

// 2 ───────────────────────────────────────────────
section("2. Demo workflow");
const first = runDemo();
const types = new Set(first.events.map((e) => e.type));
const boot = first.events.filter((e) => e.type === "system.ready" || (e.type === "agent.arrived" && e.metadata?.["boot"]));
check("boot events ≥ 3", boot.length >= 3, `${boot.length}`);
check("demo reaches done/completed", first.task.phase === "done" && first.task.status === "completed", `${first.task.phase}/${first.task.status}`);
check("iteration === 2", first.task.iteration === 2, `${first.task.iteration}`);
check("progress === 1", first.task.progress === 1, `${first.task.progress}`);
check("all subtasks done", first.task.subtasks.length > 0 && first.task.subtasks.every((s) => s.done));
check("findings non-empty", first.task.findings.length > 0);
const required = ["task.created", "task.assigned", "plan.created", "research.completed", "implementation.started", "implementation.submitted", "qa.failed", "qa.passed", "review.approved", "task.completed"] as const;
const missing = required.filter((t) => !types.has(t));
check("all required events emitted", missing.length === 0, missing.join(", "));
const comms = first.events.filter(isCommunication).length;
check("≥ 7 agent-to-agent communications", comms >= 7, `${comms}`);
const expectedOrder = "queued → intake → planning → research → implementation → testing → implementation → testing → review → done";
check("phase order exact", phaseOrder(first.task) === expectedOrder, phaseOrder(first.task));
check("completes in < 100 sim s", first.finishedAt < 100, `${first.finishedAt.toFixed(1)} s`);
console.log(`    (demo finished at ${first.finishedAt.toFixed(1)} sim s, ${comms} communications)`);

// 3 ───────────────────────────────────────────────
section("3. Determinism");
const second = runDemo();
const a = first.events.map(fingerprint);
const b = second.events.map(fingerprint);
const firstDiff = a.findIndex((x, i) => x !== b[i]);
check("identical event sequence across runs", a.length === b.length && firstDiff === -1, firstDiff === -1 ? `length ${a.length} vs ${b.length}` : `first diff at #${firstDiff}: ${a[firstDiff]} ≠ ${b[firstDiff]}`);
check("identical finish clock", first.finishedAt === second.finishedAt);

// 4 ───────────────────────────────────────────────
section("4. Pause / resume / stop / reset");
{
  const engine = new SimulationEngine({ now: () => 0 });
  engine.start();
  const { id } = engine.submitTask(DEMO_TASK);
  runUntil(engine, () => engine.getClock() > 10, 20);
  engine.pause();
  const frozen = JSON.stringify(engine.snapshot());
  for (let i = 0; i < 60; i++) engine.tick(DT);
  check("paused snapshot does not change", JSON.stringify(engine.snapshot()) === frozen);
  engine.resume();
  const before = engine.getClock();
  for (let i = 0; i < 30; i++) engine.tick(DT);
  check("resumed simulation progresses", engine.getClock() > before);

  const owner = engine.getTask(id)!.assignedAgentId!;
  engine.pauseAgent(owner);
  check("pauseAgent(owner) blocks the task", engine.getTask(id)!.status === "blocked", engine.getTask(id)!.status);
  const progressWhilePaused = engine.getTask(id)!.progress;
  for (let i = 0; i < 90; i++) engine.tick(DT);
  check("blocked task does not progress", engine.getTask(id)!.progress === progressWhilePaused);
  engine.resumeAgent(owner);
  check("resumeAgent unblocks", engine.getTask(id)!.status !== "blocked" && engine.getTask(id)!.blockedReason === null);

  engine.stop();
  const stoppedAt = engine.getClock();
  for (let i = 0; i < 30; i++) engine.tick(DT);
  check("stop() halts and keeps state", engine.getStatus() === "ready" && engine.getClock() === stoppedAt && engine.getTask(id) !== undefined);
  engine.start();
  check("start() after stop() continues", engine.getStatus() === "running");

  const random = engine.submitTask(pickRandomTask(new Set([DEMO_TASK.title]), () => 0.5));
  runUntil(engine, () => isTerminal(engine.getTask(random.id)!.phase), 600);
  check("a random backlog task terminates", isTerminal(engine.getTask(random.id)!.phase), engine.getTask(random.id)!.phase);

  engine.reset();
  const s = engine.snapshot();
  const atHome = s.agents.every((ag) => {
    const home = slotFor(AGENTS.find((p) => p.id === ag.id)!.home, 0).position;
    return ag.status === "idle" && ag.position.x === home.x && ag.position.z === home.z;
  });
  check("reset() → 0 tasks, ready, clock 0, agents idle at stations", s.tasks.length === 0 && s.status === "ready" && s.clock === 0 && atHome);
}

// 5 ───────────────────────────────────────────────
section("5. Concurrency + priority + per-agent queues");
{
  const engine = new SimulationEngine({ now: () => 0 });
  engine.start();
  const low = engine.submitTask({ title: "Export audit log to CSV and Parquet", priority: "low" });
  const medium = engine.submitTask({ title: "Full-text search for project documents", priority: "medium" });
  const critical = engine.submitTask({ title: "Fix memory leak in the image-processing worker", priority: "critical" });
  engine.tick(DT);
  const ph = (id: string) => engine.getTask(id)!.phase;
  check("critical and medium start, low stays queued", ph(critical.id) !== "queued" && ph(medium.id) !== "queued" && ph(low.id) === "queued");

  // Both tasks need Kai: the critical one must reach implementation first and never be preempted.
  const implStarts: string[] = [];
  engine.events.subscribe((e) => {
    if (e.type === "implementation.started" && e.taskId) implStarts.push(e.taskId);
  });
  runUntil(engine, () => [low, medium, critical].every((t) => isTerminal(ph(t.id))), 1500);
  check("critical task reaches Kai before medium", implStarts.indexOf(critical.id) < implStarts.indexOf(medium.id), implStarts.join(","));
  check("all three eventually finish", [low, medium, critical].every((t) => isTerminal(ph(t.id))));
}

// 6 ───────────────────────────────────────────────
section("6. Backlog + sprint");
{
  const titles = new Set(TASK_BACKLOG.map((t) => t.title));
  check("≥ 15 backlog tasks with unique titles", TASK_BACKLOG.length >= 15 && titles.size === TASK_BACKLOG.length, `${TASK_BACKLOG.length}`);
  const generic = TASK_BACKLOG.filter((t) => templateFor(t.title, t.description) === GENERIC_TEMPLATE);
  check("≤ 2 fall through to the generic template", generic.length <= 2, generic.map((t) => t.title).join("; "));

  const engine = new SimulationEngine({ now: () => 0 });
  engine.start();
  const ids = SPRINT_TASKS.map((t) => engine.submitTask(t).id);
  // Watch how close any two robots come all sprint long (a robot on the last stretch to its own spot excepted).
  let closest = { d: Infinity, at: "" };
  const arriving = (a: { position: Vec2; path: Vec2[] }) => a.path.length > 0 && Math.hypot(a.path.at(-1)!.x - a.position.x, a.path.at(-1)!.z - a.position.z) < 0.9;
  while (!ids.every((id) => isTerminal(engine.getTask(id)!.phase)) && engine.getClock() < 3000) {
    engine.tick(DT);
    const agents = engine.snapshot().agents;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i]!;
        const b = agents[j]!;
        if (arriving(a) || arriving(b)) continue;
        const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        if (d < closest.d) closest = { d, at: `${a.id}–${b.id} at ${engine.getClock().toFixed(1)} s` };
      }
    }
  }
  check("robots never walk into each other: ≥ 0.6 m apart all sprint long", closest.d >= 0.6, `${closest.d.toFixed(2)} m, ${closest.at}`);
  const tasks = ids.map((id) => engine.getTask(id)!);
  check("8-task sprint terminates", tasks.length === 8 && tasks.every((t) => isTerminal(t.phase)), `at ${engine.getClock().toFixed(0)} s`);
  const hotfix = tasks.find((t) => t.title === HOTFIX_TITLE)!;
  check("scripted hot-fix ends done at iteration 3", hotfix.phase === "done" && hotfix.iteration === 3, `${hotfix.phase} it${hotfix.iteration}`);
  const migration = tasks.find((t) => t.title === MIGRATION_TITLE)!;
  check("scripted migration ends failed", migration.phase === "failed", migration.phase);
  const completed = tasks.filter((t) => t.phase === "done").length;
  check("≥ 5 of 8 complete", completed >= 5, `${completed}`);
  check("every task has subtasks and findings", tasks.every((t) => t.subtasks.length > 0 && t.findings.length > 0));
  console.log(`    (sprint finished at ${engine.getClock().toFixed(1)} sim s, ${completed}/8 done)`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
