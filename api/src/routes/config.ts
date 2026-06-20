import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getRepairTypes, createRepairType, updateRepairType, deleteRepairType,
  getTechnicians, createTechnician, updateTechnician, deleteTechnician,
  getShifts, createShift, updateShift, deleteShift,
} from '../services/configService';
import { checkTechnicianConflict } from '../services/ticketService';
import { ApiResponse } from '../../../shared/types';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

router.get('/repair-types', async (_req, res) => {
  try {
    const data = await getRepairTypes();
    res.json({ success: true, data } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/repair-types', async (req, res) => {
  try {
    const { name, description } = req.body;
    const data = await createRepairType(name, description);
    res.json({ success: true, data, message: '创建成功' } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.put('/repair-types/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    await updateRepairType(id, name, description);
    res.json({ success: true, message: '更新成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.delete('/repair-types/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteRepairType(id);
    res.json({ success: true, message: '删除成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.get('/technicians', async (req, res) => {
  try {
    const data = await getTechnicians();
    if (req.query.includePublic === 'true') {
      res.json({ success: true, data } as ApiResponse<typeof data>);
    } else {
      res.json({ success: true, data } as ApiResponse<typeof data>);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.get('/technicians/:id/conflict', async (req, res) => {
  try {
    const techId = parseInt(req.params.id);
    const startTime = req.query.startTime as string;
    const endTime = req.query.endTime as string;
    const excludeTicketId = req.query.excludeTicketId ? parseInt(req.query.excludeTicketId as string) : undefined;

    if (!startTime || !endTime) {
      res.status(400).json({ success: false, error: '请提供时间范围' } as ApiResponse);
      return;
    }

    const hasConflict = await checkTechnicianConflict(techId, startTime, endTime, excludeTicketId);
    res.json({ success: true, data: { hasConflict } } as ApiResponse<{ hasConflict: boolean }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '检查失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/technicians', async (req, res) => {
  try {
    const { name, phone, skill } = req.body;
    const data = await createTechnician(name, phone, skill);
    res.json({ success: true, data, message: '创建成功' } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.put('/technicians/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, skill } = req.body;
    await updateTechnician(id, name, phone, skill);
    res.json({ success: true, message: '更新成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.delete('/technicians/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteTechnician(id);
    res.json({ success: true, message: '删除成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.get('/shifts', async (_req, res) => {
  try {
    const data = await getShifts();
    res.json({ success: true, data } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/shifts', async (req, res) => {
  try {
    const { technicianId, dayOfWeek, startTime, endTime } = req.body;
    const data = await createShift(technicianId, dayOfWeek, startTime, endTime);
    res.json({ success: true, data, message: '创建成功' } as ApiResponse<typeof data>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.put('/shifts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { dayOfWeek, startTime, endTime } = req.body;
    await updateShift(id, dayOfWeek, startTime, endTime);
    res.json({ success: true, message: '更新成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.delete('/shifts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteShift(id);
    res.json({ success: true, message: '删除成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

export default router;
