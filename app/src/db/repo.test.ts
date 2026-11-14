import { describe, expect, it } from 'vitest';
import { HarvestDB } from './db';
import { createFarm, currentFarmId, importFarm } from './repo';

describe('farm repo', () => {
  it('creates a farm with built-in task types and keeps data per farm', async () => {
    const db = new HarvestDB('test-' + Math.random());
    const a = await createFarm('Farm A', 'el', db);
    const b = await createFarm('Farm B', 'en', db);
    expect(await currentFarmId(db)).toBe(b.farmId);
    expect(await db.taskTypes.where('farmId').equals(a.farmId).count()).toBe(4);

    await a.addField({ name: 'Monastiri', trees: 17, archived: false, order: 0 });
    expect(await db.fields.where('farmId').equals(a.farmId).count()).toBe(1);
    expect(await db.fields.where('farmId').equals(b.farmId).count()).toBe(0);
  });

  it('keeps a single default unit', async () => {
    const db = new HarvestDB('test-' + Math.random());
    const r = await createFarm('F', 'en', db);
    const sack = await r.addUnit({ name: 'Sack', isDefault: true, archived: false });
    const bin = await r.addUnit({ name: 'Bin', isDefault: true, archived: false });
    expect((await db.units.get(sack.id))!.isDefault).toBe(false);
    await r.setDefaultUnit(sack.id);
    expect((await db.units.get(sack.id))!.isDefault).toBe(true);
    expect((await db.units.get(bin.id))!.isDefault).toBe(false);
  });

  it('round-trips an export', async () => {
    const db = new HarvestDB('test-' + Math.random());
    const r = await createFarm('F', 'en', db);
    const f = await r.addField({ name: 'Ryaki', trees: 10, archived: false, order: 0 });
    await r.saveEntry({ date: '2025-11-18', fieldId: f.id, taskTypeId: 'x', trees: 10, fieldFinished: false });
    const data = JSON.parse(JSON.stringify(await r.exportAll()));

    const db2 = new HarvestDB('test-' + Math.random());
    const id = await importFarm(data, db2);
    expect(id).toBe(r.farmId);
    expect(await db2.entries.count()).toBe(1);
    await expect(importFarm({ nope: 1 }, db2)).rejects.toThrow();
  });
});
