# Per Project Backup Secrets and Key Management

This document describes how per-project backup secrets are generated, stored, and
used for Rustic repositories. It also outlines a safe path for master-key
rotation and crypto-erase semantics.

## Goals

- Each project has its own Rustic repository password.
- Secrets are not stored in plaintext in the database.
- A database leak alone does not expose backup passwords.
- Projects can be crypto\-erased by deleting their per\-project secret.
- Projects become impossible to recover when backups of the database age out.

## Current Design

- A **master key** is stored on disk at:
  - `DATA/secrets/backup-master-key`
  - This file is created automatically if missing (similar to `conat-password`).
  - The key is **not** stored in the database.
  - In Kubernetes, the file should be mounted from a secret.

- Each project has a random secret stored in Postgres:
  - Table: `project_backup_secrets`
  - Column: `secret`
  - Format: `v1:<iv_b64>:<tag_b64>:<cipher_b64>` (AES-256-GCM)

- When a project host requests backup configuration:
  - The control plane decrypts the secret using the master key.
  - The secret is embedded into the Rustic TOML.

### Security Properties

- **DB leak only**: secrets remain encrypted without the master key.
- **Master key leak only**: no secrets to decrypt without DB data.
- **Both leaked**: secrets are exposed (as with any envelope-encryption design).

### Deletion Semantics

- Deleting `project_backup_secrets` for a project makes the repo unrecoverable
  (crypto-erase).
- DB backups that still contain the encrypted secret delay deletion until those
  backups expire. This is acceptable if backup retention is short and documented.

## Rotation Plan (Future)

Rotation is intended to decouple:

- **DB backup retention** (how long old DB snapshots exist)
- **Project deletion guarantees** (when data is irrecoverable)

Recommended approach:

1. Move to a **keyring** file:
   - Example format:
     ```
     {
       "active": "k2026-01-01",
       "keys": {
         "k2026-01-01": "<base64>",
         "k2025-10-01": "<base64>"
       }
     }
     ```
2. Update the encrypted secret format to include a key id:
   - `v2:<kid>:<iv_b64>:<tag_b64>:<cipher_b64>`
3. On read:
   - Select the correct key from the keyring.
4. On write:
   - Always encrypt using the active key.
5. Rotation procedure:
   - Add a new active key.
   - Optionally rewrap all secrets in the background.
   - Keep old keys until all DB backups older than the rotation are expired.
   - Remove old keys once safe.

This enables **fast project deletion** (delete secret) while also allowing
timed retirement of old keys to enforce hard deletion over time.

## Operational Notes

- The master key file must be backed up securely; losing it makes **all** project
  backups unrecoverable.
- For local dev, the file is generated automatically.
- For production, treat the master key like any other high-value secret.

