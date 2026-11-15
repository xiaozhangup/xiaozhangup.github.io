import { messages, type Language } from './i18n';

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
const dock = document.querySelector<HTMLElement>('.dock')!;
const dockAnchor = document.querySelector<HTMLElement>('[data-dock-anchor]')!;
const dockEdge = document.querySelector<HTMLButtonElement>('[data-dock-edge]')!;
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
let language: Language = 'zh';
try { if (localStorage.getItem('desktop-language') === 'en') language = 'en'; } catch { /* Use Chinese when storage is unavailable. */ }
const t = (key: string) => messages[language][key];
const blogTitle = (title: string) => `${title} · ${language === 'zh' ? 'xiaozhangup 的博客' : "xiaozhangup's Blog"}`;
const postCount = (count: number) => language === 'zh' ? `${count} 篇文章` : `${count} ${count === 1 ? 'post' : 'posts'}`;

function translateStatic(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  scope.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const text = t(el.dataset.i18nAria!);
    el.setAttribute('aria-label', text);
    if (el.hasAttribute('title')) el.setAttribute('title', text);
  });
  scope.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder!); });
}
function updateDates(scope: ParentNode = document) {
  const formatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' });
  scope.querySelectorAll<HTMLTimeElement>('time[datetime]').forEach((el) => { el.textContent = formatter.format(new Date(el.dateTime)); });
}
function applyArticleLanguage() {
  const variants = Array.from(readerContent.querySelectorAll<HTMLElement>('[data-article-language]'));
  const selected = language === 'en' && variants.some((item) => item.dataset.articleLanguage === 'en') ? 'en' : 'zh';
  variants.forEach((item) => { item.hidden = item.dataset.articleLanguage !== selected; });
  translateStatic(readerContent);
  updateDates(readerContent);
}
function visibleReaderHeading() {
  return readerContent.querySelector<HTMLElement>('[data-article-language]:not([hidden]) h1') || readerContent.querySelector<HTMLElement>('h1');
}
function updateLibraryLabels() {
  const titles: Record<FilterKind, string> = { all: t('allPosts'), categories: t('categories'), tags: t('tags'), archives: t('archives'), search: t('search'), category: currentValue, tag: currentValue };
  heading.textContent = titles[currentFilter];
  breadcrumb.textContent = titles[currentFilter];
  listLabel.textContent = currentFilter === 'archives' ? t('byDate') : t('recentPosts');
}


