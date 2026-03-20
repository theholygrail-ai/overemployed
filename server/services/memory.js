import fs from 'fs/promises';
import path from 'path';

const MEMORY_PATH = path.join(process.cwd(), 'data', 'memory.json');

async function ensureDir() {
  await fs.mkdir(path.dirname(MEMORY_PATH), { recursive: true });
}

export async function loadMemory() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveMemory(memoryObj) {
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
