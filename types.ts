
export type UserRole = 'professor' | 'student';

export interface Student {
  id: string;
  documentNumber?: string;
  firstName: string; // Nombres
  lastName: string;  // Apellidos
  email: string;
  username?: string; // Nombre de usuario (LMS)
  active: boolean;
  group?: string; // Ficha o Grupo
  status?: 'Formación' | 'Cancelado' | 'Retiro Voluntario' | 'Deserción'; // Estado del aprendiz
  description?: string; // Comentarios y novedades
  isVocero?: boolean; // Vocero del grupo
  isVoceroSuplente?: boolean; // Vocero suplente
}

export interface Ficha {
  id: string;
  code: string; // Ej: 2902090
  program: string; // Ej: ADSO
  description?: string;
  cronogramaProgramName?: string; // Nombre completo del programa
  cronogramaCenter?: string; // Centro o regional
  cronogramaStartDate?: string; // Fecha de inicio
  cronogramaTrainingStartDate?: string; // Inicio de formacion
  cronogramaEndDate?: string; // Fecha fin
  cronogramaDownloadUrl?: string; // Enlace al cronograma descargable
}

export interface AttendanceRecord {
  date: string; // ISO string YYYY-MM-DD
  present: boolean;
  studentId: string;
}

export interface ClassSession {
  id: string;
  date: string; // YYYY-MM-DD
  group: string; // Ficha code or 'Todas'
  description?: string;
}

export interface Course {
  id: string;
  name: string;
}

export interface EmailDraft {
  studentId: string;
  studentName: string;
  email: string;
  subject: string;
  body: string;
  generatedAt: string;
}

export interface EmailSettings {
  teacherName: string;
  teacherEmail: string;
  serviceId: string;
  templateId: string;
  publicKey: string;
}

export interface SupabaseSettings {
  url: string;
  key: string;
}

export interface GradeActivity {
  id: string;
  name: string;
  group: string; // Ficha code
  phase: string; // Fase académica
  detail?: string;
  maxScore: number; // 0-100
  createdAt: string;
}

export interface GradeEntry {
  studentId: string;
  activityId: string;
  score: number; // 0-100
  letter: 'A' | 'D';
  updatedAt: string;
}

export interface PlaneacionSemanalFichaData {
  /** GradeActivity.id → 0-based global weekIndex (0 = W1 … 95 = W96). Absent = sin asignar. */
  tecnicaAssignments: Record<string, number>;
  /** `${transversalKey}::${weekIndex}` → array of text labels written by the instructor */
  transversalCells: Record<string, string[]>;
  /** cardKey → weeks duration (1 or 2). cardKey = "act::${activityId}" | "lbl::${rowKey}::${text}" */
  cardDurations: Record<string, 1 | 2>;
  /** cardKeys that are hidden (faded/semi-transparent, still in their cell) */
  hiddenCards: string[];
  /** weekIndex → ISO date string (YYYY-MM-DD) override for that week's start date.
   *  All subsequent weeks recalculate from this anchor (+7 days each). */
  weekDateOverrides: Record<number, string>;
  /** phaseName → custom week count (overrides PHASE_SEGMENTS default) */
  phaseWeekCounts: Record<string, number>;
}

/** fichaId → planeación data for that ficha */
export type PlaneacionSemanalData = Record<string, PlaneacionSemanalFichaData>;

// Stats for charts
export interface AttendanceStats {
  date: string;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

// Sofia Plus - Juicios Evaluativos por RAP
export interface RapDefinition {
  rapId: string;           // e.g., "531334"
  rapName: string;         // Full RAP name from Juicios report
  competenciaId: string;   // e.g., "35848"
  competenciaName: string; // Full competencia name from Juicios report
}

export interface JuicioRapEntry {
  studentId: string;
  rapId: string;
  juicio: 'APROBADO' | 'NO APROBADO' | 'POR EVALUAR';
  fecha: string;       // ISO datetime string, empty if not set
  funcionario: string; // Name of instructor who registered
  fichaCode: string;   // Ficha code from the report
  updatedAt: string;
}

export interface JuicioRapHistoryEntry extends JuicioRapEntry {
  historyId: string;
}