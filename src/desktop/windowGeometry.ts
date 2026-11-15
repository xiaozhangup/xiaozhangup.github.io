const topbar = document.querySelector<HTMLElement>('.topbar')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const geometryAnimations = new WeakMap<HTMLElement, Animation>();
const direction: Record<string, [number, number]> = {
  ArrowLeft: [-16, 0],
  ArrowRight: [16, 0],
  ArrowUp: [0, -16],
  ArrowDown: [0, 16],
};

function limits(win: HTMLElement) {
  return {
    left: 0,
    top: topbar.offsetHeight,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
    minWidth: win.dataset.window === 'about' ? 252 : 280,
    minHeight: 195,
  };
}

export function windowBox(win: HTMLElement) {
  return {
    left: win.offsetLeft,
    top: win.offsetTop,
    right: win.offsetLeft + win.offsetWidth,
    bottom: win.offsetTop + win.offsetHeight,
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function move(win: HTMLElement, left: number, top: number) {
  const screen = limits(win);
  win.style.left = `${clamp(left, screen.left, screen.right - win.offsetWidth)}px`;
  win.style.top = `${clamp(top, screen.top, screen.bottom - win.offsetHeight)}px`;
}

function resize(win: HTMLElement, start: ReturnType<typeof windowBox>, edge: string, dx: number, dy: number) {
  const screen = limits(win);
  let { left, right, top, bottom } = start;
  if (edge.includes('w')) left = clamp(start.left + dx, screen.left, Math.max(screen.left, right - screen.minWidth));
  if (edge.includes('e')) right = clamp(start.right + dx, Math.min(screen.right, left + screen.minWidth), screen.right);
  if (edge.includes('n')) top = clamp(start.top + dy, screen.top, Math.max(screen.top, bottom - screen.minHeight));
  if (edge.includes('s')) bottom = clamp(start.bottom + dy, Math.min(screen.bottom, top + screen.minHeight), screen.bottom);
  Object.assign(win.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
}

export function fitWindow(win: HTMLElement) {
  if (win.classList.contains('is-maximized') || !win.style.left) return;
  const screen = limits(win);
  if (win.style.width) win.style.width = `${Math.min(win.offsetWidth, screen.right)}px`;
  if (win.style.height) win.style.height = `${Math.min(win.offsetHeight, screen.bottom - screen.top)}px`;
  move(win, win.offsetLeft, win.offsetTop);
}

export function animateWindowChange(win: HTMLElement, update: () => void) {
  const from = win.getBoundingClientRect();
  geometryAnimations.get(win)?.cancel();
  update();

  if (reducedMotion.matches || document.documentElement.dataset.motion === 'off') return;
  const to = win.getBoundingClientRect();
  if (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height) return;

  const transform = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  const animation = win.animate(
    [{ transform, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }],
    { duration: 190, easing: 'cubic-bezier(.2,.65,.3,1)' },
  );
  geometryAnimations.set(win, animation);
}

export function beginKeyboardResize(win: HTMLElement) {
  win.setAttribute('data-keyboard-resize', '');
  win.querySelector<HTMLButtonElement>('[data-drag-handle]')!.focus({ preventScroll: true });
}

export function bindWindowGeometry(
  win: HTMLElement,
  toggleMaximize: () => void,
  positionChanged: (resized: boolean) => void,
) {
  const handle = win.querySelector<HTMLButtonElement>('[data-drag-handle]')!;
  const targets = [handle, ...win.querySelectorAll<HTMLElement>('[data-resize-edge]')];

  for (const target of targets) {
    let start: { x: number; y: number; box: ReturnType<typeof windowBox> } | undefined;
    target.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || win.classList.contains('is-maximized')) return;
      geometryAnimations.get(win)?.cancel();
      start = { x: event.clientX, y: event.clientY, box: windowBox(win) };
      target.setPointerCapture(event.pointerId);
      if (target === handle) handle.classList.add('is-dragging');
    });
    target.addEventListener('pointermove', (event) => {
      if (!start || !target.hasPointerCapture(event.pointerId)) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (target === handle) move(win, start.box.left + dx, start.box.top + dy);
      else resize(win, start.box, target.dataset.resizeEdge!, dx, dy);
    });
    target.addEventListener('lostpointercapture', () => {
      start = undefined;
      handle.classList.remove('is-dragging');
    });
  }

  if (win.dataset.window !== 'about') handle.addEventListener('dblclick', toggleMaximize);
  handle.addEventListener('blur', () => win.removeAttribute('data-keyboard-resize'));
  handle.addEventListener('keydown', (event) => {
    const sizing = win.hasAttribute('data-keyboard-resize');
    if (sizing && (event.key === 'Escape' || event.key === 'Enter')) {
      event.preventDefault();
      event.stopPropagation();
      win.removeAttribute('data-keyboard-resize');
      return;
    }

    const step = direction[event.key];
    if (!step || win.classList.contains('is-maximized')) return;
    event.preventDefault();
    const [dx, dy] = step;
    const box = windowBox(win);
    if (sizing) resize(win, box, 'se', dx, dy);
    else move(win, box.left + dx, box.top + dy);
    positionChanged(sizing);
  });
}
