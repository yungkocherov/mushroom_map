// Hybrid logos — base = E (Pine), + small boletus à la D, + topo contours à la A.
// Four variants exploring different compositions and balance.

// Shared bits
const HContour = ({ color, opacity=.55, y=54, w=64, strong=true }) => (
  <g fill="none" stroke={color} strokeLinecap="round">
    <path d={`M${w*0.05} ${y} Q ${w/2} ${y-4}, ${w*0.95} ${y}`} strokeWidth={strong?1.6:1.3} opacity={opacity}/>
    <path d={`M${w*0.18} ${y+4} Q ${w/2} ${y}, ${w*0.82} ${y+4}`} strokeWidth="1.1" opacity={opacity*0.55}/>
  </g>
);

const HBoletus = ({ x=42, y=42, scale=1, color, accent }) => {
  const s = scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* stem */}
      <path d="M-3 0 C -3 5, -4 7, -2.5 8 L 3 8 C 4.5 7, 3.5 5, 3 0 Z" fill={color}/>
      {/* cap */}
      <path d="M-7 -1 C -7 -7, -3 -10, 0 -10 C 3 -10, 7 -7, 7 -1 C 7 1, 4 1.5, 0 1.5 C -4 1.5, -7 1, -7 -1 Z" fill={accent}/>
      {/* small contour echo on cap */}
      <path d="M-5 -3 Q 0 -7, 5 -3" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth=".7" strokeLinecap="round"/>
    </g>
  );
};

const HPine = ({ cx=24, color, top=8, big=true }) => big ? (
  <g>
    <rect x={cx-2} y="46" width="4" height="6" fill={color}/>
    <path d={`M${cx} ${top} L ${cx-12} 30 L ${cx-6} 30 L ${cx-16} 46 L ${cx+16} 46 L ${cx+6} 30 L ${cx+12} 30 Z`} fill={color}/>
  </g>
) : (
  <g>
    <rect x={cx-1.5} y="44" width="3" height="6" fill={color}/>
    <path d={`M${cx} ${top} L ${cx-9} 26 L ${cx-5} 26 L ${cx-12} 44 L ${cx+12} 44 L ${cx+5} 26 L ${cx+9} 26 Z`} fill={color}/>
  </g>
);

// H1 · Classic — pine left-of-center, small boletus to the right of trunk, topo line below.
const LogoHybrid1 = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {HPine({ cx:24, color, big:true })}
      <HBoletus x={46} y={44} scale={1} color={color} accent={accent}/>
      {HContour({ color, opacity:.5, y:55 })}
      <path d="M14 60 Q 32 56, 50 60" fill="none" stroke={color} strokeWidth="1" opacity=".25" strokeLinecap="round"/>
    </g>
  </svg>
);

// H2 · Two mushrooms — pine center, two boletus of different size flanking, denser contour below.
const LogoHybrid2 = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {HPine({ cx:32, color, big:true })}
      <HBoletus x={14} y={46} scale={0.7} color={color} accent={accent}/>
      <HBoletus x={50} y={44} scale={1} color={color} accent={accent}/>
      <g fill="none" stroke={color} strokeLinecap="round">
        <path d="M3 56 Q 32 51, 61 56" strokeWidth="1.6" opacity=".55"/>
        <path d="M8 60 Q 32 56, 56 60" strokeWidth="1.2" opacity=".35"/>
        <path d="M14 63 Q 32 60, 50 63" strokeWidth="1" opacity=".2"/>
      </g>
    </g>
  </svg>
);

// H3 · Compact stacked — small pine at top, big boletus directly under-right, topo wraps both.
const LogoHybrid3 = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {HPine({ cx:22, color, top:10, big:false })}
      <HBoletus x={44} y={42} scale={1.35} color={color} accent={accent}/>
      <g fill="none" stroke={color} strokeLinecap="round">
        <path d="M4 54 Q 32 48, 60 54" strokeWidth="1.6" opacity=".55"/>
        <path d="M10 58 Q 32 53, 54 58" strokeWidth="1.1" opacity=".35"/>
      </g>
    </g>
  </svg>
);

// H4 · Cartographic frame — pine + boletus inside a topo "hill" silhouette (cap-and-contour ring).
const LogoHybrid4 = ({ size=56, color=D1V.mossDeep, accent=D1V.terra, breathe=true }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{display:'block'}}>
    <g style={breathe ? {transformOrigin:'32px 50px', animation:'d1v-breathe 5s ease-in-out infinite'} : {}}>
      {/* topo hill behind */}
      <g fill="none" stroke={color} strokeLinecap="round">
        <path d="M2 50 Q 32 6, 62 50" strokeWidth="1.4" opacity=".25"/>
        <path d="M8 50 Q 32 14, 56 50" strokeWidth="1.2" opacity=".22"/>
        <path d="M14 50 Q 32 24, 50 50" strokeWidth="1" opacity=".18"/>
      </g>
      {HPine({ cx:24, color, top:18, big:false })}
      <HBoletus x={44} y={44} scale={1.05} color={color} accent={accent}/>
      {/* ground contour */}
      <line x1="6" y1="52" x2="58" y2="52" stroke={color} strokeWidth="1.4" opacity=".55"/>
      <path d="M12 56 Q 32 53, 52 56" fill="none" stroke={color} strokeWidth="1" opacity=".3" strokeLinecap="round"/>
    </g>
  </svg>
);

