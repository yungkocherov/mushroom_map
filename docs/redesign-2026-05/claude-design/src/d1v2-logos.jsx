// More logo concepts — boletus / tree / forest / typographic / stamp
// Concept A (Cap & Contour) is reused from d1v2.jsx as the anchor (user's favorite).

// D · Boletus profile — characteristic thick stem + rounded cap, with a couple of contour lines through the cap echoing concept A.
const LogoBoletus = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 40px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {/* stem */}
      <path d="M24 36 C 24 50, 22 56, 26 58 L 38 58 C 42 56, 40 50, 40 36 Z" fill={color}/>
      {/* cap */}
      <path d="M10 34 C 10 18, 22 10, 32 10 C 42 10, 54 18, 54 34 C 54 38, 48 40, 32 40 C 16 40, 10 38, 10 34 Z" fill={accent}/>
      {/* cap contour echo — ties to concept A */}
      <path d="M14 30 Q 32 18, 50 30" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M18 24 Q 32 16, 46 24" fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="1" strokeLinecap="round"/>
      {/* tiny moss dot */}
      <circle cx="42" cy="24" r="1.6" fill={color} opacity=".55"/>
    </g>
  </svg>
);

// E · Single pine — minimalist conifer, contour ground line ties to A.
const LogoPine = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {/* contour ground (A's signature) */}
      <path d="M6 50 Q 32 44, 58 50" fill="none" stroke={color} strokeWidth="1.6" opacity=".55" strokeLinecap="round"/>
      <path d="M14 56 Q 32 52, 50 56" fill="none" stroke={color} strokeWidth="1.2" opacity=".3" strokeLinecap="round"/>
      {/* trunk */}
      <rect x="30" y="46" width="4" height="6" rx="1" fill={color}/>
      {/* tree triangles */}
      <path d="M32 8 L 18 28 L 26 28 L 14 44 L 50 44 L 38 28 L 46 28 Z" fill={color}/>
      {/* accent berry/pin near top */}
      <circle cx="44" cy="18" r="2.2" fill={accent}/>
    </g>
  </svg>
);

// F · Forest stand — three trees of varying heights, the "лес" reading.
const LogoForestStand = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {/* contour ground */}
      <path d="M4 52 Q 32 46, 60 52" fill="none" stroke={color} strokeWidth="1.6" opacity=".5" strokeLinecap="round"/>
      {/* left tree (medium) */}
      <rect x="11" y="44" width="3" height="6" fill={color}/>
      <path d="M12.5 18 L 4 38 L 8 38 L 2 50 L 23 50 L 17 38 L 21 38 Z" fill={color} opacity=".85"/>
      {/* center tree (tallest) */}
      <rect x="30" y="46" width="4" height="6" fill={color}/>
      <path d="M32 8 L 20 32 L 26 32 L 16 46 L 48 46 L 38 32 L 44 32 Z" fill={color}/>
      {/* right tree (shortest) */}
      <rect x="48" y="46" width="3" height="5" fill={color}/>
      <path d="M49.5 22 L 42 40 L 46 40 L 40 51 L 59 51 L 53 40 L 57 40 Z" fill={color} opacity=".7"/>
      {/* spore/sun accent */}
      <circle cx="50" cy="14" r="2.4" fill={accent}/>
    </g>
  </svg>
);

// G · Mycelium wordmark — purely typographic, branching root underline.
const LogoMycelium = ({ size=56, color=D1V.mossDeep, accent=D1V.terra }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    {/* G letterform */}
    <text x="32" y="40" textAnchor="middle" fontFamily='"Fraunces", Georgia, serif' fontSize="44" fontWeight="600" fill={color} style={{letterSpacing:'-0.04em'}}>g</text>
    {/* mycelium branches under */}
    <g fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".75">
      <path d="M14 50 Q 22 48, 28 50 T 40 50 T 52 50"/>
      <path d="M22 50 L 20 56"/>
      <path d="M32 50 L 32 58"/>
      <path d="M32 50 L 36 56"/>
      <path d="M44 50 L 46 56"/>
      <path d="M14 50 L 12 54"/>
    </g>
    <circle cx="40" cy="50" r="1.6" fill={accent}/>
  </svg>
);

// H · Stamp/seal — botanical garden style circular stamp.
const LogoStamp = ({ size=56, color=D1V.mossDeep, accent=D1V.terra }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="2"/>
    <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth=".8" strokeDasharray="2 2" opacity=".6"/>
    {/* mini cap-and-contour at center */}
    <g transform="translate(0,2)">
      <path d="M18 36 Q 32 22, 46 36" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M22 36 Q 32 26, 42 36" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity=".65"/>
      <line x1="18" y1="36" x2="46" y2="36" stroke={color} strokeWidth="1.4" opacity=".55"/>
      <circle cx="40" cy="26" r="2" fill={accent}/>
    </g>
    {/* circular text */}
    <defs>
      <path id="d1v-stamp-path" d="M32 32 m -19 0 a 19 19 0 1 1 38 0 a 19 19 0 1 1 -38 0"/>
    </defs>
    <text fontFamily='"IBM Plex Mono", monospace' fontSize="5.6" fill={color} letterSpacing="2.2">
      <textPath href="#d1v-stamp-path" startOffset="6%">GEOBIOM · ЛЕНОБЛАСТЬ · 2026 ·</textPath>
    </text>
  </svg>
);

