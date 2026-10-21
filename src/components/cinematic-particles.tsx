"use client";

import { useEffect, useRef, useState } from "react";

/** Decorative enhancement only: the artwork and authentication never depend on WebGL. */
export function CinematicParticles() {
  const host = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = matchMedia("(min-width: 960px) and (prefers-reduced-motion: no-preference)");
    let disposed = false;
    let release: (() => void) | undefined;
    let generation = 0;
    async function setup() {
      const version = ++generation;
      release?.(); release = undefined; setReady(false);
      if (!media.matches || paused) return;
      try {
        const THREE = await import("three");
        if (disposed || version !== generation) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
        camera.position.z = 1;
        const positions = new Float32Array(240 * 3);
        for (let i = 0; i < 240; i++) {
          positions[i * 3] = ((i * 0.61803398875) % 1) * 2 - 1;
          positions[i * 3 + 1] = ((i * 0.754877666) % 1) * 2 - 1;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { time: { value: 0 }, ratio: { value: renderer.getPixelRatio() } },
          vertexShader: `uniform float time; uniform float ratio; varying float warmth;
            void main() { vec3 p=position; warmth=step(0.82,fract(position.y*19.7));
              p.x=mod(p.x+1.0-time*(0.035+warmth*0.035),2.0)-1.0;
              p.y+=sin(time*0.4+position.x*9.0)*0.012;
              gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
              gl_PointSize=(2.0+warmth*2.0)*ratio; }`,
          fragmentShader: `varying float warmth; void main() {
            float a=smoothstep(0.5,0.0,length(gl_PointCoord-0.5));
            gl_FragColor=vec4(mix(vec3(0.15,0.5,1.0),vec3(1.0,0.32,0.06),warmth),a*0.6); }`,
        });
        scene.add(new THREE.Points(geometry, material));
        element!.appendChild(renderer.domElement);
        let frame = 0, visible = true, last = 0, lost = false;
        const draw = (now: number) => {
          material.uniforms.time.value += last ? Math.min((now - last) / 1000, 0.05) : 0;
          last = now; renderer.render(scene, camera); frame = requestAnimationFrame(draw);
        };
        const reconcile = () => {
          cancelAnimationFrame(frame); last = 0;
          if (!document.hidden && visible && !lost) frame = requestAnimationFrame(draw);
        };
        const resize = new ResizeObserver(() => { renderer.setSize(element!.clientWidth, element!.clientHeight); });
        resize.observe(element!);
        const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; reconcile(); });
        observer.observe(element!);
        const contextLost = (event: Event) => { event.preventDefault(); lost = true; reconcile(); setReady(false); };
        const contextRestored = () => { lost = false; setReady(true); reconcile(); };
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
        document.addEventListener("visibilitychange", reconcile);
        release = () => {
          cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect();
          document.removeEventListener("visibilitychange", reconcile);
          renderer.domElement.removeEventListener("webglcontextlost", contextLost);
          renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
          geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
        };
        setReady(true); reconcile();
      } catch { /* Static artwork remains available when WebGL is unsupported. */ }
    }
    void setup();
    media.addEventListener("change", setup);
    return () => { disposed = true; generation++; media.removeEventListener("change", setup); release?.(); };
  }, [paused]);
  return <><div ref={host} className="cinematic-particles" aria-hidden="true" />{(ready || paused) && <button type="button" className="cinematic-motion-control" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? "Play animation" : "Pause animation"}</button>}</>;
}
