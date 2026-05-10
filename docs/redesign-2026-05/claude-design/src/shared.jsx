// Shared helpers, mock data, and SVG primitives used across all 5 directions.

// 25 mushroom species roughly modeled on the live Geobiom catalogue.
const SPECIES = [
  { id: 'boletus-edulis',       ru: 'Белый гриб',           lat: 'Boletus edulis',         edibility: 'edible',     synonyms: ['боровик', 'белый', 'коровка'], season: [7,8,9,10], affinity: { 'Сосна':0.95,'Смеш. хвойный':0.90,'Ель':0.90,'Смешанный':0.85,'Берёза':0.85,'Дуб':0.80 } },
  { id: 'cantharellus-cibarius',ru: 'Лисичка обыкновенная', lat: 'Cantharellus cibarius',  edibility: 'edible',     synonyms: ['петушок'],                      season: [6,7,8,9],   affinity: { 'Ель':0.90,'Сосна':0.85,'Смеш. хвойный':0.85,'Берёза':0.70 } },
  { id: 'leccinum-scabrum',     ru: 'Подберёзовик',         lat: 'Leccinum scabrum',       edibility: 'edible',     synonyms: ['обабок'],                       season: [6,7,8,9,10],affinity: { 'Берёза':0.95,'Смеш. лиственный':0.85,'Смешанный':0.80 } },
  { id: 'leccinum-aurantiacum', ru: 'Подосиновик',          lat: 'Leccinum aurantiacum',   edibility: 'edible',     synonyms: ['красноголовик'],                season: [7,8,9],     affinity: { 'Осина':0.95,'Смеш. лиственный':0.85,'Берёза':0.70 } },
  { id: 'lactarius-resimus',    ru: 'Груздь настоящий',     lat: 'Lactarius resimus',      edibility: 'cond',       synonyms: ['белый груздь'],                 season: [7,8,9],     affinity: { 'Берёза':0.90,'Смешанный':0.80,'Смеш. лиственный':0.70 } },
  { id: 'amanita-phalloides',   ru: 'Бледная поганка',      lat: 'Amanita phalloides',     edibility: 'deadly',     synonyms: [],                               season: [7,8,9],     affinity: { 'Дуб':0.85,'Смеш. лиственный':0.75,'Смешанный':0.70 } },
  { id: 'pleurotus-ostreatus',  ru: 'Вешенка обыкновенная', lat: 'Pleurotus ostreatus',    edibility: 'edible',     synonyms: [],                               season: [9,10,11,4,5],affinity:{ 'Смеш. лиственный':0.85,'Осина':0.80 } },
  { id: 'lactarius-torminosus', ru: 'Волнушка розовая',     lat: 'Lactarius torminosus',   edibility: 'cond',       synonyms: ['волжанка'],                     season: [7,8,9],     affinity: { 'Берёза':0.95,'Смешанный':0.75 } },
];

const FOREST_TYPES = ['Сосна','Ель','Берёза','Осина','Дуб','Смеш. хвойный','Смеш. лиственный','Смешанный'];

// Saved spots in Lenobl
const SPOTS = [
  { id: 's1', name: 'Поляна за Лемболово', note: 'Белые в августе, у поваленной берёзы', lat: 60.31, lon: 30.21, rating: 5, date: '12 авг 2025', species: ['boletus-edulis','leccinum-scabrum'] },
  { id: 's2', name: 'Сосняк у Кавголово',   note: 'Лисички вдоль тропы, сухой сосновый бор', lat: 60.27, lon: 30.45, rating: 4, date: '04 авг 2025', species: ['cantharellus-cibarius','boletus-edulis'] },
  { id: 's3', name: 'Берёзняк, Сертолово',  note: 'Подосиновики после дождей', lat: 60.14, lon: 30.21, rating: 4, date: '21 сен 2025', species: ['leccinum-aurantiacum','leccinum-scabrum'] },
  { id: 's4', name: 'Болото за Токсово',    note: 'Клюква по краю болота', lat: 60.18, lon: 30.52, rating: 3, date: '02 окт 2025', species: [] },
  { id: 's5', name: 'Сосново — east edge',   note: 'Тестовая точка', lat: 60.16, lon: 29.98, rating: 5, date: '29 авг 2025', species: ['boletus-edulis'] },
];

