/**
 * Chunked resumable upload engine for the studio's Uploader (CLAUDE.md §7.1).
 * Two independent jobs:
 *
 *   1. Walk a dropped folder (drag-and-drop DataTransferItems, or a
 *      <input webkitdirectory> FileList) into a flat file list.
 *   2. Push that file list to the server 8 MB at a time, resuming from
 *      wherever the server says it already got to if a chunk fails.
 *
 * A folder (drag or browse) or a single .zip both work — a lone .zip is
 * uploaded as one file and extracted server-side on finalize
 * (server/src/routes/assets.js), so the client never needs to look inside it.
 */
import { createAsset, initAssetFile, uploadAssetChunk, finalizeAsset, finalizeAudio } from './api';
import type { StagedFile, UploadProgress, UploadResult } from '../@types/upload.types';
import type { UpChoice } from './modelConvert';

const CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB, per §7.1
/** Same list as modelConvert.ts, kept here so this file doesn't pull in three. */
const MODEL_FILE = /\.(fbx|glb|gltf|obj|ply)$/i;
const MAX_RETRIES_PER_CHUNK = 3;

/* ------------------------------------------------------------------ */
/* Folder walking                                                      */
/* ------------------------------------------------------------------ */

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) { resolve(all); return; }
        all.push(...batch);
        readBatch(); // readEntries only returns a batch at a time — drain it
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, base: string, out: StagedFile[]): Promise<void> {
  const relPath = base ? `${base}/${entry.name}` : entry.name;
  if (entry.isFile) {
    out.push({ relPath, file: await fileFromEntry(entry as FileSystemFileEntry) });
  } else if (entry.isDirectory) {
    const entries = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of entries) {
       
      await walkEntry(child, relPath, out);
    }
  }
}

/** Drag-and-drop folder support. Falls back to nothing for browsers without
 *  webkitGetAsEntry (Safari has shipped it for years; this isn't IE11). */
