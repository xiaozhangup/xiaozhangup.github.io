type FilterKind = 'all' | 'categories' | 'tags' | 'archives' | 'search' | 'category' | 'tag';
type WindowName = 'library' | 'reader' | 'about';

const root = document.querySelector<HTMLElement>('.desktop')!;
const windows = Object.fromEntries(
  Array.from(document.querySelectorAll<HTMLElement>('[data-window]')).map((item) => [item.dataset.window!, item]),
) as Record<WindowName, HTMLElement>;
const readerContent = document.querySelector<HTMLElement>('[data-reader-content]')!;
const searchInput = document.querySelector<HTMLInputElement>('[data-search]')!;
const heading = document.querySelector<HTMLElement>('[data-library-heading]')!;
const breadcrumb = document.querySelector<HTMLElement>('[data-breadcrumb]')!;
const summary = document.querySelector<HTMLElement>('[data-list-summary]')!;
const listLabel = document.querySelector<HTMLElement>('[data-list-label]')!;
const statusCount = document.querySelector<HTMLElement>('[data-status-count]')!;
const emptyList = document.querySelector<HTMLElement>('[data-empty-list]')!;
const categoryChips = document.querySelector<HTMLElement>('[data-category-chips]')!;
const tagChips = document.querySelector<HTMLElement>('[data-tag-chips]')!;
const announcer = document.querySelector<HTMLElement>('[data-announcer]')!;
const activeTitle = document.querySelector<HTMLElement>('[data-active-title]')!;
const postRows = Array.from(document.querySelectorAll<HTMLElement>('[data-post-row]'));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const readerDock = document.querySelector<HTMLButtonElement>('[data-restore-reader]')!;
const sidebarToggle = document.querySelector<HTMLButtonElement>('[data-toggle-sidebar]')!;
const mobileLayout = window.matchMedia('(max-width: 760px)');
let searchVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let pagefind: Promise<any> | undefined;
let topZ = 30;
const initialWindow = document.body.dataset.initialWindow as WindowName || 'library';
let activeWindow: WindowName = initialWindow;
let currentFilter: FilterKind = document.body.dataset.initialFilter as FilterKind || 'all';
let currentValue = document.body.dataset.filterValue || '';
let articleRequest = 0;

