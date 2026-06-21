import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { exportTickets } from '../services/reportService';
import {
  validateExportParams,
  createExportHistory,
  getExportHistories,
  getExportHistoryById,
  saveExportFile,
  getExportFilePath,
} from '../services/exportHistoryService';
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
} from '../services/exportSchemeService';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

const applySchemeToExport = (
  scheme: { status?: string | null; startDate?: string | null; endDate?: string | null; dateRangeType?: string } | undefined | null,
  reqParams: { status?: string; startDate?: string; endDate?: string; dateRangeType?: string }
) => {
  const useDefault = reqParams.dateRangeType === undefined && reqParams.status === undefined;

  if (useDefault && scheme) {
    return {
      status: scheme.status || undefined,
      startDate: scheme.startDate || undefined,
      endDate: scheme.endDate || undefined,
      dateRangeType: scheme.dateRangeType || 'all',
    };
  }

  return {
    status: reqParams.status,
    startDate: reqParams.startDate,
    endDate: reqParams.endDate,
    dateRangeType: reqParams.dateRangeType || 'all',
  };
};

router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const schemeId = req.query.schemeId ? Number(req.query.schemeId) : undefined;
    let scheme = null;

    if (schemeId) {
      scheme = await getSchemeById(schemeId);
      if (!scheme) {
        res.status(404).json({ success: false, error: '指定的导出方案不存在' });
        return;
      }
    } else if (req.user) {
      scheme = await getDefaultScheme(req.user.id);
    }

    const reqParams = {
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      dateRangeType: req.query.dateRangeType as string | undefined,
    };

    const effective = applySchemeToExport(scheme, reqParams);

    const validationError = validateExportParams(effective.dateRangeType || 'all', effective.startDate, effective.endDate);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const csv = await exportTickets(effective.status, effective.startDate, effective.endDate);
    const filename = `维修工单报表_${dayjs().format('YYYYMMDD_HHmmss_SSS')}.csv`;

    let finalFilename = filename;
    if (req.user) {
      finalFilename = saveExportFile(filename, csv);

      await createExportHistory(
        effective.status || null,
        effective.startDate || null,
        effective.endDate || null,
        finalFilename,
        req.user.id,
        req.user.name
      );
    }

    const encodedFilename = encodeURIComponent(finalFilename);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    if (scheme) {
      res.setHeader('X-Export-Scheme-Id', String(scheme.id));
      res.setHeader('X-Export-Scheme-Name', encodeURIComponent(scheme.name));
    }
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/export-histories', async (_req: AuthRequest, res: Response) => {
  try {
    const histories = await getExportHistories();
    res.json({ success: true, data: histories });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取导出记录失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/export-histories/:id/re-export', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const history = await getExportHistoryById(id);

    if (!history) {
      res.status(404).json({ success: false, error: '导出记录不存在' });
      return;
    }

    const csv = await exportTickets(
      history.status || undefined,
      history.startDate || undefined,
      history.endDate || undefined
    );

    const filename = `维修工单报表_${dayjs().format('YYYYMMDD_HHmmss_SSS')}.csv`;

    let finalFilename = filename;
    if (req.user) {
      finalFilename = saveExportFile(filename, csv);

      await createExportHistory(
        history.status,
        history.startDate,
        history.endDate,
        finalFilename,
        req.user.id,
        req.user.name
      );
    }

    const encodedFilename = encodeURIComponent(finalFilename);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : '重新导出失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/export-histories/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const history = await getExportHistoryById(id);

    if (!history) {
      res.status(404).json({ success: false, error: '导出记录不存在' });
      return;
    }

    const filePath = getExportFilePath(history.filename);
    if (!filePath) {
      const csv = await exportTickets(
        history.status || undefined,
        history.startDate || undefined,
        history.endDate || undefined
      );

      saveExportFile(history.filename, csv);

      const encodedFilename = encodeURIComponent(history.filename);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
      res.send(csv);
      return;
    }

    const encodedFilename = encodeURIComponent(history.filename);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : '下载失败';
    res.status(500).json({ success: false, error: message });
  }
});

// —— 静态路径路由（按静态程度排序，避免和动态 :id 路由产生任何匹配歧义）——

