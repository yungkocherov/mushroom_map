// Direction 1 — V2. Polish pass on Organic.
// New: logo system, animations (pulses, counter, mycelium draw, breathing),
// transitions (auto-flow reel), refined hierarchy.

const D1V = {
  bg: '#f4ede0',
  paper: '#ede4d2',
  ink: '#2a2620',
  inkSoft: '#5b5346',
  inkMute: '#8a8270',
  moss: '#5d6a3a',
  mossDeep: '#3e4827',
  bark: '#7a5a3a',
  terra: '#b86a3a',
  cream: '#faf5e8',
  serif: '"Fraunces", Georgia, serif',
  sans: '"Inter", system-ui, sans-serif',
  mono: '"IBM Plex Mono", monospace',
  hand: '"Caveat", cursive',
};

// ---- one-time CSS injection for keyframes ----
if (typeof document !== 'undefined' && !document.getElementById('d1v2-anim')) {
  const s = document.createElement('style');
  s.id = 'd1v2-anim';
  s.textContent = `
    @keyframes d1v-pulse { 0%{transform:scale(.9);opacity:.55} 80%{opacity:0} 100%{transform:scale(2.6);opacity:0} }
    @keyframes d1v-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.045)} }
    @keyframes d1v-fadeup { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes d1v-fadein { from{opacity:0} to{opacity:1} }
    @keyframes d1v-grow-x { from{transform:scaleX(0)} to{transform:scaleX(1)} }
    @keyframes d1v-myco { to{stroke-dashoffset:0} }
    @keyframes d1v-spore { 0%{transform:translate(0,0) scale(1);opacity:0} 15%{opacity:1} 100%{transform:translate(36px,-54px) scale(.6);opacity:0} }
    @keyframes d1v-drift { 0%,100%{transform:translate(0,0)} 50%{transform:translate(6px,-4px)} }
    @keyframes d1v-tick { 0%{stroke-dashoffset:120} 100%{stroke-dashoffset:0} }
    @keyframes d1v-pageA { 0%,28%{opacity:1} 33%,100%{opacity:0} }
    @keyframes d1v-pageB { 0%,28%{opacity:0} 33%,61%{opacity:1} 66%,100%{opacity:0} }
    @keyframes d1v-pageC { 0%,61%{opacity:0} 66%,95%{opacity:1} 100%{opacity:0} }
    @keyframes d1v-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    .d1v-card { transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s; }
    .d1v-card:hover { transform: translateY(-2px); box-shadow: 0 14px 40px rgba(60,50,30,.18), 0 0 0 1px rgba(0,0,0,.06) !important; }
    .d1v-btn { transition: transform .2s, box-shadow .25s, background .2s; }
    .d1v-btn:hover { transform: translateY(-1px); }
    .d1v-link { position:relative; }
    .d1v-link::after { content:''; position:absolute; left:0; right:100%; bottom:-3px; height:1px; background:currentColor; transition:right .25s ease; }
    .d1v-link:hover::after { right:0; }
  `;
  document.head.appendChild(s);
}

// ---------- LOGO CONCEPTS ----------

// A: Cap + Topographic contours (dual-read mushroom / terrain)
const LogoCapTopo = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 38px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      <g fill="none" stroke={color} strokeLinecap="round">
        <path d="M6 40 Q 32 12, 58 40" strokeWidth="2.2"/>
        <path d="M12 40 Q 32 18, 52 40" strokeWidth="1.7" opacity=".7"/>
        <path d="M18 40 Q 32 24, 46 40" strokeWidth="1.5" opacity=".48"/>
        <path d="M24 40 Q 32 30, 40 40" strokeWidth="1.3" opacity=".28"/>
      </g>
      <line x1="6" y1="40" x2="58" y2="40" stroke={color} strokeWidth="1.5" opacity=".55"/>
      <circle cx="46" cy="24" r="2.4" fill={accent}/>
    </g>
  </svg>
);

// B: Filled monogram G with cap notch
const LogoMonoG = ({ size=56, color=D1V.mossDeep, accent=D1V.terra }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <circle cx="32" cy="32" r="28" fill={color}/>
    <path d="M42 24 a12 12 0 1 0 0 16 h-9 v-5 h5 a7 7 0 1 1 -1 -8.5"
          fill="none" stroke={D1V.cream} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="48" cy="20" r="3" fill={accent}/>
  </svg>
);

