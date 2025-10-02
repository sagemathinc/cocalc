# CoCalc2 Architecture Overview (Draft)

> This is a working draft meant to capture the current design in one place.

---

## Goals & Non‑Goals

**Goals**

- Fast, durable, multi‑tenant project storage with clear quotas.
- Predictable save from project runner VMs to the central file server \(no “I did work but it can’t be saved”\).
- Efficient storage via transparent compression; simple mental model for users.
- Rolling snapshots for user self‑service restore.  Separate quota for snapshots, which users mostly don't worry about.

**Non‑Goals**

- Per‑user UID separation on runners \(we rely on containerization and subvolume quotas instead\).
- Snapshots on runner VMs \(server owns snapshot history; runners are ephemeral\).

---

## High‑Level Components

1. **Central File Server** \(single large Btrfs filesystem\)
   - One Btrfs **subvolume per project** \(live working set\).
   - Compression enabled \(e.g., `zstd`\).
   - **Qgroups/Quotas** enabled for hard limits.
   - **Rolling snapshots** per project for user restore.
   - Named **user created snapshots**.

2. **Project Runner VMs** \(many; fast local SSD\)
   - Also Btrfs with compression and **per‑project subvolumes**.
   - Hard quotas sized slightly below the server quota to maintain save‑back headroom.
   - No persistent snapshots \(might use short‑lived read only snapshots for atomic rsync of rootfs\).

3. **Sync Layer**
   - **Mutagen**: near real‑time sync for user home files.
   - **rsync**: periodic sync for the container rootfs upper overlay.

4. **Web UI & Services**
   - Surfaced usage and limits \(live and snapshots\), snapshot browser/restore, warnings.

---

## Storage Model & Quotas

### Per‑Project Subvolume (File Server)

- Each project lives at `/mnt/project-<project-id>` as its **own subvolume**.
- **Compression** is enabled at the filesystem level; **quotas are enforced** _**after compression**_.
- Two distinct quota budget buckets:
  - **Live quota**: applies to the live subvolume.
  - **Snapshots quota**: applies to the aggregate of _all_ snapshots for that project.
- Quota for snapshots will be a simple function \(probably 2x\) of the live quota.

### Qgroups Structure

- Btrfs assigns each subvolume an implicit qgroup `0/<live-id>`.
- We create an **aggregate qgroup** `1/<live-id>` for that project’s snapshots.
- We apply limits:
  - **Live**: limit `0/<live-id>` \(or the path directly\) to, say, **10 GiB**.
  - **Snapshots**: limit `1/<live-id>` to, say, **20 GiB** total across all snapshots.
- On snapshot creation, we assign the snapshot’s `0/<snap-id>` **into** `1/<live-id>`.
- Using the **live subvolume ID as the aggregate id** avoids external ID bookkeeping.

### Runner VM Quotas

- Each runner has a **per‑project subvolume** with **quota set to ~85–90%** of the server’s live quota.
- Rationale: keeps **headroom** so save‑back to the server succeeds even if compression ratios differ.

### User‑Facing Explanation (docs‑ready blurb)

> **Storage quota is measured after compression.** Your project has a quota that measures the actual space consumed on disk. If your data compresses well, the sum of file sizes you see in the editor may exceed your quota and still fit. Snapshots have a separate quota \(twice the project quota\) that limits how much historical data is retained.

---

## Snapshots

- **Where**: server only, per project \(no long‑term snapshots on runners\).
- **How**: periodic RO snapshots \(e.g., 15 minute/hourly/daily/weekly retention\).
- **Budget**: snapshots all share the project’s **snapshot quota** \(`1/<live-id>` limit\). When the budget is exceeded, the snapshot retention policy prunes oldest automatic snapshots until under budget.  Explicit user created named snapshots are not automatically deleted.
- **Self‑service**: UI lets users browse/restore from snapshots; command line restore via rsync is also supported.

> **Note**: Runner nodes may take a **short‑lived RO snapshot** strictly for consistent `rsync` (copy‑on‑write point‑in‑time view), then delete it immediately after sync completes. This does not change policy: history lives on the server.

---

## Data Flow

1. **Active work on runner**
   - User edits files in their per‑project subvolume on a runner.
   - **Mutagen** streams home‑dir changes to the server nearly immediately.  In case of file change conflicts the central file server always wins.
   - **rsync** pushes the rootfs overlay periodically \(e.g., every minute\) from a transient snapshot for consistency.

2. **File Server receives changes**
   - Writes land in the project’s live subvolume, bounded by the live quota.
   - Periodic snapshots capture history and consume from the snapshots quota.

3. **Restore**
   - Users restore individual files or directories from snapshots via UI or CLI.

---

## Operational Procedures

The following is roughly what the actual Javascript code in `packages/file-server` does.   

### One‑Time Setup (per filesystem)

```bash
# Enable quotas once
sudo btrfs quota enable /mnt/fs
# Optional after bulk ops or enabling late
sudo btrfs quota rescan -w /mnt/fs
```

### Create a New Project (Server)

