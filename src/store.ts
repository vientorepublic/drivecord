import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { UploadManifest } from './types';

export interface FileEntry extends UploadManifest {
  id: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'manifests.json');

function load(): FileEntry[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as FileEntry[];
  } catch {
    return [];
  }
}

function save(entries: FileEntry[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

export function listFiles(): FileEntry[] {
  return load();
}

export function addFile(manifest: UploadManifest): FileEntry {
  const entries = load();
  const entry: FileEntry = { ...manifest, id: crypto.randomUUID() };
  save([...entries, entry]);
  return entry;
}

export function getFile(id: string): FileEntry | undefined {
  return load().find((e) => e.id === id);
}

export function removeFile(id: string): boolean {
  const entries = load();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  save(next);
  return true;
}
