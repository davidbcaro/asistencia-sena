import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Calendar, User } from 'lucide-react';
import { Ficha, CronogramaGeneralEntry, CronogramaGeneralData } from '../types';
import { getFichas, getCronogramaGeneral, saveCronogramaGeneral, getGradeActivities, getPlaneacionSemanal, savePlaneacionSemanal } from '../services/db';

// ─── STATIC CURRICULUM DATA ──────────────────────────────────────────────────

type TipoEvidencia = 'conocimiento' | 'producto' | 'desempeño' | 'inducción';

interface Evidencia {
  id: string;
  tipo?: TipoEvidencia;
  area?: AreaKey;  // override de área (para evidencias sin código de competencia)
  descripcion: string;
}

interface ActividadAprendizaje {
  codigo: string;
  titulo: string;
  rap: string;
  rapTitulo: string;
  evidencias: Evidencia[];
}

interface ActividadProyecto {
  codigo: string;
  titulo: string;
  actividades: ActividadAprendizaje[];
}

interface FaseCronograma {
  nombre: string;
  color: string;
  textColor: string;
  actividadesProyecto: ActividadProyecto[];
}

const FASES: FaseCronograma[] = [
  {
    nombre: 'Inducción',
    color: '#f59e0b',
    textColor: '#ffffff',
    actividadesProyecto: [
      {
        codigo: 'AP-IND',
        titulo: 'Contextualización e Inducción al Programa SENA',
        actividades: [
          {
            codigo: 'AA1-Senología',
            titulo: 'AA1: Contextualización Senología.',
            rap: '240201530-01',
            rapTitulo: '240201530-01. Identificar la dinámica organizacional del SENA y el rol de la formación profesional integral de acuerdo con su proyecto de vida y el desarrollo profesional.',
            evidencias: [
              { id: 'AA1-EV01', tipo: 'inducción' as const, area: 'EEF' as const, descripcion: 'Infografía.' },
              { id: 'AA2-EV01', tipo: 'inducción' as const, area: 'EEF' as const, descripcion: 'Cuestionario.' },
              { id: 'AA2-EV02', tipo: 'inducción' as const, area: 'EEF' as const, descripcion: 'Cuestionario.' },
            ],
          },
        ],
      },
    ],
  },
  {
    nombre: 'Análisis',
    color: '#0d9488',
    textColor: '#ffffff',
    actividadesProyecto: [
      {
        codigo: 'AP1',
        titulo: 'AP1. Análisis del entorno en la gestión de redes de datos, de acuerdo con la tecnología empleada.',
        actividades: [
          {
            codigo: 'GA1-220501014-AA1',
            titulo: 'GA1-220501014-AA1 - Identificar las políticas de seguridad que se apliquen al entorno y a los requerimientos, a partir de la normatividad.',
            rap: '220501014-01',
            rapTitulo: '220501014-01 - Interpretar el plan de seguridad para la red de datos definidos en la solución, según estándares y normas internacionales.',
            evidencias: [
              { id: 'GA1-220501014-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario sobre técnicas de levantamiento de información, plan de seguridad y continuidad del servicio.' },
              { id: 'GA1-220501014-AA1-EV02', tipo: 'producto', descripcion: 'Informe de inventario y dispositivos de la red.' },
            ],
          },
          {
            codigo: 'GA1-220501046-AA1',
            titulo: 'GA1-220501046-AA1 - Reconocer software de sistemas, de programación y de aplicaciones, de acuerdo con la tecnología empleada.',
            rap: '220501046-01',
            rapTitulo: '220501046-01 - Alistar herramientas de tecnologías de la información y la comunicación (TIC), de acuerdo con las necesidades de procesamiento de información y comunicación.',
            evidencias: [
              { id: 'GA1-220501046-AA1-EV01', tipo: 'conocimiento', descripcion: 'Mapa mental - Software y servicios de Internet.' },
            ],
          },
          {
            codigo: 'GA1-220501046-AA2',
            titulo: 'GA1-220501046-AA2 - Aplicar los términos y funcionalidades de la ofimática, de acuerdo con estándares.',
            rap: '220501046-02',
            rapTitulo: '220501046-02 - Aplicar funcionalidades de herramientas y servicios TIC, de acuerdo con manuales de uso, procedimientos establecidos y buenas prácticas.',
            evidencias: [
              { id: 'GA1-220501046-AA2-EV01', tipo: 'conocimiento', descripcion: 'Taller. Utilización de las herramientas de ofimática.' },
            ],
          },
          {
            codigo: 'GA1-220501046-AA3',
            titulo: 'GA1-220501046-AA3 - Analizar la utilidad y la pertinencia en términos de productividad de los recursos TIC utilizados, de acuerdo con los requerimientos.',
            rap: '220501046-03',
            rapTitulo: '220501046-03 - Evaluar los resultados, de acuerdo con los requerimientos.',
            evidencias: [
              { id: 'GA1-220501046-AA3-EV01', tipo: 'producto', descripcion: 'Informe. Pertinencia y efectividad de los recursos utilizados según requerimientos.' },
            ],
          },
          {
            codigo: 'GA1-220501046-AA4',
            titulo: 'GA1-220501046-AA4 - Aplicar las mejoras de producto orientado desde las TIC, de acuerdo con requerimientos actuales.',
            rap: '220501046-04',
            rapTitulo: '220501046-04 - Optimizar los resultados, de acuerdo con la verificación.',
            evidencias: [
              { id: 'GA1-220501046-AA4-EV01', tipo: 'desempeño', descripcion: 'Plan de mejora de productos y procesos con la incorporación de TIC.' },
            ],
          },
          {
            codigo: 'GA1-240202501-AA1',
            titulo: 'GA1-240202501-AA1 - Identificar situaciones cotidianas y futuras, a través de una interacción social oral y escrita.',
            rap: '240202501-01',
            rapTitulo: '240202501-01 - Comprender información sobre situaciones cotidianas y laborales actuales y futuras a través de interacciones sociales de forma oral y escrita.',
            evidencias: [
              { id: 'GA1-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA1-240202501-AA1-EV02', tipo: 'desempeño', descripcion: 'Video presentación.' },
              { id: 'GA1-240202501-AA1-EV03', tipo: 'producto', descripcion: 'Folleto.' },
            ],
          },
        ],
      },
    ],
  },
  {
    nombre: 'Planeación',
    color: '#3b82f6',
    textColor: '#ffffff',
    actividadesProyecto: [
      {
        codigo: 'AP2',
        titulo: 'AP2. Plantear la infraestructura de interconexión cableada e inalámbrica de las redes de datos, según requerimientos de funcionamiento.',
        actividades: [
          {
            codigo: 'GA2-220501104-AA1',
            titulo: 'GA2-220501104-AA1 - Diseñar la topología de red que distribuya los equipos activos de interconexión, de acuerdo con las normas internacionales.',
            rap: '220501104-01',
            rapTitulo: '220501104-01 - Planificar la implementación de la arquitectura de la red según el diseño establecido.',
            evidencias: [
              { id: 'GA2-220501104-AA1-EV01', tipo: 'conocimiento', descripcion: 'Taller con interpretación de planos.' },
              { id: 'GA2-220501104-AA1-EV02', tipo: 'producto', descripcion: 'Video expositivo sobre las topologías estudiadas.' },
            ],
          },
          {
            codigo: 'GA2-220501107-AA1',
            titulo: 'GA2-220501107-AA1 - Diseñar la topología física de la red para distribuir los equipos inalámbricos, que cumplan con los requerimientos de funcionamiento, según la normativa.',
            rap: '220501107-01',
            rapTitulo: '220501107-01 - Planificar la implementación de los componentes inalámbricos en la red de datos, de acuerdo con especificaciones del diseño y normatividad vigente.',
            evidencias: [
              { id: 'GA2-220501107-AA1-EV01', tipo: 'producto', descripcion: 'Lista de chequeo para inspección de infraestructura física.' },
              { id: 'GA2-220501107-AA1-EV02', tipo: 'producto', descripcion: 'Informe de planeación de implementación de red inalámbrica.' },
            ],
          },
          {
            codigo: 'GA2-240201528-AA1',
            titulo: 'GA2-240201528-AA1 - Desarrollar procedimientos aritméticos aplicados a la resolución de problemáticas de la vida cotidiana.',
            rap: '240201528-01',
            rapTitulo: '240201528-01 - Identificar modelos matemáticos de acuerdo con los requerimientos del problema planteado en contextos sociales y productivo.',
            evidencias: [
              { id: 'GA2-240201528-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario: procedimientos aritméticos.' },
            ],
          },
          {
            codigo: 'GA2-240201528-AA2',
            titulo: 'GA2-240201528-AA2 - Resolver problemas de aplicación de situaciones de los contextos productivo y social, a partir del uso de herramientas matemáticas.',
            rap: '240201528-02',
            rapTitulo: '240201528-02 - Plantear problemas matemáticos a partir de situaciones generadas en el contexto social y productivo.',
            evidencias: [
              { id: 'GA2-240201528-AA2-EV01', tipo: 'desempeño', descripcion: 'Informe: planteamiento de ecuación.' },
            ],
          },
          {
            codigo: 'GA2-240201528-AA3',
            titulo: 'GA2-240201528-AA3 - Realizar un muestreo estadístico acerca de una situación contextualizada en la vida diaria.',
            rap: '240201528-03',
            rapTitulo: '240201528-03 - Resolver problemas matemáticos a partir de situaciones generadas en el contexto social y productivo.',
            evidencias: [
              { id: 'GA2-240201528-AA3-EV01', tipo: 'producto', descripcion: 'Video: sustentación.' },
            ],
          },
          {
            codigo: 'GA2-240201528-AA4',
            titulo: 'GA2-240201528-AA4 - Sistematizar el cálculo de perímetros, áreas y volúmenes de figuras planas y sólidos regulares, a partir de un algoritmo.',
            rap: '240201528-04',
            rapTitulo: '240201528-04 - Proponer acciones de mejora frente a los resultados de los procedimientos matemáticos de acuerdo con el problema planteado.',
            evidencias: [
              { id: 'GA2-240201528-AA4-EV01', tipo: 'desempeño', descripcion: 'Algoritmo para el cálculo de áreas y volúmenes.' },
            ],
          },
          {
            codigo: 'GA2-240202501-AA1',
            titulo: 'GA2-240202501-AA1 - Reportar opiniones sobre situaciones cotidianas y laborales, pasadas y futuras, en contextos sociales.',
            rap: '240202501-02',
            rapTitulo: '240202501-02 - Intercambiar opiniones sobre situaciones cotidianas y laborales actuales, pasadas y futuras en contextos sociales orales y escritos.',
            evidencias: [
              { id: 'GA2-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA2-240202501-AA1-EV02', tipo: 'desempeño', descripcion: 'Vídeo entrevista virtual.' },
              { id: 'GA2-240202501-AA1-EV03', tipo: 'producto', descripcion: 'Crónica.' },
            ],
          },
          {
            codigo: 'GA2-240202501-AA2',
            titulo: 'GA2-240202501-AA2 - Expresar opiniones sobre situaciones cotidianas y laborales actuales, pasadas y futuras, en contextos sociales.',
            rap: '240202501-02',
            rapTitulo: '240202501-02 - Intercambiar opiniones sobre situaciones cotidianas y laborales actuales, pasadas y futuras en contextos sociales orales y escritos.',
            evidencias: [
              { id: 'GA2-240202501-AA2-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA2-240202501-AA2-EV02', tipo: 'desempeño', descripcion: 'Video presentación de un lugar turístico.' },
              { id: 'GA2-240202501-AA2-EV03', tipo: 'producto', descripcion: 'Documento escrito.' },
            ],
          },
          {
            codigo: 'GA3-220501091-AA1',
            titulo: 'GA3-220501091-AA1 - Preparar los dispositivos de red, sistemas operativos y servicios de red para la implementación de comunicaciones unificadas, de acuerdo con el diseño y la normatividad.',
            rap: '220501091-01',
            rapTitulo: '220501091-01 - Planificar la implementación de los equipos y software de comunicación de voz sobre IP (VoIP), según el diseño establecido.',
            evidencias: [
              { id: 'GA3-220501091-AA1-EV01', tipo: 'producto', descripcion: 'Listado de dispositivos y recursos de VoIP con sus características.' },
              { id: 'GA3-220501091-AA1-EV02', tipo: 'producto', descripcion: 'Informe con las posibles soluciones (ventajas y desventajas) de VoIP.' },
            ],
          },
          {
            codigo: 'GA3-220501105-AA1',
            titulo: 'GA3-220501105-AA1 - Implementar plataformas de monitoreo, de acuerdo con la infraestructura tecnológica y los servicios de red implementados.',
            rap: '220501105-01',
            rapTitulo: '220501105-01 - Planificar la implementación de plataformas de gestión y monitoreo según parámetros definidos en la solución.',
            evidencias: [
              { id: 'GA3-220501105-AA1-EV01', tipo: 'desempeño', descripcion: 'Lista de chequeo de los elementos mínimos necesarios para la implementación de la plataforma de monitoreo.' },
            ],
          },
          {
            codigo: 'GA3-220201501-AA1',
            titulo: 'GA3-220201501-AA1 - Reconocer los principios y leyes físicas aplicados al contexto productivo.',
            rap: '220201501-01',
            rapTitulo: '220201501-01 - Identificar los principios y leyes de la física en la solución de problemas de acuerdo al contexto productivo.',
            evidencias: [
              { id: 'GA3-220201501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
            ],
          },
          {
            codigo: 'GA3-220201501-AA2',
            titulo: 'GA3-220201501-AA2 - Interpretar y explicar los cambios físicos de los cuerpos, según las teorías, leyes y principios.',
            rap: '220201501-02',
            rapTitulo: '220201501-02 - Solucionar problemas asociados con el sector productivo con base en los principios y leyes de la física.',
            evidencias: [
              { id: 'GA3-220201501-AA2-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre experimento de aplicación.' },
            ],
          },
          {
            codigo: 'GA3-220201501-AA3',
            titulo: 'GA3-220201501-AA3 - Describir las manifestaciones de energía, explicando las variables que intervienen, según el contexto social y productivo.',
            rap: '220201501-03',
            rapTitulo: '220201501-03 - Verificar las transformaciones físicas de la materia utilizando herramientas tecnológicas.',
            evidencias: [
              { id: 'GA3-220201501-AA3-EV01', tipo: 'producto', descripcion: 'Informe de laboratorio.' },
            ],
          },
          {
            codigo: 'GA3-220201501-AA4',
            titulo: 'GA3-220201501-AA4 - Realizar experimentos que permitan interpretar y argumentar fenómenos, de acuerdo con los principios y leyes de la física, conforme con el contexto productivo.',
            rap: '220201501-04',
            rapTitulo: '220201501-04 - Proponer acciones de mejora en los procesos productivos de acuerdo con los principios y leyes de la física.',
            evidencias: [
              { id: 'GA3-220201501-AA4-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre experimento de aplicación.' },
              { id: 'GA3-220201501-AA4-EV02', tipo: 'producto', descripcion: 'Bitácora de procesos desarrollados en la competencia.' },
            ],
          },
        ],
      },
    ],
  },
  {
    nombre: 'Ejecución',
    color: '#8b5cf6',
    textColor: '#ffffff',
    actividadesProyecto: [
      {
        codigo: 'AP3',
        titulo: 'AP3. Implementar la infraestructura tecnológica y la seguridad informática, para dar soluciones de gestión.',
        actividades: [
          {
            codigo: 'GA4-220501104-AA1',
            titulo: 'GA4-220501104-AA1 - Conectorizar los dispositivos de la red LAN, de acuerdo con protocolos técnicos.',
            rap: '220501104-02',
            rapTitulo: '220501104-02 - Configurar los equipos activos de interconexión, de acuerdo con la arquitectura establecida.',
            evidencias: [
              { id: 'GA4-220501104-AA1-EV01', tipo: 'desempeño', descripcion: 'Archivo de simulación de la implementación de esquema de subredes y direccionamiento IPv4 e IPv6.' },
              { id: 'GA4-220501104-AA1-EV02', tipo: 'producto', descripcion: 'Informe práctica de laboratorio sobre dispositivos activos de subredes y direccionamiento IPv4 o IPv6.' },
            ],
          },
          {
            codigo: 'GA4-220501104-AA2',
            titulo: 'GA4-220501104-AA2 - Configurar los equipos activos de interconexión, de acuerdo con los protocolos, estándares y requisitos, que garanticen el cumplimiento al diseño preestablecido.',
            rap: '220501104-02',
            rapTitulo: '220501104-02 - Configurar los equipos activos de interconexión, de acuerdo con la arquitectura establecida.',
            evidencias: [
              { id: 'GA4-220501104-AA2-EV01', tipo: 'producto', descripcion: 'Archivo de simulación de configuración de dispositivos activos con tecnologías WAN, VLAN y enrutamientos.' },
              { id: 'GA4-220501104-AA2-EV02', tipo: 'producto', descripcion: 'Informe práctica de laboratorio sobre configuración de dispositivos activos para tecnologías WAN, VLAN y enrutamientos.' },
            ],
          },
          {
            codigo: 'GA4-220501107-AA1',
            titulo: 'GA4-220501107-AA1 - Configurar los dispositivos necesarios para el buen funcionamiento de la red inalámbrica, de acuerdo con la documentación técnica reglamentaria.',
            rap: '220501107-02 / 220501107-03',
            rapTitulo: '220501107-02 - Configurar los componentes inalámbricos, acorde con la arquitectura establecida, técnicas y buenas prácticas. / 220501107-03 - Verificar la transmisión de datos en la infraestructura inalámbrica.',
            evidencias: [
              { id: 'GA4-220501107-AA1-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre configuración de componentes inalámbricos.' },
              { id: 'GA4-220501107-AA1-EV02', tipo: 'producto', descripcion: 'Video expositivo sobre configuración de parámetros de integración en red cableada.' },
              { id: 'GA4-220501107-AA1-EV03', tipo: 'producto', descripcion: 'Lista de verificación para canales de comunicación inalámbrica.' },
              { id: 'GA4-220501107-AA1-EV04', tipo: 'producto', descripcion: 'Video expositivo del funcionamiento de la red inalámbrica implementada (práctica de laboratorio).' },
            ],
          },
          {
            codigo: 'GA4-240201524-AA1',
            titulo: 'GA4-240201524-AA1 - Identificar la importancia de los componentes de la comunicación para transmitir un mensaje, según sus características, intencionalidad y contexto.',
            rap: '240201524-01',
            rapTitulo: '240201524-01 - Analizar los componentes de la comunicación según sus características, intencionalidad y contexto.',
            evidencias: [
              { id: 'GA4-240201524-AA1-EV01', tipo: 'conocimiento', descripcion: 'Video. ¿Cómo nos comunicamos a través del discurso?' },
            ],
          },
          {
            codigo: 'GA4-240201524-AA2',
            titulo: 'GA4-240201524-AA2 - Aplicar los componentes de la comunicación y argumentar sus procesos, de acuerdo con las diferentes situaciones comunicativas.',
            rap: '240201524-02',
            rapTitulo: '240201524-02 - Argumentar en forma oral y escrita atendiendo las exigencias y particularidades de las diversas situaciones comunicativas mediante los distintos sistemas de representación.',
            evidencias: [
              { id: 'GA4-240201524-AA2-EV01', tipo: 'desempeño', descripcion: 'Video. La comunicación como expresión humana.' },
            ],
          },
          {
            codigo: 'GA4-240201524-AA3',
            titulo: 'GA4-240201524-AA3 - Interpretar asertivamente situaciones del contexto, de forma lógica y estructurada, graficando la información a transmitir, a través de elementos e instrumentos gráficos.',
            rap: '240201524-03',
            rapTitulo: '240201524-03 - Relacionar los procesos comunicativos teniendo en cuenta criterios de lógica y racionalidad.',
            evidencias: [
              { id: 'GA4-240201524-AA3-EV01', tipo: 'desempeño', descripcion: 'Infografía. Comunicación de la interpretación del entorno.' },
            ],
          },
          {
            codigo: 'GA4-240201524-AA4',
            titulo: 'GA4-240201524-AA4 - Comunicar asertivamente, con cohesión y coherencia léxica, basado en los procesos comunicativos que se dan en el contexto del desempeño laboral.',
            rap: '240201524-04',
            rapTitulo: '240201524-04 - Establecer procesos de enriquecimiento lexical y acciones de mejoramiento en el desarrollo de procesos comunicativos según requerimientos del contexto.',
            evidencias: [
              { id: 'GA4-240201524-AA4-EV01', tipo: 'producto', descripcion: 'Informe. Creación de contenidos comunicativo.' },
            ],
          },
          {
            codigo: 'GA4-240202501-AA1',
            titulo: 'GA4-240202501-AA1 - Dialogar sobre posibles soluciones a problemas dentro de contextos sociales.',
            rap: '240202501-03',
            rapTitulo: '240202501-03 - Discutir sobre posibles soluciones a problemas dentro de un rango variado de contextos sociales y laborales.',
            evidencias: [
              { id: 'GA4-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA4-240202501-AA1-EV02', tipo: 'producto', descripcion: 'Audio.' },
              { id: 'GA4-240202501-AA1-EV03', tipo: 'desempeño', descripcion: 'Foro.' },
            ],
          },
          {
            codigo: 'GA4-240202501-AA2',
            titulo: 'GA4-240202501-AA2 - Reportar sobre posibles soluciones a problemas dentro de contextos laborales.',
            rap: '240202501-03',
            rapTitulo: '240202501-03 - Discutir sobre posibles soluciones a problemas dentro de un rango variado de contextos sociales y laborales.',
            evidencias: [
              { id: 'GA4-240202501-AA2-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA4-240202501-AA2-EV02', tipo: 'producto', descripcion: 'Audio.' },
              { id: 'GA4-240202501-AA2-EV03', tipo: 'desempeño', descripcion: 'Foro.' },
            ],
          },
          {
            codigo: 'GA5-220501106-AA1',
            titulo: 'GA5-220501106-AA1 - Configurar los elementos requeridos para los servicios de red, de acuerdo con los protocolos técnicos.',
            rap: '220501106-01',
            rapTitulo: '220501106-01 - Configurar el hardware, dispositivos de cómputo y sistemas operativos necesarios para la implementación de los servicios de red.',
            evidencias: [
              { id: 'GA5-220501106-AA1-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre la configuración e instalación de sistemas operativos en equipos de cómputo.' },
              { id: 'GA5-220501106-AA1-EV02', tipo: 'producto', descripcion: 'Informe técnico sobre equipos de cómputo y sistemas operativos.' },
            ],
          },
          {
            codigo: 'GA5-240201064-AA1',
            titulo: 'GA5-240201064-AA1 - Identificar las características socioeconómicas, tecnológicas, políticas y culturales del contexto productivo, de acuerdo con las necesidades y problemáticas que lo afectan.',
            rap: '240201064-01',
            rapTitulo: '240201064-01 - Analizar el contexto productivo según sus características y necesidades.',
            evidencias: [
              { id: 'GA5-240201064-AA1-EV01', tipo: 'producto', descripcion: 'Mapa mental.' },
            ],
          },
          {
            codigo: 'GA5-240201064-AA2',
            titulo: 'GA5-240201064-AA2 - Elaborar la propuesta de investigación formativa, teniendo en cuenta las situaciones de orden social y productivo.',
            rap: '240201064-02/03/04',
            rapTitulo: '240201064-02/03/04 - Estructurar el proyecto / Argumentar aspectos teóricos / Proponer soluciones a las necesidades del contexto.',
            evidencias: [
              { id: 'GA5-240201064-AA2-EV01', tipo: 'desempeño', descripcion: 'Propuesta de investigación.' },
            ],
          },
          {
            codigo: 'GA5-240202501-AA1',
            titulo: 'GA5-240202501-AA1 - Establecer acciones de mejora relacionadas con expresiones, estructuras y desempeño, de acuerdo al programa de formación.',
            rap: '240202501-04',
            rapTitulo: '240202501-04 - Implementar acciones de mejora relacionadas con el uso de expresiones, estructuras y desempeño según los resultados de aprendizaje formulados para el programa.',
            evidencias: [
              { id: 'GA5-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Cuestionario.' },
              { id: 'GA5-240202501-AA1-EV02', tipo: 'producto', descripcion: 'Mapa mental.' },
              { id: 'GA5-240202501-AA1-EV03', tipo: 'desempeño', descripcion: 'Blog.' },
            ],
          },
          {
            codigo: 'GA6-220501106-AA1',
            titulo: 'GA6-220501106-AA1 - Implementar servicios de infraestructura de red, de acuerdo a requerimientos solicitados, teniendo en cuenta sistemas de seguridad, registro de auditoría, centralización de información, redundancia y desarrollo de tareas programadas.',
            rap: '220501106-02',
            rapTitulo: '220501106-02 - Implementar los servicios red necesarios para cumplir los requerimientos del portafolio de servicios de tecnologías de la información.',
            evidencias: [
              { id: 'GA6-220501106-AA1-EV01', tipo: 'producto', descripcion: 'Video expositivo de la implementación de mecanismos de comunicación e interconexión.' },
            ],
          },
          {
            codigo: 'GA6-220501091-AA1',
            titulo: 'GA6-220501091-AA1 - Implementar una solución de comunicaciones unificada para la infraestructura de red, teniendo en cuenta los requerimientos y las normas establecidas.',
            rap: '220501091-02',
            rapTitulo: '220501091-02 - Configurar equipos y software de comunicación de voz sobre IP (VoIP), acorde con la arquitectura establecida, técnicas y buenas prácticas.',
            evidencias: [
              { id: 'GA6-220501091-AA1-EV01', tipo: 'producto', descripcion: 'Video expositivo de la configuración de equipos y software de VoIP.' },
            ],
          },
          {
            codigo: 'GA6-240202501-AA1',
            titulo: 'GA6-240202501-AA1 - Simular un proceso para la realización de una actividad en su quehacer laboral.',
            rap: '240202501-05',
            rapTitulo: '240202501-05 - Presentar un proceso para la realización de una actividad en su quehacer laboral de acuerdo con los procedimientos establecidos desde su programa de formación.',
            evidencias: [
              { id: 'GA6-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Diagrama de flujo.' },
              { id: 'GA6-240202501-AA1-EV02', tipo: 'producto', descripcion: 'Ensayo.' },
              { id: 'GA6-240202501-AA1-EV03', tipo: 'producto', descripcion: 'Vídeo.' },
            ],
          },
          {
            codigo: 'GA7-220501105-AA1',
            titulo: 'GA7-220501105-AA1 - Implementar plataformas de monitoreo, de acuerdo con la infraestructura tecnológica y los servicios de red implementados.',
            rap: '220501105-02',
            rapTitulo: '220501105-02 - Implementar sistemas de gestión y monitoreo en la red, según estándares, políticas y recursos de la organización.',
            evidencias: [
              { id: 'GA7-220501105-AA1-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre configuración de equipos y software, involucrados en la plataforma de gestión y monitoreo.' },
              { id: 'GA7-220501105-AA1-EV02', tipo: 'producto', descripcion: 'Informe práctica de laboratorio sobre la configuración de la plataforma implementada, configurada y funcional.' },
            ],
          },
          {
            codigo: 'GA7-220501014-AA1',
            titulo: 'GA7-220501014-AA1 - Establecer el estado de la seguridad de la red, según políticas de seguridad de la organización.',
            rap: '220501014-02',
            rapTitulo: '220501014-02 - Implementar el plan de seguridad en la organización aplicando estándares y normas internacionales de seguridad vigentes.',
            evidencias: [
              { id: 'GA7-220501014-AA1-EV01', tipo: 'producto', descripcion: 'Informe práctica sobre componentes de hardware y software de seguridad de la red.' },
              { id: 'GA7-220501014-AA1-EV02', tipo: 'producto', descripcion: 'Informe de implementación de políticas, controles y procedimientos.' },
            ],
          },
          {
            codigo: 'GA7-230101507-AA1',
            titulo: 'GA7-230101507-AA1 - Aplicar los correctivos necesarios que permitan mejorar las capacidades de acuerdo con la valoración del estado general de las condiciones psicomotrices individuales.',
            rap: '230101507-01',
            rapTitulo: '230101507-01 - Desarrollar habilidades psicomotrices en el contexto productivo y social.',
            evidencias: [
              { id: 'GA7-230101507-AA1-EV01', tipo: 'desempeño', descripcion: 'Foro temático - Identificar y establecer las técnicas de coordinación motriz.' },
            ],
          },
          {
            codigo: 'GA7-230101507-AA2',
            titulo: 'GA7-230101507-AA2 - Establecer hábitos de vida saludable, mediante la aplicación de fundamentos de nutrición e higiene.',
            rap: '230101507-02',
            rapTitulo: '230101507-02 - Practicar hábitos saludables mediante la aplicación de fundamentos de nutrición e higiene.',
            evidencias: [
              { id: 'GA7-230101507-AA2-EV01', tipo: 'producto', descripcion: 'Infografía – Estilos de vida saludable.' },
            ],
          },
          {
            codigo: 'GA7-230101507-AA3',
            titulo: 'GA7-230101507-AA3 - Implementar acciones de la cultura física en el mejoramiento de la calidad de vida en el contexto individual, laboral y social, a partir de prácticas básicas de nutrición.',
            rap: '230101507-03',
            rapTitulo: '230101507-03 - Ejecutar actividades de acondicionamiento físico orientadas hacia el mejoramiento de la condición física en los contextos productivo y social.',
            evidencias: [
              { id: 'GA7-230101507-AA3-EV01', tipo: 'producto', descripcion: 'Ficha antropométrica de valoración de la condición física.' },
            ],
          },
          {
            codigo: 'GA7-230101507-AA4',
            titulo: 'GA7-230101507-AA4 - Identificar la higiene postural y pausas activas correctas en el desempeño del área ocupacional de acuerdo con la naturaleza de la función productiva.',
            rap: '230101507-04',
            rapTitulo: '230101507-04 - Implementar un plan de ergonomía y pausas activas, según las características de la función productiva.',
            evidencias: [
              { id: 'GA7-230101507-AA4-EV01', tipo: 'producto', descripcion: 'Folleto de lesiones más comunes en el trabajo o vida cotidiana, y la importancia de las pausas activas.' },
            ],
          },
          {
            codigo: 'GA7-240202501-AA1',
            titulo: 'GA7-240202501-AA1 - Presentar funciones de su ocupación laboral.',
            rap: '240202501-06',
            rapTitulo: '240202501-06 - Explicar las funciones de su ocupación laboral usando expresiones de acuerdo al nivel requerido por el programa de formación.',
            evidencias: [
              { id: 'GA7-240202501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Documento escrito.' },
              { id: 'GA7-240202501-AA1-EV02', tipo: 'producto', descripcion: 'Video.' },
              { id: 'GA7-240202501-AA1-EV03', tipo: 'desempeño', descripcion: 'Foro.' },
            ],
          },
        ],
      },
    ],
  },
  {
    nombre: 'Evaluación',
    color: '#ef4444',
    textColor: '#ffffff',
    actividadesProyecto: [
      {
        codigo: 'AP4',
        titulo: 'AP4. Gestionar la infraestructura tecnológica y la seguridad para las redes de datos.',
        actividades: [
          {
            codigo: 'GA8-220501104-AA1',
            titulo: 'GA8-220501104-AA1 - Comprobar el funcionamiento de los equipos activos y las configuraciones realizadas, para garantizar la disponibilidad de la infraestructura informática.',
            rap: '220501104-03',
            rapTitulo: '220501104-03 - Verificar el funcionamiento de los equipos activos de interconexión, de acuerdo con los requerimientos establecidos.',
            evidencias: [
              { id: 'GA8-220501104-AA1-EV01', tipo: 'conocimiento', descripcion: 'Taller sobre indicadores y medidas de desempeño de la red.' },
              { id: 'GA8-220501104-AA1-EV02', tipo: 'producto', descripcion: 'Informe sobre las pruebas de conectividad, disponibilidad, rendimiento y calidad de la red.' },
            ],
          },
          {
            codigo: 'GA8-220501104-AA2',
            titulo: 'GA8-220501104-AA2 - Gestionar los equipos activos de interconexión, de acuerdo con los protocolos, estándares y requisitos, que garanticen el cumplimiento al diseño preestablecido.',
            rap: '220501104-04',
            rapTitulo: '220501104-04 - Gestionar los equipos activos de interconexión, para garantizar el funcionamiento de la red.',
            evidencias: [
              { id: 'GA8-220501104-AA2-EV01', tipo: 'producto', descripcion: 'Informe sobre detección de fallas en el funcionamiento de la red.' },
            ],
          },
          {
            codigo: 'GA8-220501107-AA1',
            titulo: 'GA8-220501107-AA1 - Verificar el funcionamiento de la red inalámbrica configurada y realizar los informes técnicos y ejecutivos pertinentes para este proceso, de acuerdo con los estándares técnicos.',
            rap: '220501107-04',
            rapTitulo: '220501107-04 - Validar que los parámetros de certificación cumplan con estándares y normatividad vigente.',
            evidencias: [
              { id: 'GA8-220501107-AA1-EV01', tipo: 'producto', descripcion: 'Lista de verificación para validar parámetros de calidad, velocidad de transmisión, ancho de banda, uso de canales y frecuencias de transmisión.' },
            ],
          },
          {
            codigo: 'GA8-220601501-AA1',
            titulo: 'GA8-220601501-AA1 - Identificar estrategias de prevención y control del impacto ambiental de los accidentes y enfermedades laborales, de acuerdo con las políticas organizacionales y el entorno social.',
            rap: '220601501-01',
            rapTitulo: '220601501-01 - Analizar las estrategias para la prevención y control de los impactos ambientales y de los accidentes y enfermedades laborales (ATEL) de acuerdo con las políticas organizacionales y el entorno social.',
            evidencias: [
              { id: 'GA8-220601501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Análisis de caso de situaciones que se presentan en el contexto ambiental y del SST.' },
            ],
          },
          {
            codigo: 'GA8-220601501-AA2',
            titulo: 'GA8-220601501-AA2 - Reconocer el desarrollo de las acciones de control de los impactos ambientales, disminución de accidentes y enfermedades laborales, de acuerdo con los planes y programas establecidos por la organización.',
            rap: '220601501-02',
            rapTitulo: '220601501-02 - Implementar estrategias para el control de los impactos ambientales y de los accidentes y enfermedades, de acuerdo con los planes y programas establecidos por la organización.',
            evidencias: [
              { id: 'GA8-220601501-AA2-EV01', tipo: 'producto', descripcion: 'Diagrama de Ishikawa o Espina de pescado, sobre las estrategias para la prevención y control de los impactos ambientales, accidentes y enfermedades laborales (ATEL).' },
            ],
          },
          {
            codigo: 'GA8-220601501-AA3',
            titulo: 'GA8-220601501-AA3 - Plantear acciones que orienten al equipo de trabajo en los planes o programas ambientales y de SST, de acuerdo con el área de desempeño.',
            rap: '220601501-03',
            rapTitulo: '220601501-03 - Realizar seguimiento y acompañamiento al desarrollo de los planes y programas ambientales y SST, según el área de desempeño.',
            evidencias: [
              { id: 'GA8-220601501-AA3-EV01', tipo: 'conocimiento', descripcion: 'Mapa mental respecto a los planes y acciones establecidos en medio ambiente y SST.' },
            ],
          },
          {
            codigo: 'GA8-220601501-AA4',
            titulo: 'GA8-220601501-AA4 - Plantear propuestas que favorezcan la cultura ambiental responsable, el desarrollo sustentable y el autocuidado, de acuerdo con el contexto productivo y social.',
            rap: '220601501-04',
            rapTitulo: '220601501-04 - Proponer acciones de mejora para el manejo ambiental y el control de la SST, de acuerdo con estrategias de trabajo, colaborativo, cooperativo y coordinado en el contexto productivo y social.',
            evidencias: [
              { id: 'GA8-220601501-AA4-EV01', tipo: 'producto', descripcion: 'Video expositivo sobre oportunidades de mejora en medio ambiente y SST.' },
            ],
          },
          {
            codigo: 'GA9-220501106-AA1',
            titulo: 'GA9-220501106-AA1 - Validar servicios implementados, teniendo definidas las necesidades, utilizando diferentes herramientas de testeo y criterios de evaluación.',
            rap: '220501106-03',
            rapTitulo: '220501106-03 - Verificar el funcionamiento de dispositivos de cómputo y servicios de red de acuerdo a políticas de la organización.',
            evidencias: [
              { id: 'GA9-220501106-AA1-EV01', tipo: 'producto', descripcion: 'Informe sobre detección de fallos en el rendimiento y operación de la solución.' },
            ],
          },
          {
            codigo: 'GA9-220501106-AA2',
            titulo: 'GA9-220501106-AA2 - Declarar e implementar políticas que ofrezcan alta disponibilidad y de acceso a los diferentes servicios existentes en la red, de acuerdo con protocolos técnicos.',
            rap: '220501106-04',
            rapTitulo: '220501106-04 - Gestionar los dispositivos de cómputo y servicios de red para garantizar el funcionamiento de la plataforma tecnológica.',
            evidencias: [
              { id: 'GA9-220501106-AA2-EV01', tipo: 'producto', descripcion: 'Bitácora de eventos de infraestructura y plataformas.' },
              { id: 'GA9-220501106-AA2-EV02', tipo: 'producto', descripcion: 'Informe de actualización de componentes de hardware y software de los equipos de cómputo.' },
            ],
          },
          {
            codigo: 'GA10-220501091-AA1',
            titulo: 'GA10-220501091-AA1 - Comprobar el funcionamiento del sistema de telefonía y datos implementados en la estructura de red, mediante el uso de herramientas adecuadas.',
            rap: '220501091-03',
            rapTitulo: '220501091-03 - Verificar el funcionamiento de los equipos y software de comunicación de voz sobre IP (VoIP), para validar el cumplimiento de los requerimientos establecidos en el diseño.',
            evidencias: [
              { id: 'GA10-220501091-AA1-EV01', tipo: 'producto', descripcion: 'Lista de chequeo para verificación de pruebas de funcionamiento de infraestructura de voz y datos.' },
            ],
          },
          {
            codigo: 'GA10-220501091-AA2',
            titulo: 'GA10-220501091-AA2 - Gestionar la solución de comunicaciones unificadas, estableciendo políticas que mantengan disponibles cada uno de los servicios implementados, documentando el desarrollo de procesos, evidencias de errores y su respectiva solución.',
            rap: '220501091-04',
            rapTitulo: '220501091-04 - Gestionar los equipos y software de comunicación de voz sobre IP (VoIP), para garantizar su funcionamiento acorde con los parámetros establecidos en el diseño.',
            evidencias: [
              { id: 'GA10-220501091-AA2-EV01', tipo: 'producto', descripcion: 'Bitácora de actividades y eventos del sistema de tecnología de VoIP.' },
            ],
          },
          {
            codigo: 'GA10-240201529-AA1',
            titulo: 'GA10-240201529-AA1 - Identificar los componentes del comportamiento emprendedor, conforme a las características emprendedoras, objetivos personales y análisis del entorno.',
            rap: '240201529-01',
            rapTitulo: '240201529-01 - Integrar elementos de la cultura emprendedora teniendo en cuenta el perfil personal y el contexto de desarrollo social.',
            evidencias: [
              { id: 'GA10-240201529-AA1-EV01', tipo: 'conocimiento', descripcion: 'Conociendo mi visión.' },
            ],
          },
          {
            codigo: 'GA10-240201529-AA2',
            titulo: 'GA10-240201529-AA2 - Aplicar herramientas para la toma de decisiones, teniendo en cuenta los problemas planteados.',
            rap: '240201529-02',
            rapTitulo: '240201529-02 - Caracterizar la idea de negocio teniendo en cuenta las oportunidades y necesidades del sector productivo y social.',
            evidencias: [
              { id: 'GA10-240201529-AA2-EV01', tipo: 'desempeño', descripcion: 'Taller identificación del problema.' },
            ],
          },
          {
            codigo: 'GA10-240201529-AA3',
            titulo: 'GA10-240201529-AA3 - Experimentar la capacidad creativa e innovadora, teniendo en cuenta la solución de retos e identificación de oportunidades.',
            rap: '240201529-03',
            rapTitulo: '240201529-03 - Estructurar el plan de negocio de acuerdo con las características empresariales y tendencias de mercado.',
            evidencias: [
              { id: 'GA10-240201529-AA3-EV01', tipo: 'producto', descripcion: 'Prototipo de la solución.' },
              { id: 'GA10-240201529-AA3-EV02', tipo: 'desempeño', descripcion: 'Plan de acción.' },
            ],
          },
          {
            codigo: 'GA10-240201529-AA4',
            titulo: 'GA10-240201529-AA4 - Relacionar elementos del triángulo de la responsabilidad, acorde con la ejecución de técnicas de negociación.',
            rap: '240201529-04',
            rapTitulo: '240201529-04 - Valorar la propuesta de negocio conforme con su estructura y necesidades del sector productivo y social.',
            evidencias: [
              { id: 'GA10-240201529-AA4-EV01', tipo: 'producto', descripcion: 'Taller de negociación y modelo de negocio básico.' },
            ],
          },
          {
            codigo: 'GA11-220501014-AA1',
            titulo: 'GA11-220501014-AA1 - Validar el estado de la implementación del sistema de gestión de la seguridad de la información, ajustando y documentando los procesos realizados.',
            rap: '220501014-03',
            rapTitulo: '220501014-03 - Verificar eventos en la infraestructura de red, mediante herramientas y técnicas de análisis de datos que permitan determinar incidentes de seguridad.',
            evidencias: [
              { id: 'GA11-220501014-AA1-EV01', tipo: 'producto', descripcion: 'Informe de análisis de alertas y mensajes emitidos por los sistemas de detección de intrusos.' },
              { id: 'GA11-220501014-AA1-EV02', tipo: 'producto', descripcion: 'Lista de chequeo para supervisar la infraestructura y los servicios de red de una organización.' },
            ],
          },
          {
            codigo: 'GA11-220501014-AA2',
            titulo: 'GA11-220501014-AA2 - Gestionar los dispositivos y procesos de la red establecidos en el sistema de gestión de seguridad de la información, según el plan de seguridad.',
            rap: '220501014-04',
            rapTitulo: '220501014-04 - Gestionar el estado de la seguridad en la red de datos de la organización y su pertinencia según el plan de seguridad.',
            evidencias: [
              { id: 'GA11-220501014-AA2-EV01', tipo: 'producto', descripcion: 'Informe de hallazgos del análisis de vulnerabilidades y amenazas.' },
              { id: 'GA11-220501014-AA2-EV02', tipo: 'producto', descripcion: 'Informe de monitoreo del estado de la red.' },
            ],
          },
          {
            codigo: 'GA11-210201501-AA1',
            titulo: 'GA11-210201501-AA1 - Comparar las condiciones del trabajo en el devenir histórico, de acuerdo con los derechos fundamentales.',
            rap: '210201501-01',
            rapTitulo: '210201501-01 - Reconocer el trabajo como factor de movilidad social y transformación vital con referencia a la fenomenología y a los derechos fundamentales en el trabajo.',
            evidencias: [
              { id: 'GA11-210201501-AA1-EV01', tipo: 'conocimiento', descripcion: 'Taller.' },
              { id: 'GA11-210201501-AA1-EV02', tipo: 'desempeño', descripcion: 'Foro sobre características del trabajo en contexto local.' },
            ],
          },
          {
            codigo: 'GA11-210201501-AA2',
            titulo: 'GA11-210201501-AA2 - Reconocer los derechos humanos laborales, con base en el estudio de los derechos humanos y fundamentales en el trabajo.',
            rap: '210201501-02',
            rapTitulo: '210201501-02 - Valorar la importancia de la ciudadanía laboral con base en el estudio de los derechos humanos y fundamentales en el trabajo.',
            evidencias: [
              { id: 'GA11-210201501-AA2-EV01', tipo: 'producto', descripcion: 'Informe sobre trabajo decente, ciudadanía laboral, derechos individuales y colectivos en el trabajo.' },
              { id: 'GA11-210201501-AA2-EV02', tipo: 'desempeño', descripcion: 'Foro sobre el convenio colectivo del trabajo y la libertad sindical.' },
              { id: 'GA11-210201501-AA2-EV03', tipo: 'conocimiento', descripcion: 'Gráfico sobre la negociación colectiva.' },
              { id: 'GA11-210201501-AA2-EV04', tipo: 'conocimiento', descripcion: 'Infografía sobre la huelga.' },
            ],
          },
          {
            codigo: 'GA11-210201501-AA3',
            titulo: 'GA11-210201501-AA3 - Establecer la importancia de los derechos de los pueblos, de la solidaridad y la paz, de acuerdo con los indicadores de desarrollo humano.',
            rap: '210201501-03',
            rapTitulo: '210201501-03 - Practicar los derechos fundamentales en el trabajo de acuerdo con la Constitución Política y los Convenios Internacionales.',
            evidencias: [
              { id: 'GA11-210201501-AA3-EV01', tipo: 'conocimiento', descripcion: 'Mapa mental violación de derechos del trabajo.' },
              { id: 'GA11-210201501-AA3-EV02', tipo: 'desempeño', descripcion: 'Foro estudio de caso.' },
              { id: 'GA11-210201501-AA3-EV03', tipo: 'conocimiento', descripcion: 'Cuadro comparativo sobre el derecho de petición y la acción de tutela.' },
              { id: 'GA11-210201501-AA3-EV04', tipo: 'producto', descripcion: 'Texto argumentativo.' },
            ],
          },
          {
            codigo: 'GA11-210201501-AA4',
            titulo: 'GA11-210201501-AA4 - Comprender la importancia de las acciones e instituciones encargadas de la protección de los derechos del trabajo, los pueblos y la naturaleza, según el contexto territorial específico.',
            rap: '210201501-04',
            rapTitulo: '210201501-04 - Participar en acciones solidarias teniendo en cuenta el ejercicio de los derechos humanos, de los pueblos y de la naturaleza.',
            evidencias: [
              { id: 'GA11-210201501-AA4-EV01', tipo: 'desempeño', descripcion: 'Foro Estado social de derecho.' },
              { id: 'GA11-210201501-AA4-EV02', tipo: 'producto', descripcion: 'Presentación.' },
            ],
          },
          {
            codigo: 'GA12-220501105-AA1',
            titulo: 'GA12-220501105-AA1 - Administrar la plataforma de monitoreo, establecer políticas que den respuesta a la solución de incidentes y documentar el resultado de los procesos, de acuerdo con las políticas de la organización.',
            rap: '220501105-03 / 220501105-04',
            rapTitulo: '220501105-03/04 - Monitorear el funcionamiento de la infraestructura tecnológica / Gestionar los recursos tecnológicos, utilizando herramientas de administración y monitoreo.',
            evidencias: [
              { id: 'GA12-220501105-AA1-EV01', tipo: 'producto', descripcion: 'Lista de verificación del alistamiento y configuración de la plataforma de gestión y monitoreo.' },
            ],
          },
          {
            codigo: 'GA12-240201526-AA1',
            titulo: 'GA12-240201526-AA1 - Diseñar su proyecto de vida, de acuerdo con el reconocimiento de principios y valores éticos.',
            rap: '240201526-01',
            rapTitulo: '240201526-01 - Promover mi dignidad y la del otro a partir de los principios y valores éticos como aporte en la instauración de una cultura de paz.',
            evidencias: [
              { id: 'GA12-240201526-AA1-EV01', tipo: 'producto', descripcion: 'Presentación del proyecto de vida.' },
            ],
          },
          {
            codigo: 'GA12-240201526-AA2',
            titulo: 'GA12-240201526-AA2 - Reconocer los conceptos sobre la vida en comunidad, teniendo como base las relaciones con el contexto social y el sector productivo de su programa.',
            rap: '240201526-02',
            rapTitulo: '240201526-02 - Establecer relaciones de crecimiento personal y comunitario a partir del bien común como aporte para el desarrollo social.',
            evidencias: [
              { id: 'GA12-240201526-AA2-EV01', tipo: 'desempeño', descripcion: 'Diagrama de sistemas.' },
            ],
          },
          {
            codigo: 'GA12-240201526-AA3',
            titulo: 'GA12-240201526-AA3 - Proponer estrategias para promover el uso racional de los recursos, de acuerdo con criterios de sustentabilidad ética que contribuyan a una cultura de paz.',
            rap: '240201526-03',
            rapTitulo: '240201526-03 - Promover el uso racional de los recursos naturales a partir de criterios de sostenibilidad y sustentabilidad ética y normativa vigente.',
            evidencias: [
              { id: 'GA12-240201526-AA3-EV01', tipo: 'producto', descripcion: 'Estrategia para el uso racional de los recursos naturales.' },
            ],
          },
          {
            codigo: 'GA12-240201526-AA4',
            titulo: 'GA12-240201526-AA4 - Reflexionar alrededor de acuerdos de paz, teniendo en cuenta el contexto social y la dignidad humana.',
            rap: '240201526-04',
            rapTitulo: '240201526-04 - Contribuir con el fortalecimiento de la cultura de paz a partir de la dignidad humana y las estrategias para la transformación de conflictos.',
            evidencias: [
              { id: 'GA12-240201526-AA4-EV01', tipo: 'producto', descripcion: 'Solución del caso.' },
            ],
          },
        ],
      },
    ],
  },
];

// ─── BADGE COLORS ─────────────────────────────────────────────────────────────

const TIPO_BADGE: Record<TipoEvidencia, { bg: string; text: string; label: string }> = {
  conocimiento: { bg: '#dbeafe', text: '#1e40af', label: 'Conocimiento' },
  producto:     { bg: '#dcfce7', text: '#166534', label: 'Producto' },
  desempeño:    { bg: '#ffedd5', text: '#9a3412', label: 'Desempeño' },
  inducción:    { bg: '#fef9c3', text: '#854d0e', label: 'Inducción' },
};

// ─── AREA CLASSIFICATION (matching PlaneacionSemanalView colors) ──────────────

type AreaKey = 'Técnica' | 'TICs' | 'Bilingüismo' | 'Matemáticas' | 'Comunicación' | 'Investigación' | 'Ambiente' | 'Emprendimiento' | 'EducaciónFísica' | 'CienciasNaturales' | 'EEF';

const AREAS: Record<AreaKey, { label: string; color: string; bg: string; text: string }> = {
  Técnica:          { label: 'Técnica',                       color: '#f59e0b', bg: '#fefce8', text: '#92400e' },
  TICs:             { label: "TIC's",                         color: '#4CAF50', bg: '#f0fdf4', text: '#14532d' },
  Bilingüismo:      { label: 'Bilingüismo',                   color: '#F44336', bg: '#fff1f2', text: '#9f1239' },
  Matemáticas:      { label: 'Matemáticas',                   color: '#F48FB1', bg: '#fdf2f8', text: '#831843' },
  Comunicación:     { label: 'Comunicación / Ética / Derechos', color: '#9C27B0', bg: '#faf5ff', text: '#581c87' },
  Investigación:    { label: 'Investigación',                 color: '#FF9800', bg: '#fff7ed', text: '#7c2d12' },
  Ambiente:         { label: 'Ambiente',                      color: '#2196F3', bg: '#eff6ff', text: '#1e3a8a' },
  Emprendimiento:   { label: 'Emprendimiento',                color: '#009688', bg: '#f0fdfa', text: '#134e4a' },
  EducaciónFísica:  { label: 'Edu. Física',                   color: '#9E9E9E', bg: '#f9fafb', text: '#374151' },
  CienciasNaturales:{ label: 'Ciencias Naturales',            color: '#78909C', bg: '#f8fafc', text: '#334155' },
  EEF:              { label: 'EEF',                           color: '#8b5cf6', bg: '#f5f3ff', text: '#4c1d95' },
};

const COMPETENCY_TO_AREA: Record<string, AreaKey> = {
  // Técnica — redes, seguridad, infraestructura
  '220501014': 'Técnica',
  '220501104': 'Técnica',
  '220501107': 'Técnica',
  '220501091': 'Técnica',
  '220501105': 'Técnica',
  '220501106': 'Técnica',
  // TIC's
  '220501046': 'TICs',
  // Bilingüismo
  '240202501': 'Bilingüismo',
  // Matemáticas
  '240201528': 'Matemáticas',
  // Comunicación / Ética / Derechos
  '240201524': 'Comunicación',
  '210201501': 'Comunicación',
  '240201526': 'Comunicación',
  // Investigación
  '240201064': 'Investigación',
  // Ambiente / SST
  '220601501': 'Ambiente',
  // Emprendimiento
  '240201529': 'Emprendimiento',
  // Edu. Física
  '230101507': 'EducaciónFísica',
  // Ciencias Naturales
  '220201501': 'CienciasNaturales',
};

/** Returns area config: uses ev.area override if present, otherwise extracts from competency code in ID */
const getAreaForEv = (ev: Evidencia): typeof AREAS[AreaKey] | null => {
  if (ev.area) return AREAS[ev.area];
  const match = ev.id.match(/GA\d+-(\d+)-/);
  if (!match) return null;
  const code = match[1];
  const key: AreaKey = COMPETENCY_TO_AREA[code] ?? 'Técnica';
  return AREAS[key];
};

/** Legacy helper for places that only have the ID string */
const getArea = (evId: string): typeof AREAS[AreaKey] | null => {
  const match = evId.match(/GA\d+-(\d+)-/);
  if (!match) return null;
  const code = match[1];
  const key: AreaKey = COMPETENCY_TO_AREA[code] ?? 'Técnica';
  return AREAS[key];
};

// ─── STATS HELPERS ────────────────────────────────────────────────────────────

interface PhaseStats {
  total: number;
  configured: number;
  byArea: { area: typeof AREAS[AreaKey] | null; label: string; color: string; count: number }[];
  byTipo: { label: string; bg: string; text: string; count: number }[];
}

const GENERAL_TAB_IDX = FASES.length; // índice virtual del tab "General"

const computePhaseStats = (fase: FaseCronograma, entries: CronogramaGeneralEntry[]): PhaseStats => {
  const allEvs = fase.actividadesProyecto.flatMap(ap => ap.actividades.flatMap(aa => aa.evidencias));
  const total = allEvs.length;
  const configured = allEvs.filter(ev => {
    const e = entries.find(x => x.id === ev.id);
    return e && (e.fechaInicio || e.fechaFin || e.instructor);
  }).length;

  // By area
  const areaMap = new Map<string, { area: typeof AREAS[AreaKey] | null; label: string; color: string; count: number }>();
  allEvs.forEach(ev => {
    const area = getAreaForEv(ev);
    const key = area ? area.label : 'Sin clasificar';
    if (!areaMap.has(key)) {
      areaMap.set(key, { area, label: key, color: area ? area.color : '#9ca3af', count: 0 });
    }
    areaMap.get(key)!.count++;
  });
  const byArea = Array.from(areaMap.values()).sort((a, b) => b.count - a.count);

  // By tipo
  const tipoMap = new Map<string, { label: string; bg: string; text: string; count: number }>();
  allEvs.forEach(ev => {
    const key = ev.tipo ?? 'sin tipo';
    if (!tipoMap.has(key)) {
      const badge = ev.tipo ? TIPO_BADGE[ev.tipo] : { bg: '#f3f4f6', text: '#6b7280', label: 'Sin tipo' };
      tipoMap.set(key, { ...badge, count: 0 });
    }
    tipoMap.get(key)!.count++;
  });
  const byTipo = Array.from(tipoMap.values()).sort((a, b) => b.count - a.count);

  return { total, configured, byArea, byTipo };
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ─── DEBOUNCE HOOK ────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── SYNC: CronogramaGeneral → PlaneacionSemanal ──────────────────────────────

const PLANEACION_PHASE_MAP: Record<string, string> = {
  'Inducción':  'Fase Inducción',
  'Análisis':   'Fase 1: Análisis',
  'Planeación': 'Fase 2: Planeación',
  'Ejecución':  'Fase 3: Ejecución',
  'Evaluación': 'Fase 4: Evaluación',
};

/** ISO base date de PlaneacionSemanal (debe coincidir con BASE_DATE de esa vista) */
const PLANEACION_BASE_DATE_ISO = '2025-09-29';

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export const CronogramaGeneralView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate = useNavigate();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [activePhase, setActivePhase] = useState(0);
  const [expandedAPs, setExpandedAPs] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<CronogramaGeneralEntry[]>([]);
  const [syncResult, setSyncResult] = useState<{ phase: string; count: number } | null>(null);

  // Load data
  const loadData = useCallback(() => {
    const fichas = getFichas();
    const found = fichas.find(f => f.id === fichaId) ?? null;
    setFicha(found);

    const all: CronogramaGeneralData = getCronogramaGeneral();
    setEntries(all[fichaId ?? ''] ?? []);
  }, [fichaId]);

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, [loadData]);

  // Expand all APs of active phase by default when switching tabs
  useEffect(() => {
    if (activePhase >= FASES.length) return; // General tab — no APs to expand
    const fase = FASES[activePhase];
    const keys = new Set(fase.actividadesProyecto.map(ap => `${activePhase}::${ap.codigo}`));
    setExpandedAPs(keys);
  }, [activePhase]);

  // Persist helper (debounced)
  const persistDebounced = useDebounce((newEntries: CronogramaGeneralEntry[]) => {
    const all: CronogramaGeneralData = getCronogramaGeneral();
    all[fichaId ?? ''] = newEntries;
    saveCronogramaGeneral(all);
  }, 500);

  // ── Sync fechas → PlaneacionSemanal ──────────────────────────────────────
  const handleSyncPhase = useCallback((faseName: string) => {
    if (!fichaId || !ficha) return;

    const planeacionPhase = PLANEACION_PHASE_MAP[faseName];
    if (!planeacionPhase) return;

    // Leer cronograma fresco (incluye cambios pendientes de debounce)
    const cronEntries: CronogramaGeneralEntry[] = getCronogramaGeneral()[fichaId] ?? [];
    const gradeActivities = getGradeActivities().filter(
      a => a.group === ficha.code && a.phase === planeacionPhase
    );
    const allPlan = getPlaneacionSemanal();
    const planData = allPlan[fichaId] ?? {
      tecnicaAssignments: {}, transversalCells: {},
      cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {},
    };

    if (gradeActivities.length === 0) {
      alert(`No hay evidencias registradas en Calificaciones para ${faseName}.\nVisita primero la vista de Calificaciones para que se generen.`);
      return;
    }

    // Construir lista de ISO de inicio de cada semana (respeta weekDateOverrides)
    const overrides = planData.weekDateOverrides ?? {};
    const [by, bm, bd] = PLANEACION_BASE_DATE_ISO.split('-').map(Number);
    let cur = new Date(by, bm - 1, bd);
    const weekIsos: string[] = [];
    for (let w = 0; w < 106; w++) {
      if (overrides[w]) {
        const [oy, om, od] = (overrides[w] as string).split('-').map(Number);
        cur = new Date(oy, om - 1, od);
      }
      weekIsos.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      );
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    }

    const newAssignments = { ...planData.tecnicaAssignments };
    let count = 0;

    cronEntries.forEach(entry => {
      if (!entry.fechaInicio) return;

      // Buscar GradeActivity:
      // 1) exact: activity.id === 'seed-' + entry.id   (GA1-*, GA2-*, …)
      // 2) fallback inducción: entry.id es 'AAn-EVnn' → suffix match dentro de la fase
      const isInduccionShortId = /^AA\d+-EV\d+$/.test(entry.id);
      const activity =
        gradeActivities.find(a => a.id === `seed-${entry.id}`) ??
        (isInduccionShortId ? gradeActivities.find(a => a.id.endsWith(entry.id)) : undefined);

      if (!activity) return;
      if (newAssignments[activity.id] !== undefined) return; // no sobreescribir asignaciones manuales

      // Encontrar semana que contiene fechaInicio
      const weekIdx = weekIsos.findIndex(iso => {
        const [y, m, d] = iso.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const end = new Date(y, m - 1, d);
        end.setDate(end.getDate() + 6);
        const [ty, tm, td] = entry.fechaInicio.split('-').map(Number);
        const target = new Date(ty, tm - 1, td);
        return target >= start && target <= end;
      });

      if (weekIdx >= 0) {
        newAssignments[activity.id] = weekIdx;
        count++;
      }
    });

    if (count > 0) {
      allPlan[fichaId] = { ...planData, tecnicaAssignments: newAssignments };
      savePlaneacionSemanal(allPlan);
    }

    setSyncResult({ phase: faseName, count });
    setTimeout(() => setSyncResult(null), 4000);
  }, [fichaId, ficha]);

  const getEntry = (evId: string): CronogramaGeneralEntry =>
    entries.find(e => e.id === evId) ?? { id: evId, fechaInicio: '', fechaFin: '', instructor: '' };

  const updateEntry = (evId: string, field: keyof Omit<CronogramaGeneralEntry, 'id'>, value: string) => {
    setEntries(prev => {
      const existing = prev.find(e => e.id === evId);
      let updated: CronogramaGeneralEntry[];
      if (existing) {
        updated = prev.map(e => e.id === evId ? { ...e, [field]: value } : e);
      } else {
        updated = [...prev, { id: evId, fechaInicio: '', fechaFin: '', instructor: '', [field]: value }];
      }
      persistDebounced(updated);
      return updated;
    });
  };

  const toggleAP = (key: string) => {
    setExpandedAPs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fase = activePhase < FASES.length ? FASES[activePhase] : null;

  // Global progress
  const totalEvidencias = FASES.reduce((sum, f) =>
    sum + f.actividadesProyecto.reduce((s, ap) =>
      s + ap.actividades.reduce((ss, aa) => ss + aa.evidencias.length, 0), 0), 0);
  const filledEntries = entries.filter(e => e.fechaInicio || e.fechaFin || e.instructor).length;

  // Stats for active phase
  const phaseStats = useMemo(
    () => fase ? computePhaseStats(fase, entries) : null,
    [fase, entries]
  );

  // Stats for all phases (used in General tab)
  const allPhaseStats = useMemo(
    () => FASES.map(f => ({ fase: f, stats: computePhaseStats(f, entries) })),
    [entries]
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 20px', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button
          onClick={() => navigate('/instructor/fichas')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#374151', fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Volver a Fichas
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
              Cronograma General
            </h1>
            {ficha && (
              <span style={{ fontSize: 14, color: '#6b7280' }}>
                Ficha {ficha.code} — {ficha.program}
              </span>
            )}
          </div>
          {ficha?.cronogramaProgramName && (
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>{ficha.cronogramaProgramName}</p>
          )}
        </div>
        {/* Progress chip */}
        <div style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          {filledEntries} / {totalEvidencias} evidencias configuradas
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FASES.map((f, idx) => (
          <button
            key={f.nombre}
            onClick={() => setActivePhase(idx)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              background: activePhase === idx ? f.color : '#f3f4f6',
              color: activePhase === idx ? f.textColor : '#374151',
              boxShadow: activePhase === idx ? `0 2px 8px ${f.color}55` : 'none',
              transition: 'all 0.15s',
            }}
          >
            {f.nombre}
          </button>
        ))}
        {/* General tab */}
        <button
          onClick={() => setActivePhase(GENERAL_TAB_IDX)}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: activePhase === GENERAL_TAB_IDX ? 'none' : '1px dashed #d1d5db',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
            background: activePhase === GENERAL_TAB_IDX ? '#1f2937' : '#f9fafb',
            color: activePhase === GENERAL_TAB_IDX ? '#ffffff' : '#6b7280',
            boxShadow: activePhase === GENERAL_TAB_IDX ? '0 2px 8px #1f293755' : 'none',
            transition: 'all 0.15s',
          }}
        >
          Resumen General
        </button>
      </div>

      {/* Phase stats bar */}
      {phaseStats && fase && (
        <div style={{
          background: `${fase.color}0d`,
          border: `1px solid ${fase.color}33`,
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {/* Total + configured */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: fase.color }}>
              {phaseStats.total} evidencias
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>·</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {phaseStats.configured} configuradas
            </span>
            {phaseStats.total > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: phaseStats.configured === phaseStats.total ? '#dcfce7' : '#f3f4f6',
                color: phaseStats.configured === phaseStats.total ? '#166534' : '#6b7280',
                padding: '1px 7px', borderRadius: 20,
              }}>
                {Math.round(phaseStats.configured / phaseStats.total * 100)}%
              </span>
            )}
          </div>
          <div style={{ width: 1, height: 20, background: `${fase.color}44`, flexShrink: 0 }} />
          {/* By tipo */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Tipo:</span>
            {phaseStats.byTipo.map(t => (
              <span key={t.label} style={{
                fontSize: 11, fontWeight: 700,
                background: t.bg, color: t.text,
                padding: '2px 8px', borderRadius: 4,
              }}>
                {t.label}: {t.count}
              </span>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: `${fase.color}44`, flexShrink: 0 }} />
          {/* By area */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Área:</span>
            {phaseStats.byArea.map(a => (
              <span key={a.label} style={{
                fontSize: 11, fontWeight: 700,
                background: a.color,
                color: '#ffffff',
                padding: '2px 8px', borderRadius: 4,
              }}>
                {a.label}: {a.count}
              </span>
            ))}
          </div>

          {/* Botón sincronizar con Planeación Semanal */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {syncResult?.phase === fase.nombre && (
              <span style={{
                fontSize: 12,
                color: syncResult.count > 0 ? '#16a34a' : '#6b7280',
                fontWeight: 600,
              }}>
                {syncResult.count > 0
                  ? `✓ ${syncResult.count} evidencia${syncResult.count !== 1 ? 's' : ''} sincronizada${syncResult.count !== 1 ? 's' : ''}`
                  : 'Sin cambios (ya asignadas o sin fecha)'}
              </span>
            )}
            <button
              onClick={() => handleSyncPhase(fase.nombre)}
              title="Aplica las fechaInicio del Cronograma a la Planeación Semanal (solo evidencias sin semana asignada)"
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: `1.5px solid ${fase.color}`,
                background: 'white',
                color: fase.color,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              ↔ Sincronizar con Planeación
            </button>
          </div>
        </div>
      )}

      {/* ── GENERAL (consolidated) VIEW ─────────────────────────────────────── */}
      {activePhase === GENERAL_TAB_IDX && (
        <div>
          {/* Grand total card */}
          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 20,
            color: 'white',
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>TOTAL GENERAL</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{totalEvidencias}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>evidencias en el programa</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>CONFIGURADAS</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{filledEntries}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {totalEvidencias > 0 ? Math.round(filledEntries / totalEvidencias * 100) : 0}% completado
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>PENDIENTES</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{totalEvidencias - filledEntries}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>por configurar</div>
            </div>
            {/* Progress bar */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${totalEvidencias > 0 ? filledEntries / totalEvidencias * 100 : 0}%`,
                  background: '#4ade80',
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Progreso global</div>
            </div>
          </div>

          {/* Per-phase cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
            {allPhaseStats.map(({ fase: f, stats }) => (
              <div key={f.nombre} style={{
                border: `1px solid ${f.color}44`,
                borderTop: `4px solid ${f.color}`,
                borderRadius: 10,
                padding: '16px',
                background: 'white',
              }}>
                {/* Phase header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{
                    fontWeight: 700, fontSize: 15, color: f.color,
                  }}>
                    {f.nombre}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                      {stats.configured}/{stats.total}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: stats.configured === stats.total && stats.total > 0 ? '#dcfce7' : stats.configured > 0 ? '#fef9c3' : '#f3f4f6',
                      color: stats.configured === stats.total && stats.total > 0 ? '#166534' : stats.configured > 0 ? '#854d0e' : '#6b7280',
                    }}>
                      {stats.total > 0 ? Math.round(stats.configured / stats.total * 100) : 0}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    height: '100%',
                    width: `${stats.total > 0 ? stats.configured / stats.total * 100 : 0}%`,
                    background: f.color,
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
                {/* By tipo */}
                {stats.byTipo.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' }}>Por tipo</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stats.byTipo.map(t => (
                        <span key={t.label} style={{
                          fontSize: 11, fontWeight: 600,
                          background: t.bg, color: t.text,
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          {t.label}: {t.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* By area */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' }}>Por área</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {stats.byArea.map(a => (
                      <span key={a.label} style={{
                        fontSize: 11, fontWeight: 600,
                        background: a.color + '22',
                        color: a.color === '#9ca3af' ? '#6b7280' : a.color,
                        border: `1px solid ${a.color}55`,
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {a.label}: {a.count}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Navigate button */}
                <button
                  onClick={() => setActivePhase(FASES.indexOf(f))}
                  style={{
                    marginTop: 12, width: '100%',
                    padding: '6px', borderRadius: 6,
                    border: `1px solid ${f.color}44`,
                    background: `${f.color}0d`,
                    color: f.color, fontWeight: 600, fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Ver {f.nombre} →
                </button>
              </div>
            ))}
          </div>

          {/* Area consolidado global */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
              Desglose por área — todas las fases
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {(() => {
                const globalAreaMap = new Map<string, { color: string; total: number; configured: number }>();
                FASES.forEach(f => {
                  f.actividadesProyecto.forEach(ap => ap.actividades.forEach(aa => aa.evidencias.forEach(ev => {
                    const area = getAreaForEv(ev);
                    const key = area ? area.label : 'Sin clasificar';
                    const color = area ? area.color : '#9ca3af';
                    if (!globalAreaMap.has(key)) globalAreaMap.set(key, { color, total: 0, configured: 0 });
                    globalAreaMap.get(key)!.total++;
                    const entry = entries.find(e => e.id === ev.id);
                    if (entry && (entry.fechaInicio || entry.fechaFin || entry.instructor)) {
                      globalAreaMap.get(key)!.configured++;
                    }
                  })));
                });
                return Array.from(globalAreaMap.entries())
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([label, { color, total, configured }]) => (
                    <div key={label} style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${color}44`,
                      borderLeft: `4px solid ${color}`,
                      background: color + '0d',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2937' }}>{total}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{configured} configuradas · {total > 0 ? Math.round(configured / total * 100) : 0}%</div>
                      <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${total > 0 ? configured / total * 100 : 0}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Phase content */}
      {activePhase < FASES.length && (
      <div>
        {fase.actividadesProyecto.map((ap) => {
          const apKey = `${activePhase}::${ap.codigo}`;
          const isExpanded = expandedAPs.has(apKey);

          return (
            <div
              key={ap.codigo}
              style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: `1px solid ${fase.color}33` }}
            >
              {/* AP Header (accordion toggle) */}
              <button
                onClick={() => toggleAP(apKey)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  background: `${fase.color}18`,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: isExpanded ? `1px solid ${fase.color}33` : 'none',
                }}
              >
                <span style={{ color: fase.color, flexShrink: 0 }}>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>
                  {ap.titulo}
                </span>
              </button>

              {/* AP Body */}
              {isExpanded && (
                <div style={{ background: 'white' }}>
                  {ap.actividades.map((aa, aaIdx) => (
                    <div
                      key={aa.codigo}
                      style={{
                        padding: '16px 20px',
                        borderBottom: aaIdx < ap.actividades.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      {/* AA header */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                          {aa.titulo}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: fase.color,
                            background: `${fase.color}18`,
                            padding: '2px 8px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                            marginTop: 1,
                          }}>
                            RAP {aa.rap}
                          </span>
                          <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{aa.rapTitulo}</span>
                        </div>
                      </div>

                      {/* Evidence cards */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12 }}>
                        {aa.evidencias.map((ev) => {
                          const entry = getEntry(ev.id);
                          const badge = ev.tipo ? TIPO_BADGE[ev.tipo] : null;
                          const area = getAreaForEv(ev);
                          return (
                            <div
                              key={ev.id}
                              style={{
                                background: area ? area.bg : '#fafafa',
                                border: area ? `1px solid ${area.color}44` : '1px solid #e5e7eb',
                                borderLeft: area ? `4px solid ${area.color}` : '4px solid #d1d5db',
                                borderRadius: 8,
                                padding: '12px 14px',
                              }}
                            >
                              {/* Evidence header */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                {/* Area badge — solo si aplica */}
                                {area && (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: area.color,
                                    color: '#ffffff',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    marginTop: 1,
                                  }}>
                                    {area.label}
                                  </span>
                                )}
                                {/* Tipo badge — solo si aplica */}
                                {badge && (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: badge.bg,
                                    color: badge.text,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    marginTop: 1,
                                    textTransform: 'uppercase',
                                  }}>
                                    {badge.label}
                                  </span>
                                )}
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginRight: 6 }}>{ev.id}.</span>
                                  <span style={{ fontSize: 13, color: '#374151' }}>{ev.descripcion}</span>
                                </div>
                              </div>

                              {/* Editable fields */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, alignItems: 'end' }}>
                                {/* Fecha Inicio */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <Calendar size={11} /> Fecha inicio
                                  </label>
                                  <input
                                    type="date"
                                    value={entry.fechaInicio}
                                    onChange={e => updateEntry(ev.id, 'fechaInicio', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: entry.fechaInicio ? '#1f2937' : '#9ca3af',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                  {entry.fechaInicio && (
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmt(entry.fechaInicio)}</div>
                                  )}
                                </div>

                                {/* Fecha Fin */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <Calendar size={11} /> Fecha fin
                                  </label>
                                  <input
                                    type="date"
                                    value={entry.fechaFin}
                                    onChange={e => updateEntry(ev.id, 'fechaFin', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: entry.fechaFin ? '#1f2937' : '#9ca3af',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                  {entry.fechaFin && (
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmt(entry.fechaFin)}</div>
                                  )}
                                </div>

                                {/* Instructor */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <User size={11} /> Instructor o área responsable
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.instructor}
                                    onChange={e => updateEntry(ev.id, 'instructor', e.target.value)}
                                    placeholder="Nombre del instructor o área"
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: '#1f2937',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
