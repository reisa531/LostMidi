"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type Synth from "webaudio-tinysynth";
import type { Song, Recording } from "@/lib/listening-room";

type Pick = {song:Song; version:Recording};
const media = (key:string) => "/admin/player/media/"+key;
const basename = (name:string) => name.split("/").at(-1) ?? name;
let engine: Synth | undefined;
async function synthesizer() {
  const {default: TinySynth}=await import("webaudio-tinysynth");
  return engine ??= new TinySynth({quality:1,voices:96});
}

export function ListeningRoom({ songs }: {songs:Song[]}) {
  const playable=songs.flatMap(song => song.versions.map(version => ({song,version})));
  const [current, setCurrent]=useState<Pick | null>(playable[0] ?? null);
  const [queue,setQueue]=useState<Pick[]>([]);
  const [filter,setFilter]=useState("");
  const [view,setView]=useState("library");
  const [status,setStatus]=useState<"idle"|"loading"|"playing"|"paused"|"error">("idle");
  const [progress,setProgress]=useState(0);
  const audio=useRef<HTMLAudioElement>(null);
  const loaded=useRef("");
  const request=useRef<AbortController | null>(null);
  const started=useRef(false);
  function stop() {
    request.current?.abort();
    engine?.stopMIDI();
    audio.current?.pause();
    started.current=false;
  }
  useEffect(() => () => {
    request.current?.abort(); engine?.stopMIDI();
  }, []);
  async function start(pick:Pick) {
    stop();
    const pending=new AbortController();
    request.current=pending;
    setCurrent(pick); setStatus("loading");
    try {
      if (pick.version.mime==="audio/midi") {
        const synth=await synthesizer();
        if (pending.signal.aborted) return;
        await synth.getAudioContext().resume();
        if (pending.signal.aborted) return;
        if (loaded.current!==pick.version.key) {
          const response=await fetch(media(pick.version.key),{cache:"no-store",signal:pending.signal});
          if (!response.ok) throw new Error();
          const bytes=await response.arrayBuffer();
          if (pending.signal.aborted) return;
          if (String.fromCharCode(...new Uint8Array(bytes,0,4))!=="MThd") throw new Error();
          synth.loadMIDI(bytes);
          if (!synth.getPlayStatus().maxTick) throw new Error();
        }
        synth.playMIDI();
      } else {
        const el=audio.current!;
        if (loaded.current!==pick.version.key) el.src=media(pick.version.key);
        await el.play();
      }
      if (!pending.signal.aborted) {loaded.current=pick.version.key;started.current=true;setStatus("playing");}
    } catch {
      if (!pending.signal.aborted) {loaded.current=""; setStatus("error");}
    }
  }
  function choose(pick:Pick) {
    loaded.current="";
    setProgress(0);
    void start(pick);
  }
  function advance(step:number, automatic=false) {
    if (step===1 && queue.length) {
      const [first,...rest]=queue;
      setQueue(rest);choose(first);return;
    }
    const idx=playable.findIndex(p=>p.version.key===current?.version.key);
    if (automatic && idx===playable.length-1) {stop();loaded.current="";setStatus("idle");setProgress(0);return;}
    if (playable.length) choose(playable[(idx+step+playable.length)%playable.length]);
  }
  const tick=useEffectEvent(() => {
    if (!started.current || !current) return;
    if (current.version.mime==="audio/midi" && engine) {
      const state=engine.getPlayStatus();
      if (!state.play) {started.current=false; advance(1,true);return;}
      setProgress(state.maxTick ? Math.min(100,state.curTick*100/state.maxTick) : 0);
    } else if (audio.current?.duration) setProgress(audio.current.currentTime*100/audio.current.duration);
  });
  useEffect(() => {
    if(status!=="playing") return;
    const id=window.setInterval(tick,250);return () => clearInterval(id);
  }, [status]);
  function toggle() {
    if (!current) return;
    if (status==="playing" || status==="loading") {stop();setStatus("paused");}
    else void start(current);
  }
  function seek(percent:number) {
    if (!current || loaded.current!==current.version.key) return;
    if (current.version.mime==="audio/midi" && engine) engine.locateMIDI(engine.getPlayStatus().maxTick*percent/100);
    else if (audio.current && Number.isFinite(audio.current.duration)) audio.current.currentTime=audio.current.duration*percent/100;
    setProgress(percent);
  }
  return <div className="listening-room">
    <div className="turntable">
      <div className="record-sleeve">{current?.song.cover ?
        /* eslint-disable-next-line @next/next/no-img-element -- Authenticated cover art must bypass the public optimizer. */
        <img src={media(current.song.cover)} alt={current.song.game+" 游戏画面"} /> : <div className="blank-sleeve">曲绘待补</div>}</div>
      <div className="record-panel"><p className="text-xs">正在点播</p><h2>{current?.song.title ?? "唱片架空着"}</h2>
        {current && <><p className="record-filename">{current.version.name}</p>
          {current.song.game && <small>{current.song.game.split(" · ")[0]}</small>}</>}
        <input type="range" aria-label="播放进度" min={0} max={100} step={0.1} value={progress} disabled={!current || ["loading","idle","error"].includes(status)} onChange={e=>seek(Number(e.target.value))} />
        <div className="listen-controls"><button disabled={!current} onClick={()=>advance(-1)}>上一首</button>
          <button disabled={!current} onClick={toggle}>{status==="playing" ? "暂停" : status==="loading" ? "取消载入" : status==="error" ? "重试" : "播放"}</button>
          <button disabled={!current} onClick={()=>advance(1)}>下一首</button></div>
        <p role="status" className="text-sm">{status==="loading" ? "正在取碟…" : status==="error" ? "音源暂时无法读取，请重试或选另一首。" : status==="playing" ? "播放中" : status==="paused" ? "已暂停" : ""}</p>
      </div>
    </div>
    <audio ref={audio} preload="none" onEnded={()=>{if(started.current) advance(1,true);}} onError={()=>{if(current && current.version.mime!=="audio/midi") {started.current=false;setStatus("error");}}} />
    <div className="library-tabs"><button aria-pressed={view==="library"} onClick={()=>setView("library")}>资料库 · {songs.length}</button>
      <button aria-pressed={view==="queue"} onClick={()=>setView("queue")}>待播 · {queue.length}</button></div>
    {view==="library" ? <section aria-label="音乐资料库"><label className="library-search">查唱片<input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="曲名或文件名" /></label>
      <ol className="play-list">{songs.filter(s=>(s.title+" "+s.versions.map(v=>v.name).join(" ")).toLowerCase().includes(filter.toLowerCase())).map(song=><li key={song.id}>
        <strong>{song.title}</strong>{song.versions.length ? song.versions.map(version=><div className="track-row" key={version.key}>
          <button onClick={()=>choose({song,version})} aria-label={"点播 "+song.title+" "+basename(version.name)}>▷ {basename(version.name)}</button>
          <button aria-label={"加入待播 "+basename(version.name)} onClick={()=>setQueue(q=>[...q,{song,version}])}>＋待播</button></div>) :
          <small>暂无音源，待补档。</small>}</li>)}</ol>
    </section> : <section aria-label="待播曲目">{!queue.length && <p>待播单空着。到资料库点「＋待播」即可排入下一首。</p>}
      <ol className="play-list">{queue.map((pick,i)=><li key={pick.version.key+"-"+i}><strong>{pick.song.title}</strong><div className="track-row">
        <button onClick={()=>{setQueue(q=>q.filter((_,j)=>i!==j));choose(pick);}}>▷ {basename(pick.version.name)}</button>
        <button onClick={()=>setQueue(q=>q.filter((_,j)=>i!==j))}>移出</button></div></li>)}</ol></section>}
  </div>;
}
