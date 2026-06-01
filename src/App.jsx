import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────
const TMDB_TOKEN = import.meta.env.VITE_TMDB_TOKEN;
const TMDB_BASE  = "https://api.themoviedb.org/3";
const TMDB_IMG   = "https://image.tmdb.org/t/p/w300";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Stars({ value, onChange, size = 22 }) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ display:"inline-flex", gap:2, cursor: onChange ? "pointer":"default" }}>
      {[1,2,3,4,5].map(i => (
        <span key={i}
          style={{ fontSize:size, color:(hover||value)>=i?"#E8A838":"#333355", lineHeight:1 }}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(i)}>
          {(hover||value)>=i ? "★":"☆"}
        </span>
      ))}
    </span>
  );
}

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
      const { error: e } = await supabase.auth.signUp({ email, password });
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
          <div style={{ fontSize:40, marginBottom:8 }}>🎬</div>
          <h1 style={{ margin:0, fontSize:30, fontWeight:700, color:"#F5E6C8", letterSpacing:"-0.5px" }}>Movie Monday</h1>
          <p style={{ margin:"6px 0 0", color:"#8888AA", fontSize:14 }}>Your personal cinema journal</p>
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
        </div>
      </div>
    </div>
  );
}

// ─── Log Movie Modal ──────────────────────────────────────────────────────────
function LogMovieModal({ prefill, onSave, onClose }) {
  const [title,     setTitle]     = useState(prefill?.title  || "");
  const [year,      setYear]      = useState(prefill?.year   || "");
  const [genre,     setGenre]     = useState(prefill?.genre  || "");
  const [poster,    setPoster]    = useState(prefill?.poster || "");
  const [tmdbId,    setTmdbId]    = useState(prefill?.tmdbId || null);
  const [rating,    setRating]    = useState(0);
  const [notes,     setNotes]     = useState("");
  const [watchDate, setWatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving,    setSaving]    = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title, year, genre, poster, tmdb_id: tmdbId, rating, notes, watch_date: watchDate });
    setSaving(false);
  }

  const inp = { padding:"9px 12px", background:"#0D0D14", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:14, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const GENRES = ["Action","Adventure","Animation","Comedy","Crime","Documentary","Drama","Family","Fantasy","Horror","Mystery","Romance","Sci-Fi","Thriller","War","Western"];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
      <div style={{ width:"100%", maxWidth:480, background:"#16161F", border:"1px solid #2A2A3A", borderRadius:16, padding:"1.5rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
          <h2 style={{ margin:0, color:"#F5E6C8", fontSize:20 }}>Log a Movie</h2>
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
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ fontSize:13, color:"#8888AA", display:"block", marginBottom:6 }}>Your Rating</label>
          <Stars value={rating} onChange={setRating} size={28} />
        </div>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ fontSize:13, color:"#8888AA", display:"block", marginBottom:6 }}>Date Watched</label>
          <input type="date" value={watchDate} onChange={e=>setWatchDate(e.target.value)} style={inp} />
        </div>
        <div style={{ marginBottom:"1.25rem" }}>
          <label style={{ fontSize:13, color:"#8888AA", display:"block", marginBottom:6 }}>Notes / Comments</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did you think?" rows={3}
            style={{ ...inp, resize:"vertical", lineHeight:1.5 }} />
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#8888AA", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex:2, padding:"10px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {saving?"Saving…":"Save to Journal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────
function SearchTab({ onSelectMovie }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setSelected(null);
    try {
      const data = await tmdb("/search/movie", { query, include_adult:false, language:"en-US", page:1 });
      if (data.results?.length) setResults(data.results.slice(0,12));
      else setError("No results found.");
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
      tmdbId: m.id
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
            </div>
            <p style={{ margin:"0 0 12px", color:"#AAAACC", fontSize:14, lineHeight:1.6 }}>{selected.overview}</p>
            <button onClick={()=>onSelectMovie(buildPrefill(selected))}
              style={{ padding:"8px 18px", background:"#E8A838", border:"none", borderRadius:8, color:"#0D0D14", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              + Log this movie
            </button>
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:12 }}>
        {results.map(m=>(
          <div key={m.id} onClick={()=>selectMovie(m)}
            style={{ background:"#16161F", border:`1px solid ${selected?.id===m.id?"#E8A838":"#2A2A3A"}`, borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=selected?.id===m.id?"#E8A838":"#2A2A3A"}>
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
  );
}

// ─── Journal Tab ──────────────────────────────────────────────────────────────
function JournalTab({ watchlog, onDelete, loading }) {
  const [filter, setFilter] = useState("all");
  const [sort,   setSort]   = useState("recent");

  const genres   = ["all", ...new Set(watchlog.map(m=>m.genre).filter(Boolean))];
  let   filtered = watchlog.filter(m=>filter==="all"||m.genre===filter);
  filtered = [...filtered].sort((a,b)=>{
    if (sort==="recent") return new Date(b.watch_date)-new Date(a.watch_date);
    if (sort==="rating") return b.rating-a.rating;
    return a.title.localeCompare(b.title);
  });

  const sel = { padding:"7px 12px", background:"#16161F", border:"1px solid #2A2A3A", borderRadius:8, color:"#F5E6C8", fontSize:13, outline:"none", fontFamily:"inherit" };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem", flexWrap:"wrap", gap:10 }}>
        <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", margin:0 }}>
          My Journal <span style={{ color:"#8888AA", fontWeight:400, fontSize:16 }}>({watchlog.length})</span>
        </h2>
        <div style={{ display:"flex", gap:8 }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={sel}>
            {genres.map(g=><option key={g} value={g}>{g==="all"?"All Genres":g}</option>)}
          </select>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={sel}>
            <option value="recent">Most Recent</option>
            <option value="rating">Highest Rated</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🍿</div>
          <p>No movies logged yet. Search for one or use <strong style={{ color:"#F5E6C8" }}>+ Log Movie</strong> to get started!</p>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.map(m=>(
          <div key={m.id} style={{ display:"flex", gap:14, background:"#16161F", border:"1px solid #2A2A3A", borderRadius:12, padding:"12px 16px", alignItems:"flex-start" }}>
            <Poster src={m.poster} title={m.title} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                <h3 style={{ margin:0, color:"#F5E6C8", fontSize:16, fontFamily:"'Georgia',serif" }}>{m.title}</h3>
                <button onClick={()=>onDelete(m.id)} title="Remove" style={{ background:"none", border:"none", color:"#555577", cursor:"pointer", fontSize:18, flexShrink:0, padding:0, lineHeight:1 }}>×</button>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
                <Stars value={m.rating} size={14} />
                {m.year  && <span style={{ color:"#8888AA", fontSize:13 }}>{m.year}</span>}
                {m.genre && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, border:"1px solid #555577", color:"#8888AA" }}>{m.genre}</span>}
                <span style={{ color:"#8888AA", fontSize:12 }}>{m.watch_date}</span>
              </div>
              {m.notes && <p style={{ margin:"6px 0 0", color:"#AAAACC", fontSize:14, lineHeight:1.5 }}>{m.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Suggestions Tab ──────────────────────────────────────────────────────────
function SuggestionsTab({ watchlog, onSelectMovie }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [reason,      setReason]      = useState("");

  function topGenreIds() {
    const counts = {};
    watchlog.forEach(m=>{
      const entry = Object.entries(GENRE_MAP).find(([,name])=>name===m.genre);
      if (entry) counts[entry[0]] = (counts[entry[0]]||0) + (m.rating||1);
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([id])=>id);
  }

  async function generate() {
    setLoading(true); setSuggestions([]);
    const logged  = new Set(watchlog.map(m=>m.title?.toLowerCase()));
    const genreIds = topGenreIds();
    let movies = [];
    try {
      if (genreIds.length>0) {
        setReason(`Based on your love of ${GENRE_MAP[genreIds[0]]}`);
        const data = await tmdb("/discover/movie",{
          with_genres: genreIds.slice(0,2).join("|"),
          sort_by:"vote_average.desc",
          "vote_count.gte":200,
          language:"en-US", page:1
        });
        movies = data.results||[];
      } else {
        setReason("Popular movies you might enjoy");
        const data = await tmdb("/movie/popular",{ language:"en-US", page:1 });
        movies = data.results||[];
      }
    } catch {}
    setSuggestions(movies.filter(m=>!logged.has((m.title||"").toLowerCase())).slice(0,12));
    setLoading(false);
  }

  useEffect(()=>{ generate(); },[watchlog.length]);

  function buildPrefill(m) {
    return {
      title:  m.title,
      year:   (m.release_date||"").slice(0,4),
      genre:  GENRE_MAP[m.genre_ids?.[0]]||"",
      poster: m.poster_path?TMDB_IMG+m.poster_path:"",
      tmdbId: m.id
    };
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.5rem" }}>
        <h2 style={{ color:"#F5E6C8", fontFamily:"'Georgia',serif", margin:0 }}>Suggested For You</h2>
        <button onClick={generate} style={{ padding:"7px 16px", background:"none", border:"1px solid #2A2A3A", borderRadius:8, color:"#E8A838", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
          {loading?"Loading…":"Refresh"}
        </button>
      </div>
      {reason && <p style={{ color:"#8888AA", fontSize:14, marginTop:0, marginBottom:"1.25rem" }}>{reason}</p>}
      {watchlog.length===0 && <p style={{ color:"#8888AA" }}>Log some movies first so we can tailor suggestions to your taste!</p>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:12 }}>
        {suggestions.map(m=>(
          <div key={m.id} onClick={()=>onSelectMovie(buildPrefill(m))}
            style={{ background:"#16161F", border:"1px solid #2A2A3A", borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A838"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A3A"}>
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

// ─── Report Tab ───────────────────────────────────────────────────────────────
function ReportTab({ watchlog, userEmail }) {
  if (watchlog.length===0) return (
    <div style={{ textAlign:"center", padding:"3rem", color:"#8888AA" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
      <p>Log some movies to generate your report!</p>
    </div>
  );

  const total       = watchlog.length;
  const rated       = watchlog.filter(m=>m.rating>0);
  const avgRating   = rated.length?(rated.reduce((a,b)=>a+b.rating,0)/rated.length).toFixed(1):"—";
  const genreCounts = watchlog.reduce((acc,m)=>{ if(m.genre) acc[m.genre]=(acc[m.genre]||0)+1; return acc; },{});
  const topGenre    = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1])[0];
  const top5        = [...watchlog].sort((a,b)=>b.rating-a.rating).slice(0,5);
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
  <div><div class="stat-n">${avgRating}</div><div class="stat-l">Avg Rating</div></div>
  ${topGenre?`<div><div class="stat-n">${topGenre[0]}</div><div class="stat-l">Top Genre (${topGenre[1]})</div></div>`:""}
</div>
<h2>Top Rated</h2>
<table><tr><th>#</th><th>Title</th><th>Year</th><th>Genre</th><th>Rating</th><th>Notes</th></tr>
${top5.map((m,i)=>`<tr><td>${i+1}</td><td>${m.title}</td><td>${m.year||"—"}</td><td>${m.genre||"—"}</td><td>${"★".repeat(m.rating)}${"☆".repeat(5-m.rating)}</td><td>${m.notes||"—"}</td></tr>`).join("")}
</table>
<h2>Full Watch History</h2>
<table><tr><th>Title</th><th>Year</th><th>Genre</th><th>Rating</th><th>Watched</th><th>Notes</th></tr>
${sorted.map(m=>`<tr><td>${m.title}</td><td>${m.year||"—"}</td><td>${m.genre||"—"}</td><td>${"★".repeat(m.rating)}${"☆".repeat(5-m.rating)}</td><td>${m.watch_date}</td><td>${m.notes||"—"}</td></tr>`).join("")}
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
        <div style={statBox}><div style={{ fontSize:28, fontWeight:700, color:"#E8A838" }}>{avgRating}</div><div style={{ color:"#8888AA", fontSize:13, marginTop:2 }}>Avg Rating</div></div>
        {topGenre&&<div style={statBox}><div style={{ fontSize:20, fontWeight:700, color:"#E8A838" }}>{topGenre[0]}</div><div style={{ color:"#8888AA", fontSize:13, marginTop:2 }}>Top Genre</div></div>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:"1.5rem" }}>
        <div>
          <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0 }}>Top Rated</h3>
          {top5.map((m,i)=>(
            <div key={m.id} style={{ display:"flex", gap:10, alignItems:"center", paddingBottom:8, marginBottom:8, borderBottom:"1px solid #2A2A3A" }}>
              <span style={{ color:"#E8A838", fontWeight:700, width:18, flexShrink:0 }}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, color:"#F5E6C8", fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</p>
                <Stars value={m.rating} size={12} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0 }}>Recently Watched</h3>
          {recent5.map(m=>(
            <div key={m.id} style={{ paddingBottom:8, marginBottom:8, borderBottom:"1px solid #2A2A3A" }}>
              <p style={{ margin:0, color:"#F5E6C8", fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.title}</p>
              <p style={{ margin:0, color:"#8888AA", fontSize:12 }}>{m.watch_date}</p>
            </div>
          ))}
        </div>
      </div>
      {Object.keys(genreCounts).length>0&&(
        <div>
          <h3 style={{ color:"#F5E6C8", fontSize:15, marginTop:0 }}>Genre Breakdown</h3>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).map(([g,n])=>(
              <div key={g} style={{ background:"#16161F", border:"1px solid #2A2A3A", borderRadius:8, padding:"6px 14px", display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ color:"#F5E6C8", fontSize:14 }}>{g}</span>
                <span style={{ background:"#E8A838", color:"#0D0D14", borderRadius:20, padding:"1px 7px", fontSize:12, fontWeight:700 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(null);
  const [watchlog,   setWatchlog]   = useState([]);
  const [tab,        setTab]        = useState("journal");
  const [showLog,    setShowLog]    = useState(false);
  const [logPrefill, setLogPrefill] = useState(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [authReady,  setAuthReady]  = useState(false);

  // Listen for auth state changes
  useEffect(()=>{
    supabase.auth.getSession().then(({ data:{ session }})=>{
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    const { data:{ subscription }} = supabase.auth.onAuthStateChange((_event, session)=>{
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  },[]);

  // Load watchlog when user is set
  useEffect(()=>{
    if (user) fetchWatchlog();
    else setWatchlog([]);
  },[user]);

  async function fetchWatchlog() {
    setLoadingLog(true);
    const { data, error } = await supabase
      .from("watchlog")
      .select("*")
      .order("watch_date", { ascending:false });
    if (!error) setWatchlog(data||[]);
    setLoadingLog(false);
  }

  async function handleSaveMovie(entry) {
    const { data, error } = await supabase
      .from("watchlog")
      .insert([{ ...entry, user_id: user.id }])
      .select()
      .single();
    if (!error) {
      setWatchlog(prev=>[data, ...prev]);
      setShowLog(false);
      setLogPrefill(null);
      setTab("journal");
    } else {
      alert("Error saving: " + error.message);
    }
  }

  async function handleDelete(id) {
    await supabase.from("watchlog").delete().eq("id", id);
    setWatchlog(prev=>prev.filter(m=>m.id!==id));
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

  if (!authReady) return <Spinner />;
  if (!user) return <AuthScreen onLogin={setUser} />;

  const TABS = [
    { id:"journal",     label:"Journal"  },
    { id:"search",      label:"Search"   },
    { id:"suggestions", label:"For You"  },
    { id:"report",      label:"Report"   },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0D0D14", color:"#F5E6C8", fontFamily:"'Georgia',serif" }}>
      <header style={{ borderBottom:"1px solid #2A2A3A", padding:"0 24px", position:"sticky", top:0, background:"#0D0D14", zIndex:100 }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", alignItems:"center", gap:12, height:56 }}>
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
          <button onClick={()=>setShowLog(true)} style={{ padding:"7px 14px", background:"#1E1E2F", border:"1px solid #3A3A5A", borderRadius:8, color:"#E8A838", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>
            + Log Movie
          </button>
          <button onClick={handleLogout} style={{ background:"none", border:"none", color:"#555577", cursor:"pointer", fontSize:12, fontFamily:"inherit" }} title="Sign out">
            {user.email?.split("@")[0]} ↩
          </button>
        </div>
      </header>

      <main style={{ maxWidth:800, margin:"0 auto", padding:"2rem 24px" }}>
        {tab==="journal"     && <JournalTab     watchlog={watchlog} onDelete={handleDelete} loading={loadingLog} />}
        {tab==="search"      && <SearchTab      onSelectMovie={handleSelectMovie} />}
        {tab==="suggestions" && <SuggestionsTab watchlog={watchlog} onSelectMovie={handleSelectMovie} />}
        {tab==="report"      && <ReportTab      watchlog={watchlog} userEmail={user.email} />}
      </main>

      {showLog && (
        <LogMovieModal
          prefill={logPrefill}
          onSave={handleSaveMovie}
          onClose={()=>{ setShowLog(false); setLogPrefill(null); }}
        />
      )}
    </div>
  );
}