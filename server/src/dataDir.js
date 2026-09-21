/**
 * Where every file-backed store keeps its data. Defaults to src/data; the
 * integration tests point DATA_DIR at a temp folder so they never touch real
 * scenes, users or leads. ASSET_DIR (storage.js) still overrides assets alone.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(here, 'data');
