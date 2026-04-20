import React, { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Eye, EyeOff, FileDown, FileSpreadsheet, Filter, Pencil, Plus, Trash2, Upload, X, Search, ListChecks } from 'lucide-react';
import { Ficha, GradeActivity, GradeEntry, Student } from '../types';
import {
  addGradeActivity,
  clearGradesForPhase,
  deleteGradeActivity,
  getHiddenGradeActivityIds,
  saveHiddenGradeActivityIds,
  deleteGradeEntry,
  getFichas,
  getGradeActivities,
  getGrades,
  getJuiciosEvaluativos,
  getRapColumns,
  getRapNotes,
  getStudentGradeObservations,
  getStudents,
  getLmsLastAccess,
  saveGradeActivities,
  saveGrades,
  saveJuiciosEvaluativos,
  saveRapColumns,
  saveRapNotes,
  saveStudentGradeObservations,
  updateGradeActivity,
  updateStudent,
  upsertGrades,
  getEvidenceCompMap,
  saveEvidenceCompMap,
  getEstadoStepperTooltip,
  getManualFinals,
  saveManualFinals,
  getManualPhaseTotals,
  saveManualPhaseTotals,
  type ManualFinals,
} from '../services/db';
import type { EvidenceCompMapData, EvCompEntry } from '../services/db';
import {
  ALL_EVIDENCE_AREAS,
  activityMatchesEvidenceArea,
  buildEvidenceAreaOptions,
  shortEvidenceLabel,
} from '../services/evidenceMeta';

const PASSING_SCORE = 70;
/** Altura fija de cada fila de la tabla (px) para que coincidan las dos mitades (datos + calificaciones). Misma que SofiaPlusView. */
const TABLE_ROW_HEIGHT_PX = 52;

