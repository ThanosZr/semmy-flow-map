/**
 * PDF report of a plan, generated in the browser with jsPDF.
 * Loaded on demand (dynamic import), so the PDF library and the Greek font cost nothing until used.
 * Font: Commissioner (SIL Open Font License), embedded so Greek renders in any PDF viewer.
 */
import fontBoldUrl from '@expo-google-fonts/commissioner/700Bold/Commissioner_700Bold.ttf?url';
import fontRegularUrl from '@expo-google-fonts/commissioner/400Regular/Commissioner_400Regular.ttf?url';
import { COURSES, GUIDE_YEAR } from '../data/catalog';
import {
  DIPLOMA_ECTS, ECTS_SEMESTERS_1_5, ECTS_SOURCES, ECTS_THESIS, confidenceOf, ectsOf, ectsOrigin, fmtEcts, sumEcts,
} from '../data/ects';
import { DIR, ELEC_DRAWING, SHAPES, ruleLine, type CoreChoice } from '../data/rules';
import type { Combo } from '../domain/combos';
import { semesterLoad, type Allocation, type Check } from '../domain/plan';
import type { PrintColors, RGB } from '../ui/applyTheme';

export interface Snapshot { dataUrl: string; width: number; height: number }

export interface ReportInput {
  combo: Combo;
  alloc: Allocation;
  checks: Check[];
  core: CoreChoice;
  ects: Readonly<Record<string, number>>;
  /** ECTS bounds of the 23 specialisation courses for this combination */
  range: { min: number; max: number } | null;
  /** link that reopens this plan (null when the app is not on a public address) */
  link: string | null;
  /** theme colours (light variant) */
  colors: PrintColors;
  combosImage: Snapshot | null;
  coursesImage: Snapshot | null;
  /** background behind the globe images, so a dark-theme capture stays readable on paper */
  imageBackground: [number, number, number];
}

const WHITE: RGB = [255, 255, 255];

interface QRFactory { (type: 0, level: 'L' | 'M' | 'Q' | 'H'): { addData(s: string): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean } }

async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Row { id: string; sem: number; code: string; name: string; group: string; role: string; ects: string; sort: string }

function rowsOf(input: ReportInput): Row[] {
  const { combo: c, alloc: a, core, ects } = input;
  const rows: Row[] = [];
  const push = (id: string, group: string, role: string) => {
    const co = COURSES[id], e = ectsOf(id, ects);
    const mark = e !== null && ectsOrigin(id, ects) === 'builtin' && confidenceOf(id) === 'legacy' ? '~' : '';
    rows.push({ id, sem: co.sem, code: co.code, name: co.name, group, role, ects: e === null ? '—' : mark + fmtEcts(e), sort: `${co.sem}-${group}-${co.code}` });
  };
  for (const f of c.order) {
    const x = a.flows[f]!;
    const groupOf = new Map<string, string>();
    x.groups.forEach(g => g.of.forEach(id => groupOf.set(id, `${g.k} από ${g.of.length}`)));
    for (const id of x.counted) {
      const role = x.req.fixed.includes(id) ? 'Υποχρεωτικό' : groupOf.has(id) ? `Υποχρεωτικό (${groupOf.get(id)})` : 'Επιλογή ροής';
      push(id, `${c.flows[f] === 'H' ? '½' : ''}${f}`, role);
    }
  }
  a.free.slice(0, a.freeTarget).forEach(id => push(id, COURSES[id].cat, 'Ελεύθερο'));
  push(ELEC_DRAWING, 'Κ', 'Κορμός (υποχρεωτικό)');
  push(core, 'Κ', 'Κορμός (κατ’ επιλογήν)');
  return rows.sort((p, q) => p.sort.localeCompare(q.sort, 'el'));
}

