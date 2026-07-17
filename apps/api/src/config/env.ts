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
    DEV_AUTH_USER_EMAIL: z.string().email().default('admin@galaxy.local'),
  })
  .refine(
    (environment) =>
      !(environment.NODE_ENV === 'production' && environment.ALLOW_DEV_AUTH),
    {
      message: 'Development authentication cannot be enabled in production',
      path: ['ALLOW_DEV_AUTH'],
    },
  );

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(source);
}
