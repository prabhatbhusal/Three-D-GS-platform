/** One file from a dropped/browsed folder, with its path inside that folder. */
export interface StagedFile {
  relPath: string;
  file: File;
}

export interface UploadProgress {
  bytesSent: number;
  bytesTotal: number;
}

/** What POST /api/assets/:id/finalize returns (CLAUDE.md §7.1 step 2).
 *  meta.lcc2 turned out to be plain JSON despite the extension, so the
 *  server does read a real splat count and bbox out of it — and checks that
 *  every tile the index references was actually uploaded. */
export interface UploadResult {
  assetId: string;
  bytes: number;
  fileCount: number;
  splatCount: number | null;
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Where meta.lcc2 actually landed inside the asset — not always the root:
   *  a folder-picker upload keeps the chosen folder's own name as the first
   *  path segment (e.g. "bar-restro/meta.lcc2"). */
  meta: string;
}

export type VariantTier = 'high' | 'medium' | 'low';
