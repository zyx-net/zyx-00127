import { run, get, all } from '../db/utils';
import { ExportScheme, SchemeOperationLog, UpdateSchemeRequest } from '../../../shared/types';

interface ExportSchemeRow {
  id: number;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  date_range_type: string;
  is_default: number;
  owner_id: number;
  owner_name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SchemeLogRow {
  id: number;
  scheme_id: number | null;
  scheme_name: string | null;
  operation: string;
  operator_id: number;
  operator_name: string;
  detail: string | null;
  created_at: string;
}

const rowToScheme = (row: ExportSchemeRow): ExportScheme => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  startDate: row.start_date,
  endDate: row.end_date,
  dateRangeType: row.date_range_type,
  isDefault: row.is_default === 1,
  ownerId: row.owner_id,
  ownerName: row.owner_name,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToLog = (row: SchemeLogRow): SchemeOperationLog => ({
  id: row.id,
  schemeId: row.scheme_id,
  schemeName: row.scheme_name,
  operation: row.operation,
  operatorId: row.operator_id,
  operatorName: row.operator_name,
  detail: row.detail,
  createdAt: row.created_at,
});

const writeOperationLog = async (
  schemeId: number | null,
  schemeName: string | null,
  operation: string,
  operatorId: number,
  operatorName: string,
  detail?: string
): Promise<void> => {
  await run(
    `INSERT INTO scheme_operation_logs (scheme_id, scheme_name, operation, operator_id, operator_name, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [schemeId, schemeName, operation, operatorId, operatorName, detail || null]
  );
};

export interface CreateSchemeParams {
  name: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dateRangeType: string;
  ownerId: number;
  ownerName: string;
  overwrite?: boolean;
}

export interface CreateSchemeResult {
  success: boolean;
  scheme?: ExportScheme;
  conflict?: {
    type: 'duplicate_name';
    existingId: number;
  };
  error?: string;
}

export const createScheme = async (params: CreateSchemeParams): Promise<CreateSchemeResult> => {
  const { name, description, status, startDate, endDate, dateRangeType, ownerId, ownerName, overwrite } = params;

  if (!name || name.trim().length === 0) {
    return { success: false, error: '方案名称不能为空' };
  }
  if (name.length > 100) {
    return { success: false, error: '方案名称不能超过100个字符' };
  }

  const existing = await get<ExportSchemeRow>(
    'SELECT * FROM export_schemes WHERE name = ? AND owner_id = ?',
    [name.trim(), ownerId]
  );

  if (existing && !overwrite) {
    return {
      success: false,
      conflict: {
        type: 'duplicate_name',
        existingId: existing.id,
      },
    };
  }

  if (existing && overwrite) {
    const updated = await run(
      `UPDATE export_schemes
       SET description = ?, status = ?, start_date = ?, end_date = ?, date_range_type = ?,
           version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        description || null,
        status || null,
        startDate || null,
        endDate || null,
        dateRangeType || 'all',
        existing.id,
      ]
    );