export async function filesFromDataTransfer(items: DataTransferItemList): Promise<StagedFile[]> {
  const out: StagedFile[] = [];
  const entries = Array.from(items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  for (const entry of entries) {
     
    await walkEntry(entry, '', out);
  }
  return out;
}

/** <input webkitdirectory> browse fallback — the browser already flattens
 *  the tree and stamps each File with its folder-relative path. */
export function filesFromFileList(list: FileList): StagedFile[] {
  return Array.from(list).map((file) => ({
    relPath: file.webkitRelativePath || file.name,
    file
  }));
}

/* ------------------------------------------------------------------ */
/* Validation — fail fast, before spending any bandwidth (§7.1)         */
/* ------------------------------------------------------------------ */

/** Returns an error message, or null if the selection is worth uploading. A
 *  single .zip is allowed through untouched — the server extracts it on
 *  finalize and checks it there, since we can't peek inside a zip on the
 *  client without another dependency (CLAUDE.md §4).
 *
 *  The index is NOT reliably called meta.lcc2: Lixel Studio names it after the
 *  capture (Library.lcc2, Floor3_Madan.lcc2, ...). Only require *an* .lcc2. */
export function validateExport(files: StagedFile[]): string | null {
  if (!files.length) return 'Drop a folder or a .zip — it looked empty.';
  if (files.length === 1 && files[0].relPath.toLowerCase().endsWith('.zip')) return null;

  const indexes = files.filter((f) => f.relPath.toLowerCase().endsWith('.lcc2'));
  // A 3D model: converted to one .glb in the browser before upload.
  if (!indexes.length && files.some((f) => MODEL_FILE.test(f.relPath))) return null;
  if (!indexes.length) return 'No .lcc2 index or 3D model here. Pick a Lixel Studio export folder, or an FBX, OBJ, PLY or GLB model.';
  // The .lcc2 is only an index; on its own it points at tiles that aren't here.
  if (files.length === indexes.length) {
    return 'A .lcc2 on its own is only the index — pick the whole export folder (or a .zip of it) so its data/ tiles come too.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Upload                                                               */
/* ------------------------------------------------------------------ */

async function uploadOneFile(
  assetId: string,
  staged: StagedFile,
  onBytes: (sentSoFar: number) => void
): Promise<void> {
  const { relPath, file } = staged;
  const initial = await initAssetFile(assetId, relPath);
  let offset = initial?.bytesReceived ?? 0;
  onBytes(offset);

  let retries = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    const chunk = file.slice(offset, end);
     
    const result = await uploadAssetChunk(assetId, relPath, offset, chunk);

    if (result.ok) {
      offset = result.bytesReceived;
      onBytes(offset);
      retries = 0;
    } else {
      // 409: the server's already further along than we thought (a retried
      // chunk that actually landed) — resync and continue, don't restart.
      if (result.bytesReceived > offset) {
        offset = result.bytesReceived;
        onBytes(offset);
        continue;
      }
      retries += 1;
      if (retries > MAX_RETRIES_PER_CHUNK) {
        throw new Error(`Upload stalled on "${relPath}" — check your connection and try again.`);
      }
    }
  }
}

/** Uploads every staged file for one variant, then finalizes the asset.
 *  `onProgress` fires with cumulative bytes across all files in the batch. */
export async function uploadVariant(
  files: StagedFile[],
  onProgress: (p: UploadProgress) => void,
  { up = 'auto', onStage = () => {} }: { up?: UpChoice; onStage?: (stage: string) => void } = {}
): Promise<UploadResult> {
  const invalid = validateExport(files);
  if (invalid) throw new Error(invalid);

  // A 3D model (no LCC index, not a zip): convert it here, upload one .glb.
  const isZip = files.length === 1 && files[0].relPath.toLowerCase().endsWith('.zip');
  if (!isZip && !files.some((f) => f.relPath.toLowerCase().endsWith('.lcc2'))) {
    const { convertModel } = await import('./modelConvert');
    const c = await convertModel(files, { up, onStage });
    onStage('');
    const result = await sendFiles([{ relPath: c.file.name, file: c.file }], onProgress);
    return {
      ...result,
      converted: {
        from: files.reduce((n, f) => n + f.file.size, 0),
        triangles: c.triangles, points: c.points, up: c.up, toMetres: c.toMetres, missing: c.missing
      }
    };
  }

  return sendFiles(files, onProgress);
}

/** Create an asset, push every file 8 MB at a time, finalize. */
async function sendFiles(files: StagedFile[], onProgress: (p: UploadProgress) => void): Promise<UploadResult> {
  const created = await createAsset();
  if (!created?.assetId) throw new Error('Could not start the upload — the server is unreachable.');
  const { assetId } = created;

  const bytesTotal = files.reduce((sum, f) => sum + f.file.size, 0);
  const sentPerFile = new Map<string, number>();
  const report = () => {
    let bytesSent = 0;
    for (const v of sentPerFile.values()) bytesSent += v;
    onProgress({ bytesSent, bytesTotal });
  };

  for (const staged of files) {
     
    await uploadOneFile(assetId, staged, (sent) => { sentPerFile.set(staged.relPath, sent); report(); });
  }

  const result = await finalizeAsset(assetId);
  if (!result) throw new Error('Upload finished but the server did not confirm it — try again.');
  return result;
}

/* ------------------------------------------------------------------ */
/* Audio (§6.3) — one .m4a per hotspot, same chunked path               */
/* ------------------------------------------------------------------ */

export const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

/** Checked here for instant feedback; the server checks again, including
 *  that the file really is an MP4 container and not a renamed MP3. */
export function validateAudio(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.m4a')) {
    return 'Use an AAC .m4a file (mono, 96 kbps). It plays in every browser, including older Safari.';
  }
  if (file.size > AUDIO_MAX_BYTES) {
    return `That file is ${(file.size / 1048576).toFixed(1)} MB. Audio is capped at 2 MB per space: re-encode it mono at 96 kbps, or trim it.`;
  }
  if (!file.size) return 'That file is empty.';
  return null;
}

/** Uploads one audio file and returns the `asset://` reference a scene
 *  document stores (§9) — never a URL. */
export async function uploadAudio(file: File, onProgress: (p: UploadProgress) => void): Promise<string> {
  const invalid = validateAudio(file);
  if (invalid) throw new Error(invalid);
  const created = await createAsset();
  if (!created?.assetId) throw new Error('Could not start the upload: the server is unreachable.');
  // Keep the name readable in the inspector, but nothing a path could trip on.
  const relPath = file.name.replace(/[^A-Za-z0-9._-]+/g, '-');
  await uploadOneFile(created.assetId, { relPath, file }, (bytesSent) => onProgress({ bytesSent, bytesTotal: file.size }));
  const result = await finalizeAudio(created.assetId);
  if (!result) throw new Error('Upload finished but the server did not confirm it. Try again.');
  return `asset://${result.assetId}/${result.file}`;
}
