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

/** Inyecta estilos inline para que el HTML pegado en Gmail/Outlook conserve formato y ocupe el ancho completo. */
export function buildEmailHtml(body: string): string {
  const BASE = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#222222;';
  const styled = body
    .replace(/<p(?=[^>]*>)/gi, `<p style="margin:0.5em 0;${BASE}"`)
    .replace(/<ul(?=[^>]*>)/gi, '<ul style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<ol(?=[^>]*>)/gi, '<ol style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<li(?=[^>]*>)/gi, `<li style="margin:0.2em 0;${BASE}"`)
    .replace(/<blockquote(?=[^>]*>)/gi, '<blockquote style="border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#555555;"');
  // Usar <table> de ancho 100% para que Outlook respete el ancho completo del área de composición
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="${BASE}word-wrap:break-word;">${styled}</td></tr></table>`;
}