/** Igual que AsistenciaLmsView: días desde último acceso LMS hasta hoy. */
function daysSinceLms(dateStr: string): number {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// DATOS ESTÁTICOS DEL CRONOGRAMA PEDAGÓGICO
// Fuente: docs/cronogramas/Cronograma_*.docx
// ---------------------------------------------------------------------------

/** Sentinel value para vista que agrupa todas las fases */
const ALL_PHASES_VIEW = 'Todas las fases';

/** Convierte hex (#RRGGBB) a tripla RGB para jsPDF / ExcelJS */
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Colores de fondo por fase para la cabecera de la vista general */
const PHASE_HEADER_COLORS: Record<string, { bg: string; text: string }> = {
  'Fase Inducción':    { bg: '#f59e0b', text: '#ffffff' },
  'Fase 1: Análisis':  { bg: '#0d9488', text: '#ffffff' },
  'Fase 2: Planeación':{ bg: '#3b82f6', text: '#ffffff' },
  'Fase 3: Ejecución': { bg: '#8b5cf6', text: '#ffffff' },
  'Fase 4: Evaluación':{ bg: '#ef4444', text: '#ffffff' },
};

const PHASE_TOTAL_LABELS: Record<string, string> = {
  'Fase Inducción':    'TOTAL FASE DE INDUCCIÓN',
  'Fase 1: Análisis':  'TOTAL Fase Análisis',
  'Fase 2: Planeación':'TOTAL Fase Planeación',
  'Fase 3: Ejecución': 'TOTAL Fase Ejecución',
  'Fase 4: Evaluación':'TOTAL Fase Evaluación',
};

/** Nombres oficiales de competencias por código SENA */
const COMPETENCIA_NAMES: Record<string, string> = {
  '210201501': 'Promover la interacción idónea consigo mismo, con los demás y con la naturaleza en los contextos laboral y social',
  '220201501': 'Utilizar los principios y leyes de la Física en la solución de problemas del contexto productivo',
  '220501014': 'Gestionar la seguridad en redes de datos de acuerdo con los estándares y normas internacionales',
  '220501046': 'Utilizar herramientas de tecnologías de la información y la comunicación (TIC) para el procesamiento de información y comunicación',
  '220501091': 'Gestionar la infraestructura de comunicaciones unificadas de voz sobre IP (VoIP) según el diseño establecido',
  '220501104': 'Gestionar la infraestructura de redes cableadas de acuerdo con los requerimientos y estándares establecidos',
  '220501105': 'Gestionar sistemas de monitoreo de infraestructura tecnológica de red de acuerdo con políticas organizacionales',
  '220501106': 'Gestionar dispositivos de cómputo y servicios de red para garantizar el funcionamiento de la plataforma tecnológica',
  '220501107': 'Gestionar la infraestructura de redes inalámbricas de acuerdo con especificaciones de diseño y normatividad vigente',
  '220601501': 'Implementar las estrategias de prevención y control de impactos ambientales y de la seguridad y salud en el trabajo (SST)',
  '230101507': 'Utilizar estrategias de acondicionamiento físico y psicomotriz con criterios de salud, condición física y ergonomía',
  '240201064': 'Utilizar técnicas e instrumentos de investigación para la presentación de proyectos, de acuerdo con el contexto productivo',
  '240201524': 'Procesar información de acuerdo con las necesidades de comunicación del contexto productivo y social',
  '240201526': 'Promover la interacción idónea consigo mismo, con los demás y con la naturaleza en el contexto laboral y social desde los principios éticos',
  '240201528': 'Resolver problemas matemáticos de acuerdo con las necesidades del contexto productivo y social',
  '240201529': 'Formular el plan de negocio de acuerdo con las características del mercado y las necesidades del entorno',
  '240202501': 'Comprender y producir textos en inglés en forma oral y escrita en contextos sociales y laborales',
  '240201530': 'Identificar la dinámica organizacional del SENA y el rol de la formación profesional integral de acuerdo con su proyecto de vida y el desarrollo profesional',
};

interface CronogramaRap {
  rapCode: string;    // "220501014-01"
  rapName: string;    // Nombre corto del RAP
  compCode: string;   // "220501014"
  aaKey: string;      // "AA1"
}

/** RAPs por fase, en orden del cronograma pedagógico */
const FASE_RAPS: Record<string, CronogramaRap[]> = {
  'Fase 1: Análisis': [
    { rapCode: '220501014-01', rapName: 'Interpretar el plan de seguridad para la red de datos definidos en la solución, según estándares y normas internacionales', compCode: '220501014', aaKey: 'AA1' },
    { rapCode: '220501046-01', rapName: 'Alistar herramientas de tecnologías de la información y la comunicación (TIC), de acuerdo con las necesidades de procesamiento de información y comunicación', compCode: '220501046', aaKey: 'AA1' },
    { rapCode: '220501046-02', rapName: 'Aplicar funcionalidades de herramientas y servicios TIC, de acuerdo con manuales de uso, procedimientos establecidos y buenas prácticas', compCode: '220501046', aaKey: 'AA2' },
    { rapCode: '220501046-03', rapName: 'Evaluar los resultados, de acuerdo con los requerimientos', compCode: '220501046', aaKey: 'AA3' },
    { rapCode: '220501046-04', rapName: 'Optimizar los resultados, de acuerdo con la verificación', compCode: '220501046', aaKey: 'AA4' },
    { rapCode: '240202501-01', rapName: 'Comprender información sobre situaciones cotidianas y laborales actuales y futuras a través de interacciones sociales de forma oral y escrita', compCode: '240202501', aaKey: 'AA1' },
  ],
  'Fase 2: Planeación': [
    { rapCode: '220501104-01', rapName: 'Planificar la implementación de la arquitectura de la red según el diseño establecido', compCode: '220501104', aaKey: 'AA1' },
    { rapCode: '220501107-01', rapName: 'Planificar la implementación de los componentes inalámbricos en la red de datos, de acuerdo con especificaciones del diseño y normatividad vigente', compCode: '220501107', aaKey: 'AA1' },
    { rapCode: '240201528-01', rapName: 'Identificar modelos matemáticos de acuerdo con los requerimientos del problema planteado en contextos sociales y productivo', compCode: '240201528', aaKey: 'AA1' },
    { rapCode: '240201528-02', rapName: 'Plantear problemas matemáticos a partir de situaciones generadas en el contexto social y productivo', compCode: '240201528', aaKey: 'AA2' },
    { rapCode: '240201528-03', rapName: 'Resolver problemas matemáticos a partir de situaciones generadas en el contexto social y productivo', compCode: '240201528', aaKey: 'AA3' },
    { rapCode: '240201528-04', rapName: 'Proponer acciones de mejora frente a los resultados de los procedimientos matemáticos de acuerdo con el problema planteado', compCode: '240201528', aaKey: 'AA4' },
    { rapCode: '240202501-02', rapName: 'Intercambiar opiniones sobre situaciones cotidianas y laborales actuales, pasadas y futuras en contextos sociales orales y escritos', compCode: '240202501', aaKey: 'AA1' },
    { rapCode: '220501091-01', rapName: 'Planificar la implementación de los equipos y software de comunicación de voz sobre IP (VoIP), según el diseño establecido', compCode: '220501091', aaKey: 'AA1' },
    { rapCode: '220501105-01', rapName: 'Planificar la implementación de plataformas de gestión y monitoreo según parámetros definidos en la solución', compCode: '220501105', aaKey: 'AA1' },
    { rapCode: '220201501-01', rapName: 'Identificar los principios y leyes de la física en la solución de problemas de acuerdo al contexto productivo', compCode: '220201501', aaKey: 'AA1' },
    { rapCode: '220201501-02', rapName: 'Solucionar problemas asociados con el sector productivo con base en los principios y leyes de la física', compCode: '220201501', aaKey: 'AA2' },
    { rapCode: '220201501-03', rapName: 'Verificar las transformaciones físicas de la materia utilizando herramientas tecnológicas', compCode: '220201501', aaKey: 'AA3' },
    { rapCode: '220201501-04', rapName: 'Proponer acciones de mejora en los procesos productivos de acuerdo con los principios y leyes de la física', compCode: '220201501', aaKey: 'AA4' },
  ],
  'Fase 3: Ejecución': [
    { rapCode: '220501104-02', rapName: 'Configurar los equipos activos de interconexión, de acuerdo con la arquitectura establecida', compCode: '220501104', aaKey: 'AA1' },
    { rapCode: '220501107-02', rapName: 'Configurar los componentes inalámbricos, acorde con la arquitectura establecida, técnicas y buenas prácticas', compCode: '220501107', aaKey: 'AA1' },
    { rapCode: '220501107-03', rapName: 'Verificar la transmisión de datos en la infraestructura inalámbrica bajo criterios y procedimientos técnicos establecidos', compCode: '220501107', aaKey: 'AA1' },
    { rapCode: '240201524-01', rapName: 'Analizar los componentes de la comunicación según sus características, intencionalidad y contexto', compCode: '240201524', aaKey: 'AA1' },
    { rapCode: '240201524-02', rapName: 'Argumentar en forma oral y escrita atendiendo las exigencias y particularidades de las diversas situaciones comunicativas mediante los distintos sistemas de representación', compCode: '240201524', aaKey: 'AA2' },
    { rapCode: '240201524-03', rapName: 'Relacionar los procesos comunicativos teniendo en cuenta criterios de lógica y racionalidad', compCode: '240201524', aaKey: 'AA3' },
    { rapCode: '240201524-04', rapName: 'Establecer procesos de enriquecimiento lexical y acciones de mejoramiento en el desarrollo de procesos comunicativos según requerimientos del contexto', compCode: '240201524', aaKey: 'AA4' },
    { rapCode: '240202501-03', rapName: 'Discutir sobre posibles soluciones a problemas dentro de un rango variado de contextos sociales y laborales', compCode: '240202501', aaKey: 'AA1' },
    { rapCode: '220501106-01', rapName: 'Configurar el hardware, dispositivos de cómputo y sistemas operativos necesarios para la implementación de los servicios de red', compCode: '220501106', aaKey: 'AA1' },
    { rapCode: '240201064-01', rapName: 'Analizar el contexto productivo según sus características y necesidades', compCode: '240201064', aaKey: 'AA1' },
    { rapCode: '240201064-02', rapName: 'Estructurar el proyecto de acuerdo a criterios de la investigación', compCode: '240201064', aaKey: 'AA2' },
    { rapCode: '240201064-03', rapName: 'Argumentar aspectos teóricos del proyecto según referentes nacionales e internacionales', compCode: '240201064', aaKey: 'AA2' },
    { rapCode: '240201064-04', rapName: 'Proponer soluciones a las necesidades del contexto según resultados de la investigación', compCode: '240201064', aaKey: 'AA2' },
    { rapCode: '240202501-04', rapName: 'Implementar acciones de mejora relacionadas con el uso de expresiones, estructuras y desempeño según los resultados de aprendizaje formulados para el programa', compCode: '240202501', aaKey: 'AA1' },
    { rapCode: '220501091-02', rapName: 'Configurar equipos y software de comunicación de voz sobre IP (VoIP), acorde con la arquitectura establecida, técnicas y buenas prácticas', compCode: '220501091', aaKey: 'AA1' },
    { rapCode: '240202501-05', rapName: 'Presentar un proceso para la realización de una actividad en su quehacer laboral de acuerdo con los procedimientos establecidos desde su programa de formación', compCode: '240202501', aaKey: 'AA1' },
    { rapCode: '220501105-02', rapName: 'Implementar sistemas de gestión y monitoreo en la red, según estándares, políticas y recursos de la organización', compCode: '220501105', aaKey: 'AA1' },
    { rapCode: '220501014-02', rapName: 'Implementar el plan de seguridad en la organización aplicando estándares y normas internacionales de seguridad vigentes', compCode: '220501014', aaKey: 'AA1' },
    { rapCode: '230101507-01', rapName: 'Desarrollar habilidades psicomotrices en el contexto productivo y social', compCode: '230101507', aaKey: 'AA1' },
    { rapCode: '230101507-02', rapName: 'Practicar hábitos saludables mediante la aplicación de fundamentos de nutrición e higiene', compCode: '230101507', aaKey: 'AA2' },
    { rapCode: '230101507-03', rapName: 'Ejecutar actividades de acondicionamiento físico orientadas hacia el mejoramiento de la condición física en los contextos productivo y social', compCode: '230101507', aaKey: 'AA3' },
    { rapCode: '230101507-04', rapName: 'Implementar un plan de ergonomía y pausas activas, según las características de la función productiva', compCode: '230101507', aaKey: 'AA4' },
    { rapCode: '240202501-06', rapName: 'Explicar las funciones de su ocupación laboral usando expresiones de acuerdo al nivel requerido por el programa de formación', compCode: '240202501', aaKey: 'AA1' },
    { rapCode: '220501106-02', rapName: 'Implementar los servicios red necesarios para cumplir los requerimientos del portafolio de servicios de tecnologías de la información', compCode: '220501106', aaKey: 'AA1' },
  ],
  'Fase 4: Evaluación': [
    { rapCode: '220501104-03', rapName: 'Verificar el funcionamiento de los equipos activos de interconexión, de acuerdo con los requerimientos establecidos', compCode: '220501104', aaKey: 'AA1' },
    { rapCode: '220501104-04', rapName: 'Gestionar los equipos activos de interconexión, para garantizar el funcionamiento de la red', compCode: '220501104', aaKey: 'AA2' },
    { rapCode: '220501107-04', rapName: 'Validar que los parámetros de certificación cumplan con estándares y normatividad vigente', compCode: '220501107', aaKey: 'AA1' },
    { rapCode: '220601501-01', rapName: 'Analizar las estrategias para la prevención y control de los impactos ambientales y de los accidentes y enfermedades laborales (ATEL) de acuerdo con las políticas organizacionales y el entorno social', compCode: '220601501', aaKey: 'AA1' },
    { rapCode: '220601501-02', rapName: 'Implementar estrategias para el control de los impactos ambientales y de los accidentes y enfermedades, de acuerdo con los planes y programas establecidos por la organización', compCode: '220601501', aaKey: 'AA2' },
    { rapCode: '220601501-03', rapName: 'Realizar seguimiento y acompañamiento al desarrollo de los planes y programas ambientales y SST, según el área de desempeño', compCode: '220601501', aaKey: 'AA3' },
    { rapCode: '220601501-04', rapName: 'Proponer acciones de mejora para el manejo ambiental y el control de la SST, de acuerdo con estrategias de trabajo, colaborativo, cooperativo y coordinado en el contexto productivo y social', compCode: '220601501', aaKey: 'AA4' },
    { rapCode: '220501106-03', rapName: 'Verificar el funcionamiento de dispositivos de cómputo y servicios de red de acuerdo a políticas de la organización', compCode: '220501106', aaKey: 'AA1' },
    { rapCode: '220501106-04', rapName: 'Gestionar los dispositivos de cómputo y servicios de red para garantizar el funcionamiento de la plataforma tecnológica', compCode: '220501106', aaKey: 'AA2' },
    { rapCode: '220501091-03', rapName: 'Verificar el funcionamiento de los equipos y software de comunicación de voz sobre IP (VoIP), para validar el cumplimiento de los requerimientos establecidos en el diseño', compCode: '220501091', aaKey: 'AA1' },
    { rapCode: '220501091-04', rapName: 'Gestionar los equipos y software de comunicación de voz sobre IP (VoIP), para garantizar su funcionamiento acorde con los parámetros establecidos en el diseño', compCode: '220501091', aaKey: 'AA2' },
    { rapCode: '240201529-01', rapName: 'Integrar elementos de la cultura emprendedora teniendo en cuenta el perfil personal y el contexto de desarrollo social', compCode: '240201529', aaKey: 'AA1' },
    { rapCode: '240201529-02', rapName: 'Caracterizar la idea de negocio teniendo en cuenta las oportunidades y necesidades del sector productivo y social', compCode: '240201529', aaKey: 'AA2' },
    { rapCode: '240201529-03', rapName: 'Estructurar el plan de negocio de acuerdo con las características empresariales y tendencias de mercado', compCode: '240201529', aaKey: 'AA3' },
    { rapCode: '240201529-04', rapName: 'Valorar la propuesta de negocio conforme con su estructura y necesidades del sector productivo y social', compCode: '240201529', aaKey: 'AA4' },
    { rapCode: '220501014-03', rapName: 'Verificar eventos en la infraestructura de red, mediante herramientas y técnicas de análisis de datos que permitan determinar incidentes de seguridad', compCode: '220501014', aaKey: 'AA1' },
    { rapCode: '220501014-04', rapName: 'Gestionar el estado de la seguridad en la red de datos de la organización y su pertinencia según el plan de seguridad', compCode: '220501014', aaKey: 'AA2' },
    { rapCode: '210201501-01', rapName: 'Reconocer el trabajo como factor de movilidad social y transformación vital con referencia a la fenomenología y a los derechos fundamentales en el trabajo', compCode: '210201501', aaKey: 'AA1' },
    { rapCode: '210201501-02', rapName: 'Valorar la importancia de la ciudadanía laboral con base en el estudio de los derechos humanos y fundamentales en el trabajo', compCode: '210201501', aaKey: 'AA2' },
    { rapCode: '210201501-03', rapName: 'Practicar los derechos fundamentales en el trabajo de acuerdo con la Constitución Política y los Convenios Internacionales', compCode: '210201501', aaKey: 'AA3' },
    { rapCode: '210201501-04', rapName: 'Participar en acciones solidarias teniendo en cuenta el ejercicio de los derechos humanos, de los pueblos y de la naturaleza', compCode: '210201501', aaKey: 'AA4' },
    { rapCode: '220501105-03', rapName: 'Monitorear el funcionamiento de la infraestructura tecnológica de red de acuerdo con políticas y criterios técnicos de la organización', compCode: '220501105', aaKey: 'AA1' },
    { rapCode: '220501105-04', rapName: 'Gestionar los recursos tecnológicos, utilizando herramientas de administración y monitoreo', compCode: '220501105', aaKey: 'AA1' },
    { rapCode: '240201526-01', rapName: 'Promover mi dignidad y la del otro a partir de los principios y valores éticos como aporte en la instauración de una cultura de paz', compCode: '240201526', aaKey: 'AA1' },
    { rapCode: '240201526-02', rapName: 'Establecer relaciones de crecimiento personal y comunitario a partir del bien común como aporte para el desarrollo social', compCode: '240201526', aaKey: 'AA2' },
    { rapCode: '240201526-03', rapName: 'Promover el uso racional de los recursos naturales a partir de criterios de sostenibilidad y sustentabilidad ética y normativa vigente', compCode: '240201526', aaKey: 'AA3' },
    { rapCode: '240201526-04', rapName: 'Contribuir con el fortalecimiento de la cultura de paz a partir de la dignidad humana y las estrategias para la transformación de conflictos', compCode: '240201526', aaKey: 'AA4' },
  ],
};

interface CronogramaEvidence {
  code: string;           // e.g., "GA1-220501014-AA1-EV01"
  compCode: string;       // e.g., "220501014"
  aaKey: string;          // e.g., "AA1"
  description: string;    // full evidence name from cronograma
  sofiaAliases?: string[]; // alternate AA#-EV## codes Sofia Plus may use for this evidence
}

/** Evidencias por fase, extraídas de los cronogramas pedagógicos */
const FASE_EVIDENCES: Record<string, CronogramaEvidence[]> = {
  'Fase Inducción': [
    { code: 'GI1-240201530-AA1-EV01', compCode: '240201530', aaKey: 'AA1', description: 'Evidencia de producto: Infografía. Contextualización Senología.' },
    { code: 'GI1-240201530-AA2-EV01', compCode: '240201530', aaKey: 'AA2', description: 'Evidencia de conocimiento: Cuestionario. Alternativas de etapa productiva (1).' },
    { code: 'GI1-240201530-AA2-EV02', compCode: '240201530', aaKey: 'AA2', description: 'Evidencia de conocimiento: Cuestionario. Alternativas de etapa productiva (2).' },
  ],
  'Fase 1: Análisis': [
    { code: 'GA1-220501014-AA1-EV01', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario sobre técnicas de levantamiento de información, plan de seguridad y continuidad del servicio.' },
    { code: 'GA1-220501014-AA1-EV02', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de producto: Informe de inventario y dispositivos de la red.' },
    { code: 'GA1-220501046-AA1-EV01', compCode: '220501046', aaKey: 'AA1', description: 'Evidencia de conocimiento: Mapa mental - Software y servicios de Internet.' },
    { code: 'GA1-220501046-AA2-EV01', compCode: '220501046', aaKey: 'AA2', description: 'Evidencia de conocimiento: Taller. Utilización de las herramientas de ofimática.' },
    { code: 'GA1-220501046-AA3-EV01', compCode: '220501046', aaKey: 'AA3', description: 'Evidencia de producto: Informe. Pertinencia y efectividad de los recursos utilizados según requerimientos.' },
    { code: 'GA1-220501046-AA4-EV01', compCode: '220501046', aaKey: 'AA4', description: 'Evidencia de desempeño: Plan de mejora de productos y procesos con la incorporación de TIC.' },
    { code: 'GA1-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA1-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de desempeño: Video presentación.' },
    { code: 'GA1-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Folleto.' },
  ],
  'Fase 2: Planeación': [
    { code: 'GA2-220501104-AA1-EV01', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de conocimiento: Taller con interpretación de planos.' },
    { code: 'GA2-220501104-AA1-EV02', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo sobre las topologías estudiadas.' },
    { code: 'GA2-220501107-AA1-EV01', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Lista de chequeo para inspección de infraestructura física.' },
    { code: 'GA2-220501107-AA1-EV02', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Informe de planeación de implementación de red inalámbrica.' },
    { code: 'GA2-240201528-AA1-EV01', compCode: '240201528', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario: procedimientos aritméticos.' },
    { code: 'GA2-240201528-AA2-EV01', compCode: '240201528', aaKey: 'AA2', description: 'Evidencia de desempeño: Informe: planteamiento de ecuación.' },
    { code: 'GA2-240201528-AA3-EV01', compCode: '240201528', aaKey: 'AA3', description: 'Evidencia de producto: Video: sustentación.' },
    { code: 'GA2-240201528-AA4-EV01', compCode: '240201528', aaKey: 'AA4', description: 'Evidencia de desempeño: Algoritmo para el cálculo de áreas y volúmenes.' },
    { code: 'GA2-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA2-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de desempeño: Vídeo entrevista virtual.' },
    { code: 'GA2-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Crónica.' },
    { code: 'GA2-240202501-AA2-EV01', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA2-240202501-AA2-EV02', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de desempeño: Video presentación de un lugar turístico.' },
    { code: 'GA2-240202501-AA2-EV03', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de producto: Documento escrito.' },
    { code: 'GA3-220501091-AA1-EV01', compCode: '220501091', aaKey: 'AA1', description: 'Evidencia de producto: Listado de dispositivos y recursos de VoIP con sus características.' },
    { code: 'GA3-220501091-AA1-EV02', compCode: '220501091', aaKey: 'AA1', description: 'Evidencia de producto: Informe con las posibles soluciones (ventajas y desventajas) de VoIP.' },
    { code: 'GA3-220501105-AA1-EV01', compCode: '220501105', aaKey: 'AA1', description: 'Evidencia de desempeño: Lista de chequeo de los elementos mínimos necesarios para la implementación de la plataforma de monitoreo.' },
    { code: 'GA3-220201501-AA1-EV01', compCode: '220201501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA3-220201501-AA2-EV01', compCode: '220201501', aaKey: 'AA2', description: 'Evidencia de producto: Video expositivo sobre experimento de aplicación.' },
    { code: 'GA3-220201501-AA3-EV01', compCode: '220201501', aaKey: 'AA3', description: 'Evidencia de producto: Informe de laboratorio.' },
    { code: 'GA3-220201501-AA4-EV01', compCode: '220201501', aaKey: 'AA4', description: 'Evidencia de producto: Video expositivo sobre experimento de aplicación.' },
    { code: 'GA3-220201501-AA4-EV02', compCode: '220201501', aaKey: 'AA4', description: 'Evidencia de producto: Bitácora de procesos desarrollados en la competencia.' },
  ],
  'Fase 3: Ejecución': [
    { code: 'GA4-220501104-AA1-EV01', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de desempeño: Archivo de simulación de la implementación de esquema de subredes y direccionamiento IPv4 e IPv6.' },
    { code: 'GA4-220501104-AA1-EV02', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de producto: Informe práctica de laboratorio sobre dispositivos activos de subredes y direccionamiento IPv4 o IPv6.' },
    { code: 'GA4-220501104-AA2-EV01', compCode: '220501104', aaKey: 'AA2', description: 'Evidencia de producto: Archivo de simulación de configuración de dispositivos activos con tecnologías WAN, VLAN y enrutamientos.' },
    { code: 'GA4-220501104-AA2-EV02', compCode: '220501104', aaKey: 'AA2', description: 'Evidencia de producto: Informe práctica de laboratorio sobre configuración de dispositivos activos para tecnologías WAN, VLAN y enrutamientos.' },
    { code: 'GA4-220501107-AA1-EV01', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo sobre configuración de componentes inalámbricos.' },
    { code: 'GA4-220501107-AA1-EV02', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo sobre configuración de parámetros de integración en red cableada.' },
    { code: 'GA4-220501107-AA1-EV03', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Lista de verificación para canales de comunicación inalámbrica.' },
    { code: 'GA4-220501107-AA1-EV04', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo del funcionamiento de la red inalámbrica implementada (práctica de laboratorio).' },
    { code: 'GA4-240201524-AA1-EV01', compCode: '240201524', aaKey: 'AA1', description: 'Evidencia de conocimiento: Video. ¿Cómo nos comunicamos a través del discurso?' },
    { code: 'GA4-240201524-AA2-EV01', compCode: '240201524', aaKey: 'AA2', description: 'Evidencia de desempeño: Video. La comunicación como expresión humana.' },
    { code: 'GA4-240201524-AA3-EV01', compCode: '240201524', aaKey: 'AA3', description: 'Evidencia de desempeño: Infografía. Comunicación de la interpretación del entorno.' },
    { code: 'GA4-240201524-AA4-EV01', compCode: '240201524', aaKey: 'AA4', description: 'Evidencia de producto: Informe. Creación de contenidos comunicativos.' },
    { code: 'GA4-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA4-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Audio.' },
    { code: 'GA4-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de desempeño: Foro.' },
    { code: 'GA4-240202501-AA2-EV01', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA4-240202501-AA2-EV02', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de producto: Audio.' },
    { code: 'GA4-240202501-AA2-EV03', compCode: '240202501', aaKey: 'AA2', description: 'Evidencia de desempeño: Foro.' },
    { code: 'GA5-220501106-AA1-EV01', compCode: '220501106', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo sobre la configuración e instalación de sistemas operativos en equipos de cómputo.' },
    { code: 'GA5-220501106-AA1-EV02', compCode: '220501106', aaKey: 'AA1', description: 'Evidencia de producto: Informe técnico sobre equipos de cómputo y sistemas operativos.' },
    { code: 'GA5-240201064-AA1-EV01', compCode: '240201064', aaKey: 'AA1', description: 'Evidencia de producto: Mapa mental.' },
    { code: 'GA5-240201064-AA2-EV01', compCode: '240201064', aaKey: 'AA2', description: 'Evidencia de desempeño, conocimiento y producto: Propuesta de investigación.' },
    { code: 'GA5-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Cuestionario.' },
    { code: 'GA5-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Mapa mental.' },
    { code: 'GA5-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de desempeño: Blog.' },
    { code: 'GA6-220501106-AA1-EV01', compCode: '220501106', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo de la implementación de mecanismos de comunicación e interconexión.' },
    { code: 'GA6-220501091-AA1-EV01', compCode: '220501091', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo de la configuración de equipos y software de VoIP.' },
    { code: 'GA6-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Diagrama de flujo.' },
    { code: 'GA6-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Ensayo.' },
    { code: 'GA6-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Vídeo.' },
    { code: 'GA7-220501105-AA1-EV01', compCode: '220501105', aaKey: 'AA1', description: 'Evidencia de producto: Video expositivo sobre configuración de equipos y software, involucrados en la plataforma de gestión y monitoreo.' },
    { code: 'GA7-220501105-AA1-EV02', compCode: '220501105', aaKey: 'AA1', description: 'Evidencia de producto: Informe práctica de laboratorio sobre la configuración de la plataforma implementada, configurada y funcional.' },
    { code: 'GA7-220501014-AA1-EV01', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de producto: Informe práctica sobre componentes de hardware y software de seguridad de la red.' },
    { code: 'GA7-220501014-AA1-EV02', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de producto: Informe de implementación de políticas, controles y procedimientos.' },
    { code: 'GA7-230101507-AA1-EV01', compCode: '230101507', aaKey: 'AA1', description: 'Evidencia de desempeño: Foro temático - Identificar y establecer las técnicas de coordinación motriz.' },
    { code: 'GA7-230101507-AA2-EV01', compCode: '230101507', aaKey: 'AA2', description: 'Evidencia de producto: Infografía – Estilos de vida saludable.' },
    { code: 'GA7-230101507-AA3-EV01', compCode: '230101507', aaKey: 'AA3', description: 'Evidencia de producto: Ficha antropométrica de valoración de la condición física.' },
    { code: 'GA7-230101507-AA4-EV01', compCode: '230101507', aaKey: 'AA4', description: 'Evidencia de producto: Folleto de lesiones más comunes en el trabajo o vida cotidiana, y la importancia de las pausas activas.' },
    { code: 'GA7-240202501-AA1-EV01', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Documento escrito.' },
    { code: 'GA7-240202501-AA1-EV02', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de producto: Video.' },
    { code: 'GA7-240202501-AA1-EV03', compCode: '240202501', aaKey: 'AA1', description: 'Evidencia de desempeño: Foro.' },
  ],
  'Fase 4: Evaluación': [
    { code: 'GA8-220501104-AA1-EV01', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de conocimiento: Taller sobre indicadores y medidas de desempeño de la red.' },
    { code: 'GA8-220501104-AA1-EV02', compCode: '220501104', aaKey: 'AA1', description: 'Evidencia de producto: Informe sobre las pruebas de conectividad, disponibilidad, rendimiento y calidad de la red.' },
    { code: 'GA8-220501104-AA2-EV01', compCode: '220501104', aaKey: 'AA2', description: 'Evidencia de producto: Informe sobre detección de fallas en el funcionamiento de la red.' },
    { code: 'GA8-220501107-AA1-EV01', compCode: '220501107', aaKey: 'AA1', description: 'Evidencia de producto: Lista de verificación para validar parámetros de calidad, velocidad de transmisión, ancho de banda, uso de canales y frecuencias de transmisión.' },
    { code: 'GA8-220601501-AA1-EV01', compCode: '220601501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Análisis de caso de situaciones que se presentan en el contexto ambiental y del SST.' },
    { code: 'GA8-220601501-AA2-EV01', compCode: '220601501', aaKey: 'AA2', description: 'Evidencia de producto: Diagrama de Ishikawa o Espina de pescado, sobre las estrategias para la prevención y control de los impactos ambientales, accidentes y enfermedades laborales (ATEL).' },
    { code: 'GA8-220601501-AA3-EV01', compCode: '220601501', aaKey: 'AA3', description: 'Evidencia de conocimiento: Mapa mental respecto a los planes y acciones establecidos en medio ambiente y SST.' },
    { code: 'GA8-220601501-AA4-EV01', compCode: '220601501', aaKey: 'AA4', description: 'Evidencia de producto: Video expositivo sobre oportunidades de mejora en medio ambiente y SST.' },
    { code: 'GA9-220501106-AA1-EV01', compCode: '220501106', aaKey: 'AA1', description: 'Evidencia de producto: Informe sobre detección de fallos en el rendimiento y operación de la solución.' },
    { code: 'GA9-220501106-AA2-EV01', compCode: '220501106', aaKey: 'AA2', description: 'Evidencia de producto: Bitácora de eventos de infraestructura y plataformas.' },
    { code: 'GA9-220501106-AA2-EV02', compCode: '220501106', aaKey: 'AA2', description: 'Evidencia de producto: Informe de actualización de componentes de hardware y software de los equipos de cómputo.' },
    { code: 'GA10-220501091-AA1-EV01', compCode: '220501091', aaKey: 'AA1', description: 'Evidencia de producto: Lista de chequeo para verificación de pruebas de funcionamiento de infraestructura de voz y datos.' },
    { code: 'GA10-220501091-AA2-EV01', compCode: '220501091', aaKey: 'AA2', description: 'Evidencia de producto: Bitácora de actividades y eventos del sistema de tecnología de VoIP.' },
    { code: 'GA10-240201529-AA1-EV01', compCode: '240201529', aaKey: 'AA1', description: 'Evidencia de conocimiento: Conociendo mi visión.' },
    { code: 'GA10-240201529-AA2-EV01', compCode: '240201529', aaKey: 'AA2', description: 'Evidencia de desempeño: Taller identificación del problema.' },
    { code: 'GA10-240201529-AA3-EV01', compCode: '240201529', aaKey: 'AA3', description: 'Evidencia de producto: Prototipo de la solución.' },
    { code: 'GA10-240201529-AA3-EV02', compCode: '240201529', aaKey: 'AA3', description: 'Evidencia de desempeño: Plan de acción.' },
    { code: 'GA10-240201529-AA4-EV01', compCode: '240201529', aaKey: 'AA4', description: 'Evidencia de producto: Taller de negociación y modelo de negocio básico.' },
    { code: 'GA11-220501014-AA1-EV01', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de producto: Informe de análisis de alertas y mensajes emitidos por los sistemas de detección de intrusos.' },
    { code: 'GA11-220501014-AA1-EV02', compCode: '220501014', aaKey: 'AA1', description: 'Evidencia de producto: Lista de chequeo para supervisar la infraestructura y los servicios de red de una organización.' },
    { code: 'GA11-220501014-AA2-EV01', compCode: '220501014', aaKey: 'AA2', description: 'Evidencia de producto: Informe de hallazgos del análisis de vulnerabilidades y amenazas.' },
    { code: 'GA11-220501014-AA2-EV02', compCode: '220501014', aaKey: 'AA2', description: 'Evidencia de producto: Informe de monitoreo del estado de la red.' },
    { code: 'GA11-210201501-AA1-EV01', compCode: '210201501', aaKey: 'AA1', description: 'Evidencia de conocimiento: Taller.' },
    { code: 'GA11-210201501-AA1-EV02', compCode: '210201501', aaKey: 'AA1', description: 'Evidencia de desempeño: Foro sobre características del trabajo en contexto local.' },
    { code: 'GA11-210201501-AA2-EV01', compCode: '210201501', aaKey: 'AA2', description: 'Evidencia de producto: Informe sobre trabajo decente, ciudadanía laboral, derechos individuales y colectivos en el trabajo.' },
    { code: 'GA11-210201501-AA2-EV02', compCode: '210201501', aaKey: 'AA2', description: 'Evidencia de desempeño: Foro sobre el convenio colectivo del trabajo y la libertad sindical.' },
    { code: 'GA11-210201501-AA2-EV03', compCode: '210201501', aaKey: 'AA2', description: 'Evidencia de conocimiento: Gráfico sobre la negociación colectiva.' },
    { code: 'GA11-210201501-AA2-EV04', compCode: '210201501', aaKey: 'AA2', description: 'Evidencia de conocimiento: Infografía sobre la huelga.' },
    { code: 'GA11-210201501-AA3-EV01', compCode: '210201501', aaKey: 'AA3', description: 'Evidencia de conocimiento: Mapa mental violación de derechos del trabajo.' },
    { code: 'GA11-210201501-AA3-EV02', compCode: '210201501', aaKey: 'AA3', description: 'Evidencia de desempeño: Foro estudio de caso.' },
    { code: 'GA11-210201501-AA3-EV03', compCode: '210201501', aaKey: 'AA3', description: 'Evidencia de conocimiento: Cuadro comparativo sobre el derecho de petición y la acción de tutela.' },
    { code: 'GA11-210201501-AA3-EV04', compCode: '210201501', aaKey: 'AA3', description: 'Evidencia de conocimiento: Texto argumentativo.' },
    { code: 'GA11-210201501-AA4-EV01', compCode: '210201501', aaKey: 'AA4', description: 'Evidencia de desempeño: Foro Estado social de derecho.' },
    { code: 'GA11-210201501-AA4-EV02', compCode: '210201501', aaKey: 'AA4', description: 'Evidencia de producto: Presentación.' },
    { code: 'GA12-220501105-AA1-EV01', compCode: '220501105', aaKey: 'AA1', description: 'Evidencia de producto: Lista de verificación del alistamiento y configuración de la plataforma de gestión y monitoreo.' },
    { code: 'GA12-240201526-AA1-EV01', compCode: '240201526', aaKey: 'AA1', description: 'Evidencia de producto: Presentación del proyecto de vida.' },
    { code: 'GA12-240201526-AA2-EV01', compCode: '240201526', aaKey: 'AA2', description: 'Evidencia de desempeño: Diagrama de sistemas.' },
    { code: 'GA12-240201526-AA3-EV01', compCode: '240201526', aaKey: 'AA3', description: 'Evidencia de producto: Estrategia para el uso racional de los recursos naturales.' },
    { code: 'GA12-240201526-AA4-EV01', compCode: '240201526', aaKey: 'AA4', description: 'Evidencia de producto: Solución del caso.' },
  ],
};

/** Mapa de rapCode → info para búsqueda rápida */
const RAP_LOOKUP = new Map<string, CronogramaRap>();
Object.values(FASE_RAPS).forEach(raps => raps.forEach(r => RAP_LOOKUP.set(r.rapCode, r)));

/** Devuelve la info estática de un RAP dado su código ("220501014-01") */
const getRapStaticInfo = (rapCode: string): CronogramaRap | undefined => RAP_LOOKUP.get(rapCode);

/** Identificadores cortos de competencias: CO-01, CO-02, … en el orden de COMPETENCIA_NAMES */
const COMPETENCIA_IDS: Record<string, string> = Object.fromEntries(
  Object.keys(COMPETENCIA_NAMES).map((code, i) => [code, `CO-${String(i + 1).padStart(2, '0')}`])
);

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeHeader = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeDoc = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const numeric = Math.trunc(value).toString();
    return numeric.replace(/^0+/, '') || '0';
  }
  const strValue = String(value).trim();
  if (!strValue) return '';
  const numeric = Number(strValue);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    const num = Math.trunc(numeric).toString();
    return num.replace(/^0+/, '') || '0';
  }
  const digits = strValue.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

const buildNameKey = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const scoreToLetter = (score: number): 'A' | 'D' => (score >= PASSING_SCORE ? 'A' : 'D');

const EXCLUDED_ACTIVITY_HEADERS = new Set([
  'nombre s',
  'nombres',
  'apellido s',
  'apellidos',
  'nombre de usuario',
  'usuario',
  'username',
  'institucion',
  'departamento',
  'correo electronico',
  'correo',
  'email',
  'ultima descarga de este curso',
]);

const BASE_COMPUTED_HEADERS = new Set(['pendientes', 'final', 'rap1', 'rap2', 'rap3', 'rap4', 'rap5']);

const normalizeHeaderKey = (value: string) => normalizeHeader(value).replace(/\s+/g, '');

/** Detecta si la columna es de nota/promedio (real) o de letra (A/D). Cada evidencia viene en dos columnas = una sola evidencia. */
const splitActivityHeader = (header: string): { baseName: string; kind: 'real' | 'letter' | 'score' } => {
  const raw = header.trim();
  if (!raw) return { baseName: raw, kind: 'score' };

  const lower = raw.toLowerCase();
  const endsWithLetra = /(\s|[\-\()])?letra\s*\)?\s*$/i.test(raw);
  const endsWithReal = /(\s|[\-\()])?(real|promedio|nota|numero|score)\s*\)?\s*$/i.test(raw);

  if (endsWithLetra && !endsWithReal) {
    const baseName = raw.replace(/\s*[\(\-\s]?letra\s*\)?\s*$/i, '').trim();
    return baseName ? { baseName, kind: 'letter' } : { baseName: raw, kind: 'score' };
  }
  if (endsWithReal) {
    const baseName = raw.replace(/\s*[\(\-\s]?(real|promedio|nota|numero|score)\s*\)?\s*$/i, '').trim();
    return baseName ? { baseName, kind: 'real' } : { baseName: raw, kind: 'score' };
  }

  const parenMatch = raw.match(/^(.+?)\s*\((real|letra)\)\s*$/i);
  if (parenMatch) {
    const baseName = parenMatch[1].trim();
    const kind = parenMatch[2].toLowerCase() === 'letra' ? 'letter' : 'real';
    return { baseName, kind };
  }

  return { baseName: raw, kind: 'score' };
};

/** Clave canónica por evidencia. Si el nombre contiene un código SENA completo (GA/GI + fase, ej: GA1-220501014-AA1-EV01 o GI1-240201530-AA1-EV01),
 *  usa ese código normalizado como clave para evitar colisiones entre evidencias de distintos GAs/GIs
 *  que comparten el mismo AA#-EV##. Para nombres simples como "EV01" o "Evidencia 01" usa solo el número. */
const getCanonicalEvidenceKey = (baseName: string): string => {
  const trimmed = baseName.trim();
  // Código completo fase técnica (GA) o inducción (GI): G[AI]#-######-AA#-EV##
  const senaFullMatch = trimmed.match(/G[AI]\d+-\d+-AA\d+-EV\d+/i);
  if (senaFullMatch) return normalizeText(senaFullMatch[0]);
  // Código parcial con AA: AA#-EV##
  const aaEvMatch = trimmed.match(/AA\d+-EV(\d+)/i);
  if (aaEvMatch) return normalizeText(aaEvMatch[0]);
  // Nombre simple: EV## o Evidencia ##
  const evMatch = trimmed.match(/ev(idencia)?\s*(\d+)/i);
  if (evMatch) return 'ev' + String(parseInt(evMatch[2], 10));
  const numMatch = trimmed.match(/(\d+)/);
  if (numMatch) return 'ev' + String(parseInt(numMatch[1], 10));
  return normalizeText(trimmed) || trimmed;
};

/** Versión segura de getCanonicalEvidenceKey para GradeActivity.
 *  Concatena `name` y `detail` para garantizar que el código GA en `name`
 *  sea hallado aunque `detail` sea una descripción larga sin código. */
const getActivityCanonicalKey = (a: { name: string; detail?: string | null }): string =>
  getCanonicalEvidenceKey(`${a.name} ${a.detail ?? ''}`);

/** Clave estable por actividad para mapas en vista "Todas las fases" (y mezcla ficha+global).
 *  Incluye fase + clave canónica + id para que varias evidencias mal nombradas (p. ej. tres "EV01")
 *  en la misma fase no colapsen en una sola columna. */
const getActivityPhaseScopedKey = (a: { id: string; phase?: string | null; name: string; detail?: string | null }) =>
  `${a.phase || 'Sin fase'}::${getActivityCanonicalKey(a)}::${a.id}`;

const getActivityShortLabel = (name: string) => {
  const aaEv = name.match(/AA\d+-EV\d+/i);
  if (aaEv) return aaEv[0].toUpperCase();
  const match = name.match(/EV\d+/i);
  return match ? match[0].toUpperCase() : name;
};

/** Extrae tipo de evidencia del texto de descripción */
const getTipoBadge = (detail?: string | null): { bg: string; text: string; label: string } | null => {
  if (!detail) return null;
  const d = detail.toLowerCase();
  if (d.includes('conocimiento')) return { bg: '#dbeafe', text: '#1e40af', label: 'Conocimiento' };
  if (d.includes('producto'))     return { bg: '#dcfce7', text: '#166534', label: 'Producto' };
  if (d.includes('desempeño'))    return { bg: '#ffedd5', text: '#9a3412', label: 'Desempeño' };
  return null;
};

/** Devuelve el tipo de evidencia ('Conocimiento' | 'Producto' | 'Desempeño' | null) de una actividad */
const getEvidenceTipo = (activity: { detail?: string | null; name?: string }): string | null => {
  const raw = `${activity.detail ?? ''} ${activity.name ?? ''}`.toLowerCase();
  if (raw.includes('conocimiento')) return 'Conocimiento';
  if (raw.includes('producto'))     return 'Producto';
  if (raw.includes('desempeño'))    return 'Desempeño';
  return null;
};

const EVIDENCE_TIPO_OPTIONS: Array<{ value: string; label: string; bg?: string; text?: string }> = [
  { value: 'Todos',        label: 'Todos los tipos' },
  { value: 'Conocimiento', label: 'Conocimiento', bg: '#dbeafe', text: '#1e40af' },
  { value: 'Producto',     label: 'Producto',     bg: '#dcfce7', text: '#166534' },
  { value: 'Desempeño',    label: 'Desempeño',    bg: '#ffedd5', text: '#9a3412' },
];

/** Mapeo código de competencia → color y etiqueta de área */
const COMP_TO_AREA_COLOR: Record<string, { color: string; label: string }> = {
  '220501014': { color: '#f59e0b', label: 'Técnica' },
  '220501046': { color: '#4CAF50', label: "TIC's" },
  '220501091': { color: '#f59e0b', label: 'Técnica' },
  '220501104': { color: '#f59e0b', label: 'Técnica' },
  '220501105': { color: '#f59e0b', label: 'Técnica' },
  '220501106': { color: '#f59e0b', label: 'Técnica' },
  '220501107': { color: '#f59e0b', label: 'Técnica' },
  '240202501': { color: '#F44336', label: 'Bilingüismo' },
  '240201528': { color: '#F48FB1', label: 'Matemáticas' },
  '240201064': { color: '#FF9800', label: 'Investigación' },
  '240201524': { color: '#9C27B0', label: 'Comunicación' },
  '240201526': { color: '#9C27B0', label: 'Comunicación' },
  '210201501': { color: '#9C27B0', label: 'Comunicación' },
  '220601501': { color: '#2196F3', label: 'Ambiente' },
  '230101507': { color: '#9E9E9E', label: 'Edu. Física' },
  '240201529': { color: '#009688', label: 'Emprendimiento' },
  '220201501': { color: '#78909C', label: 'Ciencias Naturales' },
  '240201530': { color: '#8b5cf6', label: 'EEF' },
};
const getAreaFromComp = (compCode?: string | null) =>
  compCode ? (COMP_TO_AREA_COLOR[compCode] ?? null) : null;

const parseScoreValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric;
};

export const CalificacionesView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [selectedFicha, setSelectedFicha] = useState<string>('Todas');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [editingActivity, setEditingActivity] = useState<GradeActivity | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<GradeActivity | null>(null);
  const [hiddenActivityIds, setHiddenActivityIds] = useState<Set<string>>(new Set());
  const [showHiddenActivities, setShowHiddenActivities] = useState(true);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadInfo, setUploadInfo] = useState<string>('');
  const [lastUpload, setLastUpload] = useState<string>(
    () => localStorage.getItem('asistenciapro_grades_last_upload') || ''
  );

  const saveUploadTimestamp = () => {
    const now = new Date();
    const label = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('asistenciapro_grades_last_upload', label);
    setLastUpload(label);
  };
  const [editingCell, setEditingCell] = useState<{ studentId: string; activityId: string } | null>(null);
  const [editingScore, setEditingScore] = useState<string>('');
  const [rapNotes, setRapNotes] = useState<Record<string, Record<string, string>>>({});
  const [rapModal, setRapModal] = useState<{ key: string; text: string } | null>(null);
  const [compDetailModal, setCompDetailModal] = useState<{ compCode: string } | null>(null);
  const [hiddenCompCodes, setHiddenCompCodes] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('asistenciapro_hidden_comps') || '{}'); }
    catch { return {}; }
  });
  const [compVisibilityOpen, setCompVisibilityOpen] = useState(false);
  const [rapColumns, setRapColumns] = useState<Record<string, string[]>>({});
  const [juiciosEvaluativos, setJuiciosEvaluativos] = useState<Record<string, Record<string, 'orange' | 'green'>>>({});
  const [manualFinals, setManualFinals] = useState<ManualFinals>({});
  const [manualPhaseTotals, setManualPhaseTotals] = useState<ManualFinals>({});
  const [pendingDetailsStudent, setPendingDetailsStudent] = useState<{ studentId: string; name: string; group?: string } | null>(null);
  const [rapManagerOpen, setRapManagerOpen] = useState(false);
  const [rapNewName, setRapNewName] = useState('');
  const [rapNewDetail, setRapNewDetail] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname' | 'daysInactive'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showFichaFilter, setShowFichaFilter] = useState(false);
  const [showPhaseFilter, setShowPhaseFilter] = useState(false);
  const fichaFilterRef = useRef<HTMLDivElement | null>(null);
  const phaseFilterRef = useRef<HTMLDivElement | null>(null);
  const evidenceFilterRef = useRef<HTMLDivElement | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [finalFilter, setFinalFilter] = useState<'all' | 'A' | '-'>('all');
  const [showFinalFilter, setShowFinalFilter] = useState(false);
  const finalFilterRef = useRef<HTMLDivElement | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [activityDetailModal, setActivityDetailModal] = useState<GradeActivity | null>(null);
  const [activityDetailText, setActivityDetailText] = useState('');
  const [clearPhaseConfirm, setClearPhaseConfirm] = useState<string | null>(null);
  const [studentDetailModal, setStudentDetailModal] = useState<Student | null>(null);
  const [evidenceCompMap, setEvidenceCompMap] = useState<EvidenceCompMapData>({});
  const [studentDetailObservation, setStudentDetailObservation] = useState('');
  const activityNameRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedFichaRef = useRef<string>('');
  const phases = [
    'Fase Inducción',
    'Fase 1: Análisis',
    'Fase 2: Planeación',
    'Fase 3: Ejecución',
    'Fase 4: Evaluación',
  ];
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  /** Áreas de competencia seleccionadas (vacío = todas) */
  const [califEvidenceAreaFilters, setCalifEvidenceAreaFilters] = useState<string[]>([]);
  /** Tipo de evidencia: 'Todos' | 'Conocimiento' | 'Producto' | 'Desempeño' */
  const [califEvidenceTipoFilter, setCalifEvidenceTipoFilter] = useState<string>('Todos');
  /** Vacío = todas las evidencias del contexto (área + ficha/fase); si no, solo ids listados */
  const [califSelectedEvidenceIdList, setCalifSelectedEvidenceIdList] = useState<string[]>([]);
  const [califEvidencePickerOpen, setCalifEvidencePickerOpen] = useState(false);
  const [califEvidenceSearch, setCalifEvidenceSearch] = useState('');

  // Derived: '' or all phases → ALL_PHASES_VIEW; single selection → that phase string
  const effectiveSinglePhase = selectedPhases.length === 1 ? selectedPhases[0] : ALL_PHASES_VIEW;
  const exportPhaseSlug = selectedPhases.length > 1
    ? 'multiples_fases'
    : effectiveSinglePhase.replace(/[^a-z0-9]/gi, '_');
  const exportPhaseTitle = selectedPhases.length > 1
    ? `Múltiples fases (${selectedPhases.length})`
    : effectiveSinglePhase;

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const toggleHideActivity = (activity: GradeActivity) => {
    const newSet = new Set(hiddenActivityIds);
    if (newSet.has(activity.id)) {
      newSet.delete(activity.id);
    } else {
      newSet.add(activity.id);
    }
    const ids = Array.from(newSet);
    saveHiddenGradeActivityIds(ids);
    setHiddenActivityIds(newSet);
  };

  const handleSort = (column: 'lastname' | 'firstname' | 'daysInactive') => {
    if (sortOrder === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  useEffect(() => {
    selectedFichaRef.current = selectedFicha;
  }, [selectedFicha]);

  const loadData = () => {
    const HIDDEN_RESET_FLAG = 'asistenciapro_calificaciones_show_all_evidence_v1';
    if (!localStorage.getItem(HIDDEN_RESET_FLAG)) {
      saveHiddenGradeActivityIds([]);
      localStorage.setItem(HIDDEN_RESET_FLAG, '1');
    }
    const loadedStudents = getStudents();
    const loadedFichas = getFichas();
    const loadedActivities = getGradeActivities();
    const loadedGrades = getGrades();
    const loadedRapNotes = getRapNotes();
    const loadedRapColumns = getRapColumns();
    const loadedJuicios = getJuiciosEvaluativos();
    setStudents(loadedStudents);
    setFichas(loadedFichas);
    setActivities(loadedActivities);
    setGrades(loadedGrades);
    setRapNotes(loadedRapNotes);
    setRapColumns(loadedRapColumns);
    setJuiciosEvaluativos(loadedJuicios);
    setManualFinals(getManualFinals());
    setManualPhaseTotals(getManualPhaseTotals());
    setEvidenceCompMap(getEvidenceCompMap());
    setLmsLastAccess(getLmsLastAccess());
    setHiddenActivityIds(new Set(getHiddenGradeActivityIds()));
    if (loadedFichas.length > 0 && selectedFichaRef.current === '') {
      setSelectedFicha('Todas');
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  useEffect(() => {
    const existing = getGradeActivities();
    const toDelete = existing.filter(activity => {
      const normalized = normalizeHeader(activity.name);
      return EXCLUDED_ACTIVITY_HEADERS.has(normalized);
    });
    if (toDelete.length > 0) {
      console.warn(`[Calificaciones] Eliminando ${toDelete.length} actividades excluidas:`, toDelete.map(a => a.name));
      toDelete.forEach(activity => deleteGradeActivity(activity.id));
    } else {
      console.log(`[Calificaciones] Limpieza: ninguna actividad excluida de ${existing.length} totales`);
    }
  }, []);

  useEffect(() => {
    const existingActivities = getGradeActivities();
    if (existingActivities.length === 0) return;

    const existingGrades = getGrades();
    const groups = new Map<string, GradeActivity[]>();
    existingActivities.forEach(activity => {
      const baseName = splitActivityHeader(activity.name).baseName;
      const key = `${activity.group}::${normalizeText(baseName)}`;
      const list = groups.get(key) || [];
      list.push(activity);
      groups.set(key, list);
    });

    let activitiesChanged = false;
    let gradesChanged = false;
    const activitiesToKeep: GradeActivity[] = [];
    const activityIdMap = new Map<string, string>();

    groups.forEach(list => {
      if (list.length === 1) {
        activitiesToKeep.push(list[0]);
        return;
      }
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const primary = sorted[0];
      activitiesToKeep.push(primary);
      sorted.slice(1).forEach(dup => {
        activityIdMap.set(dup.id, primary.id);
      });
      activitiesChanged = true;
    });

    if (activitiesChanged) {
      const mergedGrades = new Map<string, GradeEntry>();
      existingGrades.forEach(grade => {
        const mappedActivityId = activityIdMap.get(grade.activityId) || grade.activityId;
        const key = `${grade.studentId}-${mappedActivityId}`;
        const current = mergedGrades.get(key);
        if (!current) {
          mergedGrades.set(key, { ...grade, activityId: mappedActivityId });
          return;
        }
        const currentDate = new Date(current.updatedAt).getTime();
        const nextDate = new Date(grade.updatedAt).getTime();
        if (nextDate >= currentDate) {
          mergedGrades.set(key, { ...grade, activityId: mappedActivityId });
        }
      });
      const mergedList = Array.from(mergedGrades.values());
      saveGradeActivities(activitiesToKeep);
      saveGrades(mergedList);
      gradesChanged = true;
    }

    if (activitiesChanged || gradesChanged) {
      loadData();
    }
  }, []);

  const studentsForFicha = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = students.filter(s => {
      const matchSearch = !term || (() => {
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
        const doc = String(s.documentNumber || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        return fullName.includes(term) || doc.includes(term) || email.includes(term);
      })();
      if (!matchSearch) return false;
      const matchStatus = filterStatus === 'Todos' || (s.status || 'Formación') === filterStatus;
      if (!matchStatus) return false;
      // Si hay búsqueda, mostrar aprendices de todas las fichas; si no, filtrar por ficha seleccionada
      if (term) return true;
      return selectedFicha === 'Todas' || (s.group || 'General') === selectedFicha;
    });
    return [...filtered].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      let cmp = 0;
      if (sortOrder === 'lastname') {
        cmp = a.lastName.localeCompare(b.lastName, 'es');
        if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName, 'es');
      } else if (sortOrder === 'firstname') {
        cmp = a.firstName.localeCompare(b.firstName, 'es');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName, 'es');
      } else {
        const lastA = lmsLastAccess[a.id];
        const lastB = lmsLastAccess[b.id];
        const daysA = lastA != null ? daysSinceLms(lastA) : -1;
        const daysB = lastB != null ? daysSinceLms(lastB) : -1;
        cmp = daysA - daysB;
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName, 'es');
      }
      return direction * cmp;
    });
  }, [students, selectedFicha, searchTerm, filterStatus, sortOrder, sortDirection, lmsLastAccess]);


  useEffect(() => {
    setSelectedStudents(new Set());
  }, [selectedFicha, selectedPhases, searchTerm, filterStatus]);

  useEffect(() => {
    if (!showFichaFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (fichaFilterRef.current && !fichaFilterRef.current.contains(event.target as Node)) {
        setShowFichaFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFichaFilter]);

  useEffect(() => {
    if (!showPhaseFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (phaseFilterRef.current && !phaseFilterRef.current.contains(event.target as Node)) {
        setShowPhaseFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPhaseFilter]);

  useEffect(() => {
    if (!califEvidencePickerOpen) {
      setCalifEvidenceSearch('');
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (evidenceFilterRef.current && !evidenceFilterRef.current.contains(event.target as Node)) {
        setCalifEvidencePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [califEvidencePickerOpen]);

  useEffect(() => {
    if (studentDetailModal) {
      setStudentDetailObservation(getStudentGradeObservations()[studentDetailModal.id] ?? '');
    }
  }, [studentDetailModal]);

  // Auto-inicializar columnas RAP desde el cronograma cuando son genéricas o vacías
  useEffect(() => {
    if (selectedFicha === 'Todas') return;
    const key = `${selectedFicha}::${effectiveSinglePhase}`;
    const existing = rapColumns[key] || rapColumns[selectedFicha] || [];
    const isGenericOrEmpty =
      existing.length === 0 || existing.every(r => /^RAP\s*\d+$/i.test(r.trim()));
    if (!isGenericOrEmpty) return;

    const phaseRaps = FASE_RAPS[effectiveSinglePhase];
    if (!phaseRaps || phaseRaps.length === 0) return;

    const rapCodes = phaseRaps.map(r => r.rapCode);
    const current = getRapColumns();
    saveRapColumns({ ...current, [key]: rapCodes });
  }, [selectedFicha, selectedPhases]);

  // Seed default evidence columns for ALL phases on mount (runs once)
  useEffect(() => {
    // Build a lookup from code → description for migration
    const descByCode: Record<string, string> = {};
    Object.values(FASE_EVIDENCES).forEach(evs => evs.forEach(ev => { descByCode[ev.code] = ev.description; }));

    const existing = getGradeActivities();
    const toAdd: GradeActivity[] = [];
    const byEvKey: Record<string, import('../services/db').EvCompEntry> = {};
    const compOrder: string[] = [];
    const now = new Date().toISOString();

    // Codes that were incorrectly seeded and must be removed
    const OBSOLETE_SEED_IDS = new Set([
      'seed-GI1-240201530-AA2-EV03',
      'seed-GI1-240201530-AA3-EV01',
      'seed-GI1-PM-EV01',
      'seed-GA1-240201530-AA2-EV01',
      'seed-GA1-240201530-AA3-EV01',
      'seed-GA1-240201530-AA4-EV01',
      'seed-GA1-240201530-AA4-EV02',
    ]);

    // Migrate already-seeded activities that still have code as detail
    const hadObsolete = existing.some(a => OBSOLETE_SEED_IDS.has(a.id));
    let needsMigration = hadObsolete;
    const migrated = existing.filter(a => !OBSOLETE_SEED_IDS.has(a.id)).map(a => {
      if (a.id.startsWith('seed-')) {
        const codeFromId = a.id.slice('seed-'.length);
        if (/^G[AI]\d+-\d+-AA\d+-EV\d+$/i.test(codeFromId) && a.name !== codeFromId) {
          needsMigration = true;
          return {
            ...a,
            name: codeFromId,
            detail: descByCode[codeFromId] ?? a.detail,
          };
        }
      }
      if (a.id.startsWith('seed-') && descByCode[a.name] && a.detail === a.name) {
        needsMigration = true;
        return { ...a, detail: descByCode[a.name] };
      }
      return a;
    });

    Object.entries(FASE_EVIDENCES).forEach(([phase, faseEvs]) => {
      faseEvs.forEach(ev => {
        if (migrated.some(a => a.id === `seed-${ev.code}`)) return;
        toAdd.push({
          id: `seed-${ev.code}`,
          name: ev.code,
          detail: ev.description,
          group: '',
          phase,
          maxScore: 100,
          createdAt: now,
        });
        const canonicalKey = getCanonicalEvidenceKey(ev.code);
        byEvKey[canonicalKey] = {
          competenciaCode: ev.compCode,
          competenciaName: COMPETENCIA_NAMES[ev.compCode] || ev.compCode,
          aaKey: ev.aaKey,
          aaName: FASE_RAPS[phase]?.find(r => r.compCode === ev.compCode && r.aaKey === ev.aaKey)?.rapName || ev.aaKey,
        };
        if (!compOrder.includes(ev.compCode)) compOrder.push(ev.compCode);
      });
    });

    if (toAdd.length === 0 && !needsMigration) return;
    saveGradeActivities([...migrated, ...toAdd]);

    const existingMap = getEvidenceCompMap();
    const existingGlobal = existingMap[''] || { byEvKey: {}, compOrder: [] };
    saveEvidenceCompMap({
      ...existingMap,
      '': {
        byEvKey: { ...byEvKey, ...existingGlobal.byEvKey },
        compOrder: [...new Set([...compOrder, ...existingGlobal.compOrder])],
      },
    });
  }, []);

  // ── One-time deduplication: remove non-seed activities that shadow a seed ──
  // Runs after the seed init (both have [] deps so they run in order).
  // Remaps grades from duplicate IDs to the matching seed ID, then deletes the duplicates.
  useEffect(() => {
    const all = getGradeActivities();

    // Build seed lookup: full canonical key + phase-scoped partial AA-EV key + Sofia Plus aliases
    const seedByKey = new Map<string, GradeActivity>();
    // Build alias map: sofiaAliases canonical key → seed SENA code
    const aliasBySeedCode = new Map<string, string[]>(); // seedId → alias canonical keys
    Object.values(FASE_EVIDENCES).forEach(evs => evs.forEach(ev => {
      if (ev.sofiaAliases) aliasBySeedCode.set(`seed-${ev.code}`, ev.sofiaAliases.map(a => getCanonicalEvidenceKey(a)));
    }));
    all.filter(a => a.id.startsWith('seed-')).forEach(a => {
      const fullKey = getActivityCanonicalKey(a);
      seedByKey.set(fullKey, a);
      // Phase-scoped partial: lets "Fase Inducción::aa1-ev01" match "GI1-...-AA1-EV01"
      const partial = fullKey.match(/aa\d+-ev\d+/i)?.[0]?.toLowerCase();
      if (partial && a.phase) seedByKey.set(`${a.phase}::${partial}`, a);
      // Sofia Plus aliases (e.g. AA3-EV01 → GI1-240201530-AA2-EV03)
      aliasBySeedCode.get(a.id)?.forEach(aliasKey => {
        seedByKey.set(aliasKey, a);
        if (a.phase) seedByKey.set(`${a.phase}::${aliasKey}`, a);
      });
    });

    const toRemoveIds = new Set<string>();
    const gradeRemap = new Map<string, string>(); // duplicateId → seedId

    all.filter(a => !a.id.startsWith('seed-')).forEach(a => {
      const canonKey = getActivityCanonicalKey(a);
      // 1. Try exact canonical key match
      let seed = seedByKey.get(canonKey);
      // 2. Fallback: phase-scoped partial key
      if (!seed && a.phase) {
        const partial = canonKey.match(/aa\d+-ev\d+/i)?.[0]?.toLowerCase();
        if (partial) seed = seedByKey.get(`${a.phase}::${partial}`);
      }
      if (seed) {
        toRemoveIds.add(a.id);
        gradeRemap.set(a.id, seed.id);
      }
    });

    if (toRemoveIds.size === 0) return;

    // Remap grades from duplicate IDs → seed IDs, then deduplicate (keep most recent per student+activity)
    const allGrades = getGrades();
    const remapped = allGrades.map(g =>
      gradeRemap.has(g.activityId) ? { ...g, activityId: gradeRemap.get(g.activityId)! } : g
    );
    const gradeDedup = new Map<string, GradeEntry>();
    remapped.forEach(g => {
      const k = `${g.studentId}::${g.activityId}`;
      const prev = gradeDedup.get(k);
      if (!prev || g.updatedAt >= prev.updatedAt) gradeDedup.set(k, g);
    });
    saveGrades(Array.from(gradeDedup.values()));
    saveGradeActivities(all.filter(a => !toRemoveIds.has(a.id)));
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFicha, selectedPhases, searchTerm, finalFilter, filterStatus, sortOrder, sortDirection, califEvidenceAreaFilters]);

  useEffect(() => {
    if (!showFinalFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (finalFilterRef.current && !finalFilterRef.current.contains(event.target as Node)) {
        setShowFinalFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFinalFilter]);

  useEffect(() => {
    if (!showStatusFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusFilter]);

  const hasSearchTerm = searchTerm.trim() !== '';
  const showAllFichasColumns = selectedFicha === 'Todas' || hasSearchTerm;

  /** Número de notas guardadas para la fase actualmente seleccionada (0 si no hay fase única). */
  const gradesCountForSelectedPhase = useMemo(() => {
    if (selectedPhases.length !== 1) return 0;
    const phaseIds = new Set(activities.filter(a => a.phase === selectedPhases[0]).map(a => a.id));
    return grades.filter(g => phaseIds.has(g.activityId)).length;
  }, [activities, grades, selectedPhases]);

  /**
   * En vista "Todas": construye una lista de actividades representativas
   * (una por evidencia canónica) y un mapa canonicalKey → fichaCode → activity
   * para que el render pueda encontrar la actividad correcta de cada estudiante.
   * En vista de ficha específica: devuelve directamente las actividades de esa ficha.
   */
  const { activitiesForFicha, activitiesByCanonicalAndFicha } = useMemo(() => {
    const isAllPhases = selectedPhases.length === 0;

    // En vista "todas las fases" (o multi-fase): mezclar actividades en orden de fase
    const phaseOrder = (a: GradeActivity) => {
      const idx = phases.indexOf(a.phase || phases[1]);
      return idx >= 0 ? idx : 999;
    };
    const phaseMatch = isAllPhases
      ? [...activities].sort((a, b) => {
          const diff = phaseOrder(a) - phaseOrder(b);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, undefined, { numeric: true });
        })
      : [...activities.filter(a => selectedPhases.includes(a.phase || phases[1]))].sort((a, b) => {
          const diff = phaseOrder(a) - phaseOrder(b);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, undefined, { numeric: true });
        });

    if (selectedFicha !== 'Todas') {
      const fichaSpecific = phaseMatch.filter(a => a.group === selectedFicha);
      const globals      = phaseMatch.filter(a => a.group === '');

      if (fichaSpecific.length === 0) {
        // Sin actividades propias de la ficha: mostrar todas las globales (base)
        return { activitiesForFicha: globals, activitiesByCanonicalAndFicha: null };
      }

      // Hay actividades propias: mezclar con las globales que NO tienen contraparte en la ficha.
      // Para cada clave canónica, la actividad de la ficha tiene prioridad sobre la global.
      const best = new Map<string, GradeActivity>();
      globals.forEach(a => best.set(getActivityPhaseScopedKey(a), a));
      fichaSpecific.forEach(a => best.set(getActivityPhaseScopedKey(a), a)); // sobreescribe

      // Reconstruir en el orden de phaseMatch (fase → nombre), deduplicado por fase + clave canónica
      const seen = new Set<string>();
      const result: GradeActivity[] = [];
      phaseMatch.forEach(a => {
        const k = getActivityPhaseScopedKey(a);
        if (!seen.has(k)) {
          seen.add(k);
          result.push(best.get(k)!);
        }
      });

      return { activitiesForFicha: result, activitiesByCanonicalAndFicha: null };
    }

    // Vista "Todas": agrupar por clave canónica
    // canonicalKey → Map<fichaCode, activity>
    const byCanonical = new Map<string, Map<string, GradeActivity>>();
    // canonicalKey → actividad representativa (para header y orden)
    const representative = new Map<string, GradeActivity>();

    phaseMatch.forEach(a => {
      const key = getActivityPhaseScopedKey(a);
      if (!byCanonical.has(key)) byCanonical.set(key, new Map());
      byCanonical.get(key)!.set(a.group, a);
      // Como representativa usar la primera encontrada (solo para nombre/orden)
      if (!representative.has(key)) representative.set(key, a);
    });

    // Preservar el orden por fase del phaseMatch (insertionOrder de Map)
    const unified = Array.from(representative.values());

    return { activitiesForFicha: unified, activitiesByCanonicalAndFicha: byCanonical };
  }, [activities, selectedFicha, selectedPhases]);

  /** Actividades candidatas (excl. columnas de sistema) sin filtrar por área ni por selección manual */
  const activitiesAfterSystemExclusions = useMemo(
    () =>
      activitiesForFicha.filter((activity) => {
        const normalized = normalizeHeader(activity.name);
        const headerKey = normalizeHeaderKey(activity.name);
        if (EXCLUDED_ACTIVITY_HEADERS.has(normalized) || BASE_COMPUTED_HEADERS.has(headerKey)) return false;
        return true;
      }),
    [activitiesForFicha]
  );

  const califEvAreaOptions = useMemo(
    () => buildEvidenceAreaOptions(activitiesAfterSystemExclusions),
    [activitiesAfterSystemExclusions]
  );

  const califEvidencePickerPool = useMemo(
    () =>
      activitiesAfterSystemExclusions.filter((a) =>
        (califEvidenceAreaFilters.length === 0 || califEvidenceAreaFilters.some((ar) => activityMatchesEvidenceArea(a, ar))) &&
        (califEvidenceTipoFilter === 'Todos' || getEvidenceTipo(a) === califEvidenceTipoFilter)
      ),
    [activitiesAfterSystemExclusions, califEvidenceAreaFilters, califEvidenceTipoFilter]
  );

  const califSelectedEvidenceIdSet = useMemo(
    () => new Set(califSelectedEvidenceIdList),
    [califSelectedEvidenceIdList]
  );

  useEffect(() => {
    const validAreas = new Set(califEvAreaOptions.filter((a) => a !== ALL_EVIDENCE_AREAS));
    setCalifEvidenceAreaFilters((prev) => prev.filter((a) => validAreas.has(a)));
  }, [califEvAreaOptions]);

  useEffect(() => {
    const valid = new Set(califEvidencePickerPool.map((a) => a.id));
    setCalifSelectedEvidenceIdList((prev) => prev.filter((id) => valid.has(id)));
  }, [califEvidencePickerPool]);

  const visibleActivities = useMemo(() => {
    let list = activitiesAfterSystemExclusions;
    if (!showHiddenActivities) {
      list = list.filter((a) => !hiddenActivityIds.has(a.id));
    }
    if (califEvidenceAreaFilters.length > 0) {
      list = list.filter((a) => califEvidenceAreaFilters.some((ar) => activityMatchesEvidenceArea(a, ar)));
    }
    if (califEvidenceTipoFilter !== 'Todos') {
      list = list.filter((a) => getEvidenceTipo(a) === califEvidenceTipoFilter);
    }
    if (califSelectedEvidenceIdList.length > 0) {
      list = list.filter((a) => califSelectedEvidenceIdSet.has(a.id));
    }
    return list;
  }, [
    activitiesAfterSystemExclusions,
    hiddenActivityIds,
    showHiddenActivities,
    califEvidenceAreaFilters,
    califEvidenceTipoFilter,
    califSelectedEvidenceIdList,
    califSelectedEvidenceIdSet,
  ]);

  /** Groups visibleActivities by phase in order. Used to compute per-phase totals. */
  const visiblePhaseGroups = useMemo<Array<{ phase: string; activities: GradeActivity[] }>>(() => {
    if (selectedPhases.length === 1) {
      return visibleActivities.length > 0 ? [{ phase: selectedPhases[0], activities: visibleActivities }] : [];
    }
    const groups: Array<{ phase: string; activities: GradeActivity[] }> = [];
    visibleActivities.forEach(a => {
      const ph = a.phase || 'Sin fase';
      const last = groups[groups.length - 1];
      if (last && last.phase === ph) last.activities.push(a);
      else groups.push({ phase: ph, activities: [a] });
    });
    return groups;
  }, [visibleActivities, selectedPhases]);

  const rapKey = showAllFichasColumns ? '' : `${selectedFicha}::${effectiveSinglePhase}`;

  const getRapKeyForStudent = (studentGroup: string | undefined) =>
    showAllFichasColumns && studentGroup ? `${studentGroup}::${effectiveSinglePhase}` : rapKey || `${studentGroup || ''}::${effectiveSinglePhase}`;

  const rapColumnsForFicha = useMemo(() => {
    // In "Todas las fases" view or multi-phase view, RAP columns per-phase don't apply
    if (effectiveSinglePhase === ALL_PHASES_VIEW) return [];
    const staticFaseRaps = FASE_RAPS[effectiveSinglePhase]?.map(r => r.rapCode) ?? [];
    if (fichas.length === 0 && activitiesForFicha.length === 0) return [];
    if (showAllFichasColumns) {
      const allKeys = new Set<string>();
      fichas.forEach(f => {
        const key = `${f.code}::${effectiveSinglePhase}`;
        const cols = rapColumns[key] || rapColumns[f.code] || staticFaseRaps;
        cols.forEach((c: string) => allKeys.add(c));
      });
      if (allKeys.size === 0) return staticFaseRaps;
      // Preserve FASE_RAPS order for known RAPs, then append extras
      const inOrder: string[] = [];
      staticFaseRaps.forEach(r => { if (allKeys.has(r)) inOrder.push(r); });
      allKeys.forEach(k => { if (!inOrder.includes(k)) inOrder.push(k); });
      return inOrder;
    }
    const existing = rapColumns[rapKey] || rapColumns[selectedFicha];
    if (existing && existing.length > 0) return existing;
    return staticFaseRaps;
  }, [rapColumns, rapKey, selectedFicha, activitiesForFicha.length, fichas, selectedPhases, showAllFichasColumns]);

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(grade => {
      map.set(`${grade.studentId}-${grade.activityId}`, grade);
    });
    return map;
  }, [grades]);

  /** Key used to look up competencia mapping for current ficha+phase */
  const evidenceMapKey = showAllFichasColumns ? '' : `${selectedFicha}::${effectiveSinglePhase}`;

  /** Helper: get the EvCompEntry for an activity (handles all-fichas fallback) */
  const getEvCompEntry = (activity: GradeActivity): EvCompEntry | undefined => {
    const evKey = getActivityCanonicalKey(activity);
    // Try specific ficha+phase key first, then all-fichas key ('')
    return (
      evidenceCompMap[`${activity.group || selectedFicha}::${activity.phase || effectiveSinglePhase}`]?.byEvKey?.[evKey] ??
      evidenceCompMap[evidenceMapKey]?.byEvKey?.[evKey] ??
      evidenceCompMap['']?.byEvKey?.[evKey]
    );
  };

  /** Competencia groups derived from visible activities + evidenceCompMap.
   *  Returns null when no mapping exists (fall back to single-row header).
   *  Also returns null in "Todas las fases" view (phaseGroups takes Row 1 instead). */
  const compGroups = useMemo<Array<{ compCode: string; compName: string; aaKeys: string; activities: GradeActivity[] }> | null>(() => {
    if (effectiveSinglePhase === ALL_PHASES_VIEW) return null;
    // Collect all mapping sources relevant to the current view.
    // Global seeds (key='') are always included FIRST as lowest-priority base,
    // so every seed activity always has its competencia group even if the
    // ficha-specific import map only covers a subset of activities.
    const mappingSources: Array<Record<string, EvCompEntry>> = [];
    if (evidenceCompMap['']?.byEvKey) {
      mappingSources.push(evidenceCompMap[''].byEvKey);        // global seeds — base
    }
    if (evidenceCompMap[evidenceMapKey]?.byEvKey) {
      mappingSources.push(evidenceCompMap[evidenceMapKey].byEvKey); // ficha+phase — overrides
    }
    if (showAllFichasColumns) {
      // Gather mappings from all fichas for current phase
      fichas.forEach(f => {
        const k = `${f.code}::${effectiveSinglePhase}`;
        if (evidenceCompMap[k]?.byEvKey) mappingSources.push(evidenceCompMap[k].byEvKey);
      });
    }
    if (mappingSources.length === 0) return null;

    // Merge all sources into one lookup
    const merged: Record<string, EvCompEntry> = {};
    mappingSources.forEach(src => Object.assign(merged, src));

    // Check if any visible activity has a comp entry
    const hasAnyMapping = visibleActivities.some(a => {
      const evKey = getActivityCanonicalKey(a);
      return !!merged[evKey];
    });
    if (!hasAnyMapping) return null;

    // Build groups maintaining order of visibleActivities
    const groups: Array<{ compCode: string; compName: string; aaKeys: string; activities: GradeActivity[] }> = [];
    let currentCode: string | null = null;

    visibleActivities.forEach(activity => {
      const evKey = getActivityCanonicalKey(activity);
      const info = merged[evKey];
      const compCode = info?.competenciaCode || '__ungrouped__';
      const compName = COMPETENCIA_NAMES[compCode] || info?.competenciaName || compCode;

      if (compCode !== currentCode) {
        currentCode = compCode;
        groups.push({ compCode, compName, aaKeys: '', activities: [] });
      }
      const g = groups[groups.length - 1];
      g.activities.push(activity);
      // Collect unique AA keys for subtitle
      if (info?.aaKey) {
        const existing = g.aaKeys ? g.aaKeys.split(', ') : [];
        if (!existing.includes(info.aaKey)) {
          g.aaKeys = [...existing, info.aaKey].filter(Boolean).join(', ');
        }
      }
    });

    return groups.length > 0 ? groups : null;
  }, [evidenceCompMap, evidenceMapKey, visibleActivities, fichas, selectedPhases, showAllFichasColumns]);

  /** Phase groups for "Todas las fases" view — groups visibleActivities by their phase, in phase order. */
  const phaseGroups = useMemo<Array<{ phase: string; activities: GradeActivity[] }> | null>(() => {
    if (effectiveSinglePhase !== ALL_PHASES_VIEW) return null;
    const groups: Array<{ phase: string; activities: GradeActivity[] }> = [];
    let currentPhase: string | null = null;
    visibleActivities.forEach(a => {
      const p = a.phase || phases[1];
      if (p !== currentPhase) {
        currentPhase = p;
        groups.push({ phase: p, activities: [] });
      }
      groups[groups.length - 1].activities.push(a);
    });
    return groups.length > 0 ? groups : null;
  }, [selectedPhases, visibleActivities]);

  /** Códigos de competencia ocultos para la ficha/fase actual */
  const hiddenForFicha = useMemo(() => {
    return new Set([
      ...(hiddenCompCodes[rapKey] ?? []),
      ...(hiddenCompCodes[selectedFicha] ?? []),
    ]);
  }, [hiddenCompCodes, rapKey, selectedFicha]);

  /** RAP columns visibles (filtra competencias ocultas de rapColumnsForFicha) */
  const activeRapColumns = useMemo(() => {
    if (hiddenForFicha.size === 0) return rapColumnsForFicha;
    return rapColumnsForFicha.filter(key => {
      const info = getRapStaticInfo(key);
      return !info || !hiddenForFicha.has(info.compCode);
    });
  }, [rapColumnsForFicha, hiddenForFicha]);

  /** Competencia groups derived from activeRapColumns + static RAP lookup.
   *  Returns null when all RAP cols are generic (no static info available). */
  const rapCompGroups = useMemo<Array<{ compCode: string; compName: string; raps: string[] }> | null>(() => {
    if (activeRapColumns.length === 0) return null;
    const hasAnyInfo = activeRapColumns.some(k => !!getRapStaticInfo(k));
    if (!hasAnyInfo) return null;
    const groups: Array<{ compCode: string; compName: string; raps: string[] }> = [];
    let currentCode: string | null = null;
    activeRapColumns.forEach(key => {
      const rapInfo = getRapStaticInfo(key);
      const compCode = rapInfo?.compCode ?? '__ungrouped__';
      const compName = rapInfo ? (COMPETENCIA_NAMES[compCode] || compCode) : key;
      if (compCode !== currentCode) {
        currentCode = compCode;
        groups.push({ compCode, compName, raps: [] });
      }
      groups[groups.length - 1].raps.push(key);
    });
    return groups.length > 0 ? groups : null;
  }, [activeRapColumns]);

  const getFinalForStudent = (studentId: string, studentGroup?: string) => {
    // Excluir siempre las evidencias ocultas del cálculo, independientemente de showHiddenActivities
    const countableActivities = visibleActivities.filter(a => !hiddenActivityIds.has(a.id));
    const totalActivities = countableActivities.length;
    if (totalActivities === 0) {
      return { pending: 0, score: null as number | null, letter: null as 'A' | 'D' | null };
    }
    let undelivered = 0; // sin calificación
    let pending = 0;     // sin calificación + reprobadas
    let sum = 0;
    countableActivities.forEach(activity => {
      // En vista "Todas": resolver la actividad real de la ficha del estudiante
      const resolvedActivity = activitiesByCanonicalAndFicha
        ? (activitiesByCanonicalAndFicha
            .get(getActivityPhaseScopedKey(activity))
            ?.get(studentGroup || '') ??
          activitiesByCanonicalAndFicha
            .get(getActivityPhaseScopedKey(activity))
            ?.get('') ?? activity)
        : activity;
      const grade = gradeMap.get(`${studentId}-${resolvedActivity.id}`);
      if (!grade) {
        undelivered += 1;
        pending += 1;
        return;
      }
      sum += grade.score;
      if (grade.score < PASSING_SCORE) pending += 1;
    });

    const delivered = totalActivities - undelivered;
    const avg = delivered === 0 ? null : sum / delivered;
    const allApproved = delivered === totalActivities && countableActivities.every(activity => {
      const resolvedActivity = activitiesByCanonicalAndFicha
        ? (activitiesByCanonicalAndFicha
            .get(getActivityPhaseScopedKey(activity))
            ?.get(studentGroup || '') ??
          activitiesByCanonicalAndFicha
            .get(getActivityPhaseScopedKey(activity))
            ?.get('') ?? activity)
        : activity;
      const g = gradeMap.get(`${studentId}-${resolvedActivity.id}`);
      return !!g && g.score >= PASSING_SCORE;
    });
    const letter: 'A' | 'D' = allApproved ? 'A' : 'D';
    return { pending, score: avg, letter };
  };

  const studentsFilteredByFinal = useMemo(() => {
    if (finalFilter === 'all') return studentsForFicha;
    return studentsForFicha.filter(s => {
      const key = showAllFichasColumns ? `${s.group || ''}::${effectiveSinglePhase}` : rapKey || `${s.group || ''}::${effectiveSinglePhase}`;
      const letter = (manualFinals[key] || {})[s.id] ?? '-';
      return finalFilter === 'A' ? letter === 'A' : letter !== 'A';
    });
  }, [studentsForFicha, finalFilter, manualFinals, rapKey, selectedPhases, showAllFichasColumns]);

  /** Counts how many students from studentsForFicha have letter='A' for each activity (by activity.id). */
  const activityApprovalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleActivities.forEach(activity => {
      let count = 0;
      studentsForFicha.forEach(student => {
        const actToUse = activitiesByCanonicalAndFicha
          ? (activitiesByCanonicalAndFicha.get(getActivityPhaseScopedKey(activity))?.get(student.group || '')
             ?? activitiesByCanonicalAndFicha.get(getActivityPhaseScopedKey(activity))?.get('')
             ?? activity)
          : activity;
        if (gradeMap.get(`${student.id}-${actToUse.id}`)?.letter === 'A') count++;
      });
      counts.set(activity.id, count);
    });
    return counts;
  }, [visibleActivities, studentsForFicha, gradeMap, activitiesByCanonicalAndFicha]);

  const totalPagesFiltered = Math.ceil(studentsFilteredByFinal.length / ITEMS_PER_PAGE);
  const paginatedStudentsFiltered = useMemo(() => {
    if (showAllStudents) return studentsFilteredByFinal;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return studentsFilteredByFinal.slice(start, start + ITEMS_PER_PAGE);
  }, [studentsFilteredByFinal, currentPage, showAllStudents]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(new Set(paginatedStudentsFiltered.map(s => s.id)));
    } else {
      setSelectedStudents(new Set());
    }
  };

  const handleSelectStudent = (id: string, checked: boolean) => {
    const updated = new Set(selectedStudents);
    if (checked) {
      updated.add(id);
    } else {
      updated.delete(id);
    }
    setSelectedStudents(updated);
  };

  /** Returns all candidate lookup keys for a student's juicio, in priority order. */
  const getJuicioKeys = (studentGroup?: string): string[] => {
    const ficha = studentGroup || '';
    const phaseKey = getRapKeyForStudent(studentGroup);
    return [
      phaseKey,
      ficha,                              // legacy key (saved before phase was added)
      `${ficha}::Fase Inducción`,
      `${ficha}::Fase 1: Análisis`,
      `${ficha}::Fase 2: Planeación`,
      `${ficha}::Fase 3: Ejecución`,
      `${ficha}::Fase 4: Evaluación`,
    ].filter((k, i, arr) => Boolean(k) && arr.indexOf(k) === i);
  };

  const toggleJuicioEvaluativo = (studentId: string, studentGroup?: string) => {
    const ficha = studentGroup || '';
    const phaseKey = getRapKeyForStudent(studentGroup);

    // Find which key currently holds this student's juicio value
    let activeKey = effectiveSinglePhase === ALL_PHASES_VIEW
      ? (ficha || phaseKey)   // prefer ficha-only key for new entries in all-phases view
      : phaseKey;
    let currentValue: 'orange' | 'green' | undefined;
    for (const k of getJuicioKeys(studentGroup)) {
      const v = (juiciosEvaluativos[k] || {})[studentId];
      if (v === 'orange' || v === 'green') { activeKey = k; currentValue = v; break; }
    }
    if (!activeKey) return;

    const nextEstado: 'orange' | 'green' | undefined =
      currentValue === undefined ? 'orange' : currentValue === 'orange' ? 'green' : undefined;
    let updated = { ...juiciosEvaluativos };
    if (nextEstado === undefined) {
      const { [studentId]: _, ...rest } = (updated[activeKey] || {});
      updated = { ...updated, [activeKey]: rest };
    } else {
      updated = { ...updated, [activeKey]: { ...(updated[activeKey] || {}), [studentId]: nextEstado } };
    }
    setJuiciosEvaluativos(updated);
    saveJuiciosEvaluativos(updated);
  };

  const getJuicioEstado = (studentId: string, studentGroup?: string): '-' | 'orange' | 'green' => {
    // Sin filtro de fase o sin filtro de ficha: no mostrar juicio
    if (effectiveSinglePhase === ALL_PHASES_VIEW || selectedFicha === 'Todas') return '-';

    const phaseKey = getRapKeyForStudent(studentGroup);
    if (!phaseKey) return '-';
    const v = (juiciosEvaluativos[phaseKey] || {})[studentId];
    return (v === 'orange' || v === 'green') ? v : '-';
  };

  const getManualFinal = (studentId: string, studentGroup?: string): 'A' | 'D' | '-' => {
    const key = getRapKeyForStudent(studentGroup);
    if (!key) return '-';
    const v = (manualFinals[key] || {})[studentId];
    return v === 'A' || v === 'D' ? v : '-';
  };

  const handleFinalClick = (studentId: string, studentGroup?: string) => {
    const key = getRapKeyForStudent(studentGroup);
    if (!key) return;
    const current = (manualFinals[key] || {})[studentId];
    const next: 'A' | 'D' | undefined =
      current === undefined || current === '-' ? 'A' : current === 'A' ? 'D' : undefined;
    const updated = { ...manualFinals };
    if (next === undefined) {
      const { [studentId]: _, ...rest } = (updated[key] || {});
      updated[key] = rest;
    } else {
      updated[key] = { ...(updated[key] || {}), [studentId]: next };
    }
    setManualFinals(updated);
    saveManualFinals(updated);
  };

  /** Key for storing manual phase total overrides per student. */
  const getPhaseTotalKey = (studentGroup: string | undefined, phase: string): string => {
    const groupKey = (showAllFichasColumns && studentGroup) ? studentGroup : (selectedFicha || studentGroup || '');
    return `${groupKey}::PT::${phase}`;
  };

  const getManualPhaseTotal = (studentId: string, phase: string, studentGroup?: string): 'A' | 'D' | '' => {
    const key = getPhaseTotalKey(studentGroup, phase);
    const v = (manualPhaseTotals[key] || {})[studentId];
    return v === 'A' || v === 'D' ? v : '';
  };

  const handlePhaseTotalClick = (studentId: string, phase: string, studentGroup?: string) => {
    const key = getPhaseTotalKey(studentGroup, phase);
    const raw = (manualPhaseTotals[key] || {})[studentId];
    const current = raw === 'A' ? 'A' : raw === 'D' ? 'D' : undefined;
    // Ciclo manual: (-) → A → D → (-)
    const next: 'A' | 'D' | undefined =
      current === undefined ? 'A' : current === 'A' ? 'D' : undefined;
    const updated = { ...manualPhaseTotals };
    if (next === undefined) {
      const { [studentId]: _, ...rest } = (updated[key] || {});
      updated[key] = rest;
    } else {
      updated[key] = { ...(updated[key] || {}), [studentId]: next };
    }
    setManualPhaseTotals(updated);
    saveManualPhaseTotals(updated);
  };

  /** Returns the list of activities pending for a student (not graded or letter D). */
  const getPendingEvidencesForStudent = (studentId: string, studentGroup?: string) => {
    const countableActivities = visibleActivities.filter(a => !hiddenActivityIds.has(a.id));
    return countableActivities
      .map(activity => {
        const resolvedActivity = activitiesByCanonicalAndFicha
          ? (activitiesByCanonicalAndFicha.get(getActivityPhaseScopedKey(activity))?.get(studentGroup || '')
             ?? activitiesByCanonicalAndFicha.get(getActivityPhaseScopedKey(activity))?.get('')
             ?? activity)
          : activity;
        const grade = gradeMap.get(`${studentId}-${resolvedActivity.id}`);
        if (!grade) return { activity, grade: null as null, reason: 'missing' as const };
        if (grade.score < PASSING_SCORE) return { activity, grade, reason: 'failed' as const };
        return null;
      })
      .filter((x): x is { activity: GradeActivity; grade: GradeEntry | null; reason: 'missing' | 'failed' } => x !== null);
  };

  const buildReportData = () => {
    if (!selectedFicha) return null;
    const headers = [
      'Documento',
      'Nombres',
      'Apellidos',
      'Correo electrónico',
      'Estado',
      'Ficha',
      'Días sin ingresar',
      'Juicios Evaluativos',
      ...visiblePhaseGroups.flatMap(({ phase, activities }) => [
        ...activities.map(a => {
          // Always prefix with the SENA code when the name is one, so re-importing
          // the exported file can match via getCanonicalEvidenceKey (full-code path).
          const nameIsSenaCode = /^G[AI]\d+-\d+-AA\d+-EV\d+$/i.test(a.name);
          if (nameIsSenaCode && a.detail && !a.detail.startsWith(a.name)) return `${a.name} ${a.detail}`;
          return a.detail || a.name;
        }),
        PHASE_TOTAL_LABELS[phase] ?? `TOTAL ${phase}`,
      ]),
      ...(hasActivities ? ['Pendientes', 'Promedio', 'FINAL'] : []),
    ];

    const studentsToExport = selectedStudents.size > 0
      ? studentsForFicha.filter(student => selectedStudents.has(student.id))
      : studentsForFicha;

    const rows = studentsToExport.map((student) => {
      const activityScores = visiblePhaseGroups.flatMap(({ phase, activities }) => [
        ...activities.map(activity => {
          const grade = gradeMap.get(`${student.id}-${activity.id}`);
          return grade ? grade.letter : '';
        }),
        (() => {
          const v = getManualPhaseTotal(student.id, phase, student.group);
          return v === 'A' || v === 'D' ? v : '-';
        })(),
      ]);
      const final = getFinalForStudent(student.id, student.group);
      const manualFinalVal = getManualFinal(student.id, student.group);
      const finalValues = hasActivities
        ? [final.pending, final.score != null ? Number(final.score).toFixed(2) : '', manualFinalVal]
        : [];
      const juicioKey = getRapKeyForStudent(student.group);
      const juicioVal = (juiciosEvaluativos[juicioKey] || {})[student.id];
      const juicioLabel = juicioVal === 'green' ? 'Sí' : juicioVal === 'orange' ? 'En proceso' : '-';
      const lastLms = lmsLastAccess[student.id];
      const daysLms = lastLms != null ? daysSinceLms(lastLms) : null;
      const daysExport =
        daysLms != null && daysLms >= 0 ? String(daysLms) : '';
      return [
        student.documentNumber || '',
        student.firstName || '',
        student.lastName || '',
        student.email || '',
        student.status || 'Formación',
        student.group || '',
        daysExport,
        juicioLabel,
        ...activityScores,
        ...finalValues,
      ];
    });

    return { headers, rows };
  };

  const exportToExcel = async () => {
    const data = buildReportData();
    if (!data) return;

    const { headers, rows } = data;

    // ── Column layout metadata ─────────────────────────────────────────────
    const INFO_COLS = 8; // Documento…Días sin ingresar…Juicios Evaluativos
    const ACT_COUNT = visibleActivities.length + visiblePhaseGroups.length; // activities + one TOTAL per phase
    const TOTAL_COLS = headers.length;

    // ── Build phase groups ─────────────────────────────────────────────────
    type PhaseGroup = { phase: string; count: number; color: { bg: string; text: string } };
    const phaseGroups: PhaseGroup[] = [];
    if (effectiveSinglePhase === ALL_PHASES_VIEW) {
      visibleActivities.forEach(a => {
        const ph = a.phase || 'Sin fase';
        const last = phaseGroups[phaseGroups.length - 1];
        if (last && last.phase === ph) { last.count++; }
        else { phaseGroups.push({ phase: ph, count: 1, color: PHASE_HEADER_COLORS[ph] ?? { bg: '#6b7280', text: '#ffffff' } }); }
      });
      // +1 per phase for TOTAL column
      phaseGroups.forEach(g => { g.count++; });
    } else {
      phaseGroups.push({ phase: effectiveSinglePhase, count: ACT_COUNT, color: PHASE_HEADER_COLORS[effectiveSinglePhase] ?? { bg: '#4F46E5', text: '#ffffff' } });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Calificaciones');

    // ── Row 1: Phase grouping row ──────────────────────────────────────────
    const phaseRow = sheet.addRow(new Array(TOTAL_COLS).fill(''));
    phaseRow.height = 22;

    // Info cols: dark header color, blank text
    for (let c = 1; c <= INFO_COLS; c++) {
      const cell = phaseRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    }

    // Phase group cells with per-phase color + merge
    let colOffset = INFO_COLS + 1;
    phaseGroups.forEach(group => {
      if (group.count <= 0) return;
      const startCol = colOffset;
      const endCol = colOffset + group.count - 1;
      if (group.count > 1) sheet.mergeCells(1, startCol, 1, endCol);
      const cell = phaseRow.getCell(startCol);
      cell.value = group.phase;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + group.color.bg.replace('#', '') } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      colOffset += group.count;
    });

    // Final cols (Pendientes, Promedio, FINAL): dark color — no aplica más allá de TOTAL_COLS
    for (let c = colOffset; c <= TOTAL_COLS; c++) {
      phaseRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    }

    // ── Row 2: Column headers ──────────────────────────────────────────────
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 72; // tall enough for truncated descriptions

    // Style TOTAL column headers with phase color
    {
      let ci = INFO_COLS + 1;
      visiblePhaseGroups.forEach(({ phase, activities }) => {
        ci += activities.length;
        const phaseColor = PHASE_HEADER_COLORS[phase];
        if (phaseColor) {
          const cell = headerRow.getCell(ci);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + phaseColor.bg.replace('#', '') } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
        }
        ci++;
      });
    }

    // ── Data rows (start at row 3) ─────────────────────────────────────────
    const DATA_START = 3;
    rows.forEach(rowData => {
      const r = sheet.addRow(rowData);
      r.alignment = { vertical: 'middle', wrapText: false };
      r.height = 18;
    });

    // ── Borders ───────────────────────────────────────────────────────────
    sheet.eachRow(row => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });
    });

    // ── Documento (col 1) y Ficha (col 6) como números; col 7 = días LMS ─
    for (let rowIdx = DATA_START; rowIdx < DATA_START + rows.length; rowIdx++) {
      const dataRow = sheet.getRow(rowIdx);
      // Documento: col 1
      const docCell = dataRow.getCell(1);
      const docNum = Number(String(docCell.value ?? '').trim());
      if (!isNaN(docNum) && docNum > 0) { docCell.value = docNum; docCell.numFmt = '0'; }
      // Ficha: col 6
      const fichaCell = dataRow.getCell(6);
      const fichaNum = Number(String(fichaCell.value ?? '').trim());
      if (!isNaN(fichaNum) && fichaNum > 0) { fichaCell.value = fichaNum; fichaCell.numFmt = '0'; }
      // Días sin ingresar LMS: col 7
      const daysCell = dataRow.getCell(7);
      const daysRaw = String(daysCell.value ?? '').trim();
      if (daysRaw !== '') {
        const daysNum = Number(daysRaw);
        if (!isNaN(daysNum) && daysNum >= 0) {
          daysCell.value = daysNum;
          daysCell.numFmt = '0';
        }
      }
    }

    // ── Evidence cell coloring (A = green, D = light red; TOTAL = bold green/red) ─
    const ACT_START_COL = INFO_COLS + 1;
    const ACT_END_COL   = INFO_COLS + ACT_COUNT;
    // Build set of 1-based column indices that are TOTAL columns
    const totalColSet = new Set<number>();
    {
      let ci = INFO_COLS + 1;
      visiblePhaseGroups.forEach(({ activities }) => {
        ci += activities.length; // skip evidence columns
        totalColSet.add(ci);     // TOTAL column
        ci++;
      });
    }
    for (let rowIdx = DATA_START; rowIdx < DATA_START + rows.length; rowIdx++) {
      for (let colIdx = ACT_START_COL; colIdx <= ACT_END_COL; colIdx++) {
        const cell = sheet.getRow(rowIdx).getCell(colIdx);
        if (totalColSet.has(colIdx)) {
          // TOTAL column styling
          if (cell.value === 'A') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16a34a' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          } else if (cell.value === 'D') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } };
          }
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cell.value === 'A') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cell.value === 'D') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { color: { argb: 'FFEF4444' }, size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    }

    // ── Column widths: evidence = 50 px (≈7.1 units), TOTAL = 16, others = auto-fit ──
    const EVIDENCE_W = 7.1; // 50 px ÷ ~7 px/unit
    // Build set of 0-based header indices that are TOTAL columns
    const totalColHeaderSet = new Set<number>();
    {
      let ci = INFO_COLS;
      visiblePhaseGroups.forEach(({ activities }) => {
        ci += activities.length;
        totalColHeaderSet.add(ci);
        ci++;
      });
    }
    sheet.columns = headers.map((header, colIdx) => {
      const isTotal = totalColHeaderSet.has(colIdx);
      const isActivity = colIdx >= INFO_COLS && colIdx < INFO_COLS + ACT_COUNT && !isTotal;
      if (isTotal) return { width: 16 }; // wider for TOTAL label
      if (isActivity) return { width: EVIDENCE_W };
      let maxLen = String(header ?? '').length;
      rows.forEach(row => { const v = String(row[colIdx] ?? ''); if (v.length > maxLen) maxLen = v.length; });
      return { width: Math.min(Math.max(maxLen * 1.2, 10), 55) };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `reporte_calificaciones_${selectedFicha}_${exportPhaseSlug}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPdf = () => {
    const data = buildReportData();
    if (!data) return;

    const { headers, rows } = data;

    // ── Column layout metadata ─────────────────────────────────────────────
    const INFO_COLS = 8;
    const ACT_COUNT = visibleActivities.length + visiblePhaseGroups.length; // activities + one TOTAL per phase

    // ── Build phase groups ─────────────────────────────────────────────────
    type PhaseGroup = { phase: string; count: number; color: { bg: string; text: string } };
    const phaseGroups: PhaseGroup[] = [];
    if (effectiveSinglePhase === ALL_PHASES_VIEW) {
      visibleActivities.forEach(a => {
        const ph = a.phase || 'Sin fase';
        const last = phaseGroups[phaseGroups.length - 1];
        if (last && last.phase === ph) { last.count++; }
        else { phaseGroups.push({ phase: ph, count: 1, color: PHASE_HEADER_COLORS[ph] ?? { bg: '#6b7280', text: '#ffffff' } }); }
      });
      // +1 per phase for TOTAL column
      phaseGroups.forEach(g => { g.count++; });
    } else {
      phaseGroups.push({ phase: effectiveSinglePhase, count: ACT_COUNT, color: PHASE_HEADER_COLORS[effectiveSinglePhase] ?? { bg: '#4F46E5', text: '#ffffff' } });
    }

    // ── Phase header row (Row 0 of head) ───────────────────────────────────
    const darkFill = [55, 65, 81] as [number, number, number];
    // Info columns: blank cells with dark fill
    const phaseHeaderRow: any[] = Array.from({ length: INFO_COLS }, () => ({
      content: '',
      styles: { fillColor: darkFill, textColor: [255, 255, 255] as [number, number, number] },
    }));
    phaseGroups.forEach(group => {
      if (group.count <= 0) return;
      const rgb = hexToRgb(group.color.bg);
      phaseHeaderRow.push({
        content: group.phase,
        colSpan: group.count,
        styles: { fillColor: rgb, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold', halign: 'center', fontSize: 7 },
      });
    });
    // RAP + Final cols
    const rapFinalCount = headers.length - INFO_COLS - ACT_COUNT;
    for (let i = 0; i < rapFinalCount; i++) {
      phaseHeaderRow.push({ content: '', styles: { fillColor: darkFill, textColor: [255, 255, 255] as [number, number, number] } });
    }

    // ── Column styles: evidence columns narrow (≈50 pt) ────────────────────
    const columnStyles: Record<number, { cellWidth: number }> = {};
    for (let i = INFO_COLS; i < INFO_COLS + ACT_COUNT; i++) {
      columnStyles[i] = { cellWidth: 14 }; // ~50 px in PDF pts
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(11);
    doc.text(`Calificaciones — ${selectedFicha} — ${exportPhaseTitle}`, 40, 26);

    autoTable(doc, {
      head: [phaseHeaderRow, headers],
      body: rows,
      startY: 38,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, valign: 'middle', overflow: 'ellipsize' },
      headStyles: { fillColor: darkFill, textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold', fontSize: 7 },
      columnStyles,
      didParseCell: (hookData: any) => {
        if (hookData.section === 'body') {
          const ci = hookData.column.index;
          if (ci >= INFO_COLS && ci < INFO_COLS + ACT_COUNT) {
            const val = hookData.cell.raw;
            if (val === 'A') {
              hookData.cell.styles.fillColor = [34, 197, 94];
              hookData.cell.styles.textColor = [255, 255, 255];
              hookData.cell.styles.fontStyle = 'bold';
              hookData.cell.styles.halign = 'center';
            } else if (val === 'D') {
              hookData.cell.styles.fillColor = [254, 226, 226];
              hookData.cell.styles.textColor = [239, 68, 68];
              hookData.cell.styles.halign = 'center';
            } else {
              hookData.cell.styles.halign = 'center';
            }
          }
        }
      },
    });

    doc.save(
      `reporte_calificaciones_${selectedFicha}_${exportPhaseSlug}_${new Date().toISOString().split('T')[0]}.pdf`
    );
  };

  // ── Shared helper: build phase groups array (reutilizado en HTML/MD) ────
  const buildPhaseGroups = () => {
    type PG = { phase: string; count: number; color: { bg: string; text: string } };
    const groups: PG[] = [];
    if (effectiveSinglePhase === ALL_PHASES_VIEW) {
      visibleActivities.forEach(a => {
        const ph = a.phase || 'Sin fase';
        const last = groups[groups.length - 1];
        if (last && last.phase === ph) { last.count++; }
        else { groups.push({ phase: ph, count: 1, color: PHASE_HEADER_COLORS[ph] ?? { bg: '#6b7280', text: '#ffffff' } }); }
      });
      // +1 per phase for TOTAL column
      groups.forEach(g => { g.count++; });
    } else {
      const cnt = visibleActivities.length + 1; // +1 for TOTAL column
      groups.push({ phase: effectiveSinglePhase, count: cnt, color: PHASE_HEADER_COLORS[effectiveSinglePhase] ?? { bg: '#4F46E5', text: '#ffffff' } });
    }
    return groups;
  };

  const exportToHtml = () => {
    const data = buildReportData();
    if (!data) return;
    const { headers, rows } = data;
    const INFO_COLS = 8;
    const ACT_COUNT = visibleActivities.length + visiblePhaseGroups.length; // activities + one TOTAL per phase
    const phaseGroups = buildPhaseGroups();
    const rapFinalCount = headers.length - INFO_COLS - ACT_COUNT;
    const dateStr = new Date().toLocaleDateString('es-CO');
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Estrategia: <div style="width:44px"> fijo DENTRO del <th> de evidencias.
    // Con table-layout:auto el navegador no puede expandir la celda más allá del div fijo.
    // No depende de table-layout:fixed ni colgroup (que los navegadores pueden ignorar).
    const EV_DIV = 44; // px del div interior → th total ≈ 44+3+3+2border = 52px ≈ 50px

    const phaseRowHtml =
      Array.from({ length: INFO_COLS }, () => `<th style="background:#374151"></th>`).join('') +
      phaseGroups.map(g =>
        `<th colspan="${g.count}" style="background:${g.color.bg};color:${g.color.text};` +
        `text-align:center;font-weight:bold;padding:4px 2px;overflow:hidden">` +
        `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.phase)}</div></th>`
      ).join('') +
      Array.from({ length: rapFinalCount }, () => `<th style="background:#374151"></th>`).join('');

    // Build 0-based set of TOTAL header indices
    const totalHeaderIndices = new Set<number>();
    {
      let ci = INFO_COLS;
      visiblePhaseGroups.forEach(({ activities }) => {
        ci += activities.length;
        totalHeaderIndices.add(ci);
        ci++;
      });
    }

    // Build map from header index to activity (only for non-TOTAL evidence headers)
    const activityByHeaderIndex = new Map<number, GradeActivity>();
    {
      let ci = INFO_COLS;
      visiblePhaseGroups.forEach(({ activities }) => {
        activities.forEach(activity => {
          activityByHeaderIndex.set(ci, activity);
          ci++;
        });
        ci++; // skip TOTAL column
      });
    }

    // Evidence headers: div fijo de 44px → columna ≈ 50px; tooltip con descripción completa
    const headerRowHtml = headers.map((h, ci) => {
      const isTotal = totalHeaderIndices.has(ci);
      const isAct = ci >= INFO_COLS && ci < INFO_COLS + ACT_COUNT && !isTotal;
      if (isTotal) {
        return `<th style="background:#374151;color:#fff;font-weight:bold;text-align:center;white-space:nowrap;padding:3px 6px">${esc(h)}</th>`;
      }
      if (isAct) {
        const activity = activityByHeaderIndex.get(ci);
        const shortLabel = esc(activity?.name || h);
        const fullDesc = esc(h);
        return `<th title="${fullDesc}" style="padding:3px 2px;text-align:center">` +
               `<div style="width:${EV_DIV}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 auto">${shortLabel}</div></th>`;
      }
      return `<th>${esc(h)}</th>`;
    }).join('');

    const bodyHtml = rows.map(row =>
      '<tr>' + row.map((val, ci) => {
        const isTotal = totalHeaderIndices.has(ci);
        const isAct = ci >= INFO_COLS && ci < INFO_COLS + ACT_COUNT && !isTotal;
        const v = esc(val);
        if (isTotal && val === 'A') return `<td style="background:#16a34a;color:#fff;font-weight:bold;text-align:center;padding:3px 4px">${v}</td>`;
        if (isTotal && val === 'D') return `<td style="background:#dc2626;color:#fff;font-weight:bold;text-align:center;padding:3px 4px">${v}</td>`;
        if (isTotal) return `<td style="background:#f3f4f6;text-align:center;padding:3px 4px">${v}</td>`;
        if (isAct && val === 'A') return `<td style="background:#22c55e;color:#fff;font-weight:bold;text-align:center;padding:3px 2px">${v}</td>`;
        if (isAct && val === 'D') return `<td style="background:#fee2e2;color:#ef4444;text-align:center;padding:3px 2px">${v}</td>`;
        if (isAct)                return `<td style="text-align:center;padding:3px 2px">${v}</td>`;
        return `<td>${v}</td>`;
      }).join('') + '</tr>'
    ).join('\n      ');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Calificaciones — ${esc(selectedFicha)} — ${esc(exportPhaseTitle)}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#111827}
    h2{color:#374151;font-size:16px;margin-bottom:4px}
    .meta{color:#6b7280;font-size:11px;margin-bottom:16px}
    .tbl-wrap{overflow-x:auto}
    table{border-collapse:collapse}
    th,td{border:1px solid #d1d5db;padding:4px 8px;white-space:nowrap;vertical-align:middle}
    thead th{background:#374151;color:#fff;font-size:10px;text-align:center}
    tbody tr:nth-child(even){background:#f9fafb}
    tbody tr:hover{background:#eff6ff}
  </style>
</head>
<body>
  <h2>Calificaciones — ${esc(selectedFicha)} — ${esc(exportPhaseTitle)}</h2>
  <p class="meta">Generado: ${dateStr} · ${rows.length} aprendiz(ces)</p>
  <div class="tbl-wrap">
  <table>
    <thead>
      <tr>${phaseRowHtml}</tr>
      <tr>${headerRowHtml}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_calificaciones_${selectedFicha}_${exportPhaseSlug}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToMarkdown = () => {
    const data = buildReportData();
    if (!data) return;
    const { headers, rows } = data;
    const INFO_COLS = 8;
    const ACT_COUNT = visibleActivities.length + visiblePhaseGroups.length; // activities + one TOTAL per phase
    const phaseGroups = buildPhaseGroups();
    const escMd = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

    const lines: string[] = [];
    lines.push(`# Calificaciones — ${selectedFicha} — ${exportPhaseTitle}`);
    lines.push(`\n_Generado: ${new Date().toLocaleDateString('es-CO')} · ${rows.length} aprendiz(ces)_`);

    if (phaseGroups.length > 1) {
      lines.push('\n## Fases');
      phaseGroups.forEach(g => lines.push(`- **${g.phase}** — ${g.count} evidencia(s)`));
    }

    lines.push('\n## Tabla de calificaciones\n');
    lines.push('| ' + headers.map(h => escMd(h)).join(' | ') + ' |');
    lines.push('| ' + headers.map((_, i) => (i >= INFO_COLS && i < INFO_COLS + ACT_COUNT ? ':---:' : '---')).join(' | ') + ' |');

    rows.forEach(row => {
      const cells = row.map((val, ci) => {
        const v = escMd(val);
        const isAct = ci >= INFO_COLS && ci < INFO_COLS + ACT_COUNT;
        return (isAct && val === 'A') ? `**${v}**` : v;
      });
      lines.push('| ' + cells.join(' | ') + ' |');
    });

    const md = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_calificaciones_${selectedFicha}_${exportPhaseSlug}_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openAddActivity = () => {
    setEditingActivity(null);
    setActivityName('');
    setIsActivityModalOpen(true);
  };

  const openEditActivity = (activity: GradeActivity) => {
    setEditingActivity(activity);
    setActivityName(activity.name);
    setIsActivityModalOpen(true);
    setTimeout(() => {
      if (activityNameRef.current) {
        activityNameRef.current.style.height = 'auto';
        activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  const openActivityDetail = (activity: GradeActivity) => {
    setActivityDetailModal(activity);
    setActivityDetailText(activity.detail || '');
  };

  const handleSaveActivity = () => {
    if (!activityName.trim() || !selectedFicha) return;
    if (editingActivity) {
      updateGradeActivity({ ...editingActivity, name: activityName.trim() });
    } else {
      addGradeActivity({
        id: generateId(),
        name: activityName.trim(),
        group: selectedFicha,
        phase: effectiveSinglePhase,
        detail: editingActivity?.detail || undefined,
        maxScore: 100,
        createdAt: new Date().toISOString(),
      });
    }
    setIsActivityModalOpen(false);
    setActivityName('');
    setEditingActivity(null);
  };

  const handleFileUpload = async (file: File) => {
    setUploadError('');
    setUploadInfo('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 2) {
        setUploadError('El archivo no tiene datos suficientes.');
        return;
      }

      const headers = rows[0].map(h => String(h || '').trim());
      const normalizedHeaders = headers.map(h => normalizeHeader(h));

      const docIndex = normalizedHeaders.findIndex(h =>
        h.includes('document') || h.includes('doc') || h.includes('identificacion') || h.includes('identidad')
      );
      // "Nombre(s)" normaliza a "nombre s" → también capturar esa variante
      const firstNameIndex = normalizedHeaders.findIndex(h =>
        (h === 'nombres' || h === 'nombre s' || h === 'nombre' || h.startsWith('nombre ')) && !h.includes('usuario')
      );
      // "Apellido(s)" normaliza a "apellido s" → también capturar esa variante
      const lastNameIndex = normalizedHeaders.findIndex(h =>
        h.includes('apellido')
      );
      const fullNameIndex = normalizedHeaders.findIndex(h => h.includes('nombre completo') || h.includes('aprendiz'));
      const usernameIndex = normalizedHeaders.findIndex(h =>
        h.includes('nombre de usuario') || h === 'usuario' || h === 'username'
      );
      const emailIndex = normalizedHeaders.findIndex(h =>
        h.includes('correo electronico') || h.includes('correo') || h.includes('email')
      );

      const reservedIndexes = new Set(
        [docIndex, firstNameIndex, lastNameIndex, fullNameIndex, usernameIndex, emailIndex].filter(i => i >= 0)
      );
      const looksLikeEvidence = (h: string) => /ev\s*\d|evidencia\s*\d|ev\d+/i.test(h) || (/\d+/.test(h) && h.length < 80);

      const activityIndexes = headers
        .map((header, index) => ({ header: header.trim(), index }))
        .filter(item => {
          const header = normalizeHeader(item.header);
          const headerKey = normalizeHeaderKey(item.header);
          if (!item.header || reservedIndexes.has(item.index)) return false;
          if (EXCLUDED_ACTIVITY_HEADERS.has(header)) return false;
          if (looksLikeEvidence(header)) return true;
          if (BASE_COMPUTED_HEADERS.has(headerKey)) return false;
          const dynamicRap = (rapColumns[rapKey] || rapColumns[selectedFicha] || []).map(col =>
            normalizeHeaderKey(col)
          );
          if (dynamicRap.includes(headerKey)) return false;
          return true;
        });

      if (activityIndexes.length === 0) {
        setUploadError('No se encontraron columnas de actividades en el Excel.');
        return;
      }

      const evidenceMap = new Map<
        string,
        { baseName: string; realIndex?: number; letterIndex?: number; fallbackIndex?: number }
      >();

      activityIndexes.forEach(({ header, index }) => {
        const { baseName, kind } = splitActivityHeader(header);
        if (!baseName || !baseName.trim()) return;
        const canonicalKey = getCanonicalEvidenceKey(baseName);
        const entry = evidenceMap.get(canonicalKey);
        if (entry) {
          if (kind === 'real') {
            entry.realIndex = index;
          } else if (kind === 'letter') {
            entry.letterIndex = index;
          } else if (entry.fallbackIndex === undefined) {
            entry.fallbackIndex = index;
          }
        } else {
          const newEntry: { baseName: string; realIndex?: number; letterIndex?: number; fallbackIndex?: number } = { baseName: baseName.trim() };
          if (kind === 'real') newEntry.realIndex = index;
          else if (kind === 'letter') newEntry.letterIndex = index;
          else newEntry.fallbackIndex = index;
          evidenceMap.set(canonicalKey, newEntry);
        }
      });

      const isAllFichas = selectedFicha === 'Todas';

      // ── Auto-detect phase from canonical evidence code (GA#→phase) ──────────
      // GA1 → Fase 1: Análisis, GA2-3 → Fase 2: Planeación,
      // GA4-7 → Fase 3: Ejecución, GA8+ → Fase 4: Evaluación, GI → Inducción
      const detectPhaseFromCode = (code: string): string => {
        if (/^GI\d+/i.test(code)) return 'Fase Inducción';
        const m = code.match(/GA(\d+)/i);
        if (m) {
          const n = parseInt(m[1]);
          if (n === 1) return 'Fase 1: Análisis';
          if (n <= 3) return 'Fase 2: Planeación';
          if (n <= 7) return 'Fase 3: Ejecución';
          return 'Fase 4: Evaluación';
        }
        return effectiveSinglePhase === ALL_PHASES_VIEW ? phases[1] : effectiveSinglePhase;
      };

      // ── Buscar actividades existentes buscando en TODAS las fases ───────────
      // (no filtramos por selectedPhase para que el re-import siempre reutilice
      //  las actividades semilla correctas independientemente del filtro activo)
      // Build Sofia Plus alias lookup: aliasCanonicalKey → seed activity
      const seedAliasByKey = new Map<string, GradeActivity>();
      Object.values(FASE_EVIDENCES).forEach(evs => evs.forEach(ev => {
        if (!ev.sofiaAliases) return;
        const seedAct = activities.find(a => a.id === `seed-${ev.code}`);
        if (!seedAct) return;
        ev.sofiaAliases.forEach(alias => {
          const aliasKey = getCanonicalEvidenceKey(alias);
          seedAliasByKey.set(aliasKey, seedAct);
          if (seedAct.phase) seedAliasByKey.set(`${seedAct.phase}::${aliasKey}`, seedAct);
        });
      }));

      const existingByDetail = new Map<string, GradeActivity>();
      const addToExistingByDetail = (activity: GradeActivity, override = false) => {
        const fullKey = getActivityCanonicalKey(activity);
        if (override || !existingByDetail.has(fullKey)) existingByDetail.set(fullKey, activity);
        // Secondary phase-scoped partial key: lets "AA1-EV01" columns match "GI1-...-AA1-EV01" seeds.
        const partialAaEv = fullKey.match(/aa\d+-ev\d+/i)?.[0]?.toLowerCase();
        if (partialAaEv && activity.phase) {
          const scopedKey = `${activity.phase}::${partialAaEv}`;
          if (override || !existingByDetail.has(scopedKey)) existingByDetail.set(scopedKey, activity);
        }
      };
      activities.filter(a => a.group === '').forEach(a => addToExistingByDetail(a));
      if (!isAllFichas) {
        activities.filter(a => a.group === selectedFicha).forEach(a => addToExistingByDetail(a, true)); // ficha overrides global
      }

      // Para calcular el siguiente número de EV sólo miramos la fase detectada
      const activitiesInPhase = activities.filter(
        a => (a.phase || phases[1]) === (effectiveSinglePhase === ALL_PHASES_VIEW ? phases[1] : effectiveSinglePhase)
      );
      const existingEvNumbers = activitiesInPhase
        .filter(a => !isAllFichas ? (a.group === selectedFicha || a.group === '') : true)
        .map(a => { const m = a.name.match(/EV(\d+)/i); return m ? parseInt(m[1], 10) : 0; });
      let nextEvNumber = existingEvNumbers.length > 0 ? Math.max(...existingEvNumbers) + 1 : 1;
      const newActivities: GradeActivity[] = [];

      const activityColumns = new Map<
        string,
        { activity: GradeActivity; realIndex?: number; letterIndex?: number; fallbackIndex?: number; detail: string }
      >();

      evidenceMap.forEach((entry, canonicalKey) => {
        let activity = existingByDetail.get(canonicalKey);
        if (!activity) {
          const autoPhase = detectPhaseFromCode(entry.baseName);
          // Fallback 1: phase-scoped partial AA-EV key
          // (handles Sofia Plus exports where header is "Infografía. AA1-EV01" instead of full code)
          const partialAaEv = canonicalKey.match(/aa\d+-ev\d+/i)?.[0]?.toLowerCase();
          if (partialAaEv && autoPhase) {
            activity = existingByDetail.get(`${autoPhase}::${partialAaEv}`);
          }
          // Fallback 2: Sofia Plus alias map (e.g. AA3-EV01 → GI1-240201530-AA2-EV03)
          if (!activity) {
            activity = seedAliasByKey.get(canonicalKey);
            if (!activity && partialAaEv && autoPhase) {
              activity = seedAliasByKey.get(`${autoPhase}::${partialAaEv}`);
            }
          }
        }
        if (!activity) {
          // Auto-detect phase from the evidence code in the column header
          const autoPhase = detectPhaseFromCode(entry.baseName);
          activity = {
            id: generateId(),
            name: `EV${String(nextEvNumber).padStart(2, '0')}`,
            group: isAllFichas ? '' : selectedFicha,
            phase: autoPhase,
            maxScore: 100,
            detail: entry.baseName,
            createdAt: new Date().toISOString(),
          };
          nextEvNumber += 1;
          newActivities.push(activity);
          existingByDetail.set(canonicalKey, activity);
        } else if (!activity.detail) {
          updateGradeActivity({ ...activity, detail: entry.baseName });
        }
        activityColumns.set(canonicalKey, {
          activity,
          realIndex: entry.realIndex,
          letterIndex: entry.letterIndex,
          fallbackIndex: entry.fallbackIndex,
          detail: entry.baseName,
        });
      });

      newActivities.forEach(addGradeActivity);

      const studentsByDoc = new Map<string, Student>();
      const studentsByName = new Map<string, Student>();
      const studentsToMatch = isAllFichas ? students : studentsForFicha;
      studentsToMatch.forEach(student => {
        const docKey = normalizeDoc(student.documentNumber || '');
        if (docKey) {
          studentsByDoc.set(docKey, student);
        }
        const fullName = buildNameKey(`${student.firstName} ${student.lastName}`);
        const reversedName = buildNameKey(`${student.lastName} ${student.firstName}`);
        const commaName = buildNameKey(`${student.lastName}, ${student.firstName}`);
        studentsByName.set(fullName, student);
        studentsByName.set(reversedName, student);
        studentsByName.set(commaName, student);
      });

      const entries: GradeEntry[] = [];
      const unmatched: string[] = [];

      rows.slice(1).forEach(row => {
        const docValue = docIndex >= 0 ? normalizeDoc(row[docIndex]) : '';
        const firstNameValue = firstNameIndex >= 0 ? String(row[firstNameIndex] || '').trim() : '';
        const lastNameValue = lastNameIndex >= 0 ? String(row[lastNameIndex] || '').trim() : '';
        const fullNameValue = fullNameIndex >= 0 ? String(row[fullNameIndex] || '').trim() : '';
        const usernameValue = usernameIndex >= 0 ? String(row[usernameIndex] || '').trim() : '';
        const emailValue = emailIndex >= 0 ? String(row[emailIndex] || '').trim() : '';

        // Si no hay columna de documento pero el username contiene dígitos (ej: "1144163904cc"), extraer como doc
        const docFromUsername = !docValue && usernameValue
          ? normalizeDoc(usernameValue.replace(/[^0-9]/g, '') || usernameValue)
          : '';
        const effectiveDoc = docValue || docFromUsername;

        let student: Student | undefined;
        if (effectiveDoc) {
          student = studentsByDoc.get(effectiveDoc);
        }
        if (!student) {
          const nameToMatch = fullNameValue || `${firstNameValue} ${lastNameValue}`;
          if (nameToMatch.trim()) {
            const normalized = buildNameKey(nameToMatch);
            const reversed = buildNameKey(`${lastNameValue} ${firstNameValue}`);
            student = studentsByName.get(normalized) || studentsByName.get(reversed);

            if (!student) {
              const normalizedTokens = normalized.split(' ').filter(Boolean);
              student = studentsToMatch.find(s => {
                const key = buildNameKey(`${s.firstName} ${s.lastName}`);
                return normalizedTokens.every(token => key.includes(token)) ||
                  key.includes(normalized) || normalized.includes(key);
              });
            }
          }
        }

        if (!student) {
          if (effectiveDoc || fullNameValue || firstNameValue || lastNameValue) {
            unmatched.push(effectiveDoc || fullNameValue || `${firstNameValue} ${lastNameValue}`.trim());
          }
          return;
        }

        if (usernameValue || emailValue) {
          const updatedStudent: Student = {
            ...student,
            username: usernameValue || student.username,
            email: emailValue || student.email,
          };
          if (updatedStudent.username !== student.username || updatedStudent.email !== student.email) {
            updateStudent(updatedStudent);
          }
        }

        activityColumns.forEach(({ activity, realIndex, letterIndex, fallbackIndex }) => {
          const rawScoreValue =
            realIndex !== undefined ? row[realIndex] : fallbackIndex !== undefined ? row[fallbackIndex] : undefined;
          const rawLetterValue = letterIndex !== undefined ? row[letterIndex] : undefined;

          let score: number | null = null;
          let letter: 'A' | 'D' | null = null;

          score = parseScoreValue(rawScoreValue);
          if (score === null && typeof rawScoreValue === 'string') {
            const trimmed = rawScoreValue.trim().toUpperCase();
            if (trimmed === 'A' || trimmed === 'D') {
              letter = trimmed as 'A' | 'D';
            }
          }

          if (rawLetterValue !== '' && rawLetterValue !== null && rawLetterValue !== undefined) {
            const trimmed = String(rawLetterValue).trim().toUpperCase();
            if (trimmed === 'A' || trimmed === 'D') {
              letter = trimmed as 'A' | 'D';
            }
          }

          if (score === null && letter === null) return;

          if (score === null && letter) {
            score = letter === 'A' ? 100 : 0;
          }

          if (score === null) return;

          const finalScore = Math.max(0, Math.min(100, Math.round(score)));
          const finalLetter = letter || scoreToLetter(finalScore);
          entries.push({
            studentId: student.id,
            activityId: activity.id,
            score: finalScore,
            letter: finalLetter,
            updatedAt: new Date().toISOString(),
          });
        });
      });

      // ── Limpiar calificaciones antiguas mal mapeadas ────────────────────────
      // Elimina entradas previas del MISMO estudiante × MISMA EVIDENCIA (por clave canónica)
      // que referencien un activity.id diferente al que se acaba de importar.
      // Esto borra las entradas dejadas por reparaciones posicionales incorrectas
      // aunque estén en fases distintas (no filtra por fase sino por clave canónica).
      if (entries.length > 0) {
        const importedStudentIds = new Set(entries.map(e => e.studentId));
        // Mapa: activityId correcto → clave canónica de esa evidencia
        const importedActivityIds = new Set(entries.map(e => e.activityId));
        const canonicalByImportedId = new Map<string, string>();
        activityColumns.forEach(({ activity }) => {
          canonicalByImportedId.set(activity.id, getActivityCanonicalKey(activity));
        });
        // Inverso: clave canónica → activityId correcto (para la búsqueda rápida)
        const importedIdByCanonical = new Map<string, string>();
        canonicalByImportedId.forEach((canonical, id) => importedIdByCanonical.set(canonical, id));

        // Construir mapa de todas las actividades conocidas para la búsqueda
        const allActivitiesById = new Map<string, GradeActivity>(activities.map(a => [a.id, a] as [string, GradeActivity]));
        newActivities.forEach(a => allActivitiesById.set(a.id, a));

        const beforeClean = getGrades();
        const cleaned = beforeClean.filter(g => {
          if (!importedStudentIds.has(g.studentId)) return true; // estudiante no importado → conservar
          if (importedActivityIds.has(g.activityId)) return true; // es la entrada correcta → conservar
          // Verificar si esta entrada apunta a la misma evidencia (clave canónica) que alguna importada
          const act = allActivitiesById.get(g.activityId);
          if (!act) return true; // actividad desconocida → conservar
          const canonical = getActivityCanonicalKey(act);
          if (importedIdByCanonical.has(canonical)) return false; // misma evidencia, ID incorrecto → eliminar
          return true; // evidencia diferente → conservar
        });
        if (cleaned.length < beforeClean.length) {
          saveGrades(cleaned);
        }
      }

      upsertGrades(entries);

      // -----------------------------------------------------------------------
      // Extract and persist competencia / AA mapping from Excel column names.
      // Columns follow the pattern: GA#-<competenciaCode>-AA#-EV##
      // -----------------------------------------------------------------------
      const parseCompetenciaInfoFromName = (baseName: string): { competenciaCode: string; aaKey: string } | null => {
        const match = baseName.match(/G[AI]\d+-(\d+)-(AA\d+)-EV\d+/i);
        if (match) return { competenciaCode: match[1], aaKey: match[2].toUpperCase() };
        return null;
      };

      const byEvKey: Record<string, EvCompEntry> = {};
      const seenComps: string[] = [];

      activityColumns.forEach(({ activity, detail }, canonicalKey) => {
        const rawName = detail || activity.detail || activity.name;
        const info = parseCompetenciaInfoFromName(rawName);
        if (info) {
          const staticRap = FASE_RAPS[effectiveSinglePhase]?.find(
            r => r.compCode === info.competenciaCode && r.aaKey === info.aaKey.toUpperCase()
          );
          byEvKey[canonicalKey] = {
            competenciaCode: info.competenciaCode,
            competenciaName: COMPETENCIA_NAMES[info.competenciaCode] || info.competenciaCode,
            aaKey: info.aaKey,
            aaName: staticRap?.rapName || info.aaKey,
          };
          if (!seenComps.includes(info.competenciaCode)) seenComps.push(info.competenciaCode);
        }
      });

      if (Object.keys(byEvKey).length > 0) {
        const compMappingKey = isAllFichas ? '' : `${selectedFicha}::${effectiveSinglePhase}`;
        const existingCompMap = getEvidenceCompMap();
        const existingEntry = existingCompMap[compMappingKey] || { byEvKey: {}, compOrder: [] };
        const mergedByEvKey = { ...existingEntry.byEvKey, ...byEvKey };
        // Preserve existing order; append new codes at end
        const mergedOrder = [...existingEntry.compOrder];
        seenComps.forEach(c => { if (!mergedOrder.includes(c)) mergedOrder.push(c); });
        saveEvidenceCompMap({ ...existingCompMap, [compMappingKey]: { byEvKey: mergedByEvKey, compOrder: mergedOrder } });
      }

      const infoParts = [];
      infoParts.push(`Se actualizaron ${entries.length} calificaciones.`);
      if (unmatched.length > 0) {
        infoParts.push(`Sin coincidencia: ${unmatched.length} filas.`);
      }
      setUploadInfo(infoParts.join(' '));
      saveUploadTimestamp();
      loadData();
    } catch (error) {
      setUploadError('No se pudo procesar el archivo. Verifica el formato del Excel.');
    }
  };

  const hasActivities = visibleActivities.length > 0;

  return (
    <div className="space-y-3 sm:space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Calificaciones</h2>
          <p className="text-gray-500 text-xs sm:text-sm">Gestiona actividades y notas por ficha.</p>
        </div>

        <div className="flex flex-col gap-2 sm:gap-3">
          {/* ── Fila única: búsqueda + filtros + acciones ── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Búsqueda */}
            <div className="relative min-w-[160px] flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar aprendiz..."
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full bg-white shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Separador visual */}
            <div className="hidden sm:block w-px h-6 bg-gray-200" />

            {/* Filtro Ficha */}
            <div className="relative" ref={fichaFilterRef}>
              <button
                type="button"
                onClick={() => { setShowFichaFilter(prev => !prev); setShowPhaseFilter(false); setCalifEvidencePickerOpen(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${showFichaFilter ? 'bg-teal-600 border-teal-600 text-white' : selectedFicha !== 'Todas' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <Filter className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Ficha</span>
                {selectedFicha !== 'Todas' && (
                  <span className={`text-xs font-semibold max-w-[6rem] truncate ${showFichaFilter ? 'text-teal-100' : 'text-teal-600'}`}>{selectedFicha}</span>
                )}
              </button>
              {showFichaFilter && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFichaFilter(false)} />
                  <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                    {[{ code: 'Todas', label: 'Todas las fichas' }, ...fichas.map(f => ({ code: f.code, label: `${f.code} — ${f.program}` }))].map(opt => (
                      <button key={opt.code} type="button"
                        onClick={() => { setSelectedFicha(opt.code); setShowFichaFilter(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${selectedFicha === opt.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                      >{opt.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filtro Fase */}
            <div className="relative" ref={phaseFilterRef}>
              <button
                type="button"
                onClick={() => { setShowPhaseFilter(prev => !prev); setShowFichaFilter(false); setCalifEvidencePickerOpen(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${showPhaseFilter ? 'bg-teal-600 border-teal-600 text-white' : selectedPhases.length > 0 ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <Filter className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Fase</span>
                {selectedPhases.length === 1 && (
                  <span className={`text-xs font-semibold max-w-[7rem] truncate ${showPhaseFilter ? 'text-teal-100' : 'text-teal-600'}`}>{selectedPhases[0].replace(/^Fase \d+:?\s*/, '')}</span>
                )}
                {selectedPhases.length > 1 && (
                  <span className={`text-xs font-semibold ${showPhaseFilter ? 'text-teal-100' : 'text-teal-600'}`}>{selectedPhases.length} fases</span>
                )}
              </button>
              {showPhaseFilter && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPhaseFilter(false)} />
                  <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                    <button type="button"
                      onClick={() => setSelectedPhases([])}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${selectedPhases.length === 0 ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                    >📋 {ALL_PHASES_VIEW}</button>
                    <div className="border-t border-gray-100 my-1" />
                    {phases.map(phase => {
                      const checked = selectedPhases.includes(phase);
                      return (
                        <label key={phase}
                          className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700 transition-colors ${checked ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedPhases(prev => {
                              const next = checked ? prev.filter(p => p !== phase) : [...prev, phase];
                              return next.length === phases.length ? [] : next;
                            })}
                            className="w-3.5 h-3.5 rounded accent-teal-600 flex-shrink-0"
                          />
                          {phase}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Filtro Evidencias */}
            <div className="relative" ref={evidenceFilterRef}>
                  <button
                    type="button"
                    onClick={() => setCalifEvidencePickerOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium whitespace-nowrap transition-colors shadow-sm ${
                      califEvidencePickerOpen
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : (califEvidenceTipoFilter !== 'Todos' || califEvidenceAreaFilters.length > 0 || califSelectedEvidenceIdList.length > 0)
                          ? 'bg-teal-50 border-teal-400 text-teal-700'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Evidencias</span>
                    {/* Badge de filtros activos */}
                    {(califEvidenceTipoFilter !== 'Todos' || califEvidenceAreaFilters.length > 0 || califSelectedEvidenceIdList.length > 0) && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${califEvidencePickerOpen ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}`}>
                        {visibleActivities.length}/{califEvidencePickerPool.length}
                      </span>
                    )}
                  </button>

                  {califEvidencePickerOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCalifEvidencePickerOpen(false)} />
                      <div className="absolute left-0 mt-2 w-[480px] rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filtrar evidencias</p>
                        </div>

                        <div className="p-3 space-y-4">
                          {/* Tipo */}
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tipo</p>
                            <div className="flex flex-wrap gap-1.5">
                              {EVIDENCE_TIPO_OPTIONS.map((opt) => {
                                const active = califEvidenceTipoFilter === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { setCalifEvidenceTipoFilter(opt.value); setCalifSelectedEvidenceIdList([]); }}
                                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                                    style={active
                                      ? (opt.bg ? { backgroundColor: opt.bg, color: opt.text ?? '#000', borderColor: opt.bg } : { backgroundColor: '#0d9488', color: '#fff', borderColor: '#0d9488' })
                                      : { backgroundColor: 'transparent', color: '#6b7280', borderColor: '#e5e7eb' }
                                    }
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Área — multi-select con checkboxes */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Área</p>
                              {califEvidenceAreaFilters.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => { setCalifEvidenceAreaFilters([]); setCalifSelectedEvidenceIdList([]); setCalifEvidenceSearch(''); }}
                                  className="text-[11px] text-teal-600 hover:text-teal-800 font-medium"
                                >
                                  Todas
                                </button>
                              )}
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                              {califEvAreaOptions
                                .filter((ar) => ar !== ALL_EVIDENCE_AREAS)
                                .map((ar) => {
                                  const checked = califEvidenceAreaFilters.includes(ar);
                                  return (
                                    <label
                                      key={ar}
                                      className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-white ${checked ? 'bg-teal-50' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          setCalifEvidenceAreaFilters((prev) => {
                                            const next = checked ? prev.filter((x) => x !== ar) : [...prev, ar];
                                            return next;
                                          });
                                          setCalifSelectedEvidenceIdList([]);
                                          setCalifEvidenceSearch('');
                                        }}
                                        className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500 flex-shrink-0"
                                      />
                                      <span className={`text-[11px] font-semibold ${checked ? 'text-teal-700' : 'text-gray-600'}`}>{ar}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>

                          {/* Evidencias individuales */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Columnas</p>
                              {califSelectedEvidenceIdList.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCalifSelectedEvidenceIdList([])}
                                  className="text-[11px] text-teal-600 hover:text-teal-800 font-medium"
                                >
                                  Mostrar todas
                                </button>
                              )}
                            </div>
                            {/* Búsqueda de evidencias */}
                            <div className="relative mb-1.5">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Buscar evidencia…"
                                value={califEvidenceSearch}
                                onChange={(e) => setCalifEvidenceSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-2 focus:ring-teal-500 outline-none"
                              />
                              {califEvidenceSearch && (
                                <button
                                  type="button"
                                  onClick={() => setCalifEvidenceSearch('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                              {(() => {
                                const searchLower = califEvidenceSearch.toLowerCase();
                                const filtered = califEvidenceSearch
                                  ? califEvidencePickerPool.filter((a) => {
                                      const label = shortEvidenceLabel(a.name).toLowerCase();
                                      const detail = (a.detail || a.name).toLowerCase();
                                      return label.includes(searchLower) || detail.includes(searchLower);
                                    })
                                  : califEvidencePickerPool;
                                if (filtered.length === 0) {
                                  return <p className="text-xs text-gray-400 py-4 text-center">{califEvidenceSearch ? 'Sin resultados.' : 'Sin evidencias en este contexto.'}</p>;
                                }
                                return filtered.map((a) => {
                                  const implicitAll = califSelectedEvidenceIdList.length === 0;
                                  const checked = implicitAll || califSelectedEvidenceIdList.includes(a.id);
                                  const tipoKey = getEvidenceTipo(a);
                                  const tipoOpt = tipoKey ? EVIDENCE_TIPO_OPTIONS.find(o => o.value === tipoKey && o.bg) : null;
                                  return (
                                    <label
                                      key={a.id}
                                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-white ${checked ? '' : 'opacity-50'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const poolIds = califEvidencePickerPool.map((x) => x.id);
                                          setCalifSelectedEvidenceIdList((prev) => {
                                            if (prev.length === 0) return poolIds.filter((x) => x !== a.id);
                                            const s = new Set(prev);
                                            if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
                                            const arr = Array.from(s).sort();
                                            if (arr.length === 0 || arr.length === poolIds.length) return [];
                                            return arr;
                                          });
                                        }}
                                        className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500 flex-shrink-0"
                                      />
                                      <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-1.5">
                                          <span className="font-mono text-[11px] font-semibold text-teal-700">{shortEvidenceLabel(a.name)}</span>
                                          {tipoOpt?.bg && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none" style={{ backgroundColor: tipoOpt.bg, color: tipoOpt.text ?? '#000' }}>{tipoKey}</span>
                                          )}
                                        </span>
                                        {(a.detail || a.name) && (
                                          <span className="block text-[11px] text-gray-400 truncate leading-tight mt-0.5" title={(a.detail || a.name).replace(/^Evidencia de (?:conocimiento|producto|desempe[ñn]o):\s*/i, '')}>
                                            {(a.detail || a.name).replace(/^Evidencia de (?:conocimiento|producto|desempe[ñn]o):\s*/i, '')}
                                          </span>
                                        )}
                                      </span>
                                    </label>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          {/* Reset */}
                          {(califEvidenceTipoFilter !== 'Todos' || califEvidenceAreaFilters.length > 0 || califSelectedEvidenceIdList.length > 0) && (
                            <button
                              type="button"
                              onClick={() => { setCalifEvidenceTipoFilter('Todos'); setCalifEvidenceAreaFilters([]); setCalifSelectedEvidenceIdList([]); setCalifEvidenceSearch(''); }}
                              className="w-full text-center text-xs text-gray-400 hover:text-red-500 py-1 transition-colors"
                            >
                              Limpiar filtros
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
            </div>

            {/* Separador visual */}
            <div className="hidden sm:block w-px h-6 bg-gray-200" />

            {/* Acciones */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={openAddActivity}
                className="flex items-center justify-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm text-xs sm:text-sm"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline sm:inline">Actividad</span>
              </button>

              <button
                onClick={() => setRapManagerOpen(true)}
                className="flex items-center justify-center space-x-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm border border-teal-200 text-xs sm:text-sm"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>RAP</span>
              </button>

              <button
                onClick={() => setCompVisibilityOpen(true)}
                className={`flex items-center justify-center space-x-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm border text-xs sm:text-sm ${hiddenForFicha.size > 0 ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'}`}
                title="Mostrar / ocultar competencias"
              >
                {hiddenForFicha.size > 0 ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                <span>CO</span>
                {hiddenForFicha.size > 0 && (
                  <span className="text-xs font-bold bg-amber-200 text-amber-800 rounded-full px-1.5 py-0.5 leading-none">{hiddenForFicha.size}</span>
                )}
              </button>


              <div className="inline-flex flex-col items-end gap-0.5">
                <label className="cursor-pointer inline-flex items-center justify-center space-x-1.5 bg-gray-900 hover:bg-black text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm text-xs sm:text-sm">
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Cargar</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </label>
                {lastUpload && (
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    Actualizado el {lastUpload}
                  </span>
                )}
              </div>

              {hiddenActivityIds.size > 0 && (
                <button
                  onClick={() => setShowHiddenActivities(p => !p)}
                  title={showHiddenActivities ? 'Volver a ocultar las evidencias ocultas' : `Ver las ${hiddenActivityIds.size} evidencia${hiddenActivityIds.size !== 1 ? 's' : ''} oculta${hiddenActivityIds.size !== 1 ? 's' : ''}`}
                  className={`inline-flex items-center justify-center space-x-1.5 border px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm text-xs sm:text-sm ${showHiddenActivities ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-300'}`}
                >
                  {showHiddenActivities ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span>{showHiddenActivities ? 'Ocultar' : `${hiddenActivityIds.size} oculta${hiddenActivityIds.size !== 1 ? 's' : ''}`}</span>
                </button>
              )}

              <button
                onClick={() => selectedPhases.length === 1 && gradesCountForSelectedPhase > 0 && setClearPhaseConfirm(selectedPhases[0])}
                title={selectedPhases.length === 1 && gradesCountForSelectedPhase > 0 ? `Eliminar las ${gradesCountForSelectedPhase} calificaciones de ${selectedPhases[0]}` : ''}
                className={`inline-flex items-center justify-center space-x-1.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm text-xs sm:text-sm ${selectedPhases.length === 1 && gradesCountForSelectedPhase > 0 ? 'visible' : 'invisible pointer-events-none'}`}
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Limpiar notas</span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowExport(prev => !prev)}
                  className="flex items-center justify-center space-x-1.5 bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm text-xs sm:text-sm"
                >
                  <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Exportar</span>
                </button>
                {showExport && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                    <div className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                      <button
                        onClick={() => { setShowExport(false); exportToExcel(); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                        Excel (.xlsx)
                      </button>
                      <button
                        onClick={() => { setShowExport(false); exportToPdf(); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <FileDown className="w-4 h-4 text-red-500" />
                        PDF
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setShowExport(false); exportToHtml(); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <FileDown className="w-4 h-4 text-blue-500" />
                        HTML
                      </button>
                      <button
                        onClick={() => { setShowExport(false); exportToMarkdown(); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <FileDown className="w-4 h-4 text-purple-500" />
                        Markdown (.md)
                      </button>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}

      {uploadInfo && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          {uploadInfo}
        </div>
      )}

      {/* Una sola tabla con columnas sticky: misma fila para datos y calificaciones, así las alturas siempre coinciden al hacer scroll */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-max border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            {/* ── Row 1 (phase groups OR competencia groups) – rendered when any grouping exists ── */}
            {(compGroups || rapCompGroups || phaseGroups) && (
              <tr style={{ height: 36 }}>
                {/* Sticky identity cols – span both rows */}
                <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-10 min-w-10 sticky left-0 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] align-middle overflow-hidden">
                  <input
                    type="checkbox"
                    checked={paginatedStudentsFiltered.length > 0 && paginatedStudentsFiltered.every(s => selectedStudents.has(s.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                </th>
                <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-xs font-mono w-10 min-w-10 sticky left-10 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] align-middle overflow-hidden">No</th>
                <th rowSpan={2} className="px-6 font-semibold text-gray-600 text-sm w-32 min-w-32 sticky left-20 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle">Documento</th>
                <th rowSpan={2} className="px-6 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[208px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle">
                  <button type="button" onClick={() => handleSort('firstname')} className={`inline-flex items-center gap-1 hover:text-teal-700 ${sortOrder === 'firstname' ? 'text-teal-700' : ''}`}>
                    Nombres{sortOrder === 'firstname' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th rowSpan={2} className="px-6 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[400px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle">
                  <button type="button" onClick={() => handleSort('lastname')} className={`inline-flex items-center gap-1 hover:text-teal-700 ${sortOrder === 'lastname' ? 'text-teal-700' : ''}`}>
                    Apellidos{sortOrder === 'lastname' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th rowSpan={2} className="px-6 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[592px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle">Correo electrónico</th>
                <th rowSpan={2} className={`px-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[752px] bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-visible align-middle ${showStatusFilter ? 'z-[100]' : 'z-30'}`}>
                  <div className="relative inline-flex items-center gap-1" ref={statusFilterRef}>
                    <button type="button" onClick={() => setShowStatusFilter(prev => !prev)} className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none whitespace-nowrap" title="Filtrar por estado">
                      Estado<Filter className="w-3.5 h-3.5 text-gray-400" />{filterStatus !== 'Todos' && <span className="text-teal-600 text-xs">({filterStatus})</span>}
                    </button>
                    {showStatusFilter && (
                      <>
                        <div className="fixed inset-0 z-[99]" onClick={() => setShowStatusFilter(false)} />
                        <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-[100] py-1">
                          <button type="button" onClick={() => { setFilterStatus('Todos'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Todos' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos los Estados</button>
                          <button type="button" onClick={() => { setFilterStatus('Formación'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Formación' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Formación</button>
                          <button type="button" onClick={() => { setFilterStatus('Cancelado'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Cancelado' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Cancelado</button>
                          <button type="button" onClick={() => { setFilterStatus('Retiro Voluntario'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Retiro Voluntario' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Retiro Voluntario</button>
                          <button type="button" onClick={() => { setFilterStatus('Deserción'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Deserción' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Deserción</button>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th rowSpan={2} className="px-6 font-semibold text-gray-600 text-sm w-28 min-w-28 sticky left-[864px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle">Ficha</th>
                <th rowSpan={2} className="px-3 font-semibold text-gray-600 text-sm w-20 min-w-20 sticky left-[976px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle text-center" title="Días desde el último ingreso al LMS (Asistencia LMS)">
                  <button type="button" onClick={() => handleSort('daysInactive')} className={`inline-flex flex-col items-center gap-0.5 hover:text-teal-700 leading-tight ${sortOrder === 'daysInactive' ? 'text-teal-700' : ''}`}>
                    <span className="text-[11px]">Días sin</span>
                    <span className="text-[11px]">ingresar</span>
                    {sortOrder === 'daysInactive' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-24 min-w-24 sticky left-[1056px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb,2px_0_6px_-2px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle text-center" title="Clic para ciclar: — → PE (Por Evaluar) → A (Aprobado) → —">Juicios Evaluativos</th>

                {/* Evidence section in Row 1:
                    - if phaseGroups: show phase group headers (colSpan per phase) — "Todas las fases" view
                    - if compGroups: show competencia group headers (colSpan per group)
                    - else (only rapCompGroups): blank spacer that occupies the evidence columns area */}
                {phaseGroups
                  ? phaseGroups.map((g, gi) => {
                    const color = PHASE_HEADER_COLORS[g.phase] ?? { bg: '#6b7280', text: '#ffffff' };
                    return (
                      <th
                        key={`phase-${gi}`}
                        colSpan={g.activities.length + 1}
                        className="px-2 py-1.5 text-center border-l border-white/30 align-middle"
                        style={{ backgroundColor: color.bg }}
                      >
                        <span className="text-xs font-bold whitespace-nowrap" style={{ color: color.text }}>
                          {g.phase}
                          <span className="ml-1.5 opacity-75 font-normal">({g.activities.length})</span>
                        </span>
                      </th>
                    );
                  })
                  : compGroups
                  ? compGroups.map((g, gi) => (
                    <th
                      key={`comp-${gi}`}
                      colSpan={g.activities.length}
                      className="px-1 py-1 text-center border-l border-gray-300 bg-teal-50/70 align-middle"
                      title={`${COMPETENCIA_IDS[g.compCode] || g.compCode} · ${g.compName}`}
                    >
                      <button
                        type="button"
                        onClick={() => setCompDetailModal({ compCode: g.compCode })}
                        className="w-full flex flex-col items-center hover:bg-teal-100/70 rounded px-1 py-0.5 transition-colors"
                      >
                        <span className="text-xs font-bold text-teal-700">{COMPETENCIA_IDS[g.compCode] || g.compCode}</span>
                        {g.aaKeys && (
                          <span className="text-[10px] text-teal-400 font-normal">{g.aaKeys}</span>
                        )}
                      </button>
                    </th>
                  ))
                  : visibleActivities.length > 0 && (
                    <th colSpan={visibleActivities.length} className="bg-gray-50 border-l border-gray-200" />
                  )
                }

                {/* Cuando compGroups está activo, el TOTAL no tiene header en Row 1 → lo ponemos aquí con rowSpan=2 */}
                {compGroups && !phaseGroups && visiblePhaseGroups.length > 0 && (() => {
                  const ph = visiblePhaseGroups[0].phase;
                  const phColor = PHASE_HEADER_COLORS[ph];
                  const totalLabel = PHASE_TOTAL_LABELS[ph] ?? `TOTAL ${ph}`;
                  return (
                    <th
                      rowSpan={2}
                      className="px-2 font-bold text-xs text-center border-r border-l border-gray-300 align-middle whitespace-nowrap min-w-[56px]"
                      style={{ backgroundColor: phColor?.bg ?? '#374151', color: phColor?.text ?? '#fff' }}
                      title={totalLabel}
                    >
                      TOTAL
                    </th>
                  );
                })()}

                {hasActivities && (
                  <>
                    <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center">Pendientes</th>
                    <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center">Promedio</th>
                    <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center">
                      <div className="relative inline-block" ref={finalFilterRef}>
                        <button type="button" onClick={() => setShowFinalFilter(prev => !prev)} className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none" title="Aprobado (A) solo cuando el aprendiz entrega y aprueba todas las actividades. Clic para filtrar.">
                          Final<Filter className="w-3.5 h-3.5 text-gray-400" />{finalFilter !== 'all' && <span className="text-teal-600 text-xs">({finalFilter === 'A' ? 'A' : '-'})</span>}
                        </button>
                        {showFinalFilter && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowFinalFilter(false)} />
                            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                              <button type="button" onClick={() => { setFinalFilter('all'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'all' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                              <button type="button" onClick={() => { setFinalFilter('A'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'A' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo A (aprobados)</button>
                              <button type="button" onClick={() => { setFinalFilter('-'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === '-' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo - (resto)</button>
                            </div>
                          </>
                        )}
                      </div>
                    </th>
                  </>
                )}
              </tr>
            )}

            {/* ── Row 2 (or only row when no double header): evidence columns + sticky when single row ── */}
            <tr style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
              {/* Sticky cols only rendered here when there is NO double header row */}
              {!(compGroups || rapCompGroups || phaseGroups) && (
                <>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-10 min-w-10 sticky left-0 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <input
                      type="checkbox"
                      checked={paginatedStudentsFiltered.length > 0 && paginatedStudentsFiltered.every(s => selectedStudents.has(s.id))}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                  </th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-xs font-mono w-10 min-w-10 sticky left-10 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>No</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-32 min-w-32 sticky left-20 z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Documento</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[208px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <button type="button" onClick={() => handleSort('firstname')} className={`inline-flex items-center gap-1 hover:text-teal-700 ${sortOrder === 'firstname' ? 'text-teal-700' : ''}`}>
                      Nombres{sortOrder === 'firstname' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[400px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <button type="button" onClick={() => handleSort('lastname')} className={`inline-flex items-center gap-1 hover:text-teal-700 ${sortOrder === 'lastname' ? 'text-teal-700' : ''}`}>
                      Apellidos{sortOrder === 'lastname' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[592px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Correo electrónico</th>
                  <th className={`px-4 py-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[752px] bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-visible align-middle ${showStatusFilter ? 'z-[100]' : 'z-30'}`} style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <div className="relative inline-flex items-center gap-1" ref={statusFilterRef}>
                      <button type="button" onClick={() => setShowStatusFilter(prev => !prev)} className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none whitespace-nowrap" title="Filtrar por estado">
                        Estado<Filter className="w-3.5 h-3.5 text-gray-400" />{filterStatus !== 'Todos' && <span className="text-teal-600 text-xs">({filterStatus})</span>}
                      </button>
                      {showStatusFilter && (
                        <>
                          <div className="fixed inset-0 z-[99]" onClick={() => setShowStatusFilter(false)} />
                          <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-[100] py-1">
                            <button type="button" onClick={() => { setFilterStatus('Todos'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Todos' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos los Estados</button>
                            <button type="button" onClick={() => { setFilterStatus('Formación'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Formación' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Formación</button>
                            <button type="button" onClick={() => { setFilterStatus('Cancelado'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Cancelado' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Cancelado</button>
                            <button type="button" onClick={() => { setFilterStatus('Retiro Voluntario'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Retiro Voluntario' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Retiro Voluntario</button>
                            <button type="button" onClick={() => { setFilterStatus('Deserción'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Deserción' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Deserción</button>
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-28 min-w-28 sticky left-[864px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Ficha</th>
                  <th className="px-3 py-4 font-semibold text-gray-600 text-sm w-20 min-w-20 sticky left-[976px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] overflow-hidden text-ellipsis whitespace-nowrap align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title="Días desde el último ingreso al LMS">
                    <button type="button" onClick={() => handleSort('daysInactive')} className={`inline-flex flex-col items-center gap-0.5 hover:text-teal-700 leading-tight ${sortOrder === 'daysInactive' ? 'text-teal-700' : ''}`}>
                      <span className="text-[11px]">Días sin</span>
                      <span className="text-[11px]">ingresar</span>
                      {sortOrder === 'daysInactive' && <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-24 min-w-24 sticky left-[1056px] z-30 bg-gray-50 shadow-[1px_0_0_0_#e5e7eb,2px_0_6px_-2px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title="Clic para ciclar: — → PE (Por Evaluar) → A (Aprobado) → —">Juicios Evaluativos</th>
                </>
              )}

              {/* Evidence column headers (always in this row) */}
              {visiblePhaseGroups.map(({ phase, activities }) => {
                const phColor = PHASE_HEADER_COLORS[phase];
                const totalLabel = PHASE_TOTAL_LABELS[phase] ?? `TOTAL ${phase}`;
                return (
                  <React.Fragment key={`phase-ev-${phase}`}>
                    {activities.map(activity => {
                      const compEntry = getEvCompEntry(activity);
                      const approved = activityApprovalCounts.get(activity.id) ?? 0;
                      const total = studentsForFicha.length;
                      const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
                      const tipoBadge = getTipoBadge(activity.detail);
                      const areaInfo = getAreaFromComp(compEntry?.competenciaCode);
                      return (
                        <th key={activity.id} className={`px-2 py-2 font-semibold text-sm border-r border-l border-gray-200 align-middle ${hiddenActivityIds.has(activity.id) ? 'bg-amber-50 text-amber-400' : 'bg-gray-50 text-gray-600'}`} style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX, borderLeft: areaInfo ? `3px solid ${areaInfo.color}` : undefined }}>
                          {/* aaKey + badges row */}
                          <div className="flex items-center justify-center gap-1 flex-wrap leading-none mb-0.5">
                            {compEntry?.aaKey && (
                              <span className="text-[10px] text-teal-400 font-medium">{compEntry.aaKey}</span>
                            )}
                            {areaInfo && (
                              <span className="text-[9px] px-1 rounded font-bold leading-tight" style={{ backgroundColor: areaInfo.color + '22', color: areaInfo.color }} title={areaInfo.label}>{areaInfo.label}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 justify-center">
                            <button type="button" onClick={() => openActivityDetail(activity)} className="hover:text-gray-900 underline decoration-dotted">{getActivityShortLabel(activity.name)}</button>
                            <button onClick={() => openEditActivity(activity)} className="text-gray-400 hover:text-teal-600" title="Editar actividad"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => toggleHideActivity(activity)} className={hiddenActivityIds.has(activity.id) ? 'text-amber-400 hover:text-teal-500' : 'text-gray-400 hover:text-amber-500'} title={hiddenActivityIds.has(activity.id) ? 'Mostrar evidencia' : 'Ocultar evidencia'}>
                              {hiddenActivityIds.has(activity.id) ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {total > 0 && (
                            <div className="mt-1 flex flex-col items-center gap-0.5" title={`${approved} de ${total} aprendices aprobaron`}>
                              <div className="w-full h-1 rounded-full bg-gray-200 overflow-hidden">
                                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[9px] font-medium text-gray-400 leading-none">{approved}/{total}</span>
                            </div>
                          )}
                        </th>
                      );
                    })}
                    {/* TOTAL column — sólo en Row 2 cuando NO hay compGroups (si hay compGroups, ya está en Row 1 con rowSpan=2) */}
                    {!compGroups && (
                      <th
                        className="px-2 py-2 font-bold text-xs text-center border-r border-l border-gray-300 align-middle whitespace-nowrap min-w-[56px]"
                        style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX, backgroundColor: phColor?.bg ?? '#374151', color: phColor?.text ?? '#fff' }}
                        title={totalLabel}
                      >
                        TOTAL
                      </th>
                    )}
                  </React.Fragment>
                );
              })}


              {/* Computed cols: only in single-row mode (otherwise rowSpan=2 from Row 1) */}
              {!(compGroups || rapCompGroups || phaseGroups) && hasActivities && (
                <>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Pendientes</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Promedio</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <div className="relative inline-block" ref={finalFilterRef}>
                      <button type="button" onClick={() => setShowFinalFilter(prev => !prev)} className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none" title="Aprobado (A) solo cuando el aprendiz entrega y aprueba todas las actividades. Clic para filtrar.">
                        Final<Filter className="w-3.5 h-3.5 text-gray-400" />{finalFilter !== 'all' && <span className="text-teal-600 text-xs">({finalFilter === 'A' ? 'A' : '-'})</span>}
                      </button>
                      {showFinalFilter && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowFinalFilter(false)} />
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                            <button type="button" onClick={() => { setFinalFilter('all'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'all' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                            <button type="button" onClick={() => { setFinalFilter('A'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'A' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo A (aprobados)</button>
                            <button type="button" onClick={() => { setFinalFilter('-'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === '-' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo - (resto)</button>
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {studentsForFicha.length === 0 ? (
              <tr>
                <td colSpan={10 + visibleActivities.length + visiblePhaseGroups.length + activeRapColumns.length + (hasActivities ? 3 : 0)} className="px-6 py-8 text-center text-gray-500">
                  {filterStatus !== 'Todos' ? 'Ningún aprendiz coincide con el filtro de estado seleccionado.' : hasSearchTerm ? 'No se encontraron aprendices con la búsqueda.' : selectedFicha === 'Todas' ? 'No hay aprendices.' : 'No hay aprendices en esta ficha.'}
                </td>
              </tr>
            ) : studentsFilteredByFinal.length === 0 ? (
              <tr>
                <td colSpan={10 + visibleActivities.length + visiblePhaseGroups.length + activeRapColumns.length + (hasActivities ? 3 : 0)} className="px-6 py-8 text-center text-gray-500">
                  Ningún aprendiz coincide con el filtro FINAL seleccionado.
                </td>
              </tr>
            ) : (
              paginatedStudentsFiltered.map((student, index) => (
                <tr key={student.id} className="group hover:bg-gray-50" style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                  <td className="px-4 py-4 w-10 min-w-10 sticky left-0 z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] align-middle overflow-hidden transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <input type="checkbox" checked={selectedStudents.has(student.id)} onChange={(e) => handleSelectStudent(student.id, e.target.checked)} className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500" />
                  </td>
                  <td className="px-4 py-4 w-10 min-w-10 text-gray-500 font-mono text-xs sticky left-10 z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] align-middle overflow-hidden transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td className="px-6 py-4 w-32 min-w-32 text-gray-600 font-mono text-xs sticky left-20 z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{student.documentNumber || '-'}</td>
                  <td className="px-6 py-4 w-48 min-w-48 text-xs font-medium text-gray-900 sticky left-[208px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors cursor-pointer hover:text-teal-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>{student.firstName}</td>
                  <td className="px-6 py-4 w-48 min-w-48 text-xs font-medium text-gray-900 sticky left-[400px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors cursor-pointer hover:text-teal-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>{student.lastName}</td>
                  <td className="px-6 py-4 w-40 min-w-40 text-sm text-gray-600 sticky left-[592px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{student.email || '—'}</td>
                  <td className="px-4 py-4 w-40 min-w-40 text-sm sticky left-[752px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <span
                      title={getEstadoStepperTooltip(student.id, student.status)}
                      className={`inline-block text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                        student.status === 'Formación' ? 'bg-green-100 text-green-800' :
                        student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' :
                        student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' :
                        student.status === 'Deserción' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {student.status || 'Formación'}
                    </span>
                  </td>
                  <td className="px-6 py-4 w-28 min-w-28 text-sm text-gray-700 sticky left-[864px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{student.group || <span className="text-gray-400">-</span>}</td>
                  <td className="px-3 py-4 w-20 min-w-20 text-sm tabular-nums text-center text-gray-700 sticky left-[976px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#f3f4f6] align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title={lmsLastAccess[student.id] ? `Último acceso: ${lmsLastAccess[student.id]}` : 'Sin registro de acceso LMS'}>
                    {(() => {
                      const last = lmsLastAccess[student.id];
                      const days = last != null ? daysSinceLms(last) : null;
                      if (days != null && days >= 0) {
                        return <span className={`font-semibold ${days >= 20 ? 'text-red-600' : ''}`}>{days}</span>;
                      }
                      return <span className="text-gray-400">-</span>;
                    })()}
                  </td>
                  <td
                    className="px-4 py-4 w-24 min-w-24 sticky left-[1056px] z-20 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#e5e7eb,2px_0_6px_-2px_rgba(0,0,0,0.12)] align-middle transition-colors cursor-pointer text-center overflow-hidden"
                    style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX }}
                    onClick={() => toggleJuicioEvaluativo(student.id, student.group)}
                    title={
                      getJuicioEstado(student.id, student.group) === '-'
                        ? 'Sin juicio — Clic: marcar Por Evaluar'
                        : getJuicioEstado(student.id, student.group) === 'orange'
                          ? 'Por Evaluar — Clic: marcar Aprobado'
                          : 'Aprobado — Clic: quitar juicio'
                    }
                  >
                    {(() => {
                      const estado = getJuicioEstado(student.id, student.group);
                      if (estado === '-') return <span className="text-gray-400 text-sm">-</span>;
                      if (estado === 'orange') return (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold tracking-wide leading-none whitespace-nowrap">
                          PE
                        </span>
                      );
                      return (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold tracking-wide leading-none whitespace-nowrap">
                          A
                        </span>
                      );
                    })()}
                  </td>
                  {visiblePhaseGroups.map(({ phase, activities }) => {
                    const phColor = PHASE_HEADER_COLORS[phase];
                    const manualPT = getManualPhaseTotal(student.id, phase, student.group);
                    const displayPT = manualPT === 'A' || manualPT === 'D' ? manualPT : '-';
                    return (
                      <React.Fragment key={`phase-data-${phase}`}>
                        {activities.map(activity => {
                          // En vista "Todas": resolver la actividad real de la ficha del estudiante
                          const resolvedActivity = activitiesByCanonicalAndFicha
                            ? (activitiesByCanonicalAndFicha
                                .get(getActivityPhaseScopedKey(activity))
                                ?.get(student.group || '') ??
                              activitiesByCanonicalAndFicha
                                .get(getActivityPhaseScopedKey(activity))
                                ?.get('') ?? activity)
                            : activity;
                          const grade = gradeMap.get(`${student.id}-${resolvedActivity.id}`);
                          const isEditing = editingCell?.studentId === student.id && editingCell?.activityId === resolvedActivity.id;
                          return (
                            <td key={activity.id} className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} onClick={() => { setEditingCell({ studentId: student.id, activityId: resolvedActivity.id }); setEditingScore(grade ? String(grade.score) : ''); }}>
                              {isEditing ? (
                                <input type="number" min={0} max={100} className="w-20 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-teal-500 outline-none" value={editingScore} onChange={(e) => setEditingScore(e.target.value)}
                                  onBlur={() => { const trimmed = editingScore.trim(); if (!trimmed) { deleteGradeEntry(student.id, resolvedActivity.id); setEditingCell(null); setEditingScore(''); return; } const numeric = Number(trimmed); if (!Number.isNaN(numeric)) { const finalScore = Math.max(0, Math.min(100, Math.round(numeric))); upsertGrades([{ studentId: student.id, activityId: resolvedActivity.id, score: finalScore, letter: scoreToLetter(finalScore), updatedAt: new Date().toISOString() }]); } setEditingCell(null); setEditingScore(''); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditingCell(null); setEditingScore(''); } }} autoFocus />
                              ) : grade ? (
                                <span className="inline-flex items-center gap-2"><span className="font-semibold">{grade.score}</span><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${grade.letter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{grade.letter}</span></span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          );
                        })}
                        {/* TOTAL fase — solo manual: (-) → A → D → (-) */}
                        <td
                          className="px-2 py-2 text-center font-bold text-xs border-r border-l border-gray-200 align-middle whitespace-nowrap cursor-pointer select-none"
                          style={{
                            height: TABLE_ROW_HEIGHT_PX,
                            maxHeight: TABLE_ROW_HEIGHT_PX,
                            ...(displayPT === 'A'
                              ? { backgroundColor: '#16a34a', color: '#fff' }
                              : displayPT === 'D'
                              ? { backgroundColor: '#dc2626', color: '#fff' }
                              : { backgroundColor: '#f9fafb', color: '#9ca3af' }),
                            ...(manualPT === 'A' || manualPT === 'D'
                              ? { outline: '2px solid rgba(255,255,255,0.5)', outlineOffset: '-3px' }
                              : {}),
                          }}
                          onClick={() => handlePhaseTotalClick(student.id, phase, student.group)}
                          title={`TOTAL ${phase} — Clic: - → A → D → -`}
                        >
                          {displayPT}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {(() => {
                    const final = getFinalForStudent(student.id, student.group);
                    const manualFinal = getManualFinal(student.id, student.group);
                    return (
                      <>
                        {hasActivities && (
                          <>
                            {/* Pendientes: número de evidencias no entregadas o reprobadas — clic para ver detalle */}
                            <td
                              className="px-4 py-4 text-sm border-r border-gray-200 align-middle overflow-hidden text-center cursor-pointer select-none"
                              style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}
                              onClick={() => setPendingDetailsStudent({ studentId: student.id, name: `${student.firstName} ${student.lastName}`, group: student.group })}
                              title="Clic para ver evidencias pendientes"
                            >
                              {final.pending > 0
                                ? <span className="font-bold text-red-500 underline decoration-dotted">{final.pending}</span>
                                : <span className="font-bold text-green-600">0</span>}
                            </td>
                            {/* Promedio estadístico */}
                            <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                              {final.score === null ? <span className="text-gray-400">-</span> : <span className="font-semibold">{Number(final.score).toFixed(2)}</span>}
                            </td>
                            {/* Final: manual, cicla - → A → D → - */}
                            <td
                              className="px-4 py-4 text-sm border-r border-gray-200 align-middle overflow-hidden text-center cursor-pointer select-none"
                              style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}
                              onClick={() => handleFinalClick(student.id, student.group)}
                              title="Clic para cambiar: - → A → D → -"
                            >
                              {manualFinal === 'A' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span>}
                              {manualFinal === 'D' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">D</span>}
                              {manualFinal === '-' && <span className="text-gray-400">-</span>}
                            </td>
                          </>
                        )}
                      </>
                    );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl text-sm flex-wrap gap-2">
        <span className="text-gray-500">
          {showAllStudents
            ? `Mostrando todos (${studentsFilteredByFinal.length} aprendices)`
            : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, studentsFilteredByFinal.length)} de ${studentsFilteredByFinal.length} resultados`}
        </span>
        <div className="flex items-center gap-3">
          {showAllStudents ? (
            <button
              type="button"
              onClick={() => setShowAllStudents(false)}
              className="text-teal-600 hover:text-teal-700 font-medium"
            >
              Mostrar 15 por página
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowAllStudents(true)}
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                Mostrar todos
              </button>
              {totalPagesFiltered > 1 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="text-gray-700 font-medium min-w-[6rem] text-center">
                    Página {currentPage} de {totalPagesFiltered}
                  </span>
                  <button
onClick={() => setCurrentPage(p => Math.min(totalPagesFiltered, p + 1))}
                     disabled={currentPage === totalPagesFiltered}
                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {selectedStudents.size > 0 && (
          <span className="text-gray-500">Seleccionados: {selectedStudents.size}</span>
        )}
      </div>

      {isActivityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setIsActivityModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}
              </h3>
              <button onClick={() => setIsActivityModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <textarea
                  ref={activityNameRef}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none overflow-hidden"
                  rows={2}
                  value={activityName}
                  onChange={(e) => {
                    setActivityName(e.target.value);
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                  onInput={() => {
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                  onFocus={() => {
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                />
              </div>
              <div className="pt-2 flex space-x-3">
                <button
                  onClick={() => setIsActivityModalOpen(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveActivity}
                  className="flex-1 bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activityToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setActivityToDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar actividad?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Se eliminarán las calificaciones asociadas a esta actividad.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setActivityToDelete(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteGradeActivity(activityToDelete.id);
                  setActivityToDelete(null);
                }}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {clearPhaseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setClearPhaseConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Limpiar calificaciones</h3>
            <p className="text-sm text-gray-600 mb-1">
              ¿Eliminar todas las calificaciones de <strong>{clearPhaseConfirm}</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Las actividades y evidencias se conservan. Solo se borran las notas ({gradesCountForSelectedPhase} entradas).
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClearPhaseConfirm(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  clearGradesForPhase(clearPhaseConfirm);
                  setClearPhaseConfirm(null);
                  loadData();
                }}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
              >
                Sí, limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {activityDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setActivityDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Detalle actividad</h3>
              <button onClick={() => setActivityDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-700 font-medium">{activityDetailModal.name}</div>
              {/* Tipo + Área badges */}
              {(() => {
                const compEntry = getEvCompEntry(activityDetailModal);
                const tipoBadge = getTipoBadge(activityDetailModal.detail);
                const areaInfo = getAreaFromComp(compEntry?.competenciaCode);
                return areaInfo ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {areaInfo && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: areaInfo.color + '22', color: areaInfo.color }}>{areaInfo.label}</span>
                    )}
                  </div>
                ) : null;
              })()}
              {activityDetailText && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{activityDetailText}</p>
              )}
              <div className="pt-2">
                <button
                  onClick={() => setActivityDetailModal(null)}
                  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {studentDetailModal && (() => {
        const sid = studentDetailModal.id;
        const final = getFinalForStudent(sid, studentDetailModal.group);
        const rapLetter = final.letter === 'A' ? 'A' : '-';
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setStudentDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detalle del aprendiz</h3>
              <button onClick={() => setStudentDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm flex-shrink-0">
              <div><span className="font-medium text-gray-500">Documento:</span> <span className="text-gray-900 font-mono">{studentDetailModal.documentNumber || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Apellidos:</span> <span className="text-gray-900">{studentDetailModal.lastName}</span></div>
              <div><span className="font-medium text-gray-500">Nombres:</span> <span className="text-gray-900">{studentDetailModal.firstName}</span></div>
              <div><span className="font-medium text-gray-500">Correo:</span> <span className="text-gray-900">{studentDetailModal.email || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Ficha:</span> <span className="text-gray-900">{studentDetailModal.group || 'General'}</span></div>
            </div>
            {/* ── Summary (always visible) ── */}
            {visibleActivities.length > 0 && (
              <div className="mt-4 flex-shrink-0 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
                  <div className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">Pendientes</div>
                  <div className="text-lg font-bold text-gray-800 mt-0.5">{final.pending}</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
                  <div className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">Promedio</div>
                  <div className="text-lg font-bold text-gray-800 mt-0.5">
                    {final.score !== null ? Number(final.score).toFixed(1) : '-'}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2 text-center flex flex-col items-center justify-center gap-0.5"
                  style={{ borderColor: final.letter === 'A' ? '#bbf7d0' : '#e5e7eb', backgroundColor: final.letter === 'A' ? '#f0fdf4' : '#f9fafb' }}>
                  <div className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">FINAL</div>
                  {final.letter === 'A'
                    ? <span className="text-sm font-bold px-3 py-0.5 rounded-full bg-green-100 text-green-700">A</span>
                    : <span className="text-lg font-bold text-gray-400">–</span>}
                </div>
              </div>
            )}

            {/* ── Calificaciones (evidencias) ── */}
            {visibleActivities.length > 0 && (
              <div className="mt-3 flex-shrink-0">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidencias</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 font-medium text-gray-600 text-xs">Actividad</th>
                        <th className="px-3 py-1.5 font-medium text-gray-600 text-right text-xs w-16">Nota</th>
                        <th className="px-3 py-1.5 font-medium text-gray-600 text-center text-xs w-12">Letra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibleActivities.map(activity => {
                        const grade = gradeMap.get(`${sid}-${activity.id}`);
                        return (
                          <tr key={activity.id}>
                            <td className="px-3 py-1.5 text-gray-900 text-xs">{getActivityShortLabel(activity.name)}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-xs">{grade ? grade.score : '-'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {grade ? (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${grade.letter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{grade.letter}</span>
                              ) : <span className="text-gray-400 text-xs">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── RAPs ── */}
            {rapColumnsForFicha.length > 0 && (
              <div className="mt-3 flex-shrink-0">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Resultados de Aprendizaje
                  {rapLetter === 'A' && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span>}
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {rapColumnsForFicha.map(key => {
                        const rapInfo = getRapStaticInfo(key);
                        return (
                          <tr key={key}>
                            <td className="px-3 py-2 text-gray-900">
                              <div className="flex items-start gap-1.5">
                                <span className="text-[10px] font-bold text-teal-400 bg-teal-50 rounded px-1 py-0.5 mt-0.5 flex-shrink-0 font-mono">{key.replace(/^(\d+)-(\d+)$/, 'RA-$2')}</span>
                                <div>
                                  {rapInfo
                                    ? <>
                                        <div className="text-xs font-semibold text-gray-800 leading-snug">{rapInfo.rapName}</div>
                                        <div className="text-[10px] text-teal-500 mt-0.5">{COMPETENCIA_NAMES[rapInfo.compCode] || rapInfo.compCode}</div>
                                      </>
                                    : <div className="text-xs text-gray-600">{key}</div>
                                  }
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center w-14">
                              {rapLetter === 'A'
                                ? <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">A</span>
                                : <span className="text-gray-400 text-xs">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="mt-4 flex-shrink-0">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h4>
              <textarea
                value={studentDetailObservation}
                onChange={(e) => setStudentDetailObservation(e.target.value)}
                placeholder="Escribe aquí observaciones sobre el aprendiz..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none resize-y min-h-[80px] max-h-32"
                rows={3}
              />
              <button
                type="button"
                onClick={() => {
                  if (!studentDetailModal) return;
                  const prev = getStudentGradeObservations();
                  saveStudentGradeObservations({ ...prev, [studentDetailModal.id]: studentDetailObservation });
                }}
                className="mt-2 w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 text-sm font-medium"
              >
                Guardar observaciones
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {compVisibilityOpen && (() => {
        // Unique competencias que aparecen en rapColumnsForFicha (lista completa, incluye ocultas)
        const compCodesInFicha: Array<{ compCode: string; rapCount: number }> = [];
        const seen = new Set<string>();
        rapColumnsForFicha.forEach(key => {
          const info = getRapStaticInfo(key);
          if (!info) return;
          if (!seen.has(info.compCode)) {
            seen.add(info.compCode);
            compCodesInFicha.push({ compCode: info.compCode, rapCount: 0 });
          }
          const entry = compCodesInFicha.find(e => e.compCode === info.compCode);
          if (entry) entry.rapCount++;
        });

        const toggleComp = (compCode: string) => {
          const currentHidden = [...(hiddenCompCodes[rapKey] ?? [])];
          const isHidden = currentHidden.includes(compCode);
          const next = isHidden
            ? currentHidden.filter(c => c !== compCode)
            : [...currentHidden, compCode];
          const updated = { ...hiddenCompCodes, [rapKey]: next };
          setHiddenCompCodes(updated);
          localStorage.setItem('asistenciapro_hidden_comps', JSON.stringify(updated));
        };

        const showAll = () => {
          const updated = { ...hiddenCompCodes, [rapKey]: [] };
          setHiddenCompCodes(updated);
          localStorage.setItem('asistenciapro_hidden_comps', JSON.stringify(updated));
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setCompVisibilityOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Visibilidad de Competencias</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Oculta competencias y sus RAPs de la tabla</p>
                </div>
                <button onClick={() => setCompVisibilityOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lista de competencias */}
              <div className="overflow-y-auto flex-1 min-h-0 space-y-1.5">
                {compCodesInFicha.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No hay competencias con RAPs estáticos en esta vista.</p>
                ) : compCodesInFicha.map(({ compCode, rapCount }) => {
                  const isHidden = hiddenForFicha.has(compCode);
                  const compId = COMPETENCIA_IDS[compCode] || compCode;
                  const compName = COMPETENCIA_NAMES[compCode] || compCode;
                  return (
                    <button
                      key={compCode}
                      type="button"
                      onClick={() => toggleComp(compCode)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                        isHidden
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : 'bg-white border-teal-100 hover:border-teal-300'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {isHidden
                          ? <EyeOff className="w-4 h-4 text-gray-400" />
                          : <Eye className="w-4 h-4 text-teal-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold font-mono text-teal-600">{compId}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{compCode}</span>
                        </div>
                        <p className={`text-xs leading-snug ${isHidden ? 'text-gray-400' : 'text-gray-700'}`}>{compName}</p>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">{rapCount} RAP{rapCount !== 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={showAll}
                  className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                  disabled={hiddenForFicha.size === 0}
                >
                  Mostrar todas
                </button>
                <div className="flex items-center gap-2">
                  {hiddenForFicha.size > 0 && (
                    <span className="text-xs text-amber-600 font-medium">{hiddenForFicha.size} oculta{hiddenForFicha.size !== 1 ? 's' : ''}</span>
                  )}
                  <button
                    onClick={() => setCompVisibilityOpen(false)}
                    className="bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700 text-sm font-medium"
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {compDetailModal && (() => {
        const { compCode } = compDetailModal;
        const compId = COMPETENCIA_IDS[compCode] || compCode;
        const compName = COMPETENCIA_NAMES[compCode] || compCode;
        const phaseRaps = (FASE_RAPS[effectiveSinglePhase] ?? Object.values(FASE_RAPS).flat())
          .filter(r => r.compCode === compCode);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setCompDetailModal(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex justify-between items-start mb-5 gap-3 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-teal-600 bg-teal-50 px-2.5 py-0.5 rounded font-mono">{compId}</span>
                    <span className="text-[11px] text-gray-400 font-mono">{compCode}</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 leading-snug">{compName}</h3>
                </div>
                <button onClick={() => setCompDetailModal(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* RAPs list */}
              {phaseRaps.length > 0 && (
                <div className="overflow-y-auto flex-1 min-h-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex-shrink-0">
                    Resultados de Aprendizaje — {exportPhaseTitle}
                  </p>
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    {phaseRaps.map(rap => (
                      <div key={rap.rapCode} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-14 pt-0.5">
                          <span className="text-xs font-bold text-teal-600 font-mono">
                            {rap.rapCode.replace(/^(\d+)-(\d+)$/, 'RA-$2')}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400">{rap.aaKey}</span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug">{rap.rapName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-5 flex-shrink-0">
                <button
                  onClick={() => setCompDetailModal(null)}
                  className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rapModal && (() => {
        const rapInfo = getRapStaticInfo(rapModal.key);
        const compName = rapInfo ? (COMPETENCIA_NAMES[rapInfo.compCode] || rapInfo.compCode) : null;
        const rapShort = rapModal.key.replace(/^(\d+)-(\d+)$/, 'RA-$2');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setRapModal(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex justify-between items-start mb-4 gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono font-semibold text-teal-500 bg-teal-50 px-2 py-0.5 rounded">{rapShort}</span>
                    {rapInfo && <span className="text-[11px] text-gray-400 font-mono">{rapInfo.rapCode}</span>}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 leading-snug">
                    {rapInfo ? rapInfo.rapName : rapModal.key}
                  </h3>
                  {compName && (
                    <p className="text-sm text-teal-600 font-medium mt-0.5">{compName}</p>
                  )}
                </div>
                <button onClick={() => setRapModal(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Detail card */}
              {rapInfo && (
                <div className="mb-5 rounded-lg bg-teal-50 border border-teal-100 divide-y divide-teal-100">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-teal-400 w-28 flex-shrink-0 pt-0.5">Competencia</span>
                    <div>
                      <span className="text-xs font-mono text-teal-500">{rapInfo.compCode}</span>
                      {compName && <p className="text-sm text-gray-800 font-semibold mt-0.5 leading-snug">{compName}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-teal-400 w-28 flex-shrink-0 pt-0.5">RAP · {rapInfo.aaKey}</span>
                    <div>
                      <span className="text-xs font-mono text-teal-500">{rapInfo.rapCode}</span>
                      <p className="text-sm text-gray-800 font-semibold mt-0.5 leading-snug">{rapInfo.rapName}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setRapModal(null)}
                  className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingDetailsStudent && (() => {
        const { studentId, name, group } = pendingDetailsStudent;
        const pendingList = getPendingEvidencesForStudent(studentId, group);
        const missing = pendingList.filter(p => p.reason === 'missing');
        const failed = pendingList.filter(p => p.reason === 'failed');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setPendingDetailsStudent(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Evidencias pendientes</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{name}{group ? ` — Ficha ${group}` : ''}</p>
                </div>
                <button onClick={() => setPendingDetailsStudent(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pendingList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-3xl mb-2">✓</span>
                  <p className="text-sm font-semibold text-green-700">Sin pendientes</p>
                  <p className="text-xs text-gray-400 mt-1">Todas las evidencias están aprobadas.</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 min-h-0 space-y-4">
                  {missing.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">No entregadas ({missing.length})</p>
                      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        {missing.map(({ activity }) => (
                          <div key={activity.id} className="px-4 py-2.5 flex items-start gap-2">
                            <span className="mt-0.5 w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-gray-800 leading-snug">{activity.detail || activity.name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{activity.phase}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {failed.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">Reprobadas ({failed.length})</p>
                      <div className="divide-y divide-gray-100 rounded-lg border border-red-100 overflow-hidden">
                        {failed.map(({ activity, grade }) => (
                          <div key={activity.id} className="px-4 py-2.5 flex items-start gap-2">
                            <span className="mt-0.5 w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-800 leading-snug">{activity.detail || activity.name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{activity.phase}</p>
                            </div>
                            {grade && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0">{grade.score} D</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex-shrink-0">
                <button
                  onClick={() => setPendingDetailsStudent(null)}
                  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rapManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setRapManagerOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Columnas RAP</h3>
              <button onClick={() => setRapManagerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  placeholder="Ej: RAP6"
                  value={rapNewName}
                  onChange={(e) => setRapNewName(e.target.value)}
                />
                <button
                  onClick={() => {
                    const name = rapNewName.trim();
                    if (!name) return;
                    const updated = { ...rapColumns };
                    const list = [...(updated[rapKey] || rapColumnsForFicha)];
                    if (!list.includes(name)) {
                      list.push(name);
                      updated[rapKey] = list;
                      setRapColumns(updated);
                      saveRapColumns(updated);
                      if (rapNewDetail.trim()) {
                        const notesUpdated = { ...rapNotes };
                        const fichaNotes = { ...(notesUpdated[rapKey] || {}) };
                        fichaNotes[name] = rapNewDetail.trim();
                        notesUpdated[rapKey] = fichaNotes;
                        setRapNotes(notesUpdated);
                        saveRapNotes(notesUpdated);
                      }
                    }
                    setRapNewName('');
                    setRapNewDetail('');
                  }}
                  className="bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700"
                >
                  Agregar
                </button>
              </div>
              <textarea
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
                rows={3}
                placeholder="Detalle del RAP (opcional)"
                value={rapNewDetail}
                onChange={(e) => setRapNewDetail(e.target.value)}
              />
              <div className="space-y-2">
                {rapColumnsForFicha.map(col => (
                  <div key={col} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{col}</span>
                    <button
                      onClick={() => {
                        const updated = { ...rapColumns };
                        const list = (updated[rapKey] || rapColumnsForFicha).filter(item => item !== col);
                        updated[rapKey] = list;
                        setRapColumns(updated);
                        saveRapColumns(updated);
                        const notesUpdated = { ...rapNotes };
                        if (notesUpdated[rapKey]) {
                          const { [col]: _removed, ...rest } = notesUpdated[rapKey];
                          notesUpdated[rapKey] = rest;
                          setRapNotes(notesUpdated);
                          saveRapNotes(notesUpdated);
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
