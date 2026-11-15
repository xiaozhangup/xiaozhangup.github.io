type Playback = {
  playing: true;
  title: string;
  artist: string;
  cover?: string;
  url?: string;
  progress_ms?: number | null;
  duration_ms?: number | null;
} | { playing: false };

function timecode(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function initSpotify(t: (key: string) => string) {
  const bar = document.querySelector<HTMLElement>('[data-spotify-endpoint]');
  if (!bar) return () => {};

  const pill = bar.querySelector<HTMLElement>('[data-spotify-pill]')!;
  const coverImages = Array.from(bar.querySelectorAll<HTMLImageElement>('[data-spotify-cover]'));
  const panel = bar.querySelector<HTMLElement>('.music-menu')!;
  const timeline = panel.querySelector<HTMLElement>('[data-spotify-timeline]')!;
  const progress = panel.querySelector<HTMLElement>('[data-spotify-progress]')!;
  const elapsed = panel.querySelector<HTMLElement>('[data-spotify-elapsed]')!;
  const duration = panel.querySelector<HTMLElement>('[data-spotify-duration]')!;
  const tracks = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-playing]'));
  const idle = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-idle]'));
  const statuses = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-status]'));
  const titles = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-title]'));
  const artists = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-artist]'));
  const links = Array.from(bar.querySelectorAll<HTMLAnchorElement>('[data-spotify-link]'));

  let playback: Playback = { playing: false };
  let state: 'loading' | 'active' | 'idle' | 'unavailable' = 'loading';
  let sampledAt = 0;
  let lastFetch = -Infinity;
  let refreshing = false;
  let timer: number | undefined;
  function renderText() {
    const status = t(state === 'idle' ? 'spotifyIdle' : state === 'unavailable' ? 'spotifyUnavailable' : 'spotifyLoading');
    statuses.forEach((text) => { text.textContent = status; });
    pill.textContent = playback.playing ? `${playback.title} • ${playback.artist}` : 'Spotify';
  }

  function updateProgress() {
    if (!playback.playing || typeof playback.progress_ms !== 'number' || !playback.duration_ms) {
      timeline.hidden = true;
      return;
    }
    const position = Math.min(playback.duration_ms, Math.max(0, playback.progress_ms + performance.now() - sampledAt));
    const fraction = position / playback.duration_ms;
    timeline.hidden = false;
    elapsed.textContent = timecode(position);
    duration.textContent = timecode(playback.duration_ms);
    progress.style.setProperty('--position', String(fraction));
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  }

  function runProgress() {
    clearInterval(timer);
    if (panel.hasAttribute('data-open') && playback.playing) {
      updateProgress();
      timer = window.setInterval(updateProgress, 500);
    }
  }

  coverImages.forEach((img) => {
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.remove('loaded'));
  });

  function render() {
    const track = playback.playing ? playback : null;
    bar!.toggleAttribute('data-playing', Boolean(track));
    tracks.forEach((node) => { node.hidden = !track; });
    idle.forEach((node) => { node.hidden = Boolean(track); });
    if (track) {
      titles.forEach((node) => { node.textContent = track.title; });
      artists.forEach((node) => { node.textContent = track.artist; });
    }
    for (const img of coverImages) {
      if (track?.cover === img.getAttribute('src')) continue;
      img.classList.remove('loaded');
      if (track?.cover) img.src = track.cover;
      else img.removeAttribute('src');
    }
    if (track?.cover) panel.style.setProperty('--track-art', `url("${track.cover.replaceAll('"', '%22')}")`);
    else panel.style.removeProperty('--track-art');
    for (const link of links) {
      const url = track?.url;
      link.hidden = !url?.startsWith('https://open.spotify.com/');
      if (!link.hidden) link.href = url!;
      else link.removeAttribute('href');
    }
    runProgress();
    renderText();
  }

  async function refresh() {
    if (refreshing || performance.now() - lastFetch < 5000) return;
    refreshing = true;
    lastFetch = performance.now();
    try {
      const response = await fetch(bar!.dataset.spotifyEndpoint!);
      if (!response.ok) throw new Error('Spotify unavailable');
      playback = await response.json();
      sampledAt = performance.now();
      state = playback.playing ? 'active' : 'idle';
    } catch {
      playback = { playing: false };
      state = 'unavailable';
    } finally {
      refreshing = false;
      render();
    }
  }

  for (const menu of [panel, bar.querySelector<HTMLElement>('.clock-menu')!]) {
    menu.addEventListener('disclosurechange', () => {
      runProgress();
      if (menu.hasAttribute('data-open')) void refresh();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
  return renderText;
}
