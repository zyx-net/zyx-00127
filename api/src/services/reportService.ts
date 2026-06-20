import { all } from '../db/utils';
import { TicketStatus, TICKET_STATUS_LABELS } from '../../../shared/types';

export const exportTickets = async (status?: string, startDate?: string, endDate?: string): Promise<string> => {
  let sql = `
    SELECT t.id,
           t.title,
           t.description,
           t.address,
           rt.name as repair_type,
           u.name as resident_name,
           u.phone as resident_phone,
           t.status,
           tech.name as technician_name,
           tech.phone as technician_phone,
           t.scheduled_start_time,
           t.scheduled_end_time,
           t.created_at,
           t.updated_at
    FROM tickets t
    LEFT JOIN repair_types rt ON t.repair_type_id = rt.id
    LEFT JOIN users u ON t.resident_id = u.id
    LEFT JOIN technicians tech ON t.current_technician_id = tech.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (status && status !== 'all') {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (startDate) {
    sql += ' AND t.created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND t.created_at <= ?';
    params.push(endDate);
  }

  sql += ' ORDER BY t.created_at DESC';

  const rows = await all<{
    id: number; title: string; description: string; address: string; repair_type: string;
    resident_name: string; resident_phone: string; status: TicketStatus;
    technician_name: string | null; technician_phone: string | null;
    scheduled_start_time: string | null; scheduled_end_time: string | null;
    created_at: string; updated_at: string;
  }>(sql, params);

  const headers = [
    '工单ID', '标题', '描述', '地址', '维修类型', '住户姓名', '住户电话',
    '状态', '技工姓名', '技工电话', '预约开始', '预约结束', '创建时间', '更新时间'
  ];

  const escapeCsv = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map(row => [
      row.id,
      row.title,
      row.description,
      row.address,
      row.repair_type,
      row.resident_name,
      row.resident_phone,
      TICKET_STATUS_LABELS[row.status] || row.status,
      row.technician_name,
      row.technician_phone,
      row.scheduled_start_time,
      row.scheduled_end_time,
      row.created_at,
      row.updated_at,
    ].map(escapeCsv).join(','))
  ];

  return '\uFEFF' + csvLines.join('\n');
};
