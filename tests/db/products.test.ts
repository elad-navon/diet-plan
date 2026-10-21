import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeEntry, productFoodId, sumEntries, summarizeGrain } from '../../src/core/food';
import { systemClock } from '../../src/core/time';
import {
  DataError,
  createSupabaseRepositories,
  type DataErrorCode,
  type NewProduct,
  type Repositories,
} from '../../src/data';
import { createTestDb, failureOf, type TestDb } from './harness';
import { createPgliteGateway } from './pglite-gateway';

/**
 * The person's own products on the server (supabase/migrations/20261021000000_products.sql): who sees them, the
 * limits, edits from two devices, photos, and that deleting all data or the account leaves nothing behind.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

const reposOf = (userId: string): Repositories =>
  createSupabaseRepositories({ gateway: createPgliteGateway(db.as(userId)), clock: systemClock });

const PHOTO = `data:image/jpeg;base64,${'A'.repeat(400)}`;

function bread(overrides: Partial<NewProduct> = {}): NewProduct {
  return {
    id: productFoodId(randomUUID()),
    name: "לחם חיטה מלאה אנג'ל",
    kcal100: 225,
    protein100: 12.4,
    carbs100: 30.5,
    fat100: 4,
    sugar100: 1.1,
    fiber100: 8.8,
    addedSugar100: 1.1,
    addedSugarBasis: 'estimate',
    grain: 'whole',
    basis: 'g',
    units: [{ name: 'פרוסה', grams: 30 }],
    ...overrides,
  };
}

async function codeOf(work: Promise<unknown>): Promise<DataErrorCode | 'none'> {
  try {
    await work;
  } catch (error) {
    return error instanceof DataError ? error.code : 'server';
  }
  return 'none';
}

describe('products', () => {
  it('a saved product comes back the same, as a food of its own', async () => {
    const repos = reposOf(await db.newUser());
    const input = bread();
    const saved = await repos.products.add(input);
    expect(saved).toMatchObject({
      id: input.id,
      name: input.name,
      kcal100: 225,
      protein100: 12.4,
      carbs100: 30.5,
      fat100: 4,
      sugar100: 1.1,
      fiber100: 8.8,
      addedSugar100: 1.1,
      addedSugarBasis: 'estimate',
      grain: 'whole',
      units: [{ name: 'פרוסה', grams: 30 }],
      defaultUnit: 'פרוסה',
      version: 1,
    });
    expect(await repos.products.list()).toEqual([saved]);
  });

  it('two slices are worked out from the label, and the flour mark stays with the meal', async () => {
    const repos = reposOf(await db.newUser());
    const product = await repos.products.add(bread());
    const result = computeEntry(product, { kind: 'unit', unit: 'פרוסה', count: 2 });
    expect(result.ok && result.entry).toMatchObject({
      foodId: product.id,
      grams: 60,
      kcal: 135,
      proteinG: 7.4,
      carbsG: 18.3,
      fatG: 2.4,
      addedSugarG: 0.7,
      wholeCarbsG: 18.3,
    });
    if (!result.ok) return;
    // The product is gone (an empty food map): the meal still counts its whole grain.
    expect(summarizeGrain([{ items: [result.entry] }], new Map()).wholeCarbsG).toBe(18.3);
    expect(sumEntries([result.entry]).kcal).toBe(135);
  });

  it('a retry of the same save gives the same product, not a second one', async () => {
    const repos = reposOf(await db.newUser());
    const input = bread();
    const first = await repos.products.add(input);
    expect(await repos.products.add(input)).toEqual(first);
    expect(await repos.products.list()).toHaveLength(1);
  });

  it('an edit made meanwhile on another device is not overwritten', async () => {
    const repos = reposOf(await db.newUser());
    const saved = await repos.products.add(bread());
    const { id, ...patch } = bread({ id: saved.id, kcal100: 230 });
    const edited = await repos.products.update(id, 1, patch);
    expect(edited.kcal100).toBe(230);
    expect(edited.version).toBe(2);
    expect(await codeOf(repos.products.update(id, 1, { ...patch, kcal100: 240 }))).toBe(
      'version_conflict',
    );
    expect(await codeOf(repos.products.update(productFoodId(randomUUID()), 1, patch))).toBe(
      'not_found',
    );
  });

  it('the label rules hold on the server too', async () => {
    const userId = await db.newUser();
    const as = db.as(userId);
    const insert = (columns: string, values: string) =>
      failureOf(
        as.query(
          `insert into public.products (id, name, kcal_100, protein_100, carbs_100, fat_100${columns}) values ($1, 'x', 100, 10, 10, 5${values})`,
          [randomUUID()],
        ),
      );
    expect(await insert('', '')).toBe('');
    expect(await insert(', basis', ", 'kg'")).toMatch(/check/);
    expect(await insert(', fiber_100', ', 101')).toMatch(/check/);
    expect(await insert(', added_sugar_100', ', 5')).toMatch(/check/); // a value needs its source
    expect(
      await failureOf(
        as.query(
          `insert into public.products (id, name, kcal_100, protein_100, carbs_100, fat_100) values ($1, 'x', 950, 10, 10, 5)`,
          [randomUUID()],
        ),
      ),
    ).toMatch(/check/);
    expect(
      await failureOf(
        as.query(
          `insert into public.products (id, name, kcal_100, protein_100, carbs_100, fat_100) values ($1, 'x', 500, 50, 50, 50)`,
          [randomUUID()],
        ),
      ),
    ).toMatch(/check/);
  });

  it('nobody else sees, changes or deletes a product, or its photo', async () => {
    const alice = reposOf(await db.newUser());
    const bobId = await db.newUser();
    const bob = reposOf(bobId);
    const saved = await alice.products.add(bread());
    await alice.products.setPhoto(saved.id, PHOTO);

    expect(await bob.products.list()).toEqual([]);
    expect(await bob.products.photo(saved.id)).toBeNull();
    const { id, ...patch } = bread({ id: saved.id });
    expect(await codeOf(bob.products.update(id, 1, patch))).toBe('not_found');
    await bob.products.remove(saved.id);
    await bob.products.setPhoto(saved.id, null);
    // Bob cannot put a photo on Alice's product either.
    expect(await codeOf(bob.products.setPhoto(saved.id, PHOTO))).not.toBe('none');

    expect(await alice.products.list()).toHaveLength(1);
    expect(await alice.products.photo(saved.id)).toBe(PHOTO);
    expect(await db.anon.query('select 1 from public.products').catch(() => 'denied')).toBe(
      'denied',
    );
  });

  it('the photo is kept, replaced and removed; deleting the product deletes it', async () => {
    const repos = reposOf(await db.newUser());
    const saved = await repos.products.add(bread());
    expect(await repos.products.photo(saved.id)).toBeNull();
    await repos.products.setPhoto(saved.id, PHOTO);
    const other = `data:image/jpeg;base64,${'B'.repeat(400)}`;
    await repos.products.setPhoto(saved.id, other);
    expect(await repos.products.photo(saved.id)).toBe(other);
    await repos.products.setPhoto(saved.id, null);
    expect(await repos.products.photo(saved.id)).toBeNull();

    await repos.products.setPhoto(saved.id, PHOTO);
    await repos.products.remove(saved.id);
    const left = await db.admin.query('select 1 from public.product_photos where id = $1', [
      saved.id.slice('product:'.length),
    ]);
    expect(left).toEqual([]);
  });

  it('only JPEG photos of a reasonable size are kept', async () => {
    const repos = reposOf(await db.newUser());
    const saved = await repos.products.add(bread());
    expect(await codeOf(repos.products.setPhoto(saved.id, 'data:text/html;base64,AAAA'))).toBe(
      'invalid',
    );
    const huge = `data:image/jpeg;base64,${'A'.repeat(700_001)}`;
    expect(await codeOf(repos.products.setPhoto(saved.id, huge))).toBe('invalid');
  });

  it('"delete all my data" and deleting the account leave no product or photo behind', async () => {
    const userId = await db.newUserWithProfile();
    const repos = reposOf(userId);
    const saved = await repos.products.add(bread());
    await repos.products.setPhoto(saved.id, PHOTO);
    await repos.reset();
    const count = async (table: string) =>
      (await db.admin.query(`select 1 from public.${table} where user_id = $1`, [userId])).length;
    expect(await count('products')).toBe(0);
    expect(await count('product_photos')).toBe(0);

    const again = await repos.products.add(bread());
    await repos.products.setPhoto(again.id, PHOTO);
    await db.admin.query('delete from auth.users where id = $1', [userId]);
    expect(await count('products')).toBe(0);
    expect(await count('product_photos')).toBe(0);
  });

  it('the export holds the products (not their photos)', async () => {
    const repos = reposOf(await db.newUserWithProfile());
    const saved = await repos.products.add(bread());
    await repos.products.setPhoto(saved.id, PHOTO);
    const exported = await repos.exportAll();
    expect(exported.products).toEqual([saved]);
    expect(JSON.stringify(exported)).not.toContain('base64');
  });

  it('at most 500 products', async () => {
    const userId = await db.newUser();
    await db.admin.query(
      `insert into public.products (id, user_id, name, kcal_100, protein_100, carbs_100, fat_100)
       select gen_random_uuid(), $1, 'מוצר ' || n, 100, 1, 1, 1 from generate_series(1, 500) n`,
      [userId],
    );
    expect(await codeOf(reposOf(userId).products.add(bread()))).toBe('limit_reached');
  });
});
