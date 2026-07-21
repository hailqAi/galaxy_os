/* global Buffer, console, process */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createInterface, emitKeypressEvents } from 'node:readline';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Administrator password reset is disabled in production');
  if (process.argv.slice(2).some((argument) => argument !== '--'))
    throw new Error(
      'Administrator password reset accepts environment variables only',
    );

  let password = process.env.ADMIN_TEMP_PASSWORD;
  delete process.env.ADMIN_TEMP_PASSWORD;
  if (!password && process.stdin.isTTY) {
    password = await hidden('Temporary password: ');
    const confirmation = await hidden('Confirm temporary password: ');
    if (password !== confirmation) throw new Error('Passwords do not match');
  }
  if (!password) throw new Error('A temporary password is required');
  if (password.length < 15)
    throw new Error('Temporary password must be at least 15 characters');
  if (Buffer.byteLength(password) > 72)
    throw new Error('Temporary password must be at most 72 UTF-8 bytes');

  const email = (
    process.env.ADMIN_EMAIL ??
    process.env.DEV_AUTH_USER_EMAIL ??
    'admin@galaxy.local'
  )
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('A valid administrator email is required');

  const rounds = Number(process.env.PASSWORD_BCRYPT_ROUNDS ?? 12);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 14)
    throw new Error('PASSWORD_BCRYPT_ROUNDS must be between 4 and 14');
  if (process.stdin.isTTY) {
    const answer = await question(
      `Reset protected System Administrator ${email} in ${process.env.NODE_ENV ?? 'development'}? Type the email to confirm: `,
    );
    if (answer.trim().toLowerCase() !== email)
      throw new Error('Administrator reset cancelled');
  } else if (process.env.ADMIN_CONFIRM_EMAIL?.trim().toLowerCase() !== email) {
    throw new Error('ADMIN_CONFIRM_EMAIL must match the target email');
  }
  const passwordHash = await hash(password, rounds);
  password = undefined;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { normalizedEmail: email },
      include: {
        organizationMembers: {
          where: {
            status: 'active',
            administrationScope: 'SYSTEM',
            organization: {
              name: 'Galaxy Centre',
              slug: 'galaxy-centre',
              status: 'active',
            },
          },
          include: {
            roles: {
              where: {
                status: 'active',
                scopeType: 'SYSTEM',
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                role: {
                  code: 'system_admin',
                  status: 'active',
                  isSystem: true,
                  isProtected: true,
                  category: 'SYSTEM',
                  maximumScope: 'SYSTEM',
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new Error('Administrator not found');
    if (user.status !== 'active')
      throw new Error('Administrator is not active');
    const membership = user.organizationMembers[0];
    if (!membership)
      throw new Error('Active administrator membership is required');
    if (user.organizationMembers.length !== 1 || membership.roles.length !== 1)
      throw new Error(
        'One active protected system administrator membership is required',
      );

    const now = new Date();
    await tx.passwordCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: now,
      },
      update: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    const sessions = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const resetTokens = await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        organizationId: membership.organizationId,
        actorUserId: null,
        action: 'system.admin.password.reset',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          source: 'local administrative reset',
          targetEmail: email,
          sessionsRevoked: sessions.count,
          resetTokensRevoked: resetTokens.count,
        },
      },
    });
    return { sessions: sessions.count, resetTokens: resetTokens.count };
  });

  console.log(
    `Administrator password reset for ${email} in ${process.env.NODE_ENV ?? 'development'}; sessions revoked: ${result.sessions}; reset tokens revoked: ${result.resetTokens}; mustChangePassword: true`,
  );
}

function question(prompt) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer);
    }),
  );
}

async function hidden(prompt) {
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  let value = '';
  for await (const chunk of process.stdin) {
    const character = chunk.toString();
    if (character === '\r' || character === '\n') break;
    if (character === '\u0003')
      throw new Error('Administrator reset cancelled');
    if (character === '\u007f') value = value.slice(0, -1);
    else value += character;
  }
  process.stdin.setRawMode(false);
  process.stdout.write('\n');
  return value;
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Password reset failed',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
