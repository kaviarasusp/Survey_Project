/* A4U Survey Builder demo: screens and behaviour. Data comes from Store (XML). */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kids = (el, tag) => (el ? Array.from(el.children).filter((c) => c.tagName === tag) : []);
  const attr = (el, name, dflt = '') => (el && el.hasAttribute(name) ? el.getAttribute(name) : dflt);
  const words = (s) => String(s || '').split(/\s+/).filter(Boolean);
  const todayIso = () => new Date().toISOString().slice(0, 10);

  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 3200);
  }

  // Re-render while keeping keyboard focus and caret where they were.
  function keepFocus(render) {
    const a = document.activeElement;
    const id = a && a.id;
    const sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    render();
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ } }
  }

  // ---------- lookups (reference lists from lookups.xml) ----------
  let LK = null;

  function buildLookups(doc) {
    const root = doc.documentElement;
    const syns = (el) => attr(el, 'synonyms').split('|').map((x) => x.trim()).filter(Boolean);
    const facets = {};
    kids(root, 'facet').forEach((f) => {
      facets[attr(f, 'code')] = kids(f, 'value').map((v) => ({
        code: attr(v, 'code'), label: v.textContent.trim(), synonyms: syns(v),
        industry: attr(v, 'industry'), description: attr(v, 'description'),
        questions: Number(attr(v, 'questions')) || 0, minutes: Number(attr(v, 'minutes')) || 0,
      }));
    });
    const scales = {};
    kids(kids(root, 'scales')[0], 'scale').forEach((s) => {
      scales[attr(s, 'code')] = {
        code: attr(s, 'code'), name: attr(s, 'name'), favourable: Number(attr(s, 'favourable')), locked: attr(s, 'locked') === 'true',
        points: kids(s, 'point').map((p) => ({ value: Number(attr(p, 'value')), label: p.textContent.trim() })),
      };
    });
    return { facets, scales };
  }

  const fv = (facet, code) => (LK.facets[facet] || []).find((v) => v.code === code);
  const label = (facet, code) => (fv(facet, code) ? fv(facet, code).label : code);
  const goalsFor = (industry) => LK.facets.survey_goal.filter((g) => g.industry === industry);
  const dipstickDefault = (code) => (fv('dipstick', code) || {}).questions || 10;

  // ---------- reading the XML data ----------
  function readCustomers() {
    return kids(Store.doc('customers').documentElement, 'customer').map((c) => ({
      id: attr(c, 'id'),
      name: attr(c, 'name'),
      clients: kids(c, 'client').map((cl) => ({ id: attr(cl, 'id'), name: attr(cl, 'name') })),
    }));
  }

  function readQuestions() {
    return kids(Store.doc('questions').documentElement, 'question').map((q) => ({
      id: attr(q, 'id'), status: attr(q, 'status'), type: attr(q, 'type'), scale: attr(q, 'scale'), framework: attr(q, 'framework'),
      industry: attr(q, 'industry'), goal: attr(q, 'goal'), audience: words(attr(q, 'audience')), themes: words(attr(q, 'themes')),
      dipstick: attr(q, 'dipstick', 'standard'), createdAt: attr(q, 'createdAt'), updatedAt: attr(q, 'updatedAt'),
      text: (kids(q, 'text')[0] || { textContent: '' }).textContent.trim(),
      options: kids(q, 'option').map((o) => o.textContent.trim()),
      followUp: kids(q, 'followUp')[0] ? kids(q, 'followUp')[0].textContent.trim() : '',
    }));
  }

  function readSurveys() {
    return kids(Store.doc('surveys').documentElement, 'survey').map((s) => ({
      id: attr(s, 'id'), title: attr(s, 'title'), customer: attr(s, 'customer'),
      industry: attr(s, 'industry'), goal: attr(s, 'goal'), audience: attr(s, 'audience'), dipstick: attr(s, 'dipstick'),
      themes: kids(s, 'theme').map((t) => attr(t, 'code')),
      status: attr(s, 'status', 'draft'), createdAt: attr(s, 'createdAt'), updatedAt: attr(s, 'updatedAt'),
      clients: kids(s, 'client').map((c) => ({ ref: attr(c, 'ref'), name: attr(c, 'name') })),
      questions: kids(s, 'question')
        .sort((a, b) => Number(attr(a, 'position')) - Number(attr(b, 'position')))
        .map((q) => ({
          ref: attr(q, 'ref'), custom: attr(q, 'custom') === 'true',
          type: attr(q, 'type'), scale: attr(q, 'scale'),
          text: (kids(q, 'text')[0] || { textContent: '' }).textContent.trim(),
          options: kids(q, 'option').map((o) => o.textContent.trim()),
        })),
    }));
  }

  // ---------- app state ----------
  const ADMIN = 'admin';
  const App = { tenant: '', workCustomer: '', tab: 'survey' };
  const isAdmin = () => App.tenant === ADMIN;
  // Admin sees every tab; a customer creates and edits its own surveys.
  const allowedTabs = () => (isAdmin() ? ['survey', 'surveys', 'questions', 'data'] : ['survey', 'surveys']);

  const newSurveyForm = () => ({ title: '', industry: '', goal: '', audience: '', themes: [], dipstick: 'standard', count: dipstickDefault('standard'), errors: [] });
  let N = null;                                                                         // New survey form
  const V = { selected: '', draft: null, search: '', type: '', fitOnly: true, clientName: '', custom: null };  // Surveys tab
  const Q = { search: '', industry: '', status: 'active', showForm: false, form: null, confirm: null };       // Question library
  const D = { file: 'surveys', confirmReset: false };                                  // XML data tab

  const customers = () => readCustomers();
  // The customer whose surveys the screens show: the signed-in customer, or the one Admin is working on.
  const currentCustomer = () => customers().find((c) => c.id === (isAdmin() ? App.workCustomer : App.tenant));

  // ---------- question helpers ----------
  // Allowed question types. Rating scales are 5-point or 7-point; NPS always uses the 0–10 scale.
  const QTYPES = [
    { code: 'open_text', label: 'Open ended' }, { code: 'rating', label: 'Rating scale' },
    { code: 'yes_no', label: 'Yes / No' }, { code: 'nps', label: 'NPS (0–10)' },
  ];
  const RATING_SCALES = () => Object.values(LK.scales).filter((s) => !s.locked).map((s) => ({ code: s.code, label: s.name }));
  const DEFAULT_SCALE = 'agree_5';
  const typeLabel = (code) => (QTYPES.find((t) => t.code === code) || {}).label || code;
  const scaleName = (q) => (q.type === 'nps' ? '' : q.type === 'rating' ? (LK.scales[q.scale] || LK.scales[DEFAULT_SCALE]).name : '');
  const formatLine = (q) => [typeLabel(q.type), scaleName(q)].filter(Boolean).join(' · ');

  function seconds(q) {
    switch (q.type) {
      case 'nps': return 45;
      case 'rating': return 15;
      case 'yes_no': return 10;
      case 'open_text': return 60;
      default: return 15;
    }
  }
  const minutes = (list) => Math.max(1, Math.ceil(list.reduce((n, q) => n + seconds(q), 0) / 60));

  function fillTokens(text, customer) {
    const map = { '[PROVIDER]': (customer && customer.name) || 'your provider', '[CLIENT]': 'your organisation', '[LOB]': 'your services' };
    return esc(text).replace(/\[(PROVIDER|CLIENT|LOB)\]/g, (m) => `<span class="token">${esc(map[m])}</span>`);
  }

  const chip = (id, act, value, checked, text, type = 'checkbox', name = '') =>
    `<label class="chip" for="${id}"><input type="${type}" id="${id}"${name ? ` name="${name}"` : ''} data-act="${act}" value="${esc(value)}"${checked ? ' checked' : ''}>${esc(text)}</label>`;
  const optionList = (list, selected, placeholder) =>
    (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '')
    + list.map((v) => `<option value="${esc(v.code)}"${v.code === selected ? ' selected' : ''}>${esc(v.label)}</option>`).join('');

  // Does a library question fit the survey criteria?
  function fits(q, c) {
    return q.status === 'published'
      && q.industry === c.industry
      && (!q.goal || q.goal === c.goal)
      && (!c.audience || q.audience.includes(c.audience))
      && q.themes.some((t) => c.themes.includes(t))
      && (c.dipstick === 'in_depth' || q.dipstick === 'standard');
  }

  // Recommended questions for the criteria: NPS first, the best-scoring questions next, one open question last.
  function recommend(c, count) {
    const pool = readQuestions().filter((q) => fits(q, c));
    const score = (q) => (q.goal ? 3 : 0) + (q.dipstick === 'standard' ? 2 : 0)
      + (q.audience.length === 1 ? 1 : 0) + (q.themes.every((t) => c.themes.includes(t)) ? 1 : 0);
    const nps = pool.filter((q) => q.type === 'nps');
    const open = pool.filter((q) => q.type === 'open_text').sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    const rest = pool.filter((q) => q.type !== 'nps' && q.type !== 'open_text').sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    const n = Math.max(0, count);
    const out = [];
    if (nps.length && n > 0) out.push(nps[0]);
    const keepOpen = open.length && n - out.length >= 3 ? 1 : 0;
    out.push(...rest.slice(0, n - out.length - keepOpen));
    if (keepOpen) out.push(open[0]);
    if (out.length < n) {
      const extra = [...open.slice(keepOpen), ...nps.slice(1)].slice(0, n - out.length);
      out.splice(out.length - keepOpen, 0, ...extra);
    }
    return { pool, picked: out };
  }

  // ======================================================================
  // NEW SURVEY
  // ======================================================================
  function renderSurvey() {
    const el = $('#tab-survey');
    const customer = currentCustomer();
    if (!customer) { el.innerHTML = '<div class="card"><p>No customers yet.</p></div>'; return; }
    const f = N;
    const goals = f.industry ? goalsFor(f.industry) : [];
    const ready = f.industry && f.goal && f.audience && f.themes.length;
    const rec = ready ? recommend(f, f.count) : { pool: [], picked: [] };
    const short = ready && rec.picked.length < f.count;
    const dip = fv('dipstick', f.dipstick);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>New survey</h1><p>Name the survey and choose who it is for. Questions are picked from the library to match; you can edit them after you create the survey and tag clients later.</p></div>
      </div>
      <div class="cols">
        <div class="col-main">
          <div class="card" id="new-survey-card">
            ${f.errors.length ? `<div class="note warn" role="alert" style="margin-bottom:16px"><strong>Fill these in to create the survey:</strong><br>${f.errors.map(esc).join('<br>')}</div>` : ''}
            <div class="field">
              <label class="label" for="ns-title">Survey title <span class="req">*</span></label>
              <input type="text" id="ns-title" data-act="title" value="${esc(f.title)}" maxlength="120" placeholder="e.g. Harbor Mutual · Executive insight · Q4 2026">
            </div>
            <div class="grid">
              <div class="field">
                <label class="label" for="ns-industry">Industry <span class="req">*</span></label>
                <select id="ns-industry" data-act="industry">${optionList(LK.facets.industry, f.industry, 'Choose industry')}</select>
              </div>
              <div class="field">
                <label class="label" for="ns-goal">Goal <span class="req">*</span></label>
                <select id="ns-goal" data-act="goal"${f.industry ? '' : ' disabled'}>${optionList(goals, f.goal, f.industry ? 'Choose goal' : 'Choose an industry first')}</select>
              </div>
            </div>
            <div class="field">
              <span class="label" id="ns-aud-label">Is this for CXO or non-CXO? <span class="req">*</span></span>
              <div class="chips" role="radiogroup" aria-labelledby="ns-aud-label">${LK.facets.audience.map((a) => chip(`ns-aud-${a.code}`, 'audience', a.code, f.audience === a.code, a.label, 'radio', 'ns-audience')).join('')}</div>
              ${f.audience ? `<span class="hint">${esc((fv('audience', f.audience) || {}).description)}</span>` : ''}
            </div>
            <div class="field">
              <span class="label">Themes <span class="req">*</span></span>
              <div class="chips">${LK.facets.theme.map((t) => chip(`ns-theme-${t.code}`, 'theme', t.code, f.themes.includes(t.code), t.label)).join('')}</div>
              <span class="hint">Pick one or both.</span>
            </div>
            <div class="field">
              <span class="label" id="ns-dip-label">Dip Stick</span>
              <div class="cards-pick" role="radiogroup" aria-labelledby="ns-dip-label">
                ${LK.facets.dipstick.map((d) => `
                  <label class="pick" for="ns-dip-${d.code}">
                    <input type="radio" name="ns-dipstick" id="ns-dip-${d.code}" data-act="dipstick" value="${d.code}"${f.dipstick === d.code ? ' checked' : ''}>
                    <strong>${esc(d.label)}</strong><span>${esc(d.description)} · about ${d.questions} questions, ~${d.minutes} min</span>
                  </label>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <aside class="col-side" aria-labelledby="rec-title">
          <div class="card">
            <h2 id="rec-title">Recommended survey</h2>
            <div class="count-row">
              <label class="label" for="ns-count">Number of questions</label>
              <div class="stepper">
                <button type="button" class="icon-btn step" data-act="count-down" aria-label="One question fewer"${f.count <= 1 ? ' disabled' : ''}>−</button>
                <input type="number" id="ns-count" data-act="count" min="1" max="40" value="${f.count}" inputmode="numeric">
                <button type="button" class="icon-btn step" data-act="count-up" aria-label="One question more"${f.count >= 40 ? ' disabled' : ''}>+</button>
              </div>
              <span class="hint">${esc(dip ? dip.label : '')} Dip Stick suggests ${dipstickDefault(f.dipstick)}. Change it as you need.</span>
            </div>
            ${ready ? `
              <div class="stats" style="margin-top:14px">
                <div class="stat"><b>${rec.picked.length}</b><span>questions</span></div>
                <div class="stat"><b>~${minutes(rec.picked)}</b><span>minutes</span></div>
                <div class="stat"><b>${rec.pool.length}</b><span>match</span></div>
              </div>
              ${short ? `<p class="note warn" style="margin-top:12px">Only ${rec.pool.length} library questions match these choices. You can add more questions after you create the survey.</p>` : ''}
              <p class="note" style="margin-top:12px">${esc(label('industry', f.industry))} · ${esc(label('survey_goal', f.goal))} · ${esc(label('audience', f.audience))} · ${esc(f.themes.map((t) => label('theme', t)).join(' + '))} · ${esc(dip.label)}</p>
              <h3 style="margin:16px 0 8px">Questions</h3>
              <div class="qlist">
                ${rec.picked.map((q, i) => `<div class="qitem"><span class="n">${i + 1}</span><span>${fillTokens(q.text, customer)}<span class="meta">${esc(formatLine(q))}</span></span><span></span></div>`).join('') || '<p class="hint">No questions match. Try another theme or the In-depth Dip Stick.</p>'}
              </div>`
            : `<p class="hint" style="margin-top:14px">Choose an industry, goal, audience and at least one theme to see the recommended questions.</p>`}
            <div class="actions">
              <button type="button" class="btn" data-act="reset">Clear</button>
              <button type="button" class="btn primary" id="ns-create" data-act="create">Create survey</button>
            </div>
          </div>
        </aside>
      </div>`;
  }

  async function createSurvey() {
    const f = N;
    const customer = currentCustomer();
    const errs = [];
    if (!f.title.trim()) errs.push('Survey title');
    if (!f.industry) errs.push('Industry');
    if (!f.goal) errs.push('Goal');
    if (!f.audience) errs.push('CXO or non-CXO');
    if (!f.themes.length) errs.push('At least one theme');
    f.errors = errs;
    if (errs.length) { keepFocus(renderSurvey); $('#new-survey-card').scrollIntoView({ block: 'start' }); return; }
    const rec = recommend(f, f.count);
    if (!rec.picked.length) { toast('No library questions match. Try another theme or the In-depth Dip Stick.', true); return; }
    const btn = $('#ns-create'); if (btn) btn.disabled = true;
    const id = Store.newId('srv');
    try {
      await Store.mutate('surveys', (doc) => {
        const s = doc.createElement('survey');
        const set = (k, v) => s.setAttribute(k, v);
        set('id', id); set('title', f.title.trim()); set('customer', customer.id);
        set('industry', f.industry); set('goal', f.goal); set('audience', f.audience); set('dipstick', f.dipstick);
        set('status', 'draft'); set('createdAt', todayIso());
        f.themes.forEach((t) => { const n = doc.createElement('theme'); n.setAttribute('code', t); s.appendChild(n); });
        rec.picked.forEach((q, i) => { const n = doc.createElement('question'); n.setAttribute('ref', q.id); n.setAttribute('position', String(i + 1)); s.appendChild(n); });
        doc.documentElement.appendChild(s);
      });
      N = newSurveyForm();
      Object.assign(V, { selected: id, draft: null, search: '', custom: null, clientName: '' });
      toast('Survey created. Edit its questions, add more, and tag clients when you are ready.');
      renderSurvey(); renderSurveys(); showTab('surveys');
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(`Could not create the survey: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  function onSurveyEvent(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const f = N;
    if (ev.type === 'input') {
      if (act === 'title') f.title = t.value;
      if (act === 'count') {
        const v = Math.round(Number(t.value));
        if (v >= 1 && v <= 40) { f.count = v; keepFocus(renderSurvey); }
      }
      return;
    }
    if (ev.type === 'click') {
      if (act === 'count-down') f.count = Math.max(1, f.count - 1);
      else if (act === 'count-up') f.count = Math.min(40, f.count + 1);
      else if (act === 'reset') N = newSurveyForm();
      else if (act === 'create') { createSurvey(); return; }
      else return;
      keepFocus(renderSurvey);
      return;
    }
    // change events
    switch (act) {
      case 'industry': f.industry = t.value; if (!goalsFor(f.industry).some((g) => g.code === f.goal)) f.goal = ''; break;
      case 'goal': f.goal = t.value; break;
      case 'audience': f.audience = t.value; break;
      case 'theme': f.themes = t.checked ? [...new Set([...f.themes, t.value])] : f.themes.filter((x) => x !== t.value); break;
      case 'dipstick': f.dipstick = t.value; f.count = dipstickDefault(t.value); break;
      case 'count': { const v = Math.min(40, Math.max(1, Math.round(Number(t.value)) || 1)); f.count = v; break; }
      default: return;
    }
    if (f.errors.length) f.errors = [];
    keepFocus(renderSurvey);
  }

  // ======================================================================
  // SURVEYS (list, edit questions, tag clients)
  // ======================================================================
  const draftOf = (sv) => ({
    title: sv.title,
    clients: sv.clients.map((c) => ({ ...c })),
    questions: sv.questions.map((q) => ({ ...q, options: [...q.options] })),
  });
  const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const selectedSurvey = () => {
    const c = currentCustomer();
    return c ? readSurveys().find((s) => s.id === V.selected && s.customer === c.id) : null;
  };

  // A survey question as shown: library wording (or the survey's own wording), type and scale.
  function resolve(item, qmap) {
    if (item.custom) return { ...item, missing: false, retired: false, libText: '' };
    const q = qmap.get(item.ref);
    if (!q) return { ...item, missing: true, type: '', scale: '', options: [], libText: '' };
    return { ...item, type: q.type, scale: q.scale, options: q.options, libText: q.text, text: item.text || q.text, retired: q.status === 'retired' };
  }

  function renderSurveys() {
    const el = $('#tab-surveys');
    const customer = currentCustomer();
    if (!customer) { el.innerHTML = '<div class="card"><p>No customers yet.</p></div>'; return; }
    const all = readSurveys().filter((s) => s.customer === customer.id).reverse();
    if (V.selected && !all.some((s) => s.id === V.selected)) { V.selected = ''; V.draft = null; }
    const sel = all.find((s) => s.id === V.selected);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Surveys</h1><p>Surveys created for <strong>${esc(customer.name)}</strong>. Open one to edit its questions, add more and tag the clients it is for. Saved to <code>surveys.xml</code>.</p></div>
        <button type="button" class="btn primary" data-act="v-new">+ New survey</button>
      </div>
      <div class="cols">
        <div class="col-narrow">
          <div class="card">
            <h2>Surveys</h2>
            <div class="cust-list">
              ${all.map((s) => `<button type="button" class="cust-btn survey-btn" data-act="v-pick" data-id="${esc(s.id)}"${s.id === V.selected ? ' aria-current="true"' : ''}>
                <span class="survey-btn-title">${esc(s.title)}</span>
                <span class="hint">${esc(label('industry', s.industry))} · ${esc(label('survey_goal', s.goal))} · ${s.questions.length} questions</span>
                <span class="hint">${s.clients.length ? `Clients: ${esc(s.clients.map((c) => c.name).join(', '))}` : 'No clients tagged yet'}</span></button>`).join('')
                || '<p class="hint">No surveys yet. Create one on <strong>New survey</strong>.</p>'}
            </div>
          </div>
        </div>
        <div class="col-main">
          ${sel ? surveyDetail(sel, customer) : `<div class="card"><p class="hint">${all.length ? 'Select a survey to edit it.' : 'Created surveys will appear here.'}</p></div>`}
        </div>
      </div>`;
    renderAddResults();
  }

  function surveyDetail(sv, customer) {
    if (!V.draft) V.draft = draftOf(sv);
    const d = V.draft;
    const qmap = new Map(readQuestions().map((q) => [q.id, q]));
    const items = d.questions.map((it) => resolve(it, qmap));
    const dirty = !sameDraft(d, draftOf(sv));
    const known = customer.clients.filter((c) => !d.clients.some((x) => (x.ref && x.ref === c.id) || x.name.toLowerCase() === c.name.toLowerCase()));
    const cf = V.custom;
    return `
      <div class="card">
        <div class="field">
          <label class="label" for="v-title">Survey title</label>
          <input type="text" id="v-title" data-act="v-title" value="${esc(d.title)}" maxlength="120">
        </div>
        <div class="tags" style="margin-top:12px">
          <span class="tag theme">${esc(label('industry', sv.industry))}</span>
          <span class="tag">${esc(label('survey_goal', sv.goal))}</span>
          <span class="tag">${esc(label('audience', sv.audience))}</span>
          ${sv.themes.map((t) => `<span class="tag">${esc(label('theme', t))}</span>`).join('')}
          <span class="tag">Dip Stick: ${esc(label('dipstick', sv.dipstick))}</span>
          <span class="badge grey">${esc(sv.status)}</span>
        </div>

        <div class="field" style="margin-top:20px">
          <span class="label">Clients</span>
          <div class="tags">${d.clients.map((c, i) => `<span class="tag client-tag">${esc(c.name)}<button type="button" class="icon-btn tag-x" data-act="v-untag" data-i="${i}" aria-label="Remove ${esc(c.name)}">×</button></span>`).join('') || '<span class="hint">Not tagged to any client yet.</span>'}</div>
          <div class="inline-add">
            <input type="text" id="v-client" data-act="v-client" list="v-client-list" value="${esc(V.clientName)}" placeholder="Client name" aria-label="Client to tag" autocomplete="off">
            <datalist id="v-client-list">${known.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
            <button type="button" class="btn" data-act="v-tag">Tag client</button>
          </div>
          <span class="hint">Pick one of ${esc(customer.name)}'s clients or type a new name.</span>
        </div>
      </div>

      <div class="card">
        <div class="row-head" style="align-items:flex-start">
          <h2 style="margin:0">Questions</h2>
          <div class="stats" style="flex:none">
            <div class="stat"><b>${items.length}</b><span>questions</span></div>
            <div class="stat"><b>~${minutes(items.filter((q) => q.type))}</b><span>minutes</span></div>
          </div>
        </div>
        <p class="sub" style="margin-top:6px">Edit the wording here; changes apply to this survey only. Reorder with the arrows or remove questions you don't need.</p>
        <div class="qedit-list">
          ${items.map((q, i) => `
            <div class="qedit">
              <span class="n">${i + 1}</span>
              <div class="qedit-body">
                ${q.missing ? `<p class="hint"><em>This question is no longer in the library.</em></p>` : `
                <label class="sr-only" for="vq-${i}">Question ${i + 1} wording</label>
                <textarea id="vq-${i}" data-act="v-qtext" data-i="${i}" rows="2" maxlength="200">${esc(q.text)}</textarea>`}
                <span class="meta">${esc(formatLine(q))}${q.custom ? ' · written for this survey' : ''}${q.retired ? ' · retired in the library' : ''}${!q.custom && q.libText && q.text !== q.libText ? ` · <button type="button" class="btn link inline" data-act="v-qreset" data-i="${i}">Use library wording</button>` : ''}</span>
              </div>
              <span class="q-tools">
                <button type="button" class="icon-btn" id="v-up-${i}" data-act="v-up" data-i="${i}" aria-label="Move question ${i + 1} up"${i === 0 ? ' disabled' : ''}>↑</button>
                <button type="button" class="icon-btn" id="v-down-${i}" data-act="v-down" data-i="${i}" aria-label="Move question ${i + 1} down"${i === items.length - 1 ? ' disabled' : ''}>↓</button>
                <button type="button" class="icon-btn" data-act="v-remove" data-i="${i}" aria-label="Remove question ${i + 1}">×</button>
              </span>
            </div>`).join('') || '<p class="hint">No questions. Add some below.</p>'}
        </div>
        <div class="actions">
          ${dirty ? '<span class="note warn unsaved">Unsaved changes</span>' : ''}
          <button type="button" class="btn" data-act="v-discard"${dirty ? '' : ' disabled'}>Discard changes</button>
          <button type="button" class="btn primary" id="v-save" data-act="v-save"${dirty ? '' : ' disabled'}>Save changes</button>
        </div>
      </div>

      <div class="card">
        <div class="row-head"><h2 style="margin:0">Add questions</h2>
          ${cf ? '' : '<button type="button" class="btn small" data-act="v-custom-open">Write a new question</button>'}</div>
        ${cf ? `
          <div class="custom-box">
            <h3>New question for this survey</h3>
            <div class="field" style="margin-top:10px">
              <label class="label" for="vc-text">Question text</label>
              <textarea id="vc-text" data-act="vc" data-f="text" rows="2" maxlength="200" placeholder="Type the question">${esc(cf.text)}</textarea>
            </div>
            <div class="grid">
              <div class="field"><label class="label" for="vc-type">Question type</label>
                <select id="vc-type" data-act="vc" data-f="type">${optionList(QTYPES.filter((t) => t.code !== 'nps'), cf.type)}</select></div>
              ${cf.type === 'rating' ? `<div class="field"><label class="label" for="vc-scale">Scale</label>
                <select id="vc-scale" data-act="vc" data-f="scale">${optionList(RATING_SCALES(), cf.scale)}</select></div>` : ''}
            </div>
            <div class="actions">
              <button type="button" class="btn" data-act="v-custom-cancel">Cancel</button>
              <button type="button" class="btn primary" data-act="v-custom-add">Add to survey</button>
            </div>
          </div>` : ''}
        <p class="sub" style="margin-top:${cf ? '18px' : '6px'}">Or search the question library. Questions already in the survey are hidden.</p>
        <div class="grid">
          <div class="field"><label class="label" for="v-search">Search</label>
            <input type="search" id="v-search" data-act="v-search" value="${esc(V.search)}" placeholder="Keyword or synonym, e.g. SLA, GenAI, renewal"></div>
          <div class="field"><label class="label" for="v-type">Question type</label>
            <select id="v-type" data-act="v-type">${optionList(QTYPES, V.type, 'All types')}</select></div>
        </div>
        <div class="chips" style="margin-top:10px">${chip('v-fit', 'v-fit', 'fit', V.fitOnly, 'Only questions that fit this survey')}</div>
        <span class="hint">Fits = same industry and goal, suitable for ${esc(label('audience', sv.audience))}, and about ${esc(sv.themes.map((t) => label('theme', t)).join(' or '))}.</span>
        <div id="v-add-results" style="margin-top:14px"></div>
      </div>`;
  }

  function renderAddResults() {
    const box = $('#v-add-results');
    const customer = currentCustomer();
    const sv = selectedSurvey();
    if (!box || !sv || !V.draft) return;
    const inSurvey = new Set(V.draft.questions.filter((q) => !q.custom).map((q) => q.ref));
    const crit = { industry: sv.industry, goal: sv.goal, audience: sv.audience, themes: sv.themes, dipstick: 'in_depth' };
    const pool = readQuestions().filter((q) => q.status === 'published' && !inSurvey.has(q.id)
      && (!V.type || q.type === V.type) && (!V.fitOnly || fits(q, crit)));
    const matches = searchQuestions(pool, V.search);
    const shown = matches.slice(0, 40);
    box.innerHTML = `${searchExplain(V.search)}<p class="hint" style="margin-bottom:10px">${matches.length} question${matches.length === 1 ? '' : 's'} found${matches.length > shown.length ? `, showing the first ${shown.length}` : ''}.</p>
      <div class="list">${shown.map(({ q, reasons }) => `
        <div class="qcard">
          <div style="min-width:0;flex:1"><p>${fillTokens(q.text, customer)}</p>
            <div class="tags">${questionTags(q)}</div>${reasonLine({ reasons })}</div>
          <button type="button" class="btn small" data-act="v-add" data-id="${esc(q.id)}" aria-label="Add question to the survey">+ Add</button>
        </div>`).join('') || `<p class="hint">No questions match.${V.fitOnly ? ' Try turning off “Only questions that fit this survey”.' : ''}</p>`}</div>`;
  }

  async function saveSurveyChanges() {
    const sv = selectedSurvey();
    const d = V.draft;
    if (!sv || !d) return;
    if (!d.title.trim()) { toast('Give the survey a title.', true); return; }
    if (!d.questions.length) { toast('A survey needs at least one question.', true); return; }
    const qmap = new Map(readQuestions().map((q) => [q.id, q]));
    const btn = $('#v-save'); if (btn) btn.disabled = true;
    try {
      await Store.mutate('surveys', (doc) => {
        const s = kids(doc.documentElement, 'survey').find((x) => attr(x, 'id') === sv.id);
        if (!s) throw new Error('This survey was removed by someone else.');
        s.setAttribute('title', d.title.trim());
        s.setAttribute('updatedAt', todayIso());
        [...kids(s, 'client'), ...kids(s, 'question')].forEach((n) => s.removeChild(n));
        d.clients.forEach((c) => {
          const n = doc.createElement('client');
          if (c.ref) n.setAttribute('ref', c.ref);
          n.setAttribute('name', c.name);
          s.appendChild(n);
        });
        d.questions.forEach((q, i) => {
          const n = doc.createElement('question');
          n.setAttribute('position', String(i + 1));
          const addText = (text) => { const t = doc.createElement('text'); t.textContent = text; n.appendChild(t); };
          if (q.custom) {
            n.setAttribute('custom', 'true'); n.setAttribute('type', q.type);
            if (q.scale) n.setAttribute('scale', q.scale);
            addText(q.text.trim());
            q.options.forEach((o) => { const t = doc.createElement('option'); t.textContent = o; n.appendChild(t); });
          } else {
            n.setAttribute('ref', q.ref);
            const lib = qmap.get(q.ref);
            if (q.text && lib && q.text.trim() !== lib.text) addText(q.text.trim());   // survey-specific wording
          }
          s.appendChild(n);
        });
      });
      V.draft = null;
      toast('Survey saved to surveys.xml.');
      keepFocus(renderSurveys);
    } catch (e) {
      toast(`Could not save the survey: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  function tagClient() {
    const customer = currentCustomer();
    const name = V.clientName.trim();
    if (!name) { toast('Type or pick a client name.', true); return; }
    const d = V.draft;
    if (d.clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already tagged.`, true); return; }
    const known = customer.clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    d.clients.push(known ? { ref: known.id, name: known.name } : { ref: '', name });
    V.clientName = '';
    keepFocus(renderSurveys);
    const input = $('#v-client'); if (input) input.focus();
  }

  function addCustomQuestion() {
    const c = V.custom;
    const text = c.text.trim();
    if (text.length < 5) { toast('Write the question (at least 5 characters).', true); return; }
    V.draft.questions.push({ ref: '', custom: true, type: c.type, scale: c.type === 'rating' ? c.scale : '', text, options: [] });
    V.custom = null;
    toast('Question added. Save changes to keep it.');
    keepFocus(renderSurveys);
  }

  function updateDirty() {
    const sv = selectedSurvey();
    if (!sv || !V.draft) return;
    const dirty = !sameDraft(V.draft, draftOf(sv));
    const save = $('#v-save'); const discard = $('[data-act="v-discard"]');
    if (save) save.disabled = !dirty;
    if (discard) discard.disabled = !dirty;
    const actions = save && save.parentElement;
    const note = actions && actions.querySelector('.unsaved');
    if (dirty && !note && actions) actions.insertAdjacentHTML('afterbegin', '<span class="note warn unsaved">Unsaved changes</span>');
    if (!dirty && note) note.remove();
  }

  function onSurveysEvent(ev) {
    const t = ev.target;
    const act = t.dataset && t.dataset.act;
    const d = V.draft;
    if (ev.type === 'input') {
      if (act === 'v-search') { V.search = t.value; renderAddResults(); }
      else if (act === 'v-title' && d) { d.title = t.value; updateDirty(); }
      else if (act === 'v-client') V.clientName = t.value;
      else if (act === 'v-qtext' && d) {
        const item = d.questions[Number(t.dataset.i)];
        const lib = !item.custom && readQuestions().find((q) => q.id === item.ref);
        item.text = lib && t.value.trim() === lib.text ? '' : t.value;   // same as the library = no survey-specific wording
        updateDirty();
      }
      else if (act === 'vc' && V.custom) V.custom[t.dataset.f] = t.value;
      return;
    }
    if (ev.type === 'keydown') {
      if (act === 'v-client' && ev.key === 'Enter') { ev.preventDefault(); tagClient(); }
      return;
    }
    if (ev.type === 'change') {
      if (act === 'v-type') { V.type = t.value; renderAddResults(); }
      else if (act === 'v-fit') { V.fitOnly = t.checked; renderAddResults(); }
      else if (act === 'vc' && V.custom && t.tagName === 'SELECT') { V.custom[t.dataset.f] = t.value; keepFocus(renderSurveys); }
      return;
    }
    if (ev.type !== 'click') return;
    const b = t.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const sv = selectedSurvey();
    const qmap = () => new Map(readQuestions().map((q) => [q.id, q]));
    switch (b.dataset.act) {
      case 'v-new': showTab('survey'); return;
      case 'v-pick':
        if (b.dataset.id !== V.selected) {
          if (V.draft && sv && !sameDraft(V.draft, draftOf(sv))) toast('Unsaved changes to the previous survey were discarded.');
          Object.assign(V, { selected: b.dataset.id, draft: null, custom: null, clientName: '' });
        }
        break;
      case 'v-up': if (d && i > 0) [d.questions[i - 1], d.questions[i]] = [d.questions[i], d.questions[i - 1]]; break;
      case 'v-down': if (d && i < d.questions.length - 1) [d.questions[i + 1], d.questions[i]] = [d.questions[i], d.questions[i + 1]]; break;
      case 'v-remove': if (d) d.questions.splice(i, 1); break;
      case 'v-qreset': { if (!d) return; const q = qmap().get(d.questions[i].ref); d.questions[i].text = q ? '' : d.questions[i].text; break; }
      case 'v-add': {
        if (!d) return;
        const lib = qmap();
        const last = d.questions[d.questions.length - 1];
        const lastQ = last && (last.custom ? last : lib.get(last.ref));
        const item = { ref: b.dataset.id, custom: false, type: '', scale: '', text: '', options: [] };
        // Keep an open-ended question at the end.
        if (lastQ && lastQ.type === 'open_text') d.questions.splice(d.questions.length - 1, 0, item); else d.questions.push(item);
        toast('Question added. Save changes to keep it.');
        break;
      }
      case 'v-tag': tagClient(); return;
      case 'v-untag': if (d) d.clients.splice(i, 1); break;
      case 'v-custom-open': V.custom = { text: '', type: 'rating', scale: DEFAULT_SCALE, options: '' }; keepFocus(renderSurveys); { const el = $('#vc-text'); if (el) el.focus(); } return;
      case 'v-custom-cancel': V.custom = null; break;
      case 'v-custom-add': addCustomQuestion(); return;
      case 'v-discard': V.draft = null; break;
      case 'v-save': saveSurveyChanges(); return;
      default: return;
    }
    keepFocus(renderSurveys);
  }

  // ======================================================================
  // QUESTION SEARCH (shared by the Question library and Add questions)
  // ======================================================================
  // A search term is matched against the question text and the labels and synonyms of
  // industries, goals, audiences, themes and Dip Stick values, so "GenAI" finds AI questions.
  const FACET_NAMES = { industry: 'Industry', survey_goal: 'Goal', audience: 'Audience', theme: 'Theme', dipstick: 'Dip Stick' };
  const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'how', 'we', 'our', 'you', 'your', 'with', 'by', 'it']);
  const norm = (str) => ` ${String(str).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;

  function interpretSearch(search) {
    const qn = norm(search);
    if (!qn.trim()) return [];
    const out = [];
    Object.keys(FACET_NAMES).forEach((facet) => (LK.facets[facet] || []).forEach((v) => {
      const terms = [{ t: norm(v.label), raw: '' }, ...v.synonyms.map((x) => ({ t: norm(x), raw: x }))];
      const hit = terms.find((term) => term.t.trim() && (qn.includes(term.t) || (!STOP.has(qn.trim()) && term.t.includes(qn))
        || (qn.trim().length >= 3 && term.t.trimStart().startsWith(qn.trim()))));
      if (hit) out.push({ facet, code: v.code, label: v.label, via: hit.raw });
    }));
    return out;
  }

  const tagged = (q, facet, code) => ({
    industry: q.industry === code, survey_goal: q.goal === code, audience: q.audience.includes(code),
    theme: q.themes.includes(code), dipstick: q.dipstick === code,
  }[facet]);

  function searchQuestions(questions, search) {
    const qn = norm(search);
    if (!qn.trim()) return questions.map((q) => ({ q, score: 0, reasons: [] }));
    const concepts = interpretSearch(search);
    const ws = qn.trim().split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
    const results = [];
    questions.forEach((q) => {
      let score = 0; const reasons = [];
      const text = norm(q.text);
      if (text.includes(qn)) { score += 6; reasons.push('Question text'); }
      else if (ws.length && ws.every((w) => text.includes(` ${w}`))) { score += 3; reasons.push('Question text'); }
      concepts.forEach((c) => {
        if (tagged(q, c.facet, c.code)) { score += c.facet === 'survey_goal' ? 4 : 2; reasons.push(`${FACET_NAMES[c.facet]}: ${c.label}${c.via ? ` (synonym “${c.via}”)` : ''}`); }
      });
      if (score > 0) results.push({ q, score, reasons });
    });
    return results.sort((a, b) => b.score - a.score || a.q.id.localeCompare(b.q.id));
  }

  function searchExplain(search) {
    const c = interpretSearch(search);
    if (!c.length) return search.trim() ? '<p class="hint search-explain">No match in the reference lists; searching the question text only.</p>' : '';
    return `<div class="search-explain"><span class="hint">“${esc(search.trim())}” also means:</span> ${c.slice(0, 8).map((e) => `<span class="tag soft-tag">${esc(FACET_NAMES[e.facet])}: ${esc(e.label)}</span>`).join('')}</div>`;
  }
  const reasonLine = (r) => (r.reasons.length ? `<span class="match-why">Matched on ${esc([...new Set(r.reasons)].join(' · '))}</span>` : '');

  function questionTags(q) {
    return [
      `<span class="tag theme">${esc(label('industry', q.industry))} · ${esc(q.goal ? label('survey_goal', q.goal) : 'All goals')}</span>`,
      `<span class="tag">${esc(formatLine(q))}</span>`,
      `<span class="tag">${esc(q.audience.map((a) => label('audience', a)).join(' + '))}</span>`,
      `<span class="tag">${esc(q.themes.map((t) => label('theme', t)).join(' + '))}</span>`,
      `<span class="tag">${esc(label('dipstick', q.dipstick))}</span>`,
    ].join('');
  }

  // ======================================================================
  // QUESTION LIBRARY (Admin)
  // ======================================================================
  const newQuestionForm = () => ({
    editId: '', text: '', type: 'rating', scale: DEFAULT_SCALE, options: '',
    industry: '', goal: '', audience: [], themes: [], dipstick: 'standard', errors: [],
  });

  function editQuestionForm(q) {
    return {
      editId: q.id, text: q.text, type: QTYPES.some((t) => t.code === q.type) ? q.type : 'open_text',
      scale: q.type === 'rating' && LK.scales[q.scale] && !LK.scales[q.scale].locked ? q.scale : DEFAULT_SCALE,
      options: q.options.join('\n'), followUp: q.followUp,
      industry: q.industry, goal: q.goal, audience: [...q.audience], themes: [...q.themes], dipstick: q.dipstick || 'standard', errors: [],
    };
  }

  const surveysUsing = (qid) => readSurveys().filter((sv) => sv.questions.some((q) => q.ref === qid));

  const Q_STATUS_FILTERS = [
    { code: 'active', label: 'Published' }, { code: 'retired', label: 'Retired' }, { code: 'all', label: 'All' },
  ];
  const statusFilter = (q) => (Q.status === 'all' ? true : Q.status === 'active' ? q.status !== 'retired' : q.status === Q.status);

  function renderQuestions() {
    const el = $('#tab-questions');
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Question library</h1><p>Add questions and tag where they apply. Search and edit existing questions below. Saved to <code>questions.xml</code>.</p></div>
      </div>
      ${questionForm()}
      <div class="card" id="q-list-card">
        <h2>Search and edit questions</h2>
        <div class="grid" style="margin-bottom:14px">
          <div class="field"><label class="label" for="q-search">Search</label>
            <input type="search" id="q-search" data-act="q-search" value="${esc(Q.search)}" placeholder="Keyword or synonym, e.g. SLA, GenAI, claims, renewal"></div>
          <div class="field"><label class="label" for="q-industry">Industry</label>
            <select id="q-industry" data-act="q-industry">${optionList(LK.facets.industry, Q.industry, 'All industries')}</select></div>
          <div class="field"><label class="label" for="q-status">Status</label>
            <select id="q-status" data-act="q-status">${optionList(Q_STATUS_FILTERS, Q.status)}</select></div>
        </div>
        <p style="margin:-6px 0 12px"><span class="hint">Searches the question text plus the names and synonyms of industries, goals, CXO / non-CXO, themes and Dip Stick.</span></p>
        <div id="q-results"></div>
      </div>`;
    renderQuestionList();
  }

  function renderQuestionList() {
    const box = $('#q-results');
    if (!box) return;
    const all = readQuestions();
    const results = searchQuestions(all.filter((q) => statusFilter(q) && (!Q.industry || q.industry === Q.industry)), Q.search);
    const usage = {};
    readSurveys().forEach((sv) => sv.questions.forEach((q) => { if (q.ref) usage[q.ref] = (usage[q.ref] || 0) + 1; }));
    box.innerHTML = `${searchExplain(Q.search)}<p class="hint" style="margin-bottom:10px">${results.length} of ${all.length} questions</p>
      <div class="list">${results.map((r) => {
        const q = r.q;
        const used = usage[q.id] || 0;
        return `<div class="qcard${q.status === 'retired' ? ' is-retired' : ''}${Q.form && Q.form.editId === q.id ? ' is-editing' : ''}" id="qcard-${esc(q.id)}">
          <div style="min-width:0;flex:1"><p>${esc(q.text)}</p><div class="tags">${questionTags(q)}${q.status === 'retired' ? '<span class="badge retired">Retired</span>' : ''}</div>${reasonLine(r)}
            <span class="match-why">${esc(q.id)} · ${used ? `used in ${used} survey${used === 1 ? '' : 's'}` : 'not used in any survey'}${q.updatedAt ? ` · updated ${esc(q.updatedAt)}` : ''}</span>
            ${questionConfirm(q, used)}</div>
          <div class="q-actions">
            <button type="button" class="btn small" data-act="edit-q" data-id="${esc(q.id)}">Edit</button>
            ${q.status === 'retired'
              ? `<button type="button" class="btn small" data-act="reactivate-q" data-id="${esc(q.id)}">Reactivate</button>`
              : `<button type="button" class="btn small" data-act="ask-q" data-action="retire" data-id="${esc(q.id)}">Retire</button>`}
            <button type="button" class="btn small danger" data-act="ask-q" data-action="delete" data-id="${esc(q.id)}">Delete</button>
          </div></div>`;
      }).join('') || '<p class="hint">No questions match.</p>'}</div>`;
  }

  function questionConfirm(q, used) {
    if (!Q.confirm || Q.confirm.id !== q.id) return '';
    if (Q.confirm.action === 'retire') {
      return `<div class="note warn confirm-box" role="alert"><strong>Retire this question?</strong>
        It stops appearing in recommendations and search for new surveys.${used ? ` The ${used} survey${used === 1 ? '' : 's'} using it keep it.` : ''} You can reactivate it later.
        <div class="actions"><button type="button" class="btn small" data-act="confirm-cancel">Keep it</button>
        <button type="button" class="btn small primary" data-act="confirm-retire" data-id="${esc(q.id)}">Retire question</button></div></div>`;
    }
    if (used) {
      return `<div class="note warn confirm-box" role="alert"><strong>This question can't be deleted.</strong>
        It is used in ${used} survey${used === 1 ? '' : 's'}. Retire it instead, or remove it from ${used === 1 ? 'that survey' : 'those surveys'} first.
        <div class="actions"><button type="button" class="btn small" data-act="confirm-cancel">Close</button>
        ${q.status === 'retired' ? '' : `<button type="button" class="btn small primary" data-act="confirm-retire" data-id="${esc(q.id)}">Retire instead</button>`}</div></div>`;
    }
    return `<div class="note warn confirm-box" role="alert"><strong>Delete this question permanently?</strong>
      It is removed from <code>questions.xml</code>. This can't be undone.
      <div class="actions"><button type="button" class="btn small" data-act="confirm-cancel">Keep it</button>
      <button type="button" class="btn small danger" data-act="confirm-delete" data-id="${esc(q.id)}">Delete question</button></div></div>`;
  }

  async function setQuestionStatus(id, status) {
    try {
      await Store.mutate('questions', (doc) => {
        const q = kids(doc.documentElement, 'question').find((x) => attr(x, 'id') === id);
        if (!q) throw new Error('This question no longer exists.');
        q.setAttribute('status', status);
        q.setAttribute('updatedAt', todayIso());
      });
      Q.confirm = null;
      toast(status === 'retired' ? `${id} retired. It is hidden from new surveys.` : `${id} is published again.`);
      refreshAfterQuestionChange();
    } catch (e) { toast(`Could not update the question: ${e.message}`, true); }
  }

  async function deleteQuestion(id) {
    if (surveysUsing(id).length) { toast('This question is used in a survey. Retire it instead.', true); return; }
    try {
      await Store.mutate('questions', (doc) => {
        const q = kids(doc.documentElement, 'question').find((x) => attr(x, 'id') === id);
        if (!q) throw new Error('This question no longer exists.');
        doc.documentElement.removeChild(q);
      });
      Q.confirm = null;
      if (Q.form && Q.form.editId === id) Q.form = newQuestionForm();
      toast(`${id} deleted from questions.xml.`);
      refreshAfterQuestionChange();
    } catch (e) { toast(`Could not delete the question: ${e.message}`, true); }
  }

  function refreshAfterQuestionChange() {
    keepFocus(renderQuestions);
    renderSurvey();
    renderSurveys();
  }

  function questionForm() {
    const f = Q.form;
    const editing = Boolean(f.editId);
    const usedIn = editing ? surveysUsing(f.editId).length : 0;
    const goals = f.industry ? goalsFor(f.industry) : [];
    return `<div class="card${editing ? ' editing' : ''}" id="q-form-card">
      <div class="row-head"><h2 style="margin:0">${editing ? `Edit question ${esc(f.editId)}` : 'New question'}</h2>
        ${editing ? '<button type="button" class="btn small" data-act="new-q">+ New question instead</button>' : ''}</div>
      ${editing && usedIn ? `<div class="note" style="margin:14px 0 0">Used in <strong>${usedIn} survey${usedIn === 1 ? '' : 's'}</strong>. Surveys that use the library wording will show your changes.</div>` : ''}
      ${f.errors.length ? `<div class="note warn" role="alert" style="margin-top:14px"><strong>Fix these to save:</strong><br>${f.errors.map(esc).join('<br>')}</div>` : ''}
      <div class="cols" style="gap:18px;margin-top:16px">
        <div class="col-main" style="gap:0">
          <div class="field">
            <label class="label" for="qf-text">Question text <span class="req">*</span></label>
            <textarea id="qf-text" data-qf="text" rows="3" maxlength="200" placeholder="e.g. How well does [PROVIDER] keep you informed about risks?">${esc(f.text)}</textarea>
            <div class="row-head"><span class="hint">Type [PROVIDER] where the IT service provider's name should appear.</span><span class="hint" id="qf-count">${f.text.length} / 200</span></div>
          </div>
          <div class="grid">
            <div class="field"><label class="label" for="qf-type">Question type <span class="req">*</span></label>
              <select id="qf-type" data-qf="type">${optionList(QTYPES, f.type)}</select></div>
            ${f.type === 'rating' ? `<div class="field"><label class="label" for="qf-scale">Scale <span class="req">*</span></label>
              <select id="qf-scale" data-qf="scale">${optionList(RATING_SCALES(), f.scale)}</select></div>` : ''}
            ${f.type === 'nps' ? '<div class="field"><span class="label">Scale</span><div class="readonly">0–10 (fixed for NPS)</div></div>' : ''}
          </div>

          <h3 class="form-section">Where this question is used</h3>
          <div class="grid">
            <div class="field"><label class="label" for="qf-industry">Industry <span class="req">*</span></label>
              <select id="qf-industry" data-qf="industry">${optionList(LK.facets.industry, f.industry, 'Choose industry')}</select></div>
            <div class="field"><label class="label" for="qf-goal">Goal</label>
              <select id="qf-goal" data-qf="goal"${f.industry ? '' : ' disabled'}>${f.industry ? `<option value="">All ${esc(label('industry', f.industry))} goals</option>${optionList(goals, f.goal)}` : '<option value="">Choose an industry first</option>'}</select></div>
          </div>
          <div class="field"><span class="label">Is this for CXO or non-CXO? <span class="req">*</span></span>
            <div class="chips">${LK.facets.audience.map((a) => chip(`qf-aud-${a.code}`, 'qf-multi', a.code, f.audience.includes(a.code), a.label).replace('data-act="qf-multi"', 'data-act="qf-multi" data-facet="audience"')).join('')}</div>
            <span class="hint">Pick both if it suits either audience.</span></div>
          <div class="field"><span class="label">Themes <span class="req">*</span></span>
            <div class="chips">${LK.facets.theme.map((t) => chip(`qf-theme-${t.code}`, 'qf-multi', t.code, f.themes.includes(t.code), t.label).replace('data-act="qf-multi"', 'data-act="qf-multi" data-facet="themes"')).join('')}</div></div>
          <div class="field"><span class="label" id="qf-dip-label">Dip Stick</span>
            <div class="cards-pick" role="radiogroup" aria-labelledby="qf-dip-label">
              ${LK.facets.dipstick.map((d) => `<label class="pick" for="qf-dip-${d.code}">
                <input type="radio" name="qf-dipstick" id="qf-dip-${d.code}" data-qf="dipstick" value="${d.code}"${f.dipstick === d.code ? ' checked' : ''}>
                <strong>${esc(d.label)}</strong><span>${d.code === 'standard' ? 'Used in Standard and In-depth surveys' : 'Used only in In-depth surveys'}</span></label>`).join('')}
            </div></div>
        </div>
        <div class="col-narrow">
          <div class="preview" id="qf-preview">${questionPreview()}</div>
        </div>
      </div>
      <div class="actions">
        ${editing ? '<button type="button" class="btn" data-act="cancel-q">Cancel</button>' : '<button type="button" class="btn" data-act="clear-q">Clear</button>'}
        <button type="button" class="btn primary" id="qf-save" data-act="save-q">${editing ? 'Save changes' : 'Add question'}</button>
      </div>
    </div>`;
  }

  function questionPreview() {
    const f = Q.form;
    const scale = LK.scales[f.type === 'nps' ? 'likelihood_11' : f.scale] || LK.scales[DEFAULT_SCALE];
    let answer = '';
    if (f.type === 'rating' || f.type === 'nps') {
      answer = `<div class="scale" style="grid-template-columns:repeat(${scale.points.length}, minmax(0,1fr))">${scale.points.map((p) => `<span><i class="dot"></i>${esc(f.type === 'nps' ? p.value : p.label)}</span>`).join('')}</div>`;
    } else if (f.type === 'yes_no') {
      answer = '<div class="tags" style="margin-top:12px"><span class="tag">Yes</span><span class="tag">No</span></div>';
    } else {
      answer = '<div class="readonly" style="margin-top:12px;min-height:60px"></div>';
    }
    return `<h3 style="margin-bottom:6px">Respondent preview</h3>
      <p class="hint" style="margin-bottom:10px">[PROVIDER] shown as ${esc((currentCustomer() || { name: 'the provider' }).name)}.</p>
      <p style="font-weight:500">${f.text.trim() ? fillTokens(f.text, currentCustomer()) : '<span class="hint">Start typing the question…</span>'}</p>${answer}`;
  }

  function validateQuestion(f) {
    const errs = [];
    if (f.text.trim().length < 5) errs.push('Write the question (at least 5 characters).');
    if (/\[(?!PROVIDER\])[A-Z]+\]/.test(f.text)) errs.push('Only the [PROVIDER] token is supported.');
    if (!f.industry) errs.push('Choose an industry.');
    if (!f.audience.length) errs.push('Choose CXO, non-CXO or both.');
    if (!f.themes.length) errs.push('Choose at least one theme.');
    if (f.type === 'nps' && readQuestions().some((q) => q.id !== f.editId && q.type === 'nps' && q.status === 'published' && q.industry === f.industry)) {
      errs.push(`${label('industry', f.industry)} already has a published NPS question. NPS wording is standard, so reuse that one.`);
    }
    return errs;
  }

  async function saveQuestion() {
    const f = Q.form;
    f.errors = validateQuestion(f);
    if (f.errors.length) { keepFocus(renderQuestions); $('#q-form-card').scrollIntoView({ block: 'start' }); return; }
    const btn = $('#qf-save'); if (btn) btn.disabled = true;
    try {
      await Store.mutate('questions', (doc) => {
        const root = doc.documentElement;
        const existing = f.editId ? kids(root, 'question').find((x) => attr(x, 'id') === f.editId) : null;
        if (f.editId && !existing) throw new Error('This question was deleted by someone else.');
        const nums = kids(root, 'question').map((q) => Number((attr(q, 'id').match(/(\d+)$/) || [0, 0])[1]));
        const id = f.editId || `q-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
        const q = doc.createElement('question');
        const set = (k, v) => q.setAttribute(k, v);
        set('id', id); set('status', existing ? attr(existing, 'status', 'published') : 'published'); set('type', f.type);
        if (f.type === 'rating') set('scale', f.scale);
        if (f.type === 'nps') { set('scale', 'likelihood_11'); set('framework', 'nps'); }
        set('industry', f.industry); set('goal', f.goal); set('audience', f.audience.join(' ')); set('themes', f.themes.join(' ')); set('dipstick', f.dipstick);
        set('createdAt', existing ? attr(existing, 'createdAt') : todayIso());
        if (existing) set('updatedAt', todayIso());
        const add = (tag, attrs, text) => { const n = doc.createElement(tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; q.appendChild(n); };
        add('text', {}, f.text.trim());
        if (f.type === 'nps') add('followUp', { max: '6' }, f.followUp || 'What is the main reason for your score?');
        if (existing) root.replaceChild(q, existing); else root.appendChild(q);
      });
      const edited = f.editId;
      Q.form = newQuestionForm();
      toast(edited ? `${edited} updated in questions.xml.` : 'Question added to questions.xml.');
      refreshAfterQuestionChange();
      if (edited) { const card = $(`#qcard-${edited}`); if (card) card.scrollIntoView({ block: 'center' }); }
    } catch (e) {
      toast(`Could not save the question: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  function onQuestionsEvent(ev) {
    const t = ev.target;
    const f = Q.form;
    if (ev.type === 'input' && t.dataset.act === 'q-search') { Q.search = t.value; renderQuestionList(); return; }
    if (ev.type === 'change' && t.dataset.act === 'q-industry') { Q.industry = t.value; renderQuestionList(); return; }
    if (ev.type === 'change' && t.dataset.act === 'q-status') { Q.status = t.value; Q.confirm = null; renderQuestionList(); return; }
    if ((ev.type === 'input' || ev.type === 'change') && t.dataset.qf) {
      if (t.type === 'radio' && ev.type === 'input') return;
      f[t.dataset.qf] = t.value;
      if (t.dataset.qf === 'text') { $('#qf-count').textContent = `${t.value.length} / 200`; $('#qf-preview').innerHTML = questionPreview(); return; }
      if (ev.type === 'change') {
        if (t.dataset.qf === 'industry' && !goalsFor(f.industry).some((g) => g.code === f.goal)) f.goal = '';
        keepFocus(renderQuestions);
      }
      return;
    }
    if (ev.type === 'change' && t.dataset.act === 'qf-multi') {
      const arr = f[t.dataset.facet];
      f[t.dataset.facet] = t.checked ? [...new Set([...arr, t.value])] : arr.filter((v) => v !== t.value);
      return;
    }
    if (ev.type !== 'click') return;
    const b = t.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'edit-q': {
        const q = readQuestions().find((x) => x.id === b.dataset.id);
        if (!q) return;
        Q.form = editQuestionForm(q); Q.confirm = null;
        renderQuestions();
        $('#q-form-card').scrollIntoView({ block: 'start' }); $('#qf-text').focus({ preventScroll: true });
        return;
      }
      case 'new-q': case 'cancel-q': case 'clear-q': Q.form = newQuestionForm(); renderQuestions(); return;
      case 'ask-q': Q.confirm = { id: b.dataset.id, action: b.dataset.action }; renderQuestionList(); { const btn = $(`#qcard-${b.dataset.id} .confirm-box button`); if (btn) btn.focus(); } return;
      case 'confirm-cancel': Q.confirm = null; renderQuestionList(); return;
      case 'confirm-retire': setQuestionStatus(b.dataset.id, 'retired'); return;
      case 'reactivate-q': setQuestionStatus(b.dataset.id, 'published'); return;
      case 'confirm-delete': deleteQuestion(b.dataset.id); return;
      case 'save-q': saveQuestion(); return;
      default:
    }
  }

  // ======================================================================
  // XML DATA (Admin)
  // ======================================================================
  function renderData() {
    const el = $('#tab-data');
    const where = (name) => (Store.mode === 'shared' ? `Vercel Blob: ${Store.blobPath(name)}` : `This browser (local storage), seeded from data/${name}.xml`);
    const files = [
      { code: 'surveys', label: 'surveys.xml', where: where('surveys') },
      { code: 'questions', label: 'questions.xml', where: where('questions') },
      { code: 'customers', label: 'customers.xml', where: where('customers') },
      { code: 'lookups', label: 'lookups.xml', where: 'data/lookups.xml in the project (read-only reference lists)' },
    ];
    const file = files.find((x) => x.code === D.file) || files[0];
    const doc = file.code === 'lookups' ? Store.lookups() : Store.doc(file.code);
    const xml = Store.serialize(doc);
    el.innerHTML = `
      <div class="page-head">
        <div><h1>XML data</h1><p>The files behind the screens. Every save on the other tabs rewrites one of these.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-act="reload">Reload</button>
          ${D.confirmReset
            ? '<button type="button" class="btn" data-act="reset-cancel">Keep my data</button><button type="button" class="btn danger" data-act="reset-confirm">Yes, reset all demo data</button>'
            : '<button type="button" class="btn danger" data-act="reset-ask">Reset demo data</button>'}
        </div>
      </div>
      <div class="card">
        <div class="grid" style="align-items:end">
          <div class="field"><label class="label" for="dx-file">File</label>
            <select id="dx-file" data-act="file">${optionList(files, file.code)}</select></div>
          <div class="field"><span class="label">Stored in</span><div class="readonly">${esc(file.where)}</div></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin:14px 0">
          <button type="button" class="btn" data-act="download">Download ${esc(file.label)}</button>
          <span class="hint" style="align-self:center">${xml.split('\n').length - 1} lines · ${(new Blob([xml]).size / 1024).toFixed(1)} KB</span>
        </div>
        <pre class="xml" tabindex="0" aria-label="${esc(file.label)} contents">${esc(xml)}</pre>
      </div>`;
  }

  async function onDataEvent(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    if (ev.type === 'change' && t.dataset.act === 'file') { D.file = t.value; renderData(); return; }
    if (ev.type !== 'click') return;
    switch (t.dataset.act) {
      case 'download': {
        const doc = D.file === 'lookups' ? Store.lookups() : Store.doc(D.file);
        const url = URL.createObjectURL(new Blob([Store.serialize(doc)], { type: 'application/xml' }));
        const a = document.createElement('a'); a.href = url; a.download = `${D.file}.xml`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      case 'reload':
        try { await Store.refresh(); renderAll(); toast('Reloaded the latest XML.'); } catch (e) { toast(`Could not reload: ${e.message}`, true); }
        return;
      case 'reset-ask': D.confirmReset = true; renderData(); return;
      case 'reset-cancel': D.confirmReset = false; renderData(); return;
      case 'reset-confirm':
        try {
          await Store.reset();
          D.confirmReset = false;
          resetScreens();
          renderAll(); toast('Demo data reset to the original sample XML.');
        } catch (e) { toast(`Could not reset: ${e.message}`, true); }
        return;
      default:
    }
  }

  // ======================================================================
  // SHELL
  // ======================================================================
  function renderTenant() {
    const sel = $('#tenant-select');
    const list = customers();
    if (!isAdmin() && !list.find((c) => c.id === App.tenant)) App.tenant = ADMIN;
    if (!list.find((c) => c.id === App.workCustomer)) App.workCustomer = list[0] ? list[0].id : '';
    sel.innerHTML = `<option value="${ADMIN}"${isAdmin() ? ' selected' : ''}>Admin (A4U)</option>`
      + `<optgroup label="Customers">${list.map((c) => `<option value="${esc(c.id)}"${c.id === App.tenant ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
    $('#work-customer-wrap').hidden = !isAdmin();
    $('#work-customer').innerHTML = list.map((c) => `<option value="${esc(c.id)}"${c.id === App.workCustomer ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const allowed = allowedTabs();
    document.querySelectorAll('.tabs [role="tab"]').forEach((b) => { b.hidden = !allowed.includes(b.dataset.tab); });
    const badge = $('#storage-badge');
    badge.textContent = Store.mode === 'shared' ? 'Shared XML storage' : 'Saved in this browser';
    badge.className = 'storage-badge' + (Store.mode === 'shared' ? '' : ' local');
    const banner = $('#mode-banner');
    if (Store.mode === 'local') {
      banner.hidden = false;
      banner.innerHTML = 'Changes are saved as XML <strong>in this browser only</strong>. To let others see the same data, connect a Vercel Blob store to the project (see README).';
    } else {
      banner.hidden = true;
    }
  }

  function renderAll() {
    renderTenant();
    renderSurvey();
    renderSurveys();
    if (isAdmin()) { renderQuestions(); renderData(); }
    if (!allowedTabs().includes(App.tab)) showTab('survey');
  }

  function resetScreens() {
    N = newSurveyForm();
    Object.assign(V, { selected: '', draft: null, search: '', custom: null, clientName: '' });
    Q.form = newQuestionForm(); Q.confirm = null;
  }

  function showTab(name) {
    App.tab = name;
    document.querySelectorAll('.tabs [role="tab"]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    ['survey', 'surveys', 'questions', 'data'].forEach((n) => { $(`#tab-${n}`).hidden = n !== name; });
    if (name === 'data') renderData();
  }

  async function start() {
    try {
      await Store.init();
      LK = buildLookups(Store.lookups());
      App.tenant = ADMIN;
      App.workCustomer = (customers()[0] || {}).id || '';
      resetScreens();
      $('#loading').hidden = true;
      renderAll();
      showTab('survey');
    } catch (e) {
      $('#loading').innerHTML = `<div class="note warn"><strong>The demo could not load its XML data.</strong><br>${esc(e.message)}</div>`;
      return;
    }

    const switchUser = () => { resetScreens(); renderAll(); };
    $('#tenant-select').addEventListener('change', (e) => { App.tenant = e.target.value; switchUser(); });
    $('#work-customer').addEventListener('change', (e) => { App.workCustomer = e.target.value; switchUser(); });
    document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
    document.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]')).filter((b) => !b.hidden);
      const i = tabs.findIndex((b) => b.dataset.tab === App.tab);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      showTab(next.dataset.tab); next.focus();
    });
    const sv = $('#tab-survey');
    ['change', 'click', 'input'].forEach((t) => sv.addEventListener(t, onSurveyEvent));
    const vs = $('#tab-surveys');
    ['change', 'click', 'input', 'keydown'].forEach((t) => vs.addEventListener(t, onSurveysEvent));
    const qu = $('#tab-questions');
    ['change', 'click', 'input'].forEach((t) => qu.addEventListener(t, onQuestionsEvent));
    const da = $('#tab-data');
    ['change', 'click'].forEach((t) => da.addEventListener(t, onDataEvent));
  }

  start();
})();
