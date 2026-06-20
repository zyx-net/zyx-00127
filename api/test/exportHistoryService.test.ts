import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  setupTestDb,
  closeDb,
  createTables,
  seedTestData,
  getUserFixture,
  silenceConsole,
  allSql,
  runSql,
  getSql,
} from './test-helpers';
import {
  validateExportParams,
  createExportHistory,
  getExportHistories,
  getExportHistoryById,
  saveExportFile,
  getExportFilePath,
} from '../src/services/exportHistoryService';
import { setDb } from '../src/db/utils';
import { exportTickets } from '../src/services/reportService';

describe('exportHistoryService', () => {
  let db: sqlite3.Database;
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let restoreConsole: () => void;

  before(async () => {
    restoreConsole = silenceConsole();
    db = setupTestDb();
    await createTables(db);
    seed = await seedTestData(db);
  });

  after(async () => {
    await closeDb(db);
    restoreConsole();
  });

  describe('validateExportParams', () => {
    it('全部时间范围不报错', () => {
      const err = validateExportParams('all', undefined, undefined);
      assert.equal(err, null);
    });

    it('自定义范围但没有开始和结束日期时报错', () => {
      const err = validateExportParams('custom', undefined, undefined);
      assert.equal(err, '自定义范围需要选择开始和结束日期');
    });

    it('自定义范围但只有开始日期时报错', () => {
      const err = validateExportParams('custom', '2026-01-01', undefined);
      assert.equal(err, '请选择结束日期');
    });

    it('自定义范围但只有结束日期时报错', () => {
      const err = validateExportParams('custom', undefined, '2026-01-31');
      assert.equal(err, '请选择开始日期');
    });

    it('结束日期早于开始日期时报错', () => {
      const err = validateExportParams('custom', '2026-02-01', '2026-01-01');
      assert.equal(err, '结束日期不能早于开始日期');
    });

    it('有效的自定义范围不报错', () => {
      const err = validateExportParams('custom', '2026-01-01', '2026-01-31');
      assert.equal(err, null);
    });

    it('全部时间模式下结束早于开始也报错', () => {
      const err = validateExportParams('all', '2026-02-01', '2026-01-01');
      assert.equal(err, '结束日期不能早于开始日期');
    });
  });

  describe('createExportHistory', () => {
    it('成功创建导出记录', async () => {
      const history = await createExportHistory(
        'pending',
        '2026-01-01',
        '2026-01-31',
        '维修工单报表_20260101_120000.csv',
        seed.adminId,
        '系统管理员'
      );

      assert.ok(history.id > 0);
      assert.equal(history.status, 'pending');
      assert.equal(history.startDate, '2026-01-01');
      assert.equal(history.endDate, '2026-01-31');
      assert.equal(history.filename, '维修工单报表_20260101_120000.csv');
      assert.equal(history.operatorId, seed.adminId);
      assert.equal(history.operatorName, '系统管理员');
    });

    it('空状态和日期也能创建记录', async () => {
      const history = await createExportHistory(
        null,
        null,
        null,
        '维修工单报表_20260101_130000.csv',
        seed.adminId,
        '系统管理员'
      );

      assert.ok(history.id > 0);
      assert.equal(history.status, null);
      assert.equal(history.startDate, null);
      assert.equal(history.endDate, null);
    });
  });

  describe('getExportHistories', () => {
    it('返回所有导出记录，按时间倒序', async () => {
      const histories = await getExportHistories();
      assert.ok(histories.length >= 2);
      for (let i = 1; i < histories.length; i++) {
        assert.ok(
          new Date(histories[i - 1].createdAt) >= new Date(histories[i].createdAt),
          '应按创建时间倒序排列'
        );
      }
    });
  });

  describe('getExportHistoryById', () => {
    it('根据 ID 获取导出记录', async () => {
      const created = await createExportHistory(
        'assigned',
        '2026-03-01',
        '2026-03-31',
        '维修工单报表_20260301_120000.csv',
        seed.adminId,
        '系统管理员'
      );

      const found = await getExportHistoryById(created.id);
      assert.ok(found);
      assert.equal(found!.id, created.id);
      assert.equal(found!.status, 'assigned');
      assert.equal(found!.startDate, '2026-03-01');
      assert.equal(found!.endDate, '2026-03-31');
      assert.equal(found!.operatorName, '系统管理员');
    });

    it('不存在的 ID 返回 null', async () => {
      const found = await getExportHistoryById(99999);
      assert.equal(found, null);
    });
  });

  describe('saveExportFile & getExportFilePath', () => {
    it('保存文件后能获取到路径', () => {
      const filename = 'test_export_unit.csv';
      const content = '\uFEFFID,标题\n1,测试';
      saveExportFile(filename, content);

      const filePath = getExportFilePath(filename);
      assert.ok(filePath);
      assert.ok(fs.existsSync(filePath!));
      const readContent = fs.readFileSync(filePath!, 'utf-8');
      assert.equal(readContent, content);

      if (fs.existsSync(filePath!)) {
        fs.unlinkSync(filePath!);
      }
    });

    it('未保存的文件返回 null', () => {
      const filePath = getExportFilePath('nonexistent.csv');
      assert.equal(filePath, null);
    });
  });
});

