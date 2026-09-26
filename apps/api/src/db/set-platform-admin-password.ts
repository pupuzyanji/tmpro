// v027.A — change the Platform Admin (/platform-admin) password from the
// server's command line:
//
//   npm run platform-admin:password -- owner@tmpro.app
//
// Prompts for the new password twice without echoing it, so it never lands
// in shell history or logs.

import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './client';
import { platformAdmins } from './schema';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') process.exit(130); // Ctrl+C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const admins = await db.select({ email: platformAdmins.email }).from(platformAdmins);
  if (!email) {
    console.log('Usage: npm run platform-admin:password -- <email>');
    console.log('Platform Admin accounts:', admins.map((a) => a.email).join(', ') || '(none)');
    process.exit(1);
  }
  const [row] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(sql`lower(${platformAdmins.email}) = ${email}`)
    .limit(1);
  if (!row) {
    console.error(`No Platform Admin with email ${email}. Existing: ${admins.map((a) => a.email).join(', ')}`);
    process.exit(1);
  }

  const pw = await askHidden('New password (12+ characters): ');
  if (pw.length < 12) {
    console.error('Too short — use at least 12 characters.');
    process.exit(1);
  }
  const again = await askHidden('Repeat new password: ');
  if (pw !== again) {
    console.error("The two passwords don't match. Nothing changed.");
    process.exit(1);
  }

  await db.update(platformAdmins).set({ passwordHash: await bcrypt.hash(pw, 10) }).where(eq(platformAdmins.id, row.id));
  console.log(`Password updated for ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
