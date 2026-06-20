import { run, get, all } from '../db/utils';
import { RepairType, Technician, Shift } from '../../../shared/types';

export const getRepairTypes = async (): Promise<RepairType[]> => {
  const rows = await all<{ id: number; name: string; description: string; created_at: string }>(
    'SELECT * FROM repair_types ORDER BY id ASC'
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
  }));
};

export const createRepairType = async (name: string, description: string): Promise<{ id: number }> => {
  if (!name || !name.trim()) {
    throw new Error('维修类型名称不能为空');
  }
  const existing = await get('SELECT id FROM repair_types WHERE name = ?', [name.trim()]);
  if (existing) {
    throw new Error('该维修类型已存在');
  }
  const result = await run(
    'INSERT INTO repair_types (name, description) VALUES (?, ?)',
    [name.trim(), description || '']
  );
  return { id: result.lastID };
};

export const updateRepairType = async (id: number, name: string, description: string): Promise<void> => {
  if (!name || !name.trim()) {
    throw new Error('维修类型名称不能为空');
  }
  const existing = await get('SELECT id FROM repair_types WHERE name = ? AND id != ?', [name.trim(), id]);
  if (existing) {
    throw new Error('该维修类型已存在');
  }
  await run(
    'UPDATE repair_types SET name = ?, description = ? WHERE id = ?',
    [name.trim(), description || '', id]
  );
};

export const deleteRepairType = async (id: number): Promise<void> => {
  const using = await get<{ count: number }>(
    'SELECT COUNT(*) as count FROM tickets WHERE repair_type_id = ?',
    [id]
  );
  if (using && using.count > 0) {
    throw new Error('该维修类型已有工单使用，无法删除');
  }
  await run('DELETE FROM repair_types WHERE id = ?', [id]);
};

export const getTechnicians = async (): Promise<Technician[]> => {
  const rows = await all<{ id: number; name: string; phone: string; skill: string; created_at: string }>(
    'SELECT * FROM technicians ORDER BY id ASC'
  );
  return rows.map(t => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    skill: t.skill,
    createdAt: t.created_at,
  }));
};

export const createTechnician = async (name: string, phone: string, skill: string): Promise<{ id: number }> => {
  if (!name || !name.trim()) throw new Error('技工姓名不能为空');
  if (!phone || !phone.trim()) throw new Error('技工电话不能为空');
  const result = await run(
    'INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)',
    [name.trim(), phone.trim(), skill || '']
  );
  return { id: result.lastID };
};

export const updateTechnician = async (id: number, name: string, phone: string, skill: string): Promise<void> => {
  if (!name || !name.trim()) throw new Error('技工姓名不能为空');
  if (!phone || !phone.trim()) throw new Error('技工电话不能为空');
  await run(
    'UPDATE technicians SET name = ?, phone = ?, skill = ? WHERE id = ?',
    [name.trim(), phone.trim(), skill || '', id]
  );
};

export const deleteTechnician = async (id: number): Promise<void> => {
  const using = await get<{ count: number }>(
    'SELECT COUNT(*) as count FROM tickets WHERE current_technician_id = ? AND status IN (?, ?, ?)',
    [id, 'assigned', 'reassigned', 'completed']
  );
  if (using && using.count > 0) {
    throw new Error('该技工有未完成的工单，无法删除');
  }
  await run('DELETE FROM shifts WHERE technician_id = ?', [id]);
  await run('DELETE FROM technicians WHERE id = ?', [id]);
};

export const getShifts = async (): Promise<Shift[]> => {
  const rows = await all<{
    id: number; technician_id: number; technician_name?: string;
    day_of_week: number; start_time: string; end_time: string; created_at: string;
  }>(`
    SELECT s.*, t.name as technician_name
    FROM shifts s
    LEFT JOIN technicians t ON s.technician_id = t.id
    ORDER BY s.technician_id, s.day_of_week
  `);
  return rows.map(s => ({
    id: s.id,
    technicianId: s.technician_id,
    technicianName: s.technician_name,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    createdAt: s.created_at,
  }));
};

export const createShift = async (technicianId: number, dayOfWeek: number, startTime: string, endTime: string): Promise<{ id: number }> => {
  if (dayOfWeek < 0 || dayOfWeek > 6) throw new Error('星期值无效');
  const tech = await get('SELECT id FROM technicians WHERE id = ?', [technicianId]);
  if (!tech) throw new Error('技工不存在');
  const existing = await get(
    'SELECT id FROM shifts WHERE technician_id = ? AND day_of_week = ?',
    [technicianId, dayOfWeek]
  );
  if (existing) {
    throw new Error('该技工此日已有班次');
  }
  const result = await run(
    'INSERT INTO shifts (technician_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
    [technicianId, dayOfWeek, startTime, endTime]
  );
  return { id: result.lastID };
};

export const updateShift = async (id: number, dayOfWeek: number, startTime: string, endTime: string): Promise<void> => {
  if (dayOfWeek < 0 || dayOfWeek > 6) throw new Error('星期值无效');
  await run(
    'UPDATE shifts SET day_of_week = ?, start_time = ?, end_time = ? WHERE id = ?',
    [dayOfWeek, startTime, endTime, id]
  );
};

export const deleteShift = async (id: number): Promise<void> => {
  await run('DELETE FROM shifts WHERE id = ?', [id]);
};
