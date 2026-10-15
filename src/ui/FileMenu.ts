/**
 * "Αρχείο" menu: export/import of settings and choices, ECTS template, PDF report.
 */
import { on } from './dom';

export type FileAction = 'export' | 'import' | 'ects-template' | 'pdf';

export class FileMenu {
  private menu: HTMLElement;

  constructor(private button: HTMLButtonElement, private input: HTMLInputElement,
              private run: (a: FileAction) => void, onFile: (f: File) => void) {
    this.menu = document.getElementById(button.getAttribute('aria-controls')!)!;
    button.addEventListener('click', () => (this.menu.hidden ? this.open() : this.close()));
    on(this.menu, 'click', '[data-file]', el => { this.close(); this.trigger(el.dataset.file as FileAction); });
    this.menu.addEventListener('keydown', e => {
      const items = [...this.menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'Escape') { this.close(); button.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
    document.addEventListener('pointerdown', e => {
      if (!this.menu.hidden && !this.menu.contains(e.target as Node) && !button.contains(e.target as Node)) this.close();
    });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (f) onFile(f);
    });
  }

  trigger(a: FileAction): void {
    if (a === 'import') this.input.click(); else this.run(a);
  }

  private open(): void {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  private close(): void {
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }
}
