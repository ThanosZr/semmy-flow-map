/**
 * Hands a generated file to the viewer.
 * In a normal browser (GitHub Pages, Cloudflare Pages, local) this is a regular download.
 * When the page runs as a claude.ai artifact, downloads started by the page are blocked, so the
 * platform's `downloads` capability is used instead (the viewer confirms the save).
 */
interface DownloadsNs {
  save(r: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: string }>;
}

let capability: Promise<DownloadsNs | null> | null = null;

/** Ask once, early, so the answer is ready by the time the user clicks. */
export function prepareSaving(): void {
  const c = window.claude;
  if (!c?.use || capability) return;
  capability = c.use('downloads').then(ns => (ns as DownloadsNs | null) ?? null, () => null);
}

export type SaveOutcome = 'saved' | 'declined' | 'busy';

export async function saveFile(filename: string, data: Blob): Promise<SaveOutcome> {
  if (window.claude?.use) {
    prepareSaving();
    const dl = await capability;
    if (dl) {
      try { await dl.save({ filename, data }); return 'saved'; }
      catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (code === 'declined') return 'declined';
        if (code === 'rate_limited') return 'busy';
        // unavailable or unknown: fall through to a plain download
      }
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'saved';
}

export function datedName(base: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}
