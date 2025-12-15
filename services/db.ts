import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Student, Ficha, AttendanceRecord, EmailDraft, EmailSettings, ClassSession } from '../types';

const STORAGE_KEYS = {
  STUDENTS: 'asistenciapro_students',
  FICHAS: 'asistenciapro_fichas',
  ATTENDANCE: 'asistenciapro_attendance',
  SESSIONS: 'asistenciapro_sessions',
  DRAFTS: 'asistenciapro_drafts',
  EMAIL_SETTINGS: 'asistenciapro_email_settings',
  INSTRUCTOR_PWD_HASH: 'asistenciapro_instructor_password_hash',
};

const DB_EVENT_NAME = 'asistenciapro-storage-update';

const notifyChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DB_EVENT_NAME));
  }
};

// --- CRYPTO HELPERS (SHA-256) ---
// Default Password Hash (SHA-256 for "AdminSecure2024!")
const DEFAULT_HASH_SHA256 = "d7d10f84852928373a0b5e406322810817454f358392147321685044ca57b3f9";

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
    let hash = 0;
    for (let i = 0; i < plainText.length; i++) {
        const char = plainText.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return "insecure_" + hash.toString(16);
};

// --- EDGE FUNCTIONS (WRITE OPERATIONS) ---
// All write operations to Supabase go through Edge Functions for security

