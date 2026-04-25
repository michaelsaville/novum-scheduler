import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

type SeedUser = {
  username: string;
  name: string;
  role: Role;
  color?: string;
};

const seedUsers: SeedUser[] = [
  { username: 'msaville', name: 'Mark Saville', role: 'admin' },
  { username: 'chris', name: 'Chris', role: 'installer', color: '#2563eb' },
  { username: 'jgoodrum', name: 'Josh Goodrum', role: 'installer', color: '#dc2626' },
];

function generatePassword(): string {
  // 18 base64url chars ≈ 108 bits of entropy. Easy to type once, strong enough.
  return randomBytes(14).toString('base64url').slice(0, 18);
}

async function main() {
  const printed: Array<{ username: string; password: string }> = [];

  for (const u of seedUsers) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      console.log(`SKIP  ${u.username} — already exists`);
      continue;
    }
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        username: u.username,
        name: u.name,
        role: u.role,
        passwordHash,
        color: u.color ?? null,
      },
    });
    printed.push({ username: u.username, password });
  }

  if (printed.length === 0) {
    console.log('No new users created.');
    return;
  }

  console.log('');
  console.log('=== INITIAL CREDENTIALS — capture these now, they are NOT stored ===');
  for (const p of printed) {
    console.log(`  ${p.username.padEnd(10)}  ${p.password}`);
  }
  console.log('===================================================================');
  console.log('Distribute to each user. They can rotate via /account once signed in.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
