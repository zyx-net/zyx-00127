import { Router } from 'express';
import { getRepairTypes } from '../services/configService';
import { getTechnicians } from '../services/configService';
import { ApiResponse } from '../../../shared/types';

const router = Router();

router.get('/repair-types', async (_req, res) => {
  try {
    const data = await getRepairTypes();
    res.json({ success: true, data } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.get('/technicians', async (_req, res) => {
  try {
    const data = await getTechnicians();
    res.json({ success: true, data } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

export default router;