    if (updated.changes > 0) {
      const scheme = await getSchemeById(existing.id);
      if (scheme) {
        await writeOperationLog(
          scheme.id, scheme.name, 'overwrite',
          ownerId, ownerName,
          `覆盖更新已有方案，版本号提升至 ${scheme.version}`
        );
        return { success: true, scheme };
      }
    }
  }

  const result = await run(
    `INSERT INTO export_schemes (name, description, status, start_date, end_date, date_range_type, owner_id, owner_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      description || null,
      status || null,
      startDate || null,
      endDate || null,
      dateRangeType || 'all',
      ownerId,
      ownerName,
    ]
  );

  const scheme = await getSchemeById(result.lastID);
  if (scheme) {
    await writeOperationLog(
      scheme.id, scheme.name, 'create',
      ownerId, ownerName,
      `创建新导出方案 "${scheme.name}"`
    );
  }

  return { success: true, scheme };
};

export const getSchemesByOwner = async (ownerId: number): Promise<ExportScheme[]> => {
  const rows = await all<ExportSchemeRow>(
    'SELECT * FROM export_schemes WHERE owner_id = ? ORDER BY is_default DESC, updated_at DESC',
    [ownerId]
  );
  return rows.map(rowToScheme);
};

export const getSchemeById = async (id: number): Promise<ExportScheme | null> => {
  const row = await get<ExportSchemeRow>(
    'SELECT * FROM export_schemes WHERE id = ?',
    [id]
  );
  return row ? rowToScheme(row) : null;
};

export const getDefaultScheme = async (ownerId: number): Promise<ExportScheme | null> => {
  const row = await get<ExportSchemeRow>(
    'SELECT * FROM export_schemes WHERE owner_id = ? AND is_default = 1 LIMIT 1',
    [ownerId]
  );
  return row ? rowToScheme(row) : null;
};

export const setDefaultScheme = async (
  id: number,
  ownerId: number,
  operatorName: string
): Promise<{ success: boolean; scheme?: ExportScheme; error?: string }> => {
  const scheme = await getSchemeById(id);
  if (!scheme) {
    return { success: false, error: '方案不存在' };
  }
  if (scheme.ownerId !== ownerId) {
    return { success: false, error: '无权修改他人的方案' };
  }

  await run('UPDATE export_schemes SET is_default = 0 WHERE owner_id = ? AND is_default = 1', [ownerId]);
  await run('UPDATE export_schemes SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

  const updated = await getSchemeById(id);
  if (updated) {
    await writeOperationLog(
      updated.id, updated.name, 'set_default',
      ownerId, operatorName,
      `将方案 "${updated.name}" 设为默认导出方案`
    );
  }

  return { success: true, scheme: updated || undefined };
};

export const updateScheme = async (
  id: number,
  params: UpdateSchemeRequest & { operatorId: number; operatorName: string }
): Promise<{
  success: boolean;
  scheme?: ExportScheme;
  conflict?: {
    type: 'version_mismatch' | 'duplicate_name';
    serverVersion?: number;
    existingId?: number;
  };
  error?: string;
}> => {
  const { operatorId, operatorName, expectedVersion, name, ...rest } = params;

  const current = await getSchemeById(id);
  if (!current) {
    return { success: false, error: '方案不存在' };
  }
  if (current.ownerId !== operatorId) {
    return { success: false, error: '无权修改他人的方案' };
  }

  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    return {
      success: false,
      conflict: {
        type: 'version_mismatch',
        serverVersion: current.version,
      },
    };
  }

  if (name && name !== current.name) {
    const dup = await get<ExportSchemeRow>(
      'SELECT * FROM export_schemes WHERE name = ? AND owner_id = ? AND id != ?',
      [name.trim(), operatorId, id]
    );
    if (dup) {
      return {
        success: false,
        conflict: {
          type: 'duplicate_name',
          existingId: dup.id,
        },
      };
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name.trim());
  }
  if (rest.description !== undefined) {
    fields.push('description = ?');
    values.push(rest.description || null);
  }
  if (rest.status !== undefined) {
    fields.push('status = ?');
    values.push(rest.status || null);
  }
  if (rest.startDate !== undefined) {
    fields.push('start_date = ?');
    values.push(rest.startDate || null);
  }
  if (rest.endDate !== undefined) {
    fields.push('end_date = ?');
    values.push(rest.endDate || null);
  }
  if (rest.dateRangeType !== undefined) {
    fields.push('date_range_type = ?');
    values.push(rest.dateRangeType || 'all');
  }

  if (fields.length === 0) {
    return { success: true, scheme: current };
  }

  fields.push('version = version + 1');
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  await run(
    `UPDATE export_schemes SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  const updated = await getSchemeById(id);
  if (updated) {
    await writeOperationLog(
      updated.id, updated.name, 'update',
      operatorId, operatorName,
      `更新方案 "${updated.name}"，版本提升至 ${updated.version}`
    );
  }

  return { success: true, scheme: updated || undefined };
};

export const copyScheme = async (
  id: number,
  newName: string,
  operatorId: number,
  operatorName: string
): Promise<CreateSchemeResult> => {
  const source = await getSchemeById(id);
  if (!source) {
    return { success: false, error: '源方案不存在' };
  }
  if (source.ownerId !== operatorId) {
    return { success: false, error: '无权复制他人的方案' };
  }

  const existing = await get<ExportSchemeRow>(
    'SELECT * FROM export_schemes WHERE name = ? AND owner_id = ?',
    [newName.trim(), operatorId]
  );
  if (existing) {
    return {
      success: false,
      conflict: {
        type: 'duplicate_name',
        existingId: existing.id,
      },
    };
  }

  const result = await run(
    `INSERT INTO export_schemes (name, description, status, start_date, end_date, date_range_type, owner_id, owner_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newName.trim(),
      source.description,
      source.status,
      source.startDate,
      source.endDate,
      source.dateRangeType,
      operatorId,
      operatorName,
    ]
  );

  const scheme = await getSchemeById(result.lastID);
  if (scheme) {
    await writeOperationLog(
      scheme.id, scheme.name, 'copy',
      operatorId, operatorName,
      `从方案 "${source.name}"(ID:${source.id}) 复制为新方案 "${scheme.name}"`
    );
  }

  return { success: true, scheme };
};

export const deleteScheme = async (
  id: number,
  operatorId: number,
  operatorName: string,
  force?: boolean
): Promise<{
  success: boolean;
  conflict?: { type: 'delete_default' };
  error?: string;
}> => {
  const scheme = await getSchemeById(id);
  if (!scheme) {
    return { success: false, error: '方案不存在' };
  }
  if (scheme.ownerId !== operatorId) {
    return { success: false, error: '无权删除他人的方案' };
  }

  if (scheme.isDefault && !force) {
    return {
      success: false,
      conflict: { type: 'delete_default' },
    };
  }

  const schemeName = scheme.name;
  const schemeId = scheme.id;

  await writeOperationLog(
    schemeId, schemeName, 'delete',
    operatorId, operatorName,
    force
      ? `强制删除默认方案 "${schemeName}"`
      : `删除方案 "${schemeName}"`
  );

  await run('DELETE FROM export_schemes WHERE id = ?', [id]);

  return { success: true };
};

export const getSchemeLogs = async (
  schemeId?: number,
  limit = 50
): Promise<SchemeOperationLog[]> => {
  let sql = 'SELECT * FROM scheme_operation_logs';
  const params: unknown[] = [];

  if (schemeId !== undefined) {
    sql += ' WHERE scheme_id = ?';
    params.push(schemeId);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await all<SchemeLogRow>(sql, params);
  return rows.map(rowToLog);
};
