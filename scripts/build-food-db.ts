/**
 * Builds the app's food database from the Ministry of Health's open data (data.gov.il, dataset
 * "nutrition-database"). Run by hand - `npm run build:food-db` (add `-- --refresh` to re-download);
 * the generated files are committed, so the app build never needs the network.
 * See docs/ARCHITECTURE.md D.9 and docs/PRODUCT_SPEC.md C.3.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFoodRecords,
  qualityFailures,
  type FoodDb,
  type FoodDbMeta,
  type RawFoodTables,
} from '../src/core/food';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'data', 'raw');
const OUT_DIR = join(ROOT, 'src', 'assets', 'food-db');

const DATASET_ID = 'nutrition-database';
const DATASET_URL = `https://data.gov.il/dataset/${DATASET_ID}`;
const API = 'https://data.gov.il/api/3/action';
const RESOURCES = {
  foods: 'c3cb0630-0650-46c1-a068-82d575c094b2',
  units: '98fb46fe-e8de-4067-94d2-b0a8ea4269da',
  weights: '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d',
} as const;

// The portal rejects requests without a browser-like User-Agent.
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

interface DatastoreResponse<T> {
  success: boolean;
  result: { records: T[]; total: number };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function loadResource<T>(name: keyof typeof RESOURCES, refresh: boolean): Promise<T[]> {
  const file = join(RAW_DIR, `${name}.json`);
  if (!refresh && existsSync(file)) {
    return (JSON.parse(await readFile(file, 'utf8')) as DatastoreResponse<T>).result.records;
  }
  console.log(`downloading ${name}...`);
  const data = await getJson<DatastoreResponse<T>>(
    `${API}/datastore_search?resource_id=${RESOURCES[name]}&limit=32000`,
  );
  if (!data.success) throw new Error(`datastore_search failed for ${name}`);
  if (data.result.records.length < data.result.total) {
    throw new Error(`${name}: got ${data.result.records.length} of ${data.result.total} records`);
  }
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return data.result.records;
}

async function sourceModified(): Promise<string> {
  try {
    const pkg = await getJson<{ result: { metadata_modified: string } }>(
      `${API}/package_show?id=${DATASET_ID}`,
    );
    return pkg.result.metadata_modified.slice(0, 10);
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  const tables: RawFoodTables = {
    foods: await loadResource('foods', refresh),
    units: await loadResource('units', refresh),
    weights: await loadResource('weights', refresh),
  };

  const { foods, report } = buildFoodRecords(tables);
  const failures = qualityFailures(report);

  console.log(
    `foods: ${report.inputFoods} in, ${report.kept} kept, ${report.foodsWithUnits} with measures`,
  );
  console.log('skipped:', report.skipped);
  console.log(`missing macros treated as 0: ${report.macroMissing}`);
  console.log(`calories far from macros (kept, reported): ${report.atwaterOutliers.length}`);
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(join(RAW_DIR, 'build-report.json'), JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    console.error('QUALITY GATE FAILED:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
    return;
  }

  const version = createHash('sha256').update(JSON.stringify(foods)).digest('hex').slice(0, 12);
  const metaPath = join(OUT_DIR, 'food-db.meta.json');
  let retrievedAt = new Date().toISOString().slice(0, 10);
  if (existsSync(metaPath)) {
    const previous = JSON.parse(await readFile(metaPath, 'utf8')) as {
      version: string;
    } & FoodDbMeta;
    // Unchanged data keeps its original retrieval date, so re-running does not dirty the repository.
    if (previous.version === version) retrievedAt = previous.retrievedAt;
  }

  const meta: FoodDbMeta = {
    source: 'המאגר התזונתי הלאומי הישראלי, משרד הבריאות',
    sourceUrl: DATASET_URL,
    license: 'Other (Open)',
    sourceModified: await sourceModified(),
    retrievedAt,
    count: foods.length,
  };
  const db: FoodDb = { version, meta, foods };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'food-db.json'), JSON.stringify(db));
  await writeFile(metaPath, JSON.stringify({ version, ...meta }, null, 2) + '\n');
  console.log(`wrote food-db.json (version ${version}, ${foods.length} foods)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
