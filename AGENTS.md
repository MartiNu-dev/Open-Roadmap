# Codex Test Execution Rules

These instructions apply to future Codex work in this repository.

## Test Command Time Limits

- Every test command run by Codex must have an explicit maximum execution time.
- Prefer narrow, targeted test commands over broad full-suite runs.
- Default command time limits:
  - Frontend unit tests: 120000 ms
  - Backend unit/integration tests: 120000 ms
  - End-to-end or environment-dependent tests: 300000 ms max
- Do not run a test command without a timeout.

## Timeout Handling

- If a test command reaches its timeout, treat it as a failed verification attempt.
- Do not keep retrying the same hanging command without changing scope or approach.
- After a timeout, Codex must stop automated verification for that command and clearly ask for human validation.
- The response must state:
  - which command timed out
  - what was verified before the timeout, if anything
  - which manual test a human should run next

## When Writing Tests

- Avoid tests with unbounded waits, infinite polling, or background processes that can hang indefinitely.
- For async UI tests, use bounded waits and the smallest realistic timeout.
- For server or integration tests, prefer startup checks with a hard deadline and fail fast when dependencies do not come up.
- If a test depends on external services, browsers, Docker, or local environment state, document the required manual fallback in the final message.

## Human Fallback Rule

- If automated verification is blocked by timeout, missing dependencies, or unstable environment setup, Codex must not pretend the test passed.
- Codex must explicitly request a human to run the remaining verification and provide a short manual checklist.
