/**
 * User-added components. Details live in localStorage (small); the meshes live
 * in IndexedDB because they can be many megabytes. Both stay in this browser.
 */
import { SimStore } from '../core/SimStore.ts';
import type { LengthUnit, MeshStats } from './geometry.ts';

export interface CustomComponent {
  id: string;
  name: string;
  industryId: string;
  category: string;
  description: string;
  materialId: string;
  /** Overrides the material's density when set, kg/m³. */
  densityOverride: number | null;
  fileName: string;
  formatLabel: string;
  fileBytes: number;
  /** Unit of the stored positions; meshes are kept as read and scaled on use. */
  unit: LengthUnit;
  stats: MeshStats;
  /** Exact values from the CAD kernel for STEP / IGES / BREP. */
  exact: { kernel: string; solidCount: number; faceCount: number; volumeMm3: number | null; areaMm2: number; valid: boolean } | null;
  notes: string[];
  createdAt: number;
}

const KEY = 'autotwin.customComponents.v1';
const DB = 'autotwin-cad';
const OS = 'meshes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OS);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(OS, mode);
    const req = fn(tx.objectStore(OS));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result as T);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export class CustomComponentStore extends SimStore {
  items: CustomComponent[] = [];
  private meshes = new Map<string, Float32Array>();

  constructor(load = true) {
    super();
    if (load) this.load();
  }

  get(id: string | undefined | null) {
    return id ? this.items.find((c) => c.id === id) : undefined;
  }

  async add(item: Omit<CustomComponent, 'id' | 'createdAt'>, positions: Float32Array): Promise<CustomComponent> {
    const full: CustomComponent = { ...item, id: `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
    this.meshes.set(full.id, positions);
    if (typeof indexedDB !== 'undefined') await idb('readwrite', (s) => s.put(positions, full.id));
    this.items = [full, ...this.items];
    this.save();
    this.emit();
    return full;
  }

  update(id: string, patch: Partial<Omit<CustomComponent, 'id' | 'createdAt'>>) {
    this.items = this.items.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.save();
    this.emit();
  }

  async remove(id: string) {
    this.items = this.items.filter((c) => c.id !== id);
    this.meshes.delete(id);
    this.save();
    this.emit();
    if (typeof indexedDB !== 'undefined') await idb('readwrite', (s) => s.delete(id)).catch(() => undefined);
  }

  /** The stored mesh, or null if it was cleared from this browser. */
  async mesh(id: string): Promise<Float32Array | null> {
    const hit = this.meshes.get(id);
    if (hit) return hit;
    if (typeof indexedDB === 'undefined') return null;
    const m = await idb<Float32Array | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
    if (m) this.meshes.set(id, m);
    return m ?? null;
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.items = JSON.parse(raw);
    } catch {
      this.items = [];
    }
  }

  private save() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }
}

export const customComponents = new CustomComponentStore(typeof localStorage !== 'undefined');
