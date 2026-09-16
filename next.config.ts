import { fileURLToPath } from 'url';
import path from 'path';
import type { NextConfig } from 'next';

// Deploy under a sub-path (e.g. GitHub Pages) by setting NEXT_PUBLIC_BASE_PATH
// to the same value for both the Next router and src/lib/scenes.ts's asset
// root — Next does not rewrite hand-written `/public` asset paths itself.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  basePath,

  // Pin the workspace root to this repo — a lockfile in a parent folder on
  // this machine otherwise makes Next guess (and warn about) the wrong one.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),

  // Static export for the GitHub Pages demo workflow only (.github/workflows/
  // deploy.yml sets NEXT_OUTPUT_EXPORT=1). GitHub Pages can't run the Node API
  // in /server, so that build ships the viewer alone — it degrades gracefully
  // (lib/scenes.js falls back to its baked-in list) exactly as it does today
  // whenever the API is unreachable. The real deploy target is a Node host
  // (`next start`) plus the API server, per CLAUDE.md.
  ...(process.env.NEXT_OUTPUT_EXPORT ? { output: 'export' } : {}),

  // LCCRender (src/vendor/sdk/lcc-web-sdk.js) is a module-level singleton.
  // React's Strict Mode double-invokes effects in dev, which tears the live
  // renderer down mid-mount — same reason main.jsx never used <StrictMode>.
  reactStrictMode: false,

  // Next 16 will generate/overwrite a root CLAUDE.md of its own otherwise —
  // this repo's CLAUDE.md is the hand-maintained brief (§0), never a
  // tool-generated file. Keep this off.
  agentRules: false,

  // NextConfig#webpack is typed `any` by Next itself (webpack's own types
  // aren't a resolvable dependency here), so `config` stays untyped too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any) {
    // The vendored SDK is pre-minified onto a single ~1.4 MB line with a few
    // misplaced `/* @__PURE__ */` comments Rolldown/Rollup used to warn about
    // (vite.config.js silenced INVALID_ANNOTATION for the same reason).
    // Webpack doesn't choke on it, just don't waste time source-mapping it.
    config.module.rules.push({
      test: /lcc-web-sdk\.js$/,
      resolve: { fullySpecified: false }
    });
    return config;
  }
};

export default nextConfig;
