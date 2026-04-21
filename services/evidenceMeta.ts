import type { GradeActivity } from '../types';

/**
 * Código de competencia → área (misma lógica que CalificacionesView / COMP_TO_AREA_COLOR).
 * "Técnica" agrupa las competencias de formación técnica (redes, VoIP, etc.).
 */
export const COMP_TO_EVIDENCE_AREA_LABEL: Record<string, string> = {
  '220501014': 'Técnica',
  '220501046': "TIC's",
  '220501091': 'Técnica',
  '220501104': 'Técnica',
  '220501105': 'Técnica',
  '220501106': 'Técnica',
  '220501107': 'Técnica',
  '240202501': 'Bilingüismo',
  '240201528': 'Matemáticas',
  '240201064': 'Investigación',
  '240201524': 'Comunicación',
  '240201526': 'Comunicación',
  '210201501': 'Comunicación',
  '220601501': 'Ambiente',
  '230101507': 'Edu. Física',
  '240201529': 'Emprendimiento',
  '220201501': 'Ciencias Naturales',
  '240201530': 'EEF',
};

export const ALL_EVIDENCE_AREAS = 'Todas las áreas';

/** Sin código GA/GI reconocible en nombre o detalle */
export const UNCLASSIFIED_EVIDENCE_AREA = 'Sin clasificar';

const AREA_DISPLAY_ORDER = [
  'Técnica',
  "TIC's",
  'Bilingüismo',
  'Matemáticas',
  'Investigación',
  'Comunicación',
  'Ambiente',
  'Edu. Física',
  'Emprendimiento',
  'Ciencias Naturales',
  'EEF',
  UNCLASSIFIED_EVIDENCE_AREA,
];

/** Código competencia en evidencia tipo GA1-220501014-AA1-EV01 o GI1-240201530-AA1-EV01 */
export function extractCompCodeFromActivityText(text: string): string | null {
  const m = text.trim().match(/G[AI]\d+-(\d{6,10})-AA\d+-EV\d+/i);
  return m ? m[1] : null;
}

export function getEvidenceAreaLabel(activity: GradeActivity): string {
  const raw = `${activity.name} ${activity.detail ?? ''}`;
  const code = extractCompCodeFromActivityText(raw);
  if (!code) return UNCLASSIFIED_EVIDENCE_AREA;
  return COMP_TO_EVIDENCE_AREA_LABEL[code] ?? UNCLASSIFIED_EVIDENCE_AREA;
}

export function activityMatchesEvidenceArea(activity: GradeActivity, areaFilter: string): boolean {
  if (areaFilter === ALL_EVIDENCE_AREAS) return true;
  return getEvidenceAreaLabel(activity) === areaFilter;
}

export function shortEvidenceLabel(name: string): string {
  const aaEv = name.match(/AA\d+-EV\d+/i);
  if (aaEv) return aaEv[0].toUpperCase();
  const ev = name.match(/EV\d+/i);
  return ev ? ev[0].toUpperCase() : name.slice(0, 28);
}

/** Opciones de filtro por área según actividades visibles en el contexto actual */
export function buildEvidenceAreaOptions(pool: GradeActivity[]): string[] {
  const present = new Set(pool.map(getEvidenceAreaLabel));
  const extra = [...present].filter(
    (l) => !AREA_DISPLAY_ORDER.includes(l)
  );
  extra.sort((a, b) => a.localeCompare(b, 'es'));
  return [
    ALL_EVIDENCE_AREAS,
    ...AREA_DISPLAY_ORDER.filter((l) => present.has(l)),
    ...extra,
  ];
}

export type EvidencePendingScope = {
  phaseFilter: string | string[];
  allPhasesLabel: string;
  /** string = single area or ALL_EVIDENCE_AREAS sentinel; string[] = multi-select (empty = all) */
  areaFilter: string | string[];
  /** vacío = todas las evidencias del contexto; si no, solo estos ids */
  selectedActivityIds: Set<string>;
};

export function filterActsForPendingEvidence(
  fichaActs: GradeActivity[],
  scope: EvidencePendingScope
): GradeActivity[] {
  let acts: GradeActivity[];
  if (Array.isArray(scope.phaseFilter)) {
    acts = scope.phaseFilter.length === 0
      ? fichaActs
      : fichaActs.filter((a) => (scope.phaseFilter as string[]).includes(a.phase ?? ''));
  } else {
    acts = scope.phaseFilter === scope.allPhasesLabel
      ? fichaActs
      : fichaActs.filter((a) => a.phase === scope.phaseFilter);
  }
  if (Array.isArray(scope.areaFilter)) {
    if (scope.areaFilter.length > 0) {
      acts = acts.filter((a) => (scope.areaFilter as string[]).some((ar) => activityMatchesEvidenceArea(a, ar)));
    }
  } else {
    acts = acts.filter((a) => activityMatchesEvidenceArea(a, scope.areaFilter as string));
  }
  if (scope.selectedActivityIds.size > 0) {
    acts = acts.filter((a) => scope.selectedActivityIds.has(a.id));
  }
  return acts;
}
