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

type GameObject = { mesh: THREE.Group; kind: "jamo" | "rock"; char: string; hit: boolean };
type GameState = { x: number; health: number; score: number; streak: number; mission: number; collected: string[]; running: boolean; muted: boolean; speed: number };
type Flight = { id: number; char: string; sx: number; sy: number; tx: number; ty: number };
const initialState = (): GameState => ({ x: 0, health: 5, score: 0, streak: 0, mission: 0, collected: [], running: true, muted: false, speed: 0.08 });

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
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b2918, roughness: .58, metalness: .06 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd18a43, roughness: .42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x28150f, roughness: .7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2b84f, roughness: .3, metalness: .45 });
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,pos:[number,number,number],rot:[number,number,number]=[0,0,0])=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;boat.add(m);return m};
  const hullGeo = new THREE.BufferGeometry();
  const v = new Float32Array([-1.7,0,2.6, 1.7,0,2.6, -1.25,0,-2.2, 1.25,0,-2.2, -.7,-1,1.8, .7,-1,1.8, -.5,-.8,-1.8, .5,-.8,-1.8]);
  const idx=[0,1,4,1,5,4, 0,4,2,2,4,6, 1,3,5,3,7,5, 2,6,3,3,6,7, 4,5,6,5,7,6];
  hullGeo.setAttribute("position",new THREE.BufferAttribute(v,3)); hullGeo.setIndex(idx); hullGeo.computeVertexNormals();
  const hull = add(hullGeo,wood,[0,0,0]); hull.scale.set(1.08,1,1.1);
  add(new THREE.BoxGeometry(2.35,.16,3.75),rim,[0,.02,.15]);
  for(let z=-1.45;z<=1.45;z+=.48)add(new THREE.BoxGeometry(2.28,.035,.035),dark,[0,.12,z]);
  for(const side of [-1,1]){add(new THREE.CylinderGeometry(.055,.055,3.9,8),rim,[side*1.28,.48,.1],[Math.PI/2,0,0]);for(let z=-1.55;z<=1.55;z+=.78)add(new THREE.CylinderGeometry(.04,.05,.55,8),rim,[side*1.28,.25,z])}
  add(new THREE.CylinderGeometry(.08,.12,5.2,14),rim,[0,2.35,.05]);
  const sailMat = new THREE.MeshStandardMaterial({color:0xe85d35,side:THREE.DoubleSide,roughness:.8});
  const sailGeo = new THREE.BufferGeometry(); sailGeo.setAttribute("position",new THREE.Float32BufferAttribute([-.05,4.7,.05,-.05,.8,.05,-2.05,1.28,.05],3));sailGeo.computeVertexNormals();
  const sail=new THREE.Mesh(sailGeo,sailMat);sail.castShadow=true;boat.add(sail);
  const sail2=sail.clone();sail2.material=new THREE.MeshStandardMaterial({color:0xf5dfb5,side:THREE.DoubleSide,roughness:.78});sail2.geometry=new THREE.BufferGeometry();sail2.geometry.setAttribute("position",new THREE.Float32BufferAttribute([.08,4.5,.05,.08,1,.05,1.7,1.38,.05],3));sail2.geometry.computeVertexNormals();boat.add(sail2);
  add(new THREE.BoxGeometry(1.15,.68,.95),rim,[0,.48,1.05]);add(new THREE.BoxGeometry(1.3,.12,1.08),dark,[0,.88,1.05]);
  for(const x of [-.34,.34])add(new THREE.BoxGeometry(.25,.27,.025),new THREE.MeshStandardMaterial({color:0xffd56e,emissive:0x7a3b08,emissiveIntensity:1.4}),[x,.53,1.54]);
  add(new THREE.TorusGeometry(.43,.055,8,20),gold,[0,1.12,.12],[Math.PI/2,0,0]);for(let a=0;a<Math.PI;a+=Math.PI/3){const spoke=add(new THREE.CylinderGeometry(.025,.025,.85,6),gold,[0,1.12,.12],[Math.PI/2,a,0]);spoke.rotation.z=a}
  for(const x of [-.76,.76]){add(new THREE.CylinderGeometry(.32,.36,.55,12),dark,[x,.43,-.85]);add(new THREE.TorusGeometry(.34,.035,6,16),gold,[x,.48,-.85],[Math.PI/2,0,0])}
  add(new THREE.CylinderGeometry(.035,.045,1.65,8),rim,[0,5.65,.05]);const flagGeo=new THREE.BufferGeometry();flagGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,6.35,.05,0,5.72,.05,1.05,6.03,.05],3));flagGeo.computeVertexNormals();add(flagGeo,sailMat,[0,0,0]);
  const lamp=new THREE.PointLight(0xffb55b,3,8);lamp.position.set(-1,.65,2);boat.add(lamp);add(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:0xffd36b,emissive:0xff8a20,emissiveIntensity:2}),[-1,.65,2]);
  add(new THREE.ConeGeometry(.22,.65,12),gold,[0,-.18,2.95],[Math.PI/2,0,0]);
  boat.scale.setScalar(.82); return boat;
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
  const [ui,setUi]=useState({...initialState(),toast:"빛나는 자모를 순서대로 모아보세요!"});
  const [flights,setFlights]=useState<Flight[]>([]);
  const sound=useSound();
  const sync=useCallback((toast?:string)=>{const s=game.current;setUi(v=>({...s,collected:[...s.collected],toast:toast??v.toast}));},[]);
  const launchGlyph=useCallback((char:string,index:number,world:THREE.Vector3,camera:THREE.Camera,host:HTMLElement)=>{
    const p=world.clone().project(camera),box=host.getBoundingClientRect(),slot=document.querySelector(`[data-slot="${index}"]`)?.getBoundingClientRect();
    const sx=box.left+(p.x*.5+.5)*box.width,sy=box.top+(-p.y*.5+.5)*box.height;
    const tx=slot?slot.left+slot.width/2:innerWidth/2,ty=slot?slot.top+slot.height/2:110;
    setFlights(v=>[...v,{id:Date.now()+Math.random(),char,sx,sy,tx,ty}]);
  },[]);

  useEffect(()=>{
    const host=mount.current!; const scene=new THREE.Scene(); scene.background=new THREE.Color(0x163854);scene.fog=new THREE.FogExp2(0x225b6c,.018);
    const camera=new THREE.PerspectiveCamera(54,host.clientWidth/host.clientHeight,.1,220);camera.position.set(0,7.2,15);camera.lookAt(0,1,-10);
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});renderer.setSize(host.clientWidth,host.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0x9bdcff,0x082338,2.1));const sunLight=new THREE.DirectionalLight(0xffc273,4);sunLight.position.set(-18,25,-35);sunLight.castShadow=true;scene.add(sunLight);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(4,32,16),new THREE.MeshBasicMaterial({color:0xffc45e}));sun.position.set(-25,18,-95);scene.add(sun);
    const oceanGeo=new THREE.PlaneGeometry(150,230,120,150);
    const oceanMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{uTime:{value:0},uDeep:{value:new THREE.Color(0x032e4a)},uMid:{value:new THREE.Color(0x087f91)},uLight:{value:new THREE.Color(0x64e4d4)},uSun:{value:new THREE.Color(0xffd27c)}},vertexShader:`
      uniform float uTime; varying float vWave; varying vec3 vWorld;
      void main(){vec3 p=position;float w=sin(p.x*.22+uTime*1.1)*.28+sin(p.y*.115-uTime*.72)*.46+sin((p.x+p.y)*.08+uTime*.55)*.18;p.z+=w;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}
    `,fragmentShader:`
      uniform vec3 uDeep;uniform vec3 uMid;uniform vec3 uLight;uniform vec3 uSun;uniform float uTime;varying float vWave;varying vec3 vWorld;
      void main(){float crest=smoothstep(.38,.78,vWave);float rip=pow(max(0.,sin(vWorld.x*.75+vWorld.z*.3+uTime*2.2)),18.);float distanceFade=smoothstep(-125.,15.,vWorld.z);vec3 col=mix(uDeep,uMid,distanceFade*.68+.16);col=mix(col,uLight,crest*.55+rip*.18);float gold=pow(max(0.,sin(vWorld.x*.045+vWorld.z*.015)),12.)*smoothstep(-80.,-5.,vWorld.z);col+=uSun*gold*.18;gl_FragColor=vec4(col,1.);}
    `});
    const ocean=new THREE.Mesh(oceanGeo,oceanMat);ocean.rotation.x=-Math.PI/2;ocean.position.z=-65;scene.add(ocean);
    const boat=makeBoat();boat.position.set(0,.65,5);scene.add(boat);
    const wakeMat=new THREE.MeshBasicMaterial({color:0xb9fff2,transparent:true,opacity:.25,side:THREE.DoubleSide});for(const x of [-.72,.72]){const wake=new THREE.Mesh(new THREE.PlaneGeometry(.12,10),wakeMat);wake.rotation.x=-Math.PI/2;wake.rotation.z=x<0?-.12:.12;wake.position.set(x,.14,10);scene.add(wake)}
    const islands=new THREE.Group();for(const [x,z,s] of [[-26,-78,8],[25,-92,11],[-42,-120,14],[43,-140,16]] as number[][]){const rock=new THREE.Mesh(new THREE.ConeGeometry(s,s*1.25,7),new THREE.MeshStandardMaterial({color:0x204c4c,roughness:1}));rock.position.set(x,s*.42,z);rock.rotation.y=x;islands.add(rock);const green=new THREE.Mesh(new THREE.ConeGeometry(s*.52,s*.55,7),new THREE.MeshStandardMaterial({color:0x2f7258,roughness:1}));green.position.set(x,s*.92,z);islands.add(green)}scene.add(islands);
    const particles=new THREE.BufferGeometry();const pts=new Float32Array(360);for(let i=0;i<360;i+=3){pts[i]=(Math.random()-.5)*80;pts[i+1]=Math.random()*18+2;pts[i+2]=-Math.random()*150}particles.setAttribute("position",new THREE.BufferAttribute(pts,3));scene.add(new THREE.Points(particles,new THREE.PointsMaterial({color:0xffd995,size:.12,transparent:true,opacity:.45})));
    let raf=0,last=performance.now(),spawn=0;
    const addObject=(kind:"jamo"|"rock",char="")=>{const g=new THREE.Group();
      if(kind==="jamo"){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:makeJamoTexture(char),transparent:true,depthWrite:false,depthTest:true,blending:THREE.NormalBlending}));sprite.scale.set(5.3,5.3,1);g.add(sprite);const light=new THREE.PointLight(0x52ffe2,1.5,9);g.add(light)}
      else {const mat=new THREE.MeshStandardMaterial({color:0x263e45,roughness:.95});const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1.25,0),mat);rock.scale.set(1,1.45,1);rock.rotation.set(.2,Math.random()*3,.15);rock.castShadow=true;g.add(rock);const foam=new THREE.Mesh(new THREE.RingGeometry(1.25,1.8,22),new THREE.MeshBasicMaterial({color:0xb9fff2,transparent:true,opacity:.25,side:THREE.DoubleSide}));foam.rotation.x=-Math.PI/2;foam.position.y=-.85;g.add(foam)}
      g.position.set((Math.random()-.5)*15,kind==="jamo"?2.2:.65,-82-Math.random()*15);scene.add(g);objects.current.push({mesh:g,kind,char,hit:false});
    };
    const onResize=()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)};
    const onKey=(e:KeyboardEvent,d:boolean)=>{if(["ArrowLeft","ArrowRight","a","d","A","D"," "].includes(e.key))e.preventDefault();if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")keys.current.left=d;if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")keys.current.right=d;if(e.key===" "&&d){game.current.running=!game.current.running;sync()}};
    const kd=(e:KeyboardEvent)=>onKey(e,true),ku=(e:KeyboardEvent)=>onKey(e,false);window.addEventListener("resize",onResize);window.addEventListener("keydown",kd,{passive:false});window.addEventListener("keyup",ku);
    const loop=(now:number)=>{const dt=Math.min(2,(now-last)/16.67);last=now;const t=now*.001,s=game.current;oceanMat.uniforms.uTime.value=t;
      if(s.running&&s.health>0){if(keys.current.left)s.x-=.105*dt;if(keys.current.right)s.x+=.105*dt;s.x=Math.max(-7.5,Math.min(7.5,s.x));spawn-=dt;if(spawn<=0){const m=MISSIONS[s.mission%MISSIONS.length],need=m.pieces[s.collected.length];addObject("jamo",Math.random()<.82?need:["ㄱ","ㅅ","ㅜ","ㅣ","ㅈ"][Math.floor(Math.random()*5)]);if(Math.random()<.28)addObject("rock");spawn=180+Math.random()*65}
        objects.current.forEach(o=>{o.mesh.position.z+=s.speed*dt;o.mesh.rotation.y+=o.kind==="jamo"?.012*dt:.003*dt;if(o.kind==="jamo")o.mesh.position.y=2.25+Math.sin(t*2+o.mesh.id)*.25;
          if(!o.hit&&o.mesh.position.z>3&&o.mesh.position.z<7){const range=o.kind==="jamo"?1.65:.82;if(Math.abs(o.mesh.position.x-s.x)<range){o.hit=true;if(o.kind==="rock"){s.health--;s.streak=0;if(!s.muted)sound("hit");sync(s.health?"천천히 피하면 괜찮아요. 배가 더 튼튼해졌어요!":"잠시 쉬었다 다시 출항해요.");}
            else{const m=MISSIONS[s.mission%MISSIONS.length],need=m.pieces[s.collected.length];if(o.char===need){const targetIndex=s.collected.length;launchGlyph(o.char,targetIndex,o.mesh.getWorldPosition(new THREE.Vector3()),camera,host);scene.remove(o.mesh);s.collected.push(o.char);s.score+=100;s.streak++;if(!s.muted)sound("collect");if(s.collected.length===m.pieces.length){s.score+=500;s.mission++;setTimeout(()=>{s.collected=[];s.mission++;sync(`“${m.word}” 완성! 정말 잘했어요!`)},780);s.mission--;if(!s.muted)sound("complete");sync(`${o.char} 획득! 단어가 완성됐어요!`)}else sync(`${o.char} 획득! 다음은 ${m.pieces[s.collected.length]} 차례예요.`)}else{scene.remove(o.mesh);sync("괜찮아요. 빛나는 정답 자모가 다시 나타나요.")}}}}});
        const gone=objects.current.filter(o=>o.mesh.position.z>18||o.hit);gone.filter(o=>o.mesh.parent).forEach(o=>scene.remove(o.mesh));objects.current=objects.current.filter(o=>o.mesh.position.z<=18&&!o.hit);
      }
      boat.position.x+=(s.x-boat.position.x)*.08;boat.position.y=.7+Math.sin(t*1.8)*.12;boat.rotation.z+=(Math.max(-.16,Math.min(.16,(boat.position.x-s.x)*.12))-boat.rotation.z)*.08;boat.rotation.x=Math.sin(t*1.3)*.025;
      camera.position.x+=(boat.position.x*.3-camera.position.x)*.04;camera.lookAt(boat.position.x*.15,1,-13);renderer.render(scene,camera);raf=requestAnimationFrame(loop)};
    raf=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);renderer.dispose();host.removeChild(renderer.domElement)};
  },[sound,sync,launchGlyph]);

  const mission=MISSIONS[ui.mission%MISSIONS.length];const hold=(side:"left"|"right",on:boolean)=>{keys.current[side]=on};
  const restart=()=>{objects.current.forEach(o=>o.mesh.parent?.remove(o.mesh));objects.current=[];game.current=initialState();sync("천천히 다시 출항해 볼까요?")};
  return <main className="game-shell">
    <div ref={mount} className="three-stage" aria-label="자모를 모으며 항해하는 실제 3D 바다 게임"/>
    <div className="vignette"/>
    <header className="topbar"><div className="brand"><span className="brand-mark">ㅂ</span><div><b>글자바다</b><small>JAMO VOYAGE</small></div></div><div className="stats"><span><i>점수</i><b>{ui.score.toLocaleString()}</b></span><span><i>연속 성공</i><b>× {ui.streak}</b></span><span className="hearts" aria-label={`남은 기회 ${ui.health}개`}>{[0,1,2,3,4].map(n=><b key={n} className={n<ui.health?"on":""}>♥</b>)}</span></div><button className="sound" onClick={()=>{game.current.muted=!game.current.muted;sync()}}>{ui.muted?"소리 끔":"♪ 소리 켬"}</button></header>
    <section className="mission-card"><div className="mission-kicker">오늘의 항해 · {ui.mission+1}번째 단어</div><div className="mission-row"><div><h1>{mission.word}</h1><p>{mission.hint}</p></div><div className="slots">{mission.pieces.map((p,i)=><span data-slot={i} key={i} className={i<ui.collected.length?"filled":i===ui.collected.length?"next":""}>{i<ui.collected.length?ui.collected[i]:p}</span>)}</div></div><div className="next-guide">다음에 모을 자모 <strong>{mission.pieces[ui.collected.length]}</strong></div></section>
    <aside className="teacher-panel"><span>편안한 항해</span><label>속도<select aria-label="항해 속도" value={String(ui.speed)} onChange={e=>{const speed=parseFloat(e.currentTarget.value);game.current.speed=speed;sync(speed===.045?"아주 천천히 항해합니다.":speed===.08?"천천히 항해합니다.":"보통 속도로 항해합니다.")}}><option value="0.045">아주 천천히</option><option value="0.08">천천히</option><option value="0.14">보통</option></select></label><b className="speed-now">{ui.speed===.045?"거북이 속도":ui.speed===.08?"산책 속도":"씽씽 속도"}</b><small>틀려도 감점하지 않아요</small></aside>
    <div className="toast" role="status">{ui.toast}</div>
    <div className="fx-layer">{flights.map(f=><span key={f.id} className="flying-glyph" style={{"--sx":`${f.sx}px`,"--sy":`${f.sy}px`,"--tx":`${f.tx}px`,"--ty":`${f.ty}px`} as React.CSSProperties} onAnimationEnd={()=>setFlights(v=>v.filter(x=>x.id!==f.id))}>{f.char}<i/><i/><i/><i/><i/><i/></span>)}</div>
    <div className="controls"><button onPointerDown={()=>hold("left",true)} onPointerUp={()=>hold("left",false)} onPointerCancel={()=>hold("left",false)} aria-label="왼쪽으로 이동"><span>←</span><small>왼쪽</small></button><button className="pause" onClick={()=>{game.current.running=!game.current.running;sync(game.current.running?"다시 천천히 출항합니다.":"잠시 쉬어가도 괜찮아요.")}}>{ui.running?"Ⅱ":"▶"}<small>{ui.running?"쉬기":"계속"}</small></button><button onPointerDown={()=>hold("right",true)} onPointerUp={()=>hold("right",false)} onPointerCancel={()=>hold("right",false)} aria-label="오른쪽으로 이동"><span>→</span><small>오른쪽</small></button></div>
    {!ui.running&&ui.health>0&&<div className="overlay"><div><span>⚓</span><h2>잠시 쉬는 중</h2><p>준비되면 다시 시작해요. 서두르지 않아도 괜찮습니다.</p><button onClick={()=>{game.current.running=true;sync("다시 천천히 출항합니다.")}}>계속 항해하기</button></div></div>}
    {ui.health<=0&&<div className="overlay"><div><span>🌊</span><h2>멋진 항해였어요</h2><p><b>{ui.score.toLocaleString()}점</b>을 모았어요. 다시 도전해 볼까요?</p><button onClick={restart}>다시 출항하기</button></div></div>}
  </main>
}
