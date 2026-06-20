import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import {
  getTickets, getTicketById, createTicket, assignTicket,
  completeTicket, closeTicket, getStatusLogs, getAssignmentLogs
} from '../services/ticketService';
import {
  CreateTicketRequest, AssignTicketRequest, ApiResponse, User
} from '../../../shared/types';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const status = req.query.status as string | undefined;
    const tickets = await getTickets(req.user.id, req.user.role, status);
    res.json({ success: true, data: tickets } as ApiResponse<typeof tickets>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取工单失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const ticketId = parseInt(req.params.id);
    const ticket = await getTicketById(ticketId, req.user.id, req.user.role);
    if (!ticket) {
      res.status(404).json({ success: false, error: '工单不存在或无权限查看' } as ApiResponse);
      return;
    }

    const [statusLogs, assignmentLogs] = await Promise.all([
      getStatusLogs(ticketId),
      getAssignmentLogs(ticketId),
    ]);

    res.json({
      success: true,
      data: { ticket, statusLogs, assignmentLogs }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取工单失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/', requireRole(['resident']), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const data = req.body as CreateTicketRequest;
    const result = await createTicket(data, req.user.id);
    res.json({ success: true, data: result, message: '报修提交成功' } as ApiResponse<typeof result>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交报修失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/:id/assign', requireRole(['dispatcher', 'admin']), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const ticketId = parseInt(req.params.id);
    const data = req.body as AssignTicketRequest;
    await assignTicket(ticketId, data, req.user as User);
    res.json({ success: true, message: '派工成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '派工失败';
    if (message.includes('时段已有派工')) {
      res.status(409).json({ success: false, error: message } as ApiResponse);
    } else {
      res.status(400).json({ success: false, error: message } as ApiResponse);
    }
  }
});

router.post('/:id/reassign', requireRole(['dispatcher', 'admin']), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const ticketId = parseInt(req.params.id);
    const data = req.body as AssignTicketRequest;
    await assignTicket(ticketId, data, req.user as User);
    res.json({ success: true, message: '改派成功' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '改派失败';
    if (message.includes('时段已有派工')) {
      res.status(409).json({ success: false, error: message } as ApiResponse);
    } else {
      res.status(400).json({ success: false, error: message } as ApiResponse);
    }
  }
});

router.post('/:id/complete', requireRole(['dispatcher', 'admin']), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const ticketId = parseInt(req.params.id);
    const { reason } = req.body as { reason?: string };
    await completeTicket(ticketId, reason || '', req.user as User);
    res.json({ success: true, message: '标记成功，待复核' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

router.post('/:id/close', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' } as ApiResponse);
      return;
    }
    const ticketId = parseInt(req.params.id);
    const { reason } = req.body as { reason?: string };
    await closeTicket(ticketId, reason || '', req.user as User);
    res.json({ success: true, message: '工单已关闭' } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    res.status(400).json({ success: false, error: message } as ApiResponse);
  }
});

export default router;
