import { promises as fs } from 'node:fs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { safeUploadPath } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  if (!id || id.length > 64) {
    return new Response('Bad request', { status: 400 });
  }

  const photo = await prisma.notePhoto.findUnique({
    where: { id },
    include: {
      note: {
        include: {
          task: { select: { assignedInstallerId: true } },
        },
      },
    },
  });
  if (!photo) return new Response('Not found', { status: 404 });

  // Authorization: any logged-in scheduler/admin can view; installers
  // only on their own assigned tasks.
  const role = session.user.role;
  const isAssigned = photo.note.task.assignedInstallerId === session.user.id;
  if (role === 'installer' && !isAssigned) {
    return new Response('Forbidden', { status: 403 });
  }

  const fullPath = safeUploadPath(photo.path);
  if (!fullPath) return new Response('Bad path', { status: 400 });

  try {
    const buf = await fs.readFile(fullPath);
    // Convert Node Buffer to Uint8Array for the Web Response body type.
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return new Response(body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
