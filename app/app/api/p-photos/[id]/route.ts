import { promises as fs } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { safeUploadPath } from '@/lib/uploads';

export const runtime = 'nodejs';

/**
 * Tokenized photo serving for the public client portal. Mirrors
 * /api/photos/[id] but the auth path is `?t=<projectPortalToken>` —
 * no session required. The token validates that the requested photo
 * belongs to a task on the project that owns the token. Anything
 * else 403s.
 *
 * This is the same risk surface as /api/ics/[token] — anyone with the
 * URL can read. Rotation lives on the project detail page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  if (!token || token.length < 16 || token.length > 64) {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 64) {
    return new Response('Bad request', { status: 400 });
  }

  const photo = await prisma.notePhoto.findUnique({
    where: { id },
    select: {
      path: true,
      note: {
        select: {
          task: { select: { project: { select: { clientPortalToken: true } } } },
        },
      },
    },
  });
  if (!photo) return new Response('Not found', { status: 404 });
  if (photo.note.task.project.clientPortalToken !== token) {
    return new Response('Forbidden', { status: 403 });
  }

  const fullPath = safeUploadPath(photo.path);
  if (!fullPath) return new Response('Bad path', { status: 400 });

  try {
    const buf = await fs.readFile(fullPath);
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return new Response(body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buf.byteLength),
        // Public — cacheable by the client browser without
        // identity-tied invalidation.
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
