import { timecode, type Listening } from './spotify';

export function initListeningWindow(win: HTMLElement, t: (key: string) => string) {
  const tablist = win.querySelector<HTMLElement>('[role="tablist"]')!;
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...win.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const nativeFocus = Object.hasOwn(HTMLElement.prototype, 'focusGroup');
  const scroll = win.querySelector<HTMLElement>('.music-window-scroll')!;
  const status = win.querySelector<HTMLElement>('[data-listening-status]')!;
  const tracks = win.querySelector<HTMLOListElement>('[data-listening-tracks]')!;
  const artists = win.querySelector<HTMLUListElement>('[data-listening-artists]')!;
  const trackEmpty = win.querySelector<HTMLElement>('[data-listening-empty="tracks"]')!;
  const artistEmpty = win.querySelector<HTMLElement>('[data-listening-empty="artists"]')!;
  const artistSource = win.querySelector<HTMLElement>('[data-artist-source]')!;
  let result: Listening | null | undefined;

  function select(selected: HTMLButtonElement) {
    if (selected.getAttribute('aria-selected') !== 'true') scroll.scrollTop = 0;
    tabs.forEach((tab, index) => {
      const active = selected === tab;
      tab.setAttribute('aria-selected', String(active));
      tab.toggleAttribute('focusgroupstart', active);
      if (!nativeFocus) tab.tabIndex = active ? 0 : -1;
      const panel = panels[index];
      panel.hidden = !active;
      panel.toggleAttribute('tabindex', active && !panel.querySelector('a'));
      if (panel.hasAttribute('tabindex')) panel.tabIndex = 0;
    });
  }
  select(tabs[0]);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('focus', () => select(tab));
    if (nativeFocus) return;
    tab.addEventListener('keydown', (event) => {
      const offsets: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in offsets)) return;
      event.preventDefault();
      tabs[(offsets[event.key] + tabs.length) % tabs.length].focus();
    });
  });

  function item(href: string, className: string) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = className;
    li.append(link);
    return { li, link };
  }
  function art(url: string | undefined, text: string, className: string) {
    const fallback = document.createElement('span');
    fallback.className = className;
    fallback.textContent = text;
    fallback.setAttribute('aria-hidden', 'true');
    if (url) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = url;
      fallback.append(image);
    }
    return fallback;
  }
  function updateLabels() {
    status.textContent = t(result === null ? 'listeningUnavailable' : 'listeningLoading');
    trackEmpty.textContent = t(result?.tracks === null ? 'listeningUnavailable' : 'noTracks');
    artistEmpty.textContent = t(result?.artists === null ? 'listeningUnavailable' : 'noArtists');
    artistSource.textContent = result?.artists?.length ? t(result.artistSource === 'top' ? 'artistPeriod' : 'recentlyPlayed') : '';
    win.setAttribute('aria-label', t('music'));
  }
  function render(next: Listening | null) {
    result = next;
    status.hidden = Boolean(next);
    const recent = next?.tracks ?? [];
    const people = next?.artists ?? [];
    trackEmpty.hidden = !next || recent.length > 0;
    artistEmpty.hidden = !next || people.length > 0;
    tracks.replaceChildren(...recent.map((track) => {
      const { li, link } = item(track.url, 'music-track-row');
      const text = document.createElement('span');
      text.className = 'music-track-text';
      const title = document.createElement('strong');
      title.textContent = track.title;
      const artist = document.createElement('span');
      artist.textContent = track.artist;
      text.append(title, artist);
      const length = document.createElement('span');
      length.className = 'music-track-length';
      length.textContent = track.duration_ms ? timecode(track.duration_ms) : '';
      link.append(art(track.cover, '♪', 'music-track-art'), text, length);
      return li;
    }));
    artists.replaceChildren(...people.map((artist) => {
      const { li, link } = item(artist.url, 'music-artist-tile');
      const name = document.createElement('strong');
      name.textContent = artist.name;
      link.append(art(artist.image, Array.from(artist.name)[0], 'music-artist-art'), name);
      return li;
    }));
    select(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')!);
    updateLabels();
  }

  return { render, updateLabels };
}
