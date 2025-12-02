# CoCalc Plus

CoCalc Plus is the productized wrapper around the lightweight core shipped in `@cocalc/lite`. It exists so we can ship a branded, single-machine experience without duplicating the underlying hub/server/database logic.

## Role

- Builds directly on the Lite core for a single-user CoCalc experience (optionally acting as a compute server).
- Adds only product-level defaults (branding, configuration presets, packaging), not new logic.
- Serves as the public entry point for the “CoCalcPlus” SKU while keeping shared code in [../lite](../lite/README.md).

## Change Discipline

- Keep implementation in Lite. If a feature is useful beyond Plus, add it to Lite rather than here.
- Plus should remain declarative: configuration, presets, and packaging only; no podman/btrfs/ssh plumbing.
- Avoid introducing new dependencies unless they belong in Lite. Treat Plus as a thin layer to keep the dependency graph clean.
- When Lite gains new capabilities, Prefer re-exporting or configuring them here instead of re-implementing.

## Getting Started

- Build with `pnpm --filter @cocalc/plus build`.
- At runtime this package re-uses Lite’s entry points; future product-specific CLI or packaging should wrap Lite rather than fork it.
