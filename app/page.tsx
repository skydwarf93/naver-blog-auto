"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import SettingsDrawer, { VIS_LABEL, type Limits, type Settings } from "@/app/SettingsDrawer";
import { FREE_NEURONS_PER_DAY, neuronsPerImage } from "@/lib/ai/neurons";

type Mode = "auto" | "review" | "branding";
type PhotoSource = "none" | "local" | "crawl" | "ai";
interface Status {
  claude: { ok: boolean; version?: string; error?: string };
  naver: { valid: boolean; blogId?: string; reason?: string };
  cloudflare: boolean; settings: Settings; limits: Limits; platform: string;
}
interface Usage { publishedToday: number; dailyLimit: number; lastPublishedAt: string | null; neurons: { used: number; measured: boolean; note?: string } }
interface JobRow { id: number; keyword: string; status: string; stage: string; mode: Mode; created_at: string; post_status: string | null }
interface LogRow { id: number; level: string; message: string; created_at: string }
type Sec = { type: "heading" | "paragraph" | "quote" | "divider" | "image"; text?: string; highlight?: string; query?: string; caption?: string };
interface ImageRow { id: number; section_index: number; local_path: string; source_site: string; verdict_ok: number; verdict_reason: string; query: string }
interface JobDetail {
  job: { id: number; keyword: string; status: string; stage: string; error: string | null; mode: Mode };
  ideas: Array<{ id: number; title: string; angle: string; chosen: number }>;
  sources: Array<{ id: number; type: string; title: string; url: string }>;
  draft: { title: string; sections: Sec[] } | null;
  images: ImageRow[];
  post: { status: string; blog_url: string | null; screenshot: string | null; note: string } | null;
  logs: LogRow[];
}

const MODES: Array<{ id: Mode; name: string; desc: string }> = [
  { id: "auto", name: "자동 발굴", desc: "관심 키워드만 넣으면 요즘 화제를 읽고 글감을 골라 씁니다" },
  { id: "review", name: "체험단", desc: "다녀온 곳·써본 것을 1인칭 후기로 씁니다" },
  { id: "branding", name: "브랜딩·전문성", desc: "전문가 칼럼 구조로 신뢰를 쌓는 글을 씁니다" },
];
const PHOTO: Array<{ id: PhotoSource; name: string }> = [
  { id: "local", name: "내 사진" }, { id: "crawl", name: "검색해서 가져오기" }, { id: "ai", name: "AI가 그리기" }, { id: "none", name: "사진 없음" },
];
const RUNNING = new Set(["pending", "scraping", "writing", "imaging", "publishing"]);
const fileUrl = (p: string) => `/api/file?path=${encodeURIComponent(p)}`;

function stLabel(j: { status: string; stage: string; post_status?: string | null }) {
  if (RUNNING.has(j.status)) return { cls: "run", text: j.stage || "진행 중" };
  if (j.status === "failed") return { cls: "failed", text: "실패" };
  if (j.post_status === "published") return { cls: "published", text: "발행됨" };
  if (j.post_status === "dry_run") return { cls: "done", text: "연습 완료" };
  if (j.post_status === "blocked") return { cls: "failed", text: "발행 막힘" };
  return { cls: "done", text: j.stage || "완료" };
}

