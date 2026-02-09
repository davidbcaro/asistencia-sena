
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

// Stats for charts
export interface AttendanceStats {
  date: string;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}