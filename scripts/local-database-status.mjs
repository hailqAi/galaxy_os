// Chỉ metadata trong transaction READ ONLY; không xuất row nghiệp vụ/credential.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requireApi = createRequire(resolve(process.cwd(), 'package.json'));
const { PrismaClient } = requireApi('@prisma/client');
const db = new PrismaClient({ log: [] });
try {
  const metadata = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [identity] = await tx.$queryRawUnsafe(
      'SELECT current_database() AS name, current_schema() AS schema',
    );
    const migrations = await tx.$queryRawUnsafe(
      'SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    );
    const [failed] = await tx.$queryRawUnsafe(
      'SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL',
    );
    const [structure] = await tx.$queryRawUnsafe(`
      SELECT md5(string_agg(definition, E'\\n' ORDER BY definition)) AS fingerprint
      FROM (
        SELECT table_name || ':' || column_name || ':' || data_type || ':' || udt_name || ':' || coalesce(numeric_precision::text,'') || ':' || coalesce(numeric_scale::text,'') || ':' || coalesce(character_maximum_length::text,'') || ':' || coalesce(datetime_precision::text,'') || ':' || is_nullable || ':' || coalesce(column_default,'') AS definition
        FROM information_schema.columns WHERE table_schema = current_schema()
        UNION ALL SELECT tablename || ':' || indexdef FROM pg_indexes WHERE schemaname = current_schema()
        UNION ALL SELECT conrelid::regclass::text || ':' || pg_get_constraintdef(oid)
        FROM pg_constraint WHERE connamespace = current_schema()::regnamespace
      ) definitions`);
    return {
      ...identity,
      migrations,
      unresolved: failed.count,
      structure: structure.fingerprint,
    };
  });
  process.stdout.write(JSON.stringify(metadata));
} catch {
  process.stderr.write(
    'Không đọc được metadata database local; không khởi chạy.\n',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
