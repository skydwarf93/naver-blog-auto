"use client";
import { useEffect, useState } from "react";
import { imagesPerDay, neuronsPerImage } from "@/lib/ai/neurons";

export type Visibility = "public" | "neighbor" | "both" | "private";
export interface Settings {
  dryRun: boolean; killSwitch: boolean; visibility: Visibility; dailyPublishLimit: number; minPublishIntervalMin: number;
  scrapeTopN: number; imageCandidates: number; cfImageSteps: number; showBrowser: boolean; claudeTimeoutSec: number; claudeConcurrency: number;
}
export type Limits = Record<string, [number, number]>;
export const VIS_LABEL: Record<Visibility, string> = { public: "전체공개", neighbor: "이웃공개", both: "서로이웃공개", private: "비공개" };

function Switch({ on, onChange, label, danger }: { on: boolean; onChange: (v: boolean) => void; label: string; danger?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${danger ? " danger" : ""}`} onClick={() => onChange(!on)} />;
}

function Num({ k, value, limits, onSave }: { k: keyof Settings; value: number; limits: Limits; onSave: (k: keyof Settings, v: number) => void }) {
  // 입력 중에는 자유롭게 두고, 저장 시 서버가 범위로 잘라낸다(클램프)
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const [lo, hi] = limits[k as string] ?? [0, 9999];
  return (
    <input type="number" className="num" value={v} min={lo} max={hi}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(k, Number(v))}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

export default function SettingsDrawer({ settings, limits, onPatch, onReset, onClose }: {
  settings: Settings; limits: Limits; onPatch: (p: Partial<Settings>) => void; onReset: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const save = (k: keyof Settings, v: number) => onPatch({ [k]: v } as Partial<Settings>);
  const per = neuronsPerImage(settings.cfImageSteps);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="설정">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>설정</h2>
          <button className="btn ghost" onClick={onClose} aria-label="닫기">닫기 (Esc)</button>
        </div>
        <p className="muted small">바꾸는 즉시 저장됩니다.</p>

        <h3>발행 안전장치</h3>
        <div className="set"><div className="t"><b>연습 모드</b><span>켜져 있으면 발행하지 않고 완성 화면만 저장합니다</span></div>
          <Switch on={settings.dryRun} label="연습 모드" onChange={(v) => onPatch({ dryRun: v })} /></div>
        <div className="set"><div className="t"><b>전체 중단</b><span>켜면 어떤 글도 발행되지 않습니다</span></div>
          <Switch danger on={settings.killSwitch} label="전체 중단" onChange={(v) => onPatch({ killSwitch: v })} /></div>
        <div className="set" style={{ display: "block" }}>
          <div className="t"><b>공개 범위</b><span>처음에는 비공개를 권합니다. 나만 보고 나중에 바꿀 수 있습니다</span></div>
          <div className="seg" style={{ marginTop: 8 }}>
            {(["public", "neighbor", "both", "private"] as Visibility[]).map((v) => (
              <button key={v} aria-pressed={settings.visibility === v} onClick={() => onPatch({ visibility: v })}>
                {VIS_LABEL[v]}{v === "private" ? " (기본값)" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="set"><div className="t"><b>하루 발행 수</b><span>이 앱의 자체 브레이크입니다 (네이버가 정한 값 아님)</span></div>
          <Num k="dailyPublishLimit" value={settings.dailyPublishLimit} limits={limits} onSave={save} /></div>
        <div className="set"><div className="t"><b>최소 발행 간격(분)</b><span>글과 글 사이에 이만큼 쉽니다</span></div>
          <Num k="minPublishIntervalMin" value={settings.minPublishIntervalMin} limits={limits} onSave={save} /></div>

        <h3>글감과 사진</h3>
        <div className="set"><div className="t"><b>검색 수집량</b><span>뉴스·블로그를 각각 몇 건 읽을지</span></div>
          <Num k="scrapeTopN" value={settings.scrapeTopN} limits={limits} onSave={save} /></div>
        <div className="set"><div className="t"><b>사진 후보 수</b><span>사진 한 자리마다 몇 장까지 살펴볼지. 낮추면 자리가 빌 수 있습니다(권장 10)</span></div>
          <Num k="imageCandidates" value={settings.imageCandidates} limits={limits} onSave={save} /></div>
        <div className="set"><div className="t"><b>AI 사진 품질(단계)</b>
          <span className="num">지금은 장당 {Math.round(per)} 뉴런 — 무료 한도로 하루 {imagesPerDay(settings.cfImageSteps)}장</span></div>
          <Num k="cfImageSteps" value={settings.cfImageSteps} limits={limits} onSave={save} /></div>

        <h3>실행 방식</h3>
        <div className="set"><div className="t"><b>브라우저 보기</b><span>작업하는 브라우저 창을 화면에 띄웁니다</span></div>
          <Switch on={settings.showBrowser} label="브라우저 보기" onChange={(v) => onPatch({ showBrowser: v })} /></div>
        <div className="set"><div className="t"><b>AI 동시 실행</b><span>한 번에 몇 개까지 AI 를 돌릴지</span></div>
          <Num k="claudeConcurrency" value={settings.claudeConcurrency} limits={limits} onSave={save} /></div>
        <div className="set"><div className="t"><b>AI 응답 대기(초)</b><span>이 시간이 지나면 다시 시도합니다</span></div>
          <Num k="claudeTimeoutSec" value={settings.claudeTimeoutSec} limits={limits} onSave={save} /></div>

        <div style={{ marginTop: 24 }}>
          <button className="btn" onClick={() => { if (confirm("모든 설정을 기본값으로 되돌릴까요?")) onReset(); }}>기본값으로 되돌리기</button>
        </div>
      </aside>
    </>
  );
}
