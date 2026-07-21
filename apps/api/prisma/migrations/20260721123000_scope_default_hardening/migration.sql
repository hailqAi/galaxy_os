-- New assignments must be least-privileged unless their scope is explicit.
ALTER TABLE "UserRole" ALTER COLUMN "scopeType" SET DEFAULT 'SELF';
