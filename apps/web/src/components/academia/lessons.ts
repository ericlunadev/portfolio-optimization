export type StationKey =
  | "macro"
  | "allocation"
  | "sectors"
  | "assets"
  | "portfolio";

export interface StationMeta {
  key: StationKey;
  index: number;
  label: string;
  title: string;
  tagline: string;
  summary: string;
  bullets: string[];
}

export const STATIONS: StationMeta[] = [
  {
    key: "macro",
    index: 1,
    label: "El mundo",
    title: "¿En qué clima económico estamos?",
    tagline: "Antes de elegir una acción, elegí el tablero.",
    summary:
      "El primer zoom es el más amplio. Mirás la economía global y te preguntás si el viento sopla a favor.",
    bullets: [
      "Seleccioná la región donde operar (EE.UU., Europa, Emergentes).",
      "Observá el ciclo: tasas de interés, inflación, crecimiento.",
      "Validá el sentimiento de mercado: euforia y pánico suelen anticipar giros.",
    ],
  },
  {
    key: "allocation",
    index: 2,
    label: "Tu perfil",
    title: "¿Cuánto riesgo aguantás?",
    tagline: "Antes del ticker, el mix entre crecimiento y seguridad.",
    summary:
      "Definí tu asset allocation: el porcentaje de tu capital en renta variable (crecimiento) vs. renta fija (estabilidad).",
    bullets: [
      "Conservador (20/80): prioridad a la preservación del capital.",
      "Moderado (60/40): el balance clásico entre crecimiento y protección.",
      "Agresivo (90/10): máximo retorno a largo plazo aceptando caídas fuertes.",
    ],
  },
  {
    key: "sectors",
    index: 3,
    label: "Los sectores",
    title: "Seguí el dinero institucional",
    tagline: "No todos los sectores ganan al mismo tiempo.",
    summary:
      "Con tasas bajas brilla tecnología. Con inflación alta, energía y consumo básico. El capital rota según el ciclo.",
    bullets: [
      "Sectores cíclicos: tecnología, consumo discrecional, industriales.",
      "Sectores defensivos: consumo básico, salud, servicios públicos.",
      "La rotación anticipa cambios de fase del ciclo económico.",
    ],
  },
  {
    key: "assets",
    index: 4,
    label: "Los activos",
    title: "Calidad y timing: el filtro doble",
    tagline: "Una buena empresa a mal precio sigue siendo mal negocio.",
    summary:
      "Elegido el sector, cruzás análisis fundamental (¿qué comprar?) con análisis técnico (¿cuándo entrar?).",
    bullets: [
      "Fundamental: balance sólido, ventaja competitiva (moat), gobernanza ética.",
      "Valuación: precio actual vs. valor intrínseco y promedio histórico.",
      "Técnico: soportes, resistencias, momento (RSI, MACD, medias móviles).",
    ],
  },
  {
    key: "portfolio",
    index: 5,
    label: "La cartera",
    title: "Optimización y gestión de riesgo",
    tagline: "Acá entra Markowitz: pesos exactos en la frontera eficiente.",
    summary:
      "Combinar activos poco correlacionados para maximizar el retorno ajustado por riesgo (Sharpe). Y siempre, un plan de salida.",
    bullets: [
      "Correlaciones bajas hacen que la diversificación funcione de verdad.",
      "La frontera eficiente muestra el mejor portafolio por cada nivel de riesgo.",
      "Definí tu stop-loss antes de entrar: la preservación del capital es prioridad.",
    ],
  },
];

export function getStation(key: StationKey): StationMeta {
  const station = STATIONS.find((s) => s.key === key);
  if (!station) throw new Error(`Unknown station: ${key}`);
  return station;
}
