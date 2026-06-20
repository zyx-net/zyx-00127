import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  closeDb,
  createTables,
  seedTestData,
  getUserFixture,
  silenceConsole,
  allSql,
} from './test-helpers';
import {
  createTicket,
  assignTicket,
  completeTicket,
  closeTicket,
  getTicketById,
  getStatusLogs,
  getAssignmentLogs,
} from '../src/services/ticketService';
import { setDb } from '../src/db/utils';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('persistence', () => {
  const testDbPath = path.join(os.tmpdir(), `test-persistence-${Date.now()}.db`);
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let restoreConsole: () => void;
  let ticketId: number;

  before(async () => {
    restoreConsole = silenceConsole();
  });

  after(() => {
    restoreConsole();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  const dispatcherUser = () => getUserFixture(seed.dispatcherId, 'dispatcher', '张调度');
  const adminUser = () => getUserFixture(seed.adminId, 'admin', '系统管理员');

  it('Phase 1: 走完整条链路并写入数据', async () => {
    const db = new sqlite3.Database(testDbPath) as unknown as Parameters<typeof setDb>[0];
    setDb(db as unknown as Parameters<typeof setDb>[0]);

    await createTables(db as unknown as sqlite3.Database);
    seed = await seedTestData(db as unknown as sqlite3.Database);

    const result = await createTicket(
      { title: '持久化测试工单', description: '验证重启后数据仍在', address: '持久化大道1号', repairTypeId: seed.leakTypeId },
      seed.zhangsanId
    );
    ticketId = result.id;

    await assignTicket(
      ticketId,
      {
        technicianId: seed.techWangId,
        scheduledStartTime: '2026-12-01 09:00:00',
        scheduledEndTime: '2026-12-01 10:00:00',
        reason: '首次派工',
      },
      dispatcherUser()
    );

    await assignTicket(
      ticketId,
      {
        technicianId: seed.techLiId,
        scheduledStartTime: '2026-12-01 14:00:00',
        scheduledEndTime: '2026-12-01 15:00:00',
        reason: '改派李师傅',
      },
      dispatcherUser()
    );

    await completeTicket(ticketId, '维修完成，待复核', dispatcherUser());
    await closeTicket(ticketId, '复核通过，关闭工单', adminUser());

    const ticket = await getTicketById(ticketId, seed.adminId, 'admin');
    assert.equal(ticket?.status, 'closed');
    assert.equal(ticket?.currentTechnicianId, seed.techLiId);

    const statusLogs = await getStatusLogs(ticketId);
    const assignmentLogs = await getAssignmentLogs(ticketId);
    assert.ok(statusLogs.length >= 5);
    assert.equal(assignmentLogs.length, 2);

    await closeDb(db as unknown as sqlite3.Database);
  });

  it('Phase 2: 重新连接数据库，验证数据持久化', async () => {
    assert.ok(fs.existsSync(testDbPath), '数据库文件应存在');

    const db2 = new sqlite3.Database(testDbPath) as unknown as Parameters<typeof setDb>[0];
    setDb(db2 as unknown as Parameters<typeof setDb>[0]);

    const ticket = await getTicketById(ticketId, seed.adminId, 'admin');
    assert.ok(ticket, '工单应仍存在');
    assert.equal(ticket?.status, 'closed', '状态应保持 closed');
    assert.equal(ticket?.title, '持久化测试工单');
    assert.equal(ticket?.currentTechnicianId, seed.techLiId, '当前技工应保持李师傅');
    assert.equal(ticket?.address, '持久化大道1号');

    const statusLogs = await getStatusLogs(ticketId);
    assert.ok(statusLogs.length >= 5, '状态日志数量应保持不变');
    assert.equal(statusLogs[statusLogs.length - 1].toStatus, 'closed');
    assert.equal(statusLogs[statusLogs.length - 1].operatorName, '系统管理员');

    const assignmentLogs = await getAssignmentLogs(ticketId);
    assert.equal(assignmentLogs.length, 2, '派工历史数量应保持不变');
    assert.equal(assignmentLogs[0].toTechnicianName, '王师傅');
    assert.equal(assignmentLogs[1].toTechnicianName, '李师傅');
    assert.equal(assignmentLogs[1].reason, '改派李师傅');

    await closeDb(db2 as unknown as sqlite3.Database);
  });

  it('Phase 3: 数据库中状态和派工日志数量与内存中一致', async () => {
    const db3 = new sqlite3.Database(testDbPath) as unknown as Parameters<typeof setDb>[0];
    setDb(db3 as unknown as Parameters<typeof setDb>[0]);

    const ticketCount = await allSql<{ count: number }>(
      db3 as unknown as sqlite3.Database,
      'SELECT COUNT(*) as count FROM tickets'
    );
    assert.ok(ticketCount[0].count >= 1);

    const closedCount = await allSql<{ count: number }>(
      db3 as unknown as sqlite3.Database,
      "SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'"
    );
    assert.ok(closedCount[0].count >= 1, '至少应有1条已关闭工单');

    const statusLogCount = await allSql<{ count: number }>(
      db3 as unknown as sqlite3.Database,
      'SELECT COUNT(*) as count FROM status_logs WHERE ticket_id = ?',
      [ticketId]
    );
    assert.ok(statusLogCount[0].count >= 5);

    const assignLogCount = await allSql<{ count: number }>(
      db3 as unknown as sqlite3.Database,
      'SELECT COUNT(*) as count FROM assignment_logs WHERE ticket_id = ?',
      [ticketId]
    );
    assert.equal(assignLogCount[0].count, 2);

    await closeDb(db3 as unknown as sqlite3.Database);
  });
});
