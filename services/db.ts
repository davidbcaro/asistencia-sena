import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Student, Ficha, AttendanceRecord, EmailDraft, EmailSettings, ClassSession, GradeActivity, GradeEntry, RapDefinition, JuicioRapEntry, JuicioRapHistoryEntry, PlaneacionSemanalData } from '../types';

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
  JUICIOS_EVALUATIVOS: 'asistenciapro_juicios_evaluativos',
  LMS_LAST_ACCESS: 'asistenciapro_lms_last_access',
  DEBIDO_PROCESO: 'asistenciapro_debido_proceso',
  RETIRO_VOLUNTARIO: 'asistenciapro_retiro_voluntario',
  PLAN_MEJORAMIENTO: 'asistenciapro_plan_mejoramiento',
  SOFIA_RAP_DEFS: 'asistenciapro_sofia_rap_defs',
  SOFIA_JUICIO_ENTRIES: 'asistenciapro_sofia_juicio_entries',
  SOFIA_JUICIO_HISTORY: 'asistenciapro_sofia_juicio_history',
  SOFIA_STUDENT_ESTADOS: 'asistenciapro_sofia_student_estados',
  EVIDENCE_COMP_MAP: 'asistenciapro_evidence_comp_map',
  PMA_DETAILS: 'asistenciapro_pma_details',
  CANCELACION_DETAILS: 'asistenciapro_cancelacion_details',
  RETIRO_DETAILS: 'asistenciapro_retiro_details',
  HIDDEN_GRADE_ACTIVITIES: 'asistenciapro_hidden_grade_activities',
  PLANEACION_SEMANAL: 'asistenciapro_planeacion_semanal',
};

const DB_EVENT_NAME = 'asistenciapro-storage-update';

const notifyChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DB_EVENT_NAME));
  }
};

// ─── APP_DATA CLOUD SYNC ────────────────────────────────────────────────────

/** Maps cloud key → localStorage key for app_data table sync */
const APP_DATA_SYNC_KEYS: Record<string, string> = {
  grade_activities:            STORAGE_KEYS.GRADE_ACTIVITIES,
  grades:                      STORAGE_KEYS.GRADES,
  rap_notes:                   STORAGE_KEYS.RAP_NOTES,
  rap_columns:                 STORAGE_KEYS.RAP_COLUMNS,
  student_grade_observations:  STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS,
  juicios_evaluativos:         STORAGE_KEYS.JUICIOS_EVALUATIVOS,
  lms_last_access:             STORAGE_KEYS.LMS_LAST_ACCESS,
  debido_proceso:              STORAGE_KEYS.DEBIDO_PROCESO,
  retiro_voluntario:           STORAGE_KEYS.RETIRO_VOLUNTARIO,
  plan_mejoramiento:           STORAGE_KEYS.PLAN_MEJORAMIENTO,
  pma_details:                 STORAGE_KEYS.PMA_DETAILS,
  cancelacion_details:         STORAGE_KEYS.CANCELACION_DETAILS,
  retiro_details:              STORAGE_KEYS.RETIRO_DETAILS,
  evidence_comp_map:           STORAGE_KEYS.EVIDENCE_COMP_MAP,
  sofia_rap_defs:              STORAGE_KEYS.SOFIA_RAP_DEFS,
  sofia_juicio_entries:        STORAGE_KEYS.SOFIA_JUICIO_ENTRIES,
  sofia_juicio_history:        STORAGE_KEYS.SOFIA_JUICIO_HISTORY,
  sofia_student_estados:       STORAGE_KEYS.SOFIA_STUDENT_ESTADOS,
  hidden_grade_activities:     STORAGE_KEYS.HIDDEN_GRADE_ACTIVITIES,
  planeacion_semanal:          STORAGE_KEYS.PLANEACION_SEMANAL,
};

const _isEmptyValue = (raw: string | null | undefined): boolean =>
  !raw || raw === 'null' || raw === '[]' || raw === '{}' || raw === '' || raw === 'undefined';

/**
 * Keys whose cloud values should be MERGED (additive union) with local values
 * instead of the default "local wins if non-empty" strategy.
 * This ensures data uploaded from Computer A is never silently overwritten by
 * Computer B opening the app with its own older local copy.
 */
const ADDITIVE_MERGE_KEYS = new Set([
  'sofia_rap_defs',
  'sofia_juicio_entries',
  'sofia_juicio_history',
  'sofia_student_estados',
  'grades',
  'grade_activities',
  'hidden_grade_activities',
  'planeacion_semanal',
]);

/**
 * Merge a local value with a cloud value for an additive-sync key.
 * - Record types: union of all keys; where both sides have the same key,
 *   keep the entry whose `updatedAt` is more recent (or local if no timestamp).
 * - Array types (history): union deduplicated by `historyId`.
 */
