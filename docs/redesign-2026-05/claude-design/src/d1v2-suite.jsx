// D1 v2 — product suite: Add Spot modal, Species card, Season calendar, Onboarding, Brand guide.
// Uses LogoHybrid1 throughout (window.LogoHybrid1).

const PrimaryLogo = (props) => React.createElement(window.LogoHybrid1 || LogoCapTopo, props);

const Pill = ({ on, children, onClick }) => (
  <button onClick={onClick}
    style={{padding:'8px 14px', fontSize:13, background: on ? D1V.mossDeep : 'transparent',
            color: on ? D1V.cream : D1V.ink, border: on ? `1px solid ${D1V.mossDeep}` : `1px solid rgba(0,0,0,.16)`,
            borderRadius:999, fontFamily:D1V.sans, cursor:'pointer', transition:'all .2s'}}>{children}</button>
);

// ---------------- ADD SPOT MODAL ----------------
const D1VAddSpot = () => {
  const [rating, setRating] = React.useState(4);
  const [trees, setTrees] = React.useState(new Set(['Берёза','Ель']));
  const [shrooms, setShrooms] = React.useState(new Set(['Белый','Подберёзовик']));
  const [berries, setBerries] = React.useState(new Set());
  const tog = (s, v) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; };

  const TREES = ['Сосна','Ель','Берёза','Осина','Дуб','Ольха','Пихта','Лиственница','Липа','Клён','Ива'];
  const SHROOMS = ['Белый','Подосиновик','Подберёзовик','Лисичка','Моховик','Рыжик','Груздь белый','Волнушка','Опёнок','Сморчок','Сыроежка','Вёшенка','Мухомор'];
  const BERRIES = ['Черника','Морошка','Клюква','Брусника','Малина'];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, position:'relative', fontFamily:D1V.sans, color:D1V.ink, overflow:'hidden'}}>
      <div style={{position:'absolute', inset:0, opacity:.5}}>
        <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" labelColor="rgba(40,40,30,.4)" forestTexture/>
      </div>
      <div style={{position:'absolute', inset:0, background:'rgba(20,15,10,.18)'}}/>

      {/* Modal */}
      <div className="d1v-card" style={{position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', width:560, maxHeight:'92%', overflow:'auto', background:D1V.cream, borderRadius:18, boxShadow:'0 30px 80px rgba(40,30,15,.32), 0 0 0 1px rgba(0,0,0,.06)', animation:'d1v-fadeup .5s ease both'}}>
        {/* header */}
        <div style={{padding:'22px 28px 18px', borderBottom:'1px solid rgba(0,0,0,.06)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:D1V.cream, zIndex:2}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <PrimaryLogo size={32}/>
            <div>
              <div style={{fontFamily:D1V.serif, fontSize:22, fontWeight:600, letterSpacing:'-0.01em'}}>Сохранить место</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginTop:2}}>59.984° N · 30.268° E</div>
            </div>
          </div>
          <button style={{width:32, height:32, borderRadius:'50%', border:0, background:'rgba(0,0,0,.06)', color:D1V.ink, fontSize:18, cursor:'pointer'}}>×</button>
        </div>

        <div style={{padding:'22px 28px 12px'}}>
          {/* Name */}
          <div style={{marginBottom:18}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>название</div>
            <input defaultValue="Поляна за Лемболово"
              style={{width:'100%', padding:'13px 14px', background:'#fff', border:`1.5px solid ${D1V.mossDeep}`, borderRadius:10, fontSize:15, fontFamily:D1V.sans, color:D1V.ink, boxSizing:'border-box', outline:'none'}}/>
          </div>

          {/* Note */}
          <div style={{marginBottom:18}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>заметка</div>
            <textarea placeholder="что нашли · что вспомнить позже" rows="2"
              style={{width:'100%', padding:'13px 14px', background:'#fff', border:`1px solid rgba(0,0,0,.14)`, borderRadius:10, fontSize:14, fontFamily:D1V.sans, color:D1V.ink, boxSizing:'border-box', resize:'none', outline:'none'}}/>
          </div>

          {/* Rating */}
          <div style={{marginBottom:18}}>
            <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
              <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>оценка места</div>
              <div style={{fontFamily:D1V.hand, fontSize:14, color:D1V.terra}}>1 = плохо · 5 = отлично</div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8}}>
              {[['1','плохо'],['2','так себе'],['3','нейтр.'],['4','хорошо'],['5','отлично']].map(([n,l],i)=>{
                const sel = rating === i+1;
                return (
                  <button key={n} onClick={()=>setRating(i+1)} className="d1v-btn"
                    style={{padding:'12px 4px', borderRadius:10, border:0, cursor:'pointer',
                            background: sel ? D1V.mossDeep : 'rgba(0,0,0,.04)', color: sel ? D1V.cream : D1V.ink,
                            fontFamily:D1V.sans, transition:'all .2s'}}>
                    <div style={{fontFamily:D1V.serif, fontSize:24, fontWeight:600, lineHeight:1}}>{n}</div>
                    <div style={{fontSize:10, marginTop:4, opacity:.85}}>{l}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trees */}
          <div style={{marginBottom:18}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>деревья</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {TREES.map(t => <Pill key={t} on={trees.has(t)} onClick={()=>setTrees(tog(trees,t))}>{t}</Pill>)}
            </div>
          </div>

          {/* Mushrooms */}
          <div style={{marginBottom:18}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>грибы</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {SHROOMS.map(t => <Pill key={t} on={shrooms.has(t)} onClick={()=>setShrooms(tog(shrooms,t))}>{t}</Pill>)}
            </div>
          </div>

          {/* Berries */}
          <div style={{marginBottom:6}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>ягоды</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {BERRIES.map(t => <Pill key={t} on={berries.has(t)} onClick={()=>setBerries(tog(berries,t))}>{t}</Pill>)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'16px 28px', borderTop:'1px solid rgba(0,0,0,.06)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', bottom:0, background:D1V.cream}}>
          <div style={{fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, display:'flex', alignItems:'center', gap:8}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:D1V.moss}}/>
            видно только тебе
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="d1v-btn" style={{padding:'12px 18px', background:'transparent', color:D1V.ink, border:`1px solid rgba(0,0,0,.18)`, borderRadius:10, fontSize:14, fontFamily:D1V.sans, cursor:'pointer'}}>Отмена</button>
            <button className="d1v-btn" style={{padding:'12px 22px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:10, fontSize:14, fontWeight:500, fontFamily:D1V.sans, cursor:'pointer', boxShadow:'0 6px 18px rgba(62,72,39,.25)'}}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- SPECIES CARD ----------------
const D1VSpecies = () => {
  const months = ['Я','Ф','М','А','М','И','И','А','С','О','Н','Д'];
  const seasonOn = [6,7,8,9,10]; // boletus
  const affinity = [['Сосна',.95,'#9bb070'],['Смеш. хвойный',.90,'#84a079'],['Ель',.90,'#5e7042'],['Берёза',.85,'#cdb86a'],['Дуб',.80,'#b8895a'],['Осина',.65,'#a47d5a']];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, color:D1V.ink, fontFamily:D1V.sans, overflow:'auto'}}>
      {/* Header */}
      <div style={{padding:'22px 32px', borderBottom:'1px solid rgba(0,0,0,.08)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <Wordmark size="md"/>
        <div style={{display:'flex', gap:24, fontSize:13, color:D1V.inkSoft}}>
          <span>Карта</span><span style={{color:D1V.ink, fontWeight:600}}>Виды</span><span>Споты</span><span>Методология</span>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:0}}>
        {/* Left: hero illustration placeholder + meta */}
        <div style={{padding:'40px 32px 40px 48px'}}>
          <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>вид · 04 / 25</div>
          <h1 style={{fontFamily:D1V.serif, fontSize:64, fontWeight:500, margin:'0 0 4px', letterSpacing:'-0.025em', lineHeight:1}}>Белый гриб</h1>
          <div style={{fontFamily:D1V.serif, fontSize:22, fontStyle:'italic', color:D1V.terra, fontWeight:400, marginBottom:18}}>Boletus edulis</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:24}}>
            <span style={{padding:'5px 12px', background:'rgba(58,90,58,.16)', color:'#3a5a3a', borderRadius:999, fontSize:12, fontFamily:D1V.mono, letterSpacing:'.06em'}}>СЪЕДОБНЫЙ</span>
            <span style={{padding:'5px 12px', background:'rgba(184,106,58,.14)', color:D1V.terra, borderRadius:999, fontSize:12, fontFamily:D1V.mono, letterSpacing:'.06em'}}>МИКОРИЗА</span>
            <span style={{padding:'5px 12px', background:'rgba(93,106,58,.14)', color:D1V.mossDeep, borderRadius:999, fontSize:12, fontFamily:D1V.mono, letterSpacing:'.06em'}}>3 СИНОНИМА</span>
          </div>

          <p style={{fontSize:16, lineHeight:1.65, color:D1V.inkSoft, maxWidth:520, margin:'0 0 28px'}}>
            Король микоризных грибов Северо-Запада. В Ленобласти встречается с конца июня по середину октября; особенно охотно даёт слой после трёх-четырёх дней дождей при ночной температуре +12 °С и выше.
          </p>

          {/* Season strip */}
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>сезон</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(12, 1fr)', gap:4}}>
              {months.map((m,i)=>{
                const on = seasonOn.includes(i+1);
                const peak = i+1 === 8;
                return (
                  <div key={i} style={{textAlign:'center', padding:'8px 0', borderRadius:6, background: peak ? D1V.mossDeep : on ? 'rgba(93,106,58,.18)' : 'rgba(0,0,0,.04)', color: peak ? D1V.cream : on ? D1V.mossDeep : D1V.inkSoft}}>
                    <div style={{fontFamily:D1V.mono, fontSize:11, fontWeight: peak ? 700 : 500}}>{m}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.04em'}}>
              <span>пик · август</span><span>72% сборов в ИЮН-СЕН</span>
            </div>
          </div>

          {/* Synonyms */}
          <div style={{paddingTop:18, borderTop:'1px solid rgba(0,0,0,.08)', display:'flex', gap:32}}>
            <div>
              <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>в народе</div>
              <div style={{fontFamily:D1V.serif, fontSize:18, fontStyle:'italic'}}>боровик · коровка · печурка</div>
            </div>
          </div>
        </div>

        {/* Right: photo placeholder + affinity */}
        <div style={{padding:'40px 48px 40px 16px'}}>
          {/* Photo placeholder */}
          <div style={{aspectRatio:'4/5', borderRadius:18, background:`repeating-linear-gradient(135deg, rgba(184,106,58,.16) 0 8px, rgba(184,106,58,.08) 8px 16px), ${D1V.paper}`, position:'relative', boxShadow:'0 10px 40px rgba(60,50,30,.16), 0 0 0 1px rgba(0,0,0,.06)', overflow:'hidden', marginBottom:16}}>
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14}}>
              <PrimaryLogo size={72}/>
              <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase'}}>фото вида · 1200×1500</div>
              <div style={{fontFamily:D1V.hand, fontSize:18, color:D1V.terra}}>сюда — снимок из атласа</div>
            </div>
            <div style={{position:'absolute', top:14, left:14, padding:'5px 10px', background:'rgba(250,245,232,.92)', borderRadius:6, fontFamily:D1V.mono, fontSize:10, letterSpacing:'.1em', color:D1V.inkSoft, backdropFilter:'blur(4px)'}}>plate · 04</div>
          </div>

          {/* Affinity */}
          <div style={{padding:18, background:D1V.cream, borderRadius:14, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:14}}>аффинити к лесу</div>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {affinity.map(([n,v,c])=>(
                <div key={n} style={{display:'grid', gridTemplateColumns:'120px 1fr 32px', gap:12, alignItems:'center'}}>
                  <div style={{fontSize:13}}>{n}</div>
                  <div style={{height:8, background:'rgba(0,0,0,.06)', borderRadius:4, overflow:'hidden'}}>
                    <div style={{width:`${v*100}%`, height:'100%', background:c, borderRadius:4, transformOrigin:'left', animation:'d1v-grow-x .8s cubic-bezier(.2,.7,.2,1) both'}}/>
                  </div>
                  <div style={{fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, textAlign:'right'}}>{v.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- SEASON CALENDAR ----------------
const D1VCalendar = () => {
  const months = ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
  const cur = 7; // August (0-indexed)
  const sp = [
    { ru:'Белый гриб',           lat:'Boletus edulis',         start:6, end:10, peak:8, color:D1V.mossDeep },
    { ru:'Подберёзовик',         lat:'Leccinum scabrum',       start:6, end:10, peak:8, color:D1V.moss },
    { ru:'Подосиновик',          lat:'Leccinum aurantiacum',   start:7, end:9,  peak:8, color:D1V.terra },
    { ru:'Лисичка',              lat:'Cantharellus cibarius',  start:6, end:9,  peak:7, color:'#bd9a3a' },
    { ru:'Груздь настоящий',     lat:'Lactarius resimus',      start:7, end:9,  peak:8, color:'#a47d5a' },
    { ru:'Волнушка розовая',     lat:'Lactarius torminosus',   start:7, end:9,  peak:9, color:'#c98c7a' },
    { ru:'Опёнок осенний',       lat:'Armillaria mellea',      start:8, end:10, peak:9, color:'#7a5a3a' },
    { ru:'Сыроежка',             lat:'Russula sp.',            start:6, end:10, peak:7, color:'#8a8a4a' },
    { ru:'Моховик',              lat:'Xerocomus sp.',          start:6, end:10, peak:8, color:'#6e7a3a' },
    { ru:'Сморчок',              lat:'Morchella esculenta',    start:4, end:5,  peak:5, color:'#bd9a6a' },
    { ru:'Вешенка',              lat:'Pleurotus ostreatus',    start:9, end:11, peak:10,color:'#9a8a7a' },
    { ru:'Рыжик',                lat:'Lactarius deliciosus',   start:7, end:9,  peak:9, color:'#c4742a' },
  ];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, color:D1V.ink, fontFamily:D1V.sans, overflow:'auto'}}>
      <div style={{padding:'22px 32px', borderBottom:'1px solid rgba(0,0,0,.08)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <Wordmark size="md"/>
        <div style={{display:'flex', gap:24, fontSize:13, color:D1V.inkSoft}}>
          <span>Карта</span><span>Виды</span><span>Споты</span><span style={{color:D1V.ink, fontWeight:600}}>Календарь</span>
        </div>
      </div>

      <div style={{padding:'40px 48px 24px'}}>
        <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:8}}>сезон 2026 · ленобласть</div>
        <h2 style={{fontFamily:D1V.serif, fontSize:48, fontWeight:500, margin:0, letterSpacing:'-0.025em'}}>
          Год, как <em style={{color:D1V.terra}}>лента</em>.
        </h2>
        <p style={{fontSize:15, color:D1V.inkSoft, maxWidth:600, marginTop:10, lineHeight:1.55}}>
          12 месяцев, 12 видов. Толщина полосы — длительность сезона, тёмная отметка — пик плодоношения. Текущий месяц подсвечен.
        </p>
      </div>

      {/* Ribbon */}
      <div style={{padding:'0 48px 48px'}}>
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
          {/* Month header */}
          <div style={{display:'grid', gridTemplateColumns:'200px repeat(12, 1fr)', gap:0, marginBottom:14, paddingBottom:14, borderBottom:'1px solid rgba(0,0,0,.08)'}}>
            <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, letterSpacing:'.14em', textTransform:'uppercase'}}>вид</div>
            {months.map((m,i)=>(
              <div key={m} style={{textAlign:'center', fontFamily:D1V.mono, fontSize:11, fontWeight: i===cur ? 700 : 500, color: i===cur ? D1V.terra : D1V.inkSoft, letterSpacing:'.06em', position:'relative'}}>
                {m}
                {i===cur && <div style={{position:'absolute', top:-22, left:'50%', transform:'translateX(-50%)', fontFamily:D1V.hand, fontSize:14, color:D1V.terra}}>сейчас ↓</div>}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{display:'flex', flexDirection:'column', gap:6, position:'relative'}}>
            {/* current month vertical highlight */}
            <div style={{position:'absolute', left:`calc(200px + ${cur} * (100% - 200px) / 12)`, top:-6, width:`calc((100% - 200px) / 12)`, bottom:-6, background:'rgba(184,106,58,.08)', borderRadius:6, pointerEvents:'none'}}/>
            {sp.map((s, idx)=>(
              <div key={s.ru} style={{display:'grid', gridTemplateColumns:'200px repeat(12, 1fr)', alignItems:'center', height:34, position:'relative'}}>
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{s.ru}</div>
                  <div style={{fontFamily:D1V.serif, fontSize:11, fontStyle:'italic', color:D1V.inkSoft, marginTop:1}}>{s.lat}</div>
                </div>
                {months.map((_, i) => {
                  const on = i+1 >= s.start && i+1 <= s.end;
                  const isPeak = i+1 === s.peak;
                  return (
                    <div key={i} style={{height:'100%', display:'flex', alignItems:'center', padding:'0 1px'}}>
                      {on && <div style={{width:'100%', height: isPeak? 18 : 10, background: isPeak ? s.color : `${s.color}99`, borderRadius:3,
                        transform:`scaleX(0)`, transformOrigin: i+1===s.start ? 'left' : 'center',
                        animation:`d1v-grow-x .6s ${idx*0.04}s cubic-bezier(.2,.7,.2,1) forwards`}}/>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{marginTop:22, paddingTop:18, borderTop:'1px solid rgba(0,0,0,.08)', display:'flex', gap:24, fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, letterSpacing:'.04em'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{width:18, height:10, borderRadius:3, background:`${D1V.moss}99`}}/>сезон
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{width:18, height:18, borderRadius:3, background:D1V.mossDeep}}/>пик плодоношения
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{width:14, height:14, borderRadius:3, background:'rgba(184,106,58,.18)'}}/>текущий месяц
            </div>
            <div style={{marginLeft:'auto', fontStyle:'italic'}}>* данные модельные · реальная статистика подключается к API</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- ONBOARDING ----------------
const D1VOnboarding = () => {
  const [step, setStep] = React.useState(1);
  const [district, setDistrict] = React.useState('Всеволожский');

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, color:D1V.ink, fontFamily:D1V.sans, position:'relative', overflow:'hidden'}}>
      {/* contour wash */}
      <svg width="100%" height="100%" viewBox="0 0 1280 800" preserveAspectRatio="none" style={{position:'absolute', inset:0, opacity:.16, pointerEvents:'none'}}>
        <g fill="none" stroke={D1V.bark} strokeWidth=".7">
          {Array.from({length:14}).map((_,i)=>(
            <path key={i} d={`M-50 ${120+i*48} Q 320 ${100+i*46}, 640 ${130+i*48} T 1330 ${110+i*46}`}/>
          ))}
        </g>
      </svg>

      {/* top bar */}
      <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'24px 36px'}}>
        <Wordmark size="md"/>
        <div style={{display:'flex', alignItems:'center', gap:8, fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, letterSpacing:'.14em', textTransform:'uppercase'}}>
          {[1,2,3].map(s => (
            <React.Fragment key={s}>
              <span style={{width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, background: s<=step ? D1V.mossDeep : 'rgba(0,0,0,.06)', color: s<=step ? D1V.cream : D1V.inkSoft, transition:'all .3s'}}>{s}</span>
              {s<3 && <span style={{width:24, height:1, background: s<step ? D1V.mossDeep : 'rgba(0,0,0,.1)', transition:'all .3s'}}/>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{position:'relative', padding:'0 64px', display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:48, alignItems:'center', height:'calc(100% - 80px)'}}>
        <div key={step} style={{animation:'d1v-fadeup .5s ease both'}}>
          {step===1 && (<>
            <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>шаг 1 · знакомство</div>
            <h1 style={{fontFamily:D1V.serif, fontSize:72, fontWeight:500, margin:'0 0 18px', letterSpacing:'-0.03em', lineHeight:1.02}}>Привет, грибник.</h1>
            <p style={{fontSize:18, color:D1V.inkSoft, lineHeight:1.55, maxWidth:480, margin:'0 0 32px'}}>
              Geobiom — это карта леса Ленобласти и календарь сезонов. Чтобы начать, разреши доступ к геолокации — мы покажем, что растёт <em style={{fontFamily:D1V.serif, color:D1V.terra, fontStyle:'italic'}}>рядом с тобой</em>.
            </p>
            <div style={{display:'flex', gap:12}}>
              <button className="d1v-btn" onClick={()=>setStep(2)} style={{padding:'15px 24px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', boxShadow:'0 8px 22px rgba(62,72,39,.28)', display:'inline-flex', alignItems:'center', gap:10}}>
                <IconTarget size={16} stroke={D1V.cream}/> Разрешить геолокацию
              </button>
              <button className="d1v-btn" onClick={()=>setStep(2)} style={{padding:'15px 24px', background:'transparent', color:D1V.ink, border:`1.5px solid ${D1V.ink}`, borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer'}}>
                Выбрать вручную
              </button>
            </div>
          </>)}
          {step===2 && (<>
            <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>шаг 2 · район</div>
            <h1 style={{fontFamily:D1V.serif, fontSize:60, fontWeight:500, margin:'0 0 12px', letterSpacing:'-0.025em', lineHeight:1.05}}>Где ты <em style={{color:D1V.terra}}>обычно</em> ходишь в лес?</h1>
            <p style={{fontSize:16, color:D1V.inkSoft, lineHeight:1.5, maxWidth:480, margin:'0 0 24px'}}>
              Подберём индекс плодоношения и виды, типичные для района. Можно поменять в любой момент.
            </p>
            <div style={{display:'flex', flexWrap:'wrap', gap:6, maxWidth:540, marginBottom:32}}>
              {DISTRICTS.slice(0,12).map(d => (
                <Pill key={d.name} on={district===d.name} onClick={()=>setDistrict(d.name)}>{d.name}</Pill>
              ))}
            </div>
            <div style={{display:'flex', gap:12}}>
              <button className="d1v-btn" onClick={()=>setStep(3)} style={{padding:'15px 24px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', boxShadow:'0 8px 22px rgba(62,72,39,.28)'}}>
                Дальше
              </button>
              <button className="d1v-btn" onClick={()=>setStep(1)} style={{padding:'15px 24px', background:'transparent', color:D1V.inkSoft, border:0, borderRadius:12, fontSize:14, fontFamily:D1V.sans, cursor:'pointer'}}>← назад</button>
            </div>
          </>)}
          {step===3 && (<>
            <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:10}}>шаг 3 · готово</div>
            <h1 style={{fontFamily:D1V.serif, fontSize:64, fontWeight:500, margin:'0 0 18px', letterSpacing:'-0.025em', lineHeight:1.02}}>Всё, лес <em style={{color:D1V.terra}}>ждёт</em>.</h1>
            <p style={{fontSize:17, color:D1V.inkSoft, lineHeight:1.55, maxWidth:480, margin:'0 0 28px'}}>
              Сейчас откроется карта <strong style={{color:D1V.ink}}>{district}</strong> района. Можешь сразу отметить любимый спот — кнопкой <span style={{padding:'2px 8px', background:'rgba(184,106,58,.14)', color:D1V.terra, borderRadius:6, fontFamily:D1V.mono, fontSize:12}}>+ место</span> в правом нижнем углу.
            </p>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxWidth:480, marginBottom:28}}>
              {[['🍄 Виды','25 в каталоге'],['📍 Споты','твоё личное'],['📊 Индекс','прогноз 72ч'],['🗓 Календарь','сезон по месяцам']].map(([t,d])=>(
                <div key={t} style={{padding:14, background:D1V.cream, borderRadius:10, boxShadow:'0 0 0 1px rgba(0,0,0,.05)'}}>
                  <div style={{fontFamily:D1V.serif, fontSize:14, fontWeight:600}}>{t}</div>
                  <div style={{fontSize:12, color:D1V.inkSoft, marginTop:2}}>{d}</div>
                </div>
              ))}
            </div>
            <button className="d1v-btn" style={{padding:'15px 28px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', boxShadow:'0 8px 22px rgba(62,72,39,.28)', display:'inline-flex', alignItems:'center', gap:10}}>
              <IconPin size={16} stroke={D1V.cream}/> Открыть карту
            </button>
          </>)}
        </div>

        {/* Right cameo */}
        <div style={{position:'relative', borderRadius:18, overflow:'hidden', boxShadow:'0 24px 60px rgba(60,50,30,.2), 0 0 0 1px rgba(0,0,0,.06)', aspectRatio:'4/5'}}>
          <div style={{position:'absolute', inset:0, animation:'d1v-drift 18s ease-in-out infinite'}}>
            <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" labelColor="rgba(40,40,30,.5)" forestTexture/>
          </div>
          {step>=2 && <div style={{position:'absolute', top:'30%', left:'48%'}}><PulsePin color={D1V.terra} size={14}/></div>}
          {step===3 && <div style={{position:'absolute', top:'52%', left:'62%'}}><PulsePin color={D1V.moss} size={11} delay={.4}/></div>}
          <div style={{position:'absolute', bottom:14, left:14, right:14, padding:'10px 14px', background:'rgba(250,245,232,.92)', borderRadius:10, fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft, display:'flex', justifyContent:'space-between', backdropFilter:'blur(4px)'}}>
            <span>{district}</span><span>z 8.4</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- BRAND GUIDE ----------------
const D1VBrand = () => {
  const tokens = [
    ['bg',     '#f4ede0', 'фон бумаги'],
    ['paper',  '#ede4d2', 'карты, панели'],
    ['cream',  '#faf5e8', 'модалки, карточки'],
    ['ink',    '#2a2620', 'основной текст'],
    ['inkSoft','#5b5346', 'вторичный'],
    ['mossDeep','#3e4827','primary · кнопки'],
    ['moss',   '#5d6a3a', 'аффинити, графики'],
    ['terra',  '#b86a3a', 'accent · лучшие места'],
    ['bark',   '#7a5a3a', 'осень, гумус'],
  ];
  const radii = [['sm', 6],['md', 10],['lg', 14],['xl', 18],['pill', 999]];
  const space = [4,6,8,12,16,22,32,48];

  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, color:D1V.ink, fontFamily:D1V.sans, overflow:'auto', padding:'40px 48px'}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
        <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.16em', color:D1V.inkSoft, textTransform:'uppercase'}}>geobiom · brand & tokens · v0.1</div>
        <div style={{fontFamily:D1V.hand, fontSize:18, color:D1V.terra}}>handoff-ready</div>
      </div>
      <h2 style={{fontFamily:D1V.serif, fontSize:44, fontWeight:500, margin:'4px 0 28px', letterSpacing:'-0.025em'}}>
        Гайд · <em style={{color:D1V.terra}}>основа</em>
      </h2>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>

        {/* Logo */}
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)', gridColumn:'1 / -1'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:18}}>logo · h1 hybrid</div>
          <div style={{display:'grid', gridTemplateColumns:'auto auto auto auto auto auto', gap:24, alignItems:'center'}}>
            <PrimaryLogo size={120}/>
            <Wordmark size="lg"/>
            <div style={{display:'flex', alignItems:'center', gap:10}}><PrimaryLogo size={16}/><PrimaryLogo size={24}/><PrimaryLogo size={32}/><PrimaryLogo size={48}/></div>
            <div style={{padding:18, background:D1V.mossDeep, borderRadius:10}}><PrimaryLogo size={36} color={D1V.cream} accent={D1V.terra}/></div>
            <div style={{padding:18, background:D1V.terra, borderRadius:10}}><PrimaryLogo size={36} color={D1V.cream} accent={D1V.cream}/></div>
            <div style={{padding:18, background:'#fff', borderRadius:10, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.06)'}}><PrimaryLogo size={36}/></div>
          </div>
        </div>

        {/* Colors */}
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:18}}>palette</div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {tokens.map(([n,h,role])=>(
              <div key={n} style={{display:'grid', gridTemplateColumns:'40px 90px 100px 1fr', alignItems:'center', gap:12, padding:'8px 10px', background: n==='cream' ? D1V.bg : 'transparent', borderRadius:8}}>
                <div style={{width:32, height:32, borderRadius:8, background:h, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.08)'}}/>
                <div style={{fontFamily:D1V.mono, fontSize:12, color:D1V.ink}}>{n}</div>
                <div style={{fontFamily:D1V.mono, fontSize:11, color:D1V.inkSoft}}>{h}</div>
                <div style={{fontSize:12, color:D1V.inkSoft, fontStyle:'italic'}}>{role}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:18}}>typography</div>
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <div style={{paddingBottom:10, borderBottom:'1px solid rgba(0,0,0,.06)'}}>
              <div style={{fontFamily:D1V.serif, fontSize:42, fontWeight:500, letterSpacing:'-0.025em', lineHeight:1}}>Лес, как атлас.</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.06em'}}>FRAUNCES · 500 · DISPLAY · 42-88 PX · LETTER -.025EM</div>
            </div>
            <div style={{paddingBottom:10, borderBottom:'1px solid rgba(0,0,0,.06)'}}>
              <div style={{fontFamily:D1V.serif, fontSize:22, fontWeight:600, letterSpacing:'-0.01em'}}>Заголовок секции</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.06em'}}>FRAUNCES · 600 · 18-24 PX</div>
            </div>
            <div style={{paddingBottom:10, borderBottom:'1px solid rgba(0,0,0,.06)'}}>
              <div style={{fontFamily:D1V.sans, fontSize:15}}>Параграф основного текста — Inter, line-height 1.55.</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.06em'}}>INTER · 400 · 14-17 PX · LH 1.55</div>
            </div>
            <div style={{paddingBottom:10, borderBottom:'1px solid rgba(0,0,0,.06)'}}>
              <div style={{fontFamily:D1V.mono, fontSize:11, letterSpacing:'.14em', color:D1V.ink, textTransform:'uppercase'}}>метаданные · координаты</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.06em'}}>IBM PLEX MONO · 10-12 PX · UPPERCASE · TRACK .14EM</div>
            </div>
            <div>
              <div style={{fontFamily:D1V.hand, fontSize:24, color:D1V.terra}}>хэндайтн-заметки</div>
              <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft, marginTop:6, letterSpacing:'.06em'}}>CAVEAT · 14-24 PX · ACCENT/HAND</div>
            </div>
          </div>
        </div>

        {/* Spacing */}
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:18}}>spacing · radii</div>
          <div style={{display:'flex', alignItems:'flex-end', gap:6, marginBottom:18, height:60}}>
            {space.map(s => (
              <div key={s} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                <div style={{width:s, height:s, background:D1V.mossDeep, borderRadius:2}}/>
                <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft}}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex', gap:14, paddingTop:14, borderTop:'1px solid rgba(0,0,0,.06)'}}>
            {radii.map(([n,r]) => (
              <div key={n} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
                <div style={{width:48, height:48, background:D1V.bg, borderRadius:r, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.08)'}}/>
                <div style={{fontFamily:D1V.mono, fontSize:10, color:D1V.inkSoft}}>{n}<br/>{typeof r==='number' ? r+'px' : r}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Iconography + patterns */}
        <div className="d1v-card" style={{padding:24, background:D1V.cream, borderRadius:16, boxShadow:'0 4px 16px rgba(60,50,30,.06), 0 0 0 1px rgba(0,0,0,.05)'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:18}}>icons · 1.6 stroke</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:16, marginBottom:22}}>
            {[IconMushroom, IconLeaf, IconTree, IconPin, IconDrop, IconSearch, IconCompass, IconLayers, IconStar, IconTarget, IconUser, IconPlus].map((I,i)=>(
              <div key={i} style={{width:42, height:42, background:D1V.bg, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <I size={20} stroke={D1V.ink} fill={I===IconStar ? D1V.ink : 'none'}/>
              </div>
            ))}
          </div>

          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:14}}>patterns</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
            <div style={{height:64, borderRadius:8, background:`repeating-linear-gradient(135deg, rgba(184,106,58,.18) 0 8px, rgba(184,106,58,.08) 8px 16px), ${D1V.paper}`}}/>
            <div style={{height:64, borderRadius:8, background:D1V.paper, position:'relative', overflow:'hidden'}}>
              <svg width="100%" height="100%" viewBox="0 0 200 64" preserveAspectRatio="none">
                <g fill="none" stroke={D1V.bark} strokeWidth=".7" opacity=".4">
                  {Array.from({length:6}).map((_,i)=>(<path key={i} d={`M0 ${10+i*10} Q 100 ${5+i*10}, 200 ${10+i*10}`}/>))}
                </g>
              </svg>
            </div>
            <div style={{height:64, borderRadius:8, background:`radial-gradient(circle at 30% 30%, rgba(93,106,58,.25), transparent 60%), radial-gradient(circle at 70% 70%, rgba(184,106,58,.18), transparent 60%), ${D1V.paper}`}}/>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- MAP→POPUP MORPH ----------------
const D1VMorph = () => {
  // Animated transition: pin grows into card, then shrinks back, looping.
  return (
    <div style={{width:'100%', height:'100%', background:D1V.bg, position:'relative', fontFamily:D1V.sans, overflow:'hidden'}}>
      <div style={{position:'absolute', inset:0}}>
        <StylizedMap bg="#ede1c8" water="#a9bccc" forest="#7d8e5a" forestAlt="#5e7042" labelColor="rgba(40,40,30,.5)" forestTexture/>
      </div>
      {/* dimmer that fades in/out */}
      <div style={{position:'absolute', inset:0, background:'rgba(20,15,10,.18)', animation:'d1v-morph-dim 6s ease-in-out infinite'}}/>

      <style>{`
        @keyframes d1v-morph-dim { 0%,18%{opacity:0} 30%,82%{opacity:1} 95%,100%{opacity:0} }
        @keyframes d1v-morph-card {
          0%,15% { width:14px; height:14px; border-radius:50%; box-shadow:none; opacity:.7; }
          30%,82% { width:360px; height:380px; border-radius:18px; box-shadow:0 30px 80px rgba(40,30,15,.32), 0 0 0 1px rgba(0,0,0,.06); opacity:1; }
          95%,100% { width:14px; height:14px; border-radius:50%; box-shadow:none; opacity:.7; }
        }
        @keyframes d1v-morph-content { 0%,28%{opacity:0} 38%,80%{opacity:1} 90%,100%{opacity:0} }
      `}</style>

      <div style={{position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', background:D1V.cream, animation:'d1v-morph-card 6s cubic-bezier(.4,.2,.2,1) infinite', overflow:'hidden'}}>
        <div style={{padding:'18px 22px', animation:'d1v-morph-content 6s ease infinite', whiteSpace:'nowrap'}}>
          <div style={{fontFamily:D1V.mono, fontSize:10, letterSpacing:'.14em', color:D1V.inkSoft, textTransform:'uppercase', marginBottom:6}}>моя точка</div>
          <div style={{fontFamily:D1V.serif, fontSize:24, fontWeight:600, letterSpacing:'-0.01em', marginBottom:4}}>Поляна за Лемболово</div>
          <div style={{fontSize:13, color:D1V.inkSoft, fontStyle:'italic', marginBottom:14}}>Белые в августе, у поваленной берёзы.</div>
          <div style={{display:'flex', gap:6, marginBottom:14}}>
            {[1,2,3,4,5].map(i=><IconStar key={i} size={16} fill={D1V.terra}/>)}
          </div>
          <div style={{padding:'14px 0', borderTop:'1px solid rgba(0,0,0,.08)', fontSize:13, color:D1V.inkSoft, lineHeight:1.5}}>
            Тип леса — берёза + ель. Возраст 62 года. Бонитет средний.
          </div>
          <button style={{marginTop:14, padding:'12px 18px', background:D1V.mossDeep, color:D1V.cream, border:0, borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer'}}>Маршрут</button>
        </div>
      </div>

      {/* label */}
      <div style={{position:'absolute', top:18, left:18, padding:'8px 14px', background:D1V.cream, borderRadius:8, fontFamily:D1V.mono, fontSize:11, letterSpacing:'.1em', color:D1V.inkSoft, textTransform:'uppercase', boxShadow:'0 4px 14px rgba(60,50,30,.12)'}}>
        morph · pin → card · 6s loop
      </div>
    </div>
  );
};

Object.assign(window, { D1VAddSpot, D1VSpecies, D1VCalendar, D1VOnboarding, D1VBrand, D1VMorph });
