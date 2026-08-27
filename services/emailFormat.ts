/**
 * Utilidades de formato para el cuerpo de los correos (Alertas y Correos).
 * Compartidas entre la generación desde novedades y la generación desde Excel.
 */

/** Escapa HTML para insertar valores en el cuerpo del correo sin romper etiquetas. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convierte HTML a texto plano (para portapapeles text/plain). */
export function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? '').trim();
}

/** Tipografías disponibles para el cuerpo del correo (seguras en Gmail/Outlook). */
export const EMAIL_FONTS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Candara, Segoe UI, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Georgia', value: 'Georgia, Times New Roman, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { label: 'Courier New', value: 'Courier New, Courier, monospace' },
];

export const EMAIL_FONT_SIZES = [11, 12, 13, 14, 15, 16, 18];

export const DEFAULT_EMAIL_FONT = EMAIL_FONTS[0].value;
export const DEFAULT_EMAIL_FONT_SIZE = 14;

export interface EmailFont {
  family?: string;
  size?: number;
}

/** Sólo se aceptan valores de la lista: evita inyectar CSS arbitrario en el atributo style. */
function safeFont(font?: EmailFont): { family: string; size: number } {
  const family = EMAIL_FONTS.some((f) => f.value === font?.family)
    ? (font?.family as string)
    : DEFAULT_EMAIL_FONT;
  const size =
    typeof font?.size === 'number' && EMAIL_FONT_SIZES.includes(font.size)
      ? font.size
      : DEFAULT_EMAIL_FONT_SIZE;
  return { family, size };
}

/** Estilos CSS del cuerpo, para el correo y para la vista previa en pantalla. */
export function emailBaseStyle(font?: EmailFont): string {
  const { family, size } = safeFont(font);
  return `font-family:${family};font-size:${size}px;line-height:1.7;color:#222222;`;
}

/** Inyecta estilos inline para que el HTML pegado en Gmail/Outlook conserve formato y ocupe el ancho completo. */
export function buildEmailHtml(body: string, font?: EmailFont): string {
  const BASE = emailBaseStyle(font);
  const styled = body
    .replace(/<p(?=[^>]*>)/gi, `<p style="margin:0.5em 0;${BASE}"`)
    .replace(/<ul(?=[^>]*>)/gi, '<ul style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<ol(?=[^>]*>)/gi, '<ol style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<li(?=[^>]*>)/gi, `<li style="margin:0.2em 0;${BASE}"`)
    .replace(/<blockquote(?=[^>]*>)/gi, '<blockquote style="border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#555555;"');
  // Usar <table> de ancho 100% para que Outlook respete el ancho completo del área de composición
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="${BASE}word-wrap:break-word;">${styled}</td></tr></table>`;
}

/** Marcas de formato que entiende el editor de plantillas. */
export const FORMAT_MARKERS = {
  bold: '**',
  italic: '_',
  underline: '__',
  strike: '~~',
} as const;

/**
 * Formato en línea para las plantillas escritas en texto plano.
 * Se aplica sobre texto YA escapado: **negrita**, __subrayado__, _cursiva_, ~~tachado~~.
 */
export function applyInlineMarkdown(escaped: string): string {
  return (
    escaped
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<u>$1</u>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
      // La cursiva con un solo marcador exige un separador delante para no romper
      // códigos de evidencia del tipo GA1_220501046 ni las listas con viñeta.
      .replace(/(^|[\s;(\[¡¿])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s;(\[¡¿])_([^_\n]+)_/g, '$1<em>$2</em>')
  );
}

/**
 * Convierte el cuerpo de la plantilla (texto plano ya escapado) en HTML:
 * listas con viñetas para las líneas que empiezan por «- » y <br> para el resto.
 */
export function renderTemplateBody(escaped: string): string {
  const blocks: { type: 'line' | 'block'; html: string }[] = [];
  let items: string[] = [];

  const flushList = () => {
    if (items.length === 0) return;
    blocks.push({ type: 'block', html: `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` });
    items = [];
  };

  escaped.split(/\r?\n/).forEach((line) => {
    // «* » no se toma como viñeta para no chocar con **negrita** al inicio de línea.
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      items.push(applyInlineMarkdown(bullet[1]));
      return;
    }
    flushList();
    blocks.push({ type: 'line', html: applyInlineMarkdown(line) });
  });
  flushList();

  return blocks
    .map((b, i) => (i > 0 && b.type === 'line' && blocks[i - 1].type === 'line' ? `<br>${b.html}` : b.html))
    .join('');
}
