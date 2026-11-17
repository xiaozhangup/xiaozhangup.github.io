import { dismissDisclosure, initDisclosures } from './disclosures';
import { initDesktopShortcuts } from './desktopShortcuts';
import { messages, type Language } from './i18n';
import { initListeningWindow } from './listeningWindow';
import { initCalendar } from './shellCalendar';
import { initSpotify } from './spotify';
import { animateDockFlight, animateWindowChange, beginKeyboardResize, bindWindowGeometry, fitWindow, windowBox } from './windowGeometry';

type FilterKind = 'all' | 'categories' | 'tags' | 'archives' | 'search' | 'category' | 'tag';
type WindowKind = 'library' | 'reader' | 'about' | 'music';

const root = document.querySelector<HTMLElement>('.desktop')!;
const firstWorkspace = root.querySelector<HTMLElement>('#workspace-one')!;
const secondWorkspace = root.querySelector<HTMLElement>('#workspace-two')!;
const workspaceButton = document.querySelector<HTMLButtonElement>('[data-switch-workspace]')!;
const library = root.querySelector<HTMLElement>('[data-window="library"]')!;
const about = root.querySelector<HTMLElement>('[data-window="about"]')!;
const music = root.querySelector<HTMLElement>('[data-window="music"]')!;
const initialReader = root.querySelector<HTMLElement>('[data-window="reader"]');
const readerTemplate = root.querySelector<HTMLTemplateElement>('[data-reader-template]')!;
const dockTemplate = root.querySelector<HTMLTemplateElement>('[data-dock-template]')!;
const readers = new Map<string, HTMLElement>();
const pendingReaders = new Map<string, Promise<HTMLElement>>();
const dockItems = new Map<HTMLElement, HTMLAnchorElement>();
const searchForm = document.querySelector<HTMLFormElement>('[data-search-form]')!;
const libraryPath = document.querySelector<HTMLElement>('[data-library-path]')!;
const searchButton = document.querySelector<HTMLButtonElement>('[data-focus-search]:not([data-mobile-search])')!;
const mobileSearchButton = document.querySelector<HTMLButtonElement>('[data-mobile-search]')!;
const appLanguage = document.querySelector<HTMLSelectElement>('[data-app-language]')!;
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
const sidebarToggle = document.querySelector<HTMLButtonElement>('[data-toggle-sidebar]')!;
const sidebar = document.querySelector<HTMLElement>('.library-sidebar')!;
const dock = document.querySelector<HTMLElement>('.dock')!;
const dockAnchor = document.querySelector<HTMLElement>('[data-dock-anchor]')!;
const dockEdge = document.querySelector<HTMLButtonElement>('[data-dock-edge]')!;
const mobileLayout = window.matchMedia('(max-width: 760px), (max-height: 480px) and (pointer: coarse)');
let searchVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let pagefind: Promise<any> | undefined;
let topZ = 30;
let workspace: 1 | 2 = 1;
const initialKind = document.body.dataset.initialWindow as WindowKind;
let activeWindow: HTMLElement | null = null;
let libraryRunning = true;
let readerNumber = 0;
let currentFilter: FilterKind = document.body.dataset.initialFilter as FilterKind || 'all';
let currentValue = document.body.dataset.filterValue || '';
let libraryUrl = initialKind === 'library' ? location.pathname + location.search : '/blog/';
let articleRequest = 0;
let language: Language = 'zh';
try { if (localStorage.getItem('desktop-language') === 'en') language = 'en'; } catch { /* Use Chinese when storage is unavailable. */ }
const t = (key: string) => messages[language][key];
const siteTitle = () => language === 'zh' ? 'xiaozhangup 的博客' : "xiaozhangup's Blog";
const postCount = (count: number) => language === 'zh' ? `${count} 篇文章` : `${count} ${count === 1 ? 'post' : 'posts'}`;

