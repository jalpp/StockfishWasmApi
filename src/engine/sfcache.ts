import { Firestore, FieldValue } from "@google-cloud/firestore";
import { PositionEval } from "@jalpp/stockfishts";
import { BatchCacheResult, CachedEvalDocument, CacheKey } from "./types.js";
import { sanitizePositionEval } from "./helper.js";
import { buildDocId, normaliseFen } from "./helper.js";
import { getFireStoreCache } from "./helper.js";
import { COLLECTION } from "./helper.js";

const DISABLED_CACHE = getFireStoreCache();

if (DISABLED_CACHE) {
  console.log("[sfCache] Firestore cache disabled (DEV mode).");
}

let db: Firestore | null = null;

if (!DISABLED_CACHE) {
  db = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
}


export async function cacheGet(key: CacheKey): Promise<PositionEval | null> {
  if (DISABLED_CACHE) return null;
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

export async function cacheSet(key: CacheKey, result: PositionEval, source: string): Promise<void> {
  if (DISABLED_CACHE) {
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
      result: sanitizePositionEval(result),
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

export async function cacheGetBatch(keys: CacheKey[]): Promise<BatchCacheResult[]> {
  
  if (keys.length === 0) {
    return keys.map((k) => ({ fen: k.fen, hit: false }));
  }

  if (DISABLED_CACHE) {
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

export async function cacheSetBatch(
  entries: Array<{ key: CacheKey; result: PositionEval }>,
  source: string
): Promise<void> {
  if (entries.length === 0) return;
  if (DISABLED_CACHE) {
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
          result: sanitizePositionEval(result),
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