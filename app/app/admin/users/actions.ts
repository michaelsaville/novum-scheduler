'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { generatePassword } from '@/lib/passwords';

export type AdminUserState = {
  ok: boolean;
  error: string | null;
  message: string | null;
  reveal: { username: string; password: string } | null;
};

const initialState: AdminUserState = { ok: false, error: null, message: null, reveal: null };

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return null;
  }
  return session;
}

const ROLES = ['admin', 'scheduler', 'installer'] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function createUser(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  if (!(await requireAdmin())) {
    return { ...initialState, error: 'Forbidden' };
  }

  const username = String(formData.get('username') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  const colorRaw = String(formData.get('color') ?? '').trim();
  const color = colorRaw === '' ? null : colorRaw;

  if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
    return { ...initialState, error: 'Username must be 2–32 chars: lowercase letters, digits, dot, underscore, hyphen.' };
  }
  if (name.length < 1 || name.length > 80) {
    return { ...initialState, error: 'Name is required (max 80 characters).' };
  }
  if (!isRole(role)) {
    return { ...initialState, error: 'Invalid role.' };
  }
  if (color !== null && !HEX_COLOR.test(color)) {
    return { ...initialState, error: 'Color must be a 6-digit hex like #2563eb.' };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return { ...initialState, error: `Username "${username}" is already taken.` };
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { username, name, role, color, passwordHash },
  });

  revalidatePath('/admin/users');
  return {
    ok: true,
    error: null,
    message: `Created user "${username}". Capture the password below — it will not be shown again.`,
    reveal: { username, password },
  };
}

export async function resetPassword(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  if (!(await requireAdmin())) {
    return { ...initialState, error: 'Forbidden' };
  }

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { ...initialState, error: 'Missing user id.' };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ...initialState, error: 'User not found.' };

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  revalidatePath('/admin/users');
  return {
    ok: true,
    error: null,
    message: `New password for "${user.username}". Capture it now — it will not be shown again.`,
    reveal: { username: user.username, password },
  };
}

export async function setActive(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await requireAdmin();
  if (!session) return { ...initialState, error: 'Forbidden' };

  const userId = String(formData.get('userId') ?? '');
  const active = formData.get('active') === 'true';
  if (!userId) return { ...initialState, error: 'Missing user id.' };

  if (userId === session.user.id && !active) {
    return { ...initialState, error: 'You cannot deactivate your own account.' };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { active },
  });

  revalidatePath('/admin/users');
  return {
    ok: true,
    error: null,
    message: `${user.username} is now ${active ? 'active' : 'inactive'}.`,
    reveal: null,
  };
}

export async function setRole(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await requireAdmin();
  if (!session) return { ...initialState, error: 'Forbidden' };

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!userId) return { ...initialState, error: 'Missing user id.' };
  if (!isRole(role)) return { ...initialState, error: 'Invalid role.' };

  if (userId === session.user.id && role !== 'admin') {
    return { ...initialState, error: 'You cannot demote your own account.' };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath('/admin/users');
  return {
    ok: true,
    error: null,
    message: `${user.username} is now ${role}.`,
    reveal: null,
  };
}

export async function setColor(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  if (!(await requireAdmin())) {
    return { ...initialState, error: 'Forbidden' };
  }

  const userId = String(formData.get('userId') ?? '');
  const colorRaw = String(formData.get('color') ?? '').trim();
  const color = colorRaw === '' ? null : colorRaw;
  if (!userId) return { ...initialState, error: 'Missing user id.' };
  if (color !== null && !HEX_COLOR.test(color)) {
    return { ...initialState, error: 'Color must be a 6-digit hex like #2563eb or empty to clear.' };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { color },
  });

  revalidatePath('/admin/users');
  return {
    ok: true,
    error: null,
    message: `Color updated for ${user.username}.`,
    reveal: null,
  };
}
