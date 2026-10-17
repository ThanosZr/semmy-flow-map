/**
 * Floating dock for touch screens: what a finger does on the spheres (rotate / scroll the page / explore),
 * switch sphere, focus, move to the other side, hide. Fixed to the screen, so it stays reachable even when
 * the spheres fill the whole screen; shown only while a sphere is on screen.
 */
import type { Settings, TouchMode } from '../state/settings';
import type { Store } from '../state/store';
import { on } from './dom';

const I = {
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 6.8v10.4M6.8 12h10.4" stroke="currentColor" stroke-width="1.1" opacity=".7"/><path d="M3.6 9.2a9 9 0 0 1 15.6-3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.6 2.6v3.4h-3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20.4 14.8a9 9 0 0 1-15.6 3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.4 21.4V18h3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  scroll: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 6.5v11M9.2 9.2 12 6.4l2.8 2.8M9.2 14.8 12 17.6l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  explore: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m15 15 5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10.5" cy="10.5" r="1.8" fill="currentColor"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 4.5h6M13.2 2.6 15 4.5l-1.8 1.9M15 19.5H9M10.8 17.6 9 19.5l1.8 1.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" stroke-width="1.6"/></svg>',
  side: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5M20 16H5M8.5 12.5 5 16l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  hideR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  hideL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

export const MODE_TEXT: Record<TouchMode, string> = {
  rotate: 'Περιστροφή', scroll: 'Κύλιση σελίδας', explore: 'Εξερεύνηση',
};
export const MODE_HELP: Record<TouchMode, string> = {
  rotate: 'Το δάχτυλο γυρίζει τη σφαίρα, δύο δάχτυλα κάνουν zoom.',
  scroll: 'Η σφαίρα μένει ακίνητη, το δάχτυλο κινεί τη σελίδα.',
  explore: 'Η σφαίρα μένει ακίνητη, σύρε το δάχτυλο για να δεις τι είναι κάθε σημείο.',
};

export interface DockActions {
  switchSphere(): void;
  focus(): void;
  /** text for the switch button: where it goes */
  switchLabel(): string;
}

export class TouchDock {
  private shown = false;

  constructor(private dock: HTMLElement, private handle: HTMLButtonElement, private settings: Store<Settings>, private actions: DockActions) {
    on(dock, 'click', '[data-mode]', el => settings.update(['touchMode'], s => { s.touchMode = el.dataset.mode as TouchMode; }));
    on(dock, 'click', '[data-dock="switch"]', () => actions.switchSphere());
    on(dock, 'click', '[data-dock="focus"]', () => actions.focus());
    on(dock, 'click', '[data-dock="side"]', () => settings.update(['dockSide'], s => { s.dockSide = s.dockSide === 'right' ? 'left' : 'right'; }));
    on(dock, 'click', '[data-dock="hide"]', () => settings.update(['dockHidden'], s => { s.dockHidden = true; }));
    handle.addEventListener('click', () => settings.update(['dockHidden'], s => { s.dockHidden = false; }));
  }

  render(): void {
    const s = this.settings.state;
    const mode = (m: TouchMode, icon: string, label: string) =>
      `<button type="button" data-mode="${m}" aria-pressed="${s.touchMode === m}" title="${MODE_HELP[m]}">${icon}<span>${label}</span></button>`;
    this.dock.dataset.side = s.dockSide;
    this.handle.dataset.side = s.dockSide;
    this.dock.innerHTML = `
      <div class="dock-modes" role="group" aria-label="Τι κάνει το δάχτυλο">
        ${mode('rotate', I.rotate, 'Γύρισμα')}${mode('scroll', I.scroll, 'Κύλιση')}${mode('explore', I.explore, 'Εξερεύν.')}
      </div>
      <i class="sep" aria-hidden="true"></i>
      <button type="button" data-dock="switch" title="${this.actions.switchLabel()}">${I.swap}<span>Σφαίρα</span></button>
      <button type="button" data-dock="focus" title="Εστίαση στην επιλογή· πάτα ξανά για επαναφορά">${I.focus}<span>Εστίαση</span></button>
      <i class="sep" aria-hidden="true"></i>
      <button type="button" data-dock="side" class="mini" title="Μεταφορά στην άλλη πλευρά" aria-label="Μεταφορά στην άλλη πλευρά">${I.side}</button>
      <button type="button" data-dock="hide" class="mini" title="Απόκρυψη μενού" aria-label="Απόκρυψη μενού">${s.dockSide === 'right' ? I.hideR : I.hideL}</button>`;
    this.handle.innerHTML = s.dockSide === 'right' ? I.hideL : I.hideR;
    this.sync();
  }

  /** the dock is wanted (touch screen, map view, a sphere on screen) */
  setShown(v: boolean): void { this.shown = v; this.sync(); }

  private sync(): void {
    const hidden = this.settings.state.dockHidden;
    this.dock.hidden = !this.shown || hidden;
    this.handle.hidden = !this.shown || !hidden;
  }
}
