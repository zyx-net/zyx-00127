import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type sqlite3 from 'sqlite3';
import {
  setupTestDb,
  closeDb,
  createTables,
  seedTestData,
  getUserFixture,
  silenceConsole,
} from './test-helpers';
import {
  createTicket,
  assignTicket,
  completeTicket,
  closeTicket,
  getTicketById,
  getTickets,
  getStatusLogs,
  getAssignmentLogs,
  checkTechnicianConflict,
} from '../src/services/ticketService';

describe('ticketService', () => {
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

  const dispatcherUser = () => getUserFixture(seed.dispatcherId, 'dispatcher', '张调度');
  const adminUser = () => getUserFixture(seed.adminId, 'admin', '系统管理员');

  describe('createTicket', () => {
    it('成功创建漏水报修工单', async () => {
      const result = await createTicket(
        {
          title: '厨房水管漏水',
          description: '洗菜池下水管漏水',
          address: '1栋2单元301室',
          repairTypeId: seed.leakTypeId,
        },
        seed.zhangsanId
      );
      assert.ok(result.id > 0, '应返回工单ID');

      const ticket = await getTicketById(result.id, seed.zhangsanId, 'resident');
      assert.ok(ticket, '工单应存在');
      assert.equal(ticket?.title, '厨房水管漏水');
      assert.equal(ticket?.status, 'pending');
      assert.equal(ticket?.residentId, seed.zhangsanId);
      assert.equal(ticket?.repairTypeId, seed.leakTypeId);
    });

    it('缺少地址时不能建单', async () => {
      await assert.rejects(
        createTicket(
          { title: '测试', description: 'test', address: '', repairTypeId: seed.leakTypeId },
          seed.zhangsanId
        ),
        /地址不能为空/
      );
    });

    it('缺少维修类型时不能建单', async () => {
      await assert.rejects(
        createTicket(
          { title: '测试', description: 'test', address: '1栋101', repairTypeId: 0 },
          seed.zhangsanId
        ),
        /请选择维修类型/
      );
    });

    it('维修类型不存在时不能建单', async () => {
      await assert.rejects(
        createTicket(
          { title: '测试', description: 'test', address: '1栋101', repairTypeId: 9999 },
          seed.zhangsanId
        ),
        /维修类型不存在/
      );
    });

    it('标题为空时不能建单', async () => {
      await assert.rejects(
        createTicket(
          { title: '   ', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
          seed.zhangsanId
        ),
        /标题不能为空/
      );
    });
  });

  describe('assignTicket', () => {
    let ticketId: number;

    beforeEach(async () => {
      const result = await createTicket(
        { title: '派工测试工单', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      ticketId = result.id;
    });

    it('成功派工给空闲技工，状态变为 assigned', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-22 10:00:00',
          scheduledEndTime: '2026-06-22 11:00:00',
          reason: '紧急漏水维修',
        },
        dispatcherUser()
      );

      const ticket = await getTicketById(ticketId, seed.dispatcherId, 'dispatcher');
      assert.equal(ticket?.status, 'assigned');
      assert.equal(ticket?.currentTechnicianId, seed.techWangId);
      assert.equal(ticket?.currentTechnicianName, '王师傅');
    });

    it('改派后状态变为 reassigned', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-22 09:00:00',
          scheduledEndTime: '2026-06-22 10:00:00',
          reason: '首次派工',
        },
        dispatcherUser()
      );

      await assignTicket(
        ticketId,
        {
          technicianId: seed.techLiId,
          scheduledStartTime: '2026-06-22 14:00:00',
          scheduledEndTime: '2026-06-22 15:00:00',
          reason: '王师傅有急事，改派李师傅',
        },
        dispatcherUser()
      );

      const ticket = await getTicketById(ticketId, seed.dispatcherId, 'dispatcher');
      assert.equal(ticket?.status, 'reassigned');
      assert.equal(ticket?.currentTechnicianId, seed.techLiId);
    });

    it('同一技工重叠时段不能重复派工', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-23 10:00:00',
          scheduledEndTime: '2026-06-23 11:00:00',
          reason: '第一个派工',
        },
        dispatcherUser()
      );

      const result2 = await createTicket(
        { title: '冲突测试工单', description: 'test', address: '2栋202', repairTypeId: seed.electricTypeId },
        seed.lisiId
      );

      await assert.rejects(
        assignTicket(
          result2.id,
          {
            technicianId: seed.techWangId,
            scheduledStartTime: '2026-06-23 10:30:00',
            scheduledEndTime: '2026-06-23 11:30:00',
            reason: '时间冲突测试',
          },
          dispatcherUser()
        ),
        /已有派工/
      );
    });

    it('排除自身后不冲突可改派', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-24 10:00:00',
          scheduledEndTime: '2026-06-24 11:00:00',
          reason: '初始派工',
        },
        dispatcherUser()
      );

      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-24 10:30:00',
          scheduledEndTime: '2026-06-24 11:30:00',
          reason: '同一工单改时间不算冲突',
        },
        dispatcherUser()
      );

      const ticket = await getTicketById(ticketId, seed.dispatcherId, 'dispatcher');
      assert.equal(ticket?.status, 'reassigned');
    });

    it('已关闭工单不能派工', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-06-25 10:00:00',
          scheduledEndTime: '2026-06-25 11:00:00',
          reason: '派工',
        },
        dispatcherUser()
      );
      await completeTicket(ticketId, '完工', dispatcherUser());
      await closeTicket(ticketId, '关闭', adminUser());

      await assert.rejects(
        assignTicket(
          ticketId,
          {
            technicianId: seed.techZhangId,
            scheduledStartTime: '2026-06-26 10:00:00',
            scheduledEndTime: '2026-06-26 11:00:00',
            reason: '已关闭后不能再派',
          },
          dispatcherUser()
        ),
        /不支持派工/
      );
    });

    it('工单不存在时抛错', async () => {
      await assert.rejects(
        assignTicket(
          99999,
          {
            technicianId: seed.techWangId,
            scheduledStartTime: '2026-06-22 10:00:00',
            scheduledEndTime: '2026-06-22 11:00:00',
            reason: 'test',
          },
          dispatcherUser()
        ),
        /工单不存在/
      );
    });
  });

  describe('completeTicket & closeTicket', () => {
    let ticketId: number;

    beforeEach(async () => {
      const result = await createTicket(
        { title: '完工测试', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      ticketId = result.id;
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-07-01 09:00:00',
          scheduledEndTime: '2026-07-01 10:00:00',
          reason: '派工',
        },
        dispatcherUser()
      );
    });

    it('成功标记完工，状态变为 completed', async () => {
      await completeTicket(ticketId, '维修完成', dispatcherUser());
      const ticket = await getTicketById(ticketId, seed.dispatcherId, 'dispatcher');
      assert.equal(ticket?.status, 'completed');
    });

    it('待复核状态才能关闭，关闭后状态为 closed', async () => {
      await completeTicket(ticketId, '完工', dispatcherUser());
      await closeTicket(ticketId, '复核通过', adminUser());
      const ticket = await getTicketById(ticketId, seed.adminId, 'admin');
      assert.equal(ticket?.status, 'closed');
    });

    it('非待复核状态不能直接关闭', async () => {
      await assert.rejects(
        closeTicket(ticketId, '直接关闭试试', adminUser()),
        /仅待复核状态可关闭/
      );
    });
  });

  describe('权限控制', () => {
    let zhangsanTicketId: number;
    let lisiTicketId: number;

    before(async () => {
      const r1 = await createTicket(
        { title: '张三的工单', description: 'test', address: '张三的家', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      zhangsanTicketId = r1.id;
      const r2 = await createTicket(
        { title: '李四的工单', description: 'test', address: '李四的家', repairTypeId: seed.electricTypeId },
        seed.lisiId
      );
      lisiTicketId = r2.id;
    });

    it('住户只能看到自己的工单列表', async () => {
      const zhangsanTickets = await getTickets(seed.zhangsanId, 'resident');
      const lisiTickets = await getTickets(seed.lisiId, 'resident');

      assert.ok(zhangsanTickets.length >= 1);
      assert.ok(zhangsanTickets.every(t => t.residentId === seed.zhangsanId));
      assert.ok(lisiTickets.every(t => t.residentId === seed.lisiId));
      assert.ok(
        !zhangsanTickets.some(t => t.id === lisiTicketId),
        '张三不应看到李四的工单'
      );
    });

    it('住户不能查看别人的工单详情', async () => {
      const ticket = await getTicketById(zhangsanTicketId, seed.lisiId, 'resident');
      assert.equal(ticket, null, '李四不应看到张三的工单详情');
    });

    it('调度员能看到所有工单', async () => {
      const tickets = await getTickets(seed.dispatcherId, 'dispatcher');
      assert.ok(tickets.some(t => t.id === zhangsanTicketId));
      assert.ok(tickets.some(t => t.id === lisiTicketId));
    });
  });

  describe('操作留痕', () => {
    let ticketId: number;

    beforeEach(async () => {
      const result = await createTicket(
        { title: '留痕测试', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      ticketId = result.id;
    });

    it('每次状态变化都有状态日志和操作人', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-08-01 10:00:00',
          scheduledEndTime: '2026-08-01 11:00:00',
          reason: '首次派工',
        },
        dispatcherUser()
      );
      await completeTicket(ticketId, '维修完成', dispatcherUser());
      await closeTicket(ticketId, '复核通过', adminUser());

      const logs = await getStatusLogs(ticketId);
      assert.ok(logs.length >= 4, '至少应有4次状态变更（创建+派工+完工+关闭）');

      const firstLog = logs[0];
      assert.equal(firstLog.toStatus, 'pending');
      assert.equal(firstLog.reason, '住户提交报修');

      const assignLog = logs.find(l => l.toStatus === 'assigned');
      assert.ok(assignLog);
      assert.equal(assignLog?.operatorName, '张调度');
      assert.equal(assignLog?.reason, '首次派工');

      const closeLog = logs.find(l => l.toStatus === 'closed');
      assert.ok(closeLog);
      assert.equal(closeLog?.operatorName, '系统管理员');
      assert.equal(closeLog?.reason, '复核通过');
    });

    it('派工历史记录技工变更和操作人', async () => {
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-08-02 09:00:00',
          scheduledEndTime: '2026-08-02 10:00:00',
          reason: '第一次派王师傅',
        },
        dispatcherUser()
      );
      await assignTicket(
        ticketId,
        {
          technicianId: seed.techLiId,
          scheduledStartTime: '2026-08-02 14:00:00',
          scheduledEndTime: '2026-08-02 15:00:00',
          reason: '改派李师傅',
        },
        dispatcherUser()
      );

      const logs = await getAssignmentLogs(ticketId);
      assert.equal(logs.length, 2, '应有2条派工记录');

      assert.equal(logs[0].fromTechnicianName, null);
      assert.equal(logs[0].toTechnicianName, '王师傅');
      assert.equal(logs[0].operatorName, '张调度');
      assert.equal(logs[0].reason, '第一次派王师傅');

      assert.equal(logs[1].fromTechnicianName, '王师傅');
      assert.equal(logs[1].toTechnicianName, '李师傅');
      assert.equal(logs[1].reason, '改派李师傅');
    });
  });

  describe('checkTechnicianConflict', () => {
    it('空闲时段无冲突', async () => {
      const hasConflict = await checkTechnicianConflict(
        seed.techWangId,
        '2026-09-01 09:00:00',
        '2026-09-01 10:00:00'
      );
      assert.equal(hasConflict, false);
    });

    it('完全重叠有冲突', async () => {
      const result = await createTicket(
        { title: '冲突测试', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      await assignTicket(
        result.id,
        {
          technicianId: seed.techWangId,
          scheduledStartTime: '2026-09-02 10:00:00',
          scheduledEndTime: '2026-09-02 11:00:00',
          reason: 'test',
        },
        dispatcherUser()
      );

      const hasConflict = await checkTechnicianConflict(
        seed.techWangId,
        '2026-09-02 10:00:00',
        '2026-09-02 11:00:00'
      );
      assert.equal(hasConflict, true);
    });

    it('部分重叠有冲突', async () => {
      const result = await createTicket(
        { title: '部分重叠测试', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      await assignTicket(
        result.id,
        {
          technicianId: seed.techZhangId,
          scheduledStartTime: '2026-09-03 10:00:00',
          scheduledEndTime: '2026-09-03 12:00:00',
          reason: 'test',
        },
        dispatcherUser()
      );

      const hasConflict = await checkTechnicianConflict(
        seed.techZhangId,
        '2026-09-03 11:00:00',
        '2026-09-03 13:00:00'
      );
      assert.equal(hasConflict, true);
    });

    it('端点相邻不算冲突', async () => {
      const result = await createTicket(
        { title: '端点测试', description: 'test', address: '1栋101', repairTypeId: seed.leakTypeId },
        seed.zhangsanId
      );
      await assignTicket(
        result.id,
        {
          technicianId: seed.techLiId,
          scheduledStartTime: '2026-09-04 10:00:00',
          scheduledEndTime: '2026-09-04 11:00:00',
          reason: 'test',
        },
        dispatcherUser()
      );

      const hasConflict = await checkTechnicianConflict(
        seed.techLiId,
        '2026-09-04 11:00:00',
        '2026-09-04 12:00:00'
      );
      assert.equal(hasConflict, false);
    });
  });
});
