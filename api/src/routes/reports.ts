import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { exportTickets } from '../services/reportService';
import dayjs from 'dayjs';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

router.get('/export', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const csv = await exportTickets(status, startDate, endDate);
    const filename = `维修工单报表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
