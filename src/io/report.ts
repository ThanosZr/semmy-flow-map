/**
 * PDF report of a plan, generated in the browser with jsPDF.
 * Loaded on demand (dynamic import), so the PDF library and the Greek font cost nothing until used.
 * Font: Commissioner (SIL Open Font License), embedded so Greek renders in any PDF viewer.
 */
import fontBoldUrl from '@expo-google-fonts/commissioner/700Bold/Commissioner_700Bold.ttf?url';
import fontRegularUrl from '@expo-google-fonts/commissioner/400Regular/Commissioner_400Regular.ttf?url';
import { COURSES, GUIDE_YEAR } from '../data/catalog';
import { DIPLOMA_ECTS, ectsOf, fmtEcts, sumEcts } from '../data/ects';
import { DIR, ELEC_DRAWING, SHAPES, type CoreChoice } from '../data/rules';
import type { Combo } from '../domain/combos';
import { semesterLoad, type Allocation, type Check } from '../domain/plan';

export interface Snapshot { dataUrl: string; width: number; height: number }

export interface ReportInput {
  combo: Combo;
  alloc: Allocation;
  checks: Check[];
  core: CoreChoice;
  ects: Readonly<Record<string, number>>;
  combosImage: Snapshot | null;
  coursesImage: Snapshot | null;
  /** background behind the globe images, so a dark-theme capture stays readable on paper */
  imageBackground: [number, number, number];
}

type RGB = [number, number, number];
const INK: RGB = [15, 39, 71], INK2: RGB = [74, 97, 131], RULE: RGB = [201, 211, 224], OK: RGB = [31, 122, 74], BAD: RGB = [180, 35, 24];
const DIR_RGB: Record<string, RGB> = { ES: [194, 59, 42], PL: [107, 63, 200], TL: [11, 132, 102], EN: [168, 106, 0] };

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
    rows.push({ id, sem: co.sem, code: co.code, name: co.name, group, role, ects: e === null ? '—' : fmtEcts(e), sort: `${co.sem}-${group}-${co.code}` });
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
  const [{ jsPDF }, { autoTable }, regular, bold] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), fontBase64(fontRegularUrl), fontBase64(fontBoldUrl),
  ]);
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

  doc.setFillColor(...(DIR_RGB[c.dir] ?? INK)); doc.circle(M + 2.2, y - 2.6, 2.2, 'F');
  doc.setFont('Commissioner', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(c.label, M + 7, y);
  const ok = checks.every(x => x.ok);
  doc.setFontSize(9); doc.setTextColor(...(ok ? OK : BAD));
  doc.text(ok ? 'ΕΓΚΥΡΟ ΠΛΑΝΟ' : `${checks.filter(x => !x.ok).length} ΕΚΚΡΕΜΟΤΗΤΕΣ`, W - M, y - 1, { align: 'right' });
  y += 6;
  doc.setFont('Commissioner', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK2);
  doc.text(`Κατεύθυνση ${d.long} · ${SHAPES[c.shape].name} + ${c.free} ${c.free === 1 ? 'ελεύθερο' : 'ελεύθερα'}`, M, y); y += 5;
  doc.text(doc.splitTextToSize(c.rules.map(r => `Κανόνας ${r}: ${d.ruleText[r]}`).join('   '), W - 2 * M), M, y); y += 7;

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
      doc.addImage(s.dataUrl, 'PNG', x + (boxW - iw) / 2, y + (boxH - ih) / 2, iw, ih, undefined, 'FAST');
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
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 21 }, 3: { cellWidth: 11, halign: 'center' }, 4: { cellWidth: 40 }, 5: { cellWidth: 12, halign: 'right' } },
    alternateRowStyles: { fillColor: [244, 247, 251] },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;

  // summary per semester and ECTS
  const load = semesterLoad(a, input.core);
  const ids = rows.map(r => r.id);
  const sum = sumEcts(ids, input.ects);
  const semIds = (s: number) => ids.filter(id => COURSES[id].sem === s);
  const semRow = (s: 6 | 7 | 8 | 9) => {
    const e = sumEcts(semIds(s), input.ects);
    return [`${s}ο εξάμηνο`, String(load.bySem[s]), e.known ? fmtEcts(e.total) + (e.unknown ? ` (+${e.unknown} χωρίς τιμή)` : '') : '—'];
  };
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 18 }, theme: 'grid', tableWidth: 120,
    head: [['', 'Μαθήματα', 'ECTS']],
    body: [semRow(6), semRow(7), semRow(8), semRow(9), ['Σύνολο 6ου–9ου', String(rows.length), sum.known ? fmtEcts(sum.total) + (sum.unknown ? ` (+${sum.unknown} χωρίς τιμή)` : '') : '—']],
    styles: base, headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' },
    didParseCell: h => { if (h.section === 'body' && h.row.index === 4) h.cell.styles.fontStyle = 'bold'; },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;

  const notes = [
    `Δίπλωμα: ${DIPLOMA_ECTS} ECTS σε 10 εξάμηνα (9 εξάμηνα μαθημάτων και διπλωματική εργασία, Οδηγός Σπουδών §1.4).`,
    sum.unknown === rows.length
      ? 'Ο οδηγός σπουδών δεν δίνει ECTS ανά μάθημα, οπότε η στήλη ECTS μένει κενή μέχρι να φορτωθούν τιμές από αρχείο.'
      : sum.unknown ? `Λείπει τιμή ECTS για ${sum.unknown} από τα ${rows.length} μαθήματα.` : 'Οι τιμές ECTS προέρχονται από αρχείο που φόρτωσε ο χρήστης.',
    `Κανόνες και μαθήματα: Οδηγός Σπουδών ΣΗΜΜΥ ΕΜΠ ${GUIDE_YEAR}. Ανεπίσημο εργαλείο· επιβεβαίωσε στη Γραμματεία πριν τη δήλωση.`,
  ];
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
