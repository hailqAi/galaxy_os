import { z } from 'zod';

const environmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().url().startsWith('postgresql://'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    ALLOW_DEV_AUTH: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DEV_AUTH_USER_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .default('admin@galaxy.local'),
    SESSION_COOKIE_NAME: z.string().min(1).default('galaxy_session'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(60),
    AVATAR_STORAGE_PATH: z.string().min(1).default('/tmp/galaxy-os-avatars'),
    AVATAR_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(2_097_152)
      .default(2_097_152),
    APP_PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PASSWORD_BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(12),
    PASSWORD_RESET_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(60)
      .default(30),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().email().default('no-reply@galaxy.local'),
  })
  .refine(
    (environment) =>
      !(environment.NODE_ENV === 'production' && environment.ALLOW_DEV_AUTH),
    {
      message: 'Development authentication cannot be enabled in production',
      path: ['ALLOW_DEV_AUTH'],
    },
  )
  .refine(
    (environment) =>
      environment.NODE_ENV !== 'production' ||
      (environment.APP_PUBLIC_ORIGIN.startsWith('https://') &&
        new URL(environment.APP_PUBLIC_ORIGIN).origin ===
          environment.APP_PUBLIC_ORIGIN),
    {
      message: 'Production APP_PUBLIC_ORIGIN must use HTTPS',
      path: ['APP_PUBLIC_ORIGIN'],
    },
  )
  .refine(
    (environment) =>
      environment.NODE_ENV !== 'production' || environment.TRUST_PROXY,
    {
      message: 'TRUST_PROXY must be enabled in production',
      path: ['TRUST_PROXY'],
    },
  )
  .refine(
    (environment) =>
      environment.NODE_ENV !== 'production' ||
      (!['localhost', '127.0.0.1'].includes(environment.SMTP_HOST) &&
        !environment.APP_PUBLIC_ORIGIN.includes('localhost') &&
        !environment.EMAIL_FROM.endsWith('@galaxy.local')),
    {
      message:
        'Production requires explicit trusted application and email configuration',
      path: ['SMTP_HOST'],
    },
  );

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(source);
}
