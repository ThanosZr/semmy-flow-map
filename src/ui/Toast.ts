export class Toast {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private el: HTMLElement) {}
  show(text: string, ms = 3400): void {
    this.el.textContent = text;
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.el.hidden = true; }, ms);
  }
}
