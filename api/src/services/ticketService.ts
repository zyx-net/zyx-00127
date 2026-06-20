import { run, get, all } from '../db/utils';
import { Ticket, TicketStatus, CreateTicketRequest, AssignTicketRequest, User, StatusLog, AssignmentLog } from '../../../shared/types';

interface TicketRow {
  id: number;
  title: string;
  description: string;
  address: string;
  repair_type_id: number;
  repair_type_name?: string;
  resident_id: number;
  resident_name?: string;
  resident_phone?: string;
  status: TicketStatus;
  current_technician_id: number | null;
  current_technician_name?: string;
  current_technician_phone?: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  created_at: string;
  updated_at: string;
}

const mapTicketRow = (row: TicketRow): Ticket => ({
  id: row.id,
  title: row.title,
  description: row.description,
  address: row.address,
  repairTypeId: row.repair_type_id,
  repairTypeName: row.repair_type_name,
  residentId: row.resident_id,
  residentName: row.resident_name,
  residentPhone: row.resident_phone,
  status: row.status,
  currentTechnicianId: row.current_technician_id,
  currentTechnicianName: row.current_technician_name,
  currentTechnicianPhone: row.current_technician_phone,
  scheduledStartTime: row.scheduled_start_time,
  scheduledEndTime: row.scheduled_end_time,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getTickets = async (userId: number, userRole: string, status?: string): Promise<Ticket[]> => {
  let sql = `
    SELECT t.*,
           rt.name as repair_type_name,
           u.name as resident_name,
           u.phone as resident_phone,
           tech.name as current_technician_name,
           tech.phone as current_technician_phone
    FROM tickets t
    LEFT JOIN repair_types rt ON t.repair_type_id = rt.id
    LEFT JOIN users u ON t.resident_id = u.id
    LEFT JOIN technicians tech ON t.current_technician_id = tech.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (userRole === 'resident') {
    sql += ' AND t.resident_id = ?';
    params.push(userId);
  }

  if (status && status !== 'all') {
    sql += ' AND t.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY t.created_at DESC';

  const rows = await all<TicketRow>(sql, params);
  return rows.map(mapTicketRow);
};

export const getTicketById = async (ticketId: number, userId: number, userRole: string): Promise<Ticket | null> => {
  let sql = `
    SELECT t.*,
           rt.name as repair_type_name,
           u.name as resident_name,
           u.phone as resident_phone,
           tech.name as current_technician_name,
           tech.phone as current_technician_phone
    FROM tickets t
    LEFT JOIN repair_types rt ON t.repair_type_id = rt.id
    LEFT JOIN users u ON t.resident_id = u.id
    LEFT JOIN technicians tech ON t.current_technician_id = tech.id
    WHERE t.id = ?
  `;
  const params: unknown[] = [ticketId];

  if (userRole === 'resident') {
    sql += ' AND t.resident_id = ?';
    params.push(userId);
  }

  const row = await get<TicketRow>(sql, params);
  return row ? mapTicketRow(row) : null;
};

export const createTicket = async (data: CreateTicketRequest, residentId: number): Promise<{ id: number }> => {
  if (!data.address || !data.address.trim()) {
    throw new Error('报修地址不能为空');
  }
  if (!data.repairTypeId || data.repairTypeId <= 0) {
    throw new Error('请选择维修类型');
  }
  if (!data.title || !data.title.trim()) {
    throw new Error('报修标题不能为空');
  }

  const repairTypeExists = await get('SELECT id FROM repair_types WHERE id = ?', [data.repairTypeId]);
  if (!repairTypeExists) {
    throw new Error('选择的维修类型不存在');
  }

  const result = await run(
    `INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [data.title.trim(), data.description || '', data.address.trim(), data.repairTypeId, residentId]
  );

  await run(
    `INSERT INTO status_logs (ticket_id, from_status, to_status, reason, operator_id)
     VALUES (?, '', 'pending', '住户提交报修', ?)`,
    [result.lastID, residentId]
  );

  return { id: result.lastID };
};

export const checkTechnicianConflict = async (
  technicianId: number,
  startTime: string,
  endTime: string,
  excludeTicketId?: number
): Promise<boolean> => {
  let sql = `
    SELECT COUNT(*) as count FROM tickets
    WHERE current_technician_id = ?
      AND status IN ('assigned', 'reassigned')
      AND scheduled_start_time < ?
      AND scheduled_end_time > ?
  `;
  const params: unknown[] = [technicianId, endTime, startTime];

  if (excludeTicketId) {
    sql += ' AND id != ?';
    params.push(excludeTicketId);
  }

  const row = await get<{ count: number }>(sql, params);
  return row ? row.count > 0 : false;
};

export const assignTicket = async (
  ticketId: number,
  data: AssignTicketRequest,
  operator: User
): Promise<void> => {
  const ticket = await get<TicketRow>('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) {
    throw new Error('工单不存在');
  }
  if (!['pending', 'assigned', 'reassigned'].includes(ticket.status)) {
    throw new Error('当前状态不支持派工');
  }

  const hasConflict = await checkTechnicianConflict(
    data.technicianId,
    data.scheduledStartTime,
    data.scheduledEndTime,
    ticketId
  );
  if (hasConflict) {
    throw new Error('该技工在此时段已有派工，请选择其他时段或技工');
  }

  const tech = await get('SELECT * FROM technicians WHERE id = ?', [data.technicianId]);
  if (!tech) {
    throw new Error('选择的技工不存在');
  }

  const isReassign = ticket.current_technician_id !== null;
  const newStatus: TicketStatus = isReassign ? 'reassigned' : 'assigned';

  await run(
    `UPDATE tickets
     SET status = ?, current_technician_id = ?, scheduled_start_time = ?, scheduled_end_time = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newStatus, data.technicianId, data.scheduledStartTime, data.scheduledEndTime, ticketId]
  );

  await run(
    `INSERT INTO assignment_logs (ticket_id, from_technician_id, to_technician_id, scheduled_start_time, scheduled_end_time, reason, operator_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, ticket.current_technician_id, data.technicianId, data.scheduledStartTime, data.scheduledEndTime, data.reason, operator.id]
  );

  if (ticket.status !== newStatus) {
    await run(
      `INSERT INTO status_logs (ticket_id, from_status, to_status, reason, operator_id)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, ticket.status, newStatus, data.reason, operator.id]
    );
  }
};

export const completeTicket = async (ticketId: number, reason: string, operator: User): Promise<void> => {
  const ticket = await get<TicketRow>('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) {
    throw new Error('工单不存在');
  }
  if (!['assigned', 'reassigned'].includes(ticket.status)) {
    throw new Error('当前状态不支持标记完工');
  }

  await run(
    `UPDATE tickets SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [ticketId]
  );

  await run(
    `INSERT INTO status_logs (ticket_id, from_status, to_status, reason, operator_id)
     VALUES (?, ?, 'completed', ?, ?)`,
    [ticketId, ticket.status, reason || '维修完成，待复核', operator.id]
  );
};

export const closeTicket = async (ticketId: number, reason: string, operator: User): Promise<void> => {
  const ticket = await get<TicketRow>('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) {
    throw new Error('工单不存在');
  }
  if (ticket.status !== 'completed') {
    throw new Error('仅待复核状态可关闭');
  }

  await run(
    `UPDATE tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [ticketId]
  );

  await run(
    `INSERT INTO status_logs (ticket_id, from_status, to_status, reason, operator_id)
     VALUES (?, 'completed', 'closed', ?, ?)`,
    [ticketId, reason || '复核通过，工单关闭', operator.id]
  );
};

export const getStatusLogs = async (ticketId: number): Promise<StatusLog[]> => {
  const rows = await all(`
    SELECT sl.*, u.name as operator_name
    FROM status_logs sl
    LEFT JOIN users u ON sl.operator_id = u.id
    WHERE sl.ticket_id = ?
    ORDER BY sl.created_at ASC
  `, [ticketId]);

  return rows.map((row: {
    id: number; ticket_id: number; from_status: TicketStatus; to_status: TicketStatus;
    reason: string; operator_id: number; operator_name?: string; created_at: string;
  }) => ({
    id: row.id,
    ticketId: row.ticket_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    createdAt: row.created_at,
  }));
};

export const getAssignmentLogs = async (ticketId: number): Promise<AssignmentLog[]> => {
  const rows = await all(`
    SELECT al.*,
           u.name as operator_name,
           from_tech.name as from_technician_name,
           to_tech.name as to_technician_name
    FROM assignment_logs al
    LEFT JOIN users u ON al.operator_id = u.id
    LEFT JOIN technicians from_tech ON al.from_technician_id = from_tech.id
    LEFT JOIN technicians to_tech ON al.to_technician_id = to_tech.id
    WHERE al.ticket_id = ?
    ORDER BY al.created_at ASC
  `, [ticketId]);

  return rows.map((row: {
    id: number; ticket_id: number; from_technician_id: number | null; to_technician_id: number;
    scheduled_start_time: string; scheduled_end_time: string; reason: string;
    operator_id: number; operator_name?: string; from_technician_name?: string;
    to_technician_name?: string; created_at: string;
  }) => ({
    id: row.id,
    ticketId: row.ticket_id,
    fromTechnicianId: row.from_technician_id,
    fromTechnicianName: row.from_technician_name,
    toTechnicianId: row.to_technician_id,
    toTechnicianName: row.to_technician_name,
    scheduledStartTime: row.scheduled_start_time,
    scheduledEndTime: row.scheduled_end_time,
    reason: row.reason,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    createdAt: row.created_at,
  }));
};
