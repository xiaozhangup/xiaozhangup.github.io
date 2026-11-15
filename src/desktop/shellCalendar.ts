export function initCalendar() {
  const pane = document.querySelector<HTMLElement>('[data-calendar]')!;
  const owner = pane.closest<HTMLElement>('[data-disclosure]')!;
  const weekday = pane.querySelector<HTMLElement>('[data-calendar-weekday]')!;
  const todayLabel = pane.querySelector<HTMLElement>('[data-calendar-today]')!;
  const monthLabel = pane.querySelector<HTMLElement>('[data-calendar-month]')!;
  const grid = pane.querySelector<HTMLElement>('[data-calendar-grid]')!;
  let monthOffset = 0;

  function render(locale: string) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    weekday.textContent = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(today);
    todayLabel.textContent = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(today);

    const displayMonth = new Date(year, month + monthOffset, 1);
    monthLabel.textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(displayMonth);
    const firstDay = (displayMonth.getDay() + 6) % 7;
    const cellMonth = displayMonth.getMonth();
    const cellYear = displayMonth.getFullYear();
    const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });

    const cells = document.createDocumentFragment();
    for (let i = 0; i < 7; i++) {
      const label = document.createElement('span');
      label.className = 'day-name';
      label.textContent = dayName.format(new Date(2026, 0, i + 5));
      cells.append(label);
    }
    for (let i = 0; i < 42; i++) {
      const date = new Date(cellYear, cellMonth, 1 + i - firstDay);
      const day = document.createElement('span');
      day.textContent = String(date.getDate());
      day.setAttribute('title', fullDate.format(date));
      if (date.getMonth() !== cellMonth) day.className = 'other-month';
      if (date.toDateString() === today.toDateString()) day.setAttribute('aria-current', 'date');
      cells.append(day);
    }
    grid.replaceChildren(cells);
  }

  pane.querySelectorAll<HTMLButtonElement>('[data-month-step]').forEach((button) => {
    button.addEventListener('click', () => {
      monthOffset += Number(button.dataset.monthStep);
      render(document.documentElement.lang);
    });
  });
  owner.addEventListener('disclosurechange', () => {
    if (!owner.hasAttribute('data-open')) return;
    monthOffset = 0;
    render(document.documentElement.lang);
  });
  return render;
}
