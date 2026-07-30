"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./game.css";

const MISSIONS = [
  { word: "바다", pieces: ["ㅂ", "ㅏ", "ㄷ", "ㅏ"], hint: "넓고 푸른 물결" },
  { word: "파도", pieces: ["ㅍ", "ㅏ", "ㄷ", "ㅗ"], hint: "철썩이며 밀려오는 물결" },
  { word: "하늘", pieces: ["ㅎ", "ㅏ", "ㄴ", "ㅡ", "ㄹ"], hint: "돛 위로 펼쳐진 푸른 공간" },
  { word: "고래", pieces: ["ㄱ", "ㅗ", "ㄹ", "ㅐ"], hint: "바다에서 가장 큰 친구" },
  { word: "보물", pieces: ["ㅂ", "ㅗ", "ㅁ", "ㅜ", "ㄹ"], hint: "섬에 숨겨진 반짝이는 것" },
];

type GameObject = { mesh: THREE.Group; kind: "jamo" | "rock"; char: string; hit: boolean; reject?: number; velocity?: THREE.Vector3 };
type GameState = { x: number; health: number; score: number; streak: number; mission: number; collected: string[]; running: boolean; muted: boolean; speed: number; completed: boolean };
type Flight = { id: number; char: string; sx: number; sy: number; tx: number; ty: number };
const initialState = (): GameState => ({ x: 0, health: 5, score: 0, streak: 0, mission: 0, collected: [], running: true, muted: false, speed: 0.097, completed: false });

function makeJamoTexture(char: string) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const glow = x.createRadialGradient(128, 128, 18, 128, 128, 126);
  glow.addColorStop(0, "rgba(255,252,220,1)"); glow.addColorStop(.58, "rgba(255,246,195,1)");
  glow.addColorStop(.61, "rgba(35,104,110,1)"); glow.addColorStop(.72, "rgba(95,255,224,.95)"); glow.addColorStop(1, "rgba(2,72,86,0)");
  x.fillStyle = glow; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "#123f4a"; x.lineWidth = 10; x.beginPath(); x.arc(128,128,76,0,Math.PI*2); x.stroke();
  x.font = "900 112px 'Arial Black',sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineJoin="round";x.strokeStyle="#092d39";x.lineWidth=14;x.strokeText(char,128,135);
  x.fillStyle = "#ffffff";x.shadowColor="#fff";x.shadowBlur=3;x.fillText(char,128,135);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function makeBoat() {
  const boat = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4b2117, roughness: .48, metalness: .04, side:THREE.DoubleSide });
  const warmWood = new THREE.MeshStandardMaterial({ color: 0xa95f2c, roughness: .4, metalness: .03 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd69448, roughness: .36 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x21100c, roughness: .68 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x7b5233, roughness: .88 });
  const sailRope = new THREE.MeshStandardMaterial({ color: 0xb98a5b, roughness: .92 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2b84f, roughness: .24, metalness: .66 });
  const glass = new THREE.MeshStandardMaterial({color:0x8be5e4,emissive:0x286d75,emissiveIntensity:.7,roughness:.18,metalness:.22});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,pos:[number,number,number],rot:[number,number,number]=[0,0,0])=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;boat.add(m);return m};
  const addBeam=(from:[number,number,number],to:[number,number,number],radius:number,mat:THREE.Material)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),direction=b.clone().sub(a),beam=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),8),mat);
    beam.position.copy(a).add(b).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());beam.castShadow=true;boat.add(beam);return beam;
  };
  const makeSailTexture=(top:string,bottom:string,seam:string)=>{
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=512;const ctx=canvas.getContext("2d")!,gradient=ctx.createLinearGradient(0,0,256,512);
    gradient.addColorStop(0,top);gradient.addColorStop(.52,bottom);gradient.addColorStop(1,top);ctx.fillStyle=gradient;ctx.fillRect(0,0,256,512);
    for(let x=18;x<256;x+=24){ctx.fillStyle=`rgba(255,255,255,${x%48===18?.045:.022})`;ctx.fillRect(x,0,2,512)}
    ctx.strokeStyle=seam;ctx.lineWidth=2;ctx.globalAlpha=.32;
    for(let y=72;y<512;y+=82){ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(128,y+7,256,y);ctx.stroke()}
    ctx.globalAlpha=.14;for(let y=4;y<512;y+=7){ctx.fillStyle="#fff";ctx.fillRect(0,y,256,1)}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
  };
  const hullGeo = new THREE.BufferGeometry();
  const v = new Float32Array([-1.3,0,2.1,1.3,0,2.1,-1.62,0,.15,1.62,0,.15,-.16,-.05,-2.72,.16,-.05,-2.72,-.7,-.84,1.75,.7,-.84,1.75,-.88,-.98,0,.88,-.98,0,-.07,-.62,-2.44,.07,-.62,-2.44]);
  const idx=[0,6,2,2,6,8,2,8,4,4,8,10,1,3,7,3,9,7,3,5,9,5,11,9,0,1,6,1,7,6,4,10,5,5,10,11,6,7,8,7,9,8,8,9,10,9,11,10];
  hullGeo.setAttribute("position",new THREE.BufferAttribute(v,3)); hullGeo.setIndex(idx); hullGeo.computeVertexNormals();
  add(hullGeo,wood,[0,0,0]);
  const deckGeo=new THREE.BufferGeometry();deckGeo.setAttribute("position",new THREE.Float32BufferAttribute([-1.27,.035,2,1.27,.035,2,-1.56,.035,.15,1.56,.035,.15,-.14,.035,-2.55,.14,.035,-2.55],3));deckGeo.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);deckGeo.computeVertexNormals();add(deckGeo,warmWood,[0,0,0]);
  for(const side of [-1,1]){
    addBeam([side*1.35,.18,1.68],[side*1.55,.2,.1],.055,rim);addBeam([side*1.55,.2,.1],[side*.24,.16,-2.42],.05,rim);
    for(const z of [1.45,.78,.1,-.6,-1.28])addBeam([side*(z<-1?.78:1.42),.15,z],[side*(z<-1?.72:1.42),.58,z],.032,rim);
    addBeam([side*1.28,-.22,1.78],[side*1.5,-.24,.08],.037,warmWood);addBeam([side*1.5,-.24,.08],[side*.24,-.18,-2.42],.034,warmWood);
    addBeam([side*.86,-.57,1.62],[side*1.08,-.62,.04],.03,rim);addBeam([side*1.08,-.62,.04],[side*.16,-.45,-2.35],.028,rim);
  }
  add(new THREE.BoxGeometry(2.24,.075,.08),gold,[0,-.17,2.04]);for(const x of [-.62,.62]){add(new THREE.CircleGeometry(.12,16),glass,[x,-.33,2.09]);add(new THREE.TorusGeometry(.14,.027,7,18),gold,[x,-.33,2.1])}
  addBeam([-1.07,-.2,2.04],[-1.07,.42,2.04],.026,gold);addBeam([1.07,-.2,2.04],[1.07,.42,2.04],.026,gold);addBeam([-1.06,.4,2.04],[1.06,.4,2.04],.022,rim);
  const cabin=add(new THREE.CylinderGeometry(.92,1.1,.72,4),rim,[0,.43,1.15],[0,Math.PI/4,0]);cabin.scale.set(1.22,1,.58);
  const cabinRoof=add(new THREE.CylinderGeometry(1.03,1.08,.13,4),dark,[0,.84,1.15],[0,Math.PI/4,0]);cabinRoof.scale.set(1.27,1,.61);
  for(const x of [-.36,.36]){add(new THREE.BoxGeometry(.27,.31,.025),glass,[x,.47,1.69]);add(new THREE.BoxGeometry(.33,.045,.032),gold,[x,.64,1.7]);add(new THREE.BoxGeometry(.045,.36,.032),gold,[x,.47,1.7])}
  for(const x of [-1.05,-.52,0,.52,1.05])addBeam([x,.84,1.72],[x,1.16,1.72],.021,rim);addBeam([-1.08,1.16,1.72],[1.08,1.16,1.72],.024,rim);
  add(new THREE.BoxGeometry(.76,.055,.68),dark,[0,.08,-1.03]);for(const x of [-.27,-.09,.09,.27])add(new THREE.BoxGeometry(.035,.035,.6),rim,[x,.12,-1.03]);for(const z of [-1.25,-1.03,-.81])add(new THREE.BoxGeometry(.66,.035,.03),rim,[0,.125,z]);
  for(const x of [-.78,.78]){add(new THREE.CylinderGeometry(.27,.31,.52,14),dark,[x,.37,-.62]);add(new THREE.TorusGeometry(.29,.035,7,18),gold,[x,.43,-.62],[Math.PI/2,0,0])}
  addBeam([0,.1,.02],[0,5.52,.02],.075,rim);
  const sails:THREE.Mesh[]=[];
  const sailPanel=(side:number,width:number,bottom:number,top:number,mat:THREE.Material)=>{
    const rows=7,columns=4,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let row=0;row<=rows;row++){
      const t=row/rows,innerX=side*.075,outerX=side*(.135+.065*(1-t)+width*Math.pow(1-t,.72)),innerY=bottom+(top-bottom)*t,outerY=innerY+.17*(1-t)-.04*t;
      for(let column=0;column<=columns;column++){const u=column/columns;positions.push(innerX+(outerX-innerX)*u,innerY+(outerY-innerY)*u,.04+Math.sin(Math.PI*u)*Math.sin(Math.PI*t)*.18);uvs.push(u,t)}
    }
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const a=row*(columns+1)+column,b=a+1,c=a+columns+2,d=a+columns+1;indices.push(a,d,b,b,d,c)}
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;boat.add(mesh);sails.push(mesh);return mesh;
  };
  const redSail=new THREE.MeshPhysicalMaterial({color:0xffffff,map:makeSailTexture("#e05a3c","#ae3828","rgba(92,20,17,.65)"),side:THREE.DoubleSide,roughness:.68,sheen:1,sheenColor:0xffb288,sheenRoughness:.62});
  const creamSail=new THREE.MeshPhysicalMaterial({color:0xffffff,map:makeSailTexture("#fff0cf","#dcbf91","rgba(105,76,46,.5)"),side:THREE.DoubleSide,roughness:.72,sheen:1,sheenColor:0xfff2d4,sheenRoughness:.66});
  sailPanel(-1,1.78,1.31,4.68,redSail);sailPanel(1,1.78,1.31,4.68,creamSail);
  addBeam([-.08,4.69,.055],[-1.88,1.47,.09],.012,sailRope);addBeam([.08,4.69,.055],[1.88,1.47,.09],.012,sailRope);
  addBeam([-.07,1.32,.035],[-1.84,1.47,.075],.014,sailRope);addBeam([.07,1.32,.035],[1.84,1.47,.075],.014,sailRope);
  const wheelZ=.32;add(new THREE.TorusGeometry(.39,.05,8,24),gold,[0,1.08,wheelZ],[Math.PI/2,0,0]);for(let i=0;i<6;i++){const a=i*Math.PI/3;addBeam([0,1.08,wheelZ],[Math.cos(a)*.36,1.08+Math.sin(a)*.36,wheelZ],.018,gold)}
  addBeam([0,5.48,.02],[0,6.2,.02],.035,rim);const flagGeo=new THREE.BufferGeometry();flagGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,6.18,.03,0,5.64,.03,.92,5.94,.03],3));flagGeo.computeVertexNormals();add(flagGeo,redSail,[0,0,0]);
  const lampMat=new THREE.MeshStandardMaterial({color:0xffd36b,emissive:0xff8a20,emissiveIntensity:2.2});for(const x of [-1,1]){add(new THREE.SphereGeometry(.11,12,9),lampMat,[x,.62,1.92]);const lamp=new THREE.PointLight(0xffa84d,1.5,6);lamp.position.set(x,.62,1.92);boat.add(lamp)}
  add(new THREE.ConeGeometry(.2,.72,14),gold,[0,-.12,-2.82],[-Math.PI/2,0,0]);
  boat.userData.sails=sails;boat.scale.setScalar(.9); return boat;
}