function announce(message: string) { announcer.textContent = message; }
function focusWindow(name: WindowName) {
  const win = windows[name];
  win.hidden = false;
  win.style.zIndex = String(++topZ);
  activeWindow = name;
  activeTitle.textContent = ({ library: '文章', reader: '阅读器', about: '关于' })[name];
  if (window.innerWidth <= 760) {
    for (const [key, other] of Object.entries(windows)) other.inert = key !== name;
  } else {
    for (const other of Object.values(windows)) other.inert = false;
  }
}
function showLibrary() { focusWindow('library'); }
function pushUrl(url: string) {
  if (location.pathname + location.search !== url) history.pushState({}, '', url);
}
function setFilter(kind: FilterKind, value = '', updateUrl = false, url = '/blog/') {
  currentFilter = kind;
  currentValue = value;
  if (updateUrl) pushUrl(url);
  const title: Record<FilterKind, string> = { all: '全部文章', categories: '分类', tags: '标签', archives: '归档', search: '搜索结果', category: value, tag: value };
  heading.textContent = title[kind];
  breadcrumb.textContent = title[kind];
  document.title = `${title[kind]} · xiaozhangup 的博客`;
  categoryChips.hidden = kind !== 'categories';
  tagChips.hidden = kind !== 'tags';
  listLabel.textContent = kind === 'archives' ? '按时间排列' : '最近的文章';
  if (kind !== 'search') searchInput.value = '';
  else searchInput.value = new URLSearchParams(location.search).get('q') || value;
  document.querySelectorAll<HTMLElement>('[data-desktop-filter]').forEach((link) => {
    const linkKind = link.dataset.desktopFilter;
    const selected = linkKind === kind && (!link.dataset.value || link.dataset.value === value)
      || (kind === 'category' && linkKind === 'categories')
      || (kind === 'tag' && linkKind === 'tags');
    link.classList.toggle('is-selected', selected);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  filterPosts();
  showLibrary();
  if (updateUrl && kind !== 'search') heading.focus();
}
function filterPosts() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const version = ++searchVersion;
  clearTimeout(searchTimer);
  function renderMatches(contentPaths: Set<string> = new Set()) {
    let count = 0;
    for (const row of postRows) {
      const categories = JSON.parse(row.dataset.categories || '[]') as string[];
      const tags = JSON.parse(row.dataset.tags || '[]') as string[];
      const matchesKind = currentFilter === 'category' ? categories.includes(currentValue)
        : currentFilter === 'tag' ? tags.includes(currentValue) : true;
      const haystack = [row.dataset.title, row.dataset.description, ...categories, ...tags].join(' ').toLocaleLowerCase();
      const articlePath = row.querySelector<HTMLAnchorElement>('[data-open-article]')!.pathname.replace(/\/+$/, '');
      const visible = matchesKind && (!query || haystack.includes(query) || contentPaths.has(articlePath));
      row.hidden = !visible;
      if (visible) count++;
    }
    emptyList.hidden = count > 0;
    summary.textContent = query ? `找到 ${count} 篇文章` : `${count} 篇文章`;
    statusCount.textContent = `${count} 篇文章`;
  }
  renderMatches();
  if (!query) return;
  searchTimer = setTimeout(async () => {
    try {
      const moduleUrl = '/pagefind/pagefind.js';
      pagefind ??= import(/* @vite-ignore */ moduleUrl);
      const engine = await pagefind;
      const matches = await engine.search(query);
      const results = await Promise.all(matches.results.map((result: { data: () => Promise<{ url: string }> }) => result.data()));
      if (version === searchVersion) renderMatches(new Set<string>(results.map((result: { url: string }) => new URL(result.url, location.origin).pathname.replace(/\/+$/, ''))));
    } catch { /* Title, description, category and tag search remains available. */ }
  }, 180);
}
function syncReaderTitle() {
  const name = readerContent.querySelector<HTMLElement>('h1')?.textContent?.trim() || '文章';
  document.querySelectorAll<HTMLElement>('[data-reader-title], [data-reader-toolbar-title]').forEach((el) => { el.textContent = name; });
  document.title = `${name} · xiaozhangup 的博客`;
}
async function openArticle(url: string, updateUrl = true) {
  const serial = ++articleRequest;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to load article');
    const html = await response.text();
    if (serial !== articleRequest) return;
    const page = new DOMParser().parseFromString(html, 'text/html');
    const article = page.querySelector<HTMLElement>('[data-article-fragment]');
    if (!article) throw new Error('Article not found');
    page.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((sheet) => {
      if (![...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((existing) => existing.href === sheet.href)) {
        document.head.appendChild(sheet.cloneNode(true));
      }
    });
    readerContent.replaceChildren(article);
    windows.reader.dataset.articleUrl = new URL(url, location.href).pathname;
    readerDock.hidden = false;
    readerContent.scrollTop = 0;
    if (updateUrl) pushUrl(new URL(url, location.href).pathname);
    focusWindow('reader');
    syncReaderTitle();
    readerContent.querySelector<HTMLElement>('h1')?.focus();
  } catch {
    location.href = url;
  }
}
function pathFilter(): { kind: FilterKind; value: string } | null {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const category = path.match(/^\/blog\/category\/([^/]+)/);
  const tag = path.match(/^\/blog\/tag\/([^/]+)/);
  if (category) return { kind: 'category', value: decodeURIComponent(category[1]) };
  if (tag) return { kind: 'tag', value: decodeURIComponent(tag[1]) };
  if (path === '/blog/categories') return { kind: 'categories', value: '' };
  if (path === '/blog/tags') return { kind: 'tags', value: '' };
  if (path === '/blog/archives') return { kind: 'archives', value: '' };
  if (path === '/blog/search') return { kind: 'search', value: new URLSearchParams(location.search).get('q') || '' };
  if (path === '/' || path === '/blog' || /^\/blog\/\d+$/.test(path)) return { kind: 'all', value: '' };
  return null;
}
function closeWindow(name: WindowName) {
  articleRequest++;
  windows[name].hidden = true;
  if (name === 'reader') readerDock.hidden = true;
  if (name === 'reader' || name === 'about') {
    showLibrary();
    setFilter('all', '', true);
  } else {
    activeTitle.textContent = '桌面';
    const visible = (['reader', 'about'] as WindowName[]).find((other) => !windows[other].hidden);
    if (visible) focusWindow(visible);
    else document.querySelector<HTMLElement>('[data-open-library]')?.focus();
  }
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const close = target.closest<HTMLAnchorElement>('[data-close-window]');
  if (close) { event.preventDefault(); closeWindow(close.dataset.closeWindow as WindowName); return; }
  const restore = target.closest<HTMLElement>('[data-restore-reader]');
  if (restore) {
    focusWindow('reader');
    if (windows.reader.dataset.articleUrl) pushUrl(windows.reader.dataset.articleUrl);
    syncReaderTitle();
    return;
  }
  const toggleSidebar = target.closest<HTMLButtonElement>('[data-toggle-sidebar]');
  if (toggleSidebar) {
    const name = mobileLayout.matches ? 'sidebar-open' : 'sidebar-hidden';
    const toggled = windows.library.classList.toggle(name);
    toggleSidebar.setAttribute('aria-expanded', String(mobileLayout.matches ? toggled : !toggled));
    return;
  }
  const control = target.closest<HTMLElement>('[data-minimize], [data-maximize], [data-center]');
  if (control) {
    const win = control.closest<HTMLElement>('[data-window]')!;
    if (control.hasAttribute('data-minimize')) {
      win.hidden = true;
      const name = win.dataset.window as WindowName;
      if (name === 'reader') { readerDock.focus(); if (!windows.library.hidden) focusWindow('library'); }
      else {
        const next = (['reader', 'library', 'about'] as WindowName[]).find((item) => item !== name && !windows[item].hidden);
        if (next) focusWindow(next);
        document.querySelector<HTMLElement>('[data-open-library]')?.focus();
      }
    }
    if (control.hasAttribute('data-maximize')) {
      win.classList.toggle('is-maximized');
      win.querySelectorAll('[data-maximize]').forEach((button) => button.setAttribute('aria-pressed', String(win.classList.contains('is-maximized'))));
    }
    if (control.hasAttribute('data-center')) {
      win.classList.remove('is-maximized');
      win.querySelectorAll('[data-maximize]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
      win.style.left = ''; win.style.top = ''; announce('窗口已居中');
    }
    const menu = control.closest<HTMLDetailsElement>('details');
    if (menu) {
      menu.open = false;
      if (!win.hidden) menu.querySelector<HTMLElement>('summary')!.focus();
    }
    return;
  }
  const search = target.closest<HTMLElement>('[data-focus-search]');
  if (search) { searchInput.focus(); return; }
  const copy = target.closest<HTMLElement>('[data-copy-link]');
  if (copy) {
    navigator.clipboard.writeText(new URL(windows.reader.dataset.articleUrl || location.pathname, location.origin).href).then(() => { announce('文章链接已复制'); copy.setAttribute('title', '已复制'); }).catch(() => { announce('复制失败，请从浏览器地址栏复制链接'); });
    return;
  }
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  if (anchor.hasAttribute('data-open-article')) { event.preventDefault(); void openArticle(anchor.href); return; }
  if (anchor.hasAttribute('data-open-about')) { event.preventDefault(); pushUrl('/about/'); focusWindow('about'); document.title = '关于 · xiaozhangup 的博客'; return; }
  if (anchor.hasAttribute('data-open-library')) { event.preventDefault(); setFilter('all', '', true, '/blog/'); return; }
  if (anchor.dataset.desktopFilter) {
    event.preventDefault();
    if (mobileLayout.matches) { windows.library.classList.remove('sidebar-open'); sidebarToggle.setAttribute('aria-expanded', 'false'); }
    setFilter(anchor.dataset.desktopFilter as FilterKind, anchor.dataset.value || '', true, anchor.pathname);
    if (anchor.dataset.desktopFilter === 'search') searchInput.focus();
  }
});
for (const win of Object.values(windows)) win.addEventListener('pointerdown', () => focusWindow(win.dataset.window as WindowName));
searchInput.addEventListener('input', filterPosts);
document.querySelector<HTMLFormElement>('[data-search-form]')!.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  setFilter('search', query, true, `/blog/search/${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  searchInput.focus();
});
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  document.querySelectorAll<HTMLDetailsElement>('.window-menu[open]').forEach((menu) => { if (!menu.contains(target)) menu.open = false; });
});
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  const openMenu = document.querySelector<HTMLDetailsElement>('.window-menu[open]');
  if (event.key === 'Escape' && openMenu) { openMenu.open = false; openMenu.querySelector<HTMLElement>('summary')!.focus(); return; }
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.matches('input,textarea,[contenteditable="true"]')) {
    event.preventDefault(); setFilter('search', '', true, '/blog/search/'); searchInput.focus();
  }
  if (event.key === 'Escape' && activeWindow !== 'library' && !windows[activeWindow].hidden) closeWindow(activeWindow);
});
window.addEventListener('popstate', () => {
  const filter = pathFilter();
  if (filter) { windows.reader.hidden = true; windows.about.hidden = true; setFilter(filter.kind, filter.value); }
  else if (location.pathname.replace(/\/+$/, '') === '/about') { focusWindow('about'); }
  else if (location.pathname.startsWith('/blog/')) void openArticle(location.href, false);
});

function moveWindow(win: HTMLElement, left: number, top: number) {
  const minLeft = window.innerWidth > 760 ? 86 : 4;
  const maxLeft = Math.max(minLeft, window.innerWidth - win.offsetWidth - 4);
  const minTop = 38;
  const maxTop = Math.max(minTop, window.innerHeight - win.offsetHeight - (window.innerWidth <= 760 ? 75 : 4));
  win.style.left = `${Math.max(minLeft, Math.min(left, maxLeft))}px`;
  win.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
}
for (const handle of document.querySelectorAll<HTMLButtonElement>('[data-drag-handle]')) {
  const win = handle.closest<HTMLElement>('[data-window]')!;
  let offsetX = 0, offsetY = 0;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || win.classList.contains('is-maximized') || window.innerWidth <= 760) return;
    const rect = win.getBoundingClientRect();
    offsetX = event.clientX - rect.left; offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) moveWindow(win, event.clientX - offsetX, event.clientY - offsetY);
  });
  handle.addEventListener('lostpointercapture', () => { handle.classList.remove('is-dragging'); });
  handle.addEventListener('keydown', (event) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] };
    const direction = directions[event.key];
    if (!direction || win.classList.contains('is-maximized')) return;
    event.preventDefault();
    const rect = win.getBoundingClientRect();
    moveWindow(win, rect.left + direction[0], rect.top + direction[1]);
    announce('窗口位置已调整');
  });
}
function updateSidebarMode() {
  windows.library.classList.remove('sidebar-open', 'sidebar-hidden');
  sidebarToggle.setAttribute('aria-expanded', String(!mobileLayout.matches));
}
mobileLayout.addEventListener('change', updateSidebarMode);
updateSidebarMode();
window.addEventListener('resize', () => {
  if (window.innerWidth > 760) for (const win of Object.values(windows)) win.inert = false;
  else if (!windows[activeWindow].hidden) for (const [key, win] of Object.entries(windows)) win.inert = key !== activeWindow;
  for (const win of Object.values(windows)) {
    if (!win.hidden && !win.classList.contains('is-maximized') && win.style.left) {
      const rect = win.getBoundingClientRect(); moveWindow(win, rect.left, rect.top);
    }
  }
});

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-label', theme === 'dark' ? '切换到浅色外观' : '切换到深色外观');
}
try { applyTheme(localStorage.getItem('desktop-theme') || 'dark'); } catch { applyTheme('dark'); }
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('desktop-theme', theme); } catch { /* Theme remains applied for this page. */ }
});
const clock = document.querySelector<HTMLElement>('[data-clock]')!;
function updateClock() { clock.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
updateClock(); setInterval(updateClock, 30_000);

const spotify = document.querySelector<HTMLAnchorElement>('[data-spotify-endpoint]');
if (spotify) {
  const text = spotify.querySelector<HTMLElement>('[data-spotify-text]')!;
  const cover = spotify.querySelector<HTMLImageElement>('[data-spotify-cover]')!;
  async function updateSpotify() {
    try {
      const response = await fetch(spotify!.dataset.spotifyEndpoint!);
      if (!response.ok) throw new Error('Spotify unavailable');
      const data = await response.json();
      text.textContent = data.playing ? `${data.title} · ${data.artist}` : 'Spotify · 未在播放';
      cover.hidden = !data.playing || !data.cover;
      if (!cover.hidden) cover.src = data.cover;
      spotify!.href = data.playing ? data.url : 'https://open.spotify.com/';
    } catch { cover.hidden = true; text.textContent = 'Spotify · 暂不可用'; }
  }
  void updateSpotify();
  setInterval(() => { if (!document.hidden) void updateSpotify(); }, 30_000);
}

setFilter(currentFilter, currentValue);
if (initialWindow === 'reader') { focusWindow('reader'); syncReaderTitle(); }
else if (initialWindow === 'about') { focusWindow('about'); document.title = '关于 · xiaozhangup 的博客'; }
if (prefersReducedMotion.matches) document.documentElement.style.scrollBehavior = 'auto';
