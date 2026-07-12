import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Fog,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

export interface GalaxyNodeInput {
  kind: "step" | "milestone";
  id: string;
  title: string;
  /** "01"-style step number (unused for milestones). */
  badge: string;
  stageIndex: number;
  state: "done" | "current" | "todo" | "achieved" | "unlocked" | "locked";
}

interface Props {
  nodes: GalaxyNodeInput[];
  stageTitles: string[];
  onSelect: (node: GalaxyNodeInput) => void;
}

/** Scroll distance (px) that one node of travel corresponds to. */
const PX_PER_NODE = 340;

const NODE_STYLE: Record<
  GalaxyNodeInput["state"],
  { color: string; emissive: string; intensity: number; glow: number; pulse: boolean }
> = {
  done:     { color: "#2fc08d", emissive: "#2fc08d", intensity: 0.75, glow: 0.85, pulse: false },
  current:  { color: "#f2b13e", emissive: "#f2b13e", intensity: 1.0,  glow: 1.1,  pulse: true },
  todo:     { color: "#57707d", emissive: "#22333c", intensity: 0.35, glow: 0.22, pulse: false },
  achieved: { color: "#f2b13e", emissive: "#f2b13e", intensity: 1.1,  glow: 1.4,  pulse: false },
  unlocked: { color: "#d8b25e", emissive: "#a97f2a", intensity: 0.6,  glow: 0.7,  pulse: true },
  locked:   { color: "#46545c", emissive: "#1c262c", intensity: 0.25, glow: 0.14, pulse: false },
};

interface NodeEntry {
  mesh: Mesh<SphereGeometry | IcosahedronGeometry, MeshStandardMaterial>;
  glow: Sprite;
  baseScale: number;
  node: GalaxyNodeInput;
}

