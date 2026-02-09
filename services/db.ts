import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Student, Ficha, AttendanceRecord, EmailDraft, EmailSettings, ClassSession, GradeActivity, GradeEntry } from '../types';

const STORAGE_KEYS = {
  STUDENTS: 'asistenciapro_students',
  FICHAS: 'asistenciapro_fichas',
  ATTENDANCE: 'asistenciapro_attendance',
  SESSIONS: 'asistenciapro_sessions',
  DRAFTS: 'asistenciapro_drafts',
  EMAIL_SETTINGS: 'asistenciapro_email_settings',
  INSTRUCTOR_PWD_HASH: 'asistenciapro_instructor_password_hash',
  GRADE_ACTIVITIES: 'asistenciapro_grade_activities',
  GRADES: 'asistenciapro_grades',
  RAP_NOTES: 'asistenciapro_rap_notes',
  RAP_COLUMNS: 'asistenciapro_rap_columns',
  STUDENT_GRADE_OBSERVATIONS: 'asistenciapro_student_grade_observations',
};

const DB_EVENT_NAME = 'asistenciapro-storage-update';

const notifyChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DB_EVENT_NAME));
  }
};

// --- CRYPTO HELPERS (SHA-256) ---

const hashPasswordInsecure = (plainText: string): string => {
    let hash = 0;
    for (let i = 0; i < plainText.length; i++) {
        const char = plainText.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return "insecure_" + hash.toString(16);
};

export const hashPassword = async (plainText: string): Promise<string> => {
    // 1. Try Web Crypto API (Standard, Secure)
    if (window.crypto && window.crypto.subtle) {
        try {
            const msgBuffer = new TextEncoder().encode(plainText);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn("Crypto API failed (likely insecure context). Using fallback.");
        }
    }
    
    // 2. Fallback for insecure contexts (HTTP) where crypto.subtle is undefined
    return hashPasswordInsecure(plainText);
};

// --- EDGE FUNCTIONS (WRITE OPERATIONS) ---
// All write operations to Supabase go through Edge Functions for security

export const sendAttendanceToCloud = async (records: AttendanceRecord[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    if (!edgeUrl) {
        console.error("❌ VITE_SUPABASE_EDGE_URL not configured! Check your environment variables.");
        return;
    }

    if (records.length === 0) {
        return; // Nothing to sync
    }

    try {
        const payload = records.map(r => ({
            date: r.date,
            student_id: r.studentId,
            present: r.present
        }));

        const url = `${edgeUrl}/save-attendance`;
        console.log("📤 Syncing attendance to:", url, "Records:", payload.length);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: payload })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText || `HTTP ${response.status}` };
            }
            console.error("❌ Attendance sync failed:", errorData);
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Attendance synced successfully:", result);
    } catch (error: any) {
        console.error("❌ Failed to sync attendance to cloud:", error.message || error);
        // Don't throw - allow app to continue working locally
    }
};

export const sendStudentsToCloud = async (students: Student[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    
    if (!edgeUrl) {
        console.error("❌ VITE_SUPABASE_EDGE_URL not configured! Check your environment variables.");
        return;
    }

    if (students.length === 0) {
        return; // Nothing to sync
    }

    try {
        const payload = students.map(s => ({
            id: s.id,
            document_number: s.documentNumber,
            first_name: s.firstName,
            last_name: s.lastName,
            email: s.email,
            active: s.active,
            group: s.group,
            status: s.status || 'Formación',
            description: s.description || null
        }));

        const url = `${edgeUrl}/save-students`;
        console.log("📤 Syncing students to:", url, "Students:", payload.length);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ students: payload })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText || `HTTP ${response.status}` };
            }
            console.error("❌ Students sync failed:", errorData);
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Students synced successfully:", result);
    } catch (error: any) {
        console.error("❌ Failed to sync students to cloud:", error.message || error);
        // Don't throw - allow app to continue working locally
    }
};

