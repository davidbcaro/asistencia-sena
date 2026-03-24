import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Calendar, User } from 'lucide-react';
import { Ficha, CronogramaGeneralEntry, CronogramaGeneralData } from '../types';
import { getFichas, getCronogramaGeneral, saveCronogramaGeneral } from '../services/db';

// ─── STATIC CURRICULUM DATA ──────────────────────────────────────────────────

type TipoEvidencia = 'conocimiento' | 'producto' | 'desempeño';

interface Evidencia {
  id: string;
  tipo: TipoEvidencia;
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

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export const CronogramaGeneralView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate = useNavigate();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [activePhase, setActivePhase] = useState(0);
  const [expandedAPs, setExpandedAPs] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<CronogramaGeneralEntry[]>([]);

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

  const fase = FASES[activePhase];

  // Count filled entries for progress indicator
  const totalEvidencias = FASES.reduce((sum, f) =>
    sum + f.actividadesProyecto.reduce((s, ap) =>
      s + ap.actividades.reduce((ss, aa) => ss + aa.evidencias.length, 0), 0), 0);
  const filledEntries = entries.filter(e => e.fechaInicio || e.fechaFin || e.instructor).length;

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
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
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
      </div>

      {/* Phase content */}
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
                          const badge = TIPO_BADGE[ev.tipo];
                          return (
                            <div
                              key={ev.id}
                              style={{
                                background: '#fafafa',
                                border: '1px solid #e5e7eb',
                                borderRadius: 8,
                                padding: '12px 14px',
                              }}
                            >
                              {/* Evidence header */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
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
                                <div>
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
    </div>
  );
};
