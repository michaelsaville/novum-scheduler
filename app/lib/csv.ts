/**
 * Tiny CSV writer. Quotes any cell containing `,`, `"`, `\r`, or `\n`,
 * escapes internal quotes by doubling. Coerces nullish to empty string,
 * dates to ISO. Caller decides headers + row order.
 *
 * Why hand-rolled: the report use case is single-file dump for the
 * operator's spreadsheet, not a streaming parser, and pulling in a
 * dep for ~30 lines isn't worth the package weight.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

function escapeCell(v: CsvCell): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else s = String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Build a CSV download Response with the right headers. */
export function csvResponse(filename: string, headers: string[], rows: CsvCell[][]): Response {
  const body = toCsv(headers, rows);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