export const sendFichasToCloud = async (fichas: Ficha[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    
    if (!edgeUrl) {
        console.error("❌ VITE_SUPABASE_EDGE_URL not configured! Check your environment variables.");
        return;
    }

    if (fichas.length === 0) {
        return; // Nothing to sync
    }

    try {
        const payload = fichas.map(f => ({
            id: f.id,
            code: f.code,
            program: f.program,
            description: f.description,
            cronograma_program_name: f.cronogramaProgramName ?? null,
            cronograma_center: f.cronogramaCenter ?? null,
            cronograma_start_date: f.cronogramaStartDate ?? null,
            cronograma_training_start_date: f.cronogramaTrainingStartDate ?? null,
            cronograma_end_date: f.cronogramaEndDate ?? null,
            cronograma_download_url: f.cronogramaDownloadUrl ?? null
        }));

        const url = `${edgeUrl}/save-fichas`;
        console.log("📤 Syncing fichas to:", url, "Fichas:", payload.length);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fichas: payload })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText || `HTTP ${response.status}` };
            }
            console.error("❌ Fichas sync failed:", errorData);
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Fichas synced successfully:", result);
    } catch (error: any) {
        console.error("❌ Failed to sync fichas to cloud:", error.message || error);
        // Don't throw - allow app to continue working locally
    }
};

export const sendSessionsToCloud = async (sessions: ClassSession[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    
    if (!edgeUrl) {
        console.error("❌ VITE_SUPABASE_EDGE_URL not configured! Check your environment variables.");
        return;
    }

    if (sessions.length === 0) {
        return; // Nothing to sync
    }

    try {
        const payload = sessions.map(s => ({
            id: s.id,
            date: s.date,
            group: s.group,
            description: s.description
        }));

        const url = `${edgeUrl}/save-sessions`;
        console.log("📤 Syncing sessions to:", url, "Sessions:", payload.length);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessions: payload })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText || `HTTP ${response.status}` };
            }
            console.error("❌ Sessions sync failed:", errorData);
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Sessions synced successfully:", result);
    } catch (error: any) {
        console.error("❌ Failed to sync sessions to cloud:", error.message || error);
        // Don't throw - allow app to continue working locally
    }
};