export async function buildReport(input: ReportInput): Promise<Blob> {
  const [{ jsPDF }, { autoTable }, regular, bold, qrMod] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), fontBase64(fontRegularUrl), fontBase64(fontBoldUrl),
    input.link ? import('qrcode-generator') : Promise.resolve(null),
  ]);
  const { ink: INK, ink2: INK2, rule: RULE, ok: OK, bad: BAD, head: HEAD, alt: ALT } = input.colors;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Commissioner-Regular.ttf', regular);
  doc.addFont('Commissioner-Regular.ttf', 'Commissioner', 'normal');
  doc.addFileToVFS('Commissioner-Bold.ttf', bold);
  doc.addFont('Commissioner-Bold.ttf', 'Commissioner', 'bold');
  doc.setFont('Commissioner', 'normal');
  doc.setProperties({ title: `Πλάνο μαθημάτων · ${input.combo.label}`, subject: 'Χάρτης Ροών ΣΗΜΜΥ', creator: 'Χάρτης Ροών ΣΗΜΜΥ' });

  const { combo: c, alloc: a, checks } = input;
  const d = DIR[c.dir];
  const W = 210, M = 16;
  let y = M;

  // header
  doc.setFontSize(9); doc.setTextColor(...INK2);
  doc.text('ΧΑΡΤΗΣ ΡΟΩΝ ΣΗΜΜΥ · ΠΛΑΝΟ ΜΑΘΗΜΑΤΩΝ 6ου–9ου ΕΞΑΜΗΝΟΥ', M, y);
  doc.text(new Date().toLocaleDateString('el-GR'), W - M, y, { align: 'right' });
  y += 3; doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 9;

  doc.setFillColor(...(input.colors.dir[c.dir] ?? INK)); doc.circle(M + 2.2, y - 2.6, 2.2, 'F');
  doc.setFont('Commissioner', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(c.label, M + 7, y);
  const ok = checks.every(x => x.ok);
  doc.setFontSize(9); doc.setTextColor(...(ok ? OK : BAD));
  doc.text(ok ? 'ΕΓΚΥΡΟ ΠΛΑΝΟ' : `${checks.filter(x => !x.ok).length} ΕΚΚΡΕΜΟΤΗΤΕΣ`, W - M, y - 1, { align: 'right' });
  y += 6;
  doc.setFont('Commissioner', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK2);
  doc.text(`Κατεύθυνση ${d.long} · ${SHAPES[c.shape].name} + ${c.free} ${c.free === 1 ? 'ελεύθερο' : 'ελεύθερα'}`, M, y); y += 5;
  doc.text(doc.splitTextToSize(c.rules.map(r => `Κανόνας ${r}: ${ruleLine(c.dir, r, c.shape)}`).join('   '), W - 2 * M), M, y); y += 5;
  if (input.range) { doc.text(`ECTS των 23 μαθημάτων εμβάθυνσης για αυτόν τον συνδυασμό: ${input.range.min}–${input.range.max}, ανάλογα με τις επιλογές.`, M, y); y += 5; }
  y += 2;

  // globe images
  const imgs = [[input.combosImage, 'Σφαίρα συνδυασμών ροών'], [input.coursesImage, 'Σφαίρα μαθημάτων']] as const;
  const present = imgs.filter(([s]) => s);
  if (present.length) {
    const gap = 6, boxW = (W - 2 * M - gap * (present.length - 1)) / present.length, boxH = 72;
    present.forEach(([snap, caption], i) => {
      const x = M + i * (boxW + gap);
      doc.setFillColor(...input.imageBackground); doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
      doc.rect(x, y, boxW, boxH, 'FD');
      const s = snap!, k = Math.min((boxW - 4) / s.width, (boxH - 4) / s.height);
      const iw = s.width * k, ih = s.height * k;
      doc.addImage(s.dataUrl, s.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', x + (boxW - iw) / 2, y + (boxH - ih) / 2, iw, ih, undefined, 'FAST');
      doc.setFontSize(8); doc.setTextColor(...INK2); doc.text(caption, x, y + boxH + 4);
    });
    y += boxH + 10;
  }

  const base = { font: 'Commissioner', fontSize: 8.6, textColor: INK, lineColor: RULE, lineWidth: 0.1, cellPadding: 1.5 } as const;

  // checks
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    head: [['', 'Έλεγχος κανόνων (§7.5)']],
    body: checks.map(x => [x.ok ? 'OK' : 'ΛΕΙΠΕΙ', x.text]),
    styles: base, headStyles: { fontStyle: 'bold', textColor: INK, fontSize: 9 },
    columnStyles: { 0: { cellWidth: 16, fontStyle: 'bold' } },
    didParseCell: h => { if (h.section === 'body' && h.column.index === 0) h.cell.styles.textColor = h.cell.raw === 'OK' ? OK : BAD; },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;

  // courses
  const rows = rowsOf(input);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 18 }, theme: 'grid',
    head: [['Εξ.', 'Κωδικός', 'Μάθημα', 'Ροή', 'Ρόλος', 'ECTS']],
    body: rows.map(r => [`${r.sem}ο`, r.code, r.name, r.group, r.role, r.ects]),
    styles: base,
    headStyles: { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 21 }, 3: { cellWidth: 11, halign: 'center' }, 4: { cellWidth: 40 }, 5: { cellWidth: 12, halign: 'right' } },
    alternateRowStyles: { fillColor: ALT },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;

  // summary per semester and ECTS
  const load = semesterLoad(a, input.core);
  const ids = rows.map(r => r.id);
  const sum = sumEcts(ids, input.ects);
  const semIds = (s: number) => ids.filter(id => COURSES[id].sem === s);
  const withUnknown = (e: { total: number; unknown: number; known: number }) => (e.known ? fmtEcts(e.total) + (e.unknown ? ` (+${e.unknown} χωρίς τιμή)` : '') : '—');
  const semRow = (s: 6 | 7 | 8 | 9) => [`${s}ο εξάμηνο`, String(load.bySem[s]), withUnknown(sumEcts(semIds(s), input.ects))];
  const diploma = ECTS_SEMESTERS_1_5 + sum.total + ECTS_THESIS;
  const complete = a.total === 23;
  if (y + 52 > 297 - 18) { doc.addPage(); y = M; }
  const pagesBefore = doc.getNumberOfPages();
  // link + QR beside the summary table
  if (input.link && qrMod) {
    const factory = ((qrMod as unknown as { default?: QRFactory }).default ?? qrMod) as unknown as QRFactory;
    const qr = factory(0, 'M');
    qr.addData(input.link);
    qr.make();
    const n = qr.getModuleCount(), size = 34, cell = size / n, qx = W - M - size, qy = y;
    doc.setFillColor(...INK);
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) doc.rect(qx + col * cell, qy + r * cell, cell + 0.02, cell + 0.02, 'F');
    doc.setFontSize(7.5); doc.setTextColor(...INK2);
    doc.text(doc.splitTextToSize('Σκάναρε ή πάτα για να ανοίξει το ίδιο πλάνο', size) as string[], qx, qy + size + 3.5);
    doc.link(qx, qy, size, size, { url: input.link });
  }
  const qrTop = y;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 18 }, theme: 'grid', tableWidth: 130,
    head: [['', 'Μαθήματα', 'ECTS']],
    body: [
      semRow(6), semRow(7), semRow(8), semRow(9),
      ['Σύνολο 6ου–9ου', String(rows.length), withUnknown(sum)],
      ['1ο–5ο εξάμηνο', '', String(ECTS_SEMESTERS_1_5)],
      ['Διπλωματική (10ο)', '', String(ECTS_THESIS)],
      [complete ? 'Δίπλωμα' : 'Δίπλωμα μέχρι τώρα', '', `${fmtEcts(diploma)}${sum.unknown ? '+' : ''}${complete && !sum.unknown ? ` (${diploma === DIPLOMA_ECTS ? 'ακριβώς 300' : `${diploma > DIPLOMA_ECTS ? '+' : ''}${fmtEcts(diploma - DIPLOMA_ECTS)} από τα 300`})` : ''}`],
    ],
    styles: base, headStyles: { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold' },
    didParseCell: h => { if (h.section === 'body' && (h.row.index === 4 || h.row.index === 7)) h.cell.styles.fontStyle = 'bold'; },
  });
  const tableEnd = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY);

  y = Math.max(tableEnd, input.link && doc.getNumberOfPages() === pagesBefore ? qrTop + 44 : 0) + 6;

  const legacy = ids.filter(id => ectsOrigin(id, input.ects) === 'builtin' && confidenceOf(id) === 'legacy').length;
  const user = ids.filter(id => ectsOrigin(id, input.ects) === 'user').length;
  const notes = [
    `Δίπλωμα: ${DIPLOMA_ECTS} ECTS σε 10 εξάμηνα (Οδηγός Σπουδών §1.4). Τα 1ο–5ο εξάμηνο μετρούν ${ECTS_SEMESTERS_1_5} (30 το καθένα) και η διπλωματική ${ECTS_THESIS}.`,
    `ECTS ανά μάθημα: ${ECTS_SOURCES[0].title} (πίνακες κεφ. 8–9).`
      + (sum.unknown ? ` Χωρίς τιμή: ${sum.unknown === 1 ? '1 μάθημα' : `${sum.unknown} μαθήματα`}.` : '')
      + (legacy ? ` Με ~: η Πρακτική Άσκηση δεν έχει τιμή στον οδηγό· τιμή από το ${ECTS_SOURCES[1].title}.` : '')
      + (user ? ` ${user} τιμές από αρχείο του χρήστη.` : ''),
    `Κανόνες και μαθήματα: Οδηγός Σπουδών ΣΗΜΜΥ ΕΜΠ ${GUIDE_YEAR}. Ανεπίσημο εργαλείο· επιβεβαίωσε στη Γραμματεία πριν τη δήλωση.`,
  ];
  if (input.link) notes.push(`Σύνδεσμος πλάνου: ${input.link}`);
  doc.setFontSize(8.5); doc.setTextColor(...INK2);
  for (const n of notes) {
    const lines = doc.splitTextToSize(n, W - 2 * M) as string[];
    if (y + lines.length * 4 > 297 - 18) { doc.addPage(); y = M; }
    doc.text(lines, M, y); y += lines.length * 4 + 1.5;
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(M, 297 - 12, W - M, 297 - 12);
    doc.setFontSize(7.5); doc.setTextColor(...INK2);
    doc.text(`Χάρτης Ροών ΣΗΜΜΥ · ${c.label} · Κατεύθυνση ${d.long}`, M, 297 - 8);
    doc.text(`σελ. ${p}/${pages}`, W - M, 297 - 8, { align: 'right' });
  }
  return doc.output('blob');
}
