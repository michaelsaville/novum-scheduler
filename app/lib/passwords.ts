import { randomBytes } from 'node:crypto';

export function generatePassword(): string {
  return randomBytes(14).toString('base64url').slice(0, 18);
}