// ---------- Expanded Logo Lab ----------
const D1VLogoLab2 = () => {
  const [picked, setPicked] = React.useState(0);
  const concepts = [
    { id:'A', name:'A · Cap & Contour',  hint:'(понравился)', note:'Шляпка читается как топо-контур. Спокойный, картографический.', Mark: LogoCapTopo, kind:'mark' },
    { id:'D', name:'D · Boletus',        hint:'',             note:'Силуэт боровика. Узнаваемо «гриб», не абстракция.',          Mark: LogoBoletus, kind:'mark' },
    { id:'E', name:'E · Pine',           hint:'',             note:'Одна сосна на контуре земли. Тот же язык, что A — лес.',     Mark: LogoPine, kind:'mark' },
    { id:'F', name:'F · Forest stand',   hint:'',             note:'Три дерева — целый лес. Хорошо в маленьких размерах.',         Mark: LogoForestStand, kind:'mark' },
    { id:'G', name:'G · Mycelium',       hint:'типографика',  note:'Без знака — только буква g и грибница под ней.',                Mark: LogoMycelium, kind:'type' },
    { id:'H', name:'H · Stamp seal',     hint:'',             note:'Стиль ботанического штампа. Перекликается с атласом.',           Mark: LogoStamp, kind:'mark' },
  ];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, padding:'40px 48px', boxSizing:'border-box', overflow:'auto', fontFamily:D1V.sans, color:D1V.ink}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
        <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase'}}>logo lab · v2 · больше направлений</div>
        <div style={{fontFamily:D1V.hand, fontSize:18, color:D1V.terra}}>гриб ↔ дерево ↔ лес</div>
      </div>
      <h2 style={{fontFamily:D1V.serif, fontSize:36, fontWeight:500, margin:'4px 0 8px', letterSpacing:'-0.02em'}}>
        Знак <em style={{color:D1V.terra}}>Geobiom</em>
      </h2>
      <p style={{fontSize:14, color:D1V.inkSoft, maxWidth:640, margin:'0 0 28px', lineHeight:1.55}}>
        Шесть направлений: один существующий (A — твой фаворит) и пять новых — боровик, сосна, маленький лес, типографический и штамп. Кликни карточку, чтобы зафиксировать выбор и увидеть применение.
      </p>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18, marginBottom:32}}>
        {concepts.map((c, i) => {
          const sel = picked === i;
          return (
            <div key={c.id} className="d1v-card" onClick={() => setPicked(i)}
                 style={{padding:22, background:D1V.cream, borderRadius:16, cursor:'pointer',
                         boxShadow: sel ? `0 0 0 2px ${D1V.mossDeep}, 0 10px 32px rgba(60,50,30,.14)` : '0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, gap:10}}>
                <div>
                  <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>{c.name}</div>
                  {c.hint && <div style={{fontFamily:D1V.hand, fontSize:14, color:D1V.terra, marginTop:2}}>{c.hint}</div>}
                </div>
                {sel && <div style={{fontFamily:D1V.mono, fontSize:10, padding:'2px 8px', background:D1V.mossDeep, color:D1V.cream, borderRadius:999, letterSpacing:'.12em', flexShrink:0}}>выбран</div>}
              </div>
              {/* hero mark */}
              <div style={{display:'flex', justifyContent:'center', padding:'24px 0', background:D1V.bg, borderRadius:12, marginBottom:12}}>
                <c.Mark size={88}/>
              </div>
              {/* wordmark */}
              <div style={{padding:'12px 0', borderTop:`1px solid rgba(0,0,0,.08)`, borderBottom:`1px solid rgba(0,0,0,.08)`, marginBottom:12}}>
                <Wordmark Mark={c.Mark} size="md"/>
              </div>
              {/* on dark / tiny */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12}}>
                <div style={{padding:12, background:D1V.mossDeep, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <c.Mark size={28} color={D1V.cream} accent={D1V.terra}/>
                </div>
                <div style={{padding:12, background:'#fff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}>
                  <Wordmark Mark={c.Mark} size="sm" showSub={false}/>
                </div>
              </div>
              <div style={{fontSize:13, color:D1V.inkSoft, lineHeight:1.5, fontStyle:'italic'}}>{c.note}</div>
            </div>
          );
        })}
      </div>

      {/* Application strip — picked logo across surfaces */}
      <div style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
        <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:16}}>применение · {concepts[picked].name}</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14}}>
          {/* favicon-like */}
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {React.createElement(concepts[picked].Mark, { size:16 })}
              {React.createElement(concepts[picked].Mark, { size:24 })}
              {React.createElement(concepts[picked].Mark, { size:32 })}
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>favicon · 16/24/32</div>
          </div>
          {/* avatar */}
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{width:64, height:64, borderRadius:'50%', background:D1V.mossDeep, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
              {React.createElement(concepts[picked].Mark, { size:44, color: D1V.cream, accent: D1V.terra, breathe:false })}
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>app icon · круглый</div>
          </div>
          {/* nav strip */}
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:18, padding:'8px 14px', background:'#fff', borderRadius:8, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}>
              <Wordmark Mark={concepts[picked].Mark} size="sm" showSub={false}/>
              <span style={{fontSize:11, color:D1V.inkSoft}}>Карта</span>
              <span style={{fontSize:11, color:D1V.inkSoft}}>Виды</span>
              <span style={{fontSize:11, color:D1V.inkSoft}}>Споты</span>
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>nav · десктоп</div>
          </div>
          {/* business card */}
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{width:'100%', aspectRatio:'1.7/1', background:D1V.mossDeep, borderRadius:6, padding:14, color:D1V.cream, display:'flex', flexDirection:'column', justifyContent:'space-between', boxSizing:'border-box'}}>
              {React.createElement(concepts[picked].Mark, { size:28, color:D1V.cream, accent:D1V.terra, breathe:false })}
              <div style={{fontFamily:D1V.mono, fontSize:9, letterSpacing:'.1em', opacity:.75}}>geobiom.ru · 59.94°N 30.31°E</div>
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>визитка</div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { LogoBoletus, LogoPine, LogoForestStand, LogoMycelium, LogoStamp, D1VLogoLab2 });
