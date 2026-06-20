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
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const dateRangeType = req.query.dateRangeType as string | undefined;

    const validationError = validateExportParams(dateRangeType || 'all', startDate, endDate);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const csv = await exportTickets(status, startDate, endDate);
    const filename = `维修工单报表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    const encodedFilename = encodeURIComponent(filename);

    if (req.user) {
      saveExportFile(filename, csv);

      await createExportHistory(
        status || null,
        startDate || null,
        endDate || null,
        filename,
        req.user.id,
        req.user.name
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
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

    const filename = `维修工单报表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    const encodedFilename = encodeURIComponent(filename);

    if (req.user) {
      saveExportFile(filename, csv);

      await createExportHistory(
        history.status,
        history.startDate,
        history.endDate,
        filename,
        req.user.id,
        req.user.name
      );
    }

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

export default router;