router.get('/schemes', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }
    const schemes = await getSchemesByOwner(req.user.id);
    res.json({ success: true, data: schemes });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取方案列表失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/schemes/default', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }
    const scheme = await getDefaultScheme(req.user.id);
    res.json({ success: true, data: scheme });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取默认方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/schemes', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const { name, description, status, startDate, endDate, dateRangeType, overwrite } = req.body || {};

    if (!name || !dateRangeType) {
      res.status(400).json({ success: false, error: '方案名称和日期范围类型为必填' });
      return;
    }

    const result = await createScheme({
      name,
      description: description || null,
      status: status || null,
      startDate: startDate || null,
      endDate: endDate || null,
      dateRangeType,
      ownerId: req.user.id,
      ownerName: req.user.name,
      overwrite: !!overwrite,
    });

    if (!result.success) {
      if (result.conflict) {
        res.status(409).json({
          success: false,
          error: `方案名称 "${name}" 已存在，可使用 overwrite=true 覆盖`,
          conflict: true,
          conflictInfo: { type: result.conflict.type, existingId: result.conflict.existingId },
        });
        return;
      }
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({ success: true, data: result.scheme, message: overwrite ? '方案已覆盖更新' : '方案创建成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/scheme-logs', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }
    const logs = await getSchemeLogs();
    res.json({ success: true, data: logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取操作日志失败';
    res.status(500).json({ success: false, error: message });
  }
});

// —— 三段式动态路由（/:id/default、/:id/copy、/:id/logs）先注册，避免被两段 /:id 抢先匹配 ——

router.post('/schemes/:id/default', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const id = Number(req.params.id);
    const result = await setDefaultScheme(id, req.user.id, req.user.name);

    if (!result.success) {
      const statusCode = result.error === '方案不存在' ? 404 : result.error === '无权修改他人的方案' ? 403 : 400;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, data: result.scheme, message: '已设为默认方案' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '设置默认方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/schemes/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const id = Number(req.params.id);
    const { newName } = req.body || {};

    if (!newName) {
      res.status(400).json({ success: false, error: '请提供新方案名称 newName' });
      return;
    }

    const result = await copyScheme(id, newName, req.user.id, req.user.name);

    if (!result.success) {
      if (result.conflict) {
        res.status(409).json({
          success: false,
          conflict: true,
          conflictInfo: { type: result.conflict.type, existingId: result.conflict.existingId },
          error: `新方案名称 "${newName}" 已存在`,
        });
        return;
      }
      const statusCode = result.error === '源方案不存在' ? 404 : result.error === '无权复制他人的方案' ? 403 : 400;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({ success: true, data: result.scheme, message: '方案复制成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '复制方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/schemes/:id/logs', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const id = Number(req.params.id);
    const scheme = await getSchemeById(id);
    if (scheme && scheme.ownerId !== req.user.id) {
      res.status(403).json({ success: false, error: '无权查看他人的方案日志' });
      return;
    }

    const logs = await getSchemeLogs(id);
    res.json({ success: true, data: logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取方案操作日志失败';
    res.status(500).json({ success: false, error: message });
  }
});

// —— 两段式动态路由（/:id）放在最后，最具通用性 ——

router.get('/schemes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const scheme = await getSchemeById(id);

    if (!scheme) {
      res.status(404).json({ success: false, error: '方案不存在' });
      return;
    }
    if (!req.user || scheme.ownerId !== req.user.id) {
      res.status(403).json({ success: false, error: '无权访问他人的方案' });
      return;
    }

    res.json({ success: true, data: scheme });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.put('/schemes/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const id = Number(req.params.id);
    const result = await updateScheme(id, {
      ...req.body,
      operatorId: req.user.id,
      operatorName: req.user.name,
    });

    if (!result.success) {
      if (result.conflict) {
        res.status(409).json({
          success: false,
          conflict: true,
          conflictInfo: {
            type: result.conflict.type,
            serverVersion: result.conflict.serverVersion,
            existingId: result.conflict.existingId,
          },
          error:
            result.conflict.type === 'version_mismatch'
              ? '方案已被他人修改，请刷新后重试'
              : `方案名称已存在`,
        });
        return;
      }
      const statusCode = result.error === '方案不存在' ? 404 : result.error === '无权修改他人的方案' ? 403 : 400;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, data: result.scheme, message: '方案更新成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

router.delete('/schemes/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const id = Number(req.params.id);
    const force = req.query.force === 'true' || req.body?.force === true;

    const result = await deleteScheme(id, req.user.id, req.user.name, force);

    if (!result.success) {
      if (result.conflict) {
        res.status(409).json({
          success: false,
          conflict: true,
          conflictInfo: { type: result.conflict.type },
          error: '该方案为默认方案，确认删除请加 force=true 参数',
        });
        return;
      }
      const statusCode = result.error === '方案不存在' ? 404 : result.error === '无权删除他人的方案' ? 403 : 400;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, message: force ? '默认方案已强制删除' : '方案删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除方案失败';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
