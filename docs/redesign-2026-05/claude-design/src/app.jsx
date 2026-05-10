// Main app — wires all 5 directions into the design canvas.

const { useState } = React;

const SectionHeader = ({ kicker, title, blurb, accent }) => (
  <div style={{padding:'4px 8px 18px', maxWidth:780}}>
    <div style={{display:'inline-block', padding:'4px 10px', background:accent, color:'#fff', fontSize:10, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', borderRadius:4}}>{kicker}</div>
    <h2 style={{fontSize:32, fontWeight:700, margin:'12px 0 6px', letterSpacing:'-0.02em', color:'#1a1d1a'}}>{title}</h2>
    <p style={{fontSize:14, color:'#5d6360', margin:0, lineHeight:1.55}}>{blurb}</p>
  </div>
);

const App = () => (
  <DesignCanvas
    title="Geobiom · Redesign Explorations"
    subtitle="Пять направлений редизайна. Каждое — лендинг, карта, сайдбар/попап, личный кабинет, мобильный экран."
  >
    <DCSection id="intro" title="Brief & Approach">
      <DCArtboard id="brief" label="Бриф" width={920} height={560}>
        <div style={{padding:48, fontFamily:'"Manrope", system-ui, sans-serif', color:'#1a1d1a', height:'100%', boxSizing:'border-box', background:'#fbf8f1', overflow:'auto'}}>
          <div style={{fontSize:11, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:'#7a6f4a', marginBottom:10}}>Geobiom · 5 направлений редизайна</div>
          <h1 style={{fontSize:42, fontWeight:700, margin:'0 0 14px', letterSpacing:'-0.03em', lineHeight:1.05, fontFamily:'"Fraunces", serif'}}>От плоского сайта — к продукту с душой леса.</h1>
          <p style={{fontSize:15, color:'#5d6360', lineHeight:1.6, margin:'0 0 20px', maxWidth:720}}>
            Сейчас Geobiom — функциональный, но визуально нейтральный сайт. Карта работает, но «не пахнет лесом». Нет онбординга, нет лендинга, нет ритма. Я подготовил пять разных направлений — намеренно широких, чтобы можно было ткнуть пальцем и сказать «вот это, и кусочек оттуда».
          </p>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:18}}>
            {[
              ['01 · Природный (Organic)','#3d6b3d','Тёплая бумага, мхи, рукописные акценты, мягкая сетка. Лес как живой организм. Эмоция и атмосфера.'],
              ['02 · Картографический (Atlas)','#7a4a2a','Старый ботанический атлас. Sepia + бутылочно-зелёный, гравюра, плотная сетка. Серьёзность каталога.'],
              ['03 · Минимализм (Modern Dark)','#10b981','Тёмная тема, дата-первый подход, акцент-зелёный. Дашборд для тех, кто читает данные, а не картинки.'],
              ['04 · Premium / Strava-like','#fc5200','Геймифицированный трекер сезона. Карточки, метрики, ачивки, лента друзей. Для энтузиастов.'],
              ['05 · Экспедиционный (Outdoor)','#c0382b','Полевой гид. Кремовая бумага, топография, штампы, моноширинные координаты. Komoot-meets-USGS.'],
            ].map(([t,c,d])=>(
              <div key={t} style={{padding:18, background:'#fff', border:'1px solid #e6e0d0', borderRadius:8, borderLeft:`4px solid ${c}`}}>
                <div style={{fontSize:14, fontWeight:800, color:c, marginBottom:6, letterSpacing:'-0.01em'}}>{t}</div>
                <div style={{fontSize:13, color:'#5d6360', lineHeight:1.5}}>{d}</div>
              </div>
            ))}
          </div>

          <div style={{marginTop:22, padding:14, background:'#f0eadc', border:'1px dashed #c8bfa6', borderRadius:6, fontSize:13, color:'#5d6360', lineHeight:1.5}}>
            <b style={{color:'#1a1d1a'}}>Как смотреть:</b> листай по горизонтали внутри каждой секции. Каждое направление — лендинг, карта, деталь (спот/вид), личный кабинет/онбординг, мобильный экран. Любой артборд можно открыть на весь экран кликом.
          </div>
        </div>
      </DCArtboard>
    </DCSection>

    <DCSection id="d1" title="01 · Природный / Organic">
      <DCArtboard id="d1-landing" label="Лендинг" width={1280} height={800}><D1Landing/></DCArtboard>
      <DCArtboard id="d1-map" label="Карта + сайдбар" width={1280} height={800}><D1Map/></DCArtboard>
      <DCArtboard id="d1-species" label="Попап спота" width={1280} height={800}><D1Popup/></DCArtboard>
      <DCArtboard id="d1-saved" label="Сохранённые споты" width={1280} height={900}><D1Saved/></DCArtboard>
      <DCArtboard id="d1-mobile" label="Mobile · карта" width={390} height={780}><D1Mobile/></DCArtboard>
    </DCSection>

    <DCSection id="d1v2" title="01 · v2 — refined / logo · анимации · переходы">
      <DCArtboard id="d1v2-logo" label="Logo lab · 3 концепта" width={1280} height={1080}><D1VLogoLab/></DCArtboard>
      <DCArtboard id="d1v2-logo2" label="Logo lab · v2 (гриб · дерево · лес)" width={1280} height={1280}><D1VLogoLab2/></DCArtboard>
      <DCArtboard id="d1v2-logoHy" label="Logo lab · гибрид (E + D + A)" width={1280} height={1280}><D1VHybridLab/></DCArtboard>
      <DCArtboard id="d1v2-landing" label="Лендинг · v2" width={1280} height={820}><D1VLanding/></DCArtboard>
      <DCArtboard id="d1v2-map" label="Карта · v2 (пульсы, переходы)" width={1280} height={820}><D1VMap/></DCArtboard>
      <DCArtboard id="d1v2-reel" label="Flow reel · авто-переход 12с" width={1280} height={820}><D1VReel/></DCArtboard>
      <DCArtboard id="d1v2-mobile" label="Mobile · v2" width={390} height={780}><D1VMobile/></DCArtboard>
    </DCSection>

    <DCSection id="d1v2x" title="01 · v2 — продукт (онбординг, споты, виды, календарь, бренд)">
      <DCArtboard id="d1v2-onboard" label="Онбординг · 3 шага" width={1280} height={820}><D1VOnboarding/></DCArtboard>
      <DCArtboard id="d1v2-addspot" label="Сохранить место" width={1280} height={900}><D1VAddSpot/></DCArtboard>
      <DCArtboard id="d1v2-species" label="Карточка вида" width={1280} height={1100}><D1VSpecies/></DCArtboard>
      <DCArtboard id="d1v2-calendar" label="Календарь сезона" width={1280} height={1000}><D1VCalendar/></DCArtboard>
      <DCArtboard id="d1v2-morph" label="Морф · pin → card" width={1280} height={820}><D1VMorph/></DCArtboard>
      <DCArtboard id="d1v2-brand" label="Brand & tokens" width={1280} height={1700}><D1VBrand/></DCArtboard>
    </DCSection>

    <DCSection id="d2" title="02 · Картографический / Atlas">
      <DCArtboard id="d2-landing" label="Лендинг" width={1280} height={800}><D2Landing/></DCArtboard>
      <DCArtboard id="d2-map" label="Карта + сайдбар" width={1280} height={800}><D2Map/></DCArtboard>
      <DCArtboard id="d2-species" label="Карточка вида" width={1280} height={900}><D2Species/></DCArtboard>
      <DCArtboard id="d2-cabinet" label="Сохранённые споты" width={1280} height={900}><D2Saved/></DCArtboard>
      <DCArtboard id="d2-mobile" label="Mobile · вид" width={390} height={780}><D2Mobile/></DCArtboard>
    </DCSection>

    <DCSection id="d3" title="03 · Минимализм / Modern Dark">
      <DCArtboard id="d3-landing" label="Лендинг" width={1280} height={800}><D3Landing/></DCArtboard>
      <DCArtboard id="d3-map" label="Карта · дашборд" width={1280} height={800}><D3Map/></DCArtboard>
      <DCArtboard id="d3-species" label="Попап спота" width={1280} height={800}><D3Popup/></DCArtboard>
      <DCArtboard id="d3-onboard" label="Сохранённые споты" width={1280} height={900}><D3Saved/></DCArtboard>
      <DCArtboard id="d3-mobile" label="Mobile · карта" width={390} height={780}><D3Mobile/></DCArtboard>
    </DCSection>

    <DCSection id="d4" title="04 · Premium / Strava-like">
      <DCArtboard id="d4-landing" label="Лендинг" width={1280} height={800}><D4Landing/></DCArtboard>
      <DCArtboard id="d4-map" label="Карта · трекер сезона" width={1280} height={800}><D4Map/></DCArtboard>
      <DCArtboard id="d4-activity" label="Спот · activity" width={1280} height={1100}><D4Activity/></DCArtboard>
      <DCArtboard id="d4-saved" label="Споты сезона" width={1280} height={900}><D4Saved/></DCArtboard>
      <DCArtboard id="d4-mobile" label="Mobile · домой" width={390} height={780}><D4Mobile/></DCArtboard>
    </DCSection>

    <DCSection id="d5" title="05 · Экспедиционный / Outdoor">
      <DCArtboard id="d5-landing" label="Лендинг" width={1280} height={800}><D5Landing/></DCArtboard>
      <DCArtboard id="d5-map" label="Полевая карта" width={1280} height={800}><D5Map/></DCArtboard>
      <DCArtboard id="d5-species" label="Field guide · вид" width={1280} height={900}><D5Species/></DCArtboard>
      <DCArtboard id="d5-onboard" label="Онбординг" width={1280} height={800}><D5Onboard/></DCArtboard>
      <DCArtboard id="d5-mobile" label="Mobile · карта" width={390} height={780}><D5Mobile/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
