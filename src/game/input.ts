import { IN_ANCHOR, IN_BURST, IN_DOWN, IN_JUMP, IN_LEFT, IN_RIGHT } from '../core/input';

// Keyboard, gamepad and touch input, mapped onto the per-tick input mask
// (movement) and discrete actions (recording controls, menus).

export type Action =
  | 'left'
  | 'right'
  | 'jump'
  | 'down'
  | 'burst'
  | 'anchor'
  | 'loop'
  | 'retry'
  | 'undo'
  | 'rewind'
  | 'fast'
  | 'plan'
  | 'pause'
  | 'hint';

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  burst: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
  anchor: ['KeyC', 'KeyK'],
  loop: ['KeyR'],
  retry: ['KeyT'],
  undo: ['KeyU', 'Backspace'],
  rewind: ['KeyZ'],
  fast: ['KeyF'],
  plan: ['KeyP', 'Tab'],
  pause: ['Escape'],
  hint: ['KeyH'],
};

export const ACTION_LABELS: Record<Action, string> = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
  down: 'Squash / fast fall',
  burst: 'Burst',
  anchor: 'Anchor (hold)',
  loop: 'Loop: keep take as echo',
  retry: 'Retry take',
  undo: 'Undo last echo',
  rewind: 'Rewind (hold)',
  fast: 'Fast-forward (hold)',
  plan: 'Plan view',
  pause: 'Pause',
  hint: 'Hint',
};

export function keyLabel(code: string) {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Arrow', '')
    .replace('Left', ' L')
    .replace('Right', ' R')
    .replace(/^Shift L$/, 'Shift')
    .replace(/^Shift R$/, 'Shift');
}

// Standard gamepad mapping.
const PAD: Partial<Record<Action, number[]>> = {
  jump: [0],
  burst: [2, 5],
  anchor: [3, 4],
  loop: [1],
  retry: [8],
  undo: [6],
  rewind: [7],
  pause: [9],
  plan: [],
  left: [14],
  right: [15],
  down: [13],
};

export class Input {
  bindings: Bindings;
  private down = new Set<string>();
  private pressedQueue: Action[] = [];
  private touch = new Set<Action>();
  private padPrev = new Set<Action>();
  private padNow = new Set<Action>();
  /** Digit keys pressed this frame (echo slots). */
  digits: number[] = [];
  onAnyKey: ((code: string) => boolean) | null = null;
  /** When false (menus, overlays), keys other than Escape are left to the page. */
  gameFocus = false;

  constructor(bindings: Bindings) {
    this.bindings = bindings;
    window.addEventListener('keydown', (e) => {
      if (this.onAnyKey && this.onAnyKey(e.code)) {
        e.preventDefault();
        return;
      }
      if (e.target instanceof HTMLInputElement) return;
      if (!this.gameFocus && e.code !== 'Escape') return;
      const action = this.actionFor(e.code);
      if (action || e.code.startsWith('Digit')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (action) this.pressedQueue.push(action);
      if (e.code.startsWith('Digit')) {
        const d = parseInt(e.code.slice(5), 10);
        if (d >= 1) this.digits.push(d);
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private actionFor(code: string): Action | undefined {
    for (const a of Object.keys(this.bindings) as Action[]) if (this.bindings[a].includes(code)) return a;
    return undefined;
  }

  held(a: Action) {
    if (this.touch.has(a) || this.padNow.has(a)) return true;
    for (const c of this.bindings[a]) if (this.down.has(c)) return true;
    return false;
  }

  /** Returns and clears the queue of discrete presses since last call. */
  takePresses(): Action[] {
    const q = this.pressedQueue;
    this.pressedQueue = [];
    return q;
  }
  takeDigits(): number[] {
    const d = this.digits;
    this.digits = [];
    return d;
  }

  mask(): number {
    let m = 0;
    if (this.held('left')) m |= IN_LEFT;
    if (this.held('right')) m |= IN_RIGHT;
    if (this.held('jump')) m |= IN_JUMP;
    if (this.held('down')) m |= IN_DOWN;
    if (this.held('burst')) m |= IN_BURST;
    if (this.held('anchor')) m |= IN_ANCHOR;
    return m;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p && p.connected);
    this.padPrev = this.padNow;
    this.padNow = new Set();
    if (!pad) return;
    for (const [a, btns] of Object.entries(PAD) as [Action, number[]][]) {
      if (btns.some((i) => pad.buttons[i]?.pressed)) this.padNow.add(a);
    }
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (ax < -0.35) this.padNow.add('left');
    if (ax > 0.35) this.padNow.add('right');
    if (ay > 0.6) this.padNow.add('down');
    for (const a of this.padNow) if (!this.padPrev.has(a)) this.pressedQueue.push(a);
  }

  setTouch(a: Action, on: boolean) {
    if (on && !this.touch.has(a)) this.pressedQueue.push(a);
    if (on) this.touch.add(a);
    else this.touch.delete(a);
  }

  reset() {
    this.pressedQueue = [];
    this.digits = [];
  }
}
