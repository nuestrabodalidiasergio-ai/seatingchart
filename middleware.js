// Protege el panel de administración con contraseña, del lado del servidor (Vercel).
// La contraseña NO está en el código: se lee de la variable de entorno ADMIN_PASSWORD
// configurada en Vercel (Project → Settings → Environment Variables).
// Si la variable no existe, el panel queda bloqueado para todos.

export const config = {
  matcher: ['/admin', '/admin.html', '/admin/:path*'],
};

function unauthorized() {
  return new Response('Acceso restringido', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Panel de administracion", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return new Response('Panel deshabilitado: falta configurar ADMIN_PASSWORD en Vercel.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0))
    );
  } catch {
    return unauthorized();
  }

  // Formato "usuario:contraseña". El usuario se ignora; solo cuenta la contraseña.
  const sep = decoded.indexOf(':');
  const password = sep === -1 ? decoded : decoded.slice(sep + 1);
  if (!sameText(password, expected)) return unauthorized();

  // Sin respuesta = la petición continúa y Vercel sirve admin.html.
}