```bash
# Live subvolume
sudo btrfs subvolume create /mnt/project-$PROJECT_ID

# Set live quota (example: 10 GiB)
sudo btrfs qgroup limit 10G /mnt/project-$PROJECT_ID

# Snapshot aggregate group uses the live subvolume ID
LIVEID=$(sudo btrfs subvolume show /mnt/project-$PROJECT_ID | awk '/ID:/ {print $2}')

# Create and limit the snapshots group
sudo btrfs qgroup create 1/$LIVEID /mnt/
sudo btrfs qgroup limit 20G 1/$LIVEID /mnt/   # example snapshots budget
```

### Snapshot Creation (Server)

```bash
# Create RO snapshot
TS=$(date -u +%Y%m%dT%H%M%SZ)
SNAP=/mnt/project-$PROJECT_ID/.snapshots/$TS
sudo btrfs subvolume snapshot -r /mnt/project-$PROJECT_ID "$SNAP"

# Assign snapshot to the project’s snapshot group
SNAPID=$(sudo btrfs subvolume show "$SNAP" | awk '/ID:/ {print $2}')
LIVEID=$(sudo btrfs subvolume show /mnt/project-$PROJECT_ID | awk '/ID:/ {print $2}')
sudo btrfs qgroup assign 0/$SNAPID 1/$LIVEID /mnt
```

### Runner Subvolume & Quota

```bash
# Create per‑project subvolume on runner
sudo btrfs subvolume create /runnerfs/project-$PROJECT_ID

# Set runner quota to ~90% of server limit (example: 9 GiB)
sudo btrfs qgroup limit 9G /runnerfs/project-$PROJECT_ID
```

### Rsync from Runner \(optional transient snapshot\)

```bash
# (TODO)
P=/runnerfs/projects/$PROJ
TS=$(date -u +%Y%m%dT%H%M%SZ)
rsync -aHAX --delete ... file-server:/mnt/projects-$PROJECT_ID/.local/overlay/...
```

### Inspecting Usage

```bash
# Qgroup usage (referenced/exclusive, human‑readable)
sudo btrfs qgroup show -reF /mnt | less

# Filesystem space by class (useful with compression)
sudo btrfs filesystem df /mnt
```

---

## Policies & Safety

- **Hard quotas**: enforced by the kernel via qgroups \(both server and runner\). When a project exceeds its quota, writes fail with ENOSPC scoped to that subvolume.
- **Headroom on runners**: prevents the common failure mode where work done on a runner can’t be saved back to the server due to tighter server limits or different compression ratios.
- **User guidance**: expose a `~/scratch` directory \(separate subvolume and policy\) for large temporary files not intended for sync—reduces quota pressure on the live budget.   
- **Performance knobs**: `compress=zstd[:3]`, `ssd`, `discard=async`. Consider `autodefrag` only for heavy small‑random‑write workloads. Set `chattr +C` sparingly on paths needing no‑CoW \(trades off checksumming\).
- **Dedup** on runners: optional **bees** on runners to reduce local SSD usage; measure CPU/IO overhead under realistic load.  Use reflink copy\-on\-write when possible \(e.g., cloning projects\).
- **Dedup** on file server: optional **bees** to reduce disk usage.  Also extensively use copy\-on\-write, e.g., when copying files between projects.

---

## Failure Modes & Mitigations

- **Runner quota exceeded** → user sees ENOSPC early; save‑back fails fast and visibly. UI should warn near 80–90%.
- **Server live quota exceeded** → incoming syncs fail; UI callouts \+ guidance to delete files or increase quota.
- **Snapshot budget exceeded** → retention pruner deletes oldest snapshots until under budget.
- **Qgroup counter drift** \(rare, after crashes/bulk ops\) → `btrfs quota rescan -w` to reconcile.
- **Filesystem nearly full** → monitor `btrfs filesystem df`; alert admins before metadata pools are pressured.

---

## Observability (What to Monitor)

- Live and snapshots usage per project (qgroup referenced/exclusive).
- Runner vs server usage deltas (to detect pathological compression differences).
- Snapshot creation latency; pruner actions count.
- Error rates from mutagen/rsync; ENOSPC events; quota rescans.

---

## FAQ (User‑Facing)

**Q: My files add up to more than my quota, but I’m not blocked. Why?**  
A: Quotas measure space **after compression**. If your data compresses well, you can store more than the sum of uncompressed file sizes.

**Q: Do snapshots count against my main quota?**  
A: No. Snapshots have a **separate budget which is twice your main quota**. When that fills, older snapshots are pruned automatically.

**Q: What happens if I hit the quota while working?**  
A: New writes fail with “out of space.” Delete data or request a higher quota, then try again.

**Q: Can I keep big temporary outputs?**  
A: Use `~/scratch` \(limited retention and a separate quota\). Only the project’s live area is synced and counted against your main quota.

---

## Appendix: Rationale for Design Choices

- **Per‑project subvolumes** enable kernel‑level quotas, small blast radius, and fast deletion.
- **Server‑side snapshots only** simplify reasoning about history, save SSD cycles on runners, and reduce operational complexity.
- **Aggregate snapshot qgroup** provides a single dial for “how much history a project can accumulate.”
- **Runner quotas < server quotas** provide a simple, robust guardrail against save‑back failures due to compression variance.

---

_End of draft._