function translateStatic(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-label-zh]').forEach((el) => {
    el.textContent = language === 'zh' ? el.dataset.labelZh! : el.dataset.labelEn!;
  });
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
function applyArticleLanguage(reader: HTMLElement) {
  const variants = Array.from(reader.querySelectorAll<HTMLElement>('[data-article-language]'));
  const selected = language === 'en' && variants.some((item) => item.dataset.articleLanguage === 'en') ? 'en' : 'zh';
  variants.forEach((item) => { item.hidden = item.dataset.articleLanguage !== selected; });
  reader.querySelectorAll<HTMLElement>('[data-toc-language]').forEach((item) => {
    item.hidden = item.dataset.tocLanguage !== selected;
  });
  updateReaderOutline(reader);
}
function visibleReaderHeading(reader: HTMLElement) {
  return reader.querySelector<HTMLElement>('[data-article-language]:not([hidden]) h1') || reader.querySelector<HTMLElement>('h1');
}
function updateLibraryLabels() {
  const titles: Record<FilterKind, string> = { all: t('allPosts'), categories: t('categories'), tags: t('tags'), archives: t('archives'), search: t('search'), category: currentValue, tag: currentValue };
  heading.textContent = titles[currentFilter];
  breadcrumb.textContent = titles[currentFilter];
}

