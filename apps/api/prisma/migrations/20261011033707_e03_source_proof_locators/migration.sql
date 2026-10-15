-- Page/range locators share one immutable source; match the existing 64-citation
-- answer budget while the application still caps distinct source origins at 12.
ALTER TABLE "ChatAiAnswerDependency"
  DROP CONSTRAINT "ChatAiAnswerDependency_handles_check",
  ADD CONSTRAINT "ChatAiAnswerDependency_handles_check"
    CHECK (cardinality("handles") BETWEEN 1 AND 64);
