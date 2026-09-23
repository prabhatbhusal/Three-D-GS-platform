// The vendored XGRIDS LCC Web SDK (src/vendor/sdk/lcc-web-sdk.js) ships no
// types and is excluded from typechecking (tsconfig `exclude`) — it's a single
// pre-minified ~1.4MB line. `any` here is deliberate: see CLAUDE.md §17/§8.2,
// "don't invent SDK options" applies to types too.
declare module '*lcc-web-sdk.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const LCCRender: any;
}

// three-mesh-bvh ships types for its workers only on the 'three-mesh-bvh/worker'
// index; meshModel.ts imports the single worker file directly (see there).
declare module 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js' {
  export { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
}