const _mergeAdditiveKey = (key: string, local: unknown, cloud: unknown): unknown => {
  try {
    if (key === 'sofia_juicio_history') {
      // Array<JuicioRapHistoryEntry> – union by historyId
      const cloudArr = Array.isArray(cloud) ? (cloud as Array<{ historyId: string }>) : [];
      const localArr = Array.isArray(local) ? (local as Array<{ historyId: string }>) : [];
      const seen = new Set(cloudArr.map(e => e.historyId));
      const extras = localArr.filter(e => !seen.has(e.historyId));
      return [...cloudArr, ...extras];
    }

    // All other sofia keys are Record<string, object>
    const cloudObj = (cloud && typeof cloud === 'object' && !Array.isArray(cloud))
      ? (cloud as Record<string, unknown>) : {};
    const localObj = (local && typeof local === 'object' && !Array.isArray(local))
      ? (local as Record<string, unknown>) : {};

    if (key === 'sofia_juicio_entries') {
      // Record<`${studentId}-${rapId}`, JuicioRapEntry> – keep entry with later updatedAt
      const merged: Record<string, unknown> = { ...cloudObj };
      Object.entries(localObj).forEach(([k, localEntry]) => {
        const cloudEntry = merged[k] as { updatedAt?: string } | undefined;
        const localTs = (localEntry as { updatedAt?: string })?.updatedAt ?? '';
        const cloudTs = cloudEntry?.updatedAt ?? '';
        if (!cloudEntry || localTs > cloudTs) merged[k] = localEntry;
      });
      return merged;
    }

    if (key === 'sofia_rap_defs') {
      // Record<rapId, RapDefinition> – simple union (cloud fills gaps, local additions survive)
      return { ...cloudObj, ...localObj };
    }

    if (key === 'sofia_student_estados') {
      // Record<studentId, string> – cloud wins per key (most recent upload source)
      return { ...localObj, ...cloudObj };
    }
  } catch {
    // On any parse/merge error, fall back to local
  }

  try {
    if (key === 'grades') {
      // Array<GradeEntry {studentId, activityId, score, letter, updatedAt}>
      // Merge by studentId+activityId, keep the entry with the later updatedAt
      const cloudArr = Array.isArray(cloud) ? (cloud as Array<{ studentId: string; activityId: string; updatedAt?: string }>) : [];
      const localArr = Array.isArray(local) ? (local as Array<{ studentId: string; activityId: string; updatedAt?: string }>) : [];
      const map = new Map<string, typeof cloudArr[0]>();
      cloudArr.forEach(e => map.set(`${e.studentId}-${e.activityId}`, e));
      localArr.forEach(e => {
        const k = `${e.studentId}-${e.activityId}`;
        const existing = map.get(k);
        if (!existing || (e.updatedAt ?? '') > (existing.updatedAt ?? '')) map.set(k, e);
      });
      return Array.from(map.values());
    }

    if (key === 'grade_activities') {
      // Array<GradeActivity {id, name, group, phase, ...createdAt}>
      // Union by id — keep all activities from both sides; if same id, local wins
      const cloudArr = Array.isArray(cloud) ? (cloud as Array<{ id: string }>) : [];
      const localArr = Array.isArray(local) ? (local as Array<{ id: string }>) : [];
      const map = new Map<string, typeof cloudArr[0]>();
      cloudArr.forEach(e => map.set(e.id, e));
      localArr.forEach(e => map.set(e.id, e)); // local wins on conflict
      return Array.from(map.values());
    }

    if (key === 'hidden_grade_activities') {
      // Array<string> of activity IDs — union: if hidden on any device, stays hidden
      const cloudArr = Array.isArray(cloud) ? (cloud as string[]) : [];
      const localArr = Array.isArray(local) ? (local as string[]) : [];
      return Array.from(new Set([...cloudArr, ...localArr]));
    }

    if (key === 'planeacion_semanal') {
      // Record<fichaId, PlaneacionSemanalFichaData>
      // Deep merge per fichaId: local wins per individual assignment/cell key
      type FichaData = {
        tecnicaAssignments?: Record<string, number>;
        transversalCells?: Record<string, string[]>;
        cardDurations?: Record<string, 1 | 2>;
        hiddenCards?: string[];
      };
      const cloudRec = (cloud && typeof cloud === 'object' && !Array.isArray(cloud))
        ? (cloud as Record<string, FichaData>) : {};
      const localRec = (local && typeof local === 'object' && !Array.isArray(local))
        ? (local as Record<string, FichaData>) : {};
      const merged: Record<string, FichaData> = { ...cloudRec };
      Object.entries(localRec).forEach(([fichaId, localFicha]) => {
        const cloudFicha = merged[fichaId] ?? {};
        merged[fichaId] = {
          tecnicaAssignments: { ...(cloudFicha.tecnicaAssignments ?? {}), ...(localFicha.tecnicaAssignments ?? {}) },
          transversalCells:   { ...(cloudFicha.transversalCells   ?? {}), ...(localFicha.transversalCells   ?? {}) },
          cardDurations:      { ...(cloudFicha.cardDurations       ?? {}), ...(localFicha.cardDurations       ?? {}) },
          hiddenCards: Array.from(new Set([...(cloudFicha.hiddenCards ?? []), ...(localFicha.hiddenCards ?? [])])),
        };
      });
      return merged;
    }
  } catch {
    // On any parse/merge error, fall back to local
  }

  return local;
};

/** Safe JSON.parse — returns fallback on any parse error (e.g. when localStorage has "undefined" string) */
const safeParseJSON = <T>(raw: string | null | undefined, fallback: T): T => {
  if (_isEmptyValue(raw)) return fallback;
  try { return JSON.parse(raw as string) as T; }
  catch { return fallback; }
};

/** Remove corrupt localStorage values ("undefined" string) for all managed keys */
const _cleanupCorruptLocalStorage = (): void => {
  Object.values(APP_DATA_SYNC_KEYS).forEach(storageKey => {
    const val = localStorage.getItem(storageKey);
    if (val === 'undefined') {
      console.warn(`[Storage] Removing corrupt value "undefined" from key: ${storageKey}`);
      localStorage.removeItem(storageKey);
    }
  });
};

/** Debounced timers per cloud key */
const _cloudTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Timestamp (ms) of the last LOCAL write for each storageKey.
 * Used by the Realtime listener to avoid overwriting freshly-written local data
 * with a stale echo from the cloud (race-condition guard).
 * Grace window: 15 seconds after a local write, Realtime events for that key are ignored.
 */
const _localLastWrite: Record<string, number> = {};
const REALTIME_GRACE_MS = 15_000;

/** Mark a storageKey as recently written locally so the Realtime echo is ignored. */
const _markLocalWrite = (storageKey: string): void => {
  _localLastWrite[storageKey] = Date.now();
};

/** Fire-and-forget: upsert a single key into app_data via Edge Function (debounced 400ms).
 *  IMPORTANT: skips upload if value serializes to an empty array/object — prevents
 *  accidentally overwriting real cloud data with empty local state.
 */
