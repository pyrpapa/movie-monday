import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────
const TMDB_TOKEN = import.meta.env.VITE_TMDB_TOKEN;
const TMDB_BASE  = "https://api.themoviedb.org/3";
const TMDB_IMG   = "https://image.tmdb.org/t/p/w300";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const DEMO_ENABLED = import.meta.env.VITE_DEMO_ENABLED === "true";

const GENRE_MAP = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",
  99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",
  27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",
  53:"Thriller",10752:"War",37:"Western"
};

async function tmdb(path, params = {}) {
  const url = new URL(TMDB_BASE + path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// ─── Already-Watched Helpers ──────────────────────────────────────────────────
function buildWatchedSet(watchlog) {
  return {
    ids:    new Set(watchlog.filter(w=>w.tmdb_id).map(w=>String(w.tmdb_id))),
    titles: new Set(watchlog.map(w=>(w.title||"").toLowerCase()))
  };
}
function isWatched(m, watchedSet) {
  return watchedSet.ids.has(String(m.id)) || watchedSet.titles.has((m.title||m.name||"").toLowerCase());
}
function WatchedBadge() {
  return (
    <div style={{ position:"absolute", top:6, right:6, background:"#0D0D14", color:"#E8A838", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, border:"1px solid #E8A838", letterSpacing:"0.3px" }}>
      ✓ Watched
    </div>
  );
}

// ─── CSV Import Helpers ───────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i=0; i<text.length; i++) {
    const c = text[i], next = text[i+1];
    if (inQuotes) {
      if (c==='"' && next==='"') { field+='"'; i++; }
      else if (c==='"') inQuotes = false;
      else field += c;
    } else {
      if (c==='"') inQuotes = true;
      else if (c===',') { row.push(field); field=""; }
      else if (c==='\n' || c==='\r') {
        if (c==='\r' && next==='\n') i++;
        row.push(field); field="";
        if (row.length>1 || row[0]!=="") rows.push(row);
        row=[];
      } else field += c;
    }
  }
  if (field!=="" || row.length>0) { row.push(field); rows.push(row); }
  return rows;
}

function normalizeImportDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) { const [,mo,d,y]=mdy; return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`; }
  const dashy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashy) { const [,mo,d,y]=dashy; return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`; }
  return null;
}

const IMPORT_HEADER_ALIASES = {
  title:      ["title","movie","name"],
  year:       ["year","release year"],
  watch_date: ["watch_date","watchdate","date","date watched","watched"],
  notes:      ["notes","comments","comment","review"],
  genre:      ["genre"],
};