/** Soft radial glow texture, shared by every glow sprite (tinted per node). */
function makeGlowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** Crisp text label rendered to a canvas-backed sprite. */
function makeTextSprite(
  text: string,
  { color = "#dbe9e2", fontSize = 26, bold = false, worldHeight = 2.1 } = {},
): { sprite: Sprite; dispose: () => void } {
  const dpr = 2;
  const font = `${bold ? "700" : "600"} ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const textWidth = Math.min(measure.measureText(text).width, 420);
  const pad = 10;
  const w = Math.ceil((textWidth + pad * 2) * dpr);
  const h = Math.ceil((fontSize + pad * 2) * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillText(text, pad, (fontSize + pad * 2) / 2, 420);
  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.scale.set((worldHeight * w) / h, worldHeight, 1);
  return {
    sprite,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The 3D galaxy roadmap. Renders a fixed full-viewport canvas plus a tall
 * transparent spacer that gives the page real scroll length — scrolling
 * flies the camera along a curved path of planets (steps) and radiant
 * milestones. Clicking a body opens its detail panel via onSelect.
 * Lazy-loaded; the parent gates on WebGL + prefers-reduced-motion.
 */
export default function GalaxyRoadmap({ nodes, stageTitles, onSelect }: Props) {
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const hudStepRef = useRef<HTMLSpanElement | null>(null);
  const hudPctRef = useRef<HTMLSpanElement | null>(null);

  // Latest props, readable from inside the long-lived scene effect.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const idsKey = nodes.map((n) => n.id).join("|");
  const statesKey = nodes.map((n) => n.state).join("|");

  const entriesRef = useRef<Map<string, NodeEntry>>(new Map());

  // Build the scene once per node-set; states are patched by the effect below.
  useEffect(() => {
    const host = canvasHostRef.current;
    const spacer = spacerRef.current;
    const list = nodesRef.current;
    if (!host || !spacer || list.length === 0) return;

    const disposables: Array<{ dispose: () => void }> = [];
    const scene = new Scene();
    scene.fog = new Fog(new Color("#050b09"), 45, 200);

    const camera = new PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.1, 500);

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch (e) {
      console.error(e);
      return;
    }
    renderer.setClearColor(new Color("#050b09"), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    scene.add(new AmbientLight(0xbfd8cf, 0.55));
    const camLight = new PointLight(0xffffff, 140, 90);
    scene.add(camLight);

    // --- Path through the galaxy -------------------------------------
    const pathPoints = list.map(
      (_, i) =>
        new Vector3(
          Math.sin(i * 0.62) * 15,
          Math.cos(i * 0.38) * 5.5,
          -i * 24,
        ),
    );
    // Lead-in/out so the camera starts before node 0 and ends past the last.
    const first = pathPoints[0];
    const last = pathPoints[pathPoints.length - 1];
    const curvePts = [
      first.clone().add(new Vector3(0, 2, 34)),
      ...pathPoints,
      last.clone().add(new Vector3(0, 2, -30)),
    ];
    const curve = new CatmullRomCurve3(curvePts, false, "catmullrom", 0.4);

    const lineGeometry = new BufferGeometry().setFromPoints(curve.getPoints(300));
    const lineMaterial = new LineBasicMaterial({
      color: new Color("#2fc08d"),
      transparent: true,
      opacity: 0.28,
    });
    scene.add(new Line(lineGeometry, lineMaterial));
    disposables.push(lineGeometry, lineMaterial);

    // --- Nodes ---------------------------------------------------------
    const glowTexture = makeGlowTexture();
    disposables.push(glowTexture);
    const stepGeometry = new SphereGeometry(1.15, 28, 28);
    const milestoneGeometry = new IcosahedronGeometry(1.7, 0);
    disposables.push(stepGeometry, milestoneGeometry);

    const entries = entriesRef.current;
    entries.clear();
    const pickables: Mesh[] = [];

    list.forEach((node, i) => {
      const position = pathPoints[i];
      const isMilestone = node.kind === "milestone";
      const material = new MeshStandardMaterial({
        color: new Color("#ffffff"),
        roughness: 0.55,
        metalness: 0.25,
        flatShading: isMilestone,
      });
      disposables.push(material);
      const mesh = new Mesh(isMilestone ? milestoneGeometry : stepGeometry, material);
      mesh.position.copy(position);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      pickables.push(mesh);

      const glowMaterial = new SpriteMaterial({
        map: glowTexture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(glowMaterial);
      const glow = new Sprite(glowMaterial);
      glow.position.copy(position);
      glow.scale.setScalar(isMilestone ? 9 : 6.5);
      scene.add(glow);

      const label = makeTextSprite(
        isMilestone
          ? `★ ${truncate(node.title, 26)}`
          : `${node.badge} · ${truncate(node.title, 26)}`,
        { color: isMilestone ? "#f4c878" : "#dbe9e2" },
      );
      label.sprite.position.copy(position).add(new Vector3(0, isMilestone ? 3.4 : 2.7, 0));
      scene.add(label.sprite);
      disposables.push(label);

      entries.set(node.id, {
        mesh: mesh as NodeEntry["mesh"],
        glow,
        baseScale: isMilestone ? 1.15 : 1,
        node,
      });
    });

    // Stage banners above the first node of each stage.
    const seenStages = new Set<number>();
    list.forEach((node, i) => {
      if (seenStages.has(node.stageIndex)) return;
      seenStages.add(node.stageIndex);
      const title = stageTitles[node.stageIndex] ?? `Stage ${node.stageIndex + 1}`;
      const banner = makeTextSprite(
        `STAGE ${node.stageIndex + 1} — ${title.toUpperCase()}`,
        { color: "#2fc08d", fontSize: 30, bold: true, worldHeight: 2.6 },
      );
      banner.sprite.position.copy(pathPoints[i]).add(new Vector3(0, 7.5, 0));
      scene.add(banner.sprite);
      disposables.push(banner);
    });

    // --- Backdrop: stars + nebulae --------------------------------------
    const starCount = 1100;
    const starPositions = new Float32Array(starCount * 3);
    const minZ = last.z - 140;
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 320;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 220;
      starPositions[i * 3 + 2] = 60 + Math.random() * (minZ - 60);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
    const starMaterial = new PointsMaterial({
      size: 0.6,
      color: new Color("#cfe8dd"),
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new Points(starGeometry, starMaterial));
    disposables.push(starGeometry, starMaterial);

    const nebulaColors = ["#2fc08d", "#7c5cff", "#f2b13e"];
    nebulaColors.forEach((c, i) => {
      const m = new SpriteMaterial({
        map: glowTexture,
        color: new Color(c),
        transparent: true,
        opacity: 0.1,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(m);
      const s = new Sprite(m);
      s.scale.setScalar(90);
      s.position.set((i - 1) * 55, (i % 2 ? -1 : 1) * 26, -60 - i * ((last.z * -1) / 3.2));
      scene.add(s);
    });

    // --- Scroll → camera travel ----------------------------------------
    let progress = 0;
    let progressSmooth = 0;
    const readScroll = () => {
      const rect = spacer.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      progress = travel > 0 ? Math.min(Math.max(-rect.top / travel, 0), 1) : 0;
    };
    window.addEventListener("scroll", readScroll, { passive: true });
    readScroll();

    // Start the journey at the learner's current node.
    const currentIndex = list.findIndex((n) => n.state === "current" || n.state === "unlocked");
    if (currentIndex > 0) {
      const rect = spacer.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const top =
        rect.top + window.scrollY + (currentIndex / Math.max(list.length - 1, 1)) * travel * 0.96;
      window.scrollTo({ top, behavior: "auto" });
      readScroll();
    }

    // --- Picking ---------------------------------------------------------
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let downX = 0;
    let downY = 0;
    const pick = (clientX: number, clientY: number): Mesh | null => {
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      return (hit?.object as Mesh) ?? null;
    };
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      // Ignore drags/scroll gestures and clicks on real UI (canvas is
      // pointer-events:none, so anything interactive handled its own click).
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("a, button, input, textarea, [role='dialog']")) return;
      const hit = pick(e.clientX, e.clientY);
      if (!hit) return;
      const node = nodesRef.current.find((n) => n.id === hit.userData.nodeId);
      if (node) onSelectRef.current(node);
    };
    const onPointerMove = (e: PointerEvent) => {
      const overNode = pick(e.clientX, e.clientY) !== null;
      document.body.style.cursor = overNode ? "pointer" : "";
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // --- Render loop -------------------------------------------------
    let raf = 0;
    const startTime = performance.now();
    const up = new Vector3(0, 1, 0);
    const tick = (t: number) => {
      const elapsed = (t - startTime) / 1000;
      progressSmooth += (progress - progressSmooth) * 0.07;

      const camT = Math.min(Math.max(progressSmooth, 0), 1) * 0.985;
      const p = curve.getPointAt(camT);
      const tangent = curve.getTangentAt(camT);
      camera.position.copy(p).sub(tangent.clone().multiplyScalar(15)).add(
        up.clone().multiplyScalar(5.5),
      );
      camera.lookAt(curve.getPointAt(Math.min(camT + 0.035, 1)));
      camLight.position.copy(camera.position);

      // Idle motion + pulses.
      for (const entry of entriesRef.current.values()) {
        entry.mesh.rotation.y = elapsed * (entry.node.kind === "milestone" ? 0.5 : 0.25);
        const style = NODE_STYLE[entry.node.state];
        if (style.pulse) {
          const s = entry.baseScale * (1 + Math.sin(elapsed * 3) * 0.1);
          entry.mesh.scale.setScalar(s);
          entry.glow.material.opacity =
            style.glow * (0.75 + Math.sin(elapsed * 3) * 0.25);
        }
      }

      // HUD (written directly — no React re-renders during scroll).
      const n = nodesRef.current.length;
      const idx = Math.min(Math.round(progressSmooth * (n - 1)) + 1, n);
      if (hudStepRef.current) hudStepRef.current.textContent = `${idx} / ${n}`;
      if (hudPctRef.current)
        hudPctRef.current.textContent = `${Math.round(progressSmooth * 100)}%`;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      document.body.style.cursor = "";
      for (const d of disposables) d.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      entriesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Patch node colors when statuses change (marking steps done, milestones…).
  useEffect(() => {
    for (const node of nodes) {
      const entry = entriesRef.current.get(node.id);
      if (!entry) continue;
      entry.node = node;
      const style = NODE_STYLE[node.state];
      entry.mesh.material.color.set(style.color);
      entry.mesh.material.emissive.set(style.emissive);
      entry.mesh.material.emissiveIntensity = style.intensity;
      entry.glow.material.color.set(style.color);
      entry.glow.material.opacity = style.glow;
      if (!style.pulse) entry.mesh.scale.setScalar(entry.baseScale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey, idsKey]);

  return (
    <div>
      {/* Fixed scene behind the page. pointer-events stay OFF so scrolling,
          header, footer, and overlays all keep working; picking happens via
          window-level listeners + raycasting. */}
      <div ref={canvasHostRef} aria-hidden className="pointer-events-none fixed inset-0 z-0" />

      {/* Transparent spacer: gives the journey its scroll length. */}
      <div
        ref={spacerRef}
        aria-hidden
        style={{ height: `${nodes.length * PX_PER_NODE + 400}px` }}
      />

      {/* HUD */}
      <div className="pointer-events-none fixed bottom-24 left-4 z-10 flex flex-col gap-2 md:bottom-8">
        <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">
            Journey
          </div>
          <div className="mt-0.5 font-display text-lg font-bold text-white">
            <span ref={hudStepRef}>1 / {nodes.length}</span>
            <span className="ml-2 font-mono text-xs font-normal text-jade">
              <span ref={hudPctRef}>0%</span>
            </span>
          </div>
        </div>
        <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-white/60 backdrop-blur sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2fc08d]" /> done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f2b13e]" /> you are here
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#57707d]" /> ahead
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[#f4c878]">★</span> milestone
          </span>
        </div>
      </div>
      <p className="pointer-events-none fixed bottom-24 right-4 z-10 hidden rounded-full border border-white/10 bg-black/45 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-white/60 backdrop-blur md:bottom-8 md:block">
        Scroll to travel · click a planet to open it
      </p>
    </div>
  );
}
