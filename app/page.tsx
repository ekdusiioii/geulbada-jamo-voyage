"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./game.css";

type Orb = { id: number; x: number; z: number; char: string; kind: "jamo" | "rock"; bob: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const MISSIONS = [
  { word: "바다", pieces: ["ㅂ", "ㅏ", "ㄷ", "ㅏ"], hint: "넓고 푸른 물결" },
  { word: "파도", pieces: ["ㅍ", "ㅏ", "ㄷ", "ㅗ"], hint: "철썩이며 밀려오는 물결" },
  { word: "하늘", pieces: ["ㅎ", "ㅏ", "ㄴ", "ㅡ", "ㄹ"], hint: "돛 위로 펼쳐진 푸른 공간" },
  { word: "고래", pieces: ["ㄱ", "ㅗ", "ㄹ", "ㅐ"], hint: "바다에서 가장 큰 친구" },
  { word: "보물", pieces: ["ㅂ", "ㅗ", "ㅁ", "ㅜ", "ㄹ"], hint: "섬에 숨겨진 반짝이는 것" },
];

function useSynth() {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback((type: "collect" | "hit" | "complete" | "splash") => {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = ctx.current || (ctx.current = new Ctx());
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    const notes = type === "complete" ? [523, 659, 784, 1047] : [type === "hit" ? 85 : type === "splash" ? 150 : 660];
    gain.gain.setValueAtTime(type === "hit" ? 0.16 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (type === "complete" ? 0.7 : 0.22));
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      osc.type = type === "hit" ? "sawtooth" : type === "splash" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      osc.connect(gain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.18);
    });
  }, []);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ x: 0, speed: 0.014, health: 3, score: 0, streak: 0, mission: 0, collected: [] as string[], running: true, muted: false });
  const orbsRef = useRef<Orb[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const keys = useRef({ left: false, right: false });
  const [ui, setUi] = useState({ score: 0, health: 3, streak: 0, mission: 0, collected: [] as string[], running: true, toast: "자모를 순서대로 모아 단어를 완성하세요!" });
  const play = useSynth();

  const sync = useCallback((toast?: string) => {
    const s = stateRef.current;
    setUi(v => ({ score: s.score, health: s.health, streak: s.streak, mission: s.mission, collected: [...s.collected], running: s.running, toast: toast ?? v.toast }));
  }, []);

  const restart = useCallback(() => {
    stateRef.current = { x: 0, speed: 0.014, health: 3, score: 0, streak: 0, mission: 0, collected: [], running: true, muted: false };
    orbsRef.current = [];
    sparksRef.current = [];
    sync("새 항해를 시작합니다. 순서대로 모아보세요!");
  }, [sync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.current.left = down;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.current.right = down;
      if (e.key === " " && down) { stateRef.current.running = !stateRef.current.running; sync(); }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd, { passive: false });
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [sync]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, last = performance.now(), spawn = 0, wave = 0, id = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);
    const burst = (x: number, y: number, color: string) => {
      for (let i = 0; i < 22; i++) sparksRef.current.push({ x, y, vx: (Math.random() - .5) * 5, vy: -Math.random() * 4, life: 1, color });
    };
    const frame = (now: number) => {
      const dt = Math.min(2, (now - last) / 16.67); last = now;
      const w = canvas.clientWidth, h = canvas.clientHeight, horizon = h * .34;
      const s = stateRef.current; wave += .025 * dt;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#071b38"); sky.addColorStop(.55, "#147b9a"); sky.addColorStop(1, "#f4c77a");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = "rgba(255,222,151,.85)"; ctx.beginPath(); ctx.arc(w * .78, horizon * .5, Math.min(w,h)*.055, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,240,190,.12)"; ctx.beginPath(); ctx.arc(w * .78, horizon*.5, Math.min(w,h)*.09, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#063f57"; ctx.beginPath(); ctx.moveTo(w*.05,horizon); ctx.lineTo(w*.18,horizon-28); ctx.lineTo(w*.32,horizon); ctx.fill();
      ctx.fillStyle = "#0b5364"; ctx.beginPath(); ctx.moveTo(w*.72,horizon); ctx.lineTo(w*.87,horizon-38); ctx.lineTo(w,horizon); ctx.fill();
      const sea = ctx.createLinearGradient(0,horizon,0,h); sea.addColorStop(0,"#087b96"); sea.addColorStop(1,"#03283f"); ctx.fillStyle=sea; ctx.fillRect(0,horizon,w,h-horizon);
      for(let row=0; row<14; row++){ const y=horizon+12+row*row*2.3; ctx.strokeStyle=`rgba(125,235,226,${.18+row*.012})`; ctx.lineWidth=1+row*.08; ctx.beginPath(); for(let x=0;x<w+30;x+=30){ctx.lineTo(x,y+Math.sin(x*.025+wave+row)*(.8+row*.16));} ctx.stroke(); }
      if (s.running && s.health > 0) {
        if(keys.current.left) s.x -= .035*dt; if(keys.current.right) s.x += .035*dt; s.x=Math.max(-.86,Math.min(.86,s.x));
        spawn -= dt;
        if(spawn<=0){
          const mission=MISSIONS[s.mission%MISSIONS.length], needed=mission.pieces[s.collected.length];
          orbsRef.current.push({id:id++,x:(Math.random()*1.7)-.85,z:1,char:Math.random()<.72?needed:["ㄱ","ㅅ","ㅜ","ㅣ","ㅈ"][Math.floor(Math.random()*5)],kind:"jamo",bob:Math.random()*6});
          if(Math.random()<.48) orbsRef.current.push({id:id++,x:(Math.random()*1.7)-.85,z:1.12,char:"",kind:"rock",bob:0});
          spawn=48+Math.random()*28;
        }
        orbsRef.current.forEach(o=>o.z-=s.speed*dt);
        orbsRef.current = orbsRef.current.filter(o=>{
          if(o.z<.08){
            if(Math.abs(o.x-s.x)<.18){
              const sx=w/2+s.x*w*.36, sy=h*.76;
              if(o.kind==="rock"){ s.health--; s.streak=0; burst(sx,sy,"#ff7c5c"); if(!s.muted) play("hit"); sync(s.health<=0?"배가 암초에 부딪혔어요! 다시 도전해 보세요.":"암초 조심! 방향을 틀어주세요."); }
              else {
                const m=MISSIONS[s.mission%MISSIONS.length], expected=m.pieces[s.collected.length];
                if(o.char===expected){
                  s.collected.push(o.char); s.score+=100+s.streak*15; s.streak++; burst(sx,sy,"#ffd76b"); if(!s.muted) play("collect");
                  if(s.collected.length===m.pieces.length){ s.score+=500+s.streak*30; burst(w/2,h*.42,"#68fff0"); if(!s.muted) play("complete"); s.mission++; s.collected=[]; sync(`“${m.word}” 완성! 다음 섬을 향해 출항!`); }
                  else sync(`${o.char} 획득! 다음 자모를 찾아보세요.`);
                } else { s.streak=0; if(!s.muted) play("splash"); sync(`${o.char}은(는) 지금 필요한 자모가 아니에요.`); }
              }
            } return false;
          } return o.z>0;
        });
      }
      orbsRef.current.sort((a,b)=>b.z-a.z).forEach(o=>{
        const p=1-o.z, scale=.25+p*1.25, x=w/2+o.x*w*(.12+p*.33), y=horizon+(p*p)*(h-horizon)*.82;
        if(o.kind==="rock"){ctx.fillStyle="#253c47";ctx.beginPath();ctx.moveTo(x-22*scale,y+12*scale);ctx.lineTo(x-13*scale,y-14*scale);ctx.lineTo(x+8*scale,y-22*scale);ctx.lineTo(x+24*scale,y+12*scale);ctx.fill();ctx.strokeStyle="#4e6970";ctx.stroke();}
        else { const yy=y+Math.sin(wave*2+o.bob)*5; ctx.shadowColor="#68fff0";ctx.shadowBlur=18*scale;ctx.fillStyle="rgba(16,54,70,.86)";ctx.beginPath();ctx.arc(x,yy,24*scale,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#8fffee";ctx.lineWidth=2;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#fff8d8";ctx.font=`800 ${28*scale}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(o.char,x,yy+1);}
      });
      const shipX=w/2+s.x*w*.36, shipY=h*.79+Math.sin(wave*1.7)*3;
      ctx.save(); ctx.translate(shipX,shipY); ctx.rotate((keys.current.left?-.06:keys.current.right?.06:0));
      ctx.fillStyle="#5a2d20";ctx.beginPath();ctx.moveTo(-48,-4);ctx.lineTo(43,-4);ctx.lineTo(28,24);ctx.lineTo(-30,28);ctx.closePath();ctx.fill();
      ctx.fillStyle="#d8a05d";ctx.fillRect(-3,-74,5,72);ctx.fillStyle="#f6e0ad";ctx.beginPath();ctx.moveTo(2,-70);ctx.lineTo(2,-14);ctx.lineTo(42,-25);ctx.closePath();ctx.fill();ctx.fillStyle="#e75b42";ctx.beginPath();ctx.moveTo(-4,-61);ctx.lineTo(-4,-15);ctx.lineTo(-35,-24);ctx.closePath();ctx.fill();ctx.restore();
      sparksRef.current = sparksRef.current.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.12*dt;p.life-=.025*dt;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);ctx.globalAlpha=1;return p.life>0;});
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  }, [play, sync]);

  const mission = MISSIONS[ui.mission % MISSIONS.length];
  const hold = (side:"left"|"right", down:boolean) => { keys.current[side]=down; };
  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="sea-canvas" aria-label="자모를 모으며 항해하는 3D 바다 게임" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark">ㅂ</span><div><b>글자바다</b><small>JAMO VOYAGE</small></div></div>
        <div className="stats"><span><i>점수</i><b>{ui.score.toLocaleString()}</b></span><span><i>연속</i><b>× {ui.streak}</b></span><span className="hearts" aria-label={`남은 배 ${ui.health}척`}>{[0,1,2].map(n=><b key={n} className={n<ui.health?"on":""}>♥</b>)}</span></div>
        <button className="sound" onClick={()=>{stateRef.current.muted=!stateRef.current.muted;setUi(v=>({...v}))}} aria-label="소리 켜기 또는 끄기">{stateRef.current.muted?"소리 끔":"♪ 소리 켬"}</button>
      </header>
      <section className="mission-card">
        <div className="mission-kicker">항해 목표 · {ui.mission+1}번째 섬</div>
        <div className="mission-row"><div><h1>{mission.word}</h1><p>{mission.hint}</p></div><div className="slots">{mission.pieces.map((p,i)=><span key={i} className={i<ui.collected.length?"filled":i===ui.collected.length?"next":""}>{ui.collected[i]||p}</span>)}</div></div>
      </section>
      <div className="toast">{ui.toast}</div>
      <div className="legend"><span><i className="orb-dot"/>자모 수집</span><span><i className="rock-dot"/>암초 회피</span></div>
      <div className="controls">
        <button onPointerDown={()=>hold("left",true)} onPointerUp={()=>hold("left",false)} onPointerLeave={()=>hold("left",false)} aria-label="왼쪽으로 항해">←<small>A</small></button>
        <button className="pause" onClick={()=>{stateRef.current.running=!stateRef.current.running;sync(stateRef.current.running?"다시 항해합니다!":"잠시 닻을 내렸어요.");}} aria-label="일시 정지">{ui.running?"Ⅱ":"▶"}</button>
        <button onPointerDown={()=>hold("right",true)} onPointerUp={()=>hold("right",false)} onPointerLeave={()=>hold("right",false)} aria-label="오른쪽으로 항해">→<small>D</small></button>
      </div>
      {!ui.running && ui.health>0 && <div className="overlay"><div><span>⚓</span><h2>잠시 정박 중</h2><p>스페이스바나 아래 버튼으로 항해를 이어가세요.</p><button onClick={()=>{stateRef.current.running=true;sync("다시 항해합니다!");}}>계속 항해</button></div></div>}
      {ui.health<=0 && <div className="overlay"><div><span>🌊</span><h2>항해 종료</h2><p><b>{ui.score.toLocaleString()}점</b>을 기록했어요. 다시 바람을 타볼까요?</p><button onClick={restart}>다시 출항</button></div></div>}
    </main>
  );
}