function parseImportCSV(text) {
  const rows = parseCSV(text).filter(r=>r.some(c=>c.trim()!==""));
  if (rows.length<2) return { error:"That file doesn't look like it has any data rows." };
  const headerRow = rows[0].map(h=>h.trim().toLowerCase());
  const colIndex = {};
  Object.entries(IMPORT_HEADER_ALIASES).forEach(([field, aliases])=>{
    const idx = headerRow.findIndex(h=>aliases.includes(h));
    if (idx!==-1) colIndex[field] = idx;
  });
  if (colIndex.title===undefined) return { error:'No "title" column found. Expected headers like: title, year, watch_date, notes.' };
  if (colIndex.watch_date===undefined) return { error:'No "watch_date" column found. Expected headers like: title, year, watch_date, notes.' };

  const valid = [], invalid = [];
  rows.slice(1).forEach((r,i)=>{
    const title = (r[colIndex.title]||"").trim();
    const watchDateRaw = (r[colIndex.watch_date]||"").trim();
    const watch_date = normalizeImportDate(watchDateRaw);
    const rowNum = i+2; // account for header row, 1-indexed for humans
    if (!title) { invalid.push({ rowNum, reason:"Missing title" }); return; }
    if (!watch_date) { invalid.push({ rowNum, reason:`Unrecognized date "${watchDateRaw}" (use YYYY-MM-DD or MM/DD/YYYY)` }); return; }
    valid.push({
      title,
      year:  colIndex.year!==undefined  ? (r[colIndex.year]||"").trim()  : "",
      genre: colIndex.genre!==undefined ? (r[colIndex.genre]||"").trim() : "",
      notes: colIndex.notes!==undefined ? (r[colIndex.notes]||"").trim() : "",
      watch_date
    });
  });
  return { valid, invalid };
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Poster({ src, title, width=52, height=76 }) {
  if (src && src !== "N/A") return <img src={src} alt={title} style={{ width, height, objectFit:"cover", borderRadius:6, flexShrink:0 }} />;
  return <div style={{ width, height, background:"#1A1A28", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🎬</div>;
}

function Spinner() {
  return <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>Loading…</div>;
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function submit() {
    setError(""); setLoading(true);
    if (!email.trim() || !password.trim()) { setError("Please fill in all fields."); setLoading(false); return; }

    if (mode === "register") {
      const { error: e } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL }
      });
      if (e) { setError(e.message); setLoading(false); return; }
      setError("Check your email to confirm your account, then sign in.");
    } else {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) { setError(e.message); setLoading(false); return; }
      onLogin(data.user);
    }
    setLoading(false);
  }

  const inp = { padding:"10px 14px", background:"#0D0D14", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:15, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:"#0D0D14", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Georgia',serif" }}>
      <div style={{ width:380, padding:"2.5rem", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:16 }}>
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <h1 style={{ margin:0, fontSize:30, fontWeight:700, color:"#F5E6C8", letterSpacing:"-0.5px" }}>Movie Monday</h1>
          <p style={{ margin:"10px 0 0", color:"#E8A838", fontWeight:700, fontSize:16 }}>Mondays suck. Movies help.</p>
          <p style={{ margin:"8px 0 0", color:"#F5E6C8", fontWeight:400, fontSize:14, lineHeight:1.5 }}>
            Watch one with the people you love, alternate who picks, and build a time capsule of the tradition.
          </p>
        </div>
        <div style={{ display:"flex", marginBottom:"1.5rem", background:"#0D0D14", borderRadius:8, padding:4 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
              flex:1, padding:"8px", border:"none", borderRadius:6, cursor:"pointer",
              background: mode===m?"#E8A838":"transparent",
              color: mode===m?"#0D0D14":"#8888AA",
              fontWeight: mode===m?700:400, fontSize:14, fontFamily:"inherit"
            }}>{m==="login"?"Sign In":"Create Account"}</button>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp} onKeyDown={e=>e.key==="Enter"&&submit()} />
          <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inp} onKeyDown={e=>e.key==="Enter"&&submit()} />
          {error && <p style={{ margin:0, color: error.includes("Check your email")?"#4CAF50":"#E05555", fontSize:13 }}>{error}</p>}
          <button onClick={submit} disabled={loading} style={{ padding:"11px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
            {loading?"…":mode==="login"?"Sign In":"Create Account"}
          </button>
          {DEMO_ENABLED && (
            <a href="?demo=1" style={{ textAlign:"center", color:"#8888AA", fontSize:13, textDecoration:"underline" }}>
              👀 View a read-only demo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Log Movie Modal ──────────────────────────────────────────────────────────
function LogMovieModal({ prefill, onSave, onClose, mode="journal" }) {
  const isEdit = Boolean(prefill?.id) && mode==="journal";
  const [title,     setTitle]     = useState(prefill?.title      || "");
  const [year,      setYear]      = useState(prefill?.year       || "");
  const [genre,     setGenre]     = useState(prefill?.genre      || "");
  const [poster,    setPoster]    = useState(prefill?.poster     || "");
  const [tmdbId,    setTmdbId]    = useState(prefill?.tmdb_id    || prefill?.tmdbId || null);
  const [notes,     setNotes]     = useState(prefill?.notes      || "");
  const [noDate,    setNoDate]    = useState(isEdit && !prefill?.watch_date);
  const [watchDate, setWatchDate] = useState(prefill?.watch_date || new Date().toISOString().split("T")[0]);
  const [saving,    setSaving]    = useState(false);
  const overview = prefill?.overview || "";

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const entry = mode==="journal"
      ? { title, year, genre, poster, tmdb_id: tmdbId, notes, watch_date: noDate ? null : watchDate, overview }
      : { title, year, genre, poster, tmdb_id: tmdbId, overview };
    await onSave(entry, prefill?.id);
    setSaving(false);
  }

  const inp = { padding:"9px 12px", background:"#0D0D14", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:14, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const GENRES = ["Action","Adventure","Animation","Comedy","Crime","Documentary","Drama","Family","Fantasy","Horror","Mystery","Romance","Sci-Fi","Thriller","War","Western"];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
      <div style={{ width:"100%", maxWidth:480, background:"#16161F", border:"1px solid #2A2A3A", borderRadius:16, padding:"1.5rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
          <h2 style={{ margin:0, color:"#F5E6C8", fontSize:20 }}>{mode==="list" ? "Add to The List" : isEdit ? "Edit Entry" : "Log a Movie"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#8888AA", fontSize:22, cursor:"pointer" }}>×</button>
        </div>
        <div style={{ display:"flex", gap:12, marginBottom:"1rem" }}>
          <Poster src={poster} title={title} width={70} height={104} />
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
            <input placeholder="Movie title *" value={title} onChange={e=>setTitle(e.target.value)} style={inp} />
            <div style={{ display:"flex", gap:8 }}>
              <input placeholder="Year" value={year} onChange={e=>setYear(e.target.value)} style={{ ...inp, width:80, flex:"0 0 80px" }} />
              <select value={genre} onChange={e=>setGenre(e.target.value)} style={{ ...inp, flex:1 }}>
                <option value="">Genre</option>
                {GENRES.map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>
        {mode==="journal" && (
          <>
            <div style={{ marginBottom:"1rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <label style={{ fontSize:13, color:"#8888AA" }}>Date Watched</label>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#8888AA", cursor:"pointer" }}>
                  <input type="checkbox" checked={noDate} onChange={e=>setNoDate(e.target.checked)} />
                  No date
                </label>
              </div>
              {!noDate && <input type="date" value={watchDate} onChange={e=>setWatchDate(e.target.value)} style={inp} />}
            </div>
            <div style={{ marginBottom:"1.25rem" }}>
              <label style={{ fontSize:13, color:"#8888AA", display:"block", marginBottom:6 }}>Notes / Comments</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did you think?" rows={3}
                style={{ ...inp, resize:"vertical", lineHeight:1.5 }} />
            </div>
          </>
        )}
        <div style={{ display:"flex", gap:10, marginTop: mode==="list" ? "1.25rem" : 0 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#8888AA", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex:2, padding:"10px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {saving ? "Saving…" : mode==="list" ? "Add to List" : isEdit ? "Save Changes" : "Save to Journal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Log Movie Search Modal ─────────────────────────────────────────────────
// mode="log" (default): clicking a card hands off to onSelectMovie (opens the
// full Log Movie modal); if onAddToList is also passed, each card gets a small
// secondary button to add straight to The List instead.
// mode="list": clicking a card calls onSelectMovie directly to add it to The
// List — no intermediate modal, since a want-to-watch entry needs no date/notes.
function LogMovieSearchModal({ onSelectMovie, onManual, onClose, watchlog, watchlist, onAddToList, mode="log" }) {
  const watchedSet = buildWatchedSet(watchlog);
  const listedSet  = buildWatchedSet(watchlist||[]);
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState([]);
  const [person,       setPerson]       = useState(null);
  const [personMovies, setPersonMovies] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  async function search() {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setPerson(null); setPersonMovies([]);
    try {
      const [movieData, personData] = await Promise.all([
        tmdb("/search/movie",  { query, include_adult:false, language:"en-US", page:1 }),
        tmdb("/search/person", { query, include_adult:false, language:"en-US", page:1 })
      ]);
      const topPerson = personData.results?.[0];
      if (topPerson) {
        setPerson(topPerson);
        const credits = await tmdb(`/person/${topPerson.id}/movie_credits`, { language:"en-US" });
        const byId = new Map();
        [...(credits.cast||[]), ...(credits.crew||[])].forEach(m=>{ if(!byId.has(m.id)) byId.set(m.id, m); });
        const filmography = [...byId.values()]
          .filter(m=>m.release_date)
          .sort((a,b)=>b.popularity-a.popularity);
        setPersonMovies(filmography);
      }
      if (movieData.results?.length) setResults(movieData.results.slice(0,12));
      if (!topPerson && !movieData.results?.length) setError("No results found.");
    } catch { setError("Search failed — check your TMDB token."); }
    setLoading(false);
  }

  function buildPrefill(m) {
    return {
      title:  m.title || m.name,
      year:   (m.release_date||"").slice(0,4),
      genre:  GENRE_MAP[m.genre_ids?.[0]] || "",
      poster: m.poster_path ? TMDB_IMG+m.poster_path : "",
      tmdbId: m.id,
      overview: m.overview || ""
    };
  }

  const inp = { padding:"10px 14px", background:"#0D0D14", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:15, outline:"none", fontFamily:"inherit" };

  function renderCard(m) {
    const alreadyListed = isWatched(m, listedSet);
    return (
      <div key={m.id} onClick={()=>onSelectMovie(buildPrefill(m))}
        style={{ position:"relative", background:"#0D0D14", border:"1px solid #2A2A3A", borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
        onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A3A"}>
        {isWatched(m, watchedSet) && <WatchedBadge />}
        {m.poster_path
          ? <img src={TMDB_IMG+m.poster_path} alt="" style={{ width:"100%", aspectRatio:"2/3", objectFit:"cover", display:"block" }} />
          : <div style={{ aspectRatio:"2/3", background:"#1A1A28", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>🎬</div>}
        <div style={{ padding:"6px 8px" }}>
          <p style={{ margin:0, color:"#F5E6C8", fontSize:12, fontWeight:500, lineHeight:1.3 }}>{m.title}</p>
          <p style={{ margin:"2px 0 0", color:"#8888AA", fontSize:11 }}>{(m.release_date||"").slice(0,4)}</p>
        </div>
        {mode==="log" && onAddToList && (
          <button
            onClick={e=>{ e.stopPropagation(); if (!alreadyListed) onAddToList(buildPrefill(m)); }}
            title={alreadyListed ? "Already on The List" : "Add to The List"}
            disabled={alreadyListed}
            style={{
              position:"absolute", bottom:6, right:6, background: alreadyListed?"#2A2A3A":"#0D0D14",
              border:"1px solid #A78BFA", color:"#A78BFA", borderRadius:20, fontSize:10, fontWeight:700,
              padding:"3px 8px", cursor: alreadyListed?"default":"pointer"
            }}>
            {alreadyListed ? "On List" : "+ List"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
      <div style={{ width:"100%", maxWidth:560, maxHeight:"85vh", overflowY:"auto", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:16, padding:"1.5rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
          <h2 style={{ margin:0, color:"#F5E6C8", fontSize:20 }}>{mode==="list" ? "Add to The List" : "Log a Movie"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#8888AA", fontSize:22, cursor:"pointer" }}>×</button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:"1rem" }}>
          <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="Search by title, actor, director…"
            style={{ ...inp, flex:1 }} />
          <button onClick={search} style={{ padding:"10px 20px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {loading?"…":"Search"}
          </button>
        </div>
        {error && <p style={{ color:"#E05555", fontSize:14 }}>{error}</p>}

        {person && personMovies.length>0 && (
          <div style={{ marginBottom:"1rem" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Poster src={person.profile_path?TMDB_IMG+person.profile_path:""} title={person.name} width={28} height={28} />
              <h3 style={{ margin:0, color:"#F5E6C8", fontSize:14 }}>🎭 Movies with {person.name}</h3>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:10 }}>
              {personMovies.map(renderCard)}
            </div>
          </div>
        )}

        {results.length>0 && (
          <div style={{ marginBottom:"1rem" }}>
            {person && <h3 style={{ margin:"0 0 8px", color:"#F5E6C8", fontSize:14 }}>Matching Titles</h3>}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:10 }}>
              {results.map(renderCard)}
            </div>
          </div>
        )}

        <button onClick={onManual} style={{ background:"none", border:"none", color:"#8888AA", fontSize:13, cursor:"pointer", textDecoration:"underline", padding:0, fontFamily:"inherit" }}>
          Can't find it? Enter manually
        </button>
      </div>
    </div>
  );
}

// ─── CSV Import Modal ────────────────────────────────────────────────────────
function ImportCsvModal({ watchlog, userId, onImported, onClose }) {
  const [step,       setStep]       = useState("upload"); // upload | preview | importing | done
  const [fileName,   setFileName]   = useState("");
  const [parsed,     setParsed]     = useState(null); // { valid, invalid, dupes }
  const [parseError, setParseError] = useState("");
  const [progress,   setProgress]   = useState({ done:0, total:0 });
  const [summary,    setSummary]    = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportCSV(String(reader.result));
      if (result.error) { setParseError(result.error); setParsed(null); return; }
      setParseError("");

      const existing = new Set(watchlog.map(m=>`${(m.title||"").toLowerCase()}|${m.watch_date}`));
      const dupes = [];
      const fresh = result.valid.filter(r=>{
        const key = `${r.title.toLowerCase()}|${r.watch_date}`;
        if (existing.has(key)) { dupes.push(r); return false; }
        return true;
      });

      setParsed({ valid:fresh, invalid:result.invalid, dupes });
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function startImport() {
    setStep("importing");
    const rows = parsed.valid;
    setProgress({ done:0, total:rows.length });
    const built = [];
    const BATCH = 8;
    let matchedCount = 0;

    for (let i=0; i<rows.length; i+=BATCH) {
      const batch = rows.slice(i, i+BATCH);
      const results = await Promise.all(batch.map(async r => {
        let match = null;
        try {
          const params = { query:r.title, include_adult:false, language:"en-US", page:1 };
          if (r.year) params.year = r.year;
          const data = await tmdb("/search/movie", params);
          match = data.results?.[0] || null;
        } catch { /* leave unmatched, still import with CSV data */ }
        if (match) matchedCount++;
        return {
          title:      match ? match.title : r.title,
          year:       match ? (match.release_date||"").slice(0,4) : r.year,
          genre:      match ? (GENRE_MAP[match.genre_ids?.[0]]||r.genre||"") : r.genre,
          poster:     match && match.poster_path ? TMDB_IMG+match.poster_path : "",
          tmdb_id:    match ? match.id : null,
          overview:   match ? (match.overview||"") : "",
          notes:      r.notes,
          watch_date: r.watch_date,
          user_id:    userId
        };
      }));
      built.push(...results);
      setProgress({ done: Math.min(i+BATCH, rows.length), total: rows.length });
    }

    let inserted = [];
    if (built.length>0) {
      const { data, error } = await supabase.from("watchlog").insert(built).select();
      if (!error) inserted = data||[];
    }
    onImported(inserted);
    setSummary({
      imported: inserted.length,
      matched: matchedCount,
      unmatched: built.length-matchedCount,
      skippedInvalid: parsed.invalid.length,
      skippedDupes: parsed.dupes.length
    });
    setStep("done");
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
      <div style={{ width:"100%", maxWidth:520, maxHeight:"85vh", overflowY:"auto", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:16, padding:"1.5rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
          <h2 style={{ margin:0, color:"#F5E6C8", fontSize:20 }}>Import from CSV</h2>
          {step!=="importing" && <button onClick={onClose} style={{ background:"none", border:"none", color:"#8888AA", fontSize:22, cursor:"pointer" }}>×</button>}
        </div>

        {step==="upload" && (
          <>
            <p style={{ color:"#8888AA", fontSize:14, lineHeight:1.6 }}>
              Upload a CSV with columns <code>title</code> and <code>watch_date</code> (YYYY-MM-DD or MM/DD/YYYY) — <code>year</code>, <code>genre</code>, and <code>notes</code> are optional.
              Each title gets matched against TMDB automatically for its poster, correct genre, and cast/crew data.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ color:"#F5E6C8", fontSize:13 }} />
            {parseError && <p style={{ color:"#E05555", fontSize:13, marginTop:10 }}>{parseError}</p>}
          </>
        )}

        {step==="preview" && parsed && (
          <>
            <p style={{ color:"#F5E6C8", fontSize:14 }}>
              <strong>{fileName}</strong> — {parsed.valid.length} movie{parsed.valid.length===1?"":"s"} ready to import.
            </p>
            {parsed.dupes.length>0 && (
              <p style={{ color:"#8888AA", fontSize:13 }}>{parsed.dupes.length} skipped — already in your journal (same title + date).</p>
            )}
            {parsed.invalid.length>0 && (
              <div style={{ color:"#E05555", fontSize:13, marginBottom:10 }}>
                {parsed.invalid.length} row{parsed.invalid.length===1?"":"s"} skipped:
                <ul style={{ margin:"4px 0 0", paddingLeft:18 }}>
                  {parsed.invalid.slice(0,5).map((x,i)=><li key={i}>Row {x.rowNum}: {x.reason}</li>)}
                  {parsed.invalid.length>5 && <li>…and {parsed.invalid.length-5} more</li>}
                </ul>
              </div>
            )}
            <div style={{ maxHeight:220, overflowY:"auto", border:"1px solid #2A2A3A", borderRadius:8, padding:"8px 12px", marginBottom:12 }}>
              {parsed.valid.slice(0,50).map((r,i)=>(
                <div key={i} style={{ fontSize:13, color:"#AAAACC", padding:"3px 0", borderBottom: i<Math.min(parsed.valid.length,50)-1?"1px solid #222230":"none" }}>
                  {r.title} {r.year && `(${r.year})`} — {r.watch_date}
                </div>
              ))}
              {parsed.valid.length>50 && <div style={{ fontSize:12, color:"#555577", marginTop:6 }}>…and {parsed.valid.length-50} more</div>}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onClose} style={{ flex:1, padding:"10px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#8888AA", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              <button onClick={startImport} disabled={parsed.valid.length===0}
                style={{ flex:2, padding:"10px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                Import {parsed.valid.length} Movie{parsed.valid.length===1?"":"s"}
              </button>
            </div>
          </>
        )}

        {step==="importing" && (
          <div style={{ textAlign:"center", padding:"2rem 0" }}>
            <p style={{ color:"#F5E6C8" }}>Matching against TMDB… {progress.done}/{progress.total}</p>
            <div style={{ background:"#0D0D14", borderRadius:6, height:10, overflow:"hidden", margin:"10px auto", maxWidth:300 }}>
              <div style={{ width:`${progress.total?(progress.done/progress.total)*100:0}%`, height:"100%", background:"#E8A838", transition:"width 0.2s" }} />
            </div>
            <p style={{ color:"#8888AA", fontSize:12 }}>Please keep this open until it finishes.</p>
          </div>
        )}

        {step==="done" && summary && (
          <div>
            <p style={{ color:"#F5E6C8", fontSize:15 }}>
              🎉 Imported <strong>{summary.imported}</strong> movie{summary.imported===1?"":"s"} — {summary.matched} matched to TMDB{summary.unmatched>0?`, ${summary.unmatched} added without a match`:""}.
            </p>
            {(summary.skippedDupes>0 || summary.skippedInvalid>0) && (
              <p style={{ color:"#8888AA", fontSize:13 }}>
                {summary.skippedDupes>0 && `${summary.skippedDupes} duplicate${summary.skippedDupes===1?"":"s"} skipped. `}
                {summary.skippedInvalid>0 && `${summary.skippedInvalid} invalid row${summary.skippedInvalid===1?"":"s"} skipped.`}
              </p>
            )}
            <button onClick={onClose} style={{ width:"100%", marginTop:12, padding:"10px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────
function SearchTab({ onSelectMovie, watchlog, watchlist, onAddToList }) {
  const watchedSet = buildWatchedSet(watchlog);
  const listedSet  = buildWatchedSet(watchlist||[]);
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState([]);
  const [person,       setPerson]       = useState(null);
  const [personMovies, setPersonMovies] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [selected,     setSelected]     = useState(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setSelected(null); setPerson(null); setPersonMovies([]);
    try {
      const [movieData, personData] = await Promise.all([
        tmdb("/search/movie",  { query, include_adult:false, language:"en-US", page:1 }),
        tmdb("/search/person", { query, include_adult:false, language:"en-US", page:1 })
      ]);
      const topPerson = personData.results?.[0];
      if (topPerson) {
        setPerson(topPerson);
        const credits = await tmdb(`/person/${topPerson.id}/movie_credits`, { language:"en-US" });
        const byId = new Map();
        [...(credits.cast||[]), ...(credits.crew||[])].forEach(m=>{ if(!byId.has(m.id)) byId.set(m.id, m); });
        const filmography = [...byId.values()]
          .filter(m=>m.release_date)
          .sort((a,b)=>b.popularity-a.popularity);
        setPersonMovies(filmography);
      }
      if (movieData.results?.length) setResults(movieData.results.slice(0,12));
      if (!topPerson && !movieData.results?.length) setError("No results found.");
    } catch { setError("Search failed — check your TMDB token."); }
    setLoading(false);
  }

  async function selectMovie(movie) {
    try {
      const detail = await tmdb(`/movie/${movie.id}`, { language:"en-US" });
      setSelected(detail);
    } catch { setSelected(movie); }
  }

  function buildPrefill(m) {
    return {
      title:  m.title || m.name,
      year:   (m.release_date||"").slice(0,4),
      genre:  m.genres?.[0]?.name || GENRE_MAP[m.genre_ids?.[0]] || "",
      poster: m.poster_path ? TMDB_IMG+m.poster_path : "",
      tmdbId: m.id,
      overview: m.overview || ""
    };
  }

  return (
    <div style={{ maxWidth:680, margin:"0 auto" }}>
      <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", marginTop:0 }}>Search Movies</h2>
      <div style={{ display:"flex", gap:8, marginBottom:"1.5rem" }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
          placeholder="Search by title, actor, director…"
          style={{ flex:1, padding:"10px 14px", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:15, outline:"none", fontFamily:"inherit" }} />
        <button onClick={search} style={{ padding:"10px 20px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
          {loading?"…":"Search"}
        </button>
      </div>
      {error && <p style={{ color:"#E05555" }}>{error}</p>}

      {selected && (
        <div style={{ background:"#16161F", border:"1px solid #E8A838", borderRadius:12, padding:"1.25rem", marginBottom:"1.5rem", display:"flex", gap:16 }}>
          <Poster src={selected.poster_path?TMDB_IMG+selected.poster_path:""} title={selected.title} width={90} height={135} />
          <div style={{ flex:1 }}>
            <h3 style={{ margin:"0 0 4px", color:"#F5E6C8" }}>
              {selected.title}
              <span style={{ color:"#8888AA", fontWeight:400, fontSize:15 }}> ({(selected.release_date||"").slice(0,4)})</span>
            </h3>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
              {(selected.genres||[]).map(g=>(
                <span key={g.id} style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #8888AA", color:"#8888AA" }}>{g.name}</span>
              ))}
              {selected.vote_average>0 && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #E8A838", color:"#E8A838" }}>★ {selected.vote_average.toFixed(1)}</span>
              )}
              {isWatched(selected, watchedSet) && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#E8A838", color:"#0D0D14", fontWeight:700 }}>✓ Watched</span>
              )}
            </div>
            <p style={{ margin:"0 0 12px", color:"#AAAACC", fontSize:14, lineHeight:1.6 }}>{selected.overview}</p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>onSelectMovie(buildPrefill(selected))}
                style={{ padding:"8px 18px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                + Log this movie
              </button>
              {onAddToList && (
                <button onClick={()=>!isWatched(selected, listedSet) && onAddToList(buildPrefill(selected))}
                  disabled={isWatched(selected, listedSet)}
                  style={{ padding:"8px 18px", background:"none", border:"1px solid #A78BFA", borderRadius:8, color:"#A78BFA", fontWeight:700, cursor: isWatched(selected, listedSet)?"default":"pointer", fontFamily:"inherit" }}>
                  {isWatched(selected, listedSet) ? "✓ On The List" : "+ Add to The List"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {person && personMovies.length>0 && (
        <div style={{ marginBottom:"1.5rem" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <Poster src={person.profile_path?TMDB_IMG+person.profile_path:""} title={person.name} width={36} height={36} />
            <h3 style={{ margin:0, color:"#F5E6C8", fontSize:16, fontFamily:"'Georgia',serif" }}>🎭 Movies with {person.name}</h3>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:12 }}>
            {personMovies.map(m=>(
              <div key={m.id} onClick={()=>selectMovie(m)}
                style={{ position:"relative", background:"#16161F", border:`1px solid ${selected?.id===m.id?"#E8A838":"#2A2A3A"}`, borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=selected?.id===m.id?"#E8A838":"#2A2A3A"}>
                {isWatched(m, watchedSet) && <WatchedBadge />}
                {m.poster_path
                  ? <img src={TMDB_IMG+m.poster_path} alt="" style={{ width:"100%", aspectRatio:"2/3", objectFit:"cover", display:"block" }} />
                  : <div style={{ aspectRatio:"2/3", background:"#0D0D14", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🎬</div>}
                <div style={{ padding:"8px 10px" }}>
                  <p style={{ margin:0, color:"#F5E6C8", fontSize:13, fontWeight:500, lineHeight:1.3 }}>{m.title}</p>
                  <p style={{ margin:"2px 0 0", color:"#8888AA", fontSize:12 }}>
                    {(m.release_date||"").slice(0,4)}{m.character?` · ${m.character}`:m.job?` · ${m.job}`:""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length>0 && (
        <div>
          {person && <h3 style={{ color:"#F5E6C8", fontSize:16, fontFamily:"'Georgia',serif", marginTop:0, marginBottom:10 }}>Matching Titles</h3>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:12 }}>
            {results.map(m=>(
              <div key={m.id} onClick={()=>selectMovie(m)}
                style={{ position:"relative", background:"#16161F", border:`1px solid ${selected?.id===m.id?"#E8A838":"#2A2A3A"}`, borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=selected?.id===m.id?"#E8A838":"#2A2A3A"}>
                {isWatched(m, watchedSet) && <WatchedBadge />}
                {m.poster_path
                  ? <img src={TMDB_IMG+m.poster_path} alt="" style={{ width:"100%", aspectRatio:"2/3", objectFit:"cover", display:"block" }} />
                  : <div style={{ aspectRatio:"2/3", background:"#0D0D14", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🎬</div>}
                <div style={{ padding:"8px 10px" }}>
                  <p style={{ margin:0, color:"#F5E6C8", fontSize:13, fontWeight:500, lineHeight:1.3 }}>{m.title}</p>
                  <p style={{ margin:"2px 0 0", color:"#8888AA", fontSize:12 }}>{(m.release_date||"").slice(0,4)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Journal Tab ──────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function watchYearOf(dateStr)  { return dateStr ? dateStr.slice(0,4) : null; }
function monthKeyOf(dateStr)   { return dateStr ? dateStr.slice(0,7) : "unknown"; }
function monthLabelOf(dateStr) {
  if (!dateStr) return "Undated";
  const [y,mo] = dateStr.split("-");
  return `${MONTH_NAMES[Number(mo)-1]} ${y}`;
}

function JournalEntry({ m, onDelete, onEdit, onToggleGold, readOnly }) {
  const isGold = m.gold_rank!=null;
  return (
    <div style={{ display:"flex", gap:14, background:"#16161F", border:`1px solid ${isGold?"#E8A838":"#2A2A3A"}`, borderRadius:12, padding:"12px 16px", alignItems:"flex-start" }}>
      <Poster src={m.poster} title={m.title} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
          <h3 style={{ margin:0, color:"#F5E6C8", fontSize:16, fontFamily:"'Georgia',serif" }}>{m.title}</h3>
          {readOnly ? (
            isGold && <span style={{ color:"#E8A838", fontSize:15 }}>⭐</span>
          ) : (
            <div style={{ display:"flex", gap:8, flexShrink:0, alignItems:"center" }}>
              <button onClick={()=>onToggleGold(m)} title={isGold?"Remove from Hall of Fame":"Add to Hall of Fame"}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, padding:0, lineHeight:1, color: isGold?"#E8A838":"#555577" }}>
                {isGold?"⭐":"☆"}
              </button>
              <button onClick={()=>onEdit(m)} title="Edit" style={{ background:"none", border:"none", color:"#8888AA", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>✏️</button>
              <button onClick={()=>onDelete(m.id)} title="Remove" style={{ background:"none", border:"none", color:"#555577", cursor:"pointer", fontSize:18, padding:0, lineHeight:1 }}>×</button>
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
          {m.year  && <span style={{ color:"#8888AA", fontSize:13 }}>{m.year}</span>}
          {m.genre && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #555577", color:"#8888AA" }}>{m.genre}</span>}
          <span style={{ color:"#8888AA", fontSize:12 }}>{m.watch_date || "No date"}</span>
        </div>
        {m.overview && (
          <p style={{
            margin:"6px 0 0", color:"#8888AA", fontSize:13, lineHeight:1.5,
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"
          }}>{m.overview}</p>
        )}
        {m.notes && <p style={{ margin:"6px 0 0", color:"#AAAACC", fontSize:14, lineHeight:1.5 }}>{m.notes}</p>}
      </div>
    </div>
  );
}

function JournalTab({ watchlog, onDelete, onEdit, onToggleGold, onImportClick, loading, readOnly }) {
  const [filter,     setFilter]     = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sort,       setSort]       = useState("recent");
  // Tracks which years/months have been explicitly collapsed. Absence from
  // these sets means expanded, so everything defaults open — including
  // years/months that don't exist yet at mount time (e.g. while data is
  // still loading) or get added later via import.
  const [collapsedYears,  setCollapsedYears]  = useState(() => new Set());
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());

  const genres = ["all", ...new Set(watchlog.map(m=>m.genre).filter(Boolean))];
  const years  = ["all", ...new Set(watchlog.map(m=>watchYearOf(m.watch_date)).filter(Boolean))].sort((a,b)=>a==="all"?-1:b==="all"?1:b-a);

  let filtered = watchlog.filter(m=>
    (filter==="all"||m.genre===filter) && (yearFilter==="all"||watchYearOf(m.watch_date)===yearFilter)
  );
  filtered = [...filtered].sort((a,b)=>{
    if (sort==="recent") {
      if (!a.watch_date && !b.watch_date) return 0;
      if (!a.watch_date) return 1;
      if (!b.watch_date) return -1;
      return new Date(b.watch_date)-new Date(a.watch_date);
    }
    return a.title.localeCompare(b.title);
  });

  const UNDATED_KEY = "__no_date__";
  const groupByDate = sort==="recent";
  const yearGroups = [];
  const undatedMovies = [];
  if (groupByDate) {
    const byYear = new Map();
    filtered.forEach(m=>{
      if (!m.watch_date) { undatedMovies.push(m); return; }
      const y = watchYearOf(m.watch_date);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(m);
    });
    byYear.forEach((movies, year) => {
      const byMonth = new Map();
      movies.forEach(m=>{
        const key = monthKeyOf(m.watch_date);
        if (!byMonth.has(key)) byMonth.set(key, { key, label: monthLabelOf(m.watch_date), movies: [] });
        byMonth.get(key).movies.push(m);
      });
      yearGroups.push({ year, count: movies.length, monthGroups: [...byMonth.values()] });
    });
  }

  function toggleYear(year) {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  }
  function toggleMonth(key) {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const allExpanded = collapsedYears.size===0 && collapsedMonths.size===0;

  function toggleExpandAll() {
    if (allExpanded) {
      setCollapsedYears(new Set([...yearGroups.map(yg=>yg.year), UNDATED_KEY]));
      setCollapsedMonths(new Set(yearGroups.flatMap(yg=>yg.monthGroups.map(g=>g.key))));
    } else {
      setCollapsedYears(new Set());
      setCollapsedMonths(new Set());
    }
  }

  const sel = { padding:"7px 12px", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:13, outline:"none", fontFamily:"inherit" };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem", flexWrap:"wrap", gap:10 }}>
        <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", margin:0 }}>
          My Journal <span style={{ color:"#8888AA", fontWeight:400, fontSize:16 }}>({watchlog.length})</span>
        </h2>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={sel}>
            {genres.map(g=><option key={g} value={g}>{g==="all"?"All Genres":g}</option>)}
          </select>
          <select value={yearFilter} onChange={e=>setYearFilter(e.target.value)} style={sel}>
            {years.map(y=><option key={y} value={y}>{y==="all"?"All Years":`Watched ${y}`}</option>)}
          </select>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={sel}>
            <option value="recent">Most Recent</option>
            <option value="alpha">A–Z</option>
          </select>
          {groupByDate && yearGroups.length>0 && (
            <button onClick={toggleExpandAll} style={{ padding:"7px 12px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#8888AA", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
              {allExpanded ? "▾ Collapse All" : "▸ Expand All"}
            </button>
          )}
          {!readOnly && (
            <button onClick={onImportClick} style={{ padding:"7px 12px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#8888AA", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
              ⬆ Import CSV
            </button>
          )}
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🍿</div>
          <p>{watchlog.length===0
            ? (readOnly ? "This demo account has no movies logged yet." : <>No movies logged yet. Search for one or use <strong style={{ color:"#F5E6C8" }}>+ Log Movie</strong> to get started!</>)
            : "No movies match these filters."}</p>
        </div>
      )}

      {groupByDate ? (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {yearGroups.map(yg=>{
            const yearOpen = !collapsedYears.has(yg.year);
            return (
              <div key={yg.year}>
                <button onClick={()=>toggleYear(yg.year)} style={{
                  display:"flex", alignItems:"center", gap:10, width:"100%",
                  background:"none", border:"none", borderBottom:"1px solid #3A3A5A",
                  padding:"10px 4px", cursor:"pointer", textAlign:"left", fontFamily:"inherit"
                }}>
                  <span style={{ color:"#E8A838", fontSize:12 }}>{yearOpen?"▾":"▸"}</span>
                  <span style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", fontSize:19, fontWeight:700, letterSpacing:"0.5px" }}>{yg.year}</span>
                  <span style={{ color:"#8888AA", fontSize:13 }}>({yg.count})</span>
                </button>
                {yearOpen && (
                  <div style={{ display:"flex", flexDirection:"column", gap:4, margin:"8px 0 14px 22px" }}>
                    {yg.monthGroups.map(g=>{
                      const isOpen = !collapsedMonths.has(g.key);
                      return (
                        <div key={g.key}>
                          <button onClick={()=>toggleMonth(g.key)} style={{
                            display:"flex", alignItems:"center", gap:10, width:"100%",
                            background:"none", border:"none", borderBottom:"1px solid #2A2A3A",
                            padding:"8px 4px", cursor:"pointer", textAlign:"left", fontFamily:"inherit"
                          }}>
                            <span style={{ color:"#E8A838", fontSize:11 }}>{isOpen?"▾":"▸"}</span>
                            <span style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", fontSize:16, letterSpacing:"0.5px" }}>{g.label}</span>
                            <span style={{ color:"#8888AA", fontSize:13 }}>({g.movies.length})</span>
                          </button>
                          {isOpen && (
                            <div style={{ display:"flex", flexDirection:"column", gap:10, margin:"10px 0 16px" }}>
                              {g.movies.map(m=><JournalEntry key={m.id} m={m} onDelete={onDelete} onEdit={onEdit} onToggleGold={onToggleGold} readOnly={readOnly} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {undatedMovies.length>0 && (() => {
            const undatedOpen = !collapsedYears.has(UNDATED_KEY);
            return (
              <div>
                <button onClick={()=>toggleYear(UNDATED_KEY)} style={{
                  display:"flex", alignItems:"center", gap:10, width:"100%",
                  background:"none", border:"none", borderBottom:"1px solid #3A3A5A",
                  padding:"10px 4px", cursor:"pointer", textAlign:"left", fontFamily:"inherit"
                }}>
                  <span style={{ color:"#E8A838", fontSize:12 }}>{undatedOpen?"▾":"▸"}</span>
                  <span style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", fontSize:19, fontWeight:700, letterSpacing:"0.5px" }}>No Date</span>
                  <span style={{ color:"#8888AA", fontSize:13 }}>({undatedMovies.length})</span>
                </button>
                {undatedOpen && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10, margin:"10px 0 16px" }}>
                    {undatedMovies.map(m=><JournalEntry key={m.id} m={m} onDelete={onDelete} onEdit={onEdit} onToggleGold={onToggleGold} readOnly={readOnly} />)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(m=><JournalEntry key={m.id} m={m} onDelete={onDelete} onEdit={onEdit} onToggleGold={onToggleGold} readOnly={readOnly} />)}
        </div>
      )}
    </div>
  );
}

// ─── Hall of Fame Tab ────────────────────────────────────────────────────────
const HOF_TOP_N = 25;

function HofRow({ m, rank, zone, staged, dragId, overId, overPosition, readOnly, onToggleGold, onToggleStage, onRemoveFromTop25, onRowDragStart, onRowDragOver, onRowDragEnd, onRowDrop }) {
  const draggable = !readOnly && zone==="top";
  const showLine = draggable && dragId!=null && dragId!==m.id && overId===m.id;
  return (
    <div style={{ position:"relative" }}>
      {showLine && overPosition==="above" && (
        <div style={{ position:"absolute", top:-5, left:0, right:0, height:3, background:"#E8A838", borderRadius:2 }} />
      )}
      <div
        draggable={draggable}
        onDragStart={draggable ? ()=>onRowDragStart(m.id) : undefined}
        onDragOver={!draggable ? undefined : e=>{
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onRowDragOver(m.id, e.clientY < rect.top+rect.height/2 ? "above" : "below");
        }}
        onDragEnd={draggable ? onRowDragEnd : undefined}
        onDrop={!draggable ? undefined : e=>{ e.stopPropagation(); onRowDrop(m.id); }}
        style={{
          display:"flex", alignItems:"center", gap:12, background:"#16161F",
          border:`1px solid ${staged?"#A78BFA":"#2A2A3A"}`, borderRadius:10,
          padding:"10px 14px", cursor: draggable ? "grab" : "default", opacity: dragId===m.id?0.4:1
        }}>
        {rank!=null && <span style={{ color:"#E8A838", fontWeight:700, width:22, textAlign:"center", fontSize:15, fontFamily:"'Georgia',serif" }}>{rank}</span>}
        <Poster src={m.poster} title={m.title} width={40} height={58} />
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, color:"#F5E6C8", fontSize:15, fontFamily:"'Georgia',serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</p>
          {m.year && <p style={{ margin:0, color:"#8888AA", fontSize:12 }}>{m.year}</p>}
          {m.overview && (
            <p style={{ margin:"2px 0 0", color:"#666680", fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.overview}</p>
          )}
        </div>
        {!readOnly && zone==="top" && (
          <button onClick={()=>onRemoveFromTop25(m)} title={`Remove from Top ${HOF_TOP_N}`}
            style={{ background:"none", border:"1px solid #2A2A3A", borderRadius:8, cursor:"pointer", fontSize:12, padding:"5px 10px", color:"#8888AA", flexShrink:0, fontFamily:"inherit", whiteSpace:"nowrap" }}>
            Remove from Top {HOF_TOP_N}
          </button>
        )}
        {!readOnly && zone==="rest" && (
          <button onClick={()=>onToggleStage(m)} title={staged?"Cancel staging":`Stage to fill the next open Top ${HOF_TOP_N} spot`}
            style={{
              background: staged?"#A78BFA":"none", border:"1px solid #A78BFA", borderRadius:8, cursor:"pointer",
              fontSize:12, padding:"5px 10px", color: staged?"#0D0D14":"#A78BFA", fontWeight:600, flexShrink:0, fontFamily:"inherit", whiteSpace:"nowrap"
            }}>
            {staged ? "★ Staged" : `Stage for Top ${HOF_TOP_N}`}
          </button>
        )}
        {!readOnly && (
          <button onClick={()=>onToggleGold(m)} title="Remove from Hall of Fame"
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, padding:0, lineHeight:1, color:"#E8A838", flexShrink:0 }}>
            ⭐
          </button>
        )}
        {draggable && <span style={{ color:"#555577", fontSize:16, flexShrink:0 }}>⠿</span>}
      </div>
      {showLine && overPosition==="below" && (
        <div style={{ position:"absolute", bottom:-5, left:0, right:0, height:3, background:"#E8A838", borderRadius:2 }} />
      )}
    </div>
  );
}

function GoldStarTab({ watchlog, onReorder, onToggleGold, onToggleStage, onRemoveFromTop25, readOnly }) {
  const goldMovies  = [...watchlog].filter(m=>m.gold_rank!=null).sort((a,b)=>a.gold_rank-b.gold_rank);
  const topMovies   = goldMovies.slice(0, HOF_TOP_N);
  const restMovies  = [...goldMovies.slice(HOF_TOP_N)].sort((a,b)=>a.title.localeCompare(b.title));
  const stagedMovie = goldMovies.find(m=>m.hof_staged);

  const [dragId,       setDragId]       = useState(null);
  const [overId,       setOverId]       = useState(null);
  const [overPosition, setOverPosition] = useState(null); // "above" | "below"

  function reset() { setDragId(null); setOverId(null); setOverPosition(null); }

  // Reordering only applies within the Top N — moving between zones is button-driven now.
  function reorderWithinTop(targetId, position) {
    if (dragId==null || dragId===targetId) { reset(); return; }
    if (!topMovies.some(m=>m.id===dragId) || !topMovies.some(m=>m.id===targetId)) { reset(); return; }
    const order = goldMovies.filter(m=>m.id!==dragId);
    const draggedMovie = goldMovies.find(m=>m.id===dragId);
    const targetIdx = order.findIndex(m=>m.id===targetId);
    if (targetIdx===-1) { reset(); return; }
    order.splice(position==="below" ? targetIdx+1 : targetIdx, 0, draggedMovie);
    onReorder(order.map(m=>m.id));
    reset();
  }

  const rowProps = {
    dragId, overId, overPosition, readOnly, onToggleGold, onToggleStage, onRemoveFromTop25,
    onRowDragStart: setDragId,
    onRowDragOver: (id, pos) => { setOverId(id); setOverPosition(pos); },
    onRowDragEnd: reset,
    onRowDrop: (id) => reorderWithinTop(id, overPosition),
  };

  if (goldMovies.length===0) return (
    <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>⭐</div>
      <p>No Hall of Fame picks yet.{!readOnly && " Tap the ☆ on any Journal entry to add it here, then drag to rank it."}</p>
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", marginTop:0, marginBottom:4 }}>⭐ Hall of Fame</h2>
      <p style={{ color:"#8888AA", fontSize:14, marginTop:0, marginBottom:"1.25rem" }}>
        {readOnly ? "Ranked #1 to last, favorite first." : `Drag to reorder — #1 is your favorite. Only the top ${HOF_TOP_N} are ranked.`}
      </p>

      <h3 style={{ color:"#F5E6C8", fontSize:14, fontFamily:"'Georgia',serif", margin:"0 0 10px" }}>Top {HOF_TOP_N}</h3>
      {stagedMovie && !readOnly && (
        <p style={{ color:"#A78BFA", fontSize:12, margin:"0 0 10px" }}>★ "{stagedMovie.title}" is staged — it'll take the spot of whichever pick you remove next.</p>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {topMovies.map((m,i)=><HofRow key={m.id} m={m} rank={i+1} zone="top" staged={false} {...rowProps} />)}
      </div>

      {goldMovies.length>HOF_TOP_N && (
        <>
          <h3 style={{ color:"#F5E6C8", fontSize:14, fontFamily:"'Georgia',serif", margin:"1.75rem 0 4px" }}>Also in Hall of Fame</h3>
          <p style={{ color:"#555577", fontSize:12, margin:"0 0 10px" }}>
            {readOnly ? "Not in the ranked top." : `Stage one to queue it for the next open Top ${HOF_TOP_N} spot.`}
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {restMovies.map(m=><HofRow key={m.id} m={m} rank={null} zone="rest" staged={m.hof_staged===true} {...rowProps} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── The List Tab ─────────────────────────────────────────────────────────────
function WatchlistTab({ watchlist, onRemove, onMoveToJournal, onAddClick, readOnly }) {
  if (watchlist.length===0) return (
    <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
      <p>Nothing on The List yet.{!readOnly && " Search for a movie and add it here to prep something for a future Movie Monday."}</p>
    </div>
  );

  const sorted = [...watchlist].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
        <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", margin:0 }}>
          📋 The List <span style={{ color:"#8888AA", fontWeight:400, fontSize:16 }}>({watchlist.length})</span>
        </h2>
        {!readOnly && (
          <button onClick={onAddClick} style={{ padding:"7px 14px", background:"#1E1E2F", border:"1px solid #A78BFA", borderRadius:8, color:"#A78BFA", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>
            + Add Movie
          </button>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {sorted.map(m=>(
          <div key={m.id} style={{ display:"flex", gap:14, background:"#16161F", border:"1px solid #2A2A3A", borderRadius:12, padding:"12px 16px", alignItems:"flex-start" }}>
            <Poster src={m.poster} title={m.title} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                <h3 style={{ margin:0, color:"#F5E6C8", fontSize:16, fontFamily:"'Georgia',serif" }}>{m.title}</h3>
                {!readOnly && (
                  <button onClick={()=>onRemove(m.id)} title="Remove from The List" style={{ background:"none", border:"none", color:"#555577", cursor:"pointer", fontSize:18, padding:0, lineHeight:1, flexShrink:0 }}>×</button>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
                {m.year  && <span style={{ color:"#8888AA", fontSize:13 }}>{m.year}</span>}
                {m.genre && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #555577", color:"#8888AA" }}>{m.genre}</span>}
              </div>
              {m.overview && (
                <p style={{
                  margin:"6px 0 0", color:"#8888AA", fontSize:13, lineHeight:1.5,
                  display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"
                }}>{m.overview}</p>
              )}
              {!readOnly && (
                <button onClick={()=>onMoveToJournal(m)} style={{ marginTop:8, padding:"6px 12px", background:"none", border:"1px solid #E8A838", borderRadius:8, color:"#E8A838", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600 }}>
                  ▶ Watched it — log to Journal
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Suggestions Tab ──────────────────────────────────────────────────────────
function SuggestionsTab({ watchlog, onSelectMovie, watchlist, onAddToList }) {
  const listedSet = buildWatchedSet(watchlist||[]);
  const [mode,        setMode]        = useState("criteria"); // "criteria" | "similar"
  const [genreId,     setGenreId]     = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [decade,      setDecade]      = useState("");
  const [journalId,   setJournalId]   = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [sortBy,      setSortBy]      = useState("popularity"); // "popularity" | "rating"
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [reason,      setReason]      = useState("");
  const [selected,    setSelected]    = useState(null);

  const journalWithTmdb = watchlog.filter(m=>m.tmdb_id).sort((a,b)=>a.title.localeCompare(b.title));

  const currentDecade = Math.floor(new Date().getFullYear()/10)*10;
  const decades = [];
  for (let d=currentDecade; d>=1950; d-=10) decades.push(d);

  const sortedSuggestions = [...suggestions].sort((a,b)=>
    sortBy==="rating" ? (b.vote_average||0)-(a.vote_average||0) : (b.popularity||0)-(a.popularity||0)
  );

  function buildPrefill(m) {
    return {
      title:  m.title,
      year:   (m.release_date||"").slice(0,4),
      genre:  m.genres?.[0]?.name || GENRE_MAP[m.genre_ids?.[0]] || "",
      poster: m.poster_path?TMDB_IMG+m.poster_path:"",
      tmdbId: m.id,
      overview: m.overview || ""
    };
  }

  async function selectMovie(movie) {
    try {
      const detail = await tmdb(`/movie/${movie.id}`, { language:"en-US" });
      setSelected(detail);
    } catch { setSelected(movie); }
  }

  function switchMode(id) {
    setMode(id); setError(""); setSuggestions([]); setReason(""); setSelected(null);
  }

  async function findByCriteria() {
    if (!genreId && !personQuery.trim() && !decade) { setError("Pick a genre, decade, or enter a name."); return; }
    setLoading(true); setError(""); setSuggestions([]); setReason(""); setSelected(null);
    try {
      const params = { sort_by:"popularity.desc", "vote_count.gte":100, language:"en-US", page:1 };
      let personName = "";
      if (genreId) params.with_genres = genreId;
      if (decade) {
        params["primary_release_date.gte"] = `${decade}-01-01`;
        params["primary_release_date.lte"] = `${Number(decade)+9}-12-31`;
      }
      if (personQuery.trim()) {
        const personData = await tmdb("/search/person", { query:personQuery, include_adult:false, language:"en-US", page:1 });
        const person = personData.results?.[0];
        if (!person) { setError(`No one named "${personQuery}" found on TMDB.`); setLoading(false); return; }
        params.with_people = person.id;
        personName = person.name;
      }
      const data = await tmdb("/discover/movie", params);
      const logged = new Set(watchlog.map(m=>m.title?.toLowerCase()));
      const bits = [genreId ? GENRE_MAP[genreId] : "", personName, decade ? `${decade}s` : ""].filter(Boolean);
      setSuggestions((data.results||[]).filter(m=>!logged.has((m.title||"").toLowerCase())));
      setReason(bits.length ? `Matching ${bits.join(" + ")}` : "");
    } catch { setError("Search failed — check your TMDB token."); }
    setLoading(false);
  }

  async function findSimilar() {
    if (!journalId) { setError("Pick a movie from your journal."); return; }
    setLoading(true); setError(""); setSuggestions([]); setReason(""); setSelected(null);
    const source = watchlog.find(m=>String(m.tmdb_id)===String(journalId));
    try {
      let data = await tmdb(`/movie/${journalId}/recommendations`, { language:"en-US", page:1 });
      if (!data.results?.length) data = await tmdb(`/movie/${journalId}/similar`, { language:"en-US", page:1 });
      const logged = new Set(watchlog.map(m=>m.title?.toLowerCase()));
      setSuggestions((data.results||[]).filter(m=>!logged.has((m.title||"").toLowerCase())));
      setReason(source ? `Because you watched ${source.title}` : "");
    } catch { setError("Search failed — check your TMDB token."); }
    setLoading(false);
  }

  const inp = { padding:"9px 12px", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:14, outline:"none", fontFamily:"inherit" };
  const sortedGenres = Object.entries(GENRE_MAP).sort((a,b)=>a[1].localeCompare(b[1]));

  return (
    <div>
      <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", marginTop:0, marginBottom:"1rem" }}>Suggested For You</h2>

      <div style={{ display:"flex", gap:8, marginBottom:"1.25rem" }}>
        {[["criteria","By Criteria"],["similar","Similar To…"]].map(([id,label])=>(
          <button key={id} onClick={()=>switchMode(id)} style={{
            padding:"7px 14px", border:"1px solid #2A2A3A", borderRadius:8, cursor:"pointer",
            background: mode===id?"#E8A838":"transparent",
            color: mode===id?"#0D0D14":"#8888AA",
            fontWeight: mode===id?700:400, fontSize:13, fontFamily:"inherit"
          }}>{label}</button>
        ))}
      </div>

      {mode==="criteria" ? (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:"1.25rem", alignItems:"center" }}>
          <select value={genreId} onChange={e=>setGenreId(e.target.value)} style={inp}>
            <option value="">Any genre</option>
            {sortedGenres.map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select>
          <select value={decade} onChange={e=>setDecade(e.target.value)} style={inp}>
            <option value="">Any era</option>
            {decades.map(d=><option key={d} value={d}>{d}s</option>)}
          </select>
          <input value={personQuery} onChange={e=>setPersonQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&findByCriteria()}
            placeholder="Actor, actress, or director…" style={{ ...inp, flex:1, minWidth:180 }} />
          <button onClick={findByCriteria} style={{ padding:"9px 18px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {loading?"…":"Find"}
          </button>
        </div>
      ) : (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:"1.25rem", alignItems:"center" }}>
          {journalWithTmdb.length===0 ? (
            <p style={{ color:"#8888AA", margin:0 }}>Log a movie via search first so it's linked to TMDB — then you can find things similar to it.</p>
          ) : (
            <>
              <select value={journalId} onChange={e=>setJournalId(e.target.value)} style={{ ...inp, flex:1, minWidth:220 }}>
                <option value="">Pick a movie from your journal…</option>
                {journalWithTmdb.map(m=>(
                  <option key={m.id} value={m.tmdb_id}>{m.title}{m.year?` (${m.year})`:""}</option>
                ))}
              </select>
              <button onClick={findSimilar} style={{ padding:"9px 18px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {loading?"…":"Find Similar"}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p style={{ color:"#E05555", fontSize:14 }}>{error}</p>}

      {suggestions.length>0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.75rem", flexWrap:"wrap", gap:8 }}>
          <p style={{ color:"#8888AA", fontSize:14, margin:0 }}>{reason}</p>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ color:"#8888AA", fontSize:12 }}>Sort by</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...inp, padding:"6px 10px", fontSize:13 }}>
              <option value="popularity">Popularity</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>
      )}
      {suggestions.length===0 && reason && (
        <p style={{ color:"#8888AA", fontSize:14, marginTop:0, marginBottom:"1.25rem" }}>{reason}</p>
      )}
      {!loading && !error && reason && suggestions.length===0 && (
        <p style={{ color:"#8888AA", fontSize:14 }}>No matches — try different criteria.</p>
      )}

      {selected && (
        <div style={{ background:"#16161F", border:"1px solid #E8A838", borderRadius:12, padding:"1.25rem", marginBottom:"1.5rem", display:"flex", gap:16 }}>
          <Poster src={selected.poster_path?TMDB_IMG+selected.poster_path:""} title={selected.title} width={90} height={135} />
          <div style={{ flex:1 }}>
            <h3 style={{ margin:"0 0 4px", color:"#F5E6C8" }}>
              {selected.title}
              <span style={{ color:"#8888AA", fontWeight:400, fontSize:15 }}> ({(selected.release_date||"").slice(0,4)})</span>
            </h3>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
              {(selected.genres||[]).map(g=>(
                <span key={g.id} style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #8888AA", color:"#8888AA" }}>{g.name}</span>
              ))}
              {selected.vote_average>0 && (
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #E8A838", color:"#E8A838" }}>★ {selected.vote_average.toFixed(1)}</span>
              )}
            </div>
            <p style={{ margin:"0 0 12px", color:"#AAAACC", fontSize:14, lineHeight:1.6 }}>{selected.overview}</p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>onSelectMovie(buildPrefill(selected))}
                style={{ padding:"8px 18px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                + Log this movie
              </button>
              {onAddToList && (
                <button onClick={()=>!isWatched(selected, listedSet) && onAddToList(buildPrefill(selected))}
                  disabled={isWatched(selected, listedSet)}
                  style={{ padding:"8px 18px", background:"none", border:"1px solid #A78BFA", borderRadius:8, color:"#A78BFA", fontWeight:700, cursor: isWatched(selected, listedSet)?"default":"pointer", fontFamily:"inherit" }}>
                  {isWatched(selected, listedSet) ? "✓ On The List" : "+ Add to The List"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:12 }}>
        {sortedSuggestions.map(m=>(
          <div key={m.id} onClick={()=>selectMovie(m)}
            style={{ background:"#16161F", border:`1px solid ${selected?.id===m.id?"#E8A838":"#2A2A3A"}`, borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=selected?.id===m.id?"#E8A838":"#2A2A3A"}>
            {m.poster_path
              ? <img src={TMDB_IMG+m.poster_path} alt="" style={{ width:"100%", aspectRatio:"2/3", objectFit:"cover", display:"block" }} />
              : <div style={{ aspectRatio:"2/3", background:"#0D0D14", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🎬</div>}
            <div style={{ padding:"8px 10px" }}>
              <p style={{ margin:0, color:"#F5E6C8", fontSize:13, fontWeight:500, lineHeight:1.3 }}>{m.title}</p>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
                <span style={{ color:"#8888AA", fontSize:12 }}>{(m.release_date||"").slice(0,4)}</span>
                {m.vote_average>0 && <span style={{ color:"#E8A838", fontSize:12 }}>★{m.vote_average.toFixed(1)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
// data items: {label, value, movies?} — items with a non-empty `movies` array
// (journal entries) become clickable, expanding to list them underneath.
function BarChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [openIdx,  setOpenIdx]  = useState(null);
  if (!data.length) return null;
  const max = Math.max(1, ...data.map(d=>d.value));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {data.map((d,i)=>{
        const clickable = Array.isArray(d.movies) && d.movies.length>0;
        const isOpen = clickable && openIdx===i;
        return (
          <div key={d.label}>
            <div
              onMouseEnter={()=>setHoverIdx(i)} onMouseLeave={()=>setHoverIdx(null)}
              onClick={()=>clickable && setOpenIdx(isOpen ? null : i)}
              style={{ display:"flex", alignItems:"center", gap:10, cursor: clickable ? "pointer" : "default" }}
            >
              <span style={{
                width:130, flexShrink:0, color:"#AAAACC", fontSize:13, textAlign:"right",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
              }} title={d.label}>{d.label}</span>
              <div style={{ flex:1, background:"#0D0D14", borderRadius:4, height:18, position:"relative" }}>
                <div style={{
                  width:`${Math.max((d.value/max)*100, 3)}%`, height:"100%",
                  background: isOpen ? "#F5C463" : hoverIdx===i ? "#F0BB55" : "#E8A838",
                  borderRadius:4, transition:"width 0.3s ease, background 0.15s"
                }} />
              </div>
              <span style={{ width:26, flexShrink:0, color:"#F5E6C8", fontSize:13, fontWeight:600 }}>{d.value}</span>
              {clickable && <span style={{ width:12, flexShrink:0, color:"#555577", fontSize:11 }}>{isOpen?"▾":"▸"}</span>}
            </div>
            {isOpen && (
              <div style={{ margin:"6px 0 4px 140px", display:"flex", flexDirection:"column", gap:6 }}>
                {d.movies.map(m=>(
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Poster src={m.poster} title={m.title} width={24} height={35} />
                    <span style={{ color:"#F5E6C8", fontSize:13 }}>{m.title}</span>
                    {m.year && <span style={{ color:"#8888AA", fontSize:12 }}>({m.year})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Report Tab ───────────────────────────────────────────────────────────────
const MIN_FOR_CHARTS   = 5;
const TOP_BILLED_CAST  = 8;
const CREDITS_CACHE_KEY = "mm_credits_cache_v1";
const CREDITS_BATCH_SIZE = 20;

function loadCreditsCache() {
  try { return JSON.parse(localStorage.getItem(CREDITS_CACHE_KEY)) || {}; }
  catch { return {}; }
}
function saveCreditsCache(cache) {
  try { localStorage.setItem(CREDITS_CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full/unavailable — cache just won't persist */ }
}

function ReportTab({ watchlog, userEmail }) {
  const [credits,         setCredits]         = useState(loadCreditsCache);
  const [creditsLoading,  setCreditsLoading]  = useState(false);
  const fetchedIds = useRef(new Set(Object.keys(loadCreditsCache())));

  const showCharts   = watchlog.length >= MIN_FOR_CHARTS;
  const linkedMovies = watchlog.filter(m=>m.tmdb_id);

  useEffect(() => {
    if (!showCharts) return;
    const missing = linkedMovies.filter(m=>!fetchedIds.current.has(String(m.tmdb_id)));
    if (missing.length===0) return;
    missing.forEach(m=>fetchedIds.current.add(String(m.tmdb_id)));
    let cancelled = false;
    setCreditsLoading(true);

    (async () => {
      // Fetched in small batches (rather than one burst of N requests) so a large
      // back-catalog of logged movies doesn't fire hundreds of parallel requests at once.
      for (let i=0; i<missing.length; i+=CREDITS_BATCH_SIZE) {
        if (cancelled) return;
        const batch = missing.slice(i, i+CREDITS_BATCH_SIZE);
        const pairs = await Promise.all(batch.map(m =>
          tmdb(`/movie/${m.tmdb_id}/credits`, { language:"en-US" }).then(d=>[m.tmdb_id,d]).catch(()=>[m.tmdb_id,null])
        ));
        if (cancelled) return;
        setCredits(prev => {
          const next = { ...prev };
          pairs.forEach(([id,d])=>{ if(d) next[id]=d; });
          saveCreditsCache(next);
          return next;
        });
      }
      if (!cancelled) setCreditsLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlog, showCharts]);

  const tmdbIdToEntries = useMemo(() => {
    const map = new Map();
    watchlog.forEach(m => {
      if (!m.tmdb_id) return;
      const key = String(m.tmdb_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return map;
  }, [watchlog]);

  const { topActors, topActresses, topDirectors } = useMemo(() => {
    const actorMap = new Map(), actressMap = new Map(), directorMap = new Map();
    Object.entries(credits).forEach(([tmdbId, c]) => {
      const entries = tmdbIdToEntries.get(String(tmdbId)) || [];
      if (entries.length===0) return;
      (c.cast||[]).slice(0, TOP_BILLED_CAST).forEach(p => {
        const bucket = p.gender===2 ? actorMap : p.gender===1 ? actressMap : null;
        if (!bucket) return;
        const cur = bucket.get(p.name) || [];
        cur.push(...entries);
        bucket.set(p.name, cur);
      });
      (c.crew||[]).filter(p=>p.job==="Director").forEach(p => {
        const cur = directorMap.get(p.name) || [];
        cur.push(...entries);
        directorMap.set(p.name, cur);
      });
    });
    const topN = map => [...map.entries()]
      .sort((a,b)=>b[1].length-a[1].length)
      .slice(0,10)
      .map(([label,movies])=>({ label, value:movies.length, movies }));
    return { topActors: topN(actorMap), topActresses: topN(actressMap), topDirectors: topN(directorMap) };
  }, [credits, tmdbIdToEntries]);

  const decadeData = useMemo(() => {
    const byDecade = {};
    watchlog.forEach(m => { if (m.year) { const d = Math.floor(Number(m.year)/10)*10; (byDecade[d]=byDecade[d]||[]).push(m); } });
    return Object.entries(byDecade)
      .map(([decade,movies])=>({ label:`${decade}s`, value:movies.length, movies, _decade:Number(decade) }))
      .sort((a,b)=>a._decade-b._decade);
  }, [watchlog]);

  if (watchlog.length===0) return (
    <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
      <p>Log some movies to generate your report!</p>
    </div>
  );

  const total       = watchlog.length;
  const goldCount   = watchlog.filter(m=>m.gold_rank!=null).length;
  const genreCounts = watchlog.reduce((acc,m)=>{ if(m.genre) acc[m.genre]=(acc[m.genre]||0)+1; return acc; },{});
  const genreMovies = watchlog.reduce((acc,m)=>{ if(m.genre) (acc[m.genre]=acc[m.genre]||[]).push(m); return acc; },{});
  const genreData   = Object.entries(genreCounts).map(([label,value])=>({ label, value, movies:genreMovies[label] })).sort((a,b)=>b.value-a.value);
  const topGenre    = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1])[0];
  const top5        = [...watchlog].filter(m=>m.gold_rank!=null).sort((a,b)=>a.gold_rank-b.gold_rank).slice(0,5);
  const recent5     = [...watchlog].sort((a,b)=>new Date(b.watch_date)-new Date(a.watch_date)).slice(0,5);

  function printReport() {
    const win = window.open("","_blank");
    const sorted = [...watchlog].sort((a,b)=>new Date(b.watch_date)-new Date(a.watch_date));
    win.document.write(`<!DOCTYPE html><html><head><title>Movie Monday — ${userEmail}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#222;line-height:1.6}
h1{font-size:26px}h2{font-size:18px;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-top:0.75rem}
td,th{padding:7px 10px;text-align:left;border-bottom:1px solid #eee;font-size:13px}
th{font-weight:600;color:#555}.stats{display:flex;gap:2rem;margin:1rem 0}
.stat-n{font-size:26px;font-weight:700}.stat-l{font-size:12px;color:#888}</style></head><body>
<h1>🎬 Movie Monday — ${userEmail}</h1>
<p style="color:#888">Generated ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</p>
<h2>Overview</h2>
<div class="stats">
  <div><div class="stat-n">${total}</div><div class="stat-l">Movies Logged</div></div>
  <div><div class="stat-n">${goldCount}</div><div class="stat-l">Hall of Fame</div></div>
  ${topGenre?`<div><div class="stat-n">${topGenre[0]}</div><div class="stat-l">Top Genre (${topGenre[1]})</div></div>`:""}
</div>
<h2>Top Rated</h2>
<table><tr><th>#</th><th>Title</th><th>Year</th><th>Genre</th><th>Notes</th></tr>
${top5.map((m,i)=>`<tr><td>${i+1}</td><td>${m.title}</td><td>${m.year||"—"}</td><td>${m.genre||"—"}</td><td>${m.notes||"—"}</td></tr>`).join("")}
</table>
<h2>Full Watch History</h2>
<table><tr><th>Title</th><th>Year</th><th>Genre</th><th>Watched</th><th>Notes</th></tr>
${sorted.map(m=>`<tr><td>${m.title}</td><td>${m.year||"—"}</td><td>${m.genre||"—"}</td><td>${m.watch_date||"—"}</td><td>${m.notes||"—"}</td></tr>`).join("")}
</table></body></html>`);
    win.document.close(); win.print();
  }

  const statBox = { background:"#16161F", border:"1px solid #2A2A3A", borderRadius:12, padding:"1rem 1.25rem", textAlign:"center" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
        <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", margin:0 }}>My Report</h2>
        <button onClick={printReport} style={{ padding:"8px 16px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
          🖨 Print / Export
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:"1.5rem" }}>
        <div style={statBox}><div style={{ fontSize:28, fontWeight:700, color:"#E8A838" }}>{total}</div><div style={{ color:"#8888AA", fontSize:13, marginTop:2 }}>Movies Logged</div></div>
        <div style={statBox}><div style={{ fontSize:28, fontWeight:700, color:"#E8A838" }}>{goldCount}</div><div style={{ color:"#8888AA", fontSize:13, marginTop:2 }}>Hall of Fame</div></div>
        {topGenre&&<div style={statBox}><div style={{ fontSize:20, fontWeight:700, color:"#E8A838" }}>{topGenre[0]}</div><div style={{ color:"#8888AA", fontSize:13, marginTop:2 }}>Top Genre</div></div>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:"1.5rem" }}>
        <div>
          <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0 }}>⭐ Top Rated</h3>
          {top5.length===0
            ? <p style={{ color:"#8888AA", fontSize:13 }}>Star your favorites in the Journal to rank them here.</p>
            : top5.map((m,i)=>(
              <div key={m.id} style={{ display:"flex", gap:10, alignItems:"center", paddingBottom:8, marginBottom:8, borderBottom:"1px solid #2A2A3A" }}>
                <span style={{ color:"#E8A838", fontWeight:700, width:18, flexShrink:0 }}>{i+1}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, color:"#F5E6C8", fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</p>
                  {m.year && <p style={{ margin:0, color:"#8888AA", fontSize:12 }}>{m.year}</p>}
                </div>
              </div>
            ))}
        </div>
        <div>
          <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0 }}>Recently Watched</h3>
          {recent5.map(m=>(
            <div key={m.id} style={{ paddingBottom:8, marginBottom:8, borderBottom:"1px solid #2A2A3A" }}>
              <p style={{ margin:0, color:"#F5E6C8", fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</p>
              <p style={{ margin:0, color:"#8888AA", fontSize:12 }}>{m.watch_date || "No date"}</p>
            </div>
          ))}
        </div>
      </div>
      {!showCharts && (
        <p style={{ color:"#8888AA", fontSize:14 }}>
          Log {MIN_FOR_CHARTS - total} more movie{MIN_FOR_CHARTS-total===1?"":"s"} to unlock charts and stats.
        </p>
      )}

      {showCharts && (
        <div style={{ display:"flex", flexDirection:"column", gap:"2rem" }}>
          <div>
            <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0, marginBottom:12 }}>Genre Allocation</h3>
            <BarChart data={genreData} />
          </div>

          <div>
            <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0, marginBottom:12 }}>Decade Allocation</h3>
            <BarChart data={decadeData} />
          </div>

          <div>
            <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0, marginBottom:4 }}>Top 10 Actors</h3>
            <p style={{ color:"#555577", fontSize:12, marginTop:0, marginBottom:12 }}>By appearance count among top-billed cast in your linked movies.</p>
            {creditsLoading && topActors.length===0
              ? <p style={{ color:"#8888AA", fontSize:13 }}>Loading cast data…</p>
              : topActors.length>0
                ? <BarChart data={topActors} />
                : <p style={{ color:"#8888AA", fontSize:13 }}>Not enough linked movies yet.</p>}
          </div>

          <div>
            <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0, marginBottom:4 }}>Top 10 Actresses</h3>
            <p style={{ color:"#555577", fontSize:12, marginTop:0, marginBottom:12 }}>By appearance count among top-billed cast in your linked movies.</p>
            {creditsLoading && topActresses.length===0
              ? <p style={{ color:"#8888AA", fontSize:13 }}>Loading cast data…</p>
              : topActresses.length>0
                ? <BarChart data={topActresses} />
                : <p style={{ color:"#8888AA", fontSize:13 }}>Not enough linked movies yet.</p>}
          </div>

          <div>
            <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0, marginBottom:4 }}>Top 10 Directors</h3>
            <p style={{ color:"#555577", fontSize:12, marginTop:0, marginBottom:12 }}>By appearance count in your linked movies.</p>
            {creditsLoading && topDirectors.length===0
              ? <p style={{ color:"#8888AA", fontSize:13 }}>Loading crew data…</p>
              : topDirectors.length>0
                ? <BarChart data={topDirectors} />
                : <p style={{ color:"#8888AA", fontSize:13 }}>Not enough linked movies yet.</p>}
          </div>

          {linkedMovies.length<total && (
            <p style={{ color:"#555577", fontSize:12, margin:0 }}>
              {total-linkedMovies.length} of your {total} logged movies {total-linkedMovies.length===1?"was":"were"} entered manually and {total-linkedMovies.length===1?"isn't":"aren't"} linked to TMDB, so {total-linkedMovies.length===1?"it's":"they're"} excluded from the actor/actress/director charts above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [demoMode]   = useState(() => new URLSearchParams(window.location.search).get("demo")==="1");
  const [user,       setUser]       = useState(null);
  const [watchlog,   setWatchlog]   = useState([]);
  const [watchlist,  setWatchlist]  = useState([]);
  const [tab,        setTab]        = useState("journal");
  const [showLog,    setShowLog]    = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showListSearch, setShowListSearch] = useState(false);
  const [showListManual, setShowListManual] = useState(false);
  const [logPrefill, setLogPrefill] = useState(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [authReady,  setAuthReady]  = useState(false);
  const [showDemoInfo, setShowDemoInfo] = useState(false);

  // Listen for auth state changes
  useEffect(()=>{
    if (demoMode) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data:{ session }})=>{
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    const { data:{ subscription }} = supabase.auth.onAuthStateChange((_event, session)=>{
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  },[demoMode]);

  // Load watchlog when user is set, or the fixed demo account's data in demo mode
  useEffect(()=>{
    if (demoMode) {
      if (!DEMO_ENABLED) return;
      setLoadingLog(true);
      // demo_watchlog is a DB view that already scopes to one fixed account and
      // excludes personal notes — no user_id filtering needed client-side.
      supabase.from("demo_watchlog").select("*").order("watch_date", { ascending:false })
        .then(({ data, error })=>{ if (!error) setWatchlog(data||[]); setLoadingLog(false); });
    } else if (user) {
      fetchWatchlog();
    } else {
      setWatchlog([]);
    }
  },[user, demoMode]);

  async function fetchWatchlog() {
    setLoadingLog(true);
    const { data, error } = await supabase
      .from("watchlog")
      .select("*")
      .order("watch_date", { ascending:false });
    if (!error) setWatchlog(data||[]);
    setLoadingLog(false);
  }

  // Load The List (want-to-watch), same real-vs-demo split as watchlog
  useEffect(()=>{
    if (demoMode) {
      if (!DEMO_ENABLED) return;
      supabase.from("demo_watchlist").select("*").order("created_at", { ascending:false })
        .then(({ data, error })=>{ if (!error) setWatchlist(data||[]); });
    } else if (user) {
      supabase.from("watchlist").select("*").order("created_at", { ascending:false })
        .then(({ data, error })=>{ if (!error) setWatchlist(data||[]); });
    } else {
      setWatchlist([]);
    }
  },[user, demoMode]);

  // Backfills the TMDB summary for movies logged before the overview field existed.
  // Fetched once per movie ever (persisted to the DB), not on every visit — new
  // entries already capture it at log time via buildPrefill, this only covers the
  // back-catalog. Skipped entirely in the read-only demo (anon can't write back).
  const overviewBackfillRef = useRef(new Set());
  useEffect(() => {
    if (demoMode) return;
    const missing = watchlog.filter(m => m.tmdb_id && !m.overview && !overviewBackfillRef.current.has(m.id));
    if (missing.length===0) return;
    missing.forEach(m=>overviewBackfillRef.current.add(m.id));
    let cancelled = false;
    (async () => {
      const BATCH = 10;
      for (let i=0; i<missing.length; i+=BATCH) {
        if (cancelled) return;
        const batch = missing.slice(i, i+BATCH);
        const results = await Promise.all(batch.map(async m => {
          try {
            const detail = await tmdb(`/movie/${m.tmdb_id}`, { language:"en-US" });
            return detail.overview ? { id: m.id, overview: detail.overview } : null;
          } catch { return null; }
        }));
        const found = results.filter(Boolean);
        if (found.length===0) continue;
        if (cancelled) return;
        setWatchlog(prev => prev.map(m => {
          const hit = found.find(f=>f.id===m.id);
          return hit ? { ...m, overview: hit.overview } : m;
        }));
        await Promise.all(found.map(f => supabase.from("watchlog").update({ overview:f.overview }).eq("id", f.id)));
      }
    })();
    return () => { cancelled = true; };
  },[watchlog, demoMode]);

  async function handleSaveMovie(entry, editId) {
    if (editId) {
      // Update existing entry
      const { data, error } = await supabase
        .from("watchlog")
        .update(entry)
        .eq("id", editId)
        .select()
        .single();
      if (!error) {
        setWatchlog(prev=>prev.map(m=>m.id===editId ? data : m));
        setShowLog(false);
        setLogPrefill(null);
      } else {
        alert("Error updating: " + error.message);
      }
    } else {
      // Insert new entry
      const { data, error } = await supabase
        .from("watchlog")
        .insert([{ ...entry, user_id: user.id }])
        .select()
        .single();
      if (!error) {
        setWatchlog(prev=>[data, ...prev]);
        if (logPrefill?.fromListId) {
          await supabase.from("watchlist").delete().eq("id", logPrefill.fromListId);
          setWatchlist(prev=>prev.filter(w=>w.id!==logPrefill.fromListId));
        }
        setShowLog(false);
        setLogPrefill(null);
        setTab("journal");
      } else {
        alert("Error saving: " + error.message);
      }
    }
  }

  function handleEditMovie(movie) {
    setLogPrefill(movie);
    setShowLog(true);
  }

  async function handleDelete(id) {
    await supabase.from("watchlog").delete().eq("id", id);
    setWatchlog(prev=>prev.filter(m=>m.id!==id));
  }

  async function handleAddToList(prefill) {
    const key = prefill.tmdbId || prefill.tmdb_id ? String(prefill.tmdbId || prefill.tmdb_id) : null;
    const alreadyOnList = watchlist.some(w => (key && String(w.tmdb_id)===key) || w.title.toLowerCase()===prefill.title.toLowerCase());
    if (alreadyOnList) return;
    const entry = {
      title:    prefill.title,
      year:     prefill.year || "",
      genre:    prefill.genre || "",
      poster:   prefill.poster || "",
      tmdb_id:  prefill.tmdbId || prefill.tmdb_id || null,
      overview: prefill.overview || "",
      user_id:  user.id
    };
    const { data, error } = await supabase.from("watchlist").insert([entry]).select().single();
    if (!error) setWatchlist(prev=>[data, ...prev]);
    else alert("Error adding to list: " + error.message);
  }

  async function handleRemoveFromList(id) {
    await supabase.from("watchlist").delete().eq("id", id);
    setWatchlist(prev=>prev.filter(w=>w.id!==id));
  }

  function handleMoveToJournal(item) {
    setLogPrefill({
      title: item.title, year: item.year, genre: item.genre, poster: item.poster,
      tmdb_id: item.tmdb_id, overview: item.overview, fromListId: item.id
    });
    setShowLog(true);
  }

  async function handleToggleGoldStar(movie) {
    if (movie.gold_rank!=null) {
      const removedRank = movie.gold_rank;
      const { error: e1 } = await supabase.from("watchlog").update({ gold_rank:null }).eq("id", movie.id);
      if (e1) { alert("Error: " + e1.message); return; }
      const toShift = watchlog.filter(m=>m.gold_rank!=null && m.gold_rank>removedRank);
      await Promise.all(toShift.map(m=>supabase.from("watchlog").update({ gold_rank:m.gold_rank-1 }).eq("id", m.id)));
      setWatchlog(prev=>prev.map(m=>{
        if (m.id===movie.id) return { ...m, gold_rank:null };
        if (m.gold_rank!=null && m.gold_rank>removedRank) return { ...m, gold_rank:m.gold_rank-1 };
        return m;
      }));
    } else {
      const maxRank = watchlog.reduce((max,m)=>m.gold_rank!=null && m.gold_rank>max ? m.gold_rank : max, 0);
      const newRank = maxRank+1;
      const { error: e1 } = await supabase.from("watchlog").update({ gold_rank:newRank }).eq("id", movie.id);
      if (e1) { alert("Error: " + e1.message); return; }
      setWatchlog(prev=>prev.map(m=>m.id===movie.id ? { ...m, gold_rank:newRank } : m));
    }
  }

  async function handleReorderGoldStars(orderedIds) {
    const updates = orderedIds.map((id,i)=>({ id, gold_rank:i+1 }));
    setWatchlog(prev=>prev.map(m=>{
      const u = updates.find(x=>x.id===m.id);
      return u ? { ...m, gold_rank:u.gold_rank } : m;
    }));
    await Promise.all(updates.map(u=>supabase.from("watchlog").update({ gold_rank:u.gold_rank }).eq("id", u.id)));
  }

  async function handleToggleStage(movie) {
    const wasStaged = movie.hof_staged === true;
    const otherStaged = watchlog.find(m=>m.hof_staged && m.id!==movie.id);
    setWatchlog(prev=>prev.map(m=>{
      if (m.id===movie.id) return { ...m, hof_staged: !wasStaged };
      if (otherStaged && m.id===otherStaged.id) return { ...m, hof_staged:false };
      return m;
    }));
    const jobs = [supabase.from("watchlog").update({ hof_staged: !wasStaged }).eq("id", movie.id)];
    if (!wasStaged && otherStaged) jobs.push(supabase.from("watchlog").update({ hof_staged:false }).eq("id", otherStaged.id));
    await Promise.all(jobs);
  }

  // Demotes a Top 25 pick. If something is staged, it swaps ranks with the
  // demoted pick (landing in its exact vacated slot) and is un-staged; if
  // nothing is staged, the next-best-ranked pick fills the vacancy as usual.
  async function handleRemoveFromTop25(movie) {
    const goldMovies = [...watchlog].filter(m=>m.gold_rank!=null).sort((a,b)=>a.gold_rank-b.gold_rank);
    const staged = watchlog.find(m=>m.hof_staged && m.id!==movie.id);
    let order;
    if (staged) {
      order = [...goldMovies];
      const posMovie  = order.findIndex(m=>m.id===movie.id);
      const posStaged = order.findIndex(m=>m.id===staged.id);
      [order[posMovie], order[posStaged]] = [order[posStaged], order[posMovie]];
    } else {
      order = goldMovies.filter(m=>m.id!==movie.id);
      order.push(movie);
    }
    await handleReorderGoldStars(order.map(m=>m.id));
    if (staged) await handleToggleStage(staged);
  }

  function handleSelectMovie(prefill) {
    setLogPrefill(prefill);
    setShowLog(true);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setWatchlog([]);
    setTab("journal");
  }

  if (!demoMode) {
    if (!authReady) return <Spinner />;
    if (!user) return <AuthScreen onLogin={setUser} />;
  }

  const TABS = demoMode
    ? [
        { id:"journal",  label:"Journal"      },
        { id:"list",     label:"The List"     },
        { id:"goldstar", label:"Hall of Fame" },
        { id:"report",   label:"Report"       },
      ]
    : [
        { id:"journal",     label:"Journal"      },
        { id:"list",        label:"The List"     },
        { id:"search",      label:"Search"       },
        { id:"suggestions", label:"For You"      },
        { id:"goldstar",    label:"Hall of Fame" },
        { id:"report",      label:"Report"       },
      ];

  return (
    <div style={{ minHeight:"100vh", background:"#0D0D14", color:"#F5E6C8", fontFamily:"'Georgia',serif" }}>
      <header style={{ borderBottom:"1px solid #2A2A3A", padding:"0 24px", position:"sticky", top:0, background:"#0D0D14", zIndex:100 }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:12, height:56 }}>
          <span style={{ fontSize:20, fontWeight:700, letterSpacing:"-0.5px", flex:1 }}>🎬 Movie Monday</span>
          <nav style={{ display:"flex", gap:2 }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:"6px 13px", border:"none", borderRadius:8, cursor:"pointer",
                background: tab===t.id?"#E8A838":"transparent",
                color: tab===t.id?"#0D0D14":"#8888AA",
                fontWeight: tab===t.id?700:400,
                fontSize:13, fontFamily:"inherit", transition:"all 0.15s"
              }}>{t.label}</button>
            ))}
          </nav>
          {demoMode ? (
            <>
              <div style={{ position:"relative" }}>
                <button onClick={()=>setShowDemoInfo(v=>!v)} style={{
                  display:"flex", alignItems:"center", gap:6, background:"none",
                  border:"1px solid #A78BFA", borderRadius:20, padding:"5px 12px",
                  color:"#A78BFA", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit"
                }}>
                  <span style={{
                    width:15, height:15, borderRadius:"50%", border:"1.5px solid #A78BFA",
                    display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0
                  }}>i</span>
                  Read-only demo
                </button>
                {showDemoInfo && (
                  <div style={{
                    position:"absolute", top:"calc(100% + 8px)", right:0, width:240, zIndex:200,
                    background:"#16161F", border:"1px solid #A78BFA", borderRadius:10,
                    padding:"10px 12px", color:"#AAAACC", fontSize:12, lineHeight:1.5, textAlign:"left"
                  }}>
                    You're viewing example data. Nothing here is editable — sign in to start your own journal.
                  </div>
                )}
              </div>
              <a href="." style={{ padding:"7px 14px", background:"#1E1E2F", border:"1px solid #3A3A5A", borderRadius:8, color:"#E8A838", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, textDecoration:"none" }}>
                Sign In
              </a>
            </>
          ) : (
            <>
              <button onClick={()=>setShowSearch(true)} style={{ padding:"7px 14px", background:"#1E1E2F", border:"1px solid #3A3A5A", borderRadius:8, color:"#E8A838", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>
                + Log Movie
              </button>
              <button onClick={handleLogout} style={{ background:"none", border:"none", color:"#555577", cursor:"pointer", fontSize:12, fontFamily:"inherit" }} title="Sign out">
                {user.email?.split("@")[0]} ↩
              </button>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth:1100, margin:"0 auto", padding:"2rem 24px" }}>
        {tab==="journal"     && <JournalTab     watchlog={watchlog} onDelete={handleDelete} onEdit={handleEditMovie} onToggleGold={handleToggleGoldStar} onImportClick={()=>setShowImport(true)} loading={loadingLog} readOnly={demoMode} />}
        {tab==="list"        && <WatchlistTab   watchlist={watchlist} onRemove={handleRemoveFromList} onMoveToJournal={handleMoveToJournal} onAddClick={()=>setShowListSearch(true)} readOnly={demoMode} />}
        {!demoMode && tab==="search"      && <SearchTab      onSelectMovie={handleSelectMovie} watchlog={watchlog} watchlist={watchlist} onAddToList={handleAddToList} />}
        {!demoMode && tab==="suggestions" && <SuggestionsTab watchlog={watchlog} onSelectMovie={handleSelectMovie} watchlist={watchlist} onAddToList={handleAddToList} />}
        {tab==="goldstar"    && <GoldStarTab    watchlog={watchlog} onReorder={handleReorderGoldStars} onToggleGold={handleToggleGoldStar} onToggleStage={handleToggleStage} onRemoveFromTop25={handleRemoveFromTop25} readOnly={demoMode} />}
        {tab==="report"      && <ReportTab      watchlog={watchlog} userEmail={demoMode ? "" : user.email} />}
      </main>

      {showSearch && (
        <LogMovieSearchModal
          onSelectMovie={(prefill)=>{ setShowSearch(false); handleSelectMovie(prefill); }}
          onManual={()=>{ setShowSearch(false); setLogPrefill(null); setShowLog(true); }}
          onClose={()=>setShowSearch(false)}
          watchlog={watchlog}
          watchlist={watchlist}
          onAddToList={(prefill)=>{ handleAddToList(prefill); }}
        />
      )}

      {showImport && (
        <ImportCsvModal
          watchlog={watchlog}
          userId={user.id}
          onImported={(rows)=>{ if (rows.length>0) setWatchlog(prev=>[...rows, ...prev]); }}
          onClose={()=>setShowImport(false)}
        />
      )}

      {showLog && (
        <LogMovieModal
          prefill={logPrefill}
          onSave={handleSaveMovie}
          onClose={()=>{ setShowLog(false); setLogPrefill(null); }}
        />
      )}

      {showListSearch && (
        <LogMovieSearchModal
          mode="list"
          onSelectMovie={(prefill)=>{ handleAddToList(prefill); setShowListSearch(false); }}
          onManual={()=>{ setShowListSearch(false); setShowListManual(true); }}
          onClose={()=>setShowListSearch(false)}
          watchlog={watchlog}
          watchlist={watchlist}
        />
      )}

      {showListManual && (
        <LogMovieModal
          mode="list"
          prefill={null}
          onSave={(entry)=>{ handleAddToList(entry); setShowListManual(false); }}
          onClose={()=>setShowListManual(false)}
        />
      )}
    </div>
  );
}