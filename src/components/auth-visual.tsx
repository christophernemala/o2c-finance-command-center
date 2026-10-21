"use client";
import { useEffect,useRef,useState } from "react";
import type { Material,Mesh } from "three";
import { Pause,Play } from "lucide-react";
/** Decorative scene only: no simulated balances, agent status or bank affiliation. */
export function AuthVisual(){
 const canvas=useRef<HTMLCanvasElement>(null);const [paused,setPaused]=useState(false);const [ready,setReady]=useState(false);const [reduced,setReduced]=useState(true);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 useEffect(()=>{
  if(!canvas.current || !("WebGLRenderingContext" in window))return;
  let disposed=false;let cleanup=()=>{};
  void import("three").then(T=>{
   if(disposed || !canvas.current)return;
   try{
    const renderer=new T.WebGLRenderer({canvas:canvas.current,alpha:true,antialias:true,powerPreference:"low-power"});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    const scene=new T.Scene();const camera=new T.PerspectiveCamera(36,1,.1,100);camera.position.set(0,3.4,8);camera.lookAt(0,.3,0);
    scene.add(new T.HemisphereLight(0xd7e9ff,0x3c5880,3));const light=new T.DirectionalLight(0xffffff,4);light.position.set(4,7,5);scene.add(light);
    const white=new T.MeshPhysicalMaterial({color:0xf3f8ff,metalness:.12,roughness:.2,clearcoat:1});const blue=new T.MeshPhysicalMaterial({color:0x287be4,metalness:.45,roughness:.2});
    const bank=new T.Group();scene.add(bank);
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,material:Material)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);bank.add(mesh);return mesh;};
    box(3.6,.18,1.9,0,-.75,0,white);box(3.25,.12,1.6,0,-.59,0,white);box(3.5,.18,1.8,0,1.1,0,white);
    for(let i=0;i<5;i++){const column=new T.Mesh(new T.CylinderGeometry(.13,.17,1.55,24),white);column.position.set((i-2)*.62,.25,.45);bank.add(column);}
    const roof=new T.Mesh(new T.ConeGeometry(2.03,.82,4),white);roof.rotation.y=Math.PI/4;roof.scale.z=.55;roof.position.y=1.6;bank.add(roof);
    const vault=new T.Mesh(new T.TorusGeometry(.46,.065,12,40),blue);vault.position.set(0,.1,.67);bank.add(vault);
    box(.04,.65,.04,0,.1,.71,blue);box(.65,.04,.04,0,.1,.71,blue);
    const orbit=new T.Group();scene.add(orbit);const ring=new T.Mesh(new T.TorusGeometry(2.65,.018,8,100),blue);ring.rotation.x=Math.PI/2.5;orbit.add(ring);
    const nodes:Mesh[]=[];for(let i=0;i<3;i++){const node=new T.Mesh(new T.OctahedronGeometry(.18),blue);orbit.add(node);nodes.push(node);}
    const robot=new T.Group();robot.position.set(2.2,.65,0);const head=new T.Mesh(new T.BoxGeometry(.65,.52,.45),white);robot.add(head);
    for(const x of [-.15,.15]){const eye=new T.Mesh(new T.SphereGeometry(.055,12,12),blue);eye.position.set(x,.03,.24);robot.add(eye);}scene.add(robot);
    const resize=()=>{const width=canvas.current?.clientWidth??400,height=canvas.current?.clientHeight??360;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();};resize();window.addEventListener("resize",resize);
    let frame=0;const draw=(time:number)=>{if(disposed)return;const t=paused||reduced?0:time*.00025;bank.rotation.y=-.2+Math.sin(t)*.1;robot.position.y=.65+Math.sin(t*2)*.12;nodes.forEach((n,i)=>{const a=t+i*Math.PI*2/3;n.position.set(Math.cos(a)*2.65,Math.sin(a)*.65,Math.sin(a)*1.7);});renderer.render(scene,camera);if(!paused&&!reduced&&!document.hidden)frame=requestAnimationFrame(draw);};
    const visibility=()=>{cancelAnimationFrame(frame);if(!document.hidden)draw(performance.now());};document.addEventListener("visibilitychange",visibility);draw(0);setReady(true);
    cleanup=()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",resize);document.removeEventListener("visibilitychange",visibility);scene.traverse(object=>{if(object instanceof T.Mesh)object.geometry.dispose();});white.dispose();blue.dispose();renderer.dispose();};
   }catch{/* The SVG remains visible when WebGL is unavailable. */}
  }).catch(()=>{ /* Keep the static bank illustration if the graphics chunk cannot load. */ });
  return()=>{disposed=true;cleanup();};
 },[paused,reduced]);
 return <div className="auth-scene"><div className="auth-scene-glow"/>
   <svg style={{visibility:ready?"hidden":"visible"}} className="auth-bank-fallback" viewBox="0 0 400 300" aria-hidden="true"><defs><linearGradient id="bank-face" x2="1" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#dbeaff"/></linearGradient></defs><ellipse cx="200" cy="250" rx="145" ry="26" fill="#075dcc0b"/><path d="M70 115 200 48l130 67v18H70Z" fill="url(#bank-face)" stroke="#accaf2"/>{[100,150,200,250,300].map(x=><rect key={x} x={x-9} y="135" width="18" height="95" rx="5" fill="url(#bank-face)" stroke="#accaf2"/>)}<path d="M67 230h266v18H67Z" fill="url(#bank-face)" stroke="#accaf2"/><circle cx="200" cy="175" r="33" fill="#f4f8ff" stroke="#075dcc" strokeWidth="5"/><path d="M200 153v44m-22-22h44" stroke="#075dcc" strokeWidth="4"/></svg>
   <canvas ref={canvas} className="auth-bank-canvas" aria-hidden="true"/>
   <span className="auth-scene-label scene-invoice">Receivables</span><span className="auth-scene-label scene-agent">Finance agents</span><span className="auth-scene-label scene-review">Human review</span>
   {!reduced&&<button type="button" className="scene-motion" onClick={()=>setPaused(!paused)} aria-label={paused?"Play banking animation":"Pause banking animation"}>{paused?<Play size={14}/>:<Pause size={14}/>}</button>}
 </div>;
}