function Preview({ d, images }: { d: { title: string; sections: Sec[] }; images: ImageRow[] }) {
  const byIdx = new Map<number, ImageRow>();
  images.filter((i) => i.verdict_ok).forEach((i) => { if (!byIdx.has(i.section_index)) byIdx.set(i.section_index, i); });
  return (
    <div className="preview">
      <h1>{d.title}</h1>
      {d.sections.map((s, i) => {
        if (s.type === "heading") return <h3 key={i}>{s.text}</h3>;
        if (s.type === "quote") return <blockquote key={i}>{s.text}</blockquote>;
        if (s.type === "divider") return <hr key={i} />;
        if (s.type === "image") {
          const img = byIdx.get(i);
          return (
            <figure key={i}>
              {img ? <img src={fileUrl(img.local_path)} alt={s.caption || s.query || ""}
                  onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement("div"), { className: "slot", textContent: "내 사진: " + img.local_path.split(/[\\/]/).pop() })); }} />
                : <div className="slot">사진 자리 (알맞은 사진을 찾지 못해 비움) — {s.query}</div>}
              {s.caption && <figcaption>{s.caption}</figcaption>}
            </figure>
          );
        }
        const t = s.text || "";
        const at = s.highlight ? t.indexOf(s.highlight) : -1;
        return <p key={i}>{at < 0 ? t : <>{t.slice(0, at)}<mark>{s.highlight}</mark>{t.slice(at + s.highlight!.length)}</>}</p>;
      })}
    </div>
  );
}

