import { dismissDisclosure, initDisclosures } from './disclosures';
import { messages, type Language } from './i18n';
import { initCalendar } from './shellCalendar';
import { initSpotify } from './spotify';
import { animateWindowChange, beginKeyboardResize, bindWindowGeometry, fitWindow, windowBox } from './windowGeometry';

type FilterKind = 'all' | 'categories' | 'tags' | 'archives' | 'search' | 'category' | 'tag';
type WindowName = 'library' | 'reader' | 'about';

const root = document.querySelector<HTMLElement>('.desktop')!;
const windows = Object.fromEntries(
  Array.from(document.querySelectorAll<HTMLElement>('[data-window]')).map((item) => [item.dataset.window!, item]),
) as Record<WindowName, HTMLElement>;
const readerContent = document.querySelector<HTMLElement>('[data-reader-content]')!;
const searchForm = document.querySelector<HTMLFormElement>('[data-search-form]')!;
const searchButton = document.querySelector<HTMLButtonElement>('[data-focus-search]')!;
const searchInput = document.querySelector<HTMLInputElement>('[data-search]')!;
const heading = document.querySelector<HTMLElement>('[data-library-heading]')!;
const breadcrumb = document.querySelector<HTMLElement>('[data-breadcrumb]')!;
const filesView = document.querySelector<HTMLElement>('[data-files-view]')!;
const statusCount = document.querySelector<HTMLElement>('[data-status-count]')!;
const emptyList = document.querySelector<HTMLElement>('[data-empty-list]')!;
const categoryChips = document.querySelector<HTMLElement>('[data-category-chips]')!;
const tagChips = document.querySelector<HTMLElement>('[data-tag-chips]')!;
const announcer = document.querySelector<HTMLElement>('[data-announcer]')!;
const activeTitle = document.querySelector<HTMLElement>('[data-active-title]')!;
const postRows = Array.from(document.querySelectorAll<HTMLElement>('[data-post-row]'));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const readerDock = document.querySelector<HTMLButtonElement>('[data-restore-reader]')!;
const libraryDock = document.querySelector<HTMLAnchorElement>('.dock [data-open-library]')!;
const sidebarToggle = document.querySelector<HTMLButtonElement>('[data-toggle-sidebar]')!;
const sidebar = document.querySelector<HTMLElement>('.library-sidebar')!;
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
let libraryUrl = initialWindow === 'library' ? location.pathname + location.search : '/blog/';
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
}

function announce(message: string) { announcer.textContent = message; }
const isVisible = (win: HTMLElement) => win.hasAttribute('data-visible');
function syncWindowAccess() {
  for (const [name, win] of Object.entries(windows)) {
    win.inert = !isVisible(win) || (mobileLayout.matches && name !== activeWindow);
  }
}
function hideWindow(win: HTMLElement) {
  win.removeAttribute('data-visible');
  win.removeAttribute('data-active');
  win.inert = true;
  if (win === windows.library) libraryDock.classList.remove('is-running');
}
function focusWindow(name: WindowName) {
  const win = windows[name];
  if (!win.hasAttribute('data-active') || !isVisible(win)) win.style.zIndex = String(++topZ);
  win.setAttribute('data-visible', '');
  activeWindow = name;
  if (name === 'library') libraryDock.classList.add('is-running');
  for (const [key, other] of Object.entries(windows)) other.toggleAttribute('data-active', key === name);
  syncWindowAccess();
  activeTitle.textContent = t(name === 'library' ? 'posts' : name === 'reader' ? 'reader' : 'aboutShort');
}
function pushUrl(url: string) {
  if (location.pathname + location.search !== url) history.pushState({}, '', url);
}
function setSearchVisible(open: boolean) {
  searchForm.hidden = !open;
  searchButton.setAttribute('aria-expanded', String(open));
}
function showSearch() {
  focusWindow('library');
  setSearchVisible(true);
  searchInput.focus();
}
function setFilter(kind: FilterKind, value = '', updateUrl = false, url = '/blog/') {
  currentFilter = kind;
  currentValue = value;
  if (updateUrl) {
    libraryUrl = url;
    pushUrl(url);
  }
  updateLibraryLabels();
  document.title = blogTitle(heading.textContent!);
  setSearchVisible(kind === 'search');
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
  focusWindow('library');
  if (updateUrl && kind !== 'search') heading.focus();
}
function filterPosts() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const version = ++searchVersion;
  clearTimeout(searchTimer);
  categoryChips.hidden = Boolean(query) || currentFilter !== 'categories';
  tagChips.hidden = Boolean(query) || currentFilter !== 'tags';
  filesView.hidden = !categoryChips.hidden || !tagChips.hidden;
  statusCount.hidden = filesView.hidden;
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
    statusCount.textContent = query ? `${t('found')} ${postCount(count)}` : postCount(count);
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
  windows.reader.querySelector<HTMLElement>('[data-reader-title]')!.textContent = name;
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
    if (serial === articleRequest) location.href = url;
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
  if (name === 'reader') {
    articleRequest++;
    readerDock.hidden = true;
  }
  hideWindow(windows[name]);
  if (name !== 'library') {
    focusWindow('library');
    pushUrl(libraryUrl);
    document.title = blogTitle(heading.textContent!);
    heading.focus();
    return;
  }
  focusNextWindow();
  if (!isVisible(windows[activeWindow])) libraryDock.focus();
}

