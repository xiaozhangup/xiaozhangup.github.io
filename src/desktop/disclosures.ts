let opened: HTMLElement | null = null;

function controls(owner: HTMLElement) {
  const trigger = owner.querySelector<HTMLElement>('[data-disclosure-trigger]')!;
  const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
  return { trigger, panel };
}

function positionPanel(owner: HTMLElement) {
  const { trigger, panel } = controls(owner);
  if (!owner.dataset.align) return;

  const rect = trigger.getBoundingClientRect();
  const width = panel.offsetWidth;
  const center = rect.left + rect.width / 2;
  const anchor = owner.dataset.align === 'center' ? center - width / 2
    : owner.dataset.align === 'start' ? rect.left : rect.right - width;
  const left = Math.max(6, Math.min(anchor, document.documentElement.clientWidth - width - 6));
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = `${center - left}px top`;
}

export function dismissDisclosure(restoreFocus = false) {
  if (!opened) return false;

  const owner = opened;
  opened = null;
  const { trigger, panel } = controls(owner);
  owner.removeAttribute('data-open');
  trigger.setAttribute('aria-expanded', 'false');
  panel.inert = true;
  owner.dispatchEvent(new Event('disclosurechange'));
  if (restoreFocus) trigger.focus({ preventScroll: true });
  return true;
}

function openDisclosure(owner: HTMLElement) {
  dismissDisclosure();
  const { trigger, panel } = controls(owner);
  positionPanel(owner);
  opened = owner;
  owner.setAttribute('data-open', '');
  trigger.setAttribute('aria-expanded', 'true');
  panel.inert = false;
  owner.dispatchEvent(new Event('disclosurechange'));
}

export function initDisclosures() {
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element).closest<HTMLButtonElement>('button[data-disclosure-trigger]');
    if (trigger) {
      const owner = trigger.closest<HTMLElement>('[data-disclosure]')!;
      if (opened === owner) dismissDisclosure();
      else openDisclosure(owner);
    } else if (opened && !opened.contains(event.target as Node)) {
      dismissDisclosure();
    }
  });

  document.addEventListener('focusin', (event) => {
    if (opened && !opened.contains(event.target as Node)) dismissDisclosure();
  });

  window.addEventListener('resize', () => {
    if (opened) positionPanel(opened);
  });
}
