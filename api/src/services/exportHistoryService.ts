import { run, get, all } from '../db/utils';
import { ExportHistory } from '../../../shared/types';
import fs from 'fs';
import path from 'path';

const EXPORTS_DIR = path.join(process.cwd(), 'data', 'exports');

export const ensureExportsDir = (): void => {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
};

export const validateExportParams = (
  dateRangeType: string,
  startDate?: string,
  endDate?: string
): string | null => {
  if (dateRangeType === 'custom') {
    if (!startDate && !endDate) {
      return '自定义范围需要选择开始和结束日期';
    }
    if (!startDate) {
      return '请选择开始日期';
    }
    if (!endDate) {
      return '请选择结束日期';
    }
  }

  if (startDate && endDate && startDate > endDate) {
    return '结束日期不能早于开始日期';
  }

  return null;
};

interface ExportHistoryRow {
  id: number;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  filename: string;
  operator_id: number;
  operator_name: string;
  created_at: string;
}

const rowToExportHistory = (row: ExportHistoryRow): ExportHistory => ({
  id: row.id,
  status: row.status,
  startDate: row.start_date,
  endDate: row.end_date,
  filename: row.filename,
  operatorId: row.operator_id,
  operatorName: row.operator_name,
  createdAt: row.created_at,
});

export const createExportHistory = async (
  status: string | null,
  startDate: string | null,
  endDate: string | null,
  filename: string,
  operatorId: number,
  operatorName: string
): Promise<ExportHistory> => {
  const result = await run(
    `INSERT INTO export_histories (status, start_date, end_date, filename, operator_id, operator_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [status, startDate, endDate, filename, operatorId, operatorName]
  );

  return {
    id: result.lastID,
    status,
    startDate,
    endDate,
    filename,
    operatorId,
    operatorName,
    createdAt: new Date().toISOString(),
  };
};

export const getExportHistories = async (): Promise<ExportHistory[]> => {
  const rows = await all<ExportHistoryRow>(
    'SELECT * FROM export_histories ORDER BY created_at DESC LIMIT 50'
  );
  return rows.map(rowToExportHistory);
};

export const getExportHistoryById = async (id: number): Promise<ExportHistory | null> => {
  const row = await get<ExportHistoryRow>(
    'SELECT * FROM export_histories WHERE id = ?',
    [id]
  );
  return row ? rowToExportHistory(row) : null;
};

export const saveExportFile = (filename: string, content: string): string => {
  ensureExportsDir();
  const filePath = path.join(EXPORTS_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
};

export const getExportFilePath = (filename: string): string | null => {
  const filePath = path.join(EXPORTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
};