// C: Spore-shape silhouette with drifting particles (most "alive")
const LogoSpore = ({ size=56, color=D1V.mossDeep, accent=D1V.terra }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <path d="M10 32 Q 32 8, 54 32 Q 50 36, 32 36 Q 14 36, 10 32 Z" fill={color}/>
    <rect x="27" y="35" width="10" height="20" rx="4" fill={color} opacity=".9"/>
    <ellipse cx="32" cy="36" rx="22" ry="2" fill={D1V.ink} opacity=".18"/>
    <circle cx="22" cy="22" r="1.4" fill={accent} style={{animation:'d1v-spore 3.2s ease-out infinite'}}/>
    <circle cx="38" cy="16" r="1.6" fill={accent} style={{animation:'d1v-spore 3.6s ease-out .8s infinite'}}/>
    <circle cx="48" cy="26" r="1.1" fill={accent} style={{animation:'d1v-spore 4s ease-out 1.6s infinite'}}/>
  </svg>
);

// Wordmark with optional mark
const Wordmark = ({ Mark, size = 'md', color=D1V.ink, sub='лес ленобласти', showSub=true }) => {
  const sizes = { sm: { mark:24, ttl:16, sub:10 }, md: { mark:36, ttl:22, sub:11 }, lg: { mark:56, ttl:34, sub:13 } };
  const c = sizes[size];
  const Logo = Mark || (typeof window !== 'undefined' && window.LogoHybrid1) || LogoCapTopo;
  return (
    <div style={{display:'flex', alignItems:'center', gap: c.mark/3}}>
      <Logo size={c.mark}/>
      <div>
        <div style={{fontFamily:D1V.serif, fontSize:c.ttl, fontWeight:600, letterSpacing:'-0.02em', color, lineHeight:1}}>Geobiom</div>
        {showSub && <div style={{fontFamily:D1V.mono, fontSize:c.sub, color:D1V.inkSoft, marginTop:4, letterSpacing:'.08em', textTransform:'uppercase'}}>{sub}</div>}
      </div>
    </div>
  );
};