describe('exportHistory 持久化', () => {
  const testDbPath = path.join(os.tmpdir(), `test-export-persistence-${Date.now()}.db`);
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let restoreConsole: () => void;
  let historyId: number;

  before(async () => {
    restoreConsole = silenceConsole();
  });

  after(() => {
    restoreConsole();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('Phase 1: 创建导出记录并验证数据写入', async () => {
    const db = new sqlite3.Database(testDbPath) as unknown as sqlite3.Database;
    setDb(db as unknown as Parameters<typeof setDb>[0]);

    await createTables(db);
    seed = await seedTestData(db);

    const history = await createExportHistory(
      'completed',
      '2026-06-01',
      '2026-06-30',
      '维修工单报表_20260601_120000.csv',
      seed.adminId,
      '系统管理员'
    );
    historyId = history.id;

    assert.ok(historyId > 0);

    await createExportHistory(
      null,
      null,
      null,
      '维修工单报表_20260602_120000.csv',
      seed.adminId,
      '系统管理员'
    );

    const histories = await getExportHistories();
    assert.equal(histories.length, 2);

    await closeDb(db);
  });

  it('Phase 2: 重连数据库后记录仍然存在', async () => {
    assert.ok(fs.existsSync(testDbPath), '数据库文件应存在');

    const db2 = new sqlite3.Database(testDbPath) as unknown as sqlite3.Database;
    setDb(db2 as unknown as Parameters<typeof setDb>[0]);

    const found = await getExportHistoryById(historyId);
    assert.ok(found, '导出记录应仍然存在');
    assert.equal(found!.status, 'completed');
    assert.equal(found!.startDate, '2026-06-01');
    assert.equal(found!.endDate, '2026-06-30');
    assert.equal(found!.operatorName, '系统管理员');
    assert.equal(found!.filename, '维修工单报表_20260601_120000.csv');

    const allRecords = await allSql<{ count: number }>(
      db2 as unknown as sqlite3.Database,
      'SELECT COUNT(*) as count FROM export_histories'
    );
    assert.equal(allRecords[0].count, 2);

    await closeDb(db2);
  });

  it('Phase 3: 数据库直接查询验证字段映射', async () => {
    const db3 = new sqlite3.Database(testDbPath) as unknown as sqlite3.Database;
    setDb(db3 as unknown as Parameters<typeof setDb>[0]);

    const row = await getSql<{
      id: number;
      status: string | null;
      start_date: string | null;
      end_date: string | null;
      filename: string;
      operator_id: number;
      operator_name: string;
    }>(
      db3 as unknown as sqlite3.Database,
      'SELECT * FROM export_histories WHERE id = ?',
      [historyId]
    );

    assert.ok(row);
    assert.equal(row!.status, 'completed');
    assert.equal(row!.start_date, '2026-06-01');
    assert.equal(row!.end_date, '2026-06-30');
    assert.equal(row!.operator_id, seed.adminId);
    assert.equal(row!.operator_name, '系统管理员');

    await closeDb(db3);
  });
});

describe('exportHistory 重新导出逻辑', () => {
  let db: sqlite3.Database;
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let restoreConsole: () => void;

  before(async () => {
    restoreConsole = silenceConsole();
    db = setupTestDb();
    await createTables(db);
    seed = await seedTestData(db);
  });

  after(async () => {
    await closeDb(db);
    restoreConsole();
  });

  it('使用历史记录条件重新生成 CSV', async () => {
    const history = await createExportHistory(
      'pending',
      '2026-01-01',
      '2026-12-31',
      '维修工单报表_20260101_120000.csv',
      seed.adminId,
      '系统管理员'
    );

    const csv = await exportTickets(
      history.status || undefined,
      history.startDate || undefined,
      history.endDate || undefined
    );

    assert.ok(csv.includes('\uFEFF'), 'CSV 应包含 BOM');
    assert.ok(csv.includes('工单ID'), 'CSV 应包含表头');
  });

  it('空条件的记录也能重新导出', async () => {
    const history = await createExportHistory(
      null,
      null,
      null,
      '维修工单报表_20260201_120000.csv',
      seed.adminId,
      '系统管理员'
    );

    const csv = await exportTickets(
      history.status || undefined,
      history.startDate || undefined,
      history.endDate || undefined
    );

    assert.ok(csv.includes('\uFEFF'));
    assert.ok(csv.includes('工单ID'));
  });
});
