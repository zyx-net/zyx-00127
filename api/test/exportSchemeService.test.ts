import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import {
  setupTestDb,
  closeDb,
  createTables,
  seedTestData,
  silenceConsole,
} from './test-helpers';
import {
  createScheme,
  getSchemesByOwner,
  getSchemeById,
  getDefaultScheme,
  setDefaultScheme,
  updateScheme,
  copyScheme,
  deleteScheme,
  getSchemeLogs,
} from '../src/services/exportSchemeService';

describe('导出方案管理 Service 层测试', () => {
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

  describe('创建方案 createScheme', () => {
    it('成功创建方案', async () => {
      const result = await createScheme({
        name: '月度待派工报表',
        description: '每月初导出所有待派工状态的工单',
        status: 'pending',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      assert.ok(result.success, '创建应成功');
      assert.ok(result.scheme, '应返回方案对象');
      assert.equal(result.scheme!.name, '月度待派工报表');
      assert.equal(result.scheme!.status, 'pending');
      assert.equal(result.scheme!.ownerId, seed.adminId);
      assert.equal(result.scheme!.version, 1);
      assert.equal(result.scheme!.isDefault, false);
    });

    it('名称为空时返回错误', async () => {
      const result = await createScheme({
        name: '   ',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      assert.equal(result.success, false);
      assert.ok(result.error);
    });

    it('同名方案返回冲突（duplicate_name）', async () => {
      await createScheme({
        name: '冲突测试方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await createScheme({
        name: '冲突测试方案',
        dateRangeType: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      assert.equal(result.success, false);
      assert.ok(result.conflict);
      assert.equal(result.conflict!.type, 'duplicate_name');
      assert.ok(result.conflict!.existingId > 0);
    });

    it('overwrite=true 时覆盖同名方案并递增版本号', async () => {
      const first = await createScheme({
        name: '覆盖测试方案',
        status: 'pending',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      assert.ok(first.success);
      const firstId = first.scheme!.id;

      const overwrite = await createScheme({
        name: '覆盖测试方案',
        description: '已覆盖更新',
        status: 'closed',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        dateRangeType: 'custom',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
        overwrite: true,
      });

      assert.ok(overwrite.success);
      assert.equal(overwrite.scheme!.id, firstId, '覆盖应保持相同ID');
      assert.equal(overwrite.scheme!.version, 2, '版本号应+1');
      assert.equal(overwrite.scheme!.status, 'closed');
      assert.equal(overwrite.scheme!.description, '已覆盖更新');
      assert.equal(overwrite.scheme!.startDate, '2026-06-01');
      assert.equal(overwrite.scheme!.endDate, '2026-06-30');
    });

    it('不同用户可以使用相同方案名', async () => {
      const r1 = await createScheme({
        name: '共享名称方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      assert.ok(r1.success);

      const r2 = await createScheme({
        name: '共享名称方案',
        dateRangeType: 'all',
        ownerId: seed.dispatcherId,
        ownerName: '张调度',
      });
      assert.ok(r2.success, '不同用户同名应成功');
      assert.notEqual(r1.scheme!.id, r2.scheme!.id);
    });
  });

  describe('查询方案', () => {
    let baseSchemeId: number;

    before(async () => {
      const r = await createScheme({
        name: '查询测试方案',
        status: 'assigned',
        dateRangeType: 'custom',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      baseSchemeId = r.scheme!.id;
    });

    it('getSchemeById 可以正确查询', async () => {
      const found = await getSchemeById(baseSchemeId);
      assert.ok(found);
      assert.equal(found!.id, baseSchemeId);
      assert.equal(found!.status, 'assigned');
      assert.equal(found!.dateRangeType, 'custom');
    });

    it('getSchemeById 不存在返回 null', async () => {
      const found = await getSchemeById(999999);
      assert.equal(found, null);
    });

    it('getSchemesByOwner 返回当前用户所有方案', async () => {
      const list = await getSchemesByOwner(seed.adminId);
      assert.ok(list.length >= 2);
      for (const s of list) {
        assert.equal(s.ownerId, seed.adminId);
      }
    });
  });

  describe('默认方案 setDefaultScheme / getDefaultScheme', () => {
    it('设置默认方案后 getDefaultScheme 可查到', async () => {
      const r1 = await createScheme({
        name: '默认测试方案A',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      const r2 = await createScheme({
        name: '默认测试方案B',
        dateRangeType: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      await setDefaultScheme(r1.scheme!.id, seed.adminId, '系统管理员');
      const def1 = await getDefaultScheme(seed.adminId);
      assert.equal(def1!.id, r1.scheme!.id);
      assert.equal(def1!.isDefault, true);

      await setDefaultScheme(r2.scheme!.id, seed.adminId, '系统管理员');
      const def2 = await getDefaultScheme(seed.adminId);
      assert.equal(def2!.id, r2.scheme!.id, '新方案应为默认');

      const aAfter = await getSchemeById(r1.scheme!.id);
      assert.equal(aAfter!.isDefault, false, '原默认方案应被取消默认');
    });

    it('各用户的默认方案互相独立', async () => {
      const aScheme = await createScheme({
        name: '管理员独立默认',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      const dScheme = await createScheme({
        name: '调度员独立默认',
        dateRangeType: 'all',
        ownerId: seed.dispatcherId,
        ownerName: '张调度',
      });

      await setDefaultScheme(aScheme.scheme!.id, seed.adminId, '系统管理员');
      await setDefaultScheme(dScheme.scheme!.id, seed.dispatcherId, '张调度');

      assert.equal((await getDefaultScheme(seed.adminId))!.id, aScheme.scheme!.id);
      assert.equal((await getDefaultScheme(seed.dispatcherId))!.id, dScheme.scheme!.id);
    });
  });

  describe('更新方案 updateScheme', () => {
    it('更新名称/条件正常，版本号+1', async () => {
      const created = await createScheme({
        name: '更新测试原名称',
        status: 'pending',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await updateScheme(created.scheme!.id, {
        name: '更新测试新名称',
        description: '新描述',
        status: 'completed',
        dateRangeType: 'custom',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        operatorId: seed.adminId,
        operatorName: '系统管理员',
      });

      assert.ok(result.success);
      assert.equal(result.scheme!.name, '更新测试新名称');
      assert.equal(result.scheme!.status, 'completed');
      assert.equal(result.scheme!.version, created.scheme!.version + 1);
    });

    it('expectedVersion 不匹配时返回 version_mismatch 冲突', async () => {
      const created = await createScheme({
        name: '并发冲突测试',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await updateScheme(created.scheme!.id, {
        name: '尝试修改',
        expectedVersion: 999,
        operatorId: seed.adminId,
        operatorName: '系统管理员',
      });

      assert.equal(result.success, false);
      assert.ok(result.conflict);
      assert.equal(result.conflict!.type, 'version_mismatch');
      assert.equal(result.conflict!.serverVersion, 1);
    });

    it('重命名为已存在名称返回 duplicate_name 冲突', async () => {
      await createScheme({
        name: '占用名_AAA',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      const target = await createScheme({
        name: '占用名_BBB',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await updateScheme(target.scheme!.id, {
        name: '占用名_AAA',
        operatorId: seed.adminId,
        operatorName: '系统管理员',
      });

      assert.equal(result.success, false);
      assert.ok(result.conflict);
      assert.equal(result.conflict!.type, 'duplicate_name');
    });
  });

  describe('复制方案 copyScheme', () => {
    it('复制成功，筛选条件保持一致', async () => {
      const src = await createScheme({
        name: '复制源方案',
        description: '源描述',
        status: 'closed',
        dateRangeType: 'custom',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await copyScheme(src.scheme!.id, '复制后新方案', seed.adminId, '系统管理员');

      assert.ok(result.success);
      assert.equal(result.scheme!.name, '复制后新方案');
      assert.equal(result.scheme!.status, src.scheme!.status);
      assert.equal(result.scheme!.startDate, src.scheme!.startDate);
      assert.equal(result.scheme!.endDate, src.scheme!.endDate);
      assert.notEqual(result.scheme!.id, src.scheme!.id);
      assert.equal(result.scheme!.isDefault, false);
      assert.equal(result.scheme!.version, 1);
    });

    it('复制时新名称冲突返回 duplicate_name', async () => {
      const src = await createScheme({
        name: '复制冲突源',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      await createScheme({
        name: '已有名称',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const result = await copyScheme(src.scheme!.id, '已有名称', seed.adminId, '系统管理员');
      assert.equal(result.success, false);
      assert.ok(result.conflict);
      assert.equal(result.conflict!.type, 'duplicate_name');
    });
  });

  describe('删除方案 deleteScheme', () => {
    it('删除非默认方案成功', async () => {
      const created = await createScheme({
        name: '待删除普通方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });

      const del = await deleteScheme(created.scheme!.id, seed.adminId, '系统管理员');
      assert.ok(del.success);

      const found = await getSchemeById(created.scheme!.id);
      assert.equal(found, null);
    });

    it('删除默认方案在无 force 时返回 delete_default 冲突', async () => {
      const created = await createScheme({
        name: '待删除默认方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      await setDefaultScheme(created.scheme!.id, seed.adminId, '系统管理员');

      const del = await deleteScheme(created.scheme!.id, seed.adminId, '系统管理员');
      assert.equal(del.success, false);
      assert.ok(del.conflict);
      assert.equal(del.conflict!.type, 'delete_default');

      const found = await getSchemeById(created.scheme!.id);
      assert.ok(found, '默认方案在未force时不能被删除');
    });

    it('force=true 可以强制删除默认方案', async () => {
      const created = await createScheme({
        name: '待强制删除默认方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      await setDefaultScheme(created.scheme!.id, seed.adminId, '系统管理员');

      const del = await deleteScheme(created.scheme!.id, seed.adminId, '系统管理员', true);
      assert.ok(del.success);

      const found = await getSchemeById(created.scheme!.id);
      assert.equal(found, null);
    });
  });

  describe('操作日志 getSchemeLogs', () => {
    it('创建/更新/删除/设默认均会记录日志', async () => {
      const created = await createScheme({
        name: '日志测试方案',
        dateRangeType: 'all',
        ownerId: seed.adminId,
        ownerName: '系统管理员',
      });
      const schemeId = created.scheme!.id;

      await setDefaultScheme(schemeId, seed.adminId, '系统管理员');
      await updateScheme(schemeId, {
        description: 'log update',
        operatorId: seed.adminId,
        operatorName: '系统管理员',
      });

      const logs = await getSchemeLogs(schemeId);
      const ops = logs.map(l => l.operation);
      assert.ok(ops.includes('create'), '缺少 create 日志');
      assert.ok(ops.includes('set_default'), '缺少 set_default 日志');
      assert.ok(ops.includes('update'), '缺少 update 日志');

      for (const log of logs) {
        assert.equal(log.operatorId, seed.adminId);
        assert.equal(log.schemeId, schemeId);
        assert.equal(log.schemeName, '日志测试方案');
      }

      const delResult = await deleteScheme(schemeId, seed.adminId, '系统管理员', true);
      assert.ok(delResult.success, '作为默认方案必须 force=true 才能删除');
      const allLogs = await getSchemeLogs(undefined, 10000);
      const foundDelete = allLogs.find(l => l.operation === 'delete' && l.schemeName === '日志测试方案');
      assert.ok(
        foundDelete,
        `删除操作也应有日志（匹配 schemeName 快照）。当前所有 delete 日志：${allLogs.filter(l => l.operation === 'delete').map(l => l.schemeName).join(', ')}`
      );
      assert.equal(foundDelete!.schemeId, null, '删除后 scheme_id 应被 ON DELETE SET NULL 清空');
    });
  });
});
