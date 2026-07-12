import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Fog,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three";

/**
 * Full-viewport 3D starfield (lazy-loaded — this module only ships when the
 * landing page renders it). The camera drifts forward as the page scrolls,
 * giving a "travelling through the galaxy" feel behind the content.
 * The parent gates rendering on WebGL support and prefers-reduced-motion.
 */
export default function Starfield() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.fog = new Fog(new Color("#060d0b"), 40, 220);

    const camera = new PerspectiveCamera(
      62,
      mount.clientWidth / mount.clientHeight,
      0.1,
      400,
    );
    camera.position.z = 60;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.error(e);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Three star layers: distant white dust, mid jade sparks, near gold flecks.
    const makeLayer = (count: number, spread: number, size: number, color: string, opacity: number) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.7;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      const material = new PointsMaterial({
        size,
        color: new Color(color),
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const points = new Points(geometry, material);
      scene.add(points);
      return { geometry, material, points };
    };

    const layers = [
      makeLayer(1400, 260, 0.5, "#cfe8dd", 0.85),
      makeLayer(320, 200, 1.1, "#2fc08d", 0.7),
      makeLayer(140, 170, 1.4, "#f2b13e", 0.6),
    ];

    let scrollTarget = window.scrollY;
    const onScroll = () => {
      scrollTarget = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let scrollSmooth = scrollTarget;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = (t - start) / 1000;
      // Ease scroll so the camera glides rather than jumps.
      scrollSmooth += (scrollTarget - scrollSmooth) * 0.06;
      camera.position.z = 60 - scrollSmooth * 0.03;
      camera.position.x = Math.sin(elapsed * 0.05) * 2;
      camera.rotation.z = scrollSmooth * 0.00004;

      layers[0].points.rotation.y = elapsed * 0.006;
      layers[1].points.rotation.y = -elapsed * 0.01;
      layers[2].points.rotation.y = elapsed * 0.014;
      // Gentle twinkle on the accent layers.
      layers[1].material.opacity = 0.55 + Math.sin(elapsed * 1.4) * 0.15;
      layers[2].material.opacity = 0.45 + Math.cos(elapsed * 1.1) * 0.15;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      for (const l of layers) {
        l.geometry.dispose();
        l.material.dispose();
      }
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} aria-hidden className="absolute inset-0" />;
}
