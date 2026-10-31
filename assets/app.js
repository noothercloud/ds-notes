'use strict';

/* ==========================================================
 * 数据结构笔记 · 纯前端单页
 * 笔记来源：notes/*.md（唯一事实源），清单：notes/index.json
 * ========================================================== */

const SAMPLE_PREFIX = 'dsnotes:sample:';
const THEME_KEY = 'dsnotes:theme';

const state = {
  notes: [],       // [{ slug, file, title, tags, updated }]
  query: '',
  currentSlug: null,
  api: false,      // serve.py 的写接口是否可用；纯 http.server 下为只读
};

const $ = (sel, root = document) => root.querySelector(sel);

function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/* ---------- localStorage 安全读写（隐私模式可能抛错） ---------- */
function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 忽略 */ }
}

/* ---------- 主题 ---------- */
function initTheme() {
  const stored = safeGet(THEME_KEY);
  const prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (prefersDark ? 'dark' : 'light'));

  $('#theme-btn').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  safeSet(THEME_KEY, theme);
  const light = $('#hljs-light');
  const dark = $('#hljs-dark');
  if (light && dark) {
    light.disabled = theme === 'dark';
    dark.disabled = theme !== 'dark';
  }
}

/* ---------- 文本工具 ---------- */
function splitFrontMatter(text) {
  const meta = {};
  let body = String(text || '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    body = body.slice(m[0].length);
  }
  return { meta, body };
}

function parseTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function firstHeading(text) {
  const m = /^#\s+(.+)$/m.exec(String(text || ''));
  return m ? m[1].trim() : '';
}

function slugify(text) {
  const s = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'note';
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- 剪贴板：优先 Clipboard API，失败退回 execCommand ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 走兜底 */ }

  const ta = make('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function flash(btn, text) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._timer);
  btn._timer = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1400);
}

function toast(message) {
  let box = document.getElementById('toast');
  if (!box) {
    box = make('div', 'toast');
    box.id = 'toast';
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('show'), 2400);
}

/* ---------- 写接口（serve.py）--------- */
async function checkApi() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.ok);
  } catch (e) {
    return false;
  }
}

function updateApiUi() {
  const uploadBtn = $('#upload-btn');
  if (uploadBtn) uploadBtn.hidden = !state.api;
  const modeNote = $('#mode-note');
  if (!modeNote) return;
  if (state.api) {
    modeNote.textContent = '';
  } else if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    modeNote.textContent = '只读模式：运行 python3 serve.py 后可上传、删除。';
  } else {
    modeNote.textContent = '公网只读镜像：修改请在本机的 ds-notes 里进行。';
  }
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList).filter((f) => /\.md$/i.test(f.name));
  if (!files.length) {
    toast('请选择 .md 文件');
    return;
  }

  let done = 0;
  const failed = [];

  for (const file of files) {
    const slug = file.name.replace(/\.md$/i, '');
    if (state.notes.some((n) => n.slug === slug)) {
      if (!confirm(`已存在同名笔记「${slug}」，覆盖吗？`)) continue;
    }
    try {
      const content = await file.text();
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      done++;
    } catch (err) {
      failed.push(`${file.name}：${err.message}`);
    }
  }

  await loadIndex();
  renderNoteList();
  if (done) toast(`已上传 ${done} 篇笔记`);
  if (failed.length) alert('以下文件上传失败：\n' + failed.join('\n'));

  /* 只在首页刷新统计与 hero；不要打断正在编辑的草稿 */
  const hash = location.hash;
  if (!hash || hash === '#/' || hash === '#') route();
}

