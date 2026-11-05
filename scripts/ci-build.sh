#!/usr/bin/env bash
# CI's build, used by both jobs. Turbopack sometimes stops on `next/font/google
# queries have exactly one entry` before anything has been tested, and the same
# commit builds on a rerun. Retry only that error, so a real build failure still
# fails the first time.
for attempt in 1 2 3; do
  if pnpm build 2>&1 | tee build.log; test "${PIPESTATUS[0]}" -eq 0; then
    exit 0
  fi
  if ! grep -q "next/font/google" build.log; then
    exit 1
  fi
  echo "::warning::font resolution failed the build on attempt $attempt, retrying"
  sleep 10
done
exit 1
