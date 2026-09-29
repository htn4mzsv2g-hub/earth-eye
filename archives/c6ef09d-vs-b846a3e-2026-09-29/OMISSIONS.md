# Omissions — c6ef09d vs b846a3e archive (2026-09-29)

Everything deliberately **excluded** from patch/files content, and why.

## Secrets / credentials

| Path / pattern | Why |
|----------------|-----|
| `.env`, `.env.*` (except tracked `.env.example` if it differed — it did not) | Secrets |
| `.reviewer-cred*` / `.reviewer-cred.local` | Reviewer credentials (present on atlas-eye disk, gitignored) |
| Any credential/token/pem material | Secrets |

## Dependency / build / cache outputs

| Path / pattern | Why |
|----------------|-----|
| `node_modules/` | Dependencies; regenerable; huge |
| `dist/` | Build output |
| `200/` | Build/static deploy output |
| `.gev-cache/` | Runtime/binary cache |
| `.gev-logs/` | Logs |
| `.probe/` | Local probe artifacts |

## Git objects

| Item | Why |
|------|-----|
| Full `.git` object store | Not needed; patches + file snapshots suffice. Commits already exist in atlas-eye worktree git. |
| Packfiles / alternates | Omitted to keep archive small and non-deployable |

## Large media (not source-critical)

`docs/media/**` GIF/PNG binaries present at tip (~70 MB total) are **listed but not packed**.  
Inventory with size + content sha256: `meta/omitted-media-inventory.txt`.

Also omitted from patch bodies:

| Path pattern | Why |
|--------------|-----|
| `docs/media/*.gif`, `docs/media/*.png`, `docs/media/start-here/*` | Large demo media; not required to understand source delta |
| `handoff-screenshots/*` (deleted at tip vs known-good) | Screenshot PNGs; binary; listed in `DELETIONS.txt` |

`docs/media/README.md` **is included** (text).

## Screenshots / ignored local media

| Path | Why |
|------|-----|
| `screenshots/` (gitignored on atlas-eye, ~192M) | Local capture media; not tracked product source |

## Unchanged / identical

~1771 tracked non-omitted paths have **identical blob SHAs** between tip and known-good — not duplicated in `files/`.

## Scope note

Omitted media still appears in `diffstat-git-all.txt` / full name-status for completeness.  
Included patch scope matches non-media, non-handoff-screenshot paths (66 `diff --git` headers).
