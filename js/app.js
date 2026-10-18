/* A4U Survey Builder demo: screens and behaviour. Data comes from Store (XML). */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kids = (el, tag) => (el ? Array.from(el.children).filter((c) => c.tagName === tag) : []);
  const attr = (el, name, dflt = '') => (el && el.hasAttribute(name) ? el.getAttribute(name) : dflt);
  const words = (s) => String(s || '').split(/\s+/).filter(Boolean);
  const DAY = 86400000;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    const facets = {};
    kids(root, 'facet').forEach((f) => {
      facets[attr(f, 'code')] = kids(f, 'value').map((v) => ({ code: attr(v, 'code'), label: v.textContent.trim(), el: v }));
    });
    const themes = kids(kids(root, 'themes')[0], 'theme').map((t) => ({
      code: attr(t, 'code'),
      label: attr(t, 'label'),
      subs: kids(t, 'subtheme').map((s) => ({
        code: attr(s, 'code'), label: s.textContent.trim(), theme: attr(t, 'code'),
        synonyms: attr(s, 'synonyms').split('|').filter(Boolean),
      })),
    }));
    const sub = {};
    themes.forEach((t) => t.subs.forEach((s) => { sub[s.code] = s; }));
    const problems = kids(kids(root, 'problems')[0], 'problem').map((p) => ({
      code: attr(p, 'code'), label: attr(p, 'label'),
      links: kids(p, 'link').map((l) => ({ sub: attr(l, 'subtheme'), weight: Number(attr(l, 'weight', '1')) })),
    }));
    const links = kids(kids(root, 'links')[0], 'link').map((l) => ({ type: attr(l, 'type'), from: attr(l, 'from'), to: words(attr(l, 'to')) }));
    const tiers = {};
    kids(kids(root, 'tiers')[0], 'tier').forEach((t) => {
      tiers[attr(t, 'code')] = { code: attr(t, 'code'), label: t.textContent.trim(), length: attr(t, 'length'), roles: words(attr(t, 'roles')) };
    });
    const lengths = kids(kids(root, 'lengths')[0], 'length').map((l) => ({
      code: attr(l, 'code'), label: l.textContent.trim(), minutes: Number(attr(l, 'minutes')), questions: Number(attr(l, 'questions')),
    }));
    const scales = {};
    kids(kids(root, 'scales')[0], 'scale').forEach((s) => {
      scales[attr(s, 'code')] = {
        code: attr(s, 'code'), name: attr(s, 'name'), favourable: Number(attr(s, 'favourable')), locked: attr(s, 'locked') === 'true',
        points: kids(s, 'point').map((p) => ({ value: Number(attr(p, 'value')), label: p.textContent.trim() })),
      };
    });
    return { facets, themes, sub, problems, links, tiers, lengths, scales };
  }

  const fv = (facet, code) => (LK.facets[facet] || []).find((v) => v.code === code);
  const label = (facet, code) => (fv(facet, code) ? fv(facet, code).label : code);
  const vattr = (facet, code, name) => (fv(facet, code) ? attr(fv(facet, code).el, name) : '');
  const short = (facet, code) => vattr(facet, code, 'short') || label(facet, code);
  const linkTo = (type, from) => LK.links.filter((l) => l.type === type && l.from === from).flatMap((l) => l.to);
  const themeLabel = (code) => (LK.themes.find((t) => t.code === code) || {}).label || code;
  const subLabel = (code) => (LK.sub[code] ? `${themeLabel(LK.sub[code].theme)} › ${LK.sub[code].label}` : code);
  const problemLabel = (code) => (LK.problems.find((p) => p.code === code) || {}).label || code;

  // ---------- reading the XML data ----------
  function readCustomers() {
    return kids(Store.doc('customers').documentElement, 'customer').map((c) => ({
      id: attr(c, 'id'),
      name: attr(c, 'name'),
      clients: kids(c, 'client').map((cl) => ({
        id: attr(cl, 'id'), name: attr(cl, 'name'), industry: attr(cl, 'industry'), tier: attr(cl, 'tier'), owner: attr(cl, 'owner'),
        lobs: kids(cl, 'lob').map((l) => ({ id: attr(l, 'id'), name: l.textContent.trim() })),
        engagements: kids(cl, 'engagement').map((e) => ({
          id: attr(e, 'id'), lob: attr(e, 'lob'), model: attr(e, 'model'), workType: attr(e, 'workType'),
          start: attr(e, 'start'), end: attr(e, 'end'), reference: attr(e, 'reference'), description: attr(e, 'description'),
          serviceLines: kids(e, 'serviceLine').map((s) => attr(s, 'code')),
        })),
        contacts: kids(cl, 'contact').map((p) => ({
          id: attr(p, 'id'), name: attr(p, 'name'), email: attr(p, 'email'), role: attr(p, 'role'), lob: attr(p, 'lob'),
        })),
      })),
    }));
  }

  function readQuestions() {
    return kids(Store.doc('questions').documentElement, 'question').map((q) => {
      const tags = {};
      kids(q, 'tag').forEach((t) => { tags[attr(t, 'facet')] = words(attr(t, 'codes')); });
      const fu = kids(q, 'followUp')[0];
      return {
        id: attr(q, 'id'), status: attr(q, 'status'), type: attr(q, 'type'), scale: attr(q, 'scale'), framework: attr(q, 'framework'),
        primary: attr(q, 'primary'), owner: attr(q, 'owner'), benchmark: attr(q, 'benchmark') === 'true', createdAt: attr(q, 'createdAt'),
        text: (kids(q, 'text')[0] || { textContent: '' }).textContent.trim(),
        tags, options: kids(q, 'option').map((o) => o.textContent.trim()),
        followUp: fu ? { max: Number(attr(fu, 'max')), text: fu.textContent.trim() } : null,
      };
    });
  }

  function readSurveys() {
    return kids(Store.doc('surveys').documentElement, 'survey').map((s) => ({
      id: attr(s, 'id'), title: attr(s, 'title'), customer: attr(s, 'customer'), client: attr(s, 'client'), goal: attr(s, 'goal'),
      stage: attr(s, 'stage'), length: attr(s, 'length'), createdAt: attr(s, 'createdAt'), status: attr(s, 'status'),
      questions: kids(s, 'question').length, recipients: kids(s, 'recipient').length,
    }));
  }

  // ---------- lifecycle stage from engagement dates ----------
  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseDate(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  function stageOf(e) {
    const t = today(); const s = parseDate(e.start); const end = parseDate(e.end);
    const transitionDays = Number(vattr('lifecycle_stage', 'transition', 'durationDays')) || 90;
    const renewalDays = Number(vattr('lifecycle_stage', 'pre_renewal', 'startsDaysBeforeEnd')) || 180;
    if (t < s) return 'pre_sales';
    if (t > end) return 'exit';
    if (t >= new Date(end.getTime() - renewalDays * DAY)) return 'pre_renewal';
    if (t < new Date(s.getTime() + transitionDays * DAY)) return 'transition';
    return 'steady_state';
  }
  const stagePriority = (code) => Number(vattr('lifecycle_stage', code, 'priority')) || 0;
  const fmtMonth = (s) => (s ? parseDate(s).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');
  function engLabel(client, e) {
    const lob = (client.lobs.find((l) => l.id === e.lob) || {}).name || 'Unassigned';
    return `${lob} · ${short('engagement_model', e.model)} · ${short('work_type', e.workType)}`;
  }
  function stageBadge(code) {
    const cls = code === 'pre_renewal' ? 'badge' : code === 'exit' ? 'badge warn' : 'badge grey';
    return `<span class="${cls}">${esc(label('lifecycle_stage', code))}</span>`;
  }

  // ---------- app state ----------
  const App = { tenant: '', tab: 'survey' };
  let S = { clientId: '' };          // survey being built
  const C = { selected: '', showForm: false, form: null, confirmReset: false }; // customers tab
  const Q = { search: '', theme: '', showForm: false, form: null };           // question library
  const D = { file: 'customers', confirmReset: false };                        // XML data tab

  const customers = () => readCustomers();
  const currentCustomer = () => customers().find((c) => c.id === App.tenant);

  // ======================================================================
  // NEW SURVEY
  // ======================================================================
  function newSurveyState(client) {
    if (!client) return { clientId: '' };
    const active = client.engagements.filter((e) => stageOf(e) !== 'exit');
    const st = {
      clientId: client.id,
      title: '',
      engagementIds: new Set((active.length ? active : client.engagements).map((e) => e.id)),
      stage: 'steady_state', stageEdited: false, goal: '', problems: new Set(), themes: new Set(),
      includeNps: true, roles: new Set(), contacts: new Set(),
      length: (LK.tiers[client.tier] || {}).length || 'standard',
      removed: new Set(),
    };
    deriveStage(st, client);
    applyGoal(st, linkTo('stage_suggests_goal', st.stage)[0] || 'relationship_health', client);
    st.title = `${client.name} · ${label('survey_goal', st.goal)} · ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    return st;
  }

  function deriveStage(st, client) {
    if (st.stageEdited) return;
    const stages = client.engagements.filter((e) => st.engagementIds.has(e.id)).map(stageOf);
    stages.sort((a, b) => stagePriority(b) - stagePriority(a));
    st.stage = stages[0] || 'steady_state';
  }

  function problemThemes(st) {
    const out = new Set();
    st.problems.forEach((code) => {
      const p = LK.problems.find((x) => x.code === code);
      if (p) p.links.filter((l) => l.weight >= 2).forEach((l) => { if (LK.sub[l.sub]) out.add(LK.sub[l.sub].theme); });
    });
    return out;
  }

  function applyGoal(st, goal, client) {
    st.goal = goal;
    st.themes = new Set(linkTo('goal_suggests_theme', goal));
    problemThemes(st).forEach((t) => st.themes.add(t));
    st.includeNps = vattr('survey_goal', goal, 'includeNps') === 'true';
    st.roles = new Set((LK.tiers[client.tier] || {}).roles || []);
    linkTo('goal_suggests_role', goal).forEach((r) => st.roles.add(r));
    syncContacts(st, client);
    st.removed = new Set();
  }

  function scopeLobs(st, client) {
    return new Set(client.engagements.filter((e) => st.engagementIds.has(e.id)).map((e) => e.lob));
  }
  const inScope = (contact, lobs) => !contact.lob || lobs.has(contact.lob);
  function syncContacts(st, client) {
    const lobs = scopeLobs(st, client);
    st.contacts = new Set(client.contacts.filter((c) => inScope(c, lobs) && st.roles.has(c.role)).map((c) => c.id));
  }

  function surveyContext(st, client, customer) {
    const engs = client.engagements.filter((e) => st.engagementIds.has(e.id));
    const lobIds = [...new Set(engs.map((e) => e.lob))];
    const lobNames = lobIds.map((id) => (client.lobs.find((l) => l.id === id) || {}).name).filter(Boolean);
    return {
      customer, client, engs,
      industry: client.industry, tier: client.tier,
      models: [...new Set(engs.map((e) => e.model))],
      workTypes: [...new Set(engs.map((e) => e.workType))],
      serviceLines: [...new Set(engs.flatMap((e) => e.serviceLines))],
      lobNames, lobToken: lobNames.length === 1 ? lobNames[0] : 'your services',
      stage: st.stage, goal: st.goal, themes: st.themes, problems: st.problems, roles: st.roles,
      includeNps: st.includeNps, length: st.length,
    };
  }

  // Pick questions for the survey from the library.
  function recommend(ctx, questions, removed) {
    const target = (LK.lengths.find((l) => l.code === ctx.length) || {}).questions || 14;
    const concernWeight = {};
    ctx.problems.forEach((code) => {
      const p = LK.problems.find((x) => x.code === code);
      if (p) p.links.forEach((l) => { concernWeight[l.sub] = Math.max(concernWeight[l.sub] || 0, l.weight); });
    });
    const fits = (q, facet, values) => { const t = q.tags[facet]; return !t || !t.length || t.some((v) => values.includes(v)); };
    const pool = questions.filter((q) => q.status === 'published'
      && (!q.owner || q.owner === ctx.customer.id)
      && fits(q, 'survey_goal', [ctx.goal])
      && fits(q, 'respondent_role', [...ctx.roles])
      && fits(q, 'industry', [ctx.industry])
      && fits(q, 'engagement_model', ctx.models)
      && fits(q, 'work_type', ctx.workTypes)
      && fits(q, 'lifecycle_stage', [ctx.stage])
      && fits(q, 'service_line', ctx.serviceLines));

    const picked = [];
    const nps = pool.find((q) => q.framework === 'nps');
    if (ctx.includeNps && nps) picked.push({ q: nps, why: 'NPS' });
    const openQ = pool.find((q) => q.type === 'open_text');

    const scored = pool.filter((q) => q.framework !== 'nps' && q.type !== 'open_text').map((q) => {
      const theme = LK.sub[q.primary] ? LK.sub[q.primary].theme : '';
      let score = 0;
      if (ctx.themes.has(theme)) score += 3;
      const cw = concernWeight[q.primary] || 0;
      score += cw * 2;
      if (q.tags.survey_goal && q.tags.survey_goal.includes(ctx.goal)) score += 1;
      // Written for this exact situation (industry, engagement model or stage): keep even outside the focus themes.
      const specific = ['industry', 'engagement_model', 'lifecycle_stage'].some((f) => q.tags[f] && q.tags[f].length);
      if (specific) score += 2;
      return { q, theme, score, concern: cw > 0, specific };
    }).filter((x) => ctx.themes.has(x.theme) || x.concern || x.specific);
    scored.sort((a, b) => b.score - a.score || a.q.id.localeCompare(b.q.id));

    // Round-robin across themes so one theme does not crowd out the rest.
    const byTheme = new Map();
    scored.forEach((x) => { if (!byTheme.has(x.theme)) byTheme.set(x.theme, []); byTheme.get(x.theme).push(x); });
    const slots = Math.max(0, target - picked.length - (openQ ? 1 : 0));
    const chosen = [];
    while (chosen.length < slots && [...byTheme.values()].some((a) => a.length)) {
      for (const arr of byTheme.values()) if (arr.length && chosen.length < slots) chosen.push(arr.shift());
    }
    chosen.forEach((x) => picked.push({ q: x.q, why: x.concern ? 'Concern' : x.specific ? 'Context' : '' }));
    if (openQ) picked.push({ q: openQ, why: 'Open' });
    return { list: picked.filter((p) => !removed.has(p.q.id)), removedCount: picked.filter((p) => removed.has(p.q.id)).length };
  }

  function seconds(q) {
    switch (q.type) {
      case 'nps': return 45;
      case 'rating': return q.followUp ? 20 : 15;
      case 'yes_no': return 10;
      case 'multiple_choice': return 20;
      case 'ranking': return 30;
      case 'open_text': return 60;
      default: return 15;
    }
  }

  function fillTokens(text, ctx) {
    const map = { '[PROVIDER]': ctx.customer.name, '[CLIENT]': ctx.client.name, '[LOB]': ctx.lobToken };
    return esc(text).replace(/\[(PROVIDER|CLIENT|LOB)\]/g, (m) => `<span class="token">${esc(map[m])}</span>`);
  }

  const chip = (id, act, value, checked, text, extra = '', disabled = false) =>
    `<label class="chip" for="${id}"><input type="checkbox" id="${id}" data-act="${act}" value="${esc(value)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>${esc(text)}${extra}</label>`;
  const optionList = (list, selected, placeholder) =>
    (placeholder ? `<option value="">${esc(placeholder)}</option>` : '')
    + list.map((v) => `<option value="${esc(v.code)}"${v.code === selected ? ' selected' : ''}>${esc(v.label)}</option>`).join('');

  function renderSurvey() {
    const el = $('#tab-survey');
    const customer = currentCustomer();
    if (!customer) {
      el.innerHTML = `<div class="card"><p>No customers yet. Add one under <strong>Customers &amp; clients</strong>.</p></div>`;
      return;
    }
    const client = customer.clients.find((c) => c.id === S.clientId);
    const head = `
      <div class="page-head">
        <div><h1>New survey</h1><p>Pick a client and engagements; the rest is pre-filled from <code>customers.xml</code> and <code>lookups.xml</code>.</p></div>
      </div>`;

    const clientSelect = `
      <div class="field">
        <label class="label" for="sv-client">Client <span class="req">*</span></label>
        <select id="sv-client" data-act="client">${optionList(customer.clients.map((c) => ({ code: c.id, label: c.name })), S.clientId, customer.clients.length ? 'Choose a client' : 'No clients yet')}</select>
        <span class="hint">Only ${esc(customer.name)}'s clients are listed.</span>
      </div>`;

    if (!client) {
      el.innerHTML = `${head}<div class="cols"><div class="col-main"><div class="card"><h2>1. Who is this survey for?</h2>${clientSelect}
        ${customer.clients.length ? '' : '<p class="note" style="margin-top:14px">This customer has no clients yet. Add one under Customers &amp; clients.</p>'}</div>
        ${savedSurveysCard(customer)}</div></div>`;
      return;
    }

    const ctx = surveyContext(S, client, customer);
    const questions = readQuestions();
    const rec = recommend(ctx, questions, S.removed);
    const lobs = scopeLobs(S, client);
    const suggestedGoal = linkTo('stage_suggests_goal', S.stage)[0];
    const goalProblems = linkTo('goal_suggests_problem', S.goal);
    const orderedProblems = [...LK.problems].sort((a, b) => {
      const ia = goalProblems.indexOf(a.code); const ib = goalProblems.indexOf(b.code);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const invites = S.contacts.size;
    const totalSec = rec.list.reduce((n, p) => n + seconds(p.q), 0);
    const byTheme = {};
    rec.list.forEach((p) => {
      const t = p.q.framework === 'nps' ? 'NPS + follow-up' : p.q.type === 'open_text' ? 'Open-ended' : themeLabel((LK.sub[p.q.primary] || {}).theme);
      byTheme[t] = (byTheme[t] || 0) + 1;
    });
    const execCap = S.roles.has('executive_sponsor') && rec.list.length > 10;

    el.innerHTML = `${head}
    <div class="cols">
      <div class="col-main">
        <div class="card">
          <h2>1. Who is this survey for?</h2>
          ${clientSelect}
          <div class="field">
            <label class="label" for="sv-title">Survey title <span class="req">*</span></label>
            <input type="text" id="sv-title" data-act="title" value="${esc(S.title)}" maxlength="120">
          </div>
          <div class="field">
            <span class="label">Engagements in scope <span class="req">*</span></span>
            <div class="list">
              ${client.engagements.map((e) => `
                <label class="eng" for="eng-${esc(e.id)}">
                  <input type="checkbox" id="eng-${esc(e.id)}" data-act="eng" value="${esc(e.id)}"${S.engagementIds.has(e.id) ? ' checked' : ''}>
                  <span class="eng-body">
                    <span class="eng-top"><strong>${esc(engLabel(client, e))}</strong>${stageBadge(stageOf(e))}</span>
                    <span class="hint">${esc(e.serviceLines.map((s) => label('service_line', s)).join(', '))} · ${esc(fmtMonth(e.start))} – ${esc(fmtMonth(e.end))}${e.reference ? ' · ' + esc(e.reference) : ''}</span>
                  </span>
                </label>`).join('') || '<p class="note">This client has no engagements yet.</p>'}
            </div>
          </div>
          <div class="field">
            <span class="label">From the client and selected engagements</span>
            <div class="grid">
              <div class="field"><span class="hint">Industry</span><div class="readonly">${esc(label('industry', ctx.industry))}</div></div>
              <div class="field"><span class="hint">Account tier</span><div class="readonly">${esc((LK.tiers[ctx.tier] || {}).label || ctx.tier)}</div></div>
              <div class="field"><span class="hint">Engagement models</span><div class="readonly">${esc(ctx.models.map((m) => short('engagement_model', m)).join(', ') || '—')}</div></div>
              <div class="field"><span class="hint">Type of work</span><div class="readonly">${esc(ctx.workTypes.map((w) => short('work_type', w)).join(', ') || '—')}</div></div>
              <div class="field"><label class="hint" for="sv-stage">Lifecycle stage (editable)</label>
                <select id="sv-stage" data-act="stage">${optionList(LK.facets.lifecycle_stage, S.stage)}</select></div>
              <div class="field"><span class="hint">Line of business</span><div class="readonly">${esc(ctx.lobNames.join(', ') || '—')}</div></div>
            </div>
            <p class="hint">Questions using <span class="token">[LOB]</span> will read “${esc(ctx.lobToken)}”.${ctx.lobNames.length > 1 ? ' The engagements span several lines of business, so a neutral phrase is used.' : ''}</p>
          </div>
          <div class="field">
            <span class="label">Service lines in scope</span>
            <div class="chips">${ctx.serviceLines.map((s) => `<span class="tag">${esc(label('service_line', s))}</span>`).join('') || '<span class="hint">None</span>'}</div>
          </div>
        </div>

        <div class="card">
          <h2>2. What do you want to learn?</h2>
          <div class="field">
            <span class="label">Survey goal <span class="req">*</span></span>
            <div class="cards-pick" role="radiogroup" aria-label="Survey goal">
              ${LK.facets.survey_goal.map((g) => `
                <label class="pick" for="goal-${g.code}">
                  <input type="radio" name="sv-goal" id="goal-${g.code}" data-act="goal" value="${g.code}"${S.goal === g.code ? ' checked' : ''}>
                  ${g.code === suggestedGoal ? `<span class="badge">Suggested for ${esc(label('lifecycle_stage', S.stage))}</span>` : ''}
                  <strong>${esc(g.label)}</strong><span>${esc(attr(g.el, 'description'))}</span>
                </label>`).join('')}
            </div>
          </div>
          <div class="field">
            <span class="label">Anything specific worrying you? <span class="hint">(optional)</span></span>
            <div class="chips">${orderedProblems.map((p) => chip(`prob-${p.code}`, 'problem', p.code, S.problems.has(p.code), p.label)).join('')}</div>
            <span class="hint">Each concern adds questions for its linked sub-themes.</span>
          </div>
          <div class="field">
            <span class="label">Focus themes <span class="req">*</span></span>
            <div class="chips">${LK.themes.map((t) => chip(`theme-${t.code}`, 'theme', t.code, S.themes.has(t.code), t.label)).join('')}</div>
          </div>
          <div class="field">
            <div class="chips">${chip('sv-nps', 'nps', 'nps', S.includeNps, 'Include the NPS question')}</div>
          </div>
        </div>

        <div class="card">
          <h2>3. Who will answer, and how long?</h2>
          <div class="field">
            <span class="label">Respondent roles <span class="req">*</span></span>
            <div class="chips">${LK.facets.respondent_role.map((r) => chip(`role-${r.code}`, 'role', r.code, S.roles.has(r.code), r.label)).join('')}</div>
          </div>
          <div class="field">
            <span class="label">Contacts to invite <span class="req">*</span></span>
            <span class="hint">Contacts with a selected role whose line of business is in scope.</span>
            <div class="table-wrap">
              <table>
                <thead><tr><th scope="col"><span class="hint">Invite</span></th><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Line of business</th></tr></thead>
                <tbody>
                  ${client.contacts.map((c) => {
                    const scoped = inScope(c, lobs);
                    const roleOn = S.roles.has(c.role);
                    const lobName = c.lob ? ((client.lobs.find((l) => l.id === c.lob) || {}).name || '') : 'All';
                    const can = scoped && roleOn;
                    const note = !scoped ? ' · not in scope' : !roleOn ? ' · role not selected' : '';
                    return `<tr class="${can ? '' : 'muted-row'}">
                      <td><input type="checkbox" id="con-${esc(c.id)}" data-act="contact" value="${esc(c.id)}" aria-label="Invite ${esc(c.name)}"${S.contacts.has(c.id) ? ' checked' : ''}${can ? '' : ' disabled'}></td>
                      <td><label for="con-${esc(c.id)}">${esc(c.name)}</label><br><span class="hint">${esc(c.email)}</span></td>
                      <td>${esc(label('respondent_role', c.role))}</td>
                      <td>${esc(lobName)}${esc(note)}</td></tr>`;
                  }).join('') || '<tr><td colspan="4" class="hint">No contacts on this client yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div class="field">
            <span class="label">Survey length</span>
            <div class="cards-pick" role="radiogroup" aria-label="Survey length">
              ${LK.lengths.map((l) => `
                <label class="pick" for="len-${l.code}">
                  <input type="radio" name="sv-length" id="len-${l.code}" data-act="length" value="${l.code}"${S.length === l.code ? ' checked' : ''}>
                  <strong>${esc(l.label)}</strong><span>~${l.minutes} min · up to ${l.questions} questions</span>
                </label>`).join('')}
            </div>
            <span class="hint">${esc((LK.tiers[ctx.tier] || {}).label || '')} accounts default to ${esc((LK.lengths.find((l) => l.code === (LK.tiers[ctx.tier] || {}).length) || {}).label || '')}.</span>
          </div>
        </div>

        ${savedSurveysCard(customer)}
      </div>

      <aside class="col-side" aria-labelledby="sum-title">
        <div class="card">
          <h2 id="sum-title">Recommended survey</h2>
          <div class="stats">
            <div class="stat"><b>${rec.list.length}</b><span>questions</span></div>
            <div class="stat"><b>~${Math.max(1, Math.ceil(totalSec / 60))}</b><span>minutes</span></div>
            <div class="stat"><b>${invites}</b><span>invites</span></div>
          </div>
          <div style="margin-top:12px">
            ${Object.entries(byTheme).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<p class="hint">No questions match yet. Add a focus theme or a respondent role.</p>'}
          </div>
          <p class="note" style="margin-top:12px">For <strong>${esc(label('industry', ctx.industry))}</strong>, ${esc(ctx.models.map((m) => short('engagement_model', m)).join(' + ') || '—')}, ${esc(ctx.workTypes.map((w) => short('work_type', w)).join(' + ') || '—')} work and <strong>${esc(label('lifecycle_stage', ctx.stage))}</strong>, plus questions that apply everywhere.</p>
          ${execCap ? '<p class="note warn" style="margin-top:10px">Executive sponsors will see at most 10 of these questions.</p>' : ''}
          <h3 style="margin:16px 0 8px">Questions</h3>
          <div class="qlist">
            ${rec.list.map((p, i) => `
              <div class="qitem"><span class="n">${i + 1}</span>
                <span>${fillTokens(p.q.text, ctx)}<span class="meta">${esc(p.q.framework === 'nps' ? 'NPS' : subLabel(p.q.primary))}${p.why === 'Concern' ? ' · addresses a concern' : p.why === 'Context' ? ' · fits this client' : ''}</span></span>
                <button type="button" class="icon-btn" data-act="remove" data-id="${esc(p.q.id)}" aria-label="Remove question ${i + 1}">×</button>
              </div>`).join('')}
          </div>
          ${rec.removedCount ? `<button type="button" class="btn link" data-act="restore">Restore ${rec.removedCount} removed</button>` : ''}
          <div class="actions">
            <button type="button" class="btn" data-act="restart">Start over</button>
            <button type="button" class="btn primary" id="sv-save" data-act="save">Save survey</button>
          </div>
        </div>
      </aside>
    </div>`;
  }

  function savedSurveysCard(customer) {
    const list = readSurveys().filter((s) => s.customer === customer.id);
    const names = {};
    customer.clients.forEach((c) => { names[c.id] = c.name; });
    return `<div class="card">
      <h2>Saved surveys for ${esc(customer.name)}</h2>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th scope="col">Title</th><th scope="col">Client</th><th scope="col">Goal</th><th scope="col">Questions</th><th scope="col">Invites</th><th scope="col">Created</th></tr></thead>
        <tbody>${list.slice().reverse().map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(names[s.client] || s.client)}</td>
          <td>${esc(label('survey_goal', s.goal))}</td><td>${s.questions}</td><td>${s.recipients}</td><td>${esc(s.createdAt)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="hint">No surveys saved yet. Saved surveys are written to <code>surveys.xml</code>.</p>'}
    </div>`;
  }

  async function saveSurvey() {
    const customer = currentCustomer();
    const client = customer && customer.clients.find((c) => c.id === S.clientId);
    if (!client) return;
    const ctx = surveyContext(S, client, customer);
    const rec = recommend(ctx, readQuestions(), S.removed);
    const missing = [];
    if (!S.title.trim()) missing.push('a title');
    if (!S.engagementIds.size) missing.push('at least one engagement');
    if (!S.themes.size) missing.push('a focus theme');
    if (!S.roles.size) missing.push('a respondent role');
    if (!S.contacts.size) missing.push('at least one contact to invite');
    if (!rec.list.length) missing.push('at least one question');
    if (missing.length) { toast(`Add ${missing.join(', ')} before saving.`, true); return; }

    const btn = $('#sv-save'); if (btn) btn.disabled = true;
    try {
      await Store.mutate('surveys', (doc) => {
        const s = doc.createElement('survey');
        const set = (k, v) => s.setAttribute(k, v);
        set('id', Store.newId('srv')); set('title', S.title.trim()); set('customer', customer.id); set('client', client.id);
        set('goal', S.goal); set('stage', S.stage); set('length', S.length); set('includeNps', String(S.includeNps));
        set('lobToken', ctx.lobToken); set('status', 'draft'); set('createdAt', new Date().toISOString().slice(0, 10));
        const add = (tag, attrs) => { const c = doc.createElement(tag); Object.entries(attrs).forEach(([k, v]) => c.setAttribute(k, v)); s.appendChild(c); };
        ctx.engs.forEach((e) => add('engagement', { ref: e.id }));
        S.themes.forEach((t) => add('theme', { code: t }));
        S.problems.forEach((p) => add('concern', { code: p }));
        S.roles.forEach((r) => add('role', { code: r }));
        client.contacts.filter((c) => S.contacts.has(c.id)).forEach((c) => add('recipient', { contact: c.id, role: c.role }));
        rec.list.forEach((p, i) => add('question', { ref: p.q.id, position: String(i + 1), subtheme: p.q.primary }));
        doc.documentElement.appendChild(s);
      });
      toast('Survey saved to surveys.xml.');
      renderSurvey();
    } catch (e) {
      toast(`Could not save the survey: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  function onSurveyEvent(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const customer = currentCustomer();
    const client = customer && customer.clients.find((c) => c.id === (act === 'client' ? t.value : S.clientId));

    if (ev.type === 'input') { if (act === 'title') S.title = t.value; return; }
    if (ev.type === 'click') {
      if (act === 'remove') S.removed.add(t.dataset.id);
      else if (act === 'restore') S.removed.clear();
      else if (act === 'restart') S = newSurveyState(client);
      else if (act === 'save') { saveSurvey(); return; }
      else return;
      keepFocus(renderSurvey);
      return;
    }
    // change events
    if (act === 'client') { S = newSurveyState(client); keepFocus(renderSurvey); return; }
    if (!client) return;
    const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
    switch (act) {
      case 'eng': toggle(S.engagementIds, t.value); deriveStage(S, client); syncContacts(S, client); break;
      case 'stage': S.stage = t.value; S.stageEdited = true; break;
      case 'goal': applyGoal(S, t.value, client); break;
      case 'problem': toggle(S.problems, t.value); if (S.problems.has(t.value)) problemThemes(S).forEach((x) => S.themes.add(x)); break;
      case 'theme': toggle(S.themes, t.value); break;
      case 'nps': S.includeNps = t.checked; break;
      case 'role': toggle(S.roles, t.value); syncContacts(S, client); break;
      case 'contact': toggle(S.contacts, t.value); break;
      case 'length': S.length = t.value; break;
      default: return;
    }
    keepFocus(renderSurvey);
  }

  // ======================================================================
  // CUSTOMERS & CLIENTS
  // ======================================================================
  let rowKey = 0;
  const newEng = () => ({ key: ++rowKey, lob: '', model: 'managed_services', workType: 'run', start: '', end: '', reference: '', description: '', serviceLines: [] });
  const newContact = () => ({ key: ++rowKey, name: '', email: '', role: 'it_head', lob: '' });
  const newClientForm = () => ({ name: '', industry: '', tier: 'key', owner: '', lobs: [], lobDraft: '', engagements: [newEng()], contacts: [newContact()], errors: [] });

  function renderCustomers() {
    const el = $('#tab-customers');
    const list = customers();
    if (!list.find((c) => c.id === C.selected)) C.selected = list[0] ? list[0].id : '';
    const cust = list.find((c) => c.id === C.selected);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Customers &amp; clients</h1>
          <p>A4U admin view: every customer is listed. Customers are your IT service providers; each has its own clients. Saved to <code>customers.xml</code>.</p></div>
      </div>
      <div class="cols">
        <div class="col-narrow">
          <div class="card">
            <h2>Customers</h2>
            <div class="cust-list">
              ${list.map((c) => `<button type="button" class="cust-btn" data-act="pick-customer" data-id="${esc(c.id)}"${c.id === C.selected ? ' aria-current="true"' : ''}>
                <span>${esc(c.name)}</span><span class="hint">${c.clients.length} client${c.clients.length === 1 ? '' : 's'}</span></button>`).join('')}
            </div>
            <form id="add-customer-form" style="margin-top:16px" novalidate>
              <div class="field">
                <label class="label" for="new-customer-name">Add a customer</label>
                <input type="text" id="new-customer-name" placeholder="IT service provider name" maxlength="80" autocomplete="off">
              </div>
              <div class="actions" style="margin-top:10px"><button type="submit" class="btn primary">Add customer</button></div>
            </form>
          </div>
        </div>
        <div class="col-main">
          ${cust ? customerPanel(cust) : '<div class="card"><p>Add your first customer to get started.</p></div>'}
        </div>
      </div>`;
  }

  function customerPanel(cust) {
    return `
      ${C.showForm ? clientForm(cust) : ''}
      <div class="card">
        <div class="page-head" style="margin-bottom:14px">
          <div><h2 style="margin:0">${esc(cust.name)}</h2><p class="hint">${cust.clients.length} client${cust.clients.length === 1 ? '' : 's'}</p></div>
          ${C.showForm ? '' : '<button type="button" class="btn primary" data-act="open-client-form">+ Add client</button>'}
        </div>
        <div class="list" style="gap:14px">
          ${cust.clients.map(clientCard).join('') || '<p class="hint">No clients yet.</p>'}
        </div>
      </div>`;
  }

  function clientCard(cl) {
    const lobName = (id) => (id ? ((cl.lobs.find((l) => l.id === id) || {}).name || '') : 'All');
    return `<div class="client-card">
      <div class="client-head">
        <h3>${esc(cl.name)}</h3>
        <div class="tags"><span class="tag theme">${esc(label('industry', cl.industry))}</span><span class="tag">${esc((LK.tiers[cl.tier] || {}).label || cl.tier)}</span>${cl.owner ? `<span class="tag">Owner: ${esc(cl.owner)}</span>` : ''}</div>
      </div>
      <div class="tags"><span class="hint">Lines of business:</span>${cl.lobs.map((l) => `<span class="tag">${esc(l.name)}</span>`).join('') || '<span class="hint">none</span>'}</div>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Engagement</th><th scope="col">Service lines</th><th scope="col">Dates</th><th scope="col">Stage</th></tr></thead>
        <tbody>${cl.engagements.map((e) => `<tr><td><strong>${esc(engLabel(cl, e))}</strong>${e.reference || e.description ? `<br><span class="hint">${esc([e.reference, e.description].filter(Boolean).join(' · '))}</span>` : ''}</td>
          <td>${esc(e.serviceLines.map((s) => label('service_line', s)).join(', '))}</td>
          <td>${esc(fmtMonth(e.start))} – ${esc(fmtMonth(e.end))}</td><td>${stageBadge(stageOf(e))}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">No engagements</td></tr>'}</tbody>
      </table></div>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Contact</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Line of business</th></tr></thead>
        <tbody>${cl.contacts.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td>${esc(label('respondent_role', p.role))}</td><td>${esc(lobName(p.lob))}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">No contacts</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function clientForm(cust) {
    const f = C.form;
    const lobOptions = (sel, allowAll) => (allowAll ? `<option value=""${sel === '' ? ' selected' : ''}>All lines of business</option>` : `<option value="">Choose…</option>`)
      + f.lobs.map((l) => `<option value="${esc(l.key)}"${String(l.key) === String(sel) ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
    return `<div class="card" id="client-form-card">
      <h2>Add a client to ${esc(cust.name)}</h2>
      <p class="sub">Required fields are marked <span class="req">*</span>. The client is saved to <code>customers.xml</code> under this customer.</p>
      ${f.errors.length ? `<div class="note warn" role="alert" style="margin-bottom:14px"><strong>Fix these to save:</strong><br>${f.errors.map(esc).join('<br>')}</div>` : ''}
      <div class="grid">
        <div class="field"><label class="label" for="cf-name">Client name <span class="req">*</span></label>
          <input type="text" id="cf-name" data-cf="name" value="${esc(f.name)}" maxlength="100"></div>
        <div class="field"><label class="label" for="cf-industry">Industry <span class="req">*</span></label>
          <select id="cf-industry" data-cf="industry">${optionList(LK.facets.industry, f.industry, 'Choose…')}</select></div>
        <div class="field"><label class="label" for="cf-tier">Account tier <span class="req">*</span></label>
          <select id="cf-tier" data-cf="tier">${optionList(Object.values(LK.tiers), f.tier)}</select></div>
        <div class="field"><label class="label" for="cf-owner">Account owner</label>
          <input type="text" id="cf-owner" data-cf="owner" value="${esc(f.owner)}" maxlength="80" placeholder="Name"></div>
      </div>

      <div class="field">
        <span class="label">Lines of business <span class="req">*</span></span>
        <div class="tags">${f.lobs.map((l) => `<span class="tag">${esc(l.name)} <button type="button" class="icon-btn" style="width:24px;height:24px;font-size:14px" data-act="remove-lob" data-key="${l.key}" aria-label="Remove ${esc(l.name)}">×</button></span>`).join('') || '<span class="hint">None yet</span>'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="cf-lob-draft" data-cf="lobDraft" value="${esc(f.lobDraft)}" placeholder="e.g. Claims operations" maxlength="60" style="flex:1 1 220px;width:auto" aria-label="New line of business">
          <button type="button" class="btn" data-act="add-lob">Add</button>
        </div>
        <span class="hint">Free text for this client. Engagements and contacts are grouped by these.</span>
      </div>

      <div class="field">
        <div class="row-head"><span class="label">Engagements <span class="req">*</span></span><button type="button" class="btn small" data-act="add-eng">+ Add engagement</button></div>
        ${f.engagements.map((e, i) => `
          <div class="row-box">
            <div class="row-head"><strong>Engagement ${i + 1}</strong>${f.engagements.length > 1 ? `<button type="button" class="btn small danger" data-act="remove-eng" data-key="${e.key}">Remove</button>` : ''}</div>
            <div class="grid">
              <div class="field"><label class="label" for="cf-e${e.key}-lob">Line of business</label><select id="cf-e${e.key}-lob" data-eng="${e.key}" data-f="lob">${lobOptions(e.lob, false)}</select></div>
              <div class="field"><label class="label" for="cf-e${e.key}-model">Engagement model</label><select id="cf-e${e.key}-model" data-eng="${e.key}" data-f="model">${optionList(LK.facets.engagement_model, e.model)}</select></div>
              <div class="field"><label class="label" for="cf-e${e.key}-wt">Type of work</label><select id="cf-e${e.key}-wt" data-eng="${e.key}" data-f="workType">${optionList(LK.facets.work_type, e.workType)}</select></div>
              <div class="field"><label class="label" for="cf-e${e.key}-start">Start date</label><input type="date" id="cf-e${e.key}-start" data-eng="${e.key}" data-f="start" value="${esc(e.start)}"></div>
              <div class="field"><label class="label" for="cf-e${e.key}-end">End date</label><input type="date" id="cf-e${e.key}-end" data-eng="${e.key}" data-f="end" value="${esc(e.end)}"></div>
              <div class="field"><label class="label" for="cf-e${e.key}-ref">Reference <span class="hint">(optional)</span></label><input type="text" id="cf-e${e.key}-ref" data-eng="${e.key}" data-f="reference" value="${esc(e.reference)}" placeholder="SOW or PO number" maxlength="40"></div>
            </div>
            <div class="field"><span class="label">Service lines</span>
              <div class="chips">${typicalFirst(e.model).map((s) => `<label class="chip" for="cf-e${e.key}-sl-${s.code}"><input type="checkbox" id="cf-e${e.key}-sl-${s.code}" data-eng="${e.key}" data-f="serviceLine" value="${s.code}"${e.serviceLines.includes(s.code) ? ' checked' : ''}>${esc(s.label)}</label>`).join('')}</div>
            </div>
          </div>`).join('')}
      </div>

      <div class="field">
        <div class="row-head"><span class="label">Contacts <span class="req">*</span></span><button type="button" class="btn small" data-act="add-contact">+ Add contact</button></div>
        ${f.contacts.map((p, i) => `
          <div class="row-box">
            <div class="row-head"><strong>Contact ${i + 1}</strong>${f.contacts.length > 1 ? `<button type="button" class="btn small danger" data-act="remove-contact" data-key="${p.key}">Remove</button>` : ''}</div>
            <div class="grid">
              <div class="field"><label class="label" for="cf-c${p.key}-name">Name</label><input type="text" id="cf-c${p.key}-name" data-con="${p.key}" data-f="name" value="${esc(p.name)}" maxlength="80"></div>
              <div class="field"><label class="label" for="cf-c${p.key}-email">Email</label><input type="email" id="cf-c${p.key}-email" data-con="${p.key}" data-f="email" value="${esc(p.email)}" maxlength="120"></div>
              <div class="field"><label class="label" for="cf-c${p.key}-role">Role</label><select id="cf-c${p.key}-role" data-con="${p.key}" data-f="role">${optionList(LK.facets.respondent_role, p.role)}</select></div>
              <div class="field"><label class="label" for="cf-c${p.key}-lob">Line of business</label><select id="cf-c${p.key}-lob" data-con="${p.key}" data-f="lob">${lobOptions(p.lob, true)}</select></div>
            </div>
          </div>`).join('')}
      </div>

      <div class="actions">
        <button type="button" class="btn" data-act="cancel-client">Cancel</button>
        <button type="button" class="btn primary" id="cf-save" data-act="save-client">Save client</button>
      </div>
    </div>`;
  }

  function typicalFirst(model) {
    const typical = linkTo('model_typical_service_line', model);
    return [...LK.facets.service_line].sort((a, b) => {
      const ia = typical.indexOf(a.code); const ib = typical.indexOf(b.code);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  function validateClient(f, cust) {
    const errs = [];
    if (!f.name.trim()) errs.push('Enter the client name.');
    else if (cust.clients.some((c) => c.name.toLowerCase() === f.name.trim().toLowerCase())) errs.push(`${cust.name} already has a client called “${f.name.trim()}”.`);
    if (!f.industry) errs.push('Choose an industry.');
    if (!f.lobs.length) errs.push('Add at least one line of business.');
    f.engagements.forEach((e, i) => {
      const n = `Engagement ${i + 1}`;
      if (!e.lob) errs.push(`${n}: choose a line of business.`);
      if (!e.start || !e.end) errs.push(`${n}: enter start and end dates.`);
      else if (e.end <= e.start) errs.push(`${n}: the end date must be after the start date.`);
      if (!e.serviceLines.length) errs.push(`${n}: pick at least one service line.`);
    });
    const emails = new Set();
    f.contacts.forEach((p, i) => {
      const n = `Contact ${i + 1}`;
      if (!p.name.trim()) errs.push(`${n}: enter a name.`);
      if (!EMAIL_RE.test(p.email.trim())) errs.push(`${n}: enter a valid email address.`);
      else if (emails.has(p.email.trim().toLowerCase())) errs.push(`${n}: this email is used twice.`);
      emails.add(p.email.trim().toLowerCase());
    });
    return errs;
  }

  async function saveClient() {
    const cust = customers().find((c) => c.id === C.selected);
    const f = C.form;
    f.errors = validateClient(f, cust);
    if (f.errors.length) { keepFocus(renderCustomers); $('#client-form-card').scrollIntoView({ block: 'start' }); return; }
    const btn = $('#cf-save'); if (btn) btn.disabled = true;
    try {
      const name = f.name.trim();
      await Store.mutate('customers', (doc) => {
        const custEl = kids(doc.documentElement, 'customer').find((c) => attr(c, 'id') === cust.id);
        if (!custEl) throw new Error('That customer no longer exists.');
        if (kids(custEl, 'client').some((c) => attr(c, 'name').toLowerCase() === name.toLowerCase())) throw new Error(`A client called “${name}” was just added by someone else.`);
        const el = (tag, attrs, text) => { const n = doc.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (v !== '' && v != null) n.setAttribute(k, v); }); if (text != null) n.textContent = text; return n; };
        const client = el('client', { id: Store.newId('cli'), name, industry: f.industry, tier: f.tier, owner: f.owner.trim(), createdAt: new Date().toISOString().slice(0, 10) });
        const lobIds = {};
        f.lobs.forEach((l) => { const id = Store.newId('lob'); lobIds[l.key] = id; client.appendChild(el('lob', { id }, l.name)); });
        f.engagements.forEach((e) => {
          const eng = el('engagement', { id: Store.newId('eng'), lob: lobIds[e.lob], model: e.model, workType: e.workType, start: e.start, end: e.end, reference: e.reference.trim() });
          e.serviceLines.forEach((s) => eng.appendChild(el('serviceLine', { code: s })));
          client.appendChild(eng);
        });
        f.contacts.forEach((p) => {
          const c = el('contact', { id: Store.newId('con'), name: p.name.trim(), email: p.email.trim(), role: p.role });
          c.setAttribute('lob', p.lob ? lobIds[p.lob] : '');
          client.appendChild(c);
        });
        custEl.appendChild(client);
      });
      C.showForm = false; C.form = null;
      toast(`${name} added to customers.xml.`);
      renderAll();
    } catch (e) {
      toast(`Could not save the client: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  async function addCustomer(name) {
    const clean = name.trim();
    if (!clean) { toast('Enter the customer name.', true); return; }
    if (customers().some((c) => c.name.toLowerCase() === clean.toLowerCase())) { toast(`A customer called “${clean}” already exists.`, true); return; }
    try {
      const id = Store.newId('cust');
      await Store.mutate('customers', (doc) => {
        if (kids(doc.documentElement, 'customer').some((c) => attr(c, 'name').toLowerCase() === clean.toLowerCase())) throw new Error(`A customer called “${clean}” already exists.`);
        const c = doc.createElement('customer');
        c.setAttribute('id', id); c.setAttribute('name', clean); c.setAttribute('createdAt', new Date().toISOString().slice(0, 10));
        doc.documentElement.appendChild(c);
      });
      C.selected = id; C.showForm = false;
      toast(`${clean} added to customers.xml.`);
      renderAll();
    } catch (e) {
      toast(`Could not add the customer: ${e.message}`, true);
    }
  }

  function onCustomersEvent(ev) {
    const t = ev.target;
    if (ev.type === 'submit' && t.id === 'add-customer-form') { ev.preventDefault(); addCustomer($('#new-customer-name').value); return; }
    const f = C.form;

    // field edits inside the client form
    if (f && (ev.type === 'input' || ev.type === 'change')) {
      if (t.dataset.cf) { f[t.dataset.cf] = t.value; if (ev.type === 'change' && t.tagName === 'SELECT') keepFocus(renderCustomers); return; }
      if (t.dataset.eng) {
        const e = f.engagements.find((x) => String(x.key) === t.dataset.eng);
        if (!e) return;
        if (t.dataset.f === 'serviceLine') {
          if (ev.type !== 'change') return; // checkboxes fire both input and change
          const rest = e.serviceLines.filter((s) => s !== t.value);
          e.serviceLines = t.checked ? [...rest, t.value] : rest;
          return;
        }
        e[t.dataset.f] = t.value;
        if (t.dataset.f === 'model' && ev.type === 'change') { e.workType = vattr('engagement_model', t.value, 'defaultWorkType') || e.workType; keepFocus(renderCustomers); }
        return;
      }
      if (t.dataset.con) {
        const p = f.contacts.find((x) => String(x.key) === t.dataset.con);
        if (p) p[t.dataset.f] = t.value;
        return;
      }
    }
    if (ev.type === 'keydown' && t.id === 'cf-lob-draft' && ev.key === 'Enter') { ev.preventDefault(); addLob(); return; }
    if (ev.type !== 'click') return;
    const b = t.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'pick-customer': C.selected = b.dataset.id; C.showForm = false; C.form = null; break;
      case 'open-client-form': C.showForm = true; C.form = newClientForm(); break;
      case 'cancel-client': C.showForm = false; C.form = null; break;
      case 'add-lob': addLob(); return;
      case 'remove-lob': f.lobs = f.lobs.filter((l) => String(l.key) !== b.dataset.key);
        f.engagements.forEach((e) => { if (String(e.lob) === b.dataset.key) e.lob = ''; });
        f.contacts.forEach((p) => { if (String(p.lob) === b.dataset.key) p.lob = ''; }); break;
      case 'add-eng': f.engagements.push(newEng()); break;
      case 'remove-eng': f.engagements = f.engagements.filter((e) => String(e.key) !== b.dataset.key); break;
      case 'add-contact': f.contacts.push(newContact()); break;
      case 'remove-contact': f.contacts = f.contacts.filter((p) => String(p.key) !== b.dataset.key); break;
      case 'save-client': saveClient(); return;
      default: return;
    }
    keepFocus(renderCustomers);
  }

  function addLob() {
    const f = C.form;
    const name = (f.lobDraft || '').trim();
    if (!name) return;
    if (f.lobs.some((l) => l.name.toLowerCase() === name.toLowerCase())) { toast(`“${name}” is already listed.`, true); return; }
    const lob = { key: ++rowKey, name };
    f.lobs.push(lob);
    f.lobDraft = '';
    f.engagements.forEach((e) => { if (!e.lob) e.lob = String(lob.key); });
    keepFocus(renderCustomers);
  }

  // ======================================================================
  // QUESTION LIBRARY
  // ======================================================================
  const QTYPES = [
    { code: 'rating', label: 'Rating scale' }, { code: 'multiple_choice', label: 'Multiple choice' },
    { code: 'yes_no', label: 'Yes / No' }, { code: 'ranking', label: 'Ranking' },
    { code: 'open_text', label: 'Open text' }, { code: 'nps', label: 'NPS 0–10' },
  ];
  const typeLabel = (code) => (QTYPES.find((t) => t.code === code) || {}).label || code;
  const APPLY = [
    { facet: 'industry', label: 'Industry' }, { facet: 'work_type', label: 'Type of work' },
    { facet: 'engagement_model', label: 'Engagement model' }, { facet: 'service_line', label: 'Service line' },
    { facet: 'lifecycle_stage', label: 'Lifecycle stage' },
  ];
  const newQuestionForm = () => ({
    text: '', type: 'rating', scale: 'agree_5', options: '', primary: '', secondary: [],
    survey_goal: [], respondent_role: [], industry: [], work_type: [], engagement_model: [], service_line: [], lifecycle_stage: [],
    followUp: false, fuMax: '', fuText: '', visibility: 'platform', status: 'published', errors: [],
  });

  function questionMatches(q, search, theme) {
    if (theme && (LK.sub[q.primary] || {}).theme !== theme) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    const sub = LK.sub[q.primary];
    const hay = [q.text, sub ? sub.label : '', sub ? themeLabel(sub.theme) : '', ...(sub ? sub.synonyms : [])].join(' ').toLowerCase();
    return hay.includes(s);
  }

  function renderQuestions() {
    const el = $('#tab-questions');
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Question library</h1><p>Platform questions plus ${esc((currentCustomer() || {}).name || 'this customer')}'s private ones. Saved to <code>questions.xml</code>.</p></div>
        ${Q.showForm ? '' : '<button type="button" class="btn primary" data-act="open-q-form">+ New question</button>'}
      </div>
      ${Q.showForm ? questionForm() : ''}
      <div class="card">
        <div class="grid" style="margin-bottom:14px">
          <div class="field"><label class="label" for="q-search">Search</label>
            <input type="search" id="q-search" data-act="q-search" value="${esc(Q.search)}" placeholder="e.g. ticket turnaround, QBR, pricing"></div>
          <div class="field"><label class="label" for="q-theme">Theme</label>
            <select id="q-theme" data-act="q-theme">${optionList(LK.themes.map((t) => ({ code: t.code, label: t.label })), Q.theme, 'All themes')}</select></div>
        </div>
        <div id="q-results"></div>
      </div>`;
    renderQuestionList();
  }

  function renderQuestionList() {
    const box = $('#q-results');
    if (!box) return;
    const tenant = App.tenant;
    const custNames = {};
    customers().forEach((c) => { custNames[c.id] = c.name; });
    const all = readQuestions().filter((q) => !q.owner || q.owner === tenant);
    const list = all.filter((q) => questionMatches(q, Q.search, Q.theme));
    box.innerHTML = `<p class="hint" style="margin-bottom:10px">${list.length} of ${all.length} questions${Q.search ? ' (search also matches sub-theme synonyms)' : ''}</p>
      <div class="list">${list.map((q) => {
        const tags = [];
        tags.push(`<span class="tag theme">${esc(q.framework === 'nps' ? 'NPS' : subLabel(q.primary))}</span>`);
        tags.push(`<span class="tag">${esc(typeLabel(q.type))}${q.scale && LK.scales[q.scale] && q.type === 'rating' ? ' · ' + esc(LK.scales[q.scale].name) : ''}</span>`);
        (q.tags.respondent_role || []).forEach((r) => tags.push(`<span class="tag">${esc(label('respondent_role', r))}</span>`));
        APPLY.forEach((a) => (q.tags[a.facet] || []).forEach((v) => tags.push(`<span class="tag">${esc(a.label)}: ${esc(short(a.facet, v))}</span>`)));
        if (q.owner) tags.push(`<span class="badge warn">Private to ${esc(custNames[q.owner] || q.owner)}</span>`);
        if (q.status !== 'published') tags.push(`<span class="badge grey">${esc(q.status)}</span>`);
        return `<div class="qcard"><div style="min-width:0"><p>${esc(q.text)}</p><div class="tags">${tags.join('')}</div></div></div>`;
      }).join('') || '<p class="hint">No questions match.</p>'}</div>`;
  }

  function questionForm() {
    const f = Q.form;
    const needsScale = f.type === 'rating';
    const needsOptions = f.type === 'multiple_choice' || f.type === 'ranking';
    const scale = LK.scales[f.type === 'nps' ? 'likelihood_11' : f.scale];
    const canFollow = (f.type === 'rating' || f.type === 'nps') && scale;
    const thresholds = canFollow ? scale.points.filter((p) => p.value < scale.favourable) : [];
    const subOptions = LK.themes.map((t) => `<optgroup label="${esc(t.label)}">${t.subs.map((s) => `<option value="${s.code}"${f.primary === s.code ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</optgroup>`).join('');
    const cust = currentCustomer();
    return `<div class="card" id="q-form-card">
      <h2>New question</h2>
      ${f.errors.length ? `<div class="note warn" role="alert" style="margin-bottom:14px"><strong>Fix these to save:</strong><br>${f.errors.map(esc).join('<br>')}</div>` : ''}
      <div class="cols" style="gap:18px">
        <div class="col-main" style="gap:0">
          <div class="field">
            <label class="label" for="qf-text">Question text <span class="req">*</span></label>
            <textarea id="qf-text" data-qf="text" rows="3" maxlength="200">${esc(f.text)}</textarea>
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="chips"><span class="hint">Insert</span>
                ${['[PROVIDER]', '[CLIENT]', '[LOB]'].map((tk) => `<button type="button" class="btn small" data-act="insert-token" data-token="${tk}">${tk}</button>`).join('')}</div>
              <span class="hint" id="qf-count">${f.text.length} / 200</span>
            </div>
          </div>
          <div class="grid">
            <div class="field"><label class="label" for="qf-type">Question type <span class="req">*</span></label>
              <select id="qf-type" data-qf="type">${optionList(QTYPES, f.type)}</select></div>
            ${needsScale ? `<div class="field"><label class="label" for="qf-scale">Scale <span class="req">*</span></label>
              <select id="qf-scale" data-qf="scale">${optionList(Object.values(LK.scales).filter((s) => !s.locked).map((s) => ({ code: s.code, label: s.name })), f.scale)}</select></div>` : ''}
            ${f.type === 'nps' ? '<div class="field"><span class="label">Scale</span><div class="readonly">0–10 likelihood (NPS, locked)</div></div>' : ''}
          </div>
          ${needsOptions ? `<div class="field"><label class="label" for="qf-options">Answer options <span class="req">*</span></label>
            <textarea id="qf-options" data-qf="options" rows="4" placeholder="One option per line">${esc(f.options)}</textarea>
            <span class="hint">Between 2 and 10 options.</span></div>` : ''}
          ${canFollow ? `<div class="field">
            <div class="chips">${chip('qf-fu', 'qf-followup', '1', f.followUp, 'Ask a follow-up when the score is low')}</div>
            ${f.followUp ? `<div class="grid">
              <div class="field"><label class="label" for="qf-fumax">If the score is at most</label>
                <select id="qf-fumax" data-qf="fuMax">${optionList(thresholds.map((p) => ({ code: String(p.value), label: `${p.value} (${p.label})` })), f.fuMax, 'Choose…')}</select></div>
              <div class="field"><label class="label" for="qf-futext">Ask</label>
                <input type="text" id="qf-futext" data-qf="fuText" value="${esc(f.fuText)}" maxlength="200" placeholder="e.g. Can you share an example?"></div>
            </div>` : ''}
          </div>` : ''}
          <div class="field">
            <label class="label" for="qf-primary">Primary sub-theme <span class="req">*</span></label>
            <select id="qf-primary" data-qf="primary"><option value="">Choose…</option>${subOptions}</select>
            <span class="hint">Scores roll up to this sub-theme and its theme.</span>
          </div>
          <div class="field"><span class="label">Fits these survey goals <span class="req">*</span></span>
            <div class="chips">${LK.facets.survey_goal.map((g) => chip(`qf-goal-${g.code}`, 'qf-multi', g.code, f.survey_goal.includes(g.code), g.label).replace('data-act="qf-multi"', 'data-act="qf-multi" data-facet="survey_goal"')).join('')}</div></div>
          <div class="field"><span class="label">Suitable respondents <span class="req">*</span></span>
            <div class="chips">${LK.facets.respondent_role.map((r) => chip(`qf-role-${r.code}`, 'qf-multi', r.code, f.respondent_role.includes(r.code), r.label).replace('data-act="qf-multi"', 'data-act="qf-multi" data-facet="respondent_role"')).join('')}</div></div>
          <div class="field"><span class="label">Where does this question apply?</span>
            <span class="hint">Leave a group empty to apply everywhere.</span>
            ${APPLY.map((a) => `<div class="field"><span class="hint"><strong>${esc(a.label)}</strong></span><div class="chips">${LK.facets[a.facet].map((v) => chip(`qf-${a.facet}-${v.code}`, 'qf-multi', v.code, f[a.facet].includes(v.code), short(a.facet, v.code)).replace('data-act="qf-multi"', `data-act="qf-multi" data-facet="${a.facet}"`)).join('')}</div></div>`).join('')}
          </div>
          <div class="grid">
            <div class="field"><label class="label" for="qf-visibility">Visibility</label>
              <select id="qf-visibility" data-qf="visibility">${optionList([{ code: 'platform', label: 'Platform library (all customers)' }, { code: 'private', label: `Private to ${cust ? cust.name : 'this customer'}` }], f.visibility)}</select></div>
            <div class="field"><label class="label" for="qf-status">Status</label>
              <select id="qf-status" data-qf="status">${optionList([{ code: 'published', label: 'Published (usable in surveys)' }, { code: 'draft', label: 'Draft' }], f.status)}</select></div>
          </div>
        </div>
        <div class="col-narrow">
          <div class="preview" id="qf-preview">${questionPreview()}</div>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn" data-act="cancel-q">Cancel</button>
        <button type="button" class="btn primary" id="qf-save" data-act="save-q">Save question</button>
      </div>
    </div>`;
  }

  function questionPreview() {
    const f = Q.form;
    const cust = currentCustomer();
    const client = cust && cust.clients[0];
    const ctx = { customer: cust || { name: 'Your company' }, client: client || { name: 'Client name' }, lobToken: client && client.lobs[0] ? client.lobs[0].name : 'your services' };
    const scale = LK.scales[f.type === 'nps' ? 'likelihood_11' : f.scale];
    let answer = '';
    if (f.type === 'rating' || f.type === 'nps') {
      answer = `<div class="scale" style="grid-template-columns:repeat(${scale.points.length}, minmax(0,1fr))">${scale.points.map((p) => `<span><i class="dot"></i>${esc(f.type === 'nps' ? p.value : p.label)}</span>`).join('')}</div>`;
    } else if (f.type === 'yes_no') {
      answer = '<div class="tags" style="margin-top:12px"><span class="tag">Yes</span><span class="tag">No</span></div>';
    } else if (f.type === 'open_text') {
      answer = '<div class="readonly" style="margin-top:12px;min-height:60px"></div>';
    } else {
      const opts = f.options.split('\n').map((s) => s.trim()).filter(Boolean);
      answer = `<div class="list" style="margin-top:12px">${opts.map((o, i) => `<span class="tag">${f.type === 'ranking' ? i + 1 + '. ' : ''}${esc(o)}</span>`).join('') || '<span class="hint">Add options to see them here.</span>'}</div>`;
    }
    return `<h3 style="margin-bottom:6px">Respondent preview</h3>
      <p class="hint" style="margin-bottom:10px">Tokens filled with sample values.</p>
      <p style="font-weight:500">${f.text.trim() ? fillTokens(f.text, ctx) : '<span class="hint">Start typing the question…</span>'}</p>${answer}`;
  }

  function validateQuestion(f) {
    const errs = [];
    const text = f.text.trim();
    if (text.length < 5) errs.push('Write the question (at least 5 characters).');
    if (/\[(?!PROVIDER\]|CLIENT\]|LOB\])[A-Z]+\]/.test(text)) errs.push('Only [PROVIDER], [CLIENT] and [LOB] tokens are supported.');
    if (!f.primary) errs.push('Choose a primary sub-theme.');
    if (!f.survey_goal.length) errs.push('Pick at least one survey goal.');
    if (!f.respondent_role.length) errs.push('Pick at least one respondent role.');
    if (f.type === 'multiple_choice' || f.type === 'ranking') {
      const n = f.options.split('\n').map((s) => s.trim()).filter(Boolean).length;
      if (n < 2 || n > 10) errs.push('Give between 2 and 10 answer options.');
    }
    if (f.followUp && (f.type === 'rating' || f.type === 'nps')) {
      if (f.fuMax === '') errs.push('Choose the follow-up threshold.');
      if (!f.fuText.trim()) errs.push('Write the follow-up question.');
    }
    if (f.type === 'nps' && f.status === 'published' && readQuestions().some((q) => q.framework === 'nps' && q.status === 'published' && (!q.owner || q.owner === App.tenant))) {
      errs.push('A published NPS question already exists. NPS wording is standard, so reuse that one.');
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
        const nums = kids(root, 'question').map((q) => Number((attr(q, 'id').match(/(\d+)$/) || [0, 0])[1]));
        const id = `q-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
        const q = doc.createElement('question');
        const set = (k, v) => { if (v !== '' && v != null) q.setAttribute(k, v); };
        set('id', id); set('status', f.status); set('type', f.type);
        if (f.type === 'rating') set('scale', f.scale);
        if (f.type === 'nps') { set('scale', 'likelihood_11'); set('framework', 'nps'); }
        set('primary', f.primary);
        q.setAttribute('owner', f.visibility === 'private' ? App.tenant : '');
        set('createdAt', new Date().toISOString().slice(0, 10));
        const add = (tag, attrs, text) => { const n = doc.createElement(tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; q.appendChild(n); };
        add('text', {}, f.text.trim());
        if (f.type === 'multiple_choice' || f.type === 'ranking') f.options.split('\n').map((s) => s.trim()).filter(Boolean).forEach((o) => add('option', {}, o));
        ['survey_goal', 'respondent_role', ...APPLY.map((a) => a.facet)].forEach((facet) => { if (f[facet].length) add('tag', { facet, codes: f[facet].join(' ') }); });
        if (f.followUp && (f.type === 'rating' || f.type === 'nps')) add('followUp', { max: f.fuMax }, f.fuText.trim());
        root.appendChild(q);
      });
      Q.showForm = false; Q.form = null;
      toast('Question added to questions.xml.');
      renderQuestions();
      if (S.clientId) renderSurvey();
    } catch (e) {
      toast(`Could not save the question: ${e.message}`, true);
      if (btn) btn.disabled = false;
    }
  }

  function onQuestionsEvent(ev) {
    const t = ev.target;
    const f = Q.form;
    if (ev.type === 'input' && t.dataset.act === 'q-search') { Q.search = t.value; renderQuestionList(); return; }
    if (ev.type === 'change' && t.dataset.act === 'q-theme') { Q.theme = t.value; renderQuestionList(); return; }
    if (f && (ev.type === 'input' || ev.type === 'change') && t.dataset.qf) {
      f[t.dataset.qf] = t.value;
      if (t.dataset.qf === 'text') { $('#qf-count').textContent = `${t.value.length} / 200`; $('#qf-preview').innerHTML = questionPreview(); return; }
      if (t.dataset.qf === 'options') { $('#qf-preview').innerHTML = questionPreview(); return; }
      if (ev.type === 'change' && t.tagName === 'SELECT') {
        if (t.dataset.qf === 'type' || t.dataset.qf === 'scale') { f.fuMax = ''; if (t.value === 'nps') { f.followUp = true; f.fuMax = '6'; f.fuText = f.fuText || 'What is the main reason for your score?'; } }
        keepFocus(renderQuestions);
      }
      return;
    }
    if (f && ev.type === 'change' && t.dataset.act === 'qf-multi') {
      const arr = f[t.dataset.facet];
      f[t.dataset.facet] = t.checked ? [...arr, t.value] : arr.filter((v) => v !== t.value);
      return;
    }
    if (f && ev.type === 'change' && t.dataset.act === 'qf-followup') { f.followUp = t.checked; keepFocus(renderQuestions); return; }
    if (ev.type !== 'click') return;
    const b = t.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'open-q-form': Q.showForm = true; Q.form = newQuestionForm(); renderQuestions(); $('#qf-text').focus(); return;
      case 'cancel-q': Q.showForm = false; Q.form = null; renderQuestions(); return;
      case 'save-q': saveQuestion(); return;
      case 'insert-token': {
        const ta = $('#qf-text');
        const tok = b.dataset.token;
        const start = ta.selectionStart ?? ta.value.length; const end = ta.selectionEnd ?? ta.value.length;
        ta.value = (ta.value.slice(0, start) + tok + ta.value.slice(end)).slice(0, 200);
        f.text = ta.value;
        ta.focus(); ta.setSelectionRange(start + tok.length, start + tok.length);
        $('#qf-count').textContent = `${f.text.length} / 200`;
        $('#qf-preview').innerHTML = questionPreview();
        return;
      }
      default:
    }
  }

  // ======================================================================
  // XML DATA
  // ======================================================================
  function renderData() {
    const el = $('#tab-data');
    const files = [
      { code: 'customers', label: 'customers.xml', where: Store.mode === 'shared' ? 'Vercel Blob: a4u-demo/customers.xml' : 'This browser (local storage), seeded from data/customers.xml' },
      { code: 'questions', label: 'questions.xml', where: Store.mode === 'shared' ? 'Vercel Blob: a4u-demo/questions.xml' : 'This browser (local storage), seeded from data/questions.xml' },
      { code: 'surveys', label: 'surveys.xml', where: Store.mode === 'shared' ? 'Vercel Blob: a4u-demo/surveys.xml' : 'This browser (local storage), seeded from data/surveys.xml' },
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
          App.tenant = (customers()[0] || {}).id || '';
          const c = currentCustomer(); S = newSurveyState(c && c.clients[0]);
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
    if (!list.find((c) => c.id === App.tenant)) App.tenant = list[0] ? list[0].id : '';
    sel.innerHTML = list.map((c) => `<option value="${esc(c.id)}"${c.id === App.tenant ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
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
    const c = currentCustomer();
    if (S.clientId && !(c && c.clients.some((x) => x.id === S.clientId))) S = newSurveyState(c && c.clients[0]);
    renderSurvey();
    renderCustomers();
    renderQuestions();
    renderData();
  }

  function showTab(name) {
    App.tab = name;
    document.querySelectorAll('.tabs [role="tab"]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    ['survey', 'customers', 'questions', 'data'].forEach((n) => { $(`#tab-${n}`).hidden = n !== name; });
    if (name === 'data') renderData();
  }

  async function start() {
    try {
      await Store.init();
      LK = buildLookups(Store.lookups());
      const first = customers()[0];
      App.tenant = first ? first.id : '';
      S = newSurveyState(first && first.clients[0]);
      $('#loading').hidden = true;
      renderAll();
      showTab('survey');
    } catch (e) {
      $('#loading').innerHTML = `<div class="note warn"><strong>The demo could not load its XML data.</strong><br>${esc(e.message)}<br>Open it through a web server (for example the Vercel link), not by double-clicking the file.</div>`;
      return;
    }

    $('#tenant-select').addEventListener('change', (e) => {
      App.tenant = e.target.value;
      const c = currentCustomer();
      S = newSurveyState(c && c.clients[0]);
      Q.showForm = false; Q.form = null;
      renderSurvey(); renderQuestions();
    });
    document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
    document.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
      const i = tabs.findIndex((b) => b.dataset.tab === App.tab);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      showTab(next.dataset.tab); next.focus();
    });
    const sv = $('#tab-survey');
    ['change', 'click', 'input'].forEach((t) => sv.addEventListener(t, onSurveyEvent));
    const cu = $('#tab-customers');
    ['change', 'click', 'input', 'submit', 'keydown'].forEach((t) => cu.addEventListener(t, onCustomersEvent));
    const qu = $('#tab-questions');
    ['change', 'click', 'input'].forEach((t) => qu.addEventListener(t, onQuestionsEvent));
    const da = $('#tab-data');
    ['change', 'click'].forEach((t) => da.addEventListener(t, onDataEvent));
  }

  start();
})();