function useSound() {
  const ref=useRef<AudioContext|null>(null);
  return useCallback((type:"collect"|"hit"|"complete")=>{
    const ac=ref.current||(ref.current=new AudioContext()); const now=ac.currentTime;
    const notes=type==="complete"?[523,659,784,1047]:[type==="hit"?100:660]; const gain=ac.createGain();gain.connect(ac.destination);
    gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.65);
    notes.forEach((n,i)=>{const o=ac.createOscillator();o.type=type==="hit"?"sawtooth":"sine";o.frequency.value=n;o.connect(gain);o.start(now+i*.1);o.stop(now+i*.1+.2)});
  },[]);
}

export default function Home(){
  const mount=useRef<HTMLDivElement>(null), game=useRef<GameState>(initialState()), objects=useRef<GameObject[]>([]), keys=useRef({left:false,right:false});
  const startAudio=useRef<()=>void>(()=>{});
  const [ui,setUi]=useState({...initialState(),toast:"빛나는 자모를 순서대로 모아보세요!"});
  const [flights,setFlights]=useState<Flight[]>([]);
  const [impactFx,setImpactFx]=useState(0),[mistakeFx,setMistakeFx]=useState<{id:number;char:string;need:string}|null>(null);
  const [audioReady,setAudioReady]=useState(false);
  const sound=useSound();
  const sync=useCallback((toast?:string)=>{const s=game.current;setUi(v=>({...s,collected:[...s.collected],toast:toast??v.toast}));},[]);
  const launchGlyph=useCallback((char:string,index:number,world:THREE.Vector3,camera:THREE.Camera,host:HTMLElement)=>{
    const p=world.clone().project(camera),box=host.getBoundingClientRect(),slot=document.querySelector(`[data-slot="${index}"]`)?.getBoundingClientRect();
    const sx=box.left+(p.x*.5+.5)*box.width,sy=box.top+(-p.y*.5+.5)*box.height;
    const tx=slot?slot.left+slot.width/2:innerWidth/2,ty=slot?slot.top+slot.height/2:110;
    setFlights(v=>[...v,{id:Date.now()+Math.random(),char,sx,sy,tx,ty}]);
  },[]);

  useEffect(()=>{
    let ac:AudioContext|null=null,master:GainNode|null=null,timer=0,bgmSource:AudioBufferSourceNode|null=null;
    const startAmbient=async()=>{if(ac){if(ac.state==="suspended")await ac.resume();setAudioReady(ac.state==="running");return}ac=new AudioContext();master=ac.createGain();master.gain.value=game.current.muted?0:.68;master.connect(ac.destination);
      const music=ac.createGain();music.gain.value=.24;music.connect(master);
      timer=window.setInterval(()=>{if(ac&&master)master.gain.setTargetAtTime(game.current.muted?0:.68,ac.currentTime,.12)},160);await ac.resume();setAudioReady(ac.state==="running");
      try{const response=await fetch("/audio/geulbada-bgm.wav");if(!response.ok)throw new Error("Background music failed to load");const buffer=await ac.decodeAudioData(await response.arrayBuffer());if(ac.state==="closed")return;bgmSource=ac.createBufferSource();bgmSource.buffer=buffer;bgmSource.loop=true;bgmSource.connect(music);bgmSource.start()}catch(error){console.warn(error)}
    };
    startAudio.current=()=>{void startAmbient()};
    window.addEventListener("pointerdown",startAmbient,{once:true});window.addEventListener("keydown",startAmbient,{once:true});
    return()=>{window.removeEventListener("pointerdown",startAmbient);window.removeEventListener("keydown",startAmbient);if(timer)clearInterval(timer);try{bgmSource?.stop()}catch{}ac?.close()};
  },[]);

  useEffect(()=>{
    const host=mount.current!; const scene=new THREE.Scene(); scene.background=new THREE.Color(0x071b38);scene.fog=new THREE.FogExp2(0x285f68,.008);
    const camera=new THREE.PerspectiveCamera(56,host.clientWidth/host.clientHeight,.1,220);camera.position.set(0,9.2,19);camera.lookAt(0,.6,-11);
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});renderer.setSize(host.clientWidth,host.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uTime:{value:0}},vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
      uniform float uTime;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.;n+=noise(p)*.55;p*=2.03;n+=noise(p)*.28;p*=2.01;n+=noise(p)*.14;return n;}
      void main(){float h=clamp(vDir.y*.75+.35,0.,1.);vec3 night=vec3(.015,.045,.14);vec3 violet=vec3(.23,.11,.30);vec3 coral=vec3(1.,.29,.16);vec3 gold=vec3(1.,.67,.25);vec3 col=mix(coral,violet,smoothstep(.05,.48,h));col=mix(col,night,smoothstep(.42,.95,h));float horizon=exp(-pow((vDir.y+.02)*7.,2.));col+=gold*horizon*.72;
      vec2 uv=vec2(atan(vDir.z,vDir.x)*1.7+uTime*.006,vDir.y*7.);float cloud=fbm(uv*1.5+vec2(uTime*.012,0.));cloud=smoothstep(.48,.76,cloud)*(1.-smoothstep(.58,.9,h));col=mix(col,vec3(1.,.48,.3),cloud*.38);col+=vec3(1.,.73,.42)*pow(cloud,3.)*.32;
      vec2 starCell=floor(vec2(atan(vDir.z,vDir.x)*150.,vDir.y*170.));float star=step(.994,hash(starCell))*smoothstep(.35,.82,h);star*=.45+.55*sin(uTime*2.+hash(starCell)*20.);col+=vec3(1.,.9,.72)*star;
      gl_FragColor=vec4(col,1.);}
    `});const sky=new THREE.Mesh(new THREE.SphereGeometry(175,48,32),skyMat);scene.add(sky);
    scene.add(new THREE.HemisphereLight(0x9bdcff,0x082338,2.1));const sunLight=new THREE.DirectionalLight(0xffc273,4);sunLight.position.set(-18,25,-35);sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-32;sunLight.shadow.camera.right=32;sunLight.shadow.camera.top=32;sunLight.shadow.camera.bottom=-24;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=100;sunLight.shadow.bias=-.0005;sunLight.shadow.normalBias=.025;scene.add(sunLight);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(4,32,16),new THREE.MeshBasicMaterial({color:0xffc45e}));sun.position.set(-25,18,-95);scene.add(sun);
    const oceanGeo=new THREE.PlaneGeometry(150,230,140,170);
    const oceanMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uDeep:{value:new THREE.Color(0x032f45)},uMid:{value:new THREE.Color(0x087b8c)},uHorizon:{value:new THREE.Color(0x52aeb2)},uFoam:{value:new THREE.Color(0xdff7f2)},uSun:{value:new THREE.Color(0xffc879)}},vertexShader:`
      uniform float uTime;varying float vHeight;varying float vSlope;varying vec3 vWorld;varying vec3 vNormalW;
      void main(){
        vec3 p=position;
        float q1=dot(p.xy,vec2(.135,.052))+uTime*.82;
        float q2=dot(p.xy,vec2(-.072,.128))-uTime*.66;
        float q3=dot(p.xy,vec2(.245,.195))+uTime*1.28;
        float q4=dot(p.xy,vec2(-.46,.31))-uTime*1.72;
        float h=sin(q1)*.36+sin(q2)*.27+sin(q3)*.095+sin(q4)*.032;
        float dx=cos(q1)*.0486-cos(q2)*.0194+cos(q3)*.0233-cos(q4)*.0147;
        float dy=cos(q1)*.0187+cos(q2)*.0346+cos(q3)*.0185+cos(q4)*.0099;
        p.z+=h;
        p.x+=cos(q1)*.055+cos(q3)*.018;
        p.y+=cos(q2)*.045;
        vHeight=h;
        vSlope=length(vec2(dx,dy));
        vNormalW=normalize(mat3(modelMatrix)*vec3(-dx,-dy,1.));
        vec4 world=modelMatrix*vec4(p,1.);
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,fragmentShader:`
      uniform vec3 uDeep;uniform vec3 uMid;uniform vec3 uHorizon;uniform vec3 uFoam;uniform vec3 uSun;uniform float uTime;
      varying float vHeight;varying float vSlope;varying vec3 vWorld;varying vec3 vNormalW;
      void main(){
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 normal=normalize(vNormalW);
        float rippleX=sin(vWorld.x*1.18+vWorld.z*.37+uTime*1.55)*.032+sin(vWorld.x*2.35-vWorld.z*.22-uTime*1.92)*.014;
        float rippleZ=sin(vWorld.z*1.04-vWorld.x*.29-uTime*1.34)*.03+sin(vWorld.z*2.08+vWorld.x*.18+uTime*1.7)*.012;
        vec3 detailNormal=normalize(normal+vec3(rippleX,0.,rippleZ));
        float facing=max(0.,dot(detailNormal,viewDir));
        float fresnel=pow(1.-facing,4.);
        float distanceFade=smoothstep(-130.,12.,vWorld.z);
        float trough=smoothstep(.18,-.42,vHeight);
        vec3 col=mix(uDeep,uMid,.22+distanceFade*.56);
        col=mix(col,uHorizon,fresnel*.5+distanceFade*.08);
        col*=1.-trough*.16;
        vec3 skyReflection=mix(vec3(.07,.15,.25),vec3(.62,.27,.23),smoothstep(-.28,.3,detailNormal.z));
        col=mix(col,skyReflection,fresnel*.48);
        vec3 sunDir=normalize(vec3(-.3,.72,-.62));
        vec3 halfDir=normalize(sunDir+viewDir);
        float broadSpec=pow(max(0.,dot(detailNormal,halfDir)),18.);
        float sharpSpec=pow(max(0.,dot(detailNormal,halfDir)),96.);
        col+=uSun*(broadSpec*.18+sharpSpec*1.08);
        float crest=smoothstep(.42,.68,vHeight)*smoothstep(.045,.115,vSlope);
        col=mix(col,uFoam,crest*.34);
        float horizonMist=(1.-smoothstep(-132.,-72.,vWorld.z))*.08;
        col=mix(col,uHorizon,horizonMist);
        float alpha=mix(.95,.71,distanceFade);
        alpha+=fresnel*.13+crest*.16+broadSpec*.04;
        gl_FragColor=vec4(col,clamp(alpha,.7,.98));
      }
    `});
    const ocean=new THREE.Mesh(oceanGeo,oceanMat);ocean.rotation.x=-Math.PI/2;ocean.position.z=-65;scene.add(ocean);
    const floorMat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vUv;void main(){float sediment=.5+.5*sin(vUv.x*31.+sin(vUv.y*11.)*.9);float longRipple=.5+.5*sin(vUv.x*46.+vUv.y*18.-uTime*.42+sin(vUv.y*16.)*.65);float caustic=smoothstep(.82,1.,longRipple)*.09;vec3 col=mix(vec3(.055,.19,.2),vec3(.12,.34,.3),vUv.y*.58+sediment*.06);col+=vec3(.22,.5,.4)*caustic;gl_FragColor=vec4(col,1.);}`});
    const seabed=new THREE.Mesh(new THREE.PlaneGeometry(150,230),floorMat);seabed.rotation.x=-Math.PI/2;seabed.position.set(0,-3.1,-65);scene.add(seabed);
    const underwater=new THREE.Group();const scenery:THREE.Object3D[]=[];const seaRockMat=new THREE.MeshStandardMaterial({color:0x315e59,roughness:1});const coralMats=[0xe66b55,0xefab62,0x6bc3a7].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.8}));
    for(let i=0;i<42;i++){const x=(Math.random()-.5)*42,z=-Math.random()*115-3,scale=.35+Math.random()*1.1;const r=new THREE.Mesh(new THREE.DodecahedronGeometry(scale,0),seaRockMat);r.position.set(x,-2.75+scale*.25,z);r.scale.y=.45;r.rotation.y=Math.random()*4;underwater.add(r);if(i%3===0){const coral=new THREE.Mesh(new THREE.ConeGeometry(.12*scale,.9*scale,7),coralMats[i%3]);coral.position.set(x+.3,-2.55,z+.2);coral.rotation.z=(Math.random()-.5)*.5;underwater.add(coral)}}
    const fish:THREE.Group[]=[];for(let i=0;i<13;i++){const f=new THREE.Group();const fm=new THREE.MeshStandardMaterial({color:i%2?0xffca68:0x72d9cb,roughness:.5});const body=new THREE.Mesh(new THREE.SphereGeometry(.3,10,7),fm);body.scale.set(1.8,.65,.45);f.add(body);const tail=new THREE.Mesh(new THREE.ConeGeometry(.28,.55,3),fm);tail.rotation.z=Math.PI/2;tail.position.x=-.55;f.add(tail);f.position.set((Math.random()-.5)*25,-1.3-Math.random()*1.1,-10-Math.random()*75);f.scale.setScalar(.55+Math.random()*.65);fish.push(f);underwater.add(f)}scene.add(underwater);
    const boat=makeBoat();boat.position.set(0,.65,5);scene.add(boat);
    underwater.children.filter(child=>!fish.includes(child as THREE.Group)).forEach(child=>scenery.push(child));
    const islands=new THREE.Group();
    const islandRockMat=new THREE.MeshStandardMaterial({color:0x294b49,roughness:.96}),islandTopMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide});
    const shallowWaterMat=new THREE.MeshBasicMaterial({color:0x70d4c6,transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide});
    const shoreFoamMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0}},vertexShader:`attribute float aPhase;varying float vPhase;void main(){vPhase=aPhase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying float vPhase;void main(){float broken=smoothstep(-.35,.7,sin(vPhase*3.7+uTime*.42)+sin(vPhase*7.3-uTime*.28)*.45);gl_FragColor=vec4(.82,1.,.96,.07+broken*.2);}`});
    const trunkMats=[0x6c432a,0x825436,0x59351f].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9}));
    const barkRingMat=new THREE.MeshStandardMaterial({color:0x3d2418,roughness:.96}),dryLeafMat=new THREE.MeshStandardMaterial({color:0x7f713e,roughness:.9,side:THREE.DoubleSide,transparent:true,opacity:.92});
    const leafMats=[0x176140,0x287a4e,0x3f925d,0x68a66c].map(color=>new THREE.MeshStandardMaterial({color,roughness:.78,side:THREE.DoubleSide,transparent:true,opacity:.96}));
    const coconutMat=new THREE.MeshStandardMaterial({color:0x5d4325,roughness:.92});
    const frondVertices:number[]=[],frondIndices:number[]=[];
    const addFrondQuad=(a:number[],b:number[],c:number[],d:number[])=>{const offset=frondVertices.length/3;frondVertices.push(...a,...b,...c,...d);frondIndices.push(offset,offset+1,offset+2,offset,offset+2,offset+3)};
    const frondSections=13;
    for(let section=0;section<frondSections-1;section++){
      const t0=section/(frondSections-1),t1=(section+1)/(frondSections-1),y0=.1*Math.sin(Math.PI*t0)-.3*t0*t0,y1=.1*Math.sin(Math.PI*t1)-.3*t1*t1,w0=.016*(1.-t0*.5),w1=.016*(1.-t1*.5);
      addFrondQuad([t0,y0,-w0],[t1,y1,-w1],[t1,y1,w1],[t0,y0,w0]);
    }
    for(let leaflet=1;leaflet<frondSections-1;leaflet++){
      const t=leaflet/(frondSections-1),y=.1*Math.sin(Math.PI*t)-.3*t*t,span=(.12+.085*Math.sin(Math.PI*t))*(1.-t*.22);
      for(const side of [-1,1]){
        const bladeSegments=5,bladeWidth=.025*(1.-t*.32);
        for(let segment=0;segment<bladeSegments-1;segment++){
          const u0=segment/(bladeSegments-1),u1=(segment+1)/(bladeSegments-1);
          const x0=t-(.045+t*.028)*u0,x1=t-(.045+t*.028)*u1,z0=side*(.008+span*u0),z1=side*(.008+span*u1),cy0=y-(.035+t*.055)*u0*u0,cy1=y-(.035+t*.055)*u1*u1,w0=Math.sin(Math.PI*u0)*bladeWidth,w1=Math.sin(Math.PI*u1)*bladeWidth;
          addFrondQuad([x0-w0,cy0,z0],[x1-w1,cy1,z1],[x1+w1,cy1+.006*Math.sin(Math.PI*u1),z1],[x0+w0,cy0+.006*Math.sin(Math.PI*u0),z0]);
        }
      }
    }
    const frondGeo=new THREE.BufferGeometry();frondGeo.setAttribute("position",new THREE.Float32BufferAttribute(frondVertices,3));frondGeo.setIndex(frondIndices);frondGeo.computeVertexNormals();
    const palms:THREE.Group[]=[];
    const terrainHeight=(t:number,angle:number,size:number,seed:number)=>{
      const slope=Math.max(0,Math.min(1,(t-.28)/.72)),smooth=slope*slope*(3-2*slope);
      return size*(.28*(1-smooth)-.035*t+Math.sin(angle*3+seed)*.012*(1-t)+Math.sin(angle*7-seed*.6)*.006*t);
    };
    const makeIslandTerrain=(size:number,seed:number)=>{
      const terrain=new THREE.Group(),rings=8,segments=28,positions:number[]=[0,terrainHeight(0,0,size,seed),0],colors:number[]=[],indices:number[]=[];
      const grassDark=new THREE.Color(0x285f42),grassLight=new THREE.Color(0x5b8f58),sand=new THREE.Color(0xc8a66c),wetSand=new THREE.Color(0x8f7858);
      colors.push(grassLight.r,grassLight.g,grassLight.b);
      for(let ring=1;ring<=rings;ring++){
        const t=ring/rings;
        for(let segment=0;segment<segments;segment++){
          const angle=segment/segments*Math.PI*2,irregularity=1+(Math.sin(angle*3+seed)*.075+Math.sin(angle*5-seed*.7)*.04+Math.sin(angle*9+seed*.3)*.018)*t*t,radius=size*.8*t*irregularity;
          positions.push(Math.cos(angle)*radius,terrainHeight(t,angle,size,seed),Math.sin(angle)*radius*.7);
          const variation=.42+.28*Math.sin(angle*4+seed),color=grassDark.clone().lerp(grassLight,variation);
          if(t>.47)color.lerp(sand,Math.min(1,(t-.47)/.28));if(t>.86)color.lerp(wetSand,(t-.86)/.14);
          colors.push(color.r,color.g,color.b);
        }
      }
      for(let segment=0;segment<segments;segment++)indices.push(0,1+segment,1+(segment+1)%segments);
      for(let ring=1;ring<rings;ring++){
        const inner=1+(ring-1)*segments,outer=1+ring*segments;
        for(let segment=0;segment<segments;segment++){const next=(segment+1)%segments,a=inner+segment,b=inner+next,c=outer+next,d=outer+segment;indices.push(a,d,b,b,d,c)}
      }
      const topGeo=new THREE.BufferGeometry();topGeo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));topGeo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));topGeo.setIndex(indices);topGeo.computeVertexNormals();
      const top=new THREE.Mesh(topGeo,islandTopMat);top.castShadow=true;top.receiveShadow=true;terrain.add(top);
      const sidePositions:number[]=[],sideIndices:number[]=[];
      const outerOffset=1+(rings-1)*segments;
      for(let segment=0;segment<segments;segment++){
        const px=positions[(outerOffset+segment)*3],py=positions[(outerOffset+segment)*3+1],pz=positions[(outerOffset+segment)*3+2];
        sidePositions.push(px,py,pz,px*1.025,-size*.2,pz*1.025);
      }
      for(let segment=0;segment<segments;segment++){const next=(segment+1)%segments,a=segment*2,b=next*2;sideIndices.push(a,a+1,b,a+1,b+1,b)}
      const sideGeo=new THREE.BufferGeometry();sideGeo.setAttribute("position",new THREE.Float32BufferAttribute(sidePositions,3));sideGeo.setIndex(sideIndices);sideGeo.computeVertexNormals();
      const side=new THREE.Mesh(sideGeo,islandRockMat);side.castShadow=true;side.receiveShadow=true;terrain.add(side);
      const addShoreBand=(innerScale:number,outerScale:number,y:number,material:THREE.Material,renderOrder:number)=>{
        const bandPositions:number[]=[],phases:number[]=[],bandIndices:number[]=[];
        for(let segment=0;segment<segments;segment++){
          const angle=segment/segments*Math.PI*2,irregularity=1+Math.sin(angle*3+seed)*.075+Math.sin(angle*5-seed*.7)*.04+Math.sin(angle*9+seed*.3)*.018,edge=size*.8*irregularity,waveY=y+Math.sin(angle*4+seed)*.012;
          bandPositions.push(Math.cos(angle)*edge*innerScale,waveY,Math.sin(angle)*edge*innerScale*.7,Math.cos(angle)*edge*outerScale,waveY-.012,Math.sin(angle)*edge*outerScale*.7);phases.push(angle,angle);
        }
        for(let segment=0;segment<segments;segment++){const next=(segment+1)%segments,a=segment*2,b=next*2;bandIndices.push(a,a+1,b,a+1,b+1,b)}
        const bandGeo=new THREE.BufferGeometry();bandGeo.setAttribute("position",new THREE.Float32BufferAttribute(bandPositions,3));bandGeo.setAttribute("aPhase",new THREE.Float32BufferAttribute(phases,1));bandGeo.setIndex(bandIndices);bandGeo.computeVertexNormals();
        const band=new THREE.Mesh(bandGeo,material);band.renderOrder=renderOrder;terrain.add(band);
      };
      addShoreBand(.82,1.12,.012,shallowWaterMat,1);addShoreBand(.91,1.035,.045,shoreFoamMat,2);return terrain;
    };
    const makePalm=(h:number,seed:number)=>{
      const tree=new THREE.Group(),segments=8,leanX=Math.sin(seed*1.7)*h*.085,leanZ=Math.cos(seed*1.3)*h*.065;let previous=new THREE.Vector3();
      for(let segment=0;segment<segments;segment++){
        const t=(segment+1)/segments,next=new THREE.Vector3(leanX*t*t,h*t,leanZ*t*t),direction=next.clone().sub(previous);
        const lowerRadius=h*(.058-segment*.003),upperRadius=h*(.054-segment*.003),trunk=new THREE.Mesh(new THREE.CylinderGeometry(upperRadius,lowerRadius,direction.length(),12),trunkMats[segment%trunkMats.length]);
        trunk.position.copy(previous).add(next).multiplyScalar(.5);trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());trunk.castShadow=true;tree.add(trunk);previous=next;
        if(segment<segments-1){const ring=new THREE.Mesh(new THREE.TorusGeometry(upperRadius*1.03,h*.006,6,12),barkRingMat);ring.position.copy(next);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction.clone().normalize());ring.castShadow=true;tree.add(ring)}
      }
      const crown=new THREE.Group(),fronds:THREE.Mesh[]=[];crown.position.copy(previous);tree.add(crown);
      for(let frond=0;frond<11;frond++){
        const leaf=new THREE.Mesh(frondGeo,leafMats[(frond+Math.floor(seed))%leafMats.length]);leaf.rotation.y=frond/11*Math.PI*2+seed*.31;leaf.rotation.z=(Math.random()-.5)*.11;leaf.userData.baseZ=leaf.rotation.z;leaf.scale.setScalar(h*(.52+Math.random()*.08));leaf.castShadow=true;leaf.receiveShadow=true;crown.add(leaf);fronds.push(leaf);
      }
      for(let frond=0;frond<3;frond++){
        const youngLeaf=new THREE.Mesh(frondGeo,leafMats[(frond+1)%leafMats.length]);youngLeaf.rotation.y=frond/3*Math.PI*2+seed;youngLeaf.rotation.z=.48;youngLeaf.userData.baseZ=.48;youngLeaf.scale.setScalar(h*.3);youngLeaf.castShadow=true;crown.add(youngLeaf);fronds.push(youngLeaf);
      }
      for(let frond=0;frond<2;frond++){const dryLeaf=new THREE.Mesh(frondGeo,dryLeafMat);dryLeaf.rotation.y=frond*Math.PI+seed*.7;dryLeaf.rotation.z=-.23;dryLeaf.userData.baseZ=-.23;dryLeaf.scale.setScalar(h*.42);dryLeaf.castShadow=true;crown.add(dryLeaf);fronds.push(dryLeaf)}
      for(let fruit=0;fruit<3;fruit++){const angle=fruit/3*Math.PI*2+seed,coconut=new THREE.Mesh(new THREE.SphereGeometry(h*.05,9,7),coconutMat);coconut.position.set(Math.cos(angle)*h*.06,-h*.055,Math.sin(angle)*h*.06);coconut.castShadow=true;crown.add(coconut)}
      tree.userData.crown=crown;tree.userData.fronds=fronds;tree.userData.phase=seed;palms.push(tree);
      return tree;
    };
    for(const [x,z,s] of [[-26,-82,8],[25,-112,11],[-42,-142,14],[43,-172,16]] as number[][]){
      const island=new THREE.Group(),seed=s+x*.03;island.position.set(x,0,z);island.userData.recycleSpan=210;island.userData.recycleAt=42;island.add(makeIslandTerrain(s,seed));
      for(let outcrop=0;outcrop<Math.max(3,Math.round(s/3));outcrop++){
        const angle=outcrop/Math.max(3,Math.round(s/3))*Math.PI*2+s*.31,radius=s*(.5+Math.random()*.12),t=radius/(s*.8),stoneSize=s*(.055+Math.random()*.035),stone=new THREE.Mesh(new THREE.DodecahedronGeometry(stoneSize,1),islandRockMat);
        stone.position.set(Math.cos(angle)*radius,terrainHeight(t,angle,s,seed)+stoneSize*.18,Math.sin(angle)*radius*.7);stone.scale.set(1.15,.52,.9+Math.random()*.5);stone.rotation.set(Math.random()*.4,Math.random()*Math.PI,Math.random()*.28);stone.castShadow=true;island.add(stone);
      }
      for(let i=0;i<Math.max(2,Math.round(s/4.5));i++){
        const h=s*(.52+Math.random()*.14),tree=makePalm(h,i+s),angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*s*.31,t=radius/(s*.8);
        tree.position.set(Math.cos(angle)*radius,terrainHeight(t,angle,s,seed)+s*.008,Math.sin(angle)*radius*.7);tree.rotation.y=Math.random()*Math.PI*2;island.add(tree);
      }
      island.rotation.y=Math.random()*Math.PI*2;
      islands.add(island);scenery.push(island);
    }
    scene.add(islands);
    const buoyMat=new THREE.MeshStandardMaterial({color:0xf06445,roughness:.55,metalness:.08}),buoyBandMat=new THREE.MeshStandardMaterial({color:0xffdfa0,roughness:.65});for(let i=0;i<12;i++){const buoy=new THREE.Group(),body=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,.72,10),i%2?buoyMat:buoyBandMat);body.position.y=.25;buoy.add(body);const cap=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),i%2?buoyBandMat:buoyMat);cap.position.y=.7;buoy.add(cap);buoy.position.set((i%2?-1:1)*(10+Math.random()*16),0,-12-i*10);buoy.userData.recycleSpan=120;buoy.userData.bob=i;scene.add(buoy);scenery.push(buoy)}
    const gulls:THREE.Group[]=[];const gullWhite=new THREE.MeshStandardMaterial({color:0xf4f2e8,roughness:.9,transparent:true,opacity:.82}),gullGray=new THREE.MeshStandardMaterial({color:0x727d87,roughness:.9,side:THREE.DoubleSide,transparent:true,opacity:.78}),beakMat=new THREE.MeshStandardMaterial({color:0xd99a48,roughness:.8,transparent:true,opacity:.8});for(let i=0;i<6;i++){const gull=new THREE.Group(),body=new THREE.Mesh(new THREE.SphereGeometry(.28,14,9),gullWhite);body.scale.set(.72,.75,1.55);gull.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.17,12,8),gullWhite);head.position.set(0,.08,-.4);gull.add(head);const beak=new THREE.Mesh(new THREE.ConeGeometry(.045,.22,7),beakMat);beak.rotation.x=-Math.PI/2;beak.position.set(0,.05,-.61);gull.add(beak);const wings:THREE.Mesh[]=[];for(const side of [-1,1]){const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,0,.12,side*.62,.09,.08,side*1.5,.02,.35,side*1.08,-.03,-.25],3));wingGeo.setIndex([0,1,2,0,2,3]);wingGeo.computeVertexNormals();const wing=new THREE.Mesh(wingGeo,gullGray);wing.position.y=.06;wings.push(wing);gull.add(wing)}const tailGeo=new THREE.BufferGeometry();tailGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,0,.35,-.28,0,.82,0,0,.68,.28,0,.82],3));tailGeo.setIndex([0,1,2,0,2,3]);tailGeo.computeVertexNormals();gull.add(new THREE.Mesh(tailGeo,gullGray));gull.userData.wings=wings;gull.userData.phase=Math.random()*Math.PI*2;gull.userData.glide=.65+Math.random()*.45;gull.position.set((i-2.5)*7+(Math.random()-.5)*4,16+Math.random()*8,-65-Math.random()*75);gull.scale.setScalar(.32+Math.random()*.2);gulls.push(gull);scene.add(gull)}
    const obstacleRockMats=[new THREE.MeshStandardMaterial({color:0x29494b,roughness:.52,metalness:.07,flatShading:true}),new THREE.MeshStandardMaterial({color:0x3e6261,roughness:.58,metalness:.04,flatShading:true})];
    const obstacleFoamMat=new THREE.MeshBasicMaterial({color:0xd9fff8,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
    const makeReefRockGeometry=(seed:number)=>{
      const source=new THREE.DodecahedronGeometry(1,0),positions=source.getAttribute("position") as THREE.BufferAttribute;
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),weathering=1+Math.sin(x*4.1+z*3.4+seed*1.37)*.075;
        positions.setX(i,x*weathering*(1.08+Math.sin(seed*.71)*.045));
        positions.setZ(i,z*(1+Math.cos(x*3.7-seed)*.065));
        positions.setY(i,y*(.73+Math.cos(seed*.83)*.035)+Math.sin(x*3.2+z*4.4+seed)*.065);
      }
      positions.needsUpdate=true;source.computeVertexNormals();return source;
    };
    let raf=0,last=performance.now(),spawn=0,impactKick=0,impactAge=0;
    const addObject=(kind:"jamo"|"rock",char="",lane?:number)=>{const g=new THREE.Group();
      if(kind==="jamo"){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:makeJamoTexture(char),transparent:true,depthWrite:false,depthTest:true,blending:THREE.NormalBlending}));sprite.scale.set(5.3,5.3,1);g.add(sprite);const light=new THREE.PointLight(0x52ffe2,1.5,9);g.add(light)}
      else {
        const cluster:[[number,number,number,number],[number,number,number,number],[number,number,number,number],[number,number,number,number]]=[[0,0,1.3,-.08],[-1.04,.17,.8,-.3],[.94,-.1,.73,-.34],[.28,.65,.58,-.4]];
        cluster.forEach(([x,z,size,y],index)=>{const rock=new THREE.Mesh(makeReefRockGeometry(index+Math.random()*9),obstacleRockMats[index%obstacleRockMats.length]);rock.position.set(x,y,z);rock.scale.set(size*(1+Math.random()*.12),size*(.86+Math.random()*.12),size*(.93+Math.random()*.14));rock.rotation.set((Math.random()-.5)*.16,(Math.random()-.5)*.58,(Math.random()-.5)*.13);rock.castShadow=true;rock.receiveShadow=true;g.add(rock)});
        for(let patch=0;patch<7;patch++){const angle=patch/7*Math.PI*2+Math.random()*.24,foam=new THREE.Mesh(new THREE.CircleGeometry(.28+Math.random()*.23,12),obstacleFoamMat);foam.rotation.x=-Math.PI/2;foam.position.set(Math.cos(angle)*(1.27+Math.random()*.26),-.54,Math.sin(angle)*(.88+Math.random()*.22));foam.scale.x=1.55+Math.random()*.72;foam.renderOrder=3;g.add(foam)}
      }
      const objectLane=lane??(Math.random()-.5)*15;g.position.set(objectLane,kind==="jamo"?2.2:.65,-82-Math.random()*15);scene.add(g);objects.current.push({mesh:g,kind,char,hit:false});return objectLane;
    };
    const onResize=()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)};
    const onKey=(e:KeyboardEvent,d:boolean)=>{if(["ArrowLeft","ArrowRight","a","d","A","D"," "].includes(e.key))e.preventDefault();if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")keys.current.left=d;if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")keys.current.right=d;if(e.key===" "&&d){game.current.running=!game.current.running;sync()}};
    const kd=(e:KeyboardEvent)=>onKey(e,true),ku=(e:KeyboardEvent)=>onKey(e,false);window.addEventListener("resize",onResize);window.addEventListener("keydown",kd,{passive:false});window.addEventListener("keyup",ku);
    const loop=(now:number)=>{const dt=Math.min(2,(now-last)/16.67);last=now;const t=now*.001,s=game.current;oceanMat.uniforms.uTime.value=t;floorMat.uniforms.uTime.value=t;skyMat.uniforms.uTime.value=t;shoreFoamMat.uniforms.uTime.value=t;fish.forEach((f,i)=>{f.position.x+=Math.sin(i)*.012*dt;f.position.z+=.018*dt;if(f.position.z>10)f.position.z=-80;f.position.y+=Math.sin(t*1.2+i)*.002});
      if(s.running&&s.health>0){
        if(keys.current.left)s.x-=.105*dt;if(keys.current.right)s.x+=.105*dt;s.x=Math.max(-7.5,Math.min(7.5,s.x));spawn-=dt;
        if(spawn<=0){
          const m=MISSIONS[s.mission%MISSIONS.length],need=m.pieces[s.collected.length];
          if(!need){spawn=70}else{
            const pool=["ㄱ","ㄴ","ㅁ","ㅂ","ㅅ","ㅇ","ㅏ","ㅓ","ㅗ","ㅜ","ㅡ","ㅣ"].filter(c=>c!==need);
            const jamoLanes:number[]=[];
            if(Math.random()<.48){
              const offset=(Math.random()-.5)*2.2,decoy=pool[Math.floor(Math.random()*pool.length)];
              if(Math.random()<.5){jamoLanes.push(addObject("jamo",need,-3.6+offset),addObject("jamo",decoy,3.6+offset))}
              else{jamoLanes.push(addObject("jamo",decoy,-3.6+offset),addObject("jamo",need,3.6+offset))}
            }else jamoLanes.push(addObject("jamo",Math.random()<.82?need:pool[Math.floor(Math.random()*pool.length)]));
            if(Math.random()<.6){
              const safeRockLanes=[-7,-5.25,-3.5,-1.75,0,1.75,3.5,5.25,7].filter(lane=>jamoLanes.every(jamoLane=>Math.abs(lane-jamoLane)>=2.8));
              if(safeRockLanes.length)addObject("rock","",safeRockLanes[Math.floor(Math.random()*safeRockLanes.length)]);
            }
            spawn=155+Math.random()*55;
          }
        }
        const travel=s.speed*dt;scenery.forEach(item=>{item.position.z+=travel*(item.userData.recycleSpan?1:.9);const limit=item.userData.recycleAt??(item.userData.recycleSpan?34:16);if(item.position.z>limit)item.position.z-=item.userData.recycleSpan??115;if(item.userData.bob!==undefined){item.position.y=Math.sin(t*1.8+item.userData.bob)*.13;item.rotation.z=Math.sin(t*1.35+item.userData.bob)*.045}});
        objects.current.forEach(o=>{if(o.reject!==undefined&&o.velocity){o.mesh.position.addScaledVector(o.velocity,dt);o.velocity.y-=.006*dt;o.mesh.rotation.z+=.16*dt;o.mesh.rotation.y+=.11*dt;o.reject-=.018*dt;const sprite=o.mesh.children[0] as THREE.Sprite;if(sprite?.material)(sprite.material as THREE.SpriteMaterial).opacity=Math.max(0,o.reject);return}o.mesh.position.z+=travel;o.mesh.rotation.y+=o.kind==="jamo"?.012*dt:.003*dt;if(o.kind==="jamo")o.mesh.position.y=2.25+Math.sin(t*2+o.mesh.id)*.25;
          if(!o.hit&&o.mesh.position.z>3&&o.mesh.position.z<7){const range=o.kind==="jamo"?1.65:1.28;if(Math.abs(o.mesh.position.x-s.x)<range){o.hit=true;if(o.kind==="rock"){s.health--;s.streak=0;impactKick=1;impactAge=0;setImpactFx(v=>v+1);if(!s.muted)sound("hit");sync(s.health?"암초에 닿았어요. 방향을 살짝 바꿔볼까요?":"잠시 쉬었다 다시 출항해요.");}
            else{const m=MISSIONS[s.mission%MISSIONS.length],need=m.pieces[s.collected.length];if(o.char===need){const targetIndex=s.collected.length;launchGlyph(o.char,targetIndex,o.mesh.getWorldPosition(new THREE.Vector3()),camera,host);scene.remove(o.mesh);s.collected.push(o.char);s.score+=100;s.streak++;if(!s.muted)sound("collect");if(s.collected.length===m.pieces.length){const finishedMission=s.mission;s.score+=500;if(!s.muted){sound("complete");const voice=new SpeechSynthesisUtterance(m.word);voice.lang="ko-KR";voice.rate=.78;window.speechSynthesis.cancel();window.speechSynthesis.speak(voice)}sync(`“${m.word}” 완성! 별을 하나 얻었어요!`);setTimeout(()=>{s.collected=[];if(finishedMission===MISSIONS.length-1){s.completed=true;s.running=false;sync("오늘의 글자 항해를 모두 마쳤어요!")}else{s.mission=finishedMission+1;sync(`새로운 단어를 만나러 가요! ${finishedMission+2}/${MISSIONS.length}`)}},1050)}else sync(`${o.char} 획득! 다음은 ${m.pieces[s.collected.length]} 차례예요.`)}else{const away=Math.sign(o.mesh.position.x-boat.position.x)||1;o.reject=1;o.velocity=new THREE.Vector3(away*.13,.12,.1);setMistakeFx({id:Date.now(),char:o.char,need});sync(`${o.char}은(는) 순서가 달라요. 다음 차례는 ${need}이에요.`)}}}}});
        const gone=objects.current.filter(o=>o.mesh.position.z>18||(o.hit&&o.reject===undefined)||(o.reject!==undefined&&o.reject<=0));gone.filter(o=>o.mesh.parent).forEach(o=>scene.remove(o.mesh));objects.current=objects.current.filter(o=>!gone.includes(o));
      }
      if(impactKick>.01)impactAge+=dt;const collisionWave=Math.sin(impactAge*.88)*impactKick;boat.position.x+=(s.x-boat.position.x)*.08;boat.position.y=.7+Math.sin(t*1.8)*.12+Math.abs(collisionWave)*.12;boat.position.z+=(5+impactKick*.55-boat.position.z)*.18;boat.rotation.z+=(Math.max(-.16,Math.min(.16,(boat.position.x-s.x)*.12))+collisionWave*.3-boat.rotation.z)*.16;boat.rotation.x=Math.sin(t*1.3)*.025-Math.sin(impactAge*.72)*impactKick*.11;impactKick*=.92;
      (boat.userData.sails as THREE.Mesh[]).forEach((sail,i)=>{sail.rotation.y=(i?1:-1)*Math.sin(t*.72)*.01;sail.scale.z=1+Math.sin(t*.96)*.04});
      gulls.forEach((g,i)=>{g.position.x+=Math.sin(t*.22+i)*.004;g.position.y+=Math.sin(t*.35+i)*.0015;g.position.z+=(s.running?s.speed*.16:.002)*dt;if(g.position.z>12){g.position.z=-135;g.position.x=(Math.random()-.5)*42;g.position.y=16+Math.random()*8}const flap=Math.sin(t*g.userData.glide+g.userData.phase)*.14;(g.userData.wings as THREE.Mesh[]).forEach((wing,j)=>{wing.rotation.z=(j?1:-1)*flap;wing.rotation.x=Math.sin(t*.6+i)*.035})});
      palms.forEach((p,i)=>{const crown=p.userData.crown as THREE.Group,phase=p.userData.phase as number;crown.rotation.z=Math.sin(t*.58+phase)*.028;crown.rotation.x=Math.cos(t*.43+phase)*.018;(p.userData.fronds as THREE.Mesh[]).forEach((leaf,j)=>{leaf.rotation.z=leaf.userData.baseZ+Math.sin(t*.72+phase+j*.63)*.012})});
      const speedLift=Math.min(1,(s.speed-.055)/.405);camera.position.x+=(boat.position.x*.34-camera.position.x)*.04;camera.position.y+=(9.2+speedLift*.65-camera.position.y)*.035;camera.position.z+=(19-speedLift*1.25-camera.position.z)*.035;camera.position.x+=(Math.random()-.5)*impactKick*.16;camera.position.y+=(Math.random()-.5)*impactKick*.1;camera.fov+=(56+speedLift*4-camera.fov)*.025;camera.updateProjectionMatrix();camera.lookAt(boat.position.x*.17,.55,-12.5-speedLift*3);renderer.render(scene,camera);raf=requestAnimationFrame(loop)};
    raf=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);renderer.dispose();host.removeChild(renderer.domElement)};
  },[sound,sync,launchGlyph]);

  const mission=MISSIONS[ui.mission%MISSIONS.length];const hold=(side:"left"|"right",on:boolean)=>{keys.current[side]=on};
  const restart=()=>{objects.current.forEach(o=>o.mesh.parent?.remove(o.mesh));objects.current=[];game.current=initialState();sync("천천히 다시 출항해 볼까요?")};
  return <main className="game-shell">
    <div ref={mount} className="three-stage" aria-label="자모를 모으며 항해하는 실제 3D 바다 게임"/>
    <div className="vignette"/>
    {!audioReady&&!ui.muted&&<button className="audio-cue" onClick={()=>startAudio.current()}><span>♪</span> 음악과 파도 소리 시작하기</button>}
    {impactFx>0&&<div key={`soft-impact-${impactFx}`} className="soft-impact"><i/><i/><i/><i/></div>}
    {mistakeFx&&<div key={mistakeFx.id} className="gentle-mistake"><b>{mistakeFx.char}</b><span>순서가 달라요 · 다음은 {mistakeFx.need}</span></div>}
    <header className="topbar"><div className="brand"><span className="brand-mark">ㅂ</span><div><b>글자바다</b><small>JAMO VOYAGE</small></div></div><div className="stats"><span><i>점수</i><b>{ui.score.toLocaleString()}</b></span><span><i>연속 성공</i><b>× {ui.streak}</b></span><span className="hearts" aria-label={`남은 기회 ${ui.health}개`}>{[0,1,2,3,4].map(n=><b key={n} className={n<ui.health?"on":""}>♥</b>)}</span></div><button className="sound" onClick={()=>{game.current.muted=!game.current.muted;sync()}}>{ui.muted?"소리 끔":"♪ 소리 켬"}</button></header>
    <section className="mission-card"><div className="mission-progress"><i style={{width:`${ui.collected.length/mission.pieces.length*100}%`}}/></div><div className="mission-kicker"><span>오늘의 항해 · {ui.mission+1}/{MISSIONS.length}번째 단어</span><span className="voyage-stars" aria-label={`완성한 단어 ${ui.mission}개`}>{MISSIONS.map((_,i)=><i key={i} className={i<ui.mission?"earned":""}>★</i>)}</span></div><div className="mission-row"><div><h1>{mission.word}</h1><p>{mission.hint}</p></div><div className="slots">{mission.pieces.map((p,i)=><span data-slot={i} key={i} className={i<ui.collected.length?"filled":i===ui.collected.length?"next":""}>{i<ui.collected.length?ui.collected[i]:p}</span>)}</div></div><div className="next-guide">다음에 모을 자모 <strong>{mission.pieces[ui.collected.length]}</strong></div></section>
    <aside className="teacher-panel"><span>편안한 항해</span><label>속도<select aria-label="항해 속도" value={String(ui.speed)} onChange={e=>{const speed=parseFloat(e.currentTarget.value);game.current.speed=speed;sync(speed===.055?"아주 천천히 항해합니다.":speed===.097?"천천히 항해합니다.":speed===.169?"보통 속도로 항해합니다.":speed===.29?"빠르게 항해합니다!":"아주 빠르게 항해합니다!")}}><option value="0.055">아주 천천히</option><option value="0.097">천천히</option><option value="0.169">보통</option><option value="0.29">빠르게</option><option value="0.46">아주 빠르게</option></select></label><b className="speed-now">{ui.speed===.055?"거북이 속도":ui.speed===.097?"산책 속도":ui.speed===.169?"씽씽 속도":ui.speed===.29?"쾌속 항해":"번개 항해"}</b><small>틀려도 감점하지 않아요</small></aside>
    <div className="toast" role="status">{ui.toast}</div>
    <div className="fx-layer">{flights.map(f=><span key={f.id} className="flying-glyph" style={{"--sx":`${f.sx}px`,"--sy":`${f.sy}px`,"--tx":`${f.tx}px`,"--ty":`${f.ty}px`} as React.CSSProperties} onAnimationEnd={()=>setFlights(v=>v.filter(x=>x.id!==f.id))}>{f.char}<i/><i/><i/><i/><i/><i/></span>)}</div>
    <div className="controls"><button onPointerDown={()=>hold("left",true)} onPointerUp={()=>hold("left",false)} onPointerCancel={()=>hold("left",false)} aria-label="왼쪽으로 이동"><span>←</span><small>왼쪽</small></button><button className="pause" onClick={()=>{game.current.running=!game.current.running;sync(game.current.running?"다시 천천히 출항합니다.":"잠시 쉬어가도 괜찮아요.")}}>{ui.running?"Ⅱ":"▶"}<small>{ui.running?"쉬기":"계속"}</small></button><button onPointerDown={()=>hold("right",true)} onPointerUp={()=>hold("right",false)} onPointerCancel={()=>hold("right",false)} aria-label="오른쪽으로 이동"><span>→</span><small>오른쪽</small></button></div>
    {!ui.running&&ui.health>0&&!ui.completed&&<div className="overlay"><div><span>⚓</span><h2>잠시 쉬는 중</h2><p>준비되면 다시 시작해요. 서두르지 않아도 괜찮습니다.</p><button onClick={()=>{game.current.running=true;sync("다시 천천히 출항합니다.")}}>계속 항해하기</button></div></div>}
    {ui.completed&&<div className="overlay voyage-complete"><div><span>★★★★★</span><h2>오늘의 글자 항해 완료!</h2><p>다섯 단어를 모두 완성했어요.<br/><b>{ui.score.toLocaleString()}점</b> · 최고 연속 성공 <b>{ui.streak}회</b></p><button onClick={restart}>다시 항해하기</button></div></div>}
    {ui.health<=0&&<div className="overlay"><div><span>🌊</span><h2>멋진 항해였어요</h2><p><b>{ui.score.toLocaleString()}점</b>을 모았어요. 다시 도전해 볼까요?</p><button onClick={restart}>다시 출항하기</button></div></div>}
  </main>
}