export const sendAttendanceToCloud = async (records: AttendanceRecord[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    if (!edgeUrl) {
        console.warn("VITE_SUPABASE_EDGE_URL not configured, skipping cloud sync");
        return;
    }

    try {
        const payload = records.map(r => ({
            date: r.date,
            student_id: r.studentId,
            present: r.present
        }));

        const response = await fetch(`${edgeUrl}/save-attendance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: payload })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error("Failed to sync attendance to cloud:", error);
        throw error;
    }
};

export const sendStudentsToCloud = async (students: Student[]): Promise<void> => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    if (!edgeUrl) {
        console.warn("VITE_SUPABASE_EDGE_URL not configured, skipping cloud sync");
        return;
    }

    try {
        const payload = students.map(s => ({
            id: s.id,
            document_number: s.documentNumber,
            first_name: s.firstName,
            last_name: s.lastName,
            email: s.email,
            active: s.active,
            group: s.group
        }));

        const response = await fetch(`${edgeUrl}/save-students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ students: payload })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error("Failed to sync students to cloud:", error);
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
      if (s.firstName !== undefined) return s as Student;
      
      // Case 2: Snake_case from DB raw sync (Fix for the bug)
      if (s.first_name !== undefined) {
          return { 
              ...s, 
              firstName: s.first_name, 
              lastName: s.last_name, 
              first_name: undefined, 
              last_name: undefined 
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
      return { ...s, firstName, lastName, name: undefined } as Student;
  });
  return migrated;
};

export const saveStudents = (students: Student[]) => {
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  notifyChange();
};

export const addStudent = (student: Student) => {
  const current = getStudents();
  saveStudents([...current, student]);
  // Sync to cloud via Edge Function
  sendStudentsToCloud([student]).catch(err => console.error("Cloud Sync Error:", err));
};

export const bulkAddStudents = (newStudents: Student[]) => {
    const current = getStudents();
    saveStudents([...current, ...newStudents]);
    // Sync to cloud via Edge Function
    if (newStudents.length > 0) {
        sendStudentsToCloud(newStudents).catch(err => console.error("Cloud Sync Error:", err));
    }
};

export const updateStudent = (updatedStudent: Student) => {
  const students = getStudents();
  const index = students.findIndex(s => s.id === updatedStudent.id);
  if (index !== -1) {
    students[index] = updatedStudent;
    saveStudents(students);
    // Sync to cloud via Edge Function
    sendStudentsToCloud([updatedStudent]).catch(err => console.error("Cloud Sync Error:", err));
  }
};

export const deleteStudent = (id: string) => {
  const current = getStudents();
  const updated = current.filter(s => s.id !== id);
  saveStudents(updated);
  // Note: Delete operations should be handled via Edge Function if needed
  // For now, we only sync existing students, deletions are handled by syncing the updated list
  sendStudentsToCloud(updated).catch(err => console.error("Cloud Sync Error:", err));
};

// Fichas
export const getFichas = (): Ficha[] => {
  const data = localStorage.getItem(STORAGE_KEYS.FICHAS);
  if (!data) {
     return []; // Return empty if nothing exists
  }
  return JSON.parse(data);
};

export const saveFichas = (fichas: Ficha[]) => {
  localStorage.setItem(STORAGE_KEYS.FICHAS, JSON.stringify(fichas));
  notifyChange();
};

export const addFicha = (ficha: Ficha) => {
  const current = getFichas();
  saveFichas([...current, ficha]);
  // Fichas are read-only from cloud, no write operations needed
};

export const updateFicha = (updatedFicha: Ficha) => {
  const fichas = getFichas();
  const index = fichas.findIndex(f => f.id === updatedFicha.id);
  if (index !== -1) {
    fichas[index] = updatedFicha;
    saveFichas(fichas);
    // Fichas are read-only from cloud, no write operations needed
  }
};

export const deleteFicha = (id: string) => {
  const fichas = getFichas();
  const fichaToDelete = fichas.find(f => f.id === id);
  if (fichaToDelete) {
    const allStudents = getStudents();
    const studentsToKeep = allStudents.filter(s => s.group !== fichaToDelete.code);
    saveStudents(studentsToKeep);
    // Sync updated students list to cloud
    sendStudentsToCloud(studentsToKeep).catch(err => console.error("Cloud Sync Error:", err));
  }
  saveFichas(fichas.filter(f => f.id !== id));
  // Fichas are read-only from cloud, no write operations needed
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
    // Sessions are read-only from cloud, no write operations needed
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

        // 4. CLOUD DELETION (Async) - handled via Edge Functions if needed
        // For now, we sync the updated attendance records
        if (attendance.length !== recordsToKeep.length) {
            sendAttendanceToCloud(recordsToKeep).catch(err => console.error("Cloud Sync Error:", err));
        }
    }
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
  sendAttendanceToCloud([{ date, studentId, present }]).catch(err => console.error("Cloud Sync Error:", err));
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
      sendAttendanceToCloud(recordsToSave).catch(err => console.error("Cloud Sync Error:", err));
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

export const verifyInstructorPassword = async (inputPassword: string): Promise<boolean> => {
    const cleanInput = inputPassword.trim();

    try {
        const inputHash = await hashPassword(cleanInput);
        
        // 1. Get Stored Hash (Cloud -> Local)
        let storedHash = null;
        
        // Try Cloud
        const sb = getClient();
        if (sb) {
            const { data } = await sb.from('app_settings').select('value').eq('id', 'instructor_pwd_hash').single();
            if (data && data.value) {
                storedHash = data.value;
                localStorage.setItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH, storedHash);
            }
        }
        
        // Try Local if Cloud failed or empty
        if (!storedHash) {
            storedHash = localStorage.getItem(STORAGE_KEYS.INSTRUCTOR_PWD_HASH);
        }

        // 2. Logic to verify
        // If no stored password exists, we check against default
        

        // If stored password exists, compare hash
        if (inputHash === storedHash) {
            return true;
        }

        // 3. Fallback / Recovery for Default Password
        

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
             const mappedFichas = f.map((x: any) => ({ id: x.id, code: x.code, program: x.program, description: x.description }));
             saveFichas(mappedFichas);
        }

        // Sessions
        const { data: sess } = await client.from('sessions').select('*');
        if (sess) {
            const mappedSessions = sess.map((x: any) => ({ id: x.id, date: x.date, group: x.group, description: x.description }));
            saveSessions(mappedSessions);
        }

        // Students
        const { data: s } = await client.from('students').select('*');
        if (s) {
            const mappedStudents = s.map((x: any) => ({ 
                id: x.id, 
                documentNumber: x.document_number, 
                firstName: x.first_name || '',
                lastName: x.last_name || '',
                email: x.email, 
                active: x.active, 
                group: x.group 
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
            emailSettings: getEmailSettings()
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
             if (s.firstName !== undefined) return s;
             
             // Check for snake case in backup
             if (s.first_name !== undefined) {
                 return { ...s, firstName: s.first_name, lastName: s.last_name, first_name: undefined, last_name: undefined };
             }

             const parts = (s.name || '').split(' ');
             const lastName = parts.length > 1 ? parts.pop() : '';
             const firstName = parts.join(' ');
             return { ...s, firstName, lastName, name: undefined };
        });

        saveStudents(migratedStudents);
        saveFichas(backup.data.fichas || []);
        saveSessions(backup.data.sessions || []);
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(backup.data.attendance || []));
        notifyChange();
        
        saveEmailSettings(backup.data.emailSettings || { teacherName: '', teacherEmail: '', serviceId: '', templateId: '', publicKey: '' });
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
    // Don't remove password hash to avoid lockout
    notifyChange();
};