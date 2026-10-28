import { UI } from './config';

export const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
export function attr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
export function style(node: HTMLElement | SVGElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}
export function flag(node: Element, name: string, enabled: boolean): void {
  if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
}
export function hidden(node: HTMLElement, value: boolean): void {
  if (node.hidden !== value) node.hidden = value;
}
export function find<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
}
export function pop(node: HTMLElement, shake = false): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !node.animate) return;
  node.getAnimations().forEach((animation) => animation.cancel());
  node.animate(shake
    ? [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }]
    : [{ transform: 'scale(1)' }, { transform: 'scale(1.2) rotate(-3deg)' }, { transform: 'scale(1)' }],
  { duration: shake ? UI.shakeMs : UI.popMs, easing: 'ease-out' });
}
export function timeLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
