# Patches

- `c6ef09d-vs-b846a3e.unified.patch` — `git diff --binary b846a3e c6ef09d` excluding `docs/media` binaries and `handoff-screenshots`.
- `c6ef09d-vs-b846a3e.text.patch` — same path filter without forcing binary encoding (identical bytes here).

Apply direction (informational only — **DO NOT** apply to known-good/main for deploy):

```bash
# From a checkout of b846a3e (DO NOT DEPLOY RESULT):
git apply --check patches/c6ef09d-vs-b846a3e.unified.patch
```

Deletions of binary screenshots and omitted media are listed in `../DELETIONS.txt` and `../OMISSIONS.md`, not fully represented as binary blobs in these patches.
