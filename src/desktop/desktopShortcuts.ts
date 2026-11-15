type Cell = { column: number; row: number };

const sameCell = (a: Cell, b: Cell) => a.column === b.column && a.row === b.row;
const directions: Record<string, [number, number]> = {
  ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

export function initDesktopShortcuts(grid: HTMLElement, announce: (label: string, action: 'shortcutMoved' | 'shortcutTrashed') => void) {
  const desktop = grid.parentElement!;
  const shortcuts = [...grid.querySelectorAll<HTMLAnchorElement>('a.desktop-shortcut')];
  const trash = grid.querySelector<HTMLElement>('[data-desktop-trash]')!;
  const trashIcon = trash.querySelector('img')!;
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
    const left = parseFloat(css.paddingLeft);
    const step = { x: width + gap, y: height + gap };
    const lastColumn = Math.max(0, Math.floor((desktop.clientWidth - left - width - read('--shortcut-right')) / step.x));
    const origin = { x: left + lastColumn * step.x, y: read('--shortcut-top') };
    return { origin, step, lastColumn, lastRow: Math.max(0, Math.floor((desktop.clientHeight - origin.y - height) / step.y)) };
  }
  let frame = layout();
  const cells = new Map<HTMLElement, Cell>([[trash, { column: frame.lastColumn, row: 0 }]]);
  shortcuts.forEach((tile, row) => cells.set(tile, { column: 0, row }));
  for (const [tile, cell] of cells) place(tile, cell);

  function cellLeft(column: number) {
    return frame.origin.x - column * frame.step.x;
  }
  const occupied = (tile: HTMLElement, cell: Cell) =>
    [...cells].some(([other, current]) => other !== tile && sameCell(current, cell));
  function place(tile: HTMLElement, cell: Cell) {
    cells.set(tile, cell);
    tile.style.setProperty('--shortcut-x', `${cellLeft(cell.column)}px`);
    tile.style.setProperty('--shortcut-row', String(cell.row));
  }
  function bounded(cell: Cell) {
    return {
      column: Math.max(0, Math.min(cell.column, frame.lastColumn)),
      row: Math.max(0, Math.min(cell.row, frame.lastRow)),
    };
  }
  function commit(tile: HTMLElement, cell: Cell) {
    if (occupied(tile, cell) || sameCell(cells.get(tile)!, cell)) return;
    place(tile, cell);
    announce(tile.textContent!.trim(), 'shortcutMoved');
  }
  function discard(tile: HTMLElement) {
    cells.delete(tile);
    tile.hidden = true;
    trashIcon.src = '/adwaita/color/user-trash-full.svg';
    announce(tile.textContent!.trim(), 'shortcutTrashed');
  }
  const overTrash = ({ clientX, clientY }: PointerEvent) =>
    trash.contains(document.elementFromPoint(clientX, clientY));

  window.addEventListener('resize', () => {
    if (!grid.clientWidth) return;
    const previous = frame;
    frame = layout();
    for (const [tile, old] of cells) {
      const column = old.column === previous.lastColumn ? frame.lastColumn : old.column;
      const next = bounded({ column, row: old.row });
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

  for (const tile of cells.keys()) {
    const canDiscard = tile !== trash;
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
      drag.cell = bounded({
        column: Math.round((frame.origin.x - (event.clientX - drag.offsetX)) / frame.step.x),
        row: Math.round((event.clientY - drag.offsetY - frame.origin.y) / frame.step.y),
      });
      const { column, row } = drag.cell;
      const trashHovered = canDiscard && overTrash(event);
      trash.classList.toggle('is-drop-target', trashHovered);
      drop.hidden = trashHovered || occupied(tile, drag.cell);
      drop.style.translate = `${cellLeft(column)}px ${frame.origin.y + row * frame.step.y}px`;
      ghost.style.translate = `${event.clientX - drag.iconX}px ${event.clientY - drag.iconY}px`;
    });
    tile.addEventListener('pointerup', (event) => {
      if (!drag || !movedByPointer) return;
      if (canDiscard && overTrash(event)) discard(tile);
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
      if (canDiscard && event.key === 'Delete') {
        event.preventDefault();
        discard(tile);
        (shortcuts.find((shortcut) => cells.has(shortcut)) ?? trash).focus();
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