async function deleteNote(note, title) {
  if (!confirm(`确定删除「${title}」？\n将删除 notes/${note.file}，无法撤销。`)) return;
  try {
    const res = await fetch('/api/notes/' + encodeURIComponent(note.slug), {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    await loadIndex();
    location.hash = '#/';
    await route();
    toast('已删除');
  } catch (err) {
    alert('删除失败：' + err.message);
  }
}

/* ---------- 清单 ---------- */
async function loadIndex() {
  const res = await fetch('notes/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  state.notes = Array.isArray(data) ? data : (data.notes || []);
  state.notes.sort((a, b) => {
    const ua = a.updated || '';
    const ub = b.updated || '';
    if (ua !== ub) return ub.localeCompare(ua);       // 新笔记在前
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh');
  });
}

function renderNoteList() {
  const list = $('#note-list');
  list.innerHTML = '';
  const q = state.query;

  const items = state.notes.filter((n) => {
    if (!q) return true;
    const hay = `${n.title || ''} ${(n.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });

  if (!items.length) {
    list.appendChild(make('p', 'empty',
      state.notes.length ? '没有匹配的笔记' : '还没有笔记，点下方「新建笔记」'));
    return;
  }

  for (const n of items) {
    const a = make('a', 'note-item');
    a.href = '#/note/' + encodeURIComponent(n.slug);
    a.appendChild(make('span', 'note-title', n.title || n.slug));
    if (n.tags && n.tags.length) {
      a.appendChild(make('span', 'note-tags', n.tags.join(' · ')));
    }
    if (n.slug === state.currentSlug) a.classList.add('active');
    list.appendChild(a);
  }
}

/* ---------- 路由 ---------- */
async function route() {
  const raw = location.hash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  state.currentSlug = null;

  $('#sidebar').classList.remove('open');

  if (parts[0] === 'new') {
    renderNoteList();
    return renderEditor(null);
  }
  if (parts[0] === 'note' && parts[1]) {
    state.currentSlug = decodeURIComponent(parts[1]);
    renderNoteList();
    return renderNote(state.currentSlug);
  }
  if (parts[0] === 'edit' && parts[1]) {
    state.currentSlug = decodeURIComponent(parts[1]);
    renderNoteList();
    return renderEditor(state.currentSlug);
  }
  renderNoteList();
  return renderHome();
}

/* ---------- 首页 ---------- */
function homeCard(title, desc, href, external) {
  const a = make('a', 'home-card');
  a.href = href;
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.appendChild(make('h3', null, title));
  a.appendChild(make('p', null, desc));
  return a;
}

function renderHome() {
  const main = $('#main');
  main.innerHTML = '';

  const article = make('article', 'article');

  const hero = make('section', 'hero');
  const heroText = make('div', 'hero-text');
  heroText.appendChild(make('h1', null, '数据结构笔记'));
  heroText.appendChild(make('p', null,
    `共 ${state.notes.length} 篇笔记，全部存为 notes/ 目录下的 .md 文件。`));
  const heroImg = make('img', 'hero-img');
  heroImg.src = 'assets/flowers.jpg';
  heroImg.alt = '白色雏菊';
  hero.append(heroText, heroImg);
  article.appendChild(hero);

  const grid = make('div', 'home-grid');
  grid.appendChild(homeCard('洛谷 · 数据结构题单', '训练题单 #113，新标签页打开', 'https://www.luogu.com.cn/training/113', true));
  grid.appendChild(homeCard('＋ 新建笔记', '在页面里写 Markdown，下载成 .md', '#/new', false));
  grid.appendChild(homeCard('洛谷 IDE', '在线编译调试 C++', 'https://www.luogu.com.cn/ide', true));
  article.appendChild(grid);

  const how = make('section', 'home-how');
  how.appendChild(make('h2', null, '把笔记存进站点'));
  const ol = make('ol');
  [
    '点左侧「↑ 上传 .md」，可一次选多篇（需用 python3 serve.py 启动）。',
    '或点「新建笔记」写 Markdown，下载后放进 notes/ 目录。',
    '上传、删除都会自动重建清单；只有直接在文件夹里改 .md 时，才需要运行 python3 tools/build_index.py。',
    '打开笔记页，右上角「删除笔记」可删除，删除前会二次确认。',
  ].forEach((t) => ol.appendChild(make('li', null, t)));
  how.appendChild(ol);
  article.appendChild(how);

  main.appendChild(article);
}

/* ---------- 笔记页 ---------- */
async function renderNote(slug) {
  const main = $('#main');
  main.innerHTML = '<p class="loading">加载中…</p>';

  const note = state.notes.find((n) => n.slug === slug);
  const fileName = note ? note.file : slug + '.md';

  let raw;
  try {
    const res = await fetch('notes/' + encodeURI(fileName), { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    raw = await res.text();
  } catch (err) {
    main.innerHTML = '';
    main.appendChild(fatalCard(
      `读取 notes/${fileName} 失败`,
      `错误：${err.message}\n\n可能原因：\n1. 文件不存在或改名了 —— 重新运行 python3 tools/build_index.py\n2. 没有通过本地服务打开 —— 见 README.md`
    ));
    return;
  }

  if (!window.marked || !window.DOMPurify) {
    main.innerHTML = '';
    main.appendChild(fatalCard('渲染库未加载', '检查 vendor/ 下的 marked.min.js 与 purify.min.js 是否存在。'));
    return;
  }

  const parsed = splitFrontMatter(raw);
  const meta = parsed.meta;
  let body = parsed.body;
  const title = (note && note.title) || meta.title || firstHeading(body) || slug;

  /* 正文开头的一级标题和页头重复时，去掉那一行 */
  if (firstHeading(body) === title) {
    body = body.replace(/^\s*#\s+.*(?:\r?\n|$)/, '');
  }
  const tags = (note && note.tags && note.tags.length) ? note.tags : parseTags(meta.tags);

  main.innerHTML = '';
  const article = make('article', 'article');

  const header = make('header', 'note-header');
  header.appendChild(make('h1', null, title));

  if (tags.length) {
    const tagRow = make('div', 'tag-row');
    tags.forEach((t) => tagRow.appendChild(make('span', 'tag', t)));
    header.appendChild(tagRow);
  }

  const actions = make('div', 'note-actions');
  const editLink = make('a', 'btn ghost', '编辑此笔记');
  editLink.href = '#/edit/' + encodeURIComponent(slug);
  actions.appendChild(editLink);

  if (state.api && note) {
    const delBtn = make('button', 'btn danger', '删除笔记');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteNote(note, title));
    actions.appendChild(delBtn);
  }
  header.appendChild(actions);
  article.appendChild(header);

  const content = make('div', 'markdown');
  const html = marked.parse(body, { gfm: true });
  content.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  article.appendChild(content);

  main.appendChild(article);
  enhanceCodeBlocks(content, slug);
}

/* ---------- 代码块增强 ---------- */
function textareaWithLabel(labelText, value) {
  const wrap = make('div');
  wrap.appendChild(make('span', 'sample-label', labelText));
  const ta = make('textarea');
  ta.value = value || '';
  ta.spellcheck = false;
  wrap.appendChild(ta);
  return { wrap, textarea: ta };
}

function enhanceCodeBlocks(root, slug) {
  root.querySelectorAll('pre > code').forEach((code, index) => {
    const pre = code.parentElement;
    const langMatch = /language-([\w+#-]+)/.exec(code.className);
    const lang = langMatch ? langMatch[1] : '';

    if (window.hljs) {
      try { hljs.highlightElement(code); } catch (e) { /* 忽略未知语言 */ }
    }

    /* 用一张卡片包住 pre，顶部放工具栏 */
    const card = make('div', 'code-card');
    pre.replaceWith(card);
    const bar = make('div', 'code-bar');
    card.appendChild(bar);
    card.appendChild(pre);

    bar.appendChild(make('span', 'code-lang', lang || 'code'));

    const btnCopy = make('button', 'btn tiny', '复制');
    const btnEdit = make('button', 'btn tiny', '编辑');
    const btnIde = make('button', 'btn tiny accent', '去洛谷 IDE ↗');
    const btnSample = make('button', 'btn tiny', '样例');
    [btnCopy, btnEdit, btnIde, btnSample].forEach((b) => { b.type = 'button'; });
    bar.append(btnCopy, btnEdit, btnIde, btnSample);

    /* 复制当前代码 */
    btnCopy.addEventListener('click', async () => {
      const ok = await copyText(code.textContent || '');
      flash(btnCopy, ok ? '已复制' : '复制失败');
    });

    /* 复制并打开洛谷在线 IDE（需要已登录洛谷） */
    btnIde.addEventListener('click', async () => {
      const ok = await copyText(code.textContent || '');
      window.open('https://www.luogu.com.cn/ide', '_blank', 'noopener');
      if (!ok) flash(btnIde, '已打开，请手动复制');
    });

    /* 就地编辑：编辑期间隐藏高亮版本，完成后重新高亮 */
    let editing = false;
    let editor = null;
    btnEdit.addEventListener('click', () => {
      if (!editing) {
        editing = true;
        pre.style.display = 'none';
        editor = make('textarea', 'code-editor');
        editor.value = code.textContent || '';
        editor.rows = Math.min(24, Math.max(6, editor.value.split('\n').length + 1));
        editor.spellcheck = false;
        card.insertBefore(editor, bar.nextSibling);
        btnEdit.textContent = '完成';
        editor.focus();
      } else {
        editing = false;
        const value = editor.value;
        editor.remove();
        editor = null;
        pre.style.display = '';
        code.textContent = value;
        code.className = lang ? 'language-' + lang : '';
        delete code.dataset.highlighted;
        if (window.hljs) {
          try { hljs.highlightElement(code); } catch (e) { /* 忽略 */ }
        }
        btnEdit.textContent = '编辑';
      }
    });

    /* 样例 / 调试记录：纯文本，只存在本浏览器 */
    const sampleKey = SAMPLE_PREFIX + slug + ':' + index;
    let saved = {};
    try { saved = JSON.parse(safeGet(sampleKey) || '{}') || {}; } catch (e) { saved = {}; }

    const panel = make('div', 'sample-panel');
    panel.hidden = true;
    const grid = make('div', 'sample-grid');
    const inputBox = textareaWithLabel('输入', saved.input || '');
    const outputBox = textareaWithLabel('期望输出', saved.output || '');
    grid.append(inputBox.wrap, outputBox.wrap);
    panel.appendChild(grid);
    panel.appendChild(make('p', 'sample-hint', '仅作文本记录，保存在本浏览器；页面不会运行代码。'));
    card.appendChild(panel);

    btnSample.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      btnSample.classList.toggle('active', !panel.hidden);
    });

    let saveTimer = null;
    const saveSample = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        safeSet(sampleKey, JSON.stringify({
          input: inputBox.textarea.value,
          output: outputBox.textarea.value,
        }));
      }, 200);
    };
    inputBox.textarea.addEventListener('input', saveSample);
    outputBox.textarea.addEventListener('input', saveSample);
  });
}

/* ---------- 编辑器 ---------- */
function textField(form, labelText, value, hint) {
  const wrap = make('label', 'field');
  wrap.appendChild(make('span', 'field-label', labelText));
  const input = make('input');
  input.type = 'text';
  input.value = value || '';
  wrap.appendChild(input);
  if (hint) wrap.appendChild(make('span', 'field-hint', hint));
  form.appendChild(wrap);
  return input;
}

async function renderEditor(slug) {
  let meta = {};
  let body = '';
  let isExisting = false;
  let existingFile = null;

  if (slug) {
    const note = state.notes.find((n) => n.slug === slug);
    existingFile = note ? note.file : slug + '.md';
    try {
      const res = await fetch('notes/' + encodeURI(existingFile), { cache: 'no-cache' });
      if (res.ok) {
        const parsed = splitFrontMatter(await res.text());
        meta = parsed.meta;
        body = parsed.body;
        isExisting = true;
      }
    } catch (e) { /* 当作新建 */ }
  }

  const main = $('#main');
  main.innerHTML = '';

  const article = make('article', 'article');
  article.appendChild(make('h1', 'page-title', isExisting ? '编辑笔记' : '新建笔记'));
  if (isExisting) {
    article.appendChild(make('p', 'lede',
      `正在编辑 notes/${existingFile}。下载后覆盖同名文件即可。`));
  } else {
    article.appendChild(make('p', 'lede',
      '写完点「下载 .md」，把文件放进 notes/ 目录，再运行 tools/build_index.py。'));
  }

  const form = make('form', 'editor-form');
  form.autocomplete = 'off';

  const titleInput = textField(form, '标题', meta.title || '');
  const slugInput = textField(form, '文件名（不含 .md）',
    slug || slugify(meta.title || ''), '建议用英文或拼音；中文也能用，但分享链接时会被编码。');
  const tagsInput = textField(form, '标签（逗号分隔）', meta.tags || '');

  const bodyWrap = make('label', 'field');
  bodyWrap.appendChild(make('span', 'field-label', '正文（Markdown）'));
  const bodyInput = make('textarea', 'body-input');
  bodyInput.value = body.replace(/^\n+/, '');
  bodyInput.spellcheck = false;
  bodyWrap.appendChild(bodyInput);
  form.appendChild(bodyWrap);

  /* 标题变化时自动带出文件名（用户手动改过就不再覆盖） */
  let slugTouched = isExisting;
  slugInput.addEventListener('input', () => { slugTouched = true; });
  titleInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(titleInput.value);
  });

  /* 预览 */
  const previewBox = make('div', 'markdown preview-box');
  previewBox.hidden = true;
  form.appendChild(previewBox);

  const actions = make('div', 'editor-actions');
  const btnPreview = make('button', 'btn ghost', '预览');
  btnPreview.type = 'button';
  const btnDownload = make('button', 'btn accent', '下载 .md');
  btnDownload.type = 'button';
  const btnCancel = make('a', 'btn ghost', '取消');
  btnCancel.href = isExisting ? '#/note/' + encodeURIComponent(slug) : '#/';
  actions.append(btnPreview, btnDownload, btnCancel);
  form.appendChild(actions);

  const status = make('p', 'status');
  status.setAttribute('aria-live', 'polite');
  form.appendChild(status);

  btnPreview.addEventListener('click', () => {
    if (previewBox.hidden) {
      if (!window.marked || !window.DOMPurify) {
        status.textContent = '渲染库未加载，无法预览。';
        return;
      }
      const html = marked.parse(bodyInput.value, { gfm: true });
      previewBox.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      previewBox.hidden = false;
      bodyWrap.hidden = true;
      btnPreview.textContent = '返回编辑';
      btnPreview.classList.add('active');
    } else {
      previewBox.hidden = true;
      bodyWrap.hidden = false;
      btnPreview.textContent = '预览';
      btnPreview.classList.remove('active');
    }
  });

  btnDownload.addEventListener('click', () => {
    const title = titleInput.value.trim() || '未命名笔记';
    const outSlug = slugify(slugInput.value || title);
    const tags = tagsInput.value.trim();

    const fm = ['---', `title: ${title}`];
    if (tags) fm.push(`tags: ${tags}`);
    fm.push(`updated: ${todayISO()}`, '---', '');
    const text = fm.join('\n') + '\n' + bodyInput.value.replace(/^\n+/, '');

    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = make('a');
    a.href = url;
    a.download = outSlug + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    status.textContent =
      `已下载 ${outSlug}.md。${isExisting ? '覆盖 notes/ 里的同名文件，' : '把它放进 notes/ 目录，'}` +
      '然后运行：python3 tools/build_index.py，再刷新页面。';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    btnDownload.click();
  });

  article.appendChild(form);
  main.appendChild(article);
}

/* ---------- 错误卡片 ---------- */
function fatalCard(title, detail) {
  const box = make('div', 'fatal');
  box.appendChild(make('h2', null, title));
  const pre = make('pre', null, detail);
  box.appendChild(pre);
  return box;
}

function showFatal(title, detail) {
  const main = $('#main');
  main.innerHTML = '';
  main.appendChild(fatalCard(title, detail));
}

/* ---------- 启动 ---------- */
async function init() {
  initTheme();

  $('#menu-btn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderNoteList();
  });

  window.addEventListener('hashchange', route);

  /* file:// 下浏览器禁止 fetch 本地 .md，必须起服务 */
  if (location.protocol === 'file:') {
    showFatal('请通过本地服务打开',
      '浏览器不允许 file:// 页面读取本地 .md 文件。\n\n' +
      '在终端运行：\n' +
      '  cd ~/Desktop/ds-notes\n' +
      '  python3 -m http.server 8000\n\n' +
      '然后访问 http://localhost:8000');
    return;
  }

  /* 上传 / 删除依赖 serve.py；普通 http.server 下自动降级为只读 */
  const fileInput = $('#file-input');
  const uploadBtn = $('#upload-btn');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      await uploadFiles(fileInput.files);
      fileInput.value = '';
    });
  }
  state.api = await checkApi();
  updateApiUi();

  try {
    await loadIndex();
  } catch (err) {
    showFatal('读取 notes/index.json 失败',
      `错误：${err.message}\n\n` +
      '请确认 notes/index.json 存在；新增或改名 .md 后运行：\n' +
      '  python3 tools/build_index.py');
    return;
  }

  await route();
}

init();
