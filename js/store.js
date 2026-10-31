/* XML data store.
 * - Reference lists (lookups.xml) are editable on the Admin screen and saved like the other files.
 * - customers.xml, questions.xml and surveys.xml are read and written as XML.
 *   "shared" mode: saved through /api/xml into a Vercel Blob store (everyone sees the same data).
 *   "local"  mode: saved in this browser (used when no Blob store is connected or when run locally).
 */
const Store = (() => {
  const FILES = ['customers', 'questions', 'surveys', 'lookups'];
  const LS_PREFIX = 'a4u-demo-v2:';   // v2 = simplified survey builder; older demo data is not mixed in
  let mode = 'local';
  const docs = {};

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('The XML file is not valid.');
    return doc;
  }

  async function errorText(res) {
    try { const j = await res.json(); return j.error || `Request failed (${res.status})`; }
    catch { return `Request failed (${res.status})`; }
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    return res.text();
  }

  // data/<name>.xml, or the built-in copy when the page is opened from disk.
  async function seedText(name) {
    try {
      return await fetchText(`data/${name}.xml`);
    } catch (err) {
      const builtIn = window.A4U_SEED && window.A4U_SEED[name];
      if (builtIn) return builtIn;
      throw err;
    }
  }

  async function detectMode() {
    try {
      const res = await fetch('api/xml?name=status', { cache: 'no-store' });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return 'local';
      const body = await res.json();
      return body.configured ? 'shared' : 'local';
    } catch {
      return 'local';
    }
  }

  const seed = async (name) => parse(await seedText(name));

  async function loadShared(name) {
    const res = await fetch(`api/xml?name=${name}`, { cache: 'no-store' });
    if (res.status === 204) return seed(name); // nothing saved yet

    if (!res.ok) throw new Error(await errorText(res));
    return parse(await res.text());
  }

  function loadLocal(name) {
    try {
      const text = localStorage.getItem(LS_PREFIX + name);
      return text ? parse(text) : null;
    } catch {
      return null;
    }
  }

  async function load(name) {
    if (mode === 'shared') return loadShared(name);
    return loadLocal(name) || seed(name);
  }

  async function save(name, doc) {
    const xml = serialize(doc);
    if (mode === 'shared') {
      const res = await fetch(`api/xml?name=${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      });
      if (!res.ok) throw new Error(await errorText(res));
    } else {
      try { localStorage.setItem(LS_PREFIX + name, xml); }
      catch (e) { throw new Error('This browser blocked saving. Try a normal (non-private) window.'); }
    }
    docs[name] = parse(xml);
  }

  // Load the latest copy, apply a change, save it back. Keeps edits from two people from overwriting each other.
  async function mutate(name, change) {
    const doc = await load(name);
    const result = change(doc);
    await save(name, doc);
    return result;
  }

  async function init() {
    mode = await detectMode();
    await refresh();
  }

  async function refresh() {
    const loaded = await Promise.all(FILES.map(load));
    FILES.forEach((n, i) => { docs[n] = loaded[i]; });
  }

  async function reset() {
    if (mode === 'shared') {
      const res = await fetch('api/xml?name=all', { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorText(res));
    } else {
      FILES.forEach((n) => { try { localStorage.removeItem(LS_PREFIX + n); } catch { /* ignore */ } });
    }
    await refresh();
  }

  // Pretty-printed XML so the saved files stay readable.
  function serialize(doc) {
    const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
    const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
    const walk = (el, depth) => {
      const pad = '  '.repeat(depth);
      const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('');
      const kids = Array.from(el.childNodes).filter(
        (n) => n.nodeType === 1 || ((n.nodeType === 3 || n.nodeType === 4) && n.nodeValue.trim())
      );
      if (!kids.length) { out.push(`${pad}<${el.tagName}${attrs}/>`); return; }
      if (kids.every((n) => n.nodeType !== 1)) {
        out.push(`${pad}<${el.tagName}${attrs}>${escText(el.textContent.trim())}</${el.tagName}>`);
        return;
      }
      out.push(`${pad}<${el.tagName}${attrs}>`);
      kids.filter((n) => n.nodeType === 1).forEach((c) => walk(c, depth + 1));
      out.push(`${pad}</${el.tagName}>`);
    };
    walk(doc.documentElement, 0);
    return out.join('\n') + '\n';
  }

  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return {
    init, refresh, reset, mutate, serialize, newId,
    get mode() { return mode; },
    blobPath: (name) => `a4u-demo-v2/${name}.xml`,
    doc: (name) => docs[name],
    lookups: () => docs.lookups,
  };
})();
