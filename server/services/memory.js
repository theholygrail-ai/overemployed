import fs from 'fs/promises';
import path from 'path';
import { dataRoot } from '../lib/dataPath.js';
import { getJsonKey, putJsonKey, isS3DataEnabled } from './s3Json.js';

const MEMORY_PATH = path.join(dataRoot(), 'memory.json');
const MEMORY_KEY = 'memory.json';

async function ensureDir() {
  await fs.mkdir(path.dirname(MEMORY_PATH), { recursive: true });
}

export async function loadMemory() {
  if (isS3DataEnabled()) {
    const data = await getJsonKey(MEMORY_KEY);
    return data && typeof data === 'object' ? data : {};
  }
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveMemory(memoryObj) {
  if (isS3DataEnabled()) {
    await putJsonKey(MEMORY_KEY, memoryObj);
    return;
  }
  await ensureDir();
  await fs.writeFile(MEMORY_PATH, JSON.stringify(memoryObj, null, 2), 'utf-8');
}

export async function getMemoryKey(key) {
  const mem = await loadMemory();
  return mem[key];
}

export async function setMemoryKey(key, value) {
  const mem = await loadMemory();
  mem[key] = value;
  await saveMemory(mem);
}

export async function appendToMemoryList(key, item) {
  const mem = await loadMemory();
  if (!Array.isArray(mem[key])) {
    mem[key] = [];
  }
  mem[key].push(item);
  await saveMemory(mem);
}
