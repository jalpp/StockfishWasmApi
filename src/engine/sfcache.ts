import { Firestore, FieldValue } from "@google-cloud/firestore";
import { PositionEval } from "@jalpp/stockfishts";

export interface CacheKey {
  fen: string;
  depth: number;
  multiPv: number;
  /** Whether this result was evaluated after flipping the side-to-move (null-move trick). */
  nullMove?: boolean;
}

export interface CachedEvalDocument {
  fen: string;
  depth: number;
  multiPv: number;
  nullMove: boolean;
  result: PositionEval;
  createdAt: string;
  lastAccessedAt: string;
  source: string;
}

export interface BatchCacheResult {
  fen: string;
  hit: boolean;
  result?: PositionEval;
}

const COLLECTION = "sf_cache";

const DISABLE_FIRESTORE_CACHE = (() => {
  const v = process.env.DEV ?? process.env.DISABLE_FIRESTORE_CACHE;
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
})();

if (DISABLE_FIRESTORE_CACHE) {
  console.log("[sfCache] Firestore cache disabled (DEV mode).");
}

let db: Firestore | null = null;
if (!DISABLE_FIRESTORE_CACHE) {
  db = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
}

/** Strip half-move clock and full-move number so logically identical positions share a key. */
export function normaliseFen(fen: string): string {
  return fen.trim().split(" ").slice(0, 4).join(" ");
}

function buildDocId(key: CacheKey): string {
  const fenPart = normaliseFen(key.fen).replace(/\//g, "|").replace(/ /g, "_");
  // Include nullMove in the doc ID so a flipped evaluation never collides with
  // a normal evaluation of the same FEN.
  const nmSuffix = key.nullMove ? "__nm1" : "__nm0";
  return `${fenPart}__d${key.depth}__pv${key.multiPv}${nmSuffix}`;
}

function sanitize(result: PositionEval): PositionEval {
  return JSON.parse(JSON.stringify(result));
}

/** Returns the cached PositionEval or null on a miss. */
export async function cacheGet(key: CacheKey): Promise<PositionEval | null> {
  if (DISABLE_FIRESTORE_CACHE) return null;
  try {
    const docId = buildDocId(key);
    const snap = await db!.collection(COLLECTION).doc(docId).get();
    if (!snap.exists) return null;

    return (snap.data() as CachedEvalDocument).result;
  } catch (err) {
    console.error("[sfCache] get error:", err);
    return null;
  }
}

/** Writes a PositionEval to the cache. Non-fatal on error. */
export async function cacheSet(key: CacheKey, result: PositionEval, source: string): Promise<void> {
  if (DISABLE_FIRESTORE_CACHE) {
    // No-op in dev mode
    return;
  }
  try {
    const docId = buildDocId(key);
    const now = new Date().toISOString();
    const doc: CachedEvalDocument = {
      fen: normaliseFen(key.fen),
      depth: key.depth,
      multiPv: key.multiPv,
      nullMove: key.nullMove ?? false,
      result: sanitize(result),
      createdAt: now,
      lastAccessedAt: now,
      source,
    };
    await db!.collection(COLLECTION).doc(docId).set(doc, { merge: true });
    console.log(`[sfCache] SET  ${docId}  (source: ${source})`);
  } catch (err) {
    console.error("[sfCache] set error:", err);
  }
}

/** Batch cache read — single Firestore round-trip via getAll. */
export async function cacheGetBatch(keys: CacheKey[]): Promise<BatchCacheResult[]> {
  if (keys.length === 0) return keys.map((k) => ({ fen: k.fen, hit: false }));
  if (DISABLE_FIRESTORE_CACHE) {
    console.log(`[sfCache] BATCH GET skipped (DEV). ${keys.length} keys`);
    return keys.map((k) => ({ fen: k.fen, hit: false }));
  }
  try {
    const refs = keys.map((k) => db!.collection(COLLECTION).doc(buildDocId(k)));
    const snaps = await db!.getAll(...refs);

    const results: BatchCacheResult[] = [];
    const hitRefs: FirebaseFirestore.DocumentReference[] = [];

    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i];
      if (snap.exists) {
        results.push({ fen: keys[i].fen, hit: true, result: (snap.data() as CachedEvalDocument).result });
        hitRefs.push(snap.ref);
      } else {
        results.push({ fen: keys[i].fen, hit: false });
      }
    }

    console.log(`[sfCache] BATCH GET  ${keys.length} keys → ${hitRefs.length} hits / ${keys.length - hitRefs.length} misses`);

    if (hitRefs.length > 0) {
      const batch = db!.batch();
      const now = new Date().toISOString();
      for (const ref of hitRefs) {
        batch.update(ref, { hitCount: FieldValue.increment(1), lastAccessedAt: now });
      }
      batch.commit().catch((err) => console.error("[sfCache] batch hit-stat update failed:", err));
    }

    return results;
  } catch (err) {
    console.error("[sfCache] getBatch error:", err);
    return keys.map((k) => ({ fen: k.fen, hit: false }));
  }
}

/** Batch cache write — auto-chunks at 500 for Firestore limits. */
export async function cacheSetBatch(
  entries: Array<{ key: CacheKey; result: PositionEval }>,
  source: string
): Promise<void> {
  if (entries.length === 0) return;
  if (DISABLE_FIRESTORE_CACHE) {
    console.log(`[sfCache] BATCH SET skipped (DEV). ${entries.length} entries`);
    return;
  }
  try {
    const CHUNK_SIZE = 500;
    const now = new Date().toISOString();
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const batch = db!.batch();
      for (const { key, result } of chunk) {
        const doc: CachedEvalDocument = {
          fen: normaliseFen(key.fen),
          depth: key.depth,
          multiPv: key.multiPv,
          nullMove: key.nullMove ?? false,
          result: sanitize(result),
          createdAt: now,
          lastAccessedAt: now,
          source,
        };
        batch.set(db!.collection(COLLECTION).doc(buildDocId(key)), doc, { merge: true });
      }
      await batch.commit();
      console.log(`[sfCache] BATCH SET  ${chunk.length} entries  (source: ${source})`);
    }
  } catch (err) {
    console.error("[sfCache] setBatch error:", err);
  }
}