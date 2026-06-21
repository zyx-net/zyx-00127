import { describe, it, before, after, beforeEach } from 'node:test';
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
  silenceConsole,
  runSql,
} from './test-helpers';
import {
  saveExportFile,
  getExportFilePath,
  createExportHistory,
  getExportHistoryById,
} from '../src/services/exportHistoryService';
import { exportTickets } from '../src/services/reportService';
import { setDb } from '../src/db/utils';

const cleanupExportsDir = () => {
  const dir = path.join(process.cwd(), 'data', 'exports');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('维修工单报表_') || f.startsWith('boundary_test_') || f.startsWith('collision_test_')) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  }
};

describe('导出日期边界回归测试', () => {
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
    cleanupExportsDir();
  });

  it('同日范围 start==end 必须包含当天所有时段的工单数据', async () => {
    const day = '2026-06-15';
    const times = ['00:00:01', '08:30:00', '12:00:00', '20:45:00', '23:59:59'];

    for (let i = 0; i < times.length; i++) {
      await runSql(db,
        `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          `同日工单_${i + 1}`,
          `描述${i + 1}`,
          `测试地址${i + 1}`,
          seed.leakTypeId,
          seed.zhangsanId,
          `${day} ${times[i]}`,
          `${day} ${times[i]}`,
        ]
      );
    }

    const csv = await exportTickets('pending', day, day);
    const lines = csv.split('\n');
    assert.equal(lines.length, times.length + 1, `应包含 1 行表头 + ${times.length} 行数据（实际 ${lines.length - 1} 行数据）`);

    for (let i = 0; i < times.length; i++) {
      assert.ok(
        csv.includes(`同日工单_${i + 1}`),
        `同日时段 ${times[i]} 的工单 "同日工单_${i + 1}" 应被包含，但 CSV 中未找到`
      );
    }
  });

  it('跨日期范围包含首尾日期整天', async () => {
    const day1 = '2026-06-16 00:00:01';
    const day2 = '2026-06-18 23:59:59';

    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['跨日_首日凌晨', '描述', '地址', seed.leakTypeId, seed.zhangsanId, day1, day1]
    );
    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['跨日_末日深夜', '描述', '地址', seed.leakTypeId, seed.zhangsanId, day2, day2]
    );

    const csv = await exportTickets('pending', '2026-06-16', '2026-06-18');
    assert.ok(csv.includes('跨日_首日凌晨'), '范围首日 00:00:01 的工单应被包含');
    assert.ok(csv.includes('跨日_末日深夜'), '范围末日 23:59:59 的工单应被包含');
  });

  it('边界外工单不被包含', async () => {
    const beforeDay = '2026-06-19 23:59:59';
    const afterDay = '2026-06-21 00:00:00';

    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['范围外_前一天', '描述', '地址', seed.leakTypeId, seed.zhangsanId, beforeDay, beforeDay]
    );
    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['范围外_后一天', '描述', '地址', seed.leakTypeId, seed.zhangsanId, afterDay, afterDay]
    );

    const csv = await exportTickets('pending', '2026-06-20', '2026-06-20');
    assert.ok(!csv.includes('范围外_前一天'), '范围前一天的工单不应被包含');
    assert.ok(!csv.includes('范围外_后一天'), '范围后一天的工单不应被包含');

    const csvStartOfDay = await exportTickets('pending', '2026-06-21', '2026-06-21');
    assert.ok(csvStartOfDay.includes('范围外_后一天'), '当范围是 06-21 当天时，06-21 00:00:00 的工单应被包含');
  });
});

describe('文件名冲突与记录关联回归测试', () => {
  let db: sqlite3.Database;
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let restoreConsole: () => void;

  before(async () => {
    restoreConsole = silenceConsole();
    db = setupTestDb();
    await createTables(db);
    seed = await seedTestData(db);

    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['唯一数据_A', '描述A', '地址A', seed.leakTypeId, seed.zhangsanId, '2026-06-20 10:00:00', '2026-06-20 10:00:00']
    );
    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['唯一数据_B', '描述B', '地址B', seed.electricTypeId, seed.lisiId, '2026-06-20 11:00:00', '2026-06-20 11:00:00']
    );
  });

  after(async () => {
    await closeDb(db);
    restoreConsole();
    cleanupExportsDir();
  });

  it('saveExportFile 同名文件自动加序号，互不覆盖', () => {
    const base = `collision_test_${Date.now()}`;
    const filename1 = saveExportFile(`${base}.csv`, '内容A');
    const filename2 = saveExportFile(`${base}.csv`, '内容B');
    const filename3 = saveExportFile(`${base}.csv`, '内容C');

    assert.equal(filename1, `${base}.csv`);
    assert.equal(filename2, `${base}_1.csv`);
    assert.equal(filename3, `${base}_2.csv`);

    const path1 = getExportFilePath(filename1);
    const path2 = getExportFilePath(filename2);
    const path3 = getExportFilePath(filename3);
    assert.ok(path1 && fs.existsSync(path1));
    assert.ok(path2 && fs.existsSync(path2));
    assert.ok(path3 && fs.existsSync(path3));

    assert.equal(fs.readFileSync(path1!, 'utf-8'), '内容A');
    assert.equal(fs.readFileSync(path2!, 'utf-8'), '内容B');
    assert.equal(fs.readFileSync(path3!, 'utf-8'), '内容C');
  });

  it('每条历史记录对应独立文件，重新导出不覆盖旧记录文件', async () => {
    const csv1 = await exportTickets('pending', '2026-06-20', '2026-06-20');

    const collisionBase = '维修工单报表_20260620_120000_000';
    const file1 = saveExportFile(`${collisionBase}.csv`, csv1);
    const history1 = await createExportHistory(
      'pending', '2026-06-20', '2026-06-20',
      file1, seed.adminId, '系统管理员'
    );

    const csv2Content = '内容_B_ONLY_\uFEFFID,标题\n1,唯一数据_B';
    const file2 = saveExportFile(`${collisionBase}.csv`, csv2Content);
    const history2 = await createExportHistory(
      'pending', '2026-06-20', '2026-06-20',
      file2, seed.adminId, '系统管理员'
    );

    assert.notEqual(history1.filename, history2.filename, '两次历史记录的文件名必须不同');
    assert.notEqual(file1, file2, '两次落盘文件名必须不同');

    const f1Path = getExportFilePath(history1.filename);
    const f2Path = getExportFilePath(history2.filename);
    assert.ok(f1Path, `历史记录 1 的文件 ${history1.filename} 必须存在`);
    assert.ok(f2Path, `历史记录 2 的文件 ${history2.filename} 必须存在`);

    assert.ok(
      fs.readFileSync(f1Path!, 'utf-8').includes('唯一数据_A'),
      '历史记录 1 对应文件内容必须包含"唯一数据_A"'
    );
    assert.equal(
      fs.readFileSync(f2Path!, 'utf-8'),
      csv2Content,
      '历史记录 2 对应文件内容必须是"内容_B_ONLY_"，不能被覆盖'
    );
  });
});

describe('服务重启后持久化 & 下载回归测试', () => {
  const testDbPath = path.join(os.tmpdir(), `test-export-regression-persistence-${Date.now()}.db`);
  const tmpExportsDir = path.join(os.tmpdir(), `test-exports-regression-${Date.now()}`);
  const originalCwd = process.cwd();
  let restoreConsole: () => void;
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let historyId1: number;
  let historyId2: number;
  let file1Name: string;
  let file2Name: string;
  let file1Content: string;
  let file2Content: string;

  before(async () => {
    restoreConsole = silenceConsole();
  });

  after(() => {
    restoreConsole();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(tmpExportsDir)) fs.rmSync(tmpExportsDir, { recursive: true, force: true });
  });

  it('Phase 1: 导出两份文件并写入历史记录和磁盘', async () => {
    const db = new sqlite3.Database(testDbPath);
    setDb(db as unknown as Parameters<typeof setDb>[0]);
    await createTables(db);
    seed = await seedTestData(db);

    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['持久化_工单X', '描述', '地址', seed.leakTypeId, seed.zhangsanId, '2026-06-20 09:00:00', '2026-06-20 09:00:00']
    );
    await runSql(db,
      `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ['持久化_工单Y', '描述', '地址', seed.electricTypeId, seed.lisiId, '2026-06-20 15:00:00', '2026-06-20 15:00:00']
    );

    process.chdir(path.dirname(tmpExportsDir));
    const tmpDataExports = path.join(path.dirname(tmpExportsDir), 'data', 'exports');
    if (!fs.existsSync(tmpDataExports)) fs.mkdirSync(tmpDataExports, { recursive: true });

    file1Content = await exportTickets('pending', '2026-06-20', '2026-06-20');
    const baseName1 = `持久化_报表_${Date.now()}`;
    file1Name = saveExportFile(`${baseName1}.csv`, file1Content);
    const h1 = await createExportHistory(
      'pending', '2026-06-20', '2026-06-20',
      file1Name, seed.adminId, '系统管理员'
    );
    historyId1 = h1.id;

    file2Content = '持久化_独立_报表B\n表头1,表头2';
    file2Name = saveExportFile(`${baseName1}.csv`, file2Content);
    const h2 = await createExportHistory(
      null, null, null,
      file2Name, seed.adminId, '系统管理员'
    );
    historyId2 = h2.id;

    assert.notEqual(file1Name, file2Name, '两份报表文件名必须不同');
    assert.ok(file1Content.includes('持久化_工单X'), '报表 1 必须含"持久化_工单X"');
    assert.ok(file1Content.includes('持久化_工单Y'), '报表 1 必须含"持久化_工单Y"（同日边界）');

    await closeDb(db);
  });

  it('Phase 2: 模拟服务重启，重连 DB + 重新读取文件，历史记录和文件都仍可用', async () => {
    assert.ok(fs.existsSync(testDbPath), '重启后 DB 文件仍在');
    const f1Path = getExportFilePath(file1Name);
    const f2Path = getExportFilePath(file2Name);
    assert.ok(f1Path && fs.existsSync(f1Path), `重启后文件 1 ${file1Name} 仍在磁盘`);
    assert.ok(f2Path && fs.existsSync(f2Path), `重启后文件 2 ${file2Name} 仍在磁盘`);

    assert.equal(fs.readFileSync(f1Path!, 'utf-8'), file1Content, '重启后文件 1 内容未变');
    assert.equal(fs.readFileSync(f2Path!, 'utf-8'), file2Content, '重启后文件 2 内容未变');

    const db2 = new sqlite3.Database(testDbPath);
    setDb(db2 as unknown as Parameters<typeof setDb>[0]);

    const h1 = await getExportHistoryById(historyId1);
    const h2 = await getExportHistoryById(historyId2);
    assert.ok(h1, '重启后历史记录 1 仍可查询');
    assert.ok(h2, '重启后历史记录 2 仍可查询');
    assert.equal(h1!.filename, file1Name, '重启后记录 1 的文件名未变');
    assert.equal(h2!.filename, file2Name, '重启后记录 2 的文件名未变');
    assert.equal(h1!.startDate, '2026-06-20');
    assert.equal(h1!.endDate, '2026-06-20');
    assert.equal(h2!.status, null);

    await closeDb(db2);

    process.chdir(originalCwd);
  });
});