// ---------- LOGO LAB ARTBOARD ----------
const D1VLogoLab = () => {
  const [picked, setPicked] = React.useState(0);
  const concepts = [
    { name: 'A · Cap & Contour',  note: 'Шляпка читается как топо-контур. Спокойный, картографический.', Mark: LogoCapTopo },
    { name: 'B · Monogram G',     note: 'Плотный круглый знак. Хорошо в favicon и аватарах.',                Mark: LogoMonoG },
    { name: 'C · Spore',          note: 'Силуэт + дрейфующие споры. Самый «живой», но самый шумный.',          Mark: LogoSpore },
  ];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, padding:'40px 48px', boxSizing:'border-box', overflow:'auto', fontFamily:D1V.sans, color:D1V.ink}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
        <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase'}}>logo lab · 3 направления</div>
        <div style={{fontFamily:D1V.hand, fontSize:18, color:D1V.terra}}>выбери одно ↘</div>
      </div>
      <h2 style={{fontFamily:D1V.serif, fontSize:36, fontWeight:500, margin:'4px 0 28px', letterSpacing:'-0.02em'}}>
        Знак <em style={{color:D1V.terra}}>Geobiom</em>
      </h2>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18, marginBottom:32}}>
        {concepts.map((c, i) => {
          const sel = picked === i;
          return (
            <div key={c.name} className="d1v-card" onClick={() => setPicked(i)}
                 style={{padding:24, background:D1V.cream, borderRadius:16, cursor:'pointer',
                         boxShadow: sel ? `0 0 0 2px ${D1V.mossDeep}, 0 10px 32px rgba(60,50,30,.14)` : '0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18}}>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>{c.name}</div>
                {sel && <div style={{fontFamily:D1V.mono, fontSize:10, padding:'2px 8px', background:D1V.mossDeep, color:D1V.cream, borderRadius:999, letterSpacing:'.12em'}}>выбран</div>}
              </div>
              {/* Hero mark */}
              <div style={{display:'flex', justifyContent:'center', padding:'30px 0', background:D1V.bg, borderRadius:12, marginBottom:14}}>
                <c.Mark size={96}/>
              </div>
              {/* Wordmark */}
              <div style={{padding:'14px 0', borderTop:`1px solid rgba(0,0,0,.08)`, borderBottom:`1px solid rgba(0,0,0,.08)`, marginBottom:14}}>
                <Wordmark Mark={c.Mark} size="md"/>
              </div>
              {/* On-dark and tiny variants */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14}}>
                <div style={{padding:14, background:D1V.mossDeep, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <c.Mark size={32} color={D1V.cream} accent={D1V.terra}/>
                </div>
                <div style={{padding:14, background:'#fff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}>
                  <Wordmark Mark={c.Mark} size="sm" showSub={false}/>
                </div>
              </div>
              <div style={{fontSize:13, color:D1V.inkSoft, lineHeight:1.5, fontStyle:'italic'}}>{c.note}</div>
            </div>
          );
        })}
      </div>

      {/* Construction grid for picked one */}
      <div style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
        <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:16}}>построение · {concepts[picked].name}</div>
        <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:32, alignItems:'center'}}>
          <div style={{position:'relative', width:200, height:200}}>
            {/* grid */}
            <svg width="200" height="200" style={{position:'absolute', inset:0}}>
              {Array.from({length:9}).map((_,i)=>(
                <g key={i}>
                  <line x1={i*25} y1={0} x2={i*25} y2={200} stroke="rgba(0,0,0,.06)" strokeWidth=".5"/>
                  <line y1={i*25} x1={0} y2={i*25} x2={200} stroke="rgba(0,0,0,.06)" strokeWidth=".5"/>
                </g>
              ))}
              <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(184,106,58,.25)" strokeWidth="1" strokeDasharray="3 3"/>
            </svg>
            <div style={{position:'absolute', inset:18}}>
              {React.createElement(concepts[picked].Mark, { size: 164 })}
            </div>
          </div>
          <div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, fontSize:13}}>
              <div>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>palette</div>
                <div style={{display:'flex', gap:6}}>
                  {[D1V.mossDeep, D1V.moss, D1V.terra, D1V.bark, D1V.cream].map(c=>(
                    <div key={c} style={{width:28, height:28, borderRadius:6, background:c, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.08)'}}/>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>typography</div>
                <div style={{fontFamily:D1V.serif, fontSize:22, fontWeight:600, letterSpacing:'-0.02em'}}>Geobiom</div>
                <div style={{fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, marginTop:2}}>Fraunces 600 · IBM Plex Mono</div>
              </div>
              <div>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>min size</div>
                <div style={{display:'flex', gap:14, alignItems:'center'}}>
                  {React.createElement(concepts[picked].Mark, { size: 16 })}
                  {React.createElement(concepts[picked].Mark, { size: 24 })}
                  {React.createElement(concepts[picked].Mark, { size: 32 })}
                </div>
              </div>
              <div>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>safe area</div>
                <div style={{fontSize:13, color:D1V.inkSoft, lineHeight:1.5}}>отступ ≥ 1/4 высоты знака. На цвете — только на mossDeep или cream.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- ANIMATED INDEX METER ----------
const IndexMeter = ({ value=0.78, total=14, dark=false, big=false }) => {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let id; const start = performance.now(); const dur = 1100;
    const tick = (t) => {
      const k = Math.min(1, (t-start)/dur);
      const eased = 1 - Math.pow(1-k, 3);
      setN(eased);
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  const filled = Math.floor(value * total);
  const display = (value * n).toFixed(2);
  return (
    <div>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:10}}>
        <div style={{fontFamily:D1V.serif, fontSize: big? 64 : 48, fontWeight:500, letterSpacing:'-0.02em', lineHeight:1, color: dark? D1V.cream : D1V.mossDeep, fontVariantNumeric:'tabular-nums'}}>{display}</div>
        <div style={{fontSize:13, color: dark? 'rgba(250,245,232,.7)' : D1V.inkSoft}}>индекс плодоношения</div>
      </div>
      <div style={{display:'flex', gap:2, height: big? 28: 22}}>
        {Array.from({length:total}).map((_,i) => {
          const on = i < filled;
          return (
            <div key={i} style={{flex:1, height:'100%', borderRadius:1, background: on ? D1V.moss : (dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.08)'),
                                 opacity: on ? (0.45 + (i/total)*0.55 * n) : 1,
                                 transform: on ? `scaleY(${0.5 + 0.5*n})` : 'scaleY(1)',
                                 transformOrigin:'bottom',
                                 transition: `transform .6s ${i*0.04}s cubic-bezier(.2,.7,.2,1)`}}/>
          );
        })}
      </div>
    </div>
  );
};

// Pulsing pin
const PulsePin = ({ color=D1V.terra, size=12, delay=0, label }) => (
  <div style={{position:'relative'}}>
    <div style={{position:'absolute', left:'50%', top:'50%', width:size, height:size, marginLeft:-size/2, marginTop:-size/2, borderRadius:'50%', border:`2px solid ${color}`, animation:`d1v-pulse 2.4s ${delay}s ease-out infinite`}}/>
    <div style={{position:'absolute', left:'50%', top:'50%', width:size, height:size, marginLeft:-size/2, marginTop:-size/2, borderRadius:'50%', border:`2px solid ${color}`, animation:`d1v-pulse 2.4s ${delay+0.6}s ease-out infinite`, opacity:.6}}/>
    <div style={{position:'relative', width:size, height:size, borderRadius:'50%', background:color, boxShadow:`0 0 0 3px ${color}33, 0 2px 6px rgba(0,0,0,.25)`}}/>
    {label && <div style={{position:'absolute', top:size+6, left:'50%', transform:'translateX(-50%)', fontFamily:D1V.hand, fontSize:16, color:D1V.ink, whiteSpace:'nowrap'}}>{label}</div>}
  </div>
);

// ---------- LANDING V2 ----------
const D1VLanding = () => (
  <div style={{width:'100%', height:'100%', background:D1V.bg, color:D1V.ink, fontFamily:D1V.sans, position:'relative', overflow:'hidden'}}>
    {/* paper grain */}
    <div style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at top right, rgba(184,106,58,.09), transparent 55%), radial-gradient(ellipse at bottom left, rgba(93,106,58,.12), transparent 60%)'}}/>
    {/* contour wash */}
    <svg width="100%" height="100%" viewBox="0 0 1280 800" preserveAspectRatio="none" style={{position:'absolute', inset:0, opacity:.18, pointerEvents:'none'}}>
      <g fill="none" stroke={D1V.bark} strokeWidth=".7">
        {Array.from({length:14}).map((_,i)=>(
          <path key={i} d={`M-50 ${120+i*48} Q 320 ${100+i*46}, 640 ${130+i*48} T 1330 ${110+i*46}`}/>
        ))}
      </g>
    </svg>

    {/* nav */}
    <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'26px 48px', animation:'d1v-fadein .8s ease both'}}>
      <Wordmark size="md"/>
      <div style={{display:'flex', alignItems:'center', gap:32, fontSize:14, color:D1V.inkSoft}}>
        <span className="d1v-link" style={{cursor:'pointer'}}>Карта</span>
        <span className="d1v-link" style={{cursor:'pointer'}}>Виды</span>
        <span className="d1v-link" style={{cursor:'pointer'}}>Споты</span>
        <span className="d1v-link" style={{cursor:'pointer'}}>Методология</span>
        <button className="d1v-btn" style={{padding:'10px 20px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:999, fontSize:13, fontWeight:500, fontFamily:D1V.sans, cursor:'pointer', boxShadow:'0 4px 14px rgba(62,72,39,.25)'}}>Войти</button>
      </div>
    </div>

    {/* hero */}
    <div style={{position:'relative', display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:56, padding:'24px 48px 0', alignItems:'center'}}>
      <div style={{animation:'d1v-fadeup .9s .1s ease both'}}>
        <div style={{display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px', background:'rgba(93,106,58,.14)', borderRadius:999, fontSize:12, color:D1V.mossDeep, fontFamily:D1V.mono, marginBottom:28, letterSpacing:'.04em'}}>
          <span style={{position:'relative', display:'inline-flex'}}>
            <span style={{position:'absolute', inset:-2, borderRadius:'50%', border:`1.5px solid ${D1V.moss}`, animation:'d1v-pulse 2.2s ease-out infinite'}}/>
            <span style={{width:6, height:6, borderRadius:'50%', background:D1V.moss}}/>
          </span>
          сезон 2026 · открытые данные · обновлено 7 мин назад
        </div>
        <h1 style={{fontFamily:D1V.serif, fontSize:88, lineHeight:0.98, fontWeight:500, margin:0, letterSpacing:'-0.03em'}}>
          Лес,<br/>как{' '}
          <span style={{position:'relative', display:'inline-block'}}>
            <em style={{color:D1V.terra, fontStyle:'italic'}}>атлас</em>
            <svg width="220" height="14" viewBox="0 0 220 14" style={{position:'absolute', left:0, bottom:-4, width:'100%'}}>
              <path d="M2 8 Q 40 2, 80 7 T 160 7 T 218 6" fill="none" stroke={D1V.terra} strokeWidth="2" strokeLinecap="round"
                    strokeDasharray="240" strokeDashoffset="240"
                    style={{animation:'d1v-myco 1.4s 1s cubic-bezier(.2,.7,.2,1) forwards'}}/>
            </svg>
          </span>.
        </h1>
        <p style={{fontSize:18, lineHeight:1.55, color:D1V.inkSoft, marginTop:28, maxWidth:500}}>
          Грибная погода Ленобласти: индекс плодоношения по 18 районам, типы леса и микориза для каждого выдела, личные споты в кабинете.
        </p>
        <div style={{display:'flex', gap:12, marginTop:36}}>
          <button className="d1v-btn" style={{padding:'15px 24px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:12, fontSize:15, fontWeight:500, display:'inline-flex', alignItems:'center', gap:10, cursor:'pointer', boxShadow:'0 8px 22px rgba(62,72,39,.28)'}}>
            <IconPin size={16} stroke={D1V.cream}/> Открыть карту
          </button>
          <button className="d1v-btn" style={{padding:'15px 24px', background:'transparent', color:D1V.ink, border:`1.5px solid ${D1V.ink}`, borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer'}}>
            Как это работает
          </button>
        </div>
        <div style={{display:'flex', gap:36, marginTop:44, paddingTop:26, borderTop:`1px solid rgba(0,0,0,.1)`, fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, letterSpacing:'.04em'}}>
          {[['18','районов ЛО'],['25','видов'],['72k','выделов леса'],['11','лет наблюдений']].map(([n,l])=>(
            <div key={l}><div style={{fontFamily:D1V.serif, fontSize:26, color:D1V.ink, fontWeight:500}}>{n}</div>{l}</div>
          ))}
        </div>
      </div>

      {/* hero map cameo */}
      <div style={{position:'relative', borderRadius:20, overflow:'hidden', boxShadow:'0 28px 70px rgba(60,50,30,.22), 0 0 0 1px rgba(0,0,0,.06)', aspectRatio:'4/5', animation:'d1v-fadeup 1s .25s ease both'}}>
        <div style={{position:'absolute', inset:0, animation:'d1v-drift 14s ease-in-out infinite'}}>
          <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" road="rgba(0,0,0,.18)" roadMain="rgba(184,106,58,.55)" labelColor="rgba(40,40,30,.55)" forestTexture/>
        </div>
        {/* pins */}
        <div style={{position:'absolute', top:'30%', left:'48%'}}><PulsePin color={D1V.terra} size={14}/></div>
        <div style={{position:'absolute', top:'52%', left:'62%'}}><PulsePin color={D1V.moss} size={11} delay={.6}/></div>
        <div style={{position:'absolute', top:'66%', left:'42%'}}><PulsePin color={D1V.bark} size={10} delay={1.2}/></div>
        <div style={{position:'absolute', top:'40%', left:'30%', fontFamily:D1V.hand, fontSize:24, color:D1V.ink, transform:'rotate(-4deg)', animation:'d1v-fadeup .8s 1.2s ease both'}}>
          мой спот ↗
        </div>
        {/* mini index card */}
        <div style={{position:'absolute', bottom:18, left:18, right:18, padding:'14px 16px', background:'rgba(250,245,232,.94)', borderRadius:12, backdropFilter:'blur(6px)', boxShadow:'0 6px 18px rgba(60,50,30,.12)'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>Всеволожский · завтра</div>
            <div style={{fontFamily:D1V.hand, fontSize:14, color:D1V.terra}}>~ свежо</div>
          </div>
          <IndexMeter value={0.78}/>
        </div>
      </div>
    </div>
  </div>
);

// ---------- MAP V2 (animated) ----------
const D1VMap = () => {
  const [layer, setLayer] = React.useState('Породы');
  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, position:'relative', fontFamily:D1V.sans, color:D1V.ink, overflow:'hidden'}}>
      <div style={{position:'absolute', inset:0, animation:'d1v-drift 22s ease-in-out infinite'}}>
        <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" road="rgba(0,0,0,.16)" roadMain="rgba(184,106,58,.45)" labelColor="rgba(40,40,30,.55)" forestTexture/>
      </div>

      {/* cursor glow (decorative) */}
      <div style={{position:'absolute', top:'40%', left:'50%', width:280, height:280, marginLeft:-140, marginTop:-140, background:'radial-gradient(circle, rgba(255,235,180,.35), transparent 60%)', pointerEvents:'none', animation:'d1v-drift 8s ease-in-out infinite'}}/>

      {/* top bar */}
      <div style={{position:'absolute', top:18, left:18, right:18, display:'flex', gap:12, alignItems:'center', zIndex:10, animation:'d1v-fadeup .6s ease both'}}>
        <div className="d1v-card" style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:D1V.cream, borderRadius:14, boxShadow:'0 6px 22px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <Wordmark size="sm" showSub={false}/>
        </div>
        <div className="d1v-card" style={{flex:1, display:'flex', alignItems:'center', gap:10, padding:'13px 16px', background:D1V.cream, borderRadius:14, boxShadow:'0 6px 22px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <IconSearch size={16} stroke={D1V.inkSoft}/>
          <span style={{fontSize:14, color:D1V.inkSoft}}>Найти гриб, район или место…</span>
          <span style={{marginLeft:'auto', fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, padding:'2px 6px', border:`1px solid rgba(0,0,0,.12)`, borderRadius:4}}>⌘ K</span>
        </div>
        <div className="d1v-card" style={{display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:D1V.cream, borderRadius:14, boxShadow:'0 6px 22px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <div style={{width:26, height:26, borderRadius:'50%', background:D1V.moss, color:D1V.cream, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600}}>I</div>
          <span style={{fontSize:13}}>ivan.dewkalion</span>
        </div>
      </div>

      {/* left panel */}
      <div className="d1v-card" style={{position:'absolute', top:84, left:18, width:256, padding:18, background:D1V.cream, borderRadius:14, boxShadow:'0 6px 22px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)', zIndex:10, animation:'d1v-fadeup .6s .1s ease both'}}>
        <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.12em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>подложка</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:18}}>
          {['Схема','Спутник','Гибрид','OSM'].map((b,i)=>(
            <button key={b} className="d1v-btn" style={{padding:'8px 10px', fontSize:12, background: i===0 ? D1V.mossDeep : 'transparent', color: i===0 ? D1V.cream : D1V.ink, border:`1px solid ${i===0 ? D1V.mossDeep : 'rgba(0,0,0,.12)'}`, borderRadius:8, fontFamily:D1V.sans, cursor:'pointer'}}>{b}</button>
          ))}
        </div>

        <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.12em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>лес</div>
        <div style={{display:'flex', flexDirection:'column', gap:2, marginBottom:18, position:'relative'}}>
          {['Породы','Бонитет','Возраст','Прогноз','Водотоки','Болота','Сохранённые'].map((b)=>{
            const sel = layer === b;
            return (
              <button key={b} onClick={()=>setLayer(b)}
                      style={{padding:'10px 12px', fontSize:13, textAlign:'left', background: sel ? 'rgba(93,106,58,.12)' : 'transparent', color: sel ? D1V.mossDeep : D1V.ink, border:0, borderRadius:8, fontFamily:D1V.sans, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'background .25s, color .25s'}}>
                <span style={{fontWeight: sel ? 600 : 400}}>{b}</span>
                {sel && <span style={{width:6, height:6, borderRadius:'50%', background:D1V.moss, animation:'d1v-fadein .3s'}}/>}
              </button>
            );
          })}
        </div>

        <div style={{paddingTop:14, borderTop:'1px solid rgba(0,0,0,.08)'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.12em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>легенда · {layer}</div>
          <div key={layer} style={{display:'flex', flexDirection:'column', gap:6, animation:'d1v-fadeup .35s ease both'}}>
            {(layer==='Породы' ? [['Сосна','#9bb070'],['Ель','#5e7042'],['Берёза','#cdb86a'],['Осина','#b8895a'],['Смешанный','#84a079'],['Болото','#7a8a98']]
              : layer==='Бонитет' ? [['Iа · отлично','#3e4827'],['I','#5d6a3a'],['II','#84a079'],['III','#a8a070'],['IV · слабо','#bd9a6a']]
              : layer==='Возраст' ? [['<20 · молодняк','#cdb86a'],['20-40','#a4b27a'],['40-80','#7d8e5a'],['80-120','#5d6a3a'],['>120 · спелый','#3e4827']]
              : layer==='Прогноз' ? [['слой ожидается','#5d6a3a'],['возможен','#a4b27a'],['маловероятен','#cdb86a'],['нет','rgba(0,0,0,.1)']]
              : layer==='Водотоки' ? [['река','#7a9bb0'],['ручей','#a9c4d2'],['канал','#5a7a90']]
              : layer==='Болота' ? [['верховое','#7a8a98'],['низинное','#9aa8a6']]
              : [['мой спот, ★5','#b86a3a'],['★4','#5d6a3a'],['★3','#7a5a3a']]
            ).map(([n,c])=>(
              <div key={n} style={{display:'flex', alignItems:'center', gap:10, fontSize:12}}>
                <span style={{width:14, height:14, borderRadius:3, background:c, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.1)'}}/>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* right index card */}
      <div className="d1v-card" style={{position:'absolute', top:84, right:18, width:284, padding:20, background:D1V.cream, borderRadius:14, boxShadow:'0 6px 22px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)', zIndex:10, animation:'d1v-fadeup .6s .15s ease both'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.12em', color:D1V.inkSoft, textTransform:'uppercase'}}>индекс на завтра</div>
          <div style={{fontFamily:D1V.hand, fontSize:14, color:D1V.terra}}>~ свежо</div>
        </div>
        <div style={{fontSize:13, color:D1V.inkSoft, marginBottom:8}}>Всеволожский</div>
        <IndexMeter value={0.78} big/>
        <div style={{fontSize:12, color:D1V.inkSoft, lineHeight:1.55, marginTop:14}}>
          После дождей 4–5 авг ожидается заметный слой <strong style={{color:D1V.mossDeep}}>белых</strong> и <strong style={{color:D1V.mossDeep}}>подберёзовиков</strong> в северо-западной части района.
        </div>
        <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid rgba(0,0,0,.08)', display:'flex', justifyContent:'space-between', fontSize:11, color:D1V.inkSoft, fontFamily:D1V.mono}}>
          <span>осадки 14мм</span><span>почва 16°C</span><span>72ч</span>
        </div>
      </div>

      {/* tiny demo pins on map */}
      <div style={{position:'absolute', top:'40%', left:'48%', zIndex:5}}><PulsePin color={D1V.terra} size={12}/></div>
      <div style={{position:'absolute', top:'55%', left:'58%', zIndex:5}}><PulsePin color={D1V.moss} size={10} delay={.5}/></div>
      <div style={{position:'absolute', top:'48%', left:'40%', zIndex:5}}><PulsePin color={D1V.bark} size={9} delay={1.1}/></div>

      {/* controls */}
      <div style={{position:'absolute', right:18, bottom:18, display:'flex', flexDirection:'column', gap:6, zIndex:10}}>
        {[<IconPlus size={14}/>, <span style={{fontSize:14}}>−</span>, <IconCompass size={14}/>].map((c,i)=>(
          <button key={i} className="d1v-btn" style={{width:38, height:38, background:D1V.cream, border:0, borderRadius:10, boxShadow:'0 4px 14px rgba(60,50,30,.12), 0 0 0 1px rgba(0,0,0,.05)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>{c}</button>
        ))}
      </div>

      {/* scale */}
      <div style={{position:'absolute', left:18, bottom:18, padding:'8px 12px', background:'rgba(250,245,232,.85)', borderRadius:8, fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, display:'flex', alignItems:'center', gap:10, zIndex:10, backdropFilter:'blur(4px)'}}>
        <div style={{width:60, height:3, borderTop:`2px solid ${D1V.ink}`, borderLeft:`1px solid ${D1V.ink}`, borderRight:`1px solid ${D1V.ink}`, paddingTop:2}}/>
        <span>10 км</span>
      </div>
    </div>
  );
};

// ---------- FLOW REEL: auto-cycles 3 screens ----------
const D1VReel = () => {
  return (
    <div style={{width:'100%', height:'100%', position:'relative', overflow:'hidden', background:D1V.bg}}>
      <div style={{position:'absolute', inset:0, animation:'d1v-pageA 12s ease-in-out infinite'}}>
        <D1VLanding/>
      </div>
      <div style={{position:'absolute', inset:0, animation:'d1v-pageB 12s ease-in-out infinite'}}>
        <D1VMap/>
      </div>
      <div style={{position:'absolute', inset:0, animation:'d1v-pageC 12s ease-in-out infinite'}}>
        <D1Popup/>
      </div>
      {/* progress dots */}
      <div style={{position:'absolute', bottom:18, left:'50%', transform:'translateX(-50%)', display:'flex', gap:8, padding:'8px 14px', background:'rgba(250,245,232,.92)', borderRadius:999, backdropFilter:'blur(6px)', boxShadow:'0 6px 18px rgba(60,50,30,.16)', zIndex:50}}>
        {['Лендинг','Карта','Спот'].map((l,i)=>(
          <div key={l} style={{display:'flex', alignItems:'center', gap:6, fontFamily:D1V.mono, fontSize:10, letterSpacing:'.1em', color:D1V.inkSoft}}>
            <span style={{width:6, height:6, borderRadius:'50%', background: D1V.moss, opacity:.4}}/>{l.toUpperCase()}{i<2 && <span style={{margin:'0 4px', color:'rgba(0,0,0,.2)'}}>/</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- MOBILE V2 ----------
const D1VMobile = () => (
  <div style={{width:'100%', height:'100%', background:D1V.bg, position:'relative', fontFamily:D1V.sans, color:D1V.ink, overflow:'hidden'}}>
    <div style={{display:'flex', justifyContent:'space-between', padding:'12px 22px 6px', fontSize:13, fontWeight:600}}>
      <span>9:41</span><span>•••</span>
    </div>
    <div style={{position:'absolute', inset:'40px 0 200px 0'}}>
      <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" labelColor="rgba(40,40,30,.55)" showLabels={false} forestTexture/>
    </div>
    <div style={{position:'absolute', top:46, left:14, right:14, display:'flex', gap:10, alignItems:'center', zIndex:5, animation:'d1v-fadeup .6s ease both'}}>
      <div className="d1v-card" style={{display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:D1V.cream, borderRadius:12, boxShadow:'0 6px 18px rgba(60,50,30,.14)'}}>
        {React.createElement(window.LogoHybrid1 || LogoCapTopo, { size: 22 })}
      </div>
      <div className="d1v-card" style={{flex:1, padding:'12px 14px', background:D1V.cream, borderRadius:12, boxShadow:'0 6px 18px rgba(60,50,30,.14)', display:'flex', alignItems:'center', gap:8}}>
        <IconSearch size={14} stroke={D1V.inkSoft}/>
        <span style={{fontSize:13, color:D1V.inkSoft}}>Найти место…</span>
      </div>
    </div>
    <div style={{position:'absolute', top:104, left:14, right:14, display:'flex', gap:6, overflowX:'auto', zIndex:5}}>
      {['Породы','Прогноз','Бонитет','Возраст','Болота','Споты'].map((l,i)=>(
        <button key={l} className="d1v-btn" style={{flex:'0 0 auto', padding:'8px 14px', fontSize:12, background: i===0 ? D1V.mossDeep : D1V.cream, color: i===0 ? D1V.cream : D1V.ink, border:0, borderRadius:999, fontFamily:D1V.sans, boxShadow:'0 2px 8px rgba(60,50,30,.1)'}}>{l}</button>
      ))}
    </div>
    <div style={{position:'absolute', top:'46%', left:'46%'}}><PulsePin color={D1V.terra} size={12}/></div>
    <div style={{position:'absolute', top:'56%', left:'58%'}}><PulsePin color={D1V.moss} size={10} delay={.5}/></div>

    {/* bottom sheet */}
    <div style={{position:'absolute', left:0, right:0, bottom:0, background:D1V.cream, borderRadius:'24px 24px 0 0', padding:'10px 20px 22px', boxShadow:'0 -10px 32px rgba(60,50,30,.14)', zIndex:10, animation:'d1v-fadeup .6s .15s ease both'}}>
      <div style={{width:38, height:4, background:'rgba(0,0,0,.18)', borderRadius:2, margin:'2px auto 14px'}}/>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6}}>
        <div style={{fontFamily:D1V.serif, fontSize:22, fontWeight:600}}>Всеволожский</div>
        <div style={{fontFamily:D1V.hand, fontSize:16, color:D1V.terra}}>~ свежо</div>
      </div>
      <div style={{fontSize:12, color:D1V.inkSoft, marginBottom:12}}>Индекс плодоношения · завтра</div>
      <IndexMeter value={0.78}/>
      <div style={{display:'flex', justifyContent:'space-around', borderTop:'1px solid rgba(0,0,0,.08)', paddingTop:14, marginTop:16}}>
        {[['Карта',D1V.mossDeep,<IconPin size={14} stroke={D1V.mossDeep}/>],['Виды',D1V.inkSoft,<IconMushroom size={14} stroke={D1V.inkSoft}/>],['Споты',D1V.inkSoft,<IconStar size={14} fill={D1V.inkSoft}/>],['Я',D1V.inkSoft,<IconUser size={14} stroke={D1V.inkSoft}/>]].map(([l,c,ic])=>(
          <div key={l} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
            <div style={{width:26, height:26, background: c===D1V.mossDeep ? 'rgba(93,106,58,.12)' : 'transparent', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>{ic}</div>
            <div style={{fontSize:10, color:c, fontWeight: c===D1V.mossDeep ? 600 : 400}}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

Object.assign(window, { D1VLogoLab, D1VLanding, D1VMap, D1VReel, D1VMobile, LogoCapTopo, LogoMonoG, LogoSpore, Wordmark });