function announce(message: string) { announcer.textContent = message; }
const isVisible = (win: HTMLElement) => win.hasAttribute('data-visible');
function windowKind(win: HTMLElement) { return win.dataset.window as WindowKind; }
function windowRoute(win: HTMLElement) {
  if (win === library) return libraryUrl;
  if (win === about) return '/about/';
  if (win === music) return '/music/';
  return win.dataset.articleUrl!;
}
function windowTitle(win: HTMLElement) {
  if (win === library) return heading.textContent!;
  if (win === about) return t('aboutShort');
  if (win === music) return t('music');
  return visibleReaderHeading(win)?.textContent?.trim() || t('reader');
}
function pageTitle(win: HTMLElement | null) {
  return win && windowKind(win) === 'reader' && win.querySelector('[data-article-fragment]') ? windowTitle(win) : siteTitle();
}
function updateDockItem(win: HTMLElement, item: HTMLAnchorElement) {
  const title = win === library ? t('posts') : windowTitle(win);
  item.href = windowRoute(win);
  item.dataset.tooltip = title;
  item.setAttribute('aria-label', title);
  item.classList.toggle('is-active', workspace === 1 && win === activeWindow && isVisible(win));
  item.querySelector<HTMLElement>('.dock-dot')!.hidden = win === library && !libraryRunning;
}
function dockItemFor(win: HTMLElement, rendered?: HTMLAnchorElement) {
  const current = dockItems.get(win);
  if (current) return current;
  const kind = windowKind(win);
  const item = rendered ?? dockTemplate.content.firstElementChild!.cloneNode(true) as HTMLAnchorElement;
  if (!rendered) {
    const icons = { library: 'gnome-files', reader: 'text-x-generic', about: 'help-about', music: 'gnome-music' };
    item.dataset.dockWindow = kind;
    item.querySelector('img')!.src = `/adwaita/color/${icons[kind]}.svg`;
    item.setAttribute('data-dock-entering', '');
    dock.append(item);
    // Resolve the starting style on insertion.
    item.getAnimations();
    item.removeAttribute('data-dock-entering');
  }
  dockItems.set(win, item);
  updateDockItem(win, item);
  return item;
}
function syncDockApps() {
  for (const [win, item] of dockItems) updateDockItem(win, item);
}
function switchWorkspace(next: 1 | 2) {
  if (workspace === next) return false;

  articleRequest++;
  dismissDisclosure(true);
  const onFirst = next === 1;
  if (!onFirst && firstWorkspace.contains(document.activeElement)) {
    workspaceButton.focus({ preventScroll: true });
  }
  workspace = next;
  root.dataset.workspace = String(next);
  workspaceButton.setAttribute('aria-pressed', String(!onFirst));
  firstWorkspace.inert = !onFirst;
  secondWorkspace.inert = onFirst;
  activeTitle.textContent = onFirst && activeWindow && isVisible(activeWindow) ? windowTitle(activeWindow) : t('desktop');
  document.title = onFirst && activeWindow && isVisible(activeWindow) ? pageTitle(activeWindow) : siteTitle();
  syncDockApps();
  scheduleDockOverlap();
  announce(t(onFirst ? 'workspaceOne' : 'workspaceTwo'));
  return true;
}
function syncWindowAccess() {
  for (const win of dockItems.keys()) {
    win.inert = !isVisible(win) || (mobileLayout.matches && win !== activeWindow);
  }
}
function hideWindow(win: HTMLElement) {
  win.removeAttribute('data-visible');
  win.removeAttribute('data-active');
  win.inert = true;
  syncDockApps();
}
function focusWindow(win: HTMLElement, fly = false) {
  const item = dockItemFor(win);
  if (fly && !mobileLayout.matches && !isVisible(win)) {
    flyToWindow(win, item, true, () => focusWindow(win));
    return;
  }
  if (win === library) libraryRunning = true;
  if (win === music) spotify.loadListening();
  if (activeWindow !== win || !isVisible(win)) win.style.zIndex = String(++topZ);
  win.setAttribute('data-visible', '');
  activeWindow = win;
  for (const other of dockItems.keys()) other.toggleAttribute('data-active', other === win);
  syncWindowAccess();
  if (windowKind(win) === 'reader') updateReaderOutline(win);
  syncDockApps();
  activeTitle.textContent = windowTitle(win);
}
function pushUrl(url: string) {
  if (location.pathname + location.search + location.hash !== url) history.pushState({}, '', url);
}
function setSearchVisible(open: boolean) {
  searchForm.hidden = !open;
  libraryPath.hidden = open;
  searchButton.setAttribute('aria-expanded', String(open));
  mobileSearchButton.setAttribute('aria-expanded', String(open));
}
function showSearch() {
  articleRequest++;
  const switched = switchWorkspace(1);
  focusWindow(library, !switched);
  library.classList.remove('sidebar-open');
  syncSidebar();
  setSearchVisible(true);
  searchInput.focus();
}
function hideSearch() {
  if (currentFilter === 'search') setFilter('all', '', true);
  else {
    searchInput.value = '';
    setSearchVisible(false);
    filterPosts();
  }
  const trigger = mobileLayout.matches ? mobileSearchButton : searchButton.offsetWidth ? searchButton : library.querySelector<HTMLButtonElement>('[data-disclosure-trigger]')!;
  trigger.focus();
}
function setFilter(kind: FilterKind, value = '', updateUrl = false, url = '/blog/') {
  articleRequest++;
  const switched = switchWorkspace(1);
  currentFilter = kind;
  currentValue = value;
  if (updateUrl) {
    libraryUrl = url;
    pushUrl(url);
  }
  updateLibraryLabels();
  document.title = siteTitle();
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
  focusWindow(library, updateUrl && !switched);
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
function syncReaderTitle(reader: HTMLElement) {
  const name = windowTitle(reader);
  reader.querySelectorAll<HTMLElement>('[data-reader-title]').forEach((title) => { title.textContent = name; });
  reader.setAttribute('aria-label', name);
}
const articlePath = (path: string) => path.replace(/\/+$/, '') + '/';
const postPaths = new Set(postRows.map((row) => articlePath(row.querySelector<HTMLAnchorElement>('[data-open-article]')!.pathname)));

async function loadReader(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Unable to load article');
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const article = page.querySelector<HTMLElement>('[data-article-fragment]');
  if (!article) throw new Error('Article not found');
  const outline = page.querySelector<HTMLElement>('[data-article-outline]');
  for (const sheet of page.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')) {
    const href = new URL(sheet.getAttribute('href')!, response.url).href;
    if (![...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((existing) => existing.href === href)) {
      const copy = sheet.cloneNode(true) as HTMLLinkElement;
      copy.href = href;
      document.head.append(copy);
    }
  }

  const reader = readerTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  reader.dataset.articleUrl = path;
  if (outline) reader.querySelector('[data-reader-toc]')!.append(outline);
  reader.querySelector('[data-reader-content]')!.append(article);
  firstWorkspace.append(reader);
  if (!mobileLayout.matches && readers.size) {
    const offset = readers.size % 5 * 24;
    reader.style.left = `${reader.offsetLeft + offset}px`;
    reader.style.top = `${reader.offsetTop + offset}px`;
    fitWindow(reader);
  }
  translateStatic(reader);
  updateDates(reader);
  applyArticleLanguage(reader);
  syncReaderTitle(reader);
  readers.set(path, reader);
  prepareWindow(reader);
  prepareReader(reader);
  dockItemFor(reader);
  return reader;
}
function getReader(path: string) {
  const open = readers.get(path);
  if (open) return Promise.resolve(open);
  let pending = pendingReaders.get(path);
  if (!pending) {
    pending = loadReader(path).finally(() => pendingReaders.delete(path));
    pendingReaders.set(path, pending);
  }
  return pending;
}
function scrollToArticleAnchor(reader: HTMLElement, hash: string) {
  if (!hash) return;
  let name: string;
  try { name = decodeURIComponent(hash.slice(1)); } catch { return; }
  const content = reader.querySelector('[data-article-language]:not([hidden])') ?? reader;
  const target = [...content.querySelectorAll<HTMLElement>('[id]')].find((element) => element.id === name);
  target?.scrollIntoView({ block: 'start' });
}
async function openArticle(url: string, updateUrl = true) {
  const serial = ++articleRequest;
  const requested = new URL(url, location.href);
  const path = articlePath(requested.pathname);
  try {
    const reader = await getReader(path);
    if (serial !== articleRequest) return;
    focusWindow(reader, true);
    if (updateUrl) pushUrl(path + requested.search + requested.hash);
    document.title = pageTitle(reader);
    visibleReaderHeading(reader)?.focus({ preventScroll: true });
    scrollToArticleAnchor(reader, requested.hash);
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
function closeWindow(win: HTMLElement) {
  articleRequest++;
  const wasActive = activeWindow === win;
  if (win === library) libraryRunning = false;
  else {
    const item = dockItems.get(win)!;
    dockItems.delete(win);
    item.inert = true;
    item.setAttribute('data-dock-closing', '');
    const transitions = item.getAnimations();
    void Promise.allSettled(transitions.map((transition) => transition.finished)).then(() => item.remove());
  }
  if (windowKind(win) === 'reader') {
    readerResizeObserver.unobserve(win);
    readers.delete(win.dataset.articleUrl!);
    win.remove();
  } else hideWindow(win);
  if (wasActive) {
    focusNextWindow();
    if (activeWindow) requestWindowFocus(activeWindow);
    else root.focus({ preventScroll: true });
  }
}

function focusNextWindow() {
  const next = [...dockItems.keys()].filter(isVisible)
    .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
  if (next) {
    focusWindow(next);
    history.replaceState(history.state, '', windowRoute(next));
    document.title = pageTitle(next);
  } else {
    activeWindow = null;
    activeTitle.textContent = t('desktop');
    document.title = siteTitle();
  }
}
function syncSidebar() {
  const compact = library.classList.contains('is-compact');
  const open = compact ? library.classList.contains('sidebar-open') : !library.classList.contains('sidebar-hidden');
  sidebar.inert = !open;
  sidebarToggle.setAttribute('aria-expanded', String(open));
}
function updateSidebarMode() {
  const compact = library.clientWidth < 588;
  if (compact !== library.classList.contains('is-compact')) {
    library.classList.toggle('is-compact', compact);
    library.classList.remove('sidebar-open');
  }
  syncSidebar();
}
function setReaderSidebar(reader: HTMLElement, open: boolean) {
  const compact = reader.classList.contains('is-compact');
  reader.classList.toggle('sidebar-open', compact && open);
  reader.classList.toggle('sidebar-hidden', !compact && !open);
  reader.querySelector<HTMLElement>('[data-reader-sidebar]')!.inert = !open;
  reader.querySelector<HTMLButtonElement>('[data-reader-toc-toggle]')!.setAttribute('aria-expanded', String(open));
}
function updateReaderSidebarMode(reader: HTMLElement) {
  if (!reader.clientWidth && !mobileLayout.matches) return;
  const compact = mobileLayout.matches || reader.clientWidth < 588;
  if (compact !== reader.classList.contains('is-compact')) {
    const open = reader.querySelector('[data-reader-toc-toggle]')!.getAttribute('aria-expanded') === 'true';
    reader.classList.toggle('is-compact', compact);
    setReaderSidebar(reader, open);
  }
}
const readerResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) updateReaderSidebarMode(entry.target as HTMLElement);
});
function updateReaderOutline(reader: HTMLElement) {
  const scroll = reader.querySelector<HTMLElement>('[data-reader-content]')!;
  const content = reader.querySelector<HTMLElement>('[data-article-language]:not([hidden])');
  const outline = reader.querySelector<HTMLElement>('[data-toc-language]:not([hidden])');
  if (!content || !outline) return;
  const headings = [...content.querySelectorAll<HTMLElement>('.article-body :is(h1, h2, h3, h4, h5, h6)[id]')];
  const top = scroll.getBoundingClientRect().top + 32;
  let current = headings.filter((item) => item.getBoundingClientRect().top <= top).at(-1);
  if (scroll.scrollHeight > scroll.clientHeight && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1) {
    current = headings.at(-1);
  }
  for (const link of outline.querySelectorAll<HTMLAnchorElement>('[data-reader-toc-link]')) {
    const active = link.dataset.tocSlug === current?.id;
    link.classList.toggle('is-selected', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
function prepareReader(reader: HTMLElement) {
  const number = ++readerNumber;
  const menuId = `reader-actions-${number}`;
  const tocId = `reader-toc-${number}`;
  reader.querySelector('[data-disclosure-trigger]')!.setAttribute('aria-controls', menuId);
  reader.querySelector<HTMLElement>('.window-menu-popover')!.id = menuId;
  reader.querySelector('[data-reader-toc-toggle]')!.setAttribute('aria-controls', tocId);
  reader.querySelector<HTMLElement>('[data-reader-sidebar]')!.id = tocId;
  reader.classList.toggle('is-compact', mobileLayout.matches || reader.clientWidth < 588);
  setReaderSidebar(reader, !mobileLayout.matches);
  const scroll = reader.querySelector<HTMLElement>('[data-reader-content]')!;
  scroll.addEventListener('scroll', () => updateReaderOutline(reader), { passive: true });
  scroll.addEventListener('pointerdown', () => {
    if (reader.classList.contains('is-compact') && reader.classList.contains('sidebar-open')) {
      setReaderSidebar(reader, false);
    }
  });
  readerResizeObserver.observe(reader);
  updateReaderOutline(reader);
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
function flyToWindow(win: HTMLElement, item: HTMLAnchorElement, showing: boolean, update: () => void) {
  if (dock.scrollHeight > dock.clientHeight) item.scrollIntoView({ block: 'nearest' });
  animateDockFlight(win, item.querySelector('img')!, showing, update);
}
function minimizeWindow(win: HTMLElement) {
  const item = dockItems.get(win)!;
  flyToWindow(win, item, false, () => hideWindow(win));
  focusNextWindow();
  item.focus({ preventScroll: true });
}
function requestWindowFocus(win: HTMLElement) {
  const target = windowKind(win) === 'reader' ? visibleReaderHeading(win) : win.querySelector<HTMLElement>('[data-drag-handle]');
  target?.focus({ preventScroll: true });
}
function activateWindow(win: HTMLElement) {
  articleRequest++;
  const switched = switchWorkspace(1);
  focusWindow(win, !switched);
  pushUrl(windowRoute(win));
  document.title = pageTitle(win);
  requestWindowFocus(win);
}
function prepareWindow(win: HTMLElement) {
  win.addEventListener('pointerdown', () => focusWindow(win));
  win.addEventListener('focusin', () => focusWindow(win));
  bindWindowGeometry(win, () => toggleMaximize(win), (resized) => announce(t(resized ? 'windowResized' : 'windowMoved')));
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const close = target.closest<HTMLAnchorElement>('[data-close-window]');
  if (close) { event.preventDefault(); closeWindow(close.closest<HTMLElement>('[data-window]')!); return; }
  const toggleSidebar = target.closest<HTMLButtonElement>('[data-toggle-sidebar]');
  if (toggleSidebar) {
    const name = library.classList.contains('is-compact') ? 'sidebar-open' : 'sidebar-hidden';
    library.classList.toggle(name);
    syncSidebar();
    return;
  }
  const toggleOutline = target.closest<HTMLButtonElement>('[data-reader-toc-toggle]');
  if (toggleOutline) {
    const reader = toggleOutline.closest<HTMLElement>('[data-window="reader"]')!;
    setReaderSidebar(reader, toggleOutline.getAttribute('aria-expanded') !== 'true');
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
    else hideSearch();
    return;
  }
  const copy = target.closest<HTMLElement>('[data-copy-link]');
  if (copy) {
    if (copy.classList.contains('window-menu-extra')) dismissDisclosure(true);
    const reader = copy.closest<HTMLElement>('[data-window]')!;
    navigator.clipboard.writeText(new URL(windowRoute(reader), location.origin).href).then(() => { announce(t('linkCopied')); copy.setAttribute('title', t('linkCopied')); }).catch(() => { announce(t('copyFailed')); });
    return;
  }
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  if (anchor.hasAttribute('data-dock-window')) {
    event.preventDefault();
    const [win] = [...dockItems].find(([, item]) => item === anchor)!;
    if (workspace === 1 && win === activeWindow && isVisible(win)) minimizeWindow(win);
    else activateWindow(win);
    return;
  }
  const inReader = anchor.closest<HTMLElement>('[data-window="reader"]');
  const href = anchor.getAttribute('href')!;
  if (inReader && href.startsWith('#')) {
    event.preventDefault();
    pushUrl(windowRoute(inReader) + href);
    scrollToArticleAnchor(inReader, href);
    if (anchor.hasAttribute('data-reader-toc-link') && inReader.classList.contains('is-compact')) {
      inReader.querySelector<HTMLButtonElement>('[data-reader-toc-toggle]')!.focus({ preventScroll: true });
      setReaderSidebar(inReader, false);
    }
    return;
  }
  if (anchor.hasAttribute('data-open-article') || (anchor.origin === location.origin && postPaths.has(articlePath(anchor.pathname)))) {
    event.preventDefault();
    void openArticle(anchor.href);
    return;
  }
  if (anchor.hasAttribute('data-open-about')) { event.preventDefault(); activateWindow(about); return; }
  if (anchor.hasAttribute('data-open-music')) { event.preventDefault(); activateWindow(music); return; }
  if (anchor.hasAttribute('data-open-library')) {
    event.preventDefault();
    if (mobileLayout.matches && anchor.hasAttribute('data-app-back')) setFilter(currentFilter, currentValue, true, libraryUrl);
    else setFilter('all', '', true, '/blog/');
    return;
  }
  if (anchor.dataset.desktopFilter) {
    event.preventDefault();
    library.classList.remove('sidebar-open');
    syncSidebar();
    setFilter(anchor.dataset.desktopFilter as FilterKind, anchor.dataset.value || '', true, anchor.pathname);
    if (anchor.dataset.desktopFilter === 'search') searchInput.focus();
  }
});
new ResizeObserver(updateSidebarMode).observe(library);
updateSidebarMode();
initDesktopShortcuts(root.querySelector<HTMLElement>('.desktop-icons')!, (label, action) => announce(`${label} ${t(action)}`));
initDisclosures();
workspaceButton.addEventListener('click', () => switchWorkspace(workspace === 1 ? 2 : 1));
workspaceButton.addEventListener('wheel', (event) => {
  if (event.ctrlKey) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  switchWorkspace(delta < 0 ? 1 : 2);
}, { passive: false });
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
  if (event.key === 'Escape' && activeWindow?.dataset.window === 'reader' &&
      activeWindow.classList.contains('is-compact') && activeWindow.classList.contains('sidebar-open')) {
    setReaderSidebar(activeWindow, false);
    activeWindow.querySelector<HTMLButtonElement>('[data-reader-toc-toggle]')!.focus({ preventScroll: true });
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && target === searchInput) {
    event.preventDefault();
    hideSearch();
    return;
  }
  if (event.key === 'Escape' && dock.classList.contains('is-obscured') && dock.classList.contains('is-revealed')) {
    dockHoverSuppressed = true; setDockRevealed(false); dockEdge.focus(); return;
  }
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.matches('input,textarea,[contenteditable="true"]')) {
    event.preventDefault();
    showSearch();
  }
  if (event.key === 'Escape' && !mobileLayout.matches && workspace === 1 && activeWindow && activeWindow !== library && isVisible(activeWindow)) closeWindow(activeWindow);
});
window.addEventListener('popstate', () => {
  switchWorkspace(1);
  const filter = pathFilter();
  const path = location.pathname.replace(/\/+$/, '');
  articleRequest++;
  if (filter) {
    libraryUrl = location.pathname + location.search;
    setFilter(filter.kind, filter.value);
  }
  else if (path === '/about' || path === '/music') {
    const win = path === '/music' ? music : about;
    focusWindow(win);
    document.title = pageTitle(win);
  }
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
  dock.classList.toggle('is-scrollable', dock.scrollHeight > dock.clientHeight);
  const bounds = dockAnchor.getBoundingClientRect();
  const obscured = workspace === 1 && [...dockItems.keys()].some((win) => {
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
const dockWindowObserver = new MutationObserver((records) => {
  if (records.some(({ target }) => (target as HTMLElement).hasAttribute('data-window'))) scheduleDockOverlap();
});
dockWindowObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-visible'] });
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

mobileLayout.addEventListener('change', () => {
  dismissDisclosure();
  if (mobileLayout.matches) switchWorkspace(1);
  syncSidebar();
  for (const reader of readers.values()) {
    updateReaderSidebarMode(reader);
    setReaderSidebar(reader, !mobileLayout.matches);
  }
  if (mobileLayout.matches && (!activeWindow || !isVisible(activeWindow))) {
    const next = [...dockItems.keys()].filter(isVisible).sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0] ?? library;
    focusWindow(next);
    history.replaceState(history.state, '', windowRoute(next));
    document.title = pageTitle(next);
  }
  syncWindowAccess();
});
window.addEventListener('resize', () => {
  if (!mobileLayout.matches) for (const win of dockItems.keys()) fitWindow(win);
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
const listeningWindow = initListeningWindow(music, t);
const spotify = initSpotify(t, mobileLayout, listeningWindow.render);
setInterval(updateClock, 30_000);

function applyLanguage(next: Language) {
  language = next;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  appLanguage.value = language;
  translateStatic();
  document.querySelector<HTMLElement>('[data-language-indicator]')!.textContent = language === 'zh' ? '拼' : 'EN';
  document.querySelectorAll<HTMLButtonElement>('[data-set-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.setLanguage === language)));
  document.querySelectorAll<HTMLElement>('[data-post-title], [data-post-description]').forEach((el) => { el.textContent = el.dataset[language]!; });
  library.setAttribute('aria-label', t('posts'));
  about.setAttribute('aria-label', t('about'));
  updateLibraryLabels();
  for (const reader of readers.values()) {
    applyArticleLanguage(reader);
    syncReaderTitle(reader);
  }
  syncDockApps();
  updateDates();
  filterPosts();
  updateClock();
  updateCalendar(document.documentElement.lang);
  spotify.updateLanguage();
  listeningWindow.updateLabels();
  if (activeWindow && isVisible(activeWindow)) {
    activeTitle.textContent = workspace === 1 ? windowTitle(activeWindow) : t('desktop');
    document.title = workspace === 1 ? pageTitle(activeWindow) : siteTitle();
  } else {
    activeTitle.textContent = t('desktop');
    document.title = siteTitle();
  }
}
function changeLanguage(next: Language) {
  applyLanguage(next);
  try { localStorage.setItem('desktop-language', language); } catch { /* Language remains applied for this page. */ }
}
appLanguage.addEventListener('change', () => changeLanguage(appLanguage.value as Language));
document.querySelectorAll<HTMLButtonElement>('[data-set-language]').forEach((button) => button.addEventListener('click', () => {
  changeLanguage(button.dataset.setLanguage as Language);
  dismissDisclosure(true);
}));
document.querySelectorAll<HTMLButtonElement>('[data-copy-value]').forEach((control) => control.addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const { copyValue, copySuccessZh, copySuccessEn, copyFailureZh, copyFailureEn } = button.dataset;
  const success = language === 'zh' ? copySuccessZh : copySuccessEn;
  const failure = language === 'zh' ? copyFailureZh : copyFailureEn;
  navigator.clipboard.writeText(copyValue!)
    .then(() => announce(success ?? t('copied')))
    .catch(() => announce(failure ?? t('copyValueFailed')));
  dismissDisclosure(true);
}));
function copyArticleLink(reader: HTMLElement, control: HTMLElement) {
  navigator.clipboard.writeText(new URL(windowRoute(reader), location.origin).href)
    .then(() => { announce(t('linkCopied')); control.setAttribute('title', t('linkCopied')); })
    .catch(() => announce(t('copyFailed')));
}
document.querySelector<HTMLButtonElement>('[data-app-copy-link]')!.addEventListener('click', (event) => {
  copyArticleLink(activeWindow!, event.currentTarget as HTMLButtonElement);
  dismissDisclosure(true);
});
document.querySelectorAll<HTMLButtonElement>('[data-quick-action]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.quickAction;
  if (action === 'library') setFilter('all', '', true, '/blog/');
  else if (action === 'about') activateWindow(about);
  else if (workspace === 1) {
    articleRequest++;
    for (const [win, item] of dockItems) {
      if (isVisible(win)) flyToWindow(win, item, false, () => hideWindow(win));
    }
    activeWindow = null;
    activeTitle.textContent = t('desktop');
    document.title = siteTitle();
  }
  dismissDisclosure(true);
}));

prepareWindow(library);
prepareWindow(about);
prepareWindow(music);
dockItemFor(library, dock.querySelector<HTMLAnchorElement>('[data-dock-window="library"]')!);
setFilter(currentFilter, currentValue);
if (initialReader) {
  initialReader.dataset.articleUrl = postPaths.has(articlePath(location.pathname)) ? articlePath(location.pathname) : location.pathname;
  readers.set(initialReader.dataset.articleUrl, initialReader);
  prepareWindow(initialReader);
  prepareReader(initialReader);
  dockItemFor(initialReader, dock.querySelector<HTMLAnchorElement>('[data-dock-window="reader"]')!);
  focusWindow(initialReader);
} else if (initialKind === 'about') {
  dockItemFor(about, dock.querySelector<HTMLAnchorElement>('[data-dock-window="about"]')!);
  focusWindow(about);
} else if (initialKind === 'music') {
  dockItemFor(music, dock.querySelector<HTMLAnchorElement>('[data-dock-window="music"]')!);
  focusWindow(music);
}
applyLanguage(language);
if (initialReader) scrollToArticleAnchor(initialReader, location.hash);