// ---------- Hybrid Logo Lab ----------
const D1VHybridLab = () => {
  const [picked, setPicked] = React.useState(0);
  const concepts = [
    { id:'H1', name:'H1 · Classic',      note:'Сосна слева, боровик справа от ствола, одна контурная линия под ними. Самый сбалансированный.', Mark: LogoHybrid1 },
    { id:'H2', name:'H2 · Two boletus',  note:'Два гриба разного размера по бокам сосны, плотный топо-узор внизу. Самый «лесной».',           Mark: LogoHybrid2 },
    { id:'H3', name:'H3 · Compact',      note:'Маленькая сосна и крупный боровик рядом. Гриб становится главным героем.',                       Mark: LogoHybrid3 },
    { id:'H4', name:'H4 · Topo frame',   note:'Сосна и боровик внутри топографического холма. Самый картографичный.',                            Mark: LogoHybrid4 },
  ];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, padding:'40px 48px', boxSizing:'border-box', overflow:'auto', fontFamily:D1V.sans, color:D1V.ink}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
        <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase'}}>logo lab · hybrid · сосна + боровик + топо</div>
        <div style={{fontFamily:D1V.hand, fontSize:18, color:D1V.terra}}>E + D + A</div>
      </div>
      <h2 style={{fontFamily:D1V.serif, fontSize:36, fontWeight:500, margin:'4px 0 8px', letterSpacing:'-0.02em'}}>
        Гибрид · <em style={{color:D1V.terra}}>лес с грибом</em>
      </h2>
      <p style={{fontSize:14, color:D1V.inkSoft, maxWidth:680, margin:'0 0 28px', lineHeight:1.55}}>
        За основу — концепт E (сосна). Справа добавлен боровик с оранжевой шляпкой (как в D), под деревом — картографический контур-линия (как в A). Четыре варианта композиции — от классического до компактного и «холмового».
      </p>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:32}}>
        {concepts.map((c, i) => {
          const sel = picked === i;
          return (
            <div key={c.id} className="d1v-card" onClick={() => setPicked(i)}
                 style={{padding:24, background:D1V.cream, borderRadius:16, cursor:'pointer',
                         boxShadow: sel ? `0 0 0 2px ${D1V.mossDeep}, 0 10px 32px rgba(60,50,30,.14)` : '0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18}}>
                <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>{c.name}</div>
                {sel && <div style={{fontFamily:D1V.mono, fontSize:10, padding:'2px 8px', background:D1V.mossDeep, color:D1V.cream, borderRadius:999, letterSpacing:'.12em'}}>выбран</div>}
              </div>
              {/* big mark */}
              <div style={{display:'flex', justifyContent:'center', padding:'34px 0', background:D1V.bg, borderRadius:12, marginBottom:14}}>
                <c.Mark size={120}/>
              </div>
              {/* wordmark */}
              <div style={{padding:'14px 0', borderTop:`1px solid rgba(0,0,0,.08)`, borderBottom:`1px solid rgba(0,0,0,.08)`, marginBottom:14}}>
                <Wordmark Mark={c.Mark} size="md"/>
              </div>
              {/* tiny size + on dark */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14}}>
                <div style={{padding:10, background:D1V.bg, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
                  <c.Mark size={16}/><c.Mark size={24}/><c.Mark size={32}/>
                </div>
                <div style={{padding:10, background:D1V.mossDeep, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <c.Mark size={32} color={D1V.cream} accent={D1V.terra}/>
                </div>
                <div style={{padding:10, background:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}>
                  <c.Mark size={32}/>
                </div>
              </div>
              <div style={{fontSize:13, color:D1V.inkSoft, lineHeight:1.5, fontStyle:'italic'}}>{c.note}</div>
            </div>
          );
        })}
      </div>

      {/* Application strip */}
      <div style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.08), 0 0 0 1px rgba(0,0,0,.05)'}}>
        <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:16}}>применение · {concepts[picked].name}</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{width:64, height:64, borderRadius:'50%', background:D1V.mossDeep, display:'flex', alignItems:'center', justifyContent:'center'}}>
              {React.createElement(concepts[picked].Mark, { size:46, color:D1V.cream, accent:D1V.terra, breathe:false })}
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>app icon</div>
          </div>
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:18, padding:'10px 16px', background:'#fff', borderRadius:8, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}>
              <Wordmark Mark={concepts[picked].Mark} size="md" showSub={false}/>
              <span style={{fontSize:11, color:D1V.inkSoft}}>Карта</span>
              <span style={{fontSize:11, color:D1V.inkSoft}}>Виды</span>
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>nav</div>
          </div>
          <div style={{padding:18, background:D1V.bg, borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
            <div style={{width:'100%', aspectRatio:'1.7/1', background:D1V.mossDeep, borderRadius:6, padding:14, color:D1V.cream, display:'flex', flexDirection:'column', justifyContent:'space-between', boxSizing:'border-box'}}>
              {React.createElement(concepts[picked].Mark, { size:30, color:D1V.cream, accent:D1V.terra, breathe:false })}
              <div style={{fontFamily:D1V.mono, fontSize:9, letterSpacing:'.1em', opacity:.75}}>geobiom.ru</div>
            </div>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.1em', textTransform:'uppercase'}}>визитка</div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { LogoHybrid1, LogoHybrid2, LogoHybrid3, LogoHybrid4, D1VHybridLab });