// 18 districts of Leningrad oblast with mock indices
const DISTRICTS = [
  { name:'Всеволожский',    idx: 0.78 },
  { name:'Приозерский',     idx: 0.72 },
  { name:'Выборгский',      idx: 0.68 },
  { name:'Лужский',         idx: 0.55 },
  { name:'Гатчинский',      idx: 0.61 },
  { name:'Тосненский',      idx: 0.49 },
  { name:'Кировский',       idx: 0.43 },
  { name:'Волховский',      idx: 0.51 },
  { name:'Лодейнопольский', idx: 0.62 },
  { name:'Подпорожский',    idx: 0.59 },
  { name:'Тихвинский',      idx: 0.46 },
  { name:'Бокситогорский',  idx: 0.41 },
  { name:'Кингисеппский',   idx: 0.38 },
  { name:'Ломоносовский',   idx: 0.44 },
  { name:'Сланцевский',     idx: 0.35 },
  { name:'Волосовский',     idx: 0.40 },
  { name:'Киришский',       idx: 0.47 },
];

// Edibility palette helper
const EDIBILITY = {
  edible: { ru:'Съедобный',           color:'#3a5a3a' },
  cond:   { ru:'Условно съедобный',   color:'#8b6f3a' },
  inedible:{ru:'Несъедобный',         color:'#7a6f5e' },
  toxic:  { ru:'Ядовитый',            color:'#a04a3a' },
  deadly: { ru:'Смертельно ядовитый', color:'#5e1a1a' },
};

// ---- Reusable little SVGs (no full pictures, only iconographic glyphs) ----

const IconMushroom = ({ size=16, stroke='currentColor', fill='none', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 11a8 8 0 0 1 16 0 1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M10 12v6a2 2 0 0 0 4 0v-6" />
  </svg>
);

const IconLeaf = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 4 13c0-6 4-9 16-9-1 11-4 16-9 16z" />
    <path d="M2 22c1-9 6-15 14-17" />
  </svg>
);

const IconTree = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 L5 11 H8 L3 18 H10 V22 H14 V18 H21 L16 11 H19 Z"/>
  </svg>
);

const IconPin = ({ size=16, stroke='currentColor', fill='none', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
);

const IconDrop = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 C7 11 5 14 5 17 a7 7 0 0 0 14 0 c0-3-2-6-7-14z"/>
  </svg>
);

const IconSearch = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <path d="m20 20-3.5-3.5"/>
  </svg>
);

const IconPlus = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const IconLayers = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 2 8l10 5 10-5-10-5z"/>
    <path d="m2 13 10 5 10-5"/>
    <path d="m2 18 10 5 10-5"/>
  </svg>
);

const IconCompass = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="m15 9-2 6-4 1 2-6z"/>
  </svg>
);

const IconUser = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
);

const IconStar = ({ size=14, fill='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <path d="m12 2 3 7 7 .7-5.3 4.6 1.6 7L12 17.7 5.7 21.3 7.3 14.3 2 9.7 9 9z"/>
  </svg>
);

const IconChevron = ({ size=14, stroke='currentColor', strokeWidth=2, dir='right' }) => {
  const rot = { right: 0, left: 180, down: 90, up: -90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{transform:`rotate(${rot}deg)`}}>
      <path d="m9 6 6 6-6 6"/>
    </svg>
  );
};

