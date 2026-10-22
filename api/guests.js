// Lista de invitados en línea.
//   GET  /api/guests  → público: devuelve { config, guests } (lo usa el buscador).
//   PUT  /api/guests  → solo con la contraseña del panel: guarda la lista completa.
// Se guarda en un Blob store privado de Vercel. Si todavía no hay nada guardado,
// se usa invitados.json del repo como lista inicial.

import { get, put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PATHNAME = 'invitados.json';
const MAX_BYTES = 4 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    return sameText(sep === -1 ? decoded : decoded.slice(sep + 1), expected);
  } catch {
    return false;
  }
}

async function readSeed() {
  try {
    for (const file of [path.join(process.cwd(), 'invitados.json'), new URL('../invitados.json', import.meta.url)]) {
      try { return JSON.parse(await readFile(file, 'utf8')); } catch {}
    }
    return { config: {}, guests: [] };
  } catch {
    return { config: {}, guests: [] };
  }
}

async function readStored() {
  const result = await get(PATHNAME, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text());
}

function clean(body) {
  if (!body || !Array.isArray(body.guests)) throw new Error('Formato inválido');
  const guests = body.guests
    .filter(g => g && String(g.name || '').trim() && String(g.table ?? '').trim())
    .map(g => ({
      name: String(g.name).trim(),
      table: g.table,
      ...(g.tableName ? { tableName: String(g.tableName) } : {}),
      ...(g.seat ? { seat: String(g.seat) } : {}),
      ...(g.notes ? { notes: String(g.notes) } : {}),
      ...(g.photo ? { photo: String(g.photo) } : {}),
    }));
  const config = body.config && typeof body.config === 'object' ? body.config : {};
  return { config, guests, updatedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    const stored = await readStored();
    return json(stored || (await readSeed()));
  } catch (err) {
    console.error('Error leyendo la lista:', err);
    return json(await readSeed());
  }
}

export async function PUT(request) {
  if (!authorized(request)) return json({ error: 'No autorizado' }, 401);
  let data;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: 'La lista es demasiado grande (¿muchas fotos?)' }, 413);
    data = clean(JSON.parse(text));
  } catch (err) {
    return json({ error: err.message || 'Formato inválido' }, 400);
  }
  try {
    await put(PATHNAME, JSON.stringify(data), {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    return json({ ok: true, count: data.guests.length, updatedAt: data.updatedAt });
  } catch (err) {
    console.error('Error guardando la lista:', err);
    return json({ error: 'No se pudo guardar. Intenta de nuevo.' }, 500);
  }
}
