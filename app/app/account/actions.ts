'use server';

import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type ChangePasswordState = {
  ok: boolean;
  error: string | null;
  message: string | null;
};

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not signed in', message: null };
  }

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (next.length < 12) {
    return { ok: false, error: 'New password must be at least 12 characters.', message: null };
  }
  if (next !== confirm) {
    return { ok: false, error: 'New passwords do not match.', message: null };
  }
  if (next === current) {
    return { ok: false, error: 'New password must differ from current password.', message: null };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active) {
    return { ok: false, error: 'Account not available.', message: null };
  }

  const matches = await bcrypt.compare(current, user.passwordHash);
  if (!matches) {
    return { ok: false, error: 'Current password is incorrect.', message: null };
  }

  const newHash = await bcrypt.hash(next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  return { ok: true, error: null, message: 'Password updated.' };
}
