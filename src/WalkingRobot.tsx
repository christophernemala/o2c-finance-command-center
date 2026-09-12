import { useEffect, useRef } from "react";
import * as THREE from "three";

export function WalkingRobot({ compact = false }: { compact?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071b2f, 8, 22);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    camera.position.set(compact ? 3.6 : 4.2, compact ? 2.1 : 2.4, compact ? 5.2 : 6.1);
    camera.lookAt(0, 1.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x071b2f, 1.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x20e3ff, 0.55);
    rim.position.set(-5, 3, -2);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b2742, roughness: 0.92, metalness: 0.08 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(10, 24, 0x1a6aa8, 0x12385a);
    grid.position.y = 0.01;
    scene.add(grid);

    const metal = new THREE.MeshStandardMaterial({
      color: 0xc9d4e3,
      metalness: 0.72,
      roughness: 0.28
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x007aff,
      metalness: 0.45,
      roughness: 0.35,
      emissive: 0x003a7a,
      emissiveIntensity: 0.35
    });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x20e3ff,
      metalness: 0.2,
      roughness: 0.15,
      emissive: 0x20e3ff,
      emissiveIntensity: 0.8
    });

    function limb(w: number, h: number, d: number, mat = metal) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.castShadow = true;
      return mesh;
    }

    const robot = new THREE.Group();
    scene.add(robot);

    const hips = new THREE.Group();
    hips.position.y = 1.05;
    robot.add(hips);

    const torso = limb(0.62, 0.82, 0.38, accent);
    torso.position.y = 0.52;
    hips.add(torso);

    const chestLight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), visor);
    chestLight.position.set(0, 0.62, 0.2);
    hips.add(chestLight);

    const head = limb(0.36, 0.32, 0.32);
    head.position.y = 1.12;
    hips.add(head);
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), visor);
    visorMesh.position.set(0, 1.14, 0.16);
    hips.add(visorMesh);

    function makeLeg(side: number) {
      const root = new THREE.Group();
      root.position.set(side * 0.18, 0, 0);
      hips.add(root);
      const thigh = limb(0.18, 0.52, 0.2);
      thigh.position.y = -0.26;
      root.add(thigh);
      const shinPivot = new THREE.Group();
      shinPivot.position.y = -0.52;
      root.add(shinPivot);
      const shin = limb(0.16, 0.48, 0.18);
      shin.position.y = -0.24;
      shinPivot.add(shin);
      const foot = limb(0.22, 0.08, 0.32, accent);
      foot.position.set(0, -0.5, 0.06);
      shinPivot.add(foot);
      return { root, shinPivot };
    }

    function makeArm(side: number) {
      const root = new THREE.Group();
      root.position.set(side * 0.42, 0.78, 0);
      hips.add(root);
      const upper = limb(0.14, 0.42, 0.14);
      upper.position.y = -0.2;
      root.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.42;
      root.add(elbow);
      const lower = limb(0.12, 0.38, 0.12);
      lower.position.y = -0.18;
      elbow.add(lower);
      return { root, elbow };
    }

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    let frame = 0;
    let raf = 0;

    const resize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const tick = () => {
      frame += 1;
      const t = frame * 0.065;
      const stride = Math.sin(t) * 0.72;
      const opposite = Math.sin(t + Math.PI) * 0.72;
      leftLeg.root.rotation.x = stride;
      rightLeg.root.rotation.x = opposite;
      leftLeg.shinPivot.rotation.x = Math.max(0, -stride) * 0.85;
      rightLeg.shinPivot.rotation.x = Math.max(0, -opposite) * 0.85;
      leftArm.root.rotation.x = opposite * 0.55;
      rightArm.root.rotation.x = stride * 0.55;
      leftArm.elbow.rotation.x = -0.35;
      rightArm.elbow.rotation.x = -0.35;
      hips.rotation.y = Math.sin(t) * 0.08;
      hips.position.y = 1.05 + Math.abs(Math.sin(t * 2)) * 0.05;
      robot.position.z = Math.sin(t * 0.25) * 0.35;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [compact]);

  return <div ref={mountRef} className={compact ? "robot-stage compact" : "robot-stage"} aria-hidden="true" />;
}
