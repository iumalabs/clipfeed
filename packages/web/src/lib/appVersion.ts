// Injected at build time via esbuild's `define` (see scripts/build.ts),
// sourced from .release-please-manifest.json — the same version
// release-please bumps on every release, so the footer never needs a
// separate manual update. The `typeof` guard (rather than a bare
// reference) matters outside an esbuild bundle — e.g. under `deno test`,
// which never runs esbuild's define substitution — where a bare
// `__APP_VERSION__` reference would throw ReferenceError at module load.
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
