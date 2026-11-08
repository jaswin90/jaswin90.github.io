/* Foundations of Agentic AI — core reader engine.
 * Classic script (works from file:// too). Provides:
 *   - chapter registry, header/sidebar/TOC, theme
 *   - progress store (localStorage) with a sync hook used by auth.js
 *   - interactive MCQs and interview Q&A with self-rating
 *   - KaTeX rendering
 */
(function () {
  'use strict';

  const CHAPTERS = [
    { id: 'ch01', n: 1, part: 'I', title: 'From Cybernetics to Language Agents', sub: 'Feedback, planning, reinforcement learning and LLMs: the history of agents as a chain of bottlenecks', file: 'chapters/ch01.html', ready: true },
    { id: 'ch02', n: 2, part: 'I', title: 'Agents as Decision Processes', sub: 'POMDPs, the LLM as a policy, context as belief state, compounding error and the reliability arithmetic', file: 'chapters/ch02.html', ready: true },
    { id: 'ch03', n: 3, part: 'I', title: 'The Language Model Inside the Agent', sub: 'Next-token prediction, in-context learning, instruction tuning, sampling, and what a model call costs', file: 'chapters/ch03.html', ready: true },
    { id: 'ch04', n: 4, part: 'I', title: 'Context Engineering', sub: 'System prompts, few-shot examples, structured output, the context window as a budget, prompt caching', file: 'chapters/ch04.html', ready: true },
    { id: 'ch05', n: 5, part: 'II', title: 'Chain of Thought and Test-Time Reasoning', sub: 'CoT, self-consistency, reasoning models, and the scaling of test-time compute', file: 'chapters/ch05.html', ready: true },
    { id: 'ch06', n: 6, part: 'II', title: 'Search and Planning', sub: 'Tree of Thoughts, best-of-n, MCTS and LATS, plan-and-execute, classical planners', file: 'chapters/ch06.html', ready: true },
    { id: 'ch07', n: 7, part: 'II', title: 'Reflection, Critique and Self-Correction', sub: 'Self-Refine, Reflexion, CRITIC, verifiers, and when self-correction fails', file: 'chapters/ch07.html', ready: true },
    { id: 'ch08', n: 8, part: 'III', title: 'Tool Use and Function Calling', sub: 'Toolformer, JSON schemas, constrained decoding, parallel calls, designing tools for models', file: 'chapters/ch08.html', ready: true },
    { id: 'ch09', n: 9, part: 'III', title: 'Retrieval and Knowledge', sub: 'Embeddings, BM25, dense retrieval, reranking, RAG, agentic and graph retrieval', file: 'chapters/ch09.html', ready: true },
    { id: 'ch10', n: 10, part: 'III', title: 'Code as Action', sub: 'CodeAct, sandboxes, SWE-agent, coding agents and SWE-bench', file: 'chapters/ch10.html', ready: true },
    { id: 'ch11', n: 11, part: 'III', title: 'Computer Use and Web Agents', sub: 'Grounding, screenshots vs accessibility trees, WebArena, OSWorld', file: 'chapters/ch11.html', ready: true },
    { id: 'ch12', n: 12, part: 'III', title: 'Protocols and Interoperability', sub: 'The Model Context Protocol, agent-to-agent protocols, authorisation', file: 'chapters/ch12.html', ready: true },
    { id: 'ch13', n: 13, part: 'IV', title: 'Memory Architectures', sub: 'Working, episodic, semantic and procedural memory; MemGPT; generative agents', file: 'chapters/ch13.html', ready: true },
    { id: 'ch14', n: 14, part: 'IV', title: 'Long-Horizon Agents', sub: 'Compaction, sub-agents, checkpoints, and tasks that last hours', file: 'chapters/ch14.html', ready: true },
    { id: 'ch15', n: 15, part: 'V', title: 'Multi-Agent Systems', sub: 'Debate, role-play, orchestrator–worker systems, and when many agents beat one', file: 'chapters/ch15.html', ready: true },
    { id: 'ch16', n: 16, part: 'V', title: 'Agent Architectures and Frameworks', sub: 'Workflows vs agents, the canonical patterns, graphs, durable execution', file: 'chapters/ch16.html', ready: true },
    { id: 'ch17', n: 17, part: 'VI', title: 'Learning from Demonstrations and Preferences', sub: 'Trajectory fine-tuning, RLHF, reward models, DPO', file: 'chapters/ch17.html', ready: true },
    { id: 'ch18', n: 18, part: 'VI', title: 'Reinforcement Learning for Agents', sub: 'Policy gradients, PPO, GRPO, verifiable rewards, multi-turn credit assignment', file: 'chapters/ch18.html', ready: true },
    { id: 'ch19', n: 19, part: 'VII', title: 'Evaluating Agents', sub: 'Benchmarks, pass@k and pass^k, statistics of small evals, LLM judges', file: 'chapters/ch19.html', ready: true },
    { id: 'ch20', n: 20, part: 'VII', title: 'Safety and Security', sub: 'Prompt injection, sandboxing, permissions, capability control, misalignment', file: 'chapters/ch20.html', ready: true },
    { id: 'ch21', n: 21, part: 'VII', title: 'Agents in Production', sub: 'Cost and latency, observability, guardrails, human oversight', file: 'chapters/ch21.html', ready: true },
    { id: 'ch22', n: 22, part: 'VII', title: 'The Agent System Design Interview', sub: 'Worked case studies and rubrics', file: 'chapters/ch22.html', ready: true }
  ];
  const PARTS = { I: 'What Is an Agent?', II: 'Reasoning and Planning', III: 'Acting: Tools and Environments', IV: 'Memory and State', V: 'Many Agents', VI: 'Learning to Act', VII: 'Reliability, Safety and Production' };

  /* ------------------------------------------------------------------ store */
  const KEY = 'aai-progress-v1';
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function blank() { return { v: 1, items: {}, chapters: {}, updatedAt: 0 }; }

  const store = {
    data: blank(),
    listeners: [],
    load() {
      const raw = safeGet(KEY);
      if (raw) { try { const d = JSON.parse(raw); if (d && d.items) this.data = Object.assign(blank(), d); } catch (e) {} }
    },
    save() { this.data.updatedAt = Date.now(); safeSet(KEY, JSON.stringify(this.data)); },
    get(id) { return this.data.items[id]; },
    set(id, rec) {
      rec.ts = Date.now();
      this.data.items[id] = rec; this.save();
      this.emit({ kind: 'item', id, rec });
    },
    del(id) { delete this.data.items[id]; this.save(); this.emit({ kind: 'item', id, rec: null }); },
    chapter(ch) { return this.data.chapters[ch] || {}; },
    setChapter(ch, patch) {
      const c = Object.assign({}, this.data.chapters[ch] || {}, patch, { ts: Date.now() });
      this.data.chapters[ch] = c; this.save();
      this.emit({ kind: 'chapter', id: ch, rec: c });
    },
    onChange(fn) { this.listeners.push(fn); },
    emit(ev) { this.listeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); },
    /* Merge a remote snapshot: newest timestamp wins per record. Returns merged data. */
    merge(remote) {
      if (!remote) return this.data;
      const out = blank();
      ['items', 'chapters'].forEach(k => {
        const a = this.data[k] || {}, b = remote[k] || {};
        new Set([...Object.keys(a), ...Object.keys(b)]).forEach(id => {
          const x = a[id], y = b[id];
          out[k][id] = !x ? y : !y ? x : ((y.ts || 0) > (x.ts || 0) ? y : x);
        });
      });
      this.data = out; this.save();
      this.emit({ kind: 'reload' });
      return out;
    },
    reset() { this.data = blank(); this.save(); this.emit({ kind: 'reload' }); }
  };
  store.load();

  /* ------------------------------------------------------------------ helpers */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  }
  let toastTimer;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  const root = () => document.body.getAttribute('data-root') || './';
  const chapterId = () => document.body.getAttribute('data-chapter');
  function snippet(node, n) { const s = (node.textContent || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ------------------------------------------------------------------ theme */
  function setTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    safeSet('aai-theme', t || '');
  }
  function currentTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* ------------------------------------------------------------------ header */
  function buildHeader() {
    const r = root();
    const bar = el('header', { class: 'topbar' });
    bar.innerHTML =
      '<button class="btn icon-btn" id="toc-toggle" aria-label="Contents">☰</button>' +
      '<a class="brand" href="' + r + 'index.html">Foundations of <span>Agentic AI</span></a>' +
      '<span class="spacer"></span>' +
      '<nav><a href="' + r + 'index.html#contents">Contents</a><a href="' + r + 'notation.html">Notation</a><a href="' + r + 'progress.html">My progress</a><a href="' + r + 'references.html">Bibliography</a></nav>' +
      '<button class="btn icon-btn" id="theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>' +
      '<span id="auth-slot"><button class="btn" id="auth-btn" title="Sign in to sync your progress">Sign in</button></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    $('#theme-btn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
    $('#toc-toggle').addEventListener('click', () => { const s = $('.sidebar'); if (s) s.classList.toggle('open'); });
    $('#auth-btn').addEventListener('click', () => {
      if (window.BookAuth && window.BookAuth.configured) window.BookAuth.signIn();
      else toast('Accounts are not enabled yet. Your progress is saved in this browser; use My progress → Copy sync link to move it to another device.');
    });
  }
  function renderAuth(user, syncing) {
    const slot = $('#auth-slot'); if (!slot) return;
    if (!user) {
      slot.innerHTML = '<button class="btn" id="auth-btn" title="Sign in or create an account to keep your progress on every device">Sign in</button>';
      $('#auth-btn').addEventListener('click', () => window.BookAuth && window.BookAuth.signIn());
      return;
    }
    const name = (user.displayName || user.email || 'Reader').split(' ')[0];
    slot.innerHTML = '<span class="user-chip">' + (user.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + user.photoURL + '">' : '') +
      '<span class="sync-dot ' + (syncing ? 'on' : '') + '" title="' + (syncing ? 'Progress synced to your account' : 'Syncing…') + '"></span>' +
      '<span class="small">' + name.replace(/[<>&]/g, '') + '</span>' +
      '<button class="btn small" id="signout-btn">Sign out</button></span>';
    $('#signout-btn').addEventListener('click', () => window.BookAuth.signOut());
  }

  /* ------------------------------------------------------------------ TOC */
  function slug(s) { return s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  function buildToc() {
    const side = $('.sidebar'), art = $('article'); if (!side || !art) return;
    const hs = $$('h2, h3', art);
    const ol = el('ol');
    hs.forEach(h => {
      if (!h.id) h.id = slug(h.textContent);
      const li = el('li', { class: h.tagName.toLowerCase() });
      const a = el('a', { href: '#' + h.id }); a.textContent = h.textContent;
      a.addEventListener('click', () => side.classList.remove('open'));
      li.appendChild(a); ol.appendChild(li);
    });
    side.appendChild(el('h4', null, 'On this page'));
    side.appendChild(ol);
    if ('IntersectionObserver' in window) {
      const links = new Map($$('a', ol).map(a => [a.getAttribute('href').slice(1), a]));
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { links.forEach(a => a.classList.remove('active')); const a = links.get(e.target.id); if (a) a.classList.add('active'); }
        });
      }, { rootMargin: '-10% 0px -80% 0px' });
      hs.forEach(h => io.observe(h));
    }
  }

  /* ------------------------------------------------------------------ MCQ */
  const mcqs = [];
  function initMcqs() {
    const ch = chapterId();
    const chN = (CHAPTERS.find(c => c.id === ch) || {}).n || '';
    $$('.mcq').forEach((box, i) => {
      const id = box.getAttribute('data-id') || (ch + '-mcq-' + (i + 1));
      box.setAttribute('data-id', id); if (!box.id) box.id = id;
      const lis = $$('ol.opts > li', box);
      const correct = lis.map((li, j) => li.hasAttribute('data-correct') ? j : -1).filter(j => j >= 0);
      const multi = correct.length > 1;
      const qEl = $('.q', box);
      const head = el('div', { class: 'q-head' },
        '<span class="q-num">Q' + chN + '.' + (i + 1) + '</span>' + (box.dataset.topic ? '<span>' + box.dataset.topic + '</span>' : '') + '<span class="q-status"></span>');
      box.insertBefore(head, box.firstChild);
      if (multi) qEl.insertAdjacentHTML('beforeend', ' <span class="multi-hint">(select all that apply)</span>');
      const buttons = lis.map((li, j) => {
        const b = el('button', { type: 'button' }); b.innerHTML = li.innerHTML; li.innerHTML = ''; li.appendChild(b);
        b.addEventListener('click', () => choose(state, j)); return b;
      });
      const actions = el('div', { class: 'q-actions' });
      const checkBtn = el('button', { class: 'btn small primary', type: 'button' }, 'Check answer');
      const retryBtn = el('button', { class: 'btn small', type: 'button' }, 'Try again');
      const meta = el('span');
      if (multi) actions.appendChild(checkBtn);
      actions.appendChild(retryBtn); actions.appendChild(meta);
      const ex = $('.explain', box);
      box.insertBefore(actions, ex);
      const state = { id, box, buttons, correct, multi, sel: new Set(), done: false, head, meta, retryBtn, checkBtn, title: snippet(qEl, 140) };
      retryBtn.style.display = 'none';
      checkBtn.addEventListener('click', () => grade(state));
      retryBtn.addEventListener('click', () => reset(state));
      mcqs.push(state);
      restore(state);
    });
  }
  function choose(s, j) {
    if (s.done) return;
    if (!s.multi) { s.sel = new Set([j]); grade(s); return; }
    if (s.sel.has(j)) s.sel.delete(j); else s.sel.add(j);
    s.buttons.forEach((b, k) => b.classList.toggle('sel', s.sel.has(k)));
  }
  function paint(s, chosen) {
    s.buttons.forEach((b, k) => {
      b.classList.remove('sel', 'right', 'wrong'); b.disabled = true;
      if (s.correct.includes(k)) b.classList.add('right');
      else if (chosen.includes(k)) b.classList.add('wrong');
    });
    s.box.classList.add('answered'); s.done = true; s.retryBtn.style.display = '';
    if (s.multi) s.checkBtn.style.display = 'none';
  }
  function isRight(s, chosen) { return chosen.length === s.correct.length && chosen.every(c => s.correct.includes(c)); }
  function grade(s) {
    const chosen = Array.from(s.sel).sort();
    if (!chosen.length) { toast('Pick at least one option.'); return; }
    const ok = isRight(s, chosen);
    const prev = store.get(s.id) || {};
    const attempts = (prev.attempts || 0) + 1;
    store.set(s.id, { t: 'mcq', ch: chapterId(), chosen, ok, attempts, firstOk: prev.attempts ? !!prev.firstOk : ok, title: s.title });
    paint(s, chosen); status(s);
  }
  function status(s) {
    const r = store.get(s.id); const st = $('.q-status', s.head);
    if (!r) { st.textContent = ''; st.className = 'q-status'; s.meta.textContent = ''; return; }
    st.textContent = r.ok ? '✓ correct' : '✗ incorrect'; st.className = 'q-status ' + (r.ok ? 'ok' : 'no');
    s.meta.textContent = 'Attempts: ' + r.attempts + (r.attempts > 1 ? (r.firstOk ? ' · right first time' : ' · missed first time') : '');
  }
  function reset(s) {
    s.done = false; s.sel = new Set(); s.box.classList.remove('answered'); s.retryBtn.style.display = 'none';
    if (s.multi) s.checkBtn.style.display = '';
    s.buttons.forEach(b => { b.disabled = false; b.classList.remove('sel', 'right', 'wrong'); });
  }
  function restore(s) {
    const r = store.get(s.id);
    reset(s);
    if (r && r.chosen) paint(s, r.chosen);
    status(s);
  }

  /* ------------------------------------------------------------------ Interview Q&A */
  const qas = [];
  function initQas() {
    const ch = chapterId();
    const chN = (CHAPTERS.find(c => c.id === ch) || {}).n || '';
    $$('details.qa').forEach((d, i) => {
      const id = d.getAttribute('data-id') || (ch + '-qa-' + (i + 1));
      d.setAttribute('data-id', id); if (!d.id) d.id = id;
      const sum = $('summary', d);
      const txt = el('span', { class: 'qa-text' });
      Array.from(sum.childNodes).forEach(n => { if (!(n.nodeType === 1 && n.classList.contains('lvl'))) txt.appendChild(n); });
      sum.appendChild(txt);
      sum.insertAdjacentHTML('afterbegin', '<span class="qa-num">I' + chN + '.' + (i + 1) + '</span>');
      const stateEl = el('span', { class: 'qa-state' }); sum.appendChild(stateEl);
      const ans = $('.answer', d) || d;
      const rate = el('div', { class: 'qa-rate' }, '<span>How did you do?</span>');
      const b1 = el('button', { class: 'btn small', type: 'button' }, '✓ I nailed it');
      const b2 = el('button', { class: 'btn small', type: 'button' }, '↻ Review again');
      const b3 = el('button', { class: 'btn small', type: 'button' }, 'Clear');
      rate.append(b1, b2, b3); ans.appendChild(rate);
      const s = { id, d, stateEl, title: snippet(sum, 140) };
      b1.addEventListener('click', () => { store.set(id, { t: 'qa', ch, rating: 'got', title: s.title }); paintQa(s); toast('Marked as mastered'); });
      b2.addEventListener('click', () => { store.set(id, { t: 'qa', ch, rating: 'review', title: s.title }); paintQa(s); toast('Added to your review list'); });
      b3.addEventListener('click', () => { store.del(id); paintQa(s); });
      qas.push(s); paintQa(s);
    });
  }
  function paintQa(s) {
    const r = store.get(s.id);
    s.stateEl.className = 'qa-state' + (r ? (r.rating === 'got' ? ' ok' : ' rev') : '');
    s.stateEl.textContent = r ? (r.rating === 'got' ? '✓ mastered' : '↻ review') : 'reveal answer ▾';
  }

  /* ------------------------------------------------------------------ chapter score + completion */
  function chapterStats(ch) {
    const items = Object.values(store.data.items).filter(r => r && r.ch === ch);
    const m = items.filter(r => r.t === 'mcq'), q = items.filter(r => r.t === 'qa');
    return { mcqDone: m.length, mcqOk: m.filter(r => r.ok).length, qaGot: q.filter(r => r.rating === 'got').length, qaRev: q.filter(r => r.rating === 'review').length };
  }
  function buildScore() {
    const side = $('.sidebar'); const ch = chapterId(); if (!side || !ch) return;
    const box = el('div', { class: 'chapter-score' });
    side.appendChild(box);
    const paintScore = () => {
      const st = chapterStats(ch), tot = mcqs.length || 1;
      box.innerHTML = '<b>Your progress</b><div class="bar"><i style="width:' + Math.round(100 * st.mcqDone / tot) + '%"></i></div>' +
        '<div>MCQs: ' + st.mcqDone + '/' + mcqs.length + ' answered · ' + st.mcqOk + ' correct</div>' +
        '<div>Interview Qs: ' + st.qaGot + ' mastered · ' + st.qaRev + ' to review</div>' +
        '<div class="muted small" id="sync-note">' + (window.BookAuth && window.BookAuth.user ? 'Synced to your Google account' : 'Saved in this browser') + '</div>';
    };
    paintScore();
    store.onChange(paintScore);
    store.setChapter(ch, Object.assign(store.chapter(ch), { totalMcq: mcqs.length, totalQa: qas.length, visited: true }));
  }
  function buildCompletion() {
    const art = $('article'); const ch = chapterId(); if (!art || !ch) return;
    const row = el('div', { class: 'complete-row' });
    const btn = el('button', { class: 'btn', type: 'button' });
    const paintBtn = () => { const done = !!store.chapter(ch).complete; btn.textContent = done ? '✓ Chapter completed' : 'Mark chapter as completed'; btn.className = 'btn' + (done ? ' primary' : ''); };
    btn.addEventListener('click', () => { store.setChapter(ch, { complete: !store.chapter(ch).complete }); paintBtn(); });
    row.appendChild(btn); row.appendChild(el('span', { class: 'muted' }, 'Your answers and ratings are saved automatically.'));
    const nav = $('.chap-nav', art);
    art.insertBefore(row, nav || null);
    paintBtn(); store.onChange(paintBtn);
  }
  function buildChapNav() {
    const art = $('article'); const ch = chapterId(); if (!art || !ch || $('.chap-nav', art)) return;
    const i = CHAPTERS.findIndex(c => c.id === ch); const r = root();
    const nav = el('nav', { class: 'chap-nav' });
    const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
    nav.innerHTML = (prev && prev.ready ? '<a href="' + r + prev.file + '"><small>← Previous</small>' + prev.n + '. ' + prev.title + '</a>' : '<a href="' + r + 'index.html"><small>← Back</small>Contents</a>') +
      (next && next.ready ? '<a class="next" href="' + r + next.file + '"><small>Next →</small>' + next.n + '. ' + next.title + '</a>' : '<a class="next" href="' + r + 'index.html#contents"><small>Coming next</small>' + (next ? next.n + '. ' + next.title : 'Contents') + '</a>');
    art.appendChild(nav);
  }

  /* ------------------------------------------------------------------ math */
  function renderMath(node) {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(node || document.body, {
      delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    buildHeader();
    buildToc();
    initMcqs();
    initQas();
    buildScore();
    buildChapNav();
    buildCompletion();
    renderMath();
    if (window.BookCharts) window.BookCharts.renderAll();
    store.onChange(ev => { if (ev.kind === 'reload') { mcqs.forEach(restore); qas.forEach(paintQa); } });
    document.dispatchEvent(new CustomEvent('book:ready'));
  }
  window.Book = { CHAPTERS, PARTS, store, toast, renderAuth, chapterStats, renderMath, el };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
