import { z } from 'zod';
import { resolve, sep } from 'node:path';

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
    FEATURE_MARKETING: z
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
    UPLOAD_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(21_474_836_480),
    UPLOAD_ORGANIZATION_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(107_374_182_400),
    UPLOAD_GLOBAL_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(1_099_511_627_776),
    UPLOAD_STAGING_CAPACITY_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(824_633_720_832),
    UPLOAD_ACTOR_STAGING_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
    UPLOAD_PART_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(5_242_880)
      .max(1_073_741_824)
      .default(67_108_864),
    LOCAL_UPLOAD_PATH: z.string().min(1).default('/tmp/galaxy-os-uploads'),
    FILE_STORAGE_PATH: z.string().min(1).default('../../.runtime/files'),
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
      BigInt(environment.UPLOAD_GLOBAL_QUOTA_BYTES) >=
      BigInt(environment.UPLOAD_ORGANIZATION_QUOTA_BYTES),
    {
      message: 'Global file capacity must cover every organization quota',
      path: ['UPLOAD_GLOBAL_QUOTA_BYTES'],
    },
  )
  .refine(
    (environment) => {
      const files = resolve(environment.FILE_STORAGE_PATH);
      const staging = resolve(environment.LOCAL_UPLOAD_PATH);
      return (
        files !== staging &&
        !files.startsWith(`${staging}${sep}`) &&
        !staging.startsWith(`${files}${sep}`)
      );
    },
    {
      message: 'File storage and upload staging paths must be disjoint',
      path: ['LOCAL_UPLOAD_PATH'],
    },
  )
  .refine(
    (environment) =>
      BigInt(environment.UPLOAD_ORGANIZATION_QUOTA_BYTES) >=
      BigInt(environment.UPLOAD_MAX_FILE_BYTES) * 3n,
    {
      message: 'Upload organization quota must cover staging amplification',
      path: ['UPLOAD_ORGANIZATION_QUOTA_BYTES'],
    },
  )
  .refine(
    (environment) =>
      BigInt(environment.UPLOAD_STAGING_CAPACITY_BYTES) >=
      (BigInt(environment.UPLOAD_GLOBAL_QUOTA_BYTES) * 2n + 2n) / 3n,
    {
      message: 'Upload staging capacity cannot absorb finalization',
      path: ['UPLOAD_STAGING_CAPACITY_BYTES'],
    },
  )
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
  const environment = environmentSchema.parse(source);
  if (
    environment.NODE_ENV === 'production' &&
    source.UPLOAD_GLOBAL_QUOTA_BYTES === undefined
  )
    throw new Error('Production requires explicit UPLOAD_GLOBAL_QUOTA_BYTES');
  if (
    environment.NODE_ENV === 'production' &&
    source.UPLOAD_STAGING_CAPACITY_BYTES === undefined
  )
    throw new Error(
      'Production requires explicit UPLOAD_STAGING_CAPACITY_BYTES',
    );
  return environment;
}