export default function Page() {
  const [status, setStatus] = useState<Status | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [keyword, setKeyword] = useState("");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<PhotoSource>("crawl");
  const [style, setStyle] = useState<"photo" | "illust">("photo");
  const [photoDir, setPhotoDir] = useState("");
  const [placement, setPlacement] = useState<"order" | "ai">("ai");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogRow[]>([]);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginMsg, setLoginMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const loadStatus = useCallback(async (refresh = false) => {
    const r = await fetch("/api/status" + (refresh ? "?refresh=1" : "")).then((x) => x.json());
    setStatus(r);
  }, []);
  const loadUsage = useCallback(async () => setUsage(await fetch("/api/usage").then((x) => x.json())), []);
  const loadJobs = useCallback(async () => setJobs((await fetch("/api/jobs").then((x) => x.json())).jobs), []);
  const loadDetail = useCallback(async (id: number) => {
    const r = await fetch(`/api/jobs/${id}`);
    if (r.ok) setDetail(await r.json());
  }, []);

  useEffect(() => { loadStatus(); loadUsage(); loadJobs(); }, [loadStatus, loadUsage, loadJobs]);
  useEffect(() => { if (mode === "auto" && photo === "local") setPhoto("crawl"); }, [mode, photo]);

  // 선택한 작업의 진행 상황을 SSE 로
  useEffect(() => {
    esRef.current?.close();
    setLiveLogs([]);
    if (selected == null) return;
    loadDetail(selected);
    const es = new EventSource(`/api/jobs/${selected}/stream`);
    esRef.current = es;
    es.addEventListener("log", (e) => setLiveLogs((l) => [...l, JSON.parse((e as MessageEvent).data)]));
    es.addEventListener("stage", () => loadJobs());
    es.addEventListener("end", () => { es.close(); loadDetail(selected); loadJobs(); loadUsage(); });
    return () => es.close();
  }, [selected, loadDetail, loadJobs, loadUsage]);

  const s = status?.settings;
  const patch = async (p: Partial<Settings>) => {
    const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).then((x) => x.json());
    if (r.settings && status) setStatus({ ...status, settings: r.settings });
    loadUsage();
  };
  const reset = async () => {
    const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) }).then((x) => x.json());
    if (r.settings && status) setStatus({ ...status, settings: r.settings });
  };

  const login = async () => {
    setLoggingIn(true); setLoginMsg("새 창에서 네이버에 로그인해 주세요. '로그인 상태 유지' 를 꼭 켜주세요.");
    const r = await fetch("/api/naver/login", { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, message: "로그인 창을 열지 못했습니다" }));
    setLoginMsg(r.message);
    setLoggingIn(false);
    loadStatus(true);
  };
  const logout = async () => { await fetch("/api/naver/logout", { method: "POST" }); loadStatus(true); };

  const pickFolder = async () => {
    const r = await fetch("/api/pick-folder", { method: "POST" }).then((x) => x.json());
    if (r.path) setPhotoDir(r.path);
    else if (r.error) setError(r.error);
  };

  const running = jobs.some((j) => RUNNING.has(j.status));
  const aiBlocked = photo === "ai" && status && !status.cloudflare;
  const canRun = Boolean(keyword.trim()) && !starting && !running && !aiBlocked && !s?.killSwitch && Boolean(status?.claude.ok) && !(photo === "local" && !photoDir.trim());

  const start = async () => {
    if (!canRun || !s) return;
    if (!s.dryRun && !confirm(`연습 모드가 꺼져 있습니다.\n완성되는 글이 블로그에 "${VIS_LABEL[s.visibility]}" 로 실제로 올라갑니다. 계속할까요?`)) return;
    setStarting(true); setError("");
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keyword, details, photoSource: photo, imageStyle: style, photoDir, placement }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "시작하지 못했습니다"); if (j.jobId) setSelected(j.jobId); return; }
      setSelected(j.id);
      loadJobs();
    } finally { setStarting(false); }
  };

  // 상태 레일
  const rail = !s ? { c: "var(--line)", badge: "불러오는 중", msg: "" }
    : s.killSwitch ? { c: "var(--armed)", badge: "전체 중단", msg: "어떤 작업도 발행되지 않습니다" }
    : s.dryRun ? { c: "var(--safe)", badge: "연습 모드", msg: "발행하지 않고 완성 화면만 저장합니다" }
    : { c: "var(--armed)", badge: "실제 발행", msg: `완성되는 글이 블로그에 그대로 올라갑니다 (${VIS_LABEL[s.visibility]})` };
  const runLabel = !s ? "…" : s.killSwitch ? "전체 중단 중" : s.dryRun ? "연습으로 만들기" : "글 만들고 발행하기";

  const pubRatio = usage ? usage.publishedToday / Math.max(1, usage.dailyLimit) : 0;
  const nRatio = usage ? usage.neurons.used / FREE_NEURONS_PER_DAY : 0;
  const lvl = (r: number) => (r >= 0.9 ? "armed" : r >= 0.7 ? "live" : "");
  const logs = liveLogs.length ? liveLogs : detail?.logs ?? [];
  const rejected = detail?.images.filter((i) => !i.verdict_ok) ?? [];

  return (
    <>
      <header className="rail" style={{ ["--c" as string]: rail.c }}>
        <span className="badge">{rail.badge}</span>
        <span className="msg">{rail.msg}</span>
        <span className="spacer" />
        <div className="dots" aria-label="연결 상태">
          <span className={`dot ${status ? (status.claude.ok ? "on" : "off") : ""}`} title={status?.claude.version || status?.claude.error}><i />Claude</span>
          <span className={`dot ${status ? (status.naver.valid ? "on" : "off") : ""}`} title={status?.naver.reason}><i />네이버</span>
          <span className={`dot ${status ? (status.cloudflare ? "on" : "off") : ""}`}><i />이미지 생성</span>
        </div>
        <button className="btn" onClick={() => setDrawer(true)}>설정</button>
      </header>

      <main className="wrap">
        <section className="meters">
          <div className={`meter ${lvl(pubRatio)}`}>
            <div className="muted small">오늘 발행</div>
            <div className="v num">{usage?.publishedToday ?? "–"} / {usage?.dailyLimit ?? "–"}편</div>
            <div className="bar"><span style={{ width: `${Math.min(100, pubRatio * 100)}%` }} /></div>
            <div className="muted small">{usage && usage.publishedToday >= usage.dailyLimit ? "오늘 한도에 도달했습니다 — 설정에서 늘릴 수 있습니다" : `글 사이 최소 ${s?.minPublishIntervalMin ?? "–"}분 간격`}</div>
          </div>
          <div className={`meter ${lvl(nRatio)}`}>
            <div className="muted small">이미지 생성량</div>
            <div className="v num">{usage ? Math.round(usage.neurons.used).toLocaleString() : "–"} / {FREE_NEURONS_PER_DAY.toLocaleString()} 뉴런</div>
            <div className="bar"><span style={{ width: `${Math.min(100, nRatio * 100)}%` }} /></div>
            <div className="muted small num">{usage?.neurons.measured ? "실측" : "추정치"} · 장당 {s ? Math.round(neuronsPerImage(s.cfImageSteps)) : "–"} 뉴런</div>
          </div>
          <div className="meter">
            <div className="muted small">네이버 로그인</div>
            <div className="v" style={{ fontSize: 18, color: status?.naver.valid ? "var(--safe)" : "var(--armed)" }}>
              {status ? (status.naver.valid ? `연결됨 (${status.naver.blogId})` : status.naver.reason || "로그인 필요") : "확인 중…"}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={login} disabled={loggingIn}>{loggingIn ? "로그인 창 열림…" : "네이버 로그인"}</button>
              {status?.naver.valid && <button className="btn ghost" onClick={logout}>로그아웃</button>}
              <button className="btn ghost" onClick={() => loadStatus(true)}>다시 확인</button>
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>{loginMsg || "로그인할 때 '로그인 상태 유지' 를 켜면 한 달간 유지됩니다."}</div>
          </div>
        </section>

        {status && !status.claude.ok && <div className="card warn">AI 를 실행하는 프로그램(claude)을 찾지 못했습니다: {status.claude.error}</div>}

        <div className="cols">
          <div style={{ display: "grid", gap: 20 }}>
            <section className="card">
              <h2>새 글 만들기</h2>
              <div className="types">
                {MODES.map((m) => (
                  <button key={m.id} className="type" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}><b>{m.name}</b><span>{m.desc}</span></button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="kw">{mode === "auto" ? "관심 키워드" : "주제"}</label>
                <input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={mode === "auto" ? "예: 제주도 여행, 홈카페" : mode === "review" ? "예: 성수동 ○○카페 방문 후기" : "예: 소상공인 세무 절세 전략"} />
              </div>
              {mode !== "auto" && (
                <div className="field">
                  <label htmlFor="dt">핵심 내용 {mode === "branding" ? "(실적 숫자는 여기 적힌 것만 씁니다)" : "(가격·위치·느낀 점 등)"}</label>
                  <textarea id="dt" value={details} onChange={(e) => setDetails(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label>사진</label>
                <div className="seg">
                  {PHOTO.filter((p) => mode !== "auto" || p.id !== "local").map((p) => (
                    <button key={p.id} aria-pressed={photo === p.id} onClick={() => setPhoto(p.id)}>{p.name}</button>
                  ))}
                </div>
                {photo === "ai" && status && !status.cloudflare && <span className="warn">AI 사진 생성 열쇠가 없습니다. "검색해서 가져오기" 를 고르면 바로 쓸 수 있습니다.</span>}
                {photo === "crawl" && <span className="muted small">검색 사진은 저작권을 보장하지 않습니다. 워터마크·한국인 얼굴이 보이는 사진은 자동으로 뺍니다.</span>}
              </div>
              {photo === "ai" && (
                <div className="field"><label>그림체</label>
                  <div className="seg">
                    <button aria-pressed={style === "photo"} onClick={() => setStyle("photo")}>실사</button>
                    <button aria-pressed={style === "illust"} onClick={() => setStyle("illust")}>일러스트</button>
                  </div>
                </div>
              )}
              {photo === "local" && (
                <>
                  <div className="field"><label htmlFor="pd">사진 폴더</label>
                    <div className="row"><input id="pd" value={photoDir} onChange={(e) => setPhotoDir(e.target.value)} placeholder="폴더 경로 (직접 입력도 됩니다)" />
                      <button className="btn" onClick={pickFolder}>폴더 고르기</button></div>
                  </div>
                  <div className="field"><label>사진 배치</label>
                    <div className="seg">
                      <button aria-pressed={placement === "ai"} onClick={() => setPlacement("ai")}>AI가 어울리게</button>
                      <button aria-pressed={placement === "order"} onClick={() => setPlacement("order")}>파일 순서대로</button>
                    </div>
                  </div>
                </>
              )}
              {s && (
                <div className="vis-note">
                  {s.dryRun ? <>연습 모드: 실제로 올라가지 않습니다.</> : <>올라갈 공개 범위: <b className={s.visibility === "private" ? "priv" : "pub"}>{VIS_LABEL[s.visibility]}</b></>}
                </div>
              )}
              <button className={`btn ${s?.dryRun ? "safe" : "armed"}`} disabled={!canRun} onClick={start}>{starting ? "시작하는 중…" : running ? "다른 작업이 진행 중입니다" : runLabel}</button>
              {error && <p className="warn">{error}</p>}
            </section>

            <section className="card">
              <h2>최근 작업</h2>
              {jobs.length === 0 ? <p className="muted small">아직 만든 글이 없습니다.</p> : (
                <ul className="jobs">
                  {jobs.map((j) => {
                    const l = stLabel(j);
                    return (
                      <li key={j.id}><button aria-pressed={selected === j.id} onClick={() => setSelected(j.id)}>
                        <span>{j.keyword} <span className="muted small">· {MODES.find((m) => m.id === j.mode)?.name}</span></span>
                        <span className={`st ${l.cls}`}>{l.text}</span>
                      </button></li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2>진행 상황과 결과</h2>
            {!selected && <p className="muted small">왼쪽에서 글을 만들거나 최근 작업을 누르면 여기에 보입니다.</p>}
            {selected && (
              <>
                <div className="logs" aria-live="polite">
                  {logs.map((l) => <div key={l.id} className={l.level}>{l.created_at.slice(11, 19)} {l.message}</div>)}
                  {!logs.length && <span className="muted">기다리는 중…</span>}
                </div>
                {detail?.post && (
                  <div style={{ marginTop: 12 }}>
                    <b>{detail.post.status === "published" ? "발행됨" : detail.post.status === "dry_run" ? "연습 완료" : detail.post.status === "blocked" ? "발행 막힘" : "발행 실패"}</b>
                    <span className="muted"> — {detail.post.note}</span>
                    {detail.post.blog_url && <div><a href={detail.post.blog_url} target="_blank" rel="noreferrer">{detail.post.blog_url}</a></div>}
                    {detail.post.screenshot && (
                      <details open={detail.post.status !== "published"}><summary className="small">완성 화면 보기</summary>
                        <img className="shot" src={fileUrl(detail.post.screenshot)} alt="글쓰기 화면 완성 모습" /></details>
                    )}
                  </div>
                )}
                {detail?.job.status === "failed" && detail.job.error && !detail.post && <p className="warn">{detail.job.error}</p>}
                {detail && detail.ideas.length > 0 && (
                  <details style={{ marginTop: 12 }}><summary className="small">글감 {detail.ideas.length}개 · 참고 자료 {detail.sources.length}건</summary>
                    <ol className="small">{detail.ideas.map((i) => <li key={i.id}>{i.chosen ? <b>{i.title}</b> : i.title} <span className="muted">— {i.angle}</span></li>)}</ol>
                  </details>
                )}
                {rejected.length > 0 && (
                  <details style={{ marginTop: 8 }}><summary className="small">뺀 사진 {rejected.length}장 (이유 보기)</summary>
                    <div className="rejected">{rejected.map((r) => (
                      <figure key={r.id}>{r.source_site !== "local" && <img src={fileUrl(r.local_path)} alt="" />}<figcaption>{r.verdict_reason}</figcaption></figure>
                    ))}</div>
                  </details>
                )}
                {detail?.draft && <Preview d={detail.draft} images={detail.images} />}
              </>
            )}
          </section>
        </div>
        <p className="muted small">자동 발행은 네이버 이용약관상 계정 제재 위험이 있습니다. 그래서 연습 모드가 기본이고, 하루 발행 수·간격·전체 중단 장치가 있습니다.</p>
      </main>

      {drawer && s && status && <SettingsDrawer settings={s} limits={status.limits} onPatch={patch} onReset={reset} onClose={() => setDrawer(false)} />}
    </>
  );
}