// --- EDGE FUNCTION HELPERS FOR DELETES ---
const postToEdge = async (path: string, payload: Record<string, any>): Promise<any> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    if (!edgeUrl) {
        console.error("❌ VITE_SUPABASE_EDGE_URL not configured! Check your environment variables.");
        return null;
    }

    const response = await fetch(`${edgeUrl}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { message: errorText || `HTTP ${response.status}` };
        }
        console.error(`❌ Edge function ${path} failed:`, errorData);
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    try {
        return await response.json();
    } catch {
        return null;
    }
};

export const deleteSessionFromCloud = async (sessionId: string): Promise<void> => {
    if (!sessionId) return;
    try {
        await postToEdge('delete-session', { sessionId });
        console.log("✅ Session deleted in cloud:", sessionId);
    } catch (error: any) {
        console.error("❌ Failed to delete session in cloud:", error.message || error);
    }
};

export const softDeleteStudentFromCloud = async (studentId: string): Promise<void> => {
    if (!studentId) return;
    try {
        await postToEdge('soft-delete-student', { studentId });
        console.log("✅ Student soft-deleted in cloud:", studentId);
    } catch (error: any) {
        console.error("❌ Failed to soft-delete student in cloud:", error.message || error);
    }
};

export const deleteFichaFromCloud = async (fichaId: string): Promise<void> => {
    if (!fichaId) return;
    try {
        await postToEdge('delete-ficha', { fichaId });
        console.log("✅ Ficha deleted in cloud:", fichaId);
    } catch (error: any) {
        console.error("❌ Failed to delete ficha in cloud:", error.message || error);
        throw error;
    }
};

// --- SUPABASE CLIENT HELPER (READ-ONLY) ---
// This client is ONLY used for reading data and Realtime subscriptions
// All write operations go through Edge Functions
let supabaseInstance: SupabaseClient | null = null;

const getClient = (): SupabaseClient | null => {
    if (supabaseInstance) return supabaseInstance;
    
    // Get settings from environment variables only
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!url || !key) return null;
    
    try {
        supabaseInstance = createClient(url, key, {
            auth: { persistSession: false }
        });
        return supabaseInstance;
    } catch (e) {
        console.error("Supabase Client Init Error", e);
        return null;
    }
}

// Students
export const getStudents = (): Student[] => {
  const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
  if (!data) return [];
  
  const parsed = JSON.parse(data);

  // MIGRATION SHIM: Handle old data formats
  const migrated = parsed.map((s: any) => {
      // Case 1: Already correct
      if (s.firstName !== undefined) {
          return {
              ...s,
              username: s.username || s.usuario || undefined,
              status: s.status || s.estado || 'Formación',
              description: s.description || s.descripcion || undefined,
              estado: undefined,
              descripcion: undefined,
              usuario: undefined
          } as Student;
      }
      
      // Case 2: Snake_case from DB raw sync (Fix for the bug)
      if (s.first_name !== undefined) {
          return { 
              ...s, 
              firstName: s.first_name, 
              lastName: s.last_name, 
              first_name: undefined, 
              last_name: undefined,
              username: s.username || s.usuario || undefined,
              status: s.status || s.estado || 'Formación',
              description: s.description || s.descripcion || undefined,
              estado: undefined,
              descripcion: undefined,
              usuario: undefined
          } as Student;
      }

      // Case 3: Old 'name' single field format
      const oldName = s.name || '';
      const parts = oldName.trim().split(/\s+/);
      let firstName = oldName;
      let lastName = '';
      if (parts.length > 1) {
          lastName = parts.pop() || '';
          firstName = parts.join(' ');
      }
      return { 
          ...s, 
          firstName, 
          lastName, 
          name: undefined,
          username: s.username || s.usuario || undefined,
          status: s.status || s.estado || 'Formación',
          description: s.description || s.descripcion || undefined,
          estado: undefined,
          descripcion: undefined,
          usuario: undefined
      } as Student;
  });
  return migrated;
};

export const saveStudents = (students: Student[]) => {
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  notifyChange();
};

export const addStudent = (student: Student) => {
  const current = getStudents();
  // Ensure status has a default value
  const studentWithDefaults = {
    ...student,
    status: student.status || 'Formación'
  };
  saveStudents([...current, studentWithDefaults]);
  // Sync to cloud via Edge Function
  sendStudentsToCloud([studentWithDefaults]);
};

export const bulkAddStudents = (newStudents: Student[]) => {
    const current = getStudents();
    saveStudents([...current, ...newStudents]);
    // Sync to cloud via Edge Function
    if (newStudents.length > 0) {
        sendStudentsToCloud(newStudents);
    }
};

export const updateStudent = (updatedStudent: Student) => {
  const students = getStudents();
  const index = students.findIndex(s => s.id === updatedStudent.id);
  if (index !== -1) {
    students[index] = updatedStudent;
    saveStudents(students);
    // Sync to cloud via Edge Function
    sendStudentsToCloud([updatedStudent]);
  }
};

export const deleteStudent = async (id: string) => {
  const current = getStudents();
  const updated = current.filter(s => s.id !== id);
  saveStudents(updated);
  await softDeleteStudentFromCloud(id);
};

export const bulkDeleteStudents = async (ids: string[]) => {
  const current = getStudents();
  const updated = current.filter(s => !ids.includes(s.id));
  saveStudents(updated);
  // Delete from cloud
  for (const id of ids) {
    await softDeleteStudentFromCloud(id);
  }
};

// Fichas
export const getFichas = (): Ficha[] => {
  const data = localStorage.getItem(STORAGE_KEYS.FICHAS);
  if (!data) {
     return []; // Return empty if nothing exists
  }
  const parsed = JSON.parse(data);
  const migrated = parsed.map((f: any) => ({
      ...f,
      cronogramaProgramName: f.cronogramaProgramName || f.cronograma_program_name || f.program_full_name || undefined,
      cronogramaCenter: f.cronogramaCenter || f.cronograma_center || undefined,
      cronogramaStartDate: f.cronogramaStartDate || f.cronograma_start_date || undefined,
      cronogramaTrainingStartDate: f.cronogramaTrainingStartDate || f.cronograma_training_start_date || undefined,
      cronogramaEndDate: f.cronogramaEndDate || f.cronograma_end_date || undefined,
      cronogramaDownloadUrl: f.cronogramaDownloadUrl || f.cronograma_download_url || undefined
  })) as Ficha[];
  if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
      localStorage.setItem(STORAGE_KEYS.FICHAS, JSON.stringify(migrated));
  }
  return migrated;
};

export const saveFichas = (fichas: Ficha[]) => {
  localStorage.setItem(STORAGE_KEYS.FICHAS, JSON.stringify(fichas));
  notifyChange();
};

export const addFicha = (ficha: Ficha) => {
  const current = getFichas();
  saveFichas([...current, ficha]);
  // Sync to cloud via Edge Function
  sendFichasToCloud([ficha]);
};

export const updateFicha = (updatedFicha: Ficha) => {
  const fichas = getFichas();
  const index = fichas.findIndex(f => f.id === updatedFicha.id);
  if (index !== -1) {
    fichas[index] = updatedFicha;
    saveFichas(fichas);
    // Sync to cloud via Edge Function
    sendFichasToCloud([updatedFicha]);
  }
};

export const deleteFicha = async (id: string) => {
  const fichas = getFichas();
  const fichaToDelete = fichas.find(f => f.id === id);
  if (!fichaToDelete) return;

  try {
      await deleteFichaFromCloud(id);
      
      const allStudents = getStudents();
      const studentsToDelete = allStudents.filter(s => s.group === fichaToDelete.code);
      const studentsToKeep = allStudents.filter(s => s.group !== fichaToDelete.code);
      
      // Delete attendance records for students in this ficha
      if (studentsToDelete.length > 0) {
          const studentIdsToDelete = new Set(studentsToDelete.map(s => s.id));
          const allAttendance = getAttendance();
          const attendanceToKeep = allAttendance.filter(record => !studentIdsToDelete.has(record.studentId));
          
          if (attendanceToKeep.length !== allAttendance.length) {
              localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceToKeep));
              notifyChange();
          }
      }
      
      // Delete students
      if (studentsToKeep.length !== allStudents.length) {
          saveStudents(studentsToKeep);
      }

      const updatedFichas = fichas.filter(f => f.id !== id);
      saveFichas(updatedFichas);
  } catch (error) {
      console.error("❌ Failed to delete ficha:", error);
  }
};

// --- SESSIONS (Authorized Dates) ---
export const getSessions = (): ClassSession[] => {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    let sessions: ClassSession[] = data ? JSON.parse(data) : [];

    // DATA REPAIR: Ensure all sessions have an ID. 
    let changed = false;
    sessions = sessions.map((s: any) => {
        if (!s.id) {
            s.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
            changed = true;
        }
        return s;
    });

    if (changed) {
        saveSessions(sessions);
    }
    
    return sessions;
};

export const saveSessions = (sessions: ClassSession[]) => {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    notifyChange();
};

export const addSession = (session: ClassSession) => {
    const current = getSessions();
    saveSessions([...current, session]);
    // Sync to cloud via Edge Function
    sendSessionsToCloud([session]);
};

export const deleteSession = async (id: string) => {
    if (!id) return; 

    // 1. GET DATA
    const sessions = getSessions();
    const idStr = String(id);
    const sessionToDelete = sessions.find(s => String(s.id) === idStr);

    // 2. DELETE SESSION FROM LOCAL STORAGE IMMEDIATELY
    // This ensures UI updates instantly even if cascade logic below takes time
    const updatedSessions = sessions.filter(s => String(s.id) !== idStr);
    saveSessions(updatedSessions); 
    
    // 3. DELETE ASSOCIATED ATTENDANCE (CASCADE)
    // We only proceed if we found the session details (to know date/group)
    if (sessionToDelete) {
        const students = getStudents();
        const attendance = getAttendance();
        const targetDate = sessionToDelete.date;
        const targetGroup = sessionToDelete.group;

        // Filter: Keep records that DO NOT match the deleted session
        const recordsToKeep = attendance.filter(record => {
             // If date doesn't match, keep it.
             if (record.date !== targetDate) return true;

             // Date matches. Now check group.
             
             // Case A: Session was for ALL groups. Delete ALL attendance on this date.
             if (targetGroup === 'Todas' || targetGroup === 'Todos') {
                 return false; // DELETE
             }

             // Case B: Session was for a specific group. 
             // Find the student for this record.
             const student = students.find(s => s.id === record.studentId);
             
             // If student found and is in the target group, delete record.
             if (student && (student.group === targetGroup)) {
                 return false; // DELETE
             }
             
             // Otherwise keep it (e.g. student in another group also had class this day)
             return true; 
        });

        // Save new attendance list locally if changes occurred
        if (attendance.length !== recordsToKeep.length) {
            localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(recordsToKeep));
            notifyChange();
        }

    }
    
    // 4. CLOUD DELETION (Async) - handled via Edge Function
    await deleteSessionFromCloud(idStr);
};

// --- GRADES ---
export const getGradeActivities = (): GradeActivity[] => {
    const data = localStorage.getItem(STORAGE_KEYS.GRADE_ACTIVITIES);
    const parsed = data ? JSON.parse(data) : [];
    const migrated = parsed.map((a: any) => ({
        ...a,
        phase: a.phase || 'Fase 1: Análisis',
        detail: a.detail || undefined
    }));
    if (migrated.length !== parsed.length || migrated.some((a: any, i: number) => a.phase !== parsed[i]?.phase)) {
        localStorage.setItem(STORAGE_KEYS.GRADE_ACTIVITIES, JSON.stringify(migrated));
    }
    return migrated;
};

export const saveGradeActivities = (activities: GradeActivity[]) => {
    localStorage.setItem(STORAGE_KEYS.GRADE_ACTIVITIES, JSON.stringify(activities));
    notifyChange();
};

export const addGradeActivity = (activity: GradeActivity) => {
    const current = getGradeActivities();
    saveGradeActivities([...current, activity]);
};

export const updateGradeActivity = (updated: GradeActivity) => {
    const current = getGradeActivities();
    const index = current.findIndex(a => a.id === updated.id);
    if (index !== -1) {
        current[index] = updated;
        saveGradeActivities(current);
    }
};

export const deleteGradeActivity = (activityId: string) => {
    const current = getGradeActivities().filter(a => a.id !== activityId);
    saveGradeActivities(current);
    const grades = getGrades().filter(g => g.activityId !== activityId);
    saveGrades(grades);
};

export const getGrades = (): GradeEntry[] => {
    const data = localStorage.getItem(STORAGE_KEYS.GRADES);
    return data ? JSON.parse(data) : [];
};

export const saveGrades = (grades: GradeEntry[]) => {
    localStorage.setItem(STORAGE_KEYS.GRADES, JSON.stringify(grades));
    notifyChange();
};

export const upsertGrades = (entries: GradeEntry[]) => {
    if (entries.length === 0) return;
    const current = getGrades();
    const updated = [...current];
    entries.forEach(entry => {
        const index = updated.findIndex(g => g.studentId === entry.studentId && g.activityId === entry.activityId);
        if (index !== -1) {
            updated[index] = entry;
        } else {
            updated.push(entry);
        }
    });
    saveGrades(updated);
};

export const deleteGradeEntry = (studentId: string, activityId: string) => {
    const current = getGrades();
    const updated = current.filter(g => !(g.studentId === studentId && g.activityId === activityId));
    if (updated.length !== current.length) {
        saveGrades(updated);
    }
};

// --- RAP NOTES ---
export type RapNotes = Record<string, Record<string, string>>;
export type RapColumns = Record<string, string[]>;

export const getRapNotes = (): RapNotes => {
    const data = localStorage.getItem(STORAGE_KEYS.RAP_NOTES);
    return data ? JSON.parse(data) : {};
};

export const saveRapNotes = (notes: RapNotes) => {
    localStorage.setItem(STORAGE_KEYS.RAP_NOTES, JSON.stringify(notes));
    notifyChange();
};

export const getRapColumns = (): RapColumns => {
    const data = localStorage.getItem(STORAGE_KEYS.RAP_COLUMNS);
    return data ? JSON.parse(data) : {};
};

export const saveRapColumns = (columns: RapColumns) => {
    localStorage.setItem(STORAGE_KEYS.RAP_COLUMNS, JSON.stringify(columns));
    notifyChange();
};

// --- STUDENT GRADE OBSERVATIONS (observaciones en detalle del aprendiz en Calificaciones) ---
export type StudentGradeObservations = Record<string, string>;

export const getStudentGradeObservations = (): StudentGradeObservations => {
    const data = localStorage.getItem(STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS);
    return data ? JSON.parse(data) : {};
};

export const saveStudentGradeObservations = (obs: StudentGradeObservations) => {
    localStorage.setItem(STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS, JSON.stringify(obs));
    notifyChange();
};

// Attendance
export const getAttendance = (): AttendanceRecord[] => {
  const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
  return data ? JSON.parse(data) : [];
};

export const saveAttendanceRecord = (date: string, studentId: string, present: boolean) => {
  const records = getAttendance();
  const filtered = records.filter(r => !(r.date === date && r.studentId === studentId));
  filtered.push({ date, studentId, present });
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(filtered));
  notifyChange();
  // Sync to cloud via Edge Function
  sendAttendanceToCloud([{ date, studentId, present }]);
};

export const bulkSaveAttendance = (recordsToSave: AttendanceRecord[]) => {
  let records = getAttendance();
  recordsToSave.forEach(newRecord => {
     records = records.filter(r => !(r.date === newRecord.date && r.studentId === newRecord.studentId));
     records.push(newRecord);
  });
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
  notifyChange();
  // Sync to cloud via Edge Function
  if (recordsToSave.length > 0) {
      sendAttendanceToCloud(recordsToSave);
  }
}

export const getAttendanceForDate = (date: string): AttendanceRecord[] => {
  return getAttendance().filter(r => r.date === date);
};

// Email Settings
export const getEmailSettings = (): EmailSettings => {
  const data = localStorage.getItem(STORAGE_KEYS.EMAIL_SETTINGS);
  return data ? JSON.parse(data) : { teacherName: '', teacherEmail: '', serviceId: '', templateId: '', publicKey: '' };
};

export const saveEmailSettings = (settings: EmailSettings) => {
  localStorage.setItem(STORAGE_KEYS.EMAIL_SETTINGS, JSON.stringify(settings));
};

// --- INSTRUCTOR PASSWORD SYSTEM (HASHED + CLOUD) ---

const getStoredInstructorHash = async (): Promise<string | null> => {
    let storedHash: string | null = null;
    const sb = getClient();
    if (sb) {
        const { data } = await sb.from('app_settings').select('value').eq('id', 'instructor_pwd_hash').single();
        if (data && data.value) {
            storedHash = data.value;
            localStorage.setItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH, storedHash);
        }
    }

    if (!storedHash) {
        storedHash = localStorage.getItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH);
    }

    return storedHash || null;
};

export const isInstructorPasswordSet = async (): Promise<boolean> => {
    try {
        const storedHash = await getStoredInstructorHash();
        return !!storedHash;
    } catch (e) {
        console.error("Password state check error:", e);
        return false;
    }
};

export const verifyInstructorPassword = async (inputPassword: string): Promise<boolean> => {
    const cleanInput = inputPassword.trim();

    try {
        const inputHash = await hashPassword(cleanInput);
        const storedHash = await getStoredInstructorHash();
        if (!storedHash) return false;

        // 3. Compare hash
        if (inputHash === storedHash) {
            return true;
        }

        // 4. Fallbacks for insecure contexts / defaults
        if (hashPasswordInsecure(cleanInput) === storedHash) {
            return true;
        }

        return false;

    } catch (e) {
        console.error("Password verification error:", e);
        // Fallback: if hash verification fails, return false for security
        return false;
    }
};

export const saveInstructorPassword = async (newPassword: string) => {
    const cleanPass = newPassword.trim();
    const newHash = await hashPassword(cleanPass);
    
    // Save Local Cache only
    // Password hash sync to cloud should be handled via Edge Function if needed
    localStorage.setItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH, newHash);
    notifyChange();
};

// Supabase Configuration Check (Environment Variables Only)
export const isSupabaseConfigured = (): boolean => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && !!key;
};

// --- SYNC ENGINE ---

// Subscribe to Realtime Changes
let realtimeChannel: RealtimeChannel | null = null;

export const subscribeToRealtime = () => {
    const client = getClient();
    if (!client) return;

    if (realtimeChannel) {
        return; // Already subscribed
    }

    console.log("Initializing Realtime Subscription (attendance only)...");
    
    // Limit Realtime to attendance table only
    realtimeChannel = client.channel('attendance-changes')
        .on(
            'postgres_changes', 
            { 
                event: '*', 
                schema: 'public',
                table: 'attendance'
            }, 
            (payload) => {
                console.log("Realtime attendance change detected:", payload);
                // Only sync attendance from cloud
                syncAttendanceFromCloud();
            }
        )
        .subscribe();
};

// Sync attendance from cloud (used by Realtime)
const syncAttendanceFromCloud = async () => {
    const client = getClient();
    if (!client) return;

    try {
        const { data: a } = await client.from('attendance').select('*');
        if (a) {
             const mappedAtt = a.map((x: any) => ({ date: x.date, studentId: x.student_id, present: x.present }));
             localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(mappedAtt));
             notifyChange();
        }
    } catch (e) {
        console.error("Attendance sync failed", e);
    }
};

// Full sync from cloud (for manual sync operations)
export const syncFromCloud = async () => {
    const client = getClient();
    if (!client) return;

    try {
        console.log("Syncing from Cloud...");
        
        // Fichas
        const { data: f } = await client.from('fichas').select('*');
        if (f) {
             const mappedFichas = f.map((x: any) => ({
                 id: x.id,
                 code: x.code,
                 program: x.program,
                 description: x.description,
                 cronogramaProgramName: x.cronograma_program_name || undefined,
                 cronogramaCenter: x.cronograma_center || undefined,
                 cronogramaStartDate: x.cronograma_start_date || undefined,
                 cronogramaTrainingStartDate: x.cronograma_training_start_date || undefined,
                 cronogramaEndDate: x.cronograma_end_date || undefined,
                 cronogramaDownloadUrl: x.cronograma_download_url || undefined
             }));
             saveFichas(mappedFichas);
        }

        // Sessions
        const { data: sess } = await client.from('sessions').select('*');
        if (sess) {
            const mappedSessions = sess.map((x: any) => ({ id: x.id, date: x.date, group: x.group, description: x.description }));
            saveSessions(mappedSessions);
        }

        // Students
        const { data: s } = await client.from('students').select('*').eq('active', true);
        if (s) {
            const mappedStudents = s.map((x: any) => ({ 
                id: x.id, 
                documentNumber: x.document_number, 
                firstName: x.first_name || '',
                lastName: x.last_name || '',
                email: x.email, 
                active: x.active, 
                group: x.group,
                status: x.status || 'Formación',
                description: x.description || undefined
            }));
            saveStudents(mappedStudents);
        }

        // Attendance
        await syncAttendanceFromCloud();

        // Settings (Password Hash)
        const { data: p } = await client.from('app_settings').select('value').eq('id', 'instructor_pwd_hash').single();
        if (p && p.value) {
            localStorage.setItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH, p.value);
        }

    } catch (e) {
        console.error("Auto-sync failed", e);
    }
};

// --- BACKUP & RESTORE SYSTEM ---
export interface AppBackup {
    version: number;
    timestamp: string;
    data: {
        students: Student[];
        fichas: Ficha[];
        attendance: AttendanceRecord[];
        sessions: ClassSession[];
        emailSettings: EmailSettings;
        gradeActivities: GradeActivity[];
        grades: GradeEntry[];
        rapNotes: RapNotes;
        rapColumns: RapColumns;
        studentGradeObservations?: StudentGradeObservations;
    };
}

export const exportFullBackup = (): string => {
    const backup: AppBackup = {
        version: 1,
        timestamp: new Date().toISOString(),
        data: {
            students: getStudents(),
            fichas: getFichas(),
            attendance: getAttendance(),
            sessions: getSessions(),
            emailSettings: getEmailSettings(),
            gradeActivities: getGradeActivities(),
            grades: getGrades(),
            rapNotes: getRapNotes(),
            rapColumns: getRapColumns(),
            studentGradeObservations: getStudentGradeObservations()
        }
    };
    return JSON.stringify(backup, null, 2);
};

export const importFullBackup = (jsonString: string): boolean => {
    try {
        const backup: AppBackup = JSON.parse(jsonString);
        if (!backup.data || !Array.isArray(backup.data.students)) throw new Error("Invalid backup format");

        const migratedStudents = backup.data.students.map((s: any) => {
             // Shim to handle backup format variations
             if (s.firstName !== undefined) {
                 return {
                     ...s,
                     status: s.status || s.estado || 'Formación',
                     description: s.description || s.descripcion || undefined,
                     estado: undefined,
                     descripcion: undefined
                 };
             }
             
             // Check for snake case in backup
             if (s.first_name !== undefined) {
                 return { 
                     ...s, 
                     firstName: s.first_name, 
                     lastName: s.last_name, 
                     first_name: undefined, 
                     last_name: undefined,
                     status: s.status || s.estado || 'Formación',
                     description: s.description || s.descripcion || undefined,
                     estado: undefined,
                     descripcion: undefined
                 };
             }

             const parts = (s.name || '').split(' ');
             const lastName = parts.length > 1 ? parts.pop() : '';
             const firstName = parts.join(' ');
             return { 
                 ...s, 
                 firstName, 
                 lastName, 
                 name: undefined,
                 status: s.status || s.estado || 'Formación',
                 description: s.description || s.descripcion || undefined,
                 estado: undefined,
                 descripcion: undefined
             };
        });

        saveStudents(migratedStudents);
        saveFichas(backup.data.fichas || []);
        saveSessions(backup.data.sessions || []);
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(backup.data.attendance || []));
        notifyChange();
        
        saveEmailSettings(backup.data.emailSettings || { teacherName: '', teacherEmail: '', serviceId: '', templateId: '', publicKey: '' });
        saveGradeActivities(backup.data.gradeActivities || []);
        saveGrades(backup.data.grades || []);
        saveRapNotes(backup.data.rapNotes || {});
        saveRapColumns(backup.data.rapColumns || {});
        if (backup.data.studentGradeObservations) {
            saveStudentGradeObservations(backup.data.studentGradeObservations);
        }
        return true;
    } catch (e) {
        console.error("Import failed", e);
        return false;
    }
};

export const clearDatabase = () => {
    localStorage.removeItem(STORAGE_KEYS.STUDENTS);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.FICHAS);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.EMAIL_SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.GRADE_ACTIVITIES);
    localStorage.removeItem(STORAGE_KEYS.GRADES);
    localStorage.removeItem(STORAGE_KEYS.RAP_NOTES);
    localStorage.removeItem(STORAGE_KEYS.RAP_COLUMNS);
    localStorage.removeItem(STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS);
    // Don't remove password hash to avoid lockout
    notifyChange();
};