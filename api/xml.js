// Vercel Function: reads and writes the demo's XML files in a Vercel Blob store.
//
//   GET    /api/xml?name=status      -> { configured: true|false }
//   GET    /api/xml?name=customers   -> the saved XML (204 until the first save; the app then uses the seed file)
//   PUT    /api/xml?name=customers   -> body { "xml": "<customers>...</customers>" }
//   DELETE /api/xml?name=all         -> removes saved files (back to the seed data)
//
// Needs a Blob store connected to the project (adds BLOB_READ_WRITE_TOKEN or
// OIDC + BLOB_STORE_ID). Create the store as "private"; set BLOB_ACCESS=public
// only if you created a public store.

import { put, get, del } from '@vercel/blob';

const FILES = { customers: 'customers', questions: 'questions', surveys: 'surveys', lookups: 'lookups' }; // name -> root element
const PREFIX = 'a4u-demo-v2/';   // v2 = simplified survey builder (older demo files are left untouched)
const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const MAX_BYTES = 1_000_000;

const isConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const pathFor = (name) => `${PREFIX}${name}.xml`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const name = String((req.query && req.query.name) || '');

  try {
    if (req.method === 'GET' && name === 'status') {
      return res.status(200).json({ configured: isConfigured() });
    }
    if (!isConfigured()) {
      return res.status(501).json({ error: 'No Vercel Blob store is connected to this project.' });
    }

    if (req.method === 'GET') {
      if (!FILES[name]) return res.status(400).json({ error: `Unknown file "${name}".` });
      const result = await get(pathFor(name), { access: ACCESS, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return res.status(204).end(); // not saved yet: the app falls back to data/<name>.xml
      }
      const text = await new Response(result.stream).text();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(text);
    }

    if (req.method === 'PUT') {
      if (!FILES[name]) return res.status(400).json({ error: `Unknown file "${name}".` });
      const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
      const xml = body && typeof body.xml === 'string' ? body.xml : '';
      if (!xml) return res.status(400).json({ error: 'Send the XML as { "xml": "..." }.' });
      if (Buffer.byteLength(xml, 'utf8') > MAX_BYTES) return res.status(413).json({ error: 'File is larger than 1 MB.' });
      const root = FILES[name];
      if (!new RegExp(`<${root}[\\s>/]`).test(xml)) {
        return res.status(400).json({ error: `The root element must be <${root}>.` });
      }
      await put(pathFor(name), xml, {
        access: ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/xml',
        cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE' && name === 'all') {
      await del(Object.keys(FILES).map(pathFor));
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('xml api error', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Storage error.' });
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
