# npm Dependency Updates

Update npm/pnpm dependencies in the CoCalc monorepo — security patches from Dependabot, bumping specific packages, or managing transitive dependency overrides.

## Key Rules

- Never run raw `pnpm install` in `src/packages/`. Always use `python3 workspaces.py install` from `src/`.
- The lockfile is at `src/packages/pnpm-lock.yaml`.
- Overrides live in `src/packages/package.json` under `pnpm.overrides`.
- **minimumReleaseAge**: pnpm is configured with a minimum release age (currently 3 days, see `src/packages/pnpm-workspace.yaml`). This is a supply-chain safety guard — do NOT bypass it casually. See "Handling minimumReleaseAge failures" below for the full policy.
- **Clean up exclusions**: At the start of every dependency update session, remove all entries from `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Previous exclusions were only needed because those packages were too fresh at the time — by now they should be past the age threshold. The goal is to keep this list empty.

## Quick Reference

| Task | Command |
|------|---------|
| Read Dependabot alerts | `gh api repos/sagemathinc/cocalc/dependabot/alerts --jq '.[] \| select(.state == "open")'` |
| Trace who pulls in a dep | `cd src/packages && pnpm why <package> -r` |
| Check lockfile for a version | `grep '<package>@<version>' pnpm-lock.yaml` |
| Find direct dep in packages | `grep -r '"<package>"' packages/*/package.json` |
| Install after changes | `cd src && python3 workspaces.py install` |
| Check version consistency | `cd src && python3 workspaces.py version-check` |

## Workflow 1: Fixing Dependabot Security Alerts

### 1. Read the alerts

```bash
gh api repos/sagemathinc/cocalc/dependabot/alerts --paginate --jq \
  '.[] | select(.state == "open") | {
    number,
    package: .security_vulnerability.package.name,
    severity: .security_advisory.severity,
    vulnerable_versions: .security_vulnerability.vulnerable_version_range,
    first_patched: .security_vulnerability.first_patched_version.identifier,
    summary: .security_advisory.summary
  }'
```

### 2. Classify each alert

- **Direct dependency?** `grep -r '"<package>"' packages/*/package.json`
- **Transitive?** `pnpm why <package> -r` to trace the chain
- **What version in lockfile?** `grep '<package>@' pnpm-lock.yaml`

### 3. Fix strategy

**Direct dependency** — bump it in the relevant `package.json`, then:
```bash
cd src && python3 workspaces.py version-check && python3 workspaces.py install
```

**Transitive, parent has newer version** — bump the parent the same way.

**Transitive, no upstream fix** — add a pnpm override in `src/packages/package.json`:
```json
{
  "pnpm": {
    "overrides": {
      "<package>@<vulnerable-selector>": "<fixed-version>"
    }
  }
}
```

### 4. Override selector patterns

Match existing conventions. Common patterns:
```
"<package>@<1.2.3": "1.2.4"            // below version
"<package>@<=1.2.3": "1.2.4"           // up to and including
"<package>@>=2.0.0 <2.3.0": "2.3.0"   // specific major line
```

When a package has multiple major versions in the tree (e.g. ajv 6.x and 8.x), use **separate overrides per range**:
```json
"ajv@>=6.0.0 <6.14.0": "6.14.0",
"ajv@>=8.0.0 <8.18.0": "8.18.0"
```

### 5. Version-check, install, and verify

After any `package.json` changes, **always** run version-check first, then install:
```bash
cd src && python3 workspaces.py version-check && python3 workspaces.py install
grep '<package>@<old-version>' src/packages/pnpm-lock.yaml   # should return nothing
```

If install fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, see "Handling minimumReleaseAge failures" below — do not blindly add an exclusion.

## Handling minimumReleaseAge failures

The 3-day minimum release age exists to protect against compromised or typo-squatted packages disguised as security updates. Exceptions require all of the following:

### Prerequisites — ALL must be met

1. **Prominent package only.** The package must be widely used and well-known (lodash, axios, express, etc.). Obscure or single-maintainer packages do not qualify — wait the full 3 days.
2. **At least 24 hours old.** Never bypass the age gate for a version published less than 1 day ago, regardless of the package.
3. **Manual inspection of the release.** Before adding an exclusion, look at the actual release:
   - `npm view <package> homepage` to find the repository
   - Check the GitHub release / tag / CHANGELOG for the target version
   - If the changelog is thin or absent, look at the commits between the previous version and the target version directly (`https://github.com/<org>/<repo>/compare/v<old>...v<new>`)
   - Verify the release content matches the claimed security fix — it should be a small, focused patch, not a large refactor or feature dump

### How to apply the exclusion

Only after all prerequisites are satisfied:

```yaml
# in src/packages/pnpm-workspace.yaml
minimumReleaseAgeExclude:
  - <package-name>
```

Then re-run `python3 workspaces.py install`. After a successful install, verify the lockfile resolves the patched version.

### If prerequisites are NOT met

Skip the package for this session. Note it in the PR description or commit message as deferred. It will be picked up automatically next time `/npm-dependency-updates` is run, once the version has matured past the age threshold.

## Workflow 2: Updating a Specific Package

```bash
# 1. Find where it's used
grep -r '"<package>"' packages/*/package.json

# 2. Check what's available
npm view <package> versions --json | tail -10

# 3. Check for breaking changes before major bumps
npm view <package> homepage   # find repo, check CHANGELOG / releases
npm view <package>@<version> engines   # Node.js requirement

# 4. Update package.json(s), then:
cd src && python3 workspaces.py version-check && python3 workspaces.py install

# 5. Build and test
cd src/packages/<affected-pkg> && pnpm build && pnpm test
```

For frontend changes specifically:
```bash
cd src/packages/frontend && pnpm tsc --noEmit
cd src/packages/static && pnpm build-dev
```

## Workflow 3: Auditing Transitive Dependencies

```bash
# Full dependency tree scan
cd src/packages && pnpm why <package> -r

# What version did the lockfile resolve?
grep '<package>@' pnpm-lock.yaml

# What depends on it? (lockfile level)
grep -B5 '<package>: <version>' pnpm-lock.yaml

# Does an override already exist?
grep '<package>' src/packages/package.json
```

## Testing Implications

| What changed | What to test |
|-------------|-------------|
| Dev-only dep (jest, eslint) | `pnpm test` in affected packages |
| Build dep (webpack, terser) | `cd packages/static && pnpm build-dev` |
| Runtime dep | Build + test + manual smoke test |
| Direct dep bump | Build + test in that package + downstream |

## Common Mistakes

- Running `pnpm install` directly instead of `python3 workspaces.py install`
- Forgetting `version-check` after editing package.json
- Overly broad override selectors (no range) that pin future versions too
- Not verifying the old version is gone from the lockfile
- Not checking if an override for that package already exists
- Leaving stale entries in `minimumReleaseAgeExclude` from previous sessions

## PR Conventions

- Branch name: `npm-YYYYMMDD` for batch updates
- Commit prefix: `deps:` for dependency changes
- Keep PR descriptions factual without detailing specific CVEs (public repo)
