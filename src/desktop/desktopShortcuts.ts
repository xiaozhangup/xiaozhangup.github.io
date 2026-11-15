type Cell = { column: number; row: number };

const sameCell = (a: Cell, b: Cell) => a.column === b.column && a.row === b.row;
const directions: Record<string, [number, number]> = {
  ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

export function initDesktopShortcuts(grid: HTMLElement, announce: (label: string, action: 'shortcutMoved' | 'shortcutTrashed') => void) {
  const shortcuts = [...grid.querySelectorAll<HTMLAnchorElement>('.desktop-shortcut')];
  const trash = grid.querySelector<HTMLElement>('[data-desktop-trash]')!;
  const trashIcon = trash.querySelector('img')!;
  const cells = new Map(shortcuts.map((shortcut, row) => [shortcut, { column: 0, row }]));
  const ghost = document.createElement('img');
  const drop = document.createElement('div');
  ghost.className = 'desktop-drag-icon';
  ghost.alt = '';
  drop.className = 'desktop-drop-target';
  ghost.hidden = drop.hidden = true;
  grid.after(drop, ghost);

  function layout() {
    const css = getComputedStyle(grid);
    const read = (name: string) => parseFloat(css.getPropertyValue(name));
    const width = read('--shortcut-width');
    const height = read('--shortcut-height');
    const gap = read('--shortcut-gap');
    const origin = { x: grid.clientWidth - width - read('--shortcut-right'), y: read('--shortcut-top') };
    const step = { x: width + gap, y: height + gap };
    return {
      origin, step,
      lastColumn: Math.max(0, Math.floor((origin.x - 74) / step.x)),
      lastRow: Math.max(0, Math.floor((grid.clientHeight - origin.y - height) / step.y)),
    };
  }
  const occupied = (tile: HTMLAnchorElement, cell: Cell) =>
    [...cells].some(([other, current]) => other !== tile && sameCell(current, cell));
  function place(tile: HTMLAnchorElement, cell: Cell) {
    cells.set(tile, cell);
    tile.style.setProperty('--shortcut-column', String(cell.column));
    tile.style.setProperty('--shortcut-row', String(cell.row));
  }
  function bounded(cell: Cell, frame = layout()) {
    return {
      column: Math.max(0, Math.min(cell.column, frame.lastColumn)),
      row: Math.max(0, Math.min(cell.row, frame.lastRow)),
    };
  }
  function commit(tile: HTMLAnchorElement, cell: Cell) {
    if (occupied(tile, cell) || sameCell(cells.get(tile)!, cell)) return;
    place(tile, cell);
    announce(tile.textContent!.trim(), 'shortcutMoved');
  }
  function discard(tile: HTMLAnchorElement) {
    cells.delete(tile);
    tile.hidden = true;
    trashIcon.src = '/adwaita/color/user-trash-full.svg';
    announce(tile.textContent!.trim(), 'shortcutTrashed');
  }
  const overTrash = ({ clientX, clientY }: PointerEvent) =>
    trash.contains(document.elementFromPoint(clientX, clientY));

  window.addEventListener('resize', () => {
    if (!grid.clientWidth) return;
    const frame = layout();
    for (const [tile, old] of cells) {
      const next = bounded(old, frame);
      if (!occupied(tile, next)) {
        place(tile, next);
        continue;
      }
      if (sameCell(old, next)) continue;
      const candidates = Array.from({ length: (frame.lastColumn + 1) * (frame.lastRow + 1) }, (_, index) => ({
        column: Math.floor(index / (frame.lastRow + 1)), row: index % (frame.lastRow + 1),
      }));
      const free = candidates.find((candidate) => !occupied(tile, candidate));
      if (free) place(tile, free);
    }
  });

  for (const tile of shortcuts) {
    let drag: { startX: number; startY: number; offsetX: number; offsetY: number; iconX: number; iconY: number; cell: Cell } | null = null;
    let movedByPointer = false;
    const icon = tile.querySelector('img')!;
    tile.addEventListener('dragstart', (event) => event.preventDefault());
    tile.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      const box = tile.getBoundingClientRect();
      const artwork = icon.getBoundingClientRect();
      drag = {
        startX: event.clientX, startY: event.clientY,
        offsetX: event.clientX - box.left, offsetY: event.clientY - box.top,
        iconX: event.clientX - artwork.left, iconY: event.clientY - artwork.top,
        cell: cells.get(tile)!,
      };
      movedByPointer = false;
      tile.setPointerCapture(event.pointerId);
    });
    tile.addEventListener('pointermove', (event) => {
      if (!drag || !tile.hasPointerCapture(event.pointerId)) return;
      if (!movedByPointer) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
        movedByPointer = true;
        tile.classList.add('is-dragging');
        ghost.src = icon.src;
        ghost.hidden = false;
      }
      const frame = layout();
      drag.cell = bounded({
        column: Math.round((frame.origin.x - (event.clientX - drag.offsetX)) / frame.step.x),
        row: Math.round((event.clientY - drag.offsetY - frame.origin.y) / frame.step.y),
      }, frame);
      const { column, row } = drag.cell;
      const trashHovered = overTrash(event);
      trash.classList.toggle('is-drop-target', trashHovered);
      drop.hidden = trashHovered || occupied(tile, drag.cell);
      drop.style.translate = `${frame.origin.x - column * frame.step.x}px ${frame.origin.y + row * frame.step.y}px`;
      ghost.style.translate = `${event.clientX - drag.iconX}px ${event.clientY - drag.iconY}px`;
    });
    tile.addEventListener('pointerup', (event) => {
      if (!drag || !movedByPointer) return;
      if (overTrash(event)) discard(tile);
      else commit(tile, drag.cell);
    });
    tile.addEventListener('lostpointercapture', () => {
      drag = null;
      tile.classList.remove('is-dragging');
      trash.classList.remove('is-drop-target');
      ghost.hidden = drop.hidden = true;
    });
    tile.addEventListener('click', (event) => {
      if (movedByPointer && event.detail > 0) event.preventDefault();
    });
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        discard(tile);
        ([...cells.keys()][0] ?? grid.parentElement)?.focus();
        return;
      }
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const [dx, dy] = direction;
      const current = cells.get(tile)!;
      commit(tile, bounded({ column: current.column + dx, row: current.row + dy }));
    });
  }
}