function announce(message: string) { announcer.textContent = message; }
function focusWindow(name: WindowName) {
  const win = windows[name];
  win.hidden = false;
  win.style.zIndex = String(++topZ);
  activeWindow = name;
  activeTitle.textContent = t(name === 'library' ? 'posts' : name === 'reader' ? 'reader' : 'aboutShort');
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
  updateLibraryLabels();
  document.title = blogTitle(heading.textContent!);
  categoryChips.hidden = kind !== 'categories';
  tagChips.hidden = kind !== 'tags';
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
      const haystack = [row.dataset.title, row.dataset.description, row.dataset.titleEn, row.dataset.descriptionEn, ...categories, ...tags].join(' ').toLocaleLowerCase();
      const articlePath = row.querySelector<HTMLAnchorElement>('[data-open-article]')!.pathname.replace(/\/+$/, '');
      const visible = matchesKind && (!query || haystack.includes(query) || contentPaths.has(articlePath));
      row.hidden = !visible;
      if (visible) count++;
    }
    emptyList.hidden = count > 0;
    summary.textContent = query ? `${t('found')} ${postCount(count)}` : postCount(count);
    statusCount.textContent = postCount(count);
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
  const name = visibleReaderHeading()?.textContent?.trim() || t('posts');
  document.querySelectorAll<HTMLElement>('[data-reader-title], [data-reader-toolbar-title]').forEach((el) => { el.textContent = name; });
  document.title = blogTitle(name);
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
    applyArticleLanguage();
    windows.reader.dataset.articleUrl = new URL(url, location.href).pathname;
    readerDock.hidden = false;
    readerContent.scrollTop = 0;
    if (updateUrl) pushUrl(new URL(url, location.href).pathname);
    focusWindow('reader');
    syncReaderTitle();
    visibleReaderHeading()?.focus();
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
    activeTitle.textContent = t('desktop');
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
      win.style.left = ''; win.style.top = ''; announce(t('windowCentered'));
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
    navigator.clipboard.writeText(new URL(windows.reader.dataset.articleUrl || location.pathname, location.origin).href).then(() => { announce(t('linkCopied')); copy.setAttribute('title', t('linkCopied')); }).catch(() => { announce(t('copyFailed')); });
    return;
  }
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  if (anchor.hasAttribute('data-open-article')) { event.preventDefault(); void openArticle(anchor.href); return; }
  if (anchor.hasAttribute('data-open-about')) { event.preventDefault(); pushUrl('/about/'); focusWindow('about'); document.title = blogTitle(t('aboutShort')); return; }
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
  document.querySelectorAll<HTMLDetailsElement>('.window-menu[open], .shell-menu[open]').forEach((menu) => { if (!menu.contains(target)) menu.open = false; });
});
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  const openMenu = document.querySelector<HTMLDetailsElement>('.window-menu[open], .shell-menu[open]');
  if (event.key === 'Escape' && openMenu) { openMenu.open = false; openMenu.querySelector<HTMLElement>('summary')!.focus(); return; }
  if (event.key === 'Escape' && dock.classList.contains('is-obscured') && dock.classList.contains('is-revealed')) {
    dockHoverSuppressed = true; setDockRevealed(false); dockEdge.focus(); return;
  }
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
  const minLeft = 0;
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
    announce(t('windowMoved'));
  });
}
let dockHoverSuppressed = false;
function setDockRevealed(revealed: boolean) {
  dock.classList.toggle('is-revealed', revealed);
  dockEdge.setAttribute('aria-expanded', String(revealed));
}
function isDockTarget(target: EventTarget | null) {
  return target instanceof Node && (dock.contains(target) || dockEdge.contains(target));
}
function updateDockOverlap() {
  const bounds = dockAnchor.getBoundingClientRect();
  const obscured = Object.values(windows).some((win) => {
    if (win.hidden) return false;
    const rect = win.getBoundingClientRect();
    return rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top;
  });
  dock.classList.toggle('is-obscured', obscured);
  dockEdge.hidden = !obscured;
  if (!obscured) setDockRevealed(false);
}
let dockUpdateFrame = 0;
function scheduleDockOverlap() {
  cancelAnimationFrame(dockUpdateFrame);
  dockUpdateFrame = requestAnimationFrame(updateDockOverlap);
}
const dockWindowObserver = new MutationObserver(scheduleDockOverlap);
for (const win of Object.values(windows)) dockWindowObserver.observe(win, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
new ResizeObserver(scheduleDockOverlap).observe(dockAnchor);
dockEdge.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch' && !dockHoverSuppressed) setDockRevealed(true); });
function leaveDock(event: PointerEvent) {
  if (event.pointerType !== 'touch' && !isDockTarget(event.relatedTarget)) { dockHoverSuppressed = false; setDockRevealed(false); }
}
dockEdge.addEventListener('pointerleave', leaveDock);
dockEdge.addEventListener('click', () => { dockHoverSuppressed = false; setDockRevealed(true); });
dock.addEventListener('pointerleave', leaveDock);
dock.addEventListener('focusin', (event) => { if ((event.target as HTMLElement).matches(':focus-visible')) setDockRevealed(true); });
dock.addEventListener('focusout', (event) => { if (!isDockTarget(event.relatedTarget)) setDockRevealed(false); });
document.addEventListener('pointerdown', (event) => { if (!isDockTarget(event.target)) setDockRevealed(false); });
window.addEventListener('resize', scheduleDockOverlap);
scheduleDockOverlap();

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
const themeText = document.querySelector<HTMLElement>('[data-theme-text]')!;
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
  themeText.textContent = t('darkStyle');
}
try { applyTheme(localStorage.getItem('desktop-theme') || 'dark'); } catch { applyTheme('dark'); }
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('desktop-theme', theme); } catch { /* Theme remains applied for this page. */ }
});
const clock = document.querySelector<HTMLElement>('[data-clock]')!;
function updateClock() { clock.textContent = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
updateClock(); setInterval(updateClock, 30_000);

const spotify = document.querySelector<HTMLAnchorElement>('[data-spotify-endpoint]');
let updateSpotifyLanguage = () => {};
if (spotify) {
  const text = spotify.querySelector<HTMLElement>('[data-spotify-text]')!;
  const cover = spotify.querySelector<HTMLImageElement>('[data-spotify-cover]')!;
  let status: 'loading' | 'playing' | 'idle' | 'unavailable' = 'loading';
  let track = '';
  updateSpotifyLanguage = () => { text.textContent = status === 'playing' ? track : status === 'idle' ? t('spotifyIdle') : status === 'unavailable' ? t('spotifyUnavailable') : 'Spotify'; };
  async function updateSpotify() {
    try {
      const response = await fetch(spotify!.dataset.spotifyEndpoint!);
      if (!response.ok) throw new Error('Spotify unavailable');
      const data = await response.json();
      status = data.playing ? 'playing' : 'idle';
      track = data.playing ? `${data.title} · ${data.artist}` : '';
      updateSpotifyLanguage();
      cover.hidden = !data.playing || !data.cover;
      if (!cover.hidden) cover.src = data.cover;
      spotify!.href = data.playing ? data.url : 'https://open.spotify.com/';
    } catch { cover.hidden = true; status = 'unavailable'; updateSpotifyLanguage(); }
  }
  void updateSpotify();
  setInterval(() => { if (!document.hidden) void updateSpotify(); }, 30_000);
}

function applyLanguage(next: Language) {
  language = next;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  translateStatic();
  document.querySelector<HTMLElement>('[data-language-indicator]')!.textContent = language === 'zh' ? '拼' : 'EN';
  document.querySelectorAll<HTMLButtonElement>('[data-set-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.setLanguage === language)));
  document.querySelectorAll<HTMLElement>('[data-post-title], [data-post-description]').forEach((el) => { el.textContent = el.dataset[language]!; });
  const dockLabels: [string, string][] = [
    ['.dock [data-open-library]', 'openPosts'], ['.dock [data-restore-reader]', 'restoreReader'],
    ['.dock [data-desktop-filter="categories"]', 'openCategories'], ['.dock [data-desktop-filter="tags"]', 'openTags'],
    ['.dock [data-desktop-filter="search"]', 'searchAction'], ['.dock [data-open-about]', 'openAbout'],
    ['.dock a[href="https://github.com/xiaozhangup"]', 'openGithub'], ['.dock a[href="/rss.xml"]', 'rss'],
  ];
  for (const [selector, key] of dockLabels) {
    const item = document.querySelector<HTMLElement>(selector)!;
    item.setAttribute('aria-label', t(key));
    item.dataset.tooltip = t(key);
  }
  document.querySelectorAll<HTMLElement>('[data-center], [data-minimize], [data-maximize], [data-close-window]').forEach((item) => {
    const key = item.hasAttribute('data-center') ? 'centerWindow' : item.hasAttribute('data-minimize') ? 'minimize' : item.hasAttribute('data-maximize') ? 'maximize' : 'close';
    item.setAttribute('aria-label', t(key));
    if (item.hasAttribute('title')) item.title = t(key);
  });
  windows.library.setAttribute('aria-label', t('library'));
  windows.reader.setAttribute('aria-label', t('reader'));
  windows.about.setAttribute('aria-label', t('about'));
  updateLibraryLabels();
  applyArticleLanguage();
  updateDates();
  filterPosts();
  applyTheme(document.documentElement.dataset.theme || 'dark');
  updateClock();
  updateSpotifyLanguage();
  if (!windows[activeWindow].hidden) {
    activeTitle.textContent = t(activeWindow === 'library' ? 'posts' : activeWindow === 'reader' ? 'reader' : 'aboutShort');
    if (activeWindow === 'reader') syncReaderTitle();
    else document.title = blogTitle(activeWindow === 'about' ? t('aboutShort') : heading.textContent!);
  } else activeTitle.textContent = t('desktop');
}
const shellMenus = Array.from(document.querySelectorAll<HTMLDetailsElement>('.shell-menu'));
shellMenus.forEach((menu) => menu.addEventListener('toggle', () => { if (menu.open) shellMenus.forEach((other) => { if (other !== menu) other.open = false; }); }));
document.querySelectorAll<HTMLButtonElement>('[data-set-language]').forEach((button) => button.addEventListener('click', () => {
  const menu = button.closest<HTMLDetailsElement>('details')!;
  applyLanguage(button.dataset.setLanguage as Language);
  try { localStorage.setItem('desktop-language', language); } catch { /* Language remains applied for this page. */ }
  menu.open = false;
  menu.querySelector<HTMLElement>('summary')!.focus();
}));
document.querySelectorAll<HTMLButtonElement>('[data-quick-action]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.quickAction;
  if (action === 'library') setFilter('all', '', true, '/blog/');
  else if (action === 'about') { pushUrl('/about/'); focusWindow('about'); document.title = blogTitle(t('aboutShort')); }
  else {
    Object.values(windows).forEach((win) => { win.hidden = true; });
    activeTitle.textContent = t('desktop');
    document.title = blogTitle(t('desktop'));
  }
  const menu = button.closest<HTMLDetailsElement>('details')!;
  menu.open = false;
  menu.querySelector<HTMLElement>('summary')!.focus();
}));
setFilter(currentFilter, currentValue);
if (initialWindow === 'reader') { focusWindow('reader'); syncReaderTitle(); }
else if (initialWindow === 'about') { focusWindow('about'); document.title = blogTitle(t('aboutShort')); }
applyLanguage(language);
if (prefersReducedMotion.matches) document.documentElement.style.scrollBehavior = 'auto';