const IconTarget = ({ size=16, stroke='currentColor', strokeWidth=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
  </svg>
);

// ---- Stylized map background generators (SVG, no real map tiles) ----
// Produces a stylized "lenobl-ish" SVG: gulf on the west, lakes, rivers, forest patches.
// Each direction restyles colors via props.
const StylizedMap = ({
  width = 900, height = 600,
  bg = '#e8e2d3',
  water = '#b9c9d6',
  forest = '#9bb08a',
  forestAlt = '#7d9670',
  road = 'rgba(0,0,0,.18)',
  roadMain = 'rgba(160,80,30,.55)',
  border = 'rgba(0,0,0,.12)',
  showRoads = true,
  showLabels = true,
  labelColor = 'rgba(40,40,30,.6)',
  showHatch = false,
  forestTexture = false,
  contour = false,
  children = null,
  style = {},
}) => {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{display:'block', width:'100%', height:'100%', ...style}} preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="hatch1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.06)" strokeWidth="1"/>
        </pattern>
        <pattern id="dots1" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.7" fill="rgba(60,80,50,.25)"/>
        </pattern>
        <pattern id="trees1" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M7 3 L4 10 L10 10 Z" fill="rgba(50,80,50,.22)"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill={bg}/>
      {showHatch && <rect x="0" y="0" width={width} height={height} fill="url(#hatch1)"/>}

      {/* Gulf of Finland (left) */}
      <path d={`M0 ${height*0.35} C ${width*0.15} ${height*0.4}, ${width*0.25} ${height*0.55}, ${width*0.18} ${height*0.7}
                L 0 ${height*0.85} Z`}
            fill={water}/>
      {/* Lake Ladoga corner (top-right) */}
      <path d={`M${width} ${height*0.05} L ${width*0.78} ${height*0.05} C ${width*0.82} ${height*0.18}, ${width*0.92} ${height*0.22}, ${width} ${height*0.28} Z`}
            fill={water}/>

      {/* Forests — irregular blobs */}
      <g>
        <path d={`M${width*0.05} ${height*0.05} C ${width*0.3} ${height*0.0},${width*0.45} ${height*0.15},${width*0.55} ${height*0.05} L ${width*0.55} ${height*0.32} C ${width*0.4} ${height*0.36},${width*0.2} ${height*0.4},${width*0.05} ${height*0.32} Z`} fill={forest}/>
        <path d={`M${width*0.55} ${height*0.05} C ${width*0.65} ${height*0.18},${width*0.7} ${height*0.25},${width*0.78} ${height*0.05} Z`} fill={forestAlt}/>
        <path d={`M${width*0.3} ${height*0.45} C ${width*0.5} ${height*0.4},${width*0.7} ${height*0.5},${width*0.78} ${height*0.42} L ${width*0.85} ${height*0.6} C ${width*0.7} ${height*0.7},${width*0.4} ${height*0.72},${width*0.25} ${height*0.62} Z`} fill={forestAlt}/>
        <path d={`M${width*0.4} ${height*0.7} C ${width*0.6} ${height*0.68},${width*0.78} ${height*0.78},${width*0.92} ${height*0.72} L ${width} ${height*0.95} L ${width*0.32} ${height*0.95} Z`} fill={forest}/>
        {forestTexture && (
          <>
            <path d={`M${width*0.05} ${height*0.05} C ${width*0.3} ${height*0.0},${width*0.45} ${height*0.15},${width*0.55} ${height*0.05} L ${width*0.55} ${height*0.32} C ${width*0.4} ${height*0.36},${width*0.2} ${height*0.4},${width*0.05} ${height*0.32} Z`} fill="url(#trees1)"/>
            <path d={`M${width*0.3} ${height*0.45} C ${width*0.5} ${height*0.4},${width*0.7} ${height*0.5},${width*0.78} ${height*0.42} L ${width*0.85} ${height*0.6} C ${width*0.7} ${height*0.7},${width*0.4} ${height*0.72},${width*0.25} ${height*0.62} Z`} fill="url(#trees1)"/>
          </>
        )}
      </g>

      {/* Rivers */}
      <g fill="none" stroke={water} strokeWidth="3" strokeLinecap="round">
        <path d={`M${width*0.05} ${height*0.5} C ${width*0.25} ${height*0.55}, ${width*0.4} ${height*0.6}, ${width*0.65} ${height*0.5} S ${width*0.85} ${height*0.45}, ${width} ${height*0.55}`}/>
        <path d={`M${width*0.3} ${height*0.95} C ${width*0.4} ${height*0.78}, ${width*0.5} ${height*0.7}, ${width*0.6} ${height*0.55}`}/>
      </g>

      {/* Small lakes */}
      <g fill={water}>
        <ellipse cx={width*0.4} cy={height*0.18} rx="22" ry="9"/>
        <ellipse cx={width*0.62} cy={height*0.32} rx="14" ry="7"/>
        <ellipse cx={width*0.7} cy={height*0.78} rx="18" ry="8"/>
        <ellipse cx={width*0.18} cy={height*0.55} rx="10" ry="5"/>
      </g>

      {/* Contour lines (topo style) */}
      {contour && (
        <g fill="none" stroke="rgba(110,80,40,.18)" strokeWidth="0.8">
          {Array.from({length: 12}).map((_,i)=>(
            <path key={i} d={`M${width*0.1} ${height*(0.3+i*0.045)} Q ${width*0.45} ${height*(0.25+i*0.04)} ${width*0.85} ${height*(0.32+i*0.045)}`}/>
          ))}
        </g>
      )}

      {/* Roads */}
      {showRoads && (
        <g fill="none" stroke={road} strokeWidth="1.2">
          <path d={`M0 ${height*0.6} L ${width} ${height*0.62}`}/>
          <path d={`M${width*0.45} 0 L ${width*0.5} ${height}`}/>
          <path d={`M${width*0.2} ${height*0.1} L ${width*0.85} ${height*0.95}`}/>
          <path d={`M${width*0.1} ${height*0.85} L ${width} ${height*0.4}`} stroke={roadMain} strokeWidth="2"/>
        </g>
      )}

      {/* Labels */}
      {showLabels && (
        <g fill={labelColor} fontFamily="inherit" fontSize="10">
          <text x={width*0.48} y={height*0.62}>СПб</text>
          <text x={width*0.32} y={height*0.45}>Зеленогорск</text>
          <text x={width*0.6} y={height*0.32}>Токсово</text>
          <text x={width*0.55} y={height*0.18}>Приозерск</text>
          <text x={width*0.3} y={height*0.85}>Гатчина</text>
          <text x={width*0.78} y={height*0.55}>Кировск</text>
          <text x={width*0.08} y={height*0.4} fontStyle="italic">Финский залив</text>
          <text x={width*0.86} y={height*0.18} fontStyle="italic">Ладога</text>
        </g>
      )}

      {children}
    </svg>
  );
};

// Bonitet bar (a single horizontal scale)
const BonitetBar = ({ value=0.7, color='#3a5a3a', track='rgba(0,0,0,.08)', height=4, segments=12 }) => (
  <div style={{display:'flex', gap:2, height}}>
    {Array.from({length:segments}).map((_,i)=>(
      <div key={i} style={{flex:1, background: i/segments < value ? color : track, borderRadius:1}}/>
    ))}
  </div>
);

// Frame label corner ribbon for artboards (inside the artboard, top-right)
// Quick utility to make month strip
const monthStrip = (active = []) => {
  const months = ['Я','Ф','М','А','М','И','И','А','С','О','Н','Д'];
  return months.map((m,i)=>({ m, on: active.includes(i+1) }));
};

// expose
Object.assign(window, {
  SPECIES, SPOTS, DISTRICTS, FOREST_TYPES, EDIBILITY,
  IconMushroom, IconLeaf, IconTree, IconPin, IconDrop, IconSearch, IconPlus,
  IconLayers, IconCompass, IconUser, IconStar, IconChevron, IconTarget,
  StylizedMap, BonitetBar, monthStrip,
});