const callSaveAppData = (cloudKey: string, value: unknown): void => {
  // Guard: never upload empty values to the cloud
  const serialized = JSON.stringify(value);
  if (_isEmptyValue(serialized)) return;

  // Mark the corresponding storageKey as recently written so the Realtime echo is ignored
  const storageKeyForCloud = APP_DATA_SYNC_KEYS[cloudKey];
  if (storageKeyForCloud) _markLocalWrite(storageKeyForCloud);

  clearTimeout(_cloudTimers[cloudKey]);
  _cloudTimers[cloudKey] = setTimeout(async () => {
    const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!edgeUrl || !anonKey) return;
    try {
      const res = await fetch(`${edgeUrl}/save-app-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ key: cloudKey, value }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn('[AppData] cloud write failed for key:', cloudKey, res.status, txt);
      }
    } catch (e) {
      console.warn('[AppData] cloud write failed for key:', cloudKey, e);
    }
  }, 400);
};

/** Fetch all rows from app_data via Edge Function (service_role — bypasses RLS).
 *  @param force  When true: cloud always wins (overwrites local regardless of content).
 *                When false (default): local wins if it already has data.
 *  Always dispatches 'asistenciapro-storage-update' so views reload.
 */
export const syncAppDataFromCloud = async (force = false): Promise<void> => {
  const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!edgeUrl || !anonKey) {
    console.warn('[AppData] syncAppDataFromCloud: env vars missing');
    window.dispatchEvent(new Event('asistenciapro-storage-update'));
    return;
  }
  try {
    const res = await fetch(`${edgeUrl}/save-app-data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[AppData] syncAppDataFromCloud HTTP error:', res.status, txt);
      window.dispatchEvent(new Event('asistenciapro-storage-update'));
      return;
    }
    const data: Array<{ key: string; value_json: unknown }> = await res.json();
    console.log(`[AppData] syncAppDataFromCloud: fetched ${data.length} rows (force=${force})`);
    let restored = 0;
    data.forEach(({ key, value_json }) => {
      const storageKey = APP_DATA_SYNC_KEYS[key];
      if (!storageKey) return;
      const local = localStorage.getItem(storageKey);
      const incoming = JSON.stringify(value_json);

      // force=true → always overwrite. force=false → only overwrite if local is empty.
      if (force || _isEmptyValue(local)) {
        // Never restore an explicitly empty value from cloud (would erase real local data)
        if (!force && _isEmptyValue(incoming)) return;
        localStorage.setItem(storageKey, incoming);
        restored++;
        console.log(`[AppData] ${force ? 'force-restored' : 'restored'} key "${key}" from cloud`);
      } else if (!force && ADDITIVE_MERGE_KEYS.has(key) && !_isEmptyValue(incoming)) {
        // Additive-merge keys: combine local + cloud so data from multiple machines is preserved.
        // This prevents Computer B from silently overwriting Computer A's Sofia uploads.
        try {
          const localParsed = JSON.parse(local!);
          const merged = _mergeAdditiveKey(key, localParsed, value_json);
          const mergedStr = JSON.stringify(merged);
          if (mergedStr !== local) {
            localStorage.setItem(storageKey, mergedStr);
            restored++;
            console.log(`[AppData] merged (additive) key "${key}" from cloud`);
          }
        } catch {
          // Parse error: keep local unchanged
        }
      }
    });
    console.log(`[AppData] syncAppDataFromCloud done: ${restored} keys written to localStorage`);
  } catch (e) {
    console.error('[AppData] syncAppDataFromCloud exception:', e);
  }
  // Always dispatch — views must reload after every sync attempt
  window.dispatchEvent(new Event('asistenciapro-storage-update'));
};

/** Force-download ALL app_data keys from cloud, overwriting whatever is in localStorage.
 *  Use this for disaster recovery when local data is lost or corrupted.
 *  Returns the number of keys restored, or -1 on error.
 */
export const forceDownloadAppDataFromCloud = async (): Promise<number> => {
  _cleanupCorruptLocalStorage();
  const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!edgeUrl || !anonKey) return -1;
  try {
    const res = await fetch(`${edgeUrl}/save-app-data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[AppData] forceDownload HTTP error:', res.status, txt);
      return -1;
    }
    const data: Array<{ key: string; value_json: unknown }> = await res.json();
    let count = 0;
    console.log(`[AppData] forceDownload: received ${data.length} keys from cloud`);
    data.forEach(({ key, value_json }) => {
      const storageKey = APP_DATA_SYNC_KEYS[key];
      if (!storageKey) return;
      const incoming = JSON.stringify(value_json);
      // Diagnostic log for critical keys
      if (key === 'grades' || key === 'grade_activities') {
        const len = Array.isArray(value_json) ? (value_json as unknown[]).length : typeof value_json;
        console.log(`[AppData] forceDownload cloud["${key}"] → ${len} items, empty=${_isEmptyValue(incoming)}`);
      }
      // Only restore non-empty values — never overwrite with cloud empty data
      if (_isEmptyValue(incoming)) {
        console.warn(`[AppData] forceDownload: cloud key "${key}" is empty — skipping`);
        return;
      }
      localStorage.setItem(storageKey, incoming);
      count++;
      console.log(`[AppData] forceDownload: restored key "${key}"`);
    });
    console.log(`[AppData] forceDownload done: ${count} keys restored from cloud`);
    window.dispatchEvent(new Event('asistenciapro-storage-update'));
    return count;
  } catch (e) {
    console.error('[AppData] forceDownload exception:', e);
    return -1;
  }
};

/** Upload all non-empty localStorage keys to app_data.
 *  Returns the number of keys actually uploaded, or -1 on error.
 */
export const uploadLocalAppDataToCloud = async (): Promise<number> => {
  const edgeUrl = import.meta.env.VITE_SUPABASE_EDGE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!edgeUrl || !anonKey) { console.warn('[AppData] Supabase env vars not set — skipping upload'); return 0; }
  const entries: Array<{ key: string; value: unknown }> = [];
  Object.entries(APP_DATA_SYNC_KEYS).forEach(([cloudKey, storageKey]) => {
    const raw = localStorage.getItem(storageKey);
    if (_isEmptyValue(raw)) return;
    try { entries.push({ key: cloudKey, value: JSON.parse(raw!) }); }
    catch { /* skip malformed */ }
  });
  if (entries.length === 0) {
    console.log('[AppData] nothing to upload (all localStorage keys are empty)');
    return 0;
  }
  try {
    console.log('[AppData] uploading', entries.length, 'keys:', entries.map(e => e.key));
    const res = await fetch(`${edgeUrl}/save-app-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[AppData] upload FAILED:', res.status, txt);
      return -1;
    }
    const json = await res.json();
    console.log('[AppData] uploaded', entries.length, 'keys to cloud ✅', json);
    return entries.length;
  } catch (e) {
    console.error('[AppData] uploadLocalAppDataToCloud network error:', e);
    return -1;
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
            description: s.description || null,
            username: s.username || null,
            is_vocero: s.isVocero ?? false,
            is_vocero_suplente: s.isVoceroSuplente ?? false
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

// LMS Last Access (studentId -> lastAccessDate YYYY-MM-DD)
export const getLmsLastAccess = (): Record<string, string> => {
  const data = localStorage.getItem(STORAGE_KEYS.LMS_LAST_ACCESS);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

export const saveLmsLastAccess = (data: Record<string, string>) => {
  localStorage.setItem(STORAGE_KEYS.LMS_LAST_ACCESS, JSON.stringify(data));
  notifyChange();
  callSaveAppData('lms_last_access', data);
};

// --- Debido proceso (estado por aprendiz: 0-5, 0 = Sin novedad) ---
export type DebidoProcesoState = Record<string, number>; // studentId -> step 0..5

export const getDebidoProcesoState = (): DebidoProcesoState => {
  const data = localStorage.getItem(STORAGE_KEYS.DEBIDO_PROCESO);
  if (!data) return {};
  try {
    const raw = JSON.parse(data);
    const out: DebidoProcesoState = {};
    Object.keys(raw).forEach((id) => {
      const n = Number(raw[id]);
      if (n >= 0 && n <= 5) out[id] = Math.floor(n);
    });
    return out;
  } catch {
    return {};
  }
};

export const saveDebidoProcesoState = (state: DebidoProcesoState) => {
  localStorage.setItem(STORAGE_KEYS.DEBIDO_PROCESO, JSON.stringify(state));
  notifyChange();
  callSaveAppData('debido_proceso', state);
};

export const saveDebidoProcesoStep = (studentId: string, step: number) => {
  const state = getDebidoProcesoState();
  const s = Math.min(5, Math.max(0, Math.floor(step)));
  state[studentId] = s;
  saveDebidoProcesoState(state);
};

// --- Retiro voluntario (estado por aprendiz: 1-5) ---
export type RetiroVoluntarioState = Record<string, number>; // studentId -> step 1..5

export const getRetiroVoluntarioState = (): RetiroVoluntarioState => {
  const data = localStorage.getItem(STORAGE_KEYS.RETIRO_VOLUNTARIO);
  if (!data) return {};
  try {
    const raw = JSON.parse(data);
    const out: RetiroVoluntarioState = {};
    Object.keys(raw).forEach((id) => {
      const n = Number(raw[id]);
      if (n >= 1 && n <= 5) out[id] = Math.floor(n);
    });
    return out;
  } catch {
    return {};
  }
};

export const saveRetiroVoluntarioState = (state: RetiroVoluntarioState) => {
  localStorage.setItem(STORAGE_KEYS.RETIRO_VOLUNTARIO, JSON.stringify(state));
  notifyChange();
  callSaveAppData('retiro_voluntario', state);
};

export const saveRetiroVoluntarioStep = (studentId: string, step: number) => {
  const state = getRetiroVoluntarioState();
  const s = Math.min(5, Math.max(1, Math.floor(step)));
  state[studentId] = s;
  saveRetiroVoluntarioState(state);
};

// --- Cancelación details ---
export interface CancelacionDetail {
  fechaCorreoRiesgo: string;
  fechaNotaActa: string;
  fechaCorreoCoordinacion: string;
  fechaCancelacion: string;
  fechaSofiaPlus: string;
  observaciones: string;
}
export type CancelacionDetails = Record<string, CancelacionDetail>;

export const getCancelacionDetails = (): CancelacionDetails => {
  const data = localStorage.getItem(STORAGE_KEYS.CANCELACION_DETAILS);
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
};

export const saveCancelacionDetail = (studentId: string, detail: CancelacionDetail) => {
  const details = getCancelacionDetails();
  details[studentId] = detail;
  localStorage.setItem(STORAGE_KEYS.CANCELACION_DETAILS, JSON.stringify(details));
  notifyChange();
  callSaveAppData('cancelacion_details', details);
};

// --- Retiro voluntario details ---
export interface RetiroDetail {
  fechaIntencion: string;
  fechaSolicitud: string;
  fechaNotaActa: string;
  fechaRetiroSofia: string;
  observaciones: string;
}
export type RetiroDetails = Record<string, RetiroDetail>;

export const getRetiroDetails = (): RetiroDetails => {
  const data = localStorage.getItem(STORAGE_KEYS.RETIRO_DETAILS);
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
};

export const saveRetiroDetail = (studentId: string, detail: RetiroDetail) => {
  const details = getRetiroDetails();
  details[studentId] = detail;
  localStorage.setItem(STORAGE_KEYS.RETIRO_DETAILS, JSON.stringify(details));
  notifyChange();
  callSaveAppData('retiro_details', details);
};

// --- Plan de mejoramiento (estado por aprendiz: 0-2) ---
export type PlanMejoramientoState = Record<string, number>; // studentId -> step 0..2

export const getPlanMejoramientoState = (): PlanMejoramientoState => {
  const data = localStorage.getItem(STORAGE_KEYS.PLAN_MEJORAMIENTO);
  if (!data) return {};
  try {
    const raw = JSON.parse(data);
    const out: PlanMejoramientoState = {};
    Object.keys(raw).forEach((id) => {
      const n = Number(raw[id]);
      if (n >= 0 && n <= 2) out[id] = Math.floor(n);
    });
    return out;
  } catch {
    return {};
  }
};

export const savePlanMejoramientoState = (state: PlanMejoramientoState) => {
  localStorage.setItem(STORAGE_KEYS.PLAN_MEJORAMIENTO, JSON.stringify(state));
  notifyChange();
  callSaveAppData('plan_mejoramiento', state);
};

export const savePlanMejoramientoStep = (studentId: string, step: number) => {
  const state = getPlanMejoramientoState();
  const s = Math.min(2, Math.max(0, Math.floor(step)));
  state[studentId] = s;
  savePlanMejoramientoState(state);
};

// Etiquetas de pasos para tooltip de Estado (Cancelación, Retiro, Plan de mejoramiento)
export const DEBIDO_PROCESO_STEP_LABELS: Record<number, string> = {
  0: 'Sin novedad',
  1: 'Correo riesgo de deserción',
  2: 'Agregar novedad al acta',
  3: 'Correo Coordinación (5 días)',
  4: 'Cancelación',
  5: 'Cancelación en Sofia Plus',
};
export const RETIRO_VOLUNTARIO_STEP_LABELS: Record<number, string> = {
  1: 'Sin novedad',
  2: 'Intención de retiro',
  3: 'Solicitud de retiro',
  4: 'Agregar novedad de retiro al acta',
  5: 'Retiro efectuado en Sofia Plus',
};
export const PLAN_MEJORAMIENTO_STEP_LABELS: Record<number, string> = {
  0: 'Sin PMA',
  1: 'Se asigna PMA',
  2: 'Aprobación de PMA',
};

/** Tooltip para el badge de Estado: muestra el paso del stepper si aplica (Cancelado, Retiro voluntario, Plan de mejoramiento). */
export function getEstadoStepperTooltip(
  studentId: string,
  status: string | undefined
): string {
  const s = status || 'Formación';
  const stateMap = getDebidoProcesoState();
  const retiroMap = getRetiroVoluntarioState();
  const pmaMap = getPlanMejoramientoState();
  if (s === 'Cancelado') {
    const step = stateMap[studentId] ?? 0;
    const label = DEBIDO_PROCESO_STEP_LABELS[step] ?? `Paso ${step}`;
    return `Cancelado · Paso ${step}: ${label}`;
  }
  if (s === 'Retiro Voluntario') {
    const step = retiroMap[studentId] ?? 1;
    const label = RETIRO_VOLUNTARIO_STEP_LABELS[step] ?? `Paso ${step}`;
    return `Retiro voluntario · Paso ${step}: ${label}`;
  }
  if (s === 'Formación') {
    const pmaStep = pmaMap[studentId] ?? 0;
    if (pmaStep > 0) {
      const label = PLAN_MEJORAMIENTO_STEP_LABELS[pmaStep] ?? `Paso ${pmaStep}`;
      return `Formación · Plan de mejoramiento: Paso ${pmaStep}: ${label}`;
    }
  }
  return s;
}

// --- PMA Details (per-student: aprobado, dates, observations) ---
export interface PmaDetail {
  aprobado: boolean | null; // null = no definido
  fechaAsignacion: string;
  fechaAprobacion: string;
  observaciones: string;
}
export type PmaDetails = Record<string, PmaDetail>;

export const getPmaDetails = (): PmaDetails => {
  const data = localStorage.getItem(STORAGE_KEYS.PMA_DETAILS);
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
};

export const savePmaDetail = (studentId: string, detail: PmaDetail) => {
  const details = getPmaDetails();
  details[studentId] = detail;
  localStorage.setItem(STORAGE_KEYS.PMA_DETAILS, JSON.stringify(details));
  notifyChange();
  callSaveAppData('pma_details', details);
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
    const parsed = safeParseJSON<GradeActivity[]>(localStorage.getItem(STORAGE_KEYS.GRADE_ACTIVITIES), []);
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
    callSaveAppData('grade_activities', activities);
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

export const getHiddenGradeActivityIds = (): string[] => {
    return safeParseJSON<string[]>(localStorage.getItem(STORAGE_KEYS.HIDDEN_GRADE_ACTIVITIES), []);
};

export const saveHiddenGradeActivityIds = (ids: string[]): void => {
    localStorage.setItem(STORAGE_KEYS.HIDDEN_GRADE_ACTIVITIES, JSON.stringify(ids));
    _markLocalWrite(STORAGE_KEYS.HIDDEN_GRADE_ACTIVITIES);
    callSaveAppData('hidden_grade_activities', ids);
    notifyChange();
};

export const getPlaneacionSemanal = (): PlaneacionSemanalData =>
    safeParseJSON<PlaneacionSemanalData>(localStorage.getItem(STORAGE_KEYS.PLANEACION_SEMANAL), {});

export const savePlaneacionSemanal = (data: PlaneacionSemanalData): void => {
    localStorage.setItem(STORAGE_KEYS.PLANEACION_SEMANAL, JSON.stringify(data));
    _markLocalWrite(STORAGE_KEYS.PLANEACION_SEMANAL);
    callSaveAppData('planeacion_semanal', data);
    notifyChange();
};

export const getGrades = (): GradeEntry[] => {
    return safeParseJSON<GradeEntry[]>(localStorage.getItem(STORAGE_KEYS.GRADES), []);
};

export const saveGrades = (grades: GradeEntry[]) => {
    localStorage.setItem(STORAGE_KEYS.GRADES, JSON.stringify(grades));
    notifyChange();
    callSaveAppData('grades', grades);
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

/**
 * Elimina SOLO las entradas de calificación (GradeEntry) de todas las actividades
 * cuya phase === targetPhase. No elimina las actividades en sí, solo sus notas.
 * Retorna el número de entradas eliminadas.
 */
export const clearGradesForPhase = (targetPhase: string): number => {
    const activities = getGradeActivities();
    const phaseActivityIds = new Set(
        activities.filter(a => a.phase === targetPhase).map(a => a.id)
    );
    const current = getGrades();
    const updated = current.filter(g => !phaseActivityIds.has(g.activityId));
    const removed = current.length - updated.length;
    if (removed > 0) saveGrades(updated);
    return removed;
};

/**
 * Repair broken grade↔activity links caused by activities being recreated with new UUIDs.
 *
 * Strategy: sorts orphaned activityIds by the earliest grade.updatedAt for each id
 * (proxy for when that activity was first used), then sorts current activities by createdAt,
 * and maps them positionally. Saves the repaired grades and uploads to cloud.
 *
 * Returns { repaired, orphanedCount, mappedCount } for UI feedback.
 */
export const repairGradeActivityLinks = (): { repaired: number; orphanedCount: number; mappedCount: number } => {
    const activities = getGradeActivities();
    const grades = getGrades();

    const knownIds = new Set(activities.map(a => a.id));

    // Collect unique orphaned IDs (present in grades, absent in activities)
    const orphanedEarliestDate: Record<string, string> = {};
    grades.forEach(g => {
        if (!knownIds.has(g.activityId)) {
            const prev = orphanedEarliestDate[g.activityId];
            if (!prev || g.updatedAt < prev) {
                orphanedEarliestDate[g.activityId] = g.updatedAt;
            }
        }
    });

    const orphanedIds = Object.keys(orphanedEarliestDate);
    if (orphanedIds.length === 0) return { repaired: 0, orphanedCount: 0, mappedCount: 0 };

    // Sort orphaned IDs by earliest usage date (approximates creation order)
    const sortedOrphaned = [...orphanedIds].sort(
        (a, b) => (orphanedEarliestDate[a] || '').localeCompare(orphanedEarliestDate[b] || '')
    );

    // Sort activities by phase order → GA number → EV number → name.
    // This ensures grades from the earliest phases (Análisis, Planeación) are mapped
    // to the correct early-phase activities rather than being scattered randomly.
    const PHASE_ORDER_MAP: Record<string, number> = {
        'Fase Inducción': 0,
        'Fase 1: Análisis': 1,
        'Fase 2: Planeación': 2,
        'Fase 3: Ejecución': 3,
        'Fase 4: Evaluación': 4,
    };
    const getGaNum = (a: GradeActivity): number => {
        const m = (a.name + ' ' + (a.id || '')).match(/GA(\d+)/i);
        return m ? parseInt(m[1], 10) : 999;
    };
    const getEvNum = (a: GradeActivity): number => {
        const m = (a.name + ' ' + (a.id || '')).match(/EV(\d+)/i);
        return m ? parseInt(m[1], 10) : 999;
    };
    const sortedActivities = [...activities].sort((a, b) => {
        const phaseA = PHASE_ORDER_MAP[a.phase || ''] ?? 99;
        const phaseB = PHASE_ORDER_MAP[b.phase || ''] ?? 99;
        if (phaseA !== phaseB) return phaseA - phaseB;
        const gaA = getGaNum(a); const gaB = getGaNum(b);
        if (gaA !== gaB) return gaA - gaB;
        const evA = getEvNum(a); const evB = getEvNum(b);
        if (evA !== evB) return evA - evB;
        return (a.name || '').localeCompare(b.name || '');
    });

    // Build positional mapping: orphanedId → currentActivity.id
    const idMap: Record<string, string> = {};
    const mapLen = Math.min(sortedOrphaned.length, sortedActivities.length);
    for (let i = 0; i < mapLen; i++) {
        idMap[sortedOrphaned[i]] = sortedActivities[i].id;
    }

    // Apply mapping
    let repaired = 0;
    const updatedGrades = grades.map(g => {
        const newId = idMap[g.activityId];
        if (newId) { repaired++; return { ...g, activityId: newId }; }
        return g;
    });

    saveGrades(updatedGrades);
    return { repaired, orphanedCount: orphanedIds.length, mappedCount: mapLen };
};

/**
 * Fix grades that ended up in wrong phases (e.g., Fase Inducción, Fase 3/4) after
 * a positional repair. Remaps them back to the nearest available seed activities
 * in the allowed phases (default: Fase 1 + Fase 2), grouped per-ficha so each
 * ficha's students end up in the same canonical columns.
 *
 * Returns { fixed, wrongPhaseCount }.
 */
export const fixGradePhaseAssignment = (
    allowedPhases: string[] = ['Fase 1: Análisis', 'Fase 2: Planeación']
): { fixed: number; wrongPhaseCount: number } => {
    const activities = getGradeActivities();
    const grades = getGrades();
    const students = getStudents();

    const activityById = new Map(activities.map(a => [a.id, a]));
    const studentFicha = new Map(students.map(s => [s.id, s.group || '']));
    const allowedPhaseSet = new Set(allowedPhases);

    // Seed activities in allowed phases, sorted by phase order then canonical name
    const allowedSeeds = activities
        .filter(a => allowedPhaseSet.has(a.phase || '') && a.id.startsWith('seed-'))
        .sort((a, b) => {
            const pi = (p: string) => allowedPhases.indexOf(p);
            const pd = pi(a.phase || '') - pi(b.phase || '');
            if (pd !== 0) return pd;
            return a.id.localeCompare(b.id);
        });

    // Find activity IDs currently in wrong phases, tracking their earliest grade date
    const wrongIdEarliestDate = new Map<string, string>();
    grades.forEach(g => {
        const act = activityById.get(g.activityId);
        if (!act || !allowedPhaseSet.has(act.phase || '')) {
            const prev = wrongIdEarliestDate.get(g.activityId);
            if (!prev || g.updatedAt < prev) wrongIdEarliestDate.set(g.activityId, g.updatedAt);
        }
    });

    if (wrongIdEarliestDate.size === 0) return { fixed: 0, wrongPhaseCount: 0 };

    // Determine the most-common ficha for each wrong activityId
    const fichaForWrongId = new Map<string, string>();
    wrongIdEarliestDate.forEach((_, actId) => {
        const fichaCount = new Map<string, number>();
        grades.forEach(g => {
            if (g.activityId === actId) {
                const f = studentFicha.get(g.studentId) || '';
                fichaCount.set(f, (fichaCount.get(f) || 0) + 1);
            }
        });
        let bestFicha = '';
        let bestCount = 0;
        fichaCount.forEach((cnt, f) => { if (cnt > bestCount) { bestFicha = f; bestCount = cnt; } });
        fichaForWrongId.set(actId, bestFicha);
    });

    // Group wrong IDs by ficha
    const wrongIdsByFicha = new Map<string, string[]>();
    wrongIdEarliestDate.forEach((_, actId) => {
        const ficha = fichaForWrongId.get(actId) || '';
        const list = wrongIdsByFicha.get(ficha) || [];
        list.push(actId);
        wrongIdsByFicha.set(ficha, list);
    });

    // Build the id-remap table: wrongId → correct seed id
    const idMap = new Map<string, string>();
    wrongIdsByFicha.forEach((wrongIds, ficha) => {
        // Sort wrong IDs by earliest date (oldest = earliest worked on)
        const sorted = [...wrongIds].sort((a, b) =>
            (wrongIdEarliestDate.get(a) || '').localeCompare(wrongIdEarliestDate.get(b) || '')
        );

        // Seeds already correctly used by this ficha's students
        const usedSeedIds = new Set<string>();
        grades.forEach(g => {
            if (studentFicha.get(g.studentId) === ficha) {
                const act = activityById.get(g.activityId);
                if (act && allowedPhaseSet.has(act.phase || '')) usedSeedIds.add(g.activityId);
            }
        });

        // Remaining seeds not yet occupied by this ficha
        const availableSeeds = allowedSeeds.filter(s => !usedSeedIds.has(s.id));

        // Positional mapping: earliest wrong-phase activity → earliest available seed
        const mapLen = Math.min(sorted.length, availableSeeds.length);
        for (let i = 0; i < mapLen; i++) {
            idMap.set(sorted[i], availableSeeds[i].id);
        }
    });

    // Apply the remap
    let fixed = 0;
    const updatedGrades = grades.map(g => {
        const newId = idMap.get(g.activityId);
        if (newId) { fixed++; return { ...g, activityId: newId }; }
        return g;
    });

    if (fixed > 0) saveGrades(updatedGrades);
    return { fixed, wrongPhaseCount: wrongIdEarliestDate.size };
};

// --- RAP NOTES ---
export type RapNotes = Record<string, Record<string, string>>;
export type RapColumns = Record<string, string[]>;

export const getRapNotes = (): RapNotes => {
    return safeParseJSON<RapNotes>(localStorage.getItem(STORAGE_KEYS.RAP_NOTES), {});
};

export const saveRapNotes = (notes: RapNotes) => {
    localStorage.setItem(STORAGE_KEYS.RAP_NOTES, JSON.stringify(notes));
    notifyChange();
    callSaveAppData('rap_notes', notes);
};

export const getRapColumns = (): RapColumns => {
    return safeParseJSON<RapColumns>(localStorage.getItem(STORAGE_KEYS.RAP_COLUMNS), {});
};

export const saveRapColumns = (columns: RapColumns) => {
    localStorage.setItem(STORAGE_KEYS.RAP_COLUMNS, JSON.stringify(columns));
    notifyChange();
    callSaveAppData('rap_columns', columns);
};

// --- STUDENT GRADE OBSERVATIONS (observaciones en detalle del aprendiz en Calificaciones) ---
export type StudentGradeObservations = Record<string, string>;

export const getStudentGradeObservations = (): StudentGradeObservations => {
    return safeParseJSON<StudentGradeObservations>(localStorage.getItem(STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS), {});
};

export const saveStudentGradeObservations = (obs: StudentGradeObservations) => {
    localStorage.setItem(STORAGE_KEYS.STUDENT_GRADE_OBSERVATIONS, JSON.stringify(obs));
    notifyChange();
    callSaveAppData('student_grade_observations', obs);
};

// --- JUICIOS EVALUATIVOS (por ficha+fase, por estudiante: '-' | 'orange' | 'green') ---
export type JuicioEstado = 'orange' | 'green';
export type JuiciosEvaluativos = Record<string, Record<string, JuicioEstado>>;

export const getJuiciosEvaluativos = (): JuiciosEvaluativos => {
    const raw = safeParseJSON<Record<string, unknown>>(localStorage.getItem(STORAGE_KEYS.JUICIOS_EVALUATIVOS), {});
    const result: JuiciosEvaluativos = {};
    Object.keys(raw).forEach(key => {
        const byStudent = raw[key];
        if (byStudent && typeof byStudent === 'object') {
            result[key] = {};
            Object.keys(byStudent).forEach(sid => {
                const v = byStudent[sid];
                if (v === 'orange' || v === 'green') result[key][sid] = v;
                else if (v === true) result[key][sid] = 'green';
            });
        }
    });
    return result;
};

export const saveJuiciosEvaluativos = (juicios: JuiciosEvaluativos) => {
    localStorage.setItem(STORAGE_KEYS.JUICIOS_EVALUATIVOS, JSON.stringify(juicios));
    notifyChange();
    callSaveAppData('juicios_evaluativos', juicios);
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

    console.log("Initializing Realtime Subscription (attendance + sessions)...");

    realtimeChannel = client.channel('data-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'attendance'
            },
            (payload) => {
                console.log("Realtime attendance change detected:", payload);
                syncAttendanceFromCloud();
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'sessions'
            },
            (payload) => {
                console.log("Realtime sessions change detected:", payload);
                syncSessionsFromCloud();
            }
        )
        .subscribe();

    client
        .channel('app_data_realtime')
        .on(
            'postgres_changes' as any,
            { event: '*', schema: 'public', table: 'app_data' },
            (payload: any) => {
                const newRow = payload.new ?? {};
                const { key, value_json } = newRow as { key: string; value_json: unknown };
                if (!key) return;
                const storageKey = APP_DATA_SYNC_KEYS[key];
                if (!storageKey) return;
                // Grace-period guard: ignore Realtime echoes for keys written locally
                // in the last REALTIME_GRACE_MS ms to prevent overwriting fresh user data
                // with a stale cloud echo (race condition with uploadLocalAppDataToCloud).
                const lastWrite = _localLastWrite[storageKey] ?? 0;
                if (Date.now() - lastWrite < REALTIME_GRACE_MS) {
                    console.log(`[Realtime] Ignoring app_data echo for recently-written key: ${key}`);
                    return;
                }
                const currentLocal = localStorage.getItem(storageKey);
                const incoming = JSON.stringify(value_json);
                if (currentLocal !== incoming) {
                    localStorage.setItem(storageKey, incoming);
                    window.dispatchEvent(new Event('asistenciapro-storage-update'));
                }
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

// Sync sessions from cloud (used by Realtime)
const syncSessionsFromCloud = async () => {
    const client = getClient();
    if (!client) return;

    try {
        const { data: sess } = await client.from('sessions').select('*');
        if (sess) {
            const mappedSessions = sess.map((x: any) => ({ id: x.id, date: x.date, group: x.group, description: x.description }));
            saveSessions(mappedSessions);
        }
    } catch (e) {
        console.error("Sessions sync failed", e);
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
                description: x.description || undefined,
                username: x.username || undefined,
                isVocero: x.is_vocero ?? false,
                isVoceroSuplente: x.is_vocero_suplente ?? false
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

        await syncAppDataFromCloud();

    } catch (e) {
        console.error("Auto-sync failed", e);
    }

    // Always attempt upload — outside try/catch so a Supabase query error above
    // can never prevent local data from being persisted to the cloud.
    await uploadLocalAppDataToCloud();

    // Fire a final notification so any views that mounted mid-sync (and may have
    // missed earlier events) will reload all their data now that everything is in localStorage.
    notifyChange();
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
        juiciosEvaluativos?: JuiciosEvaluativos;
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
            studentGradeObservations: getStudentGradeObservations(),
            juiciosEvaluativos: getJuiciosEvaluativos()
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
        if (backup.data.juiciosEvaluativos) {
            saveJuiciosEvaluativos(backup.data.juiciosEvaluativos);
        }
        return true;
    } catch (e) {
        console.error("Import failed", e);
        return false;
    }
};

// --- SOFIA PLUS - JUICIOS EVALUATIVOS POR RAP ---

export const getSofiaRapDefs = (): Record<string, RapDefinition> => {
  return safeParseJSON<Record<string, RapDefinition>>(localStorage.getItem(STORAGE_KEYS.SOFIA_RAP_DEFS), {});
};

export const saveSofiaRapDefs = (defs: Record<string, RapDefinition>) => {
  localStorage.setItem(STORAGE_KEYS.SOFIA_RAP_DEFS, JSON.stringify(defs));
  _markLocalWrite(STORAGE_KEYS.SOFIA_RAP_DEFS);
  callSaveAppData('sofia_rap_defs', defs);
  notifyChange();
};

export const getSofiaJuicioEntries = (): Record<string, JuicioRapEntry> => {
  return safeParseJSON<Record<string, JuicioRapEntry>>(localStorage.getItem(STORAGE_KEYS.SOFIA_JUICIO_ENTRIES), {});
};

export const upsertSofiaJuicioEntries = (entries: JuicioRapEntry[]) => {
  const existing = getSofiaJuicioEntries();
  entries.forEach(e => {
    existing[`${e.studentId}-${e.rapId}`] = e;
  });
  localStorage.setItem(STORAGE_KEYS.SOFIA_JUICIO_ENTRIES, JSON.stringify(existing));
  _markLocalWrite(STORAGE_KEYS.SOFIA_JUICIO_ENTRIES);
  notifyChange();
  callSaveAppData('sofia_juicio_entries', existing);
};

export const getSofiaJuicioHistory = (): JuicioRapHistoryEntry[] => {
  return safeParseJSON<JuicioRapHistoryEntry[]>(localStorage.getItem(STORAGE_KEYS.SOFIA_JUICIO_HISTORY), []);
};

export const appendSofiaJuicioHistory = (entries: JuicioRapHistoryEntry[]) => {
  if (entries.length === 0) return;
  const existing = getSofiaJuicioHistory();
  const existingKeys = new Set(existing.map(e => `${e.studentId}-${e.rapId}-${e.fecha}-${e.funcionario}`));
  const newEntries = entries.filter(e => !existingKeys.has(`${e.studentId}-${e.rapId}-${e.fecha}-${e.funcionario}`));
  if (newEntries.length === 0) return;
  const updated = [...existing, ...newEntries];
  localStorage.setItem(STORAGE_KEYS.SOFIA_JUICIO_HISTORY, JSON.stringify(updated));
  _markLocalWrite(STORAGE_KEYS.SOFIA_JUICIO_HISTORY);
  callSaveAppData('sofia_juicio_history', updated);
};

export const getSofiaStudentEstados = (): Record<string, string> => {
  return safeParseJSON<Record<string, string>>(localStorage.getItem(STORAGE_KEYS.SOFIA_STUDENT_ESTADOS), {});
};

export const upsertSofiaStudentEstados = (map: Record<string, string>) => {
  const existing = getSofiaStudentEstados();
  const merged = { ...existing, ...map };
  localStorage.setItem(STORAGE_KEYS.SOFIA_STUDENT_ESTADOS, JSON.stringify(merged));
  _markLocalWrite(STORAGE_KEYS.SOFIA_STUDENT_ESTADOS);
  notifyChange();
  callSaveAppData('sofia_student_estados', merged);
};

// ---------------------------------------------------------------------------
// Evidence → Competencia mapping (for CalificacionesView double header)
// ---------------------------------------------------------------------------

/** Per-evidence entry with competencia and AA (RAP) info extracted from Excel columns */
export type EvCompEntry = {
  competenciaCode: string;  // e.g., "220501014"
  competenciaName: string;  // display name (same as code initially)
  aaKey: string;            // e.g., "AA1"
  aaName: string;           // display name (same as aaKey initially)
};

/** Full map stored in localStorage.
 *  Key = "fichaCode::phase" (or "" for all-fichas)
 */
export type EvidenceCompMapData = Record<string, {
  byEvKey: Record<string, EvCompEntry>;  // canonicalEvidenceKey → comp entry
  compOrder: string[];                    // ordered competencia codes
}>;

export const getEvidenceCompMap = (): EvidenceCompMapData => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.EVIDENCE_COMP_MAP);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveEvidenceCompMap = (map: EvidenceCompMapData) => {
  localStorage.setItem(STORAGE_KEYS.EVIDENCE_COMP_MAP, JSON.stringify(map));
  notifyChange();
  callSaveAppData('evidence_comp_map', map);
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
    localStorage.removeItem(STORAGE_KEYS.JUICIOS_EVALUATIVOS);
    localStorage.removeItem(STORAGE_KEYS.LMS_LAST_ACCESS);
    localStorage.removeItem(STORAGE_KEYS.DEBIDO_PROCESO);
    localStorage.removeItem(STORAGE_KEYS.RETIRO_VOLUNTARIO);
    localStorage.removeItem(STORAGE_KEYS.PLAN_MEJORAMIENTO);
    localStorage.removeItem(STORAGE_KEYS.SOFIA_RAP_DEFS);
    localStorage.removeItem(STORAGE_KEYS.SOFIA_JUICIO_ENTRIES);
    localStorage.removeItem(STORAGE_KEYS.SOFIA_JUICIO_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.SOFIA_STUDENT_ESTADOS);
    localStorage.removeItem(STORAGE_KEYS.EVIDENCE_COMP_MAP);
    localStorage.removeItem(STORAGE_KEYS.PMA_DETAILS);
    localStorage.removeItem(STORAGE_KEYS.CANCELACION_DETAILS);
    localStorage.removeItem(STORAGE_KEYS.RETIRO_DETAILS);
    // Don't remove password hash to avoid lockout
    notifyChange();
};