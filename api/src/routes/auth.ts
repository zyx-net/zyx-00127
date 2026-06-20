import { Router } from 'express';
import { login } from '../services/authService';
import { LoginRequest, ApiResponse } from '../../../shared/types';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as LoginRequest;

    if (!username || !password) {
      res.status(400).json({ success: false, error: '账号和密码不能为空' } as ApiResponse);
      return;
    }

    const result = await login(username.trim(), password);
    if (!result) {
      res.status(401).json({ success: false, error: '账号或密码错误' } as ApiResponse);
      return;
    }

    res.json({ success: true, data: result } as ApiResponse<typeof result>);
  } catch (err) {
    const message = err instanceof Error ? err.message : '登录失败';
    res.status(500).json({ success: false, error: message } as ApiResponse);
  }
});

export default router;