function focusNextWindow() {
  const next = (Object.keys(windows) as WindowName[])
    .filter((name) => isVisible(windows[name]))
    .sort((a, b) => Number(getComputedStyle(windows[b]).zIndex) - Number(getComputedStyle(windows[a]).zIndex))[0];
  if (next) focusWindow(next);
  else activeTitle.textContent = t('desktop');
}
function syncSidebar() {
  const library = windows.library;
  const compact = library.classList.contains('is-compact');
  const open = compact ? library.classList.contains('sidebar-open') : !library.classList.contains('sidebar-hidden');
  sidebar.inert = !open;
  sidebarToggle.setAttribute('aria-expanded', String(open));
}
function updateSidebarMode() {
  const library = windows.library;
  const compact = library.clientWidth < 588;
  if (compact !== library.classList.contains('is-compact')) {
    library.classList.toggle('is-compact', compact);
    library.classList.remove('sidebar-open');
  }
  syncSidebar();
}
function setMaximized(win: HTMLElement, maximized: boolean) {
  win.classList.toggle('is-maximized', maximized);
  win.querySelectorAll('[data-maximize]').forEach((button) => button.setAttribute('aria-pressed', String(maximized)));
  if (!maximized) fitWindow(win);
}
function toggleMaximize(win: HTMLElement) {
  animateWindowChange(win, () => setMaximized(win, !win.classList.contains('is-maximized')));
}
function centerWindow(win: HTMLElement) {
  animateWindowChange(win, () => {
    setMaximized(win, false);
    const top = document.querySelector<HTMLElement>('.topbar')!.offsetHeight;
    const { clientWidth, clientHeight } = document.documentElement;
    win.style.left = `${Math.max(0, (clientWidth - win.offsetWidth) / 2)}px`;
    win.style.top = `${Math.max(top, (clientHeight + top - win.offsetHeight) / 2)}px`;
  });
  announce(t('windowCentered'));
}
function minimizeWindow(win: HTMLElement) {
  hideWindow(win);
  focusNextWindow();
  const dockButton = win === windows.reader ? readerDock : win === windows.about
    ? document.querySelector<HTMLElement>('.dock [data-open-about]')! : libraryDock;
  dockButton.focus();
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
    const name = windows.library.classList.contains('is-compact') ? 'sidebar-open' : 'sidebar-hidden';
    windows.library.classList.toggle(name);
    syncSidebar();
    return;
  }
  const control = target.closest<HTMLElement>('[data-minimize], [data-maximize], [data-center], [data-resize-window]');
  if (control) {
    const win = control.closest<HTMLElement>('[data-window]')!;
    const minimize = control.hasAttribute('data-minimize');
    const keyboardResize = control.hasAttribute('data-resize-window');
    if (control.closest('.window-menu-popover')) dismissDisclosure(!minimize && !keyboardResize);
    if (minimize) minimizeWindow(win);
    else if (keyboardResize) {
      beginKeyboardResize(win);
      announce(t('resizeHint'));
    } else if (control.hasAttribute('data-maximize')) {
      toggleMaximize(win);
    } else {
      centerWindow(win);
    }
    return;
  }
  const search = target.closest<HTMLElement>('[data-focus-search]');
  if (search) {
    const fromMenu = search.classList.contains('window-menu-extra');
    if (fromMenu) dismissDisclosure();
    if (searchForm.hidden || fromMenu) showSearch();
    else if (currentFilter === 'search') setFilter('all', '', true);
    else {
      searchInput.value = '';
      setSearchVisible(false);
      filterPosts();
      searchButton.focus();
    }
    return;
  }
  const copy = target.closest<HTMLElement>('[data-copy-link]');
  if (copy) {
    if (copy.classList.contains('window-menu-extra')) dismissDisclosure(true);
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
    windows.library.classList.remove('sidebar-open');
    syncSidebar();
    setFilter(anchor.dataset.desktopFilter as FilterKind, anchor.dataset.value || '', true, anchor.pathname);
    if (anchor.dataset.desktopFilter === 'search') searchInput.focus();
  }
});
for (const [name, win] of Object.entries(windows)) {
  win.addEventListener('pointerdown', () => focusWindow(name as WindowName));
  win.addEventListener('focusin', () => focusWindow(name as WindowName));
  bindWindowGeometry(win, () => toggleMaximize(win), (resized) => announce(t(resized ? 'windowResized' : 'windowMoved')));
}
new ResizeObserver(updateSidebarMode).observe(windows.library);
updateSidebarMode();
initDisclosures();
searchInput.addEventListener('input', filterPosts);
searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  setFilter('search', query, true, `/blog/search/${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  searchInput.focus();
});
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (event.key === 'Escape' && dismissDisclosure(true)) return;
  if (event.key === 'Escape' && dock.classList.contains('is-obscured') && dock.classList.contains('is-revealed')) {
    dockHoverSuppressed = true; setDockRevealed(false); dockEdge.focus(); return;
  }
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.matches('input,textarea,[contenteditable="true"]')) {
    event.preventDefault();
    showSearch();
  }
  if (event.key === 'Escape' && activeWindow !== 'library' && isVisible(windows[activeWindow])) closeWindow(activeWindow);
});
window.addEventListener('popstate', () => {
  const filter = pathFilter();
  articleRequest++;
  if (filter) {
    libraryUrl = location.pathname + location.search;
    hideWindow(windows.reader);
    hideWindow(windows.about);
    setFilter(filter.kind, filter.value);
  }
  else if (location.pathname.replace(/\/+$/, '') === '/about') { focusWindow('about'); }
  else if (location.pathname.startsWith('/blog/')) void openArticle(location.href, false);
});

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
    if (!isVisible(win)) return false;
    const rect = windowBox(win);
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
for (const win of Object.values(windows)) dockWindowObserver.observe(win, { attributes: true, attributeFilter: ['class', 'style', 'data-visible'] });
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

mobileLayout.addEventListener('change', syncWindowAccess);
window.addEventListener('resize', () => {
  for (const win of Object.values(windows)) fitWindow(win);
});

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
const motionButton = document.querySelector<HTMLButtonElement>('[data-motion-toggle]')!;
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
}
function applyMotion(motion: string) {
  document.documentElement.dataset.motion = motion;
  motionButton.setAttribute('aria-pressed', String(motion !== 'off' && !prefersReducedMotion.matches));
  motionButton.disabled = prefersReducedMotion.matches;
}
try {
  applyTheme(localStorage.getItem('desktop-theme') === 'light' ? 'light' : 'dark');
  applyMotion(localStorage.getItem('desktop-motion') === 'off' ? 'off' : 'on');
} catch {
  applyTheme('dark');
  applyMotion('on');
}
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('desktop-theme', theme); } catch { /* Theme remains applied for this page. */ }
});
motionButton.addEventListener('click', () => {
  const motion = document.documentElement.dataset.motion === 'off' ? 'on' : 'off';
  applyMotion(motion);
  try { localStorage.setItem('desktop-motion', motion); } catch { /* Motion preference remains applied for this page. */ }
});
prefersReducedMotion.addEventListener('change', () => applyMotion(document.documentElement.dataset.motion!));

const clock = document.querySelector<HTMLElement>('[data-clock]')!;
function updateClock() {
  clock.textContent = new Intl.DateTimeFormat(document.documentElement.lang, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
}
const updateCalendar = initCalendar();
const updateSpotifyLanguage = initSpotify(t);
setInterval(updateClock, 30_000);

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
  updateClock();
  updateCalendar(document.documentElement.lang);
  updateSpotifyLanguage();
  if (isVisible(windows[activeWindow])) {
    activeTitle.textContent = t(activeWindow === 'library' ? 'posts' : activeWindow === 'reader' ? 'reader' : 'aboutShort');
    if (activeWindow === 'reader') syncReaderTitle();
    else document.title = blogTitle(activeWindow === 'about' ? t('aboutShort') : heading.textContent!);
  } else activeTitle.textContent = t('desktop');
}
document.querySelectorAll<HTMLButtonElement>('[data-set-language]').forEach((button) => button.addEventListener('click', () => {
  applyLanguage(button.dataset.setLanguage as Language);
  try { localStorage.setItem('desktop-language', language); } catch { /* Language remains applied for this page. */ }
  dismissDisclosure(true);
}));
document.querySelector<HTMLButtonElement>('[data-copy-email]')!.addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  navigator.clipboard.writeText(button.dataset.copyEmail!)
    .then(() => announce(t('emailCopied')))
    .catch(() => announce(t('copyEmailFailed')));
  dismissDisclosure(true);
});
document.querySelectorAll<HTMLButtonElement>('[data-quick-action]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.quickAction;
  if (action === 'library') setFilter('all', '', true, '/blog/');
  else if (action === 'about') { pushUrl('/about/'); focusWindow('about'); document.title = blogTitle(t('aboutShort')); }
  else {
    articleRequest++;
    Object.values(windows).forEach(hideWindow);
    activeTitle.textContent = t('desktop');
    document.title = blogTitle(t('desktop'));
  }
  dismissDisclosure(true);
}));

setFilter(currentFilter, currentValue);
if (initialWindow === 'reader') { focusWindow('reader'); syncReaderTitle(); }
else if (initialWindow === 'about') { focusWindow('about'); document.title = blogTitle(t('aboutShort')); }
applyLanguage(language);
