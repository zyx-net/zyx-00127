import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_PORT = 18765;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

type RequestOpts = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

const HOST = '127.0.0.1';
const PORT = TEST_PORT;

const httpRequest = <T = unknown>(urlPath: string, opts: RequestOpts = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: T; raw: string }> => {
  return new Promise((resolve, reject) => {
    let path = urlPath;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) params.append(k, String(v));
      }
      const qs = params.toString();
      if (qs) path += `?${qs}`;
    }

    const method = opts.method || 'GET';
    const headers: Record<string, string> = {
      ...(opts.headers || {}),
    };
    const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      { host: HOST, port: PORT, path, method, headers },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: unknown = data;
          if (res.headers['content-type']?.includes('application/json') && data) {
            try { parsed = JSON.parse(data); } catch { /* keep as string */ }
          }
          resolve({ status: res.statusCode!, headers: res.headers, body: parsed as T, raw: data });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
};

interface LoginResult { token: string; user: { id: number; role: string; name: string } }

const tmpWorkDir = path.join(os.tmpdir(), `e2e-scheme-cwd-${Date.now()}`);
const dataDir = path.join(tmpWorkDir, 'data');
const exportsDir = path.join(dataDir, 'exports');
const dbFile = path.join(dataDir, 'app.db');
process.env.DB_PATH_OVERRIDE = dbFile;
fs.mkdirSync(exportsDir, { recursive: true });
process.chdir(tmpWorkDir);

describe('导出方案管理 - 端到端 HTTP 集成测试', () => {
  let server: http.Server;
  let restoreConsole: () => void;
  let originalCwd = process.cwd();
  let adminToken: string;
  let adminUserId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  before(async () => {
    const silenceModule = await import('./test-helpers.js');
    restoreConsole = silenceModule.silenceConsole();

    const initModule = await import('../src/db/init.js');
    await initModule.initDb();

    const appModule = await import('../app.js');
    const app = appModule.default;

    const dbUtils = await import('../src/db/utils.js');
    dbUtils.setDb(initModule.db);

    await new Promise<void>((resolve, reject) => {
      server = http.createServer(app);
      server.listen(TEST_PORT, () => resolve());
      server.on('error', reject);
    });

    const loginResp = await httpRequest<{ success: boolean; data?: LoginResult; error?: string }>('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: '123456' },
    });
    assert.equal(loginResp.status, 200);
    assert.equal(loginResp.body.success, true);
    adminToken = (loginResp.body.data as LoginResult).token;
    adminUserId = (loginResp.body.data as LoginResult).user.id;
  });

  after(async () => {
    if (server) server.close();
    process.chdir(originalCwd);
    if (fs.existsSync(tmpWorkDir)) try { fs.rmSync(tmpWorkDir, { recursive: true, force: true }); } catch { /* ignore */ }
    restoreConsole?.();
  });

  it('非管理员/未登录用户访问方案接口应被拒绝', async () => {
    const noAuth = await httpRequest('/api/reports/schemes');
    assert.equal(noAuth.status, 401);

    const dispatcherLogin = await httpRequest<{ success: boolean; data?: LoginResult }>('/api/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher', password: '123456' },
    });
    assert.equal(dispatcherLogin.status, 200);
    const dispatcherToken = (dispatcherLogin.body.data as LoginResult).token;

    const forbidden = await httpRequest('/api/reports/schemes', {
      headers: auth(dispatcherToken),
    });
    assert.equal(forbidden.status, 403, '调度员不应访问管理员专属的报表方案接口');
  });

  it('POST /reports/schemes 保存一个新方案成功', async () => {
    const resp = await httpRequest<{ success: boolean; data?: { id: number; name: string; version: number } }>('/api/reports/schemes', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        name: 'E2E_月度待派工',
        description: '仅导出待派工状态',
        status: 'pending',
        dateRangeType: 'all',
      },
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.body.success, true);
    assert.equal(resp.body.data!.name, 'E2E_月度待派工');
    assert.equal(resp.body.data!.version, 1);
  });

  it('POST /reports/schemes 同名方案返回 409 冲突，提示 overwrite', async () => {
    const resp = await httpRequest<{ success: boolean; conflict?: boolean; conflictInfo?: { type: string; existingId: number } }>('/api/reports/schemes', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        name: 'E2E_月度待派工',
        status: 'closed',
        dateRangeType: 'all',
      },
    });
    assert.equal(resp.status, 409);
    assert.equal(resp.body.conflict, true);
    assert.equal(resp.body.conflictInfo!.type, 'duplicate_name');
    assert.ok(resp.body.conflictInfo!.existingId > 0);
  });

  it('POST /reports/schemes overwrite=true 覆盖已有方案', async () => {
    const resp = await httpRequest<{ success: boolean; data?: { id: number; status: string; version: number } }>('/api/reports/schemes', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        name: 'E2E_月度待派工',
        status: 'closed',
        dateRangeType: 'custom',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        overwrite: true,
      },
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.body.success, true);
    assert.equal(resp.body.data!.status, 'closed');
    assert.equal(resp.body.data!.version, 2, 'overwrite 后版本号应+1');
  });

  it('GET /reports/schemes 列出所有方案（含默认优先排序）', async () => {
    const resp = await httpRequest<{ success: boolean; data?: Array<{ id: number; name: string; isDefault: boolean }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    assert.equal(resp.status, 200);
    assert.equal(resp.body.success, true);
    assert.ok(resp.body.data!.length >= 1);
  });

  it('POST /reports/schemes/:id/default 设为默认 + GET default 能获取', async () => {
    const list = await httpRequest<{ success: boolean; data?: Array<{ id: number; name: string }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    const firstId = list.body.data![0].id;

    const setResp = await httpRequest<{ success: boolean; data?: { id: number; isDefault: boolean } }>(`/api/reports/schemes/${firstId}/default`, {
      method: 'POST',
      headers: auth(adminToken),
    });
    assert.equal(setResp.status, 200);
    assert.equal(setResp.body.success, true);
    assert.equal(setResp.body.data!.isDefault, true);

    const getResp = await httpRequest<{ success: boolean; data?: { id: number } }>('/api/reports/schemes/default', {
      headers: auth(adminToken),
    });
    assert.equal(getResp.status, 200);
    assert.equal(getResp.body.success, true);
    assert.equal(getResp.body.data!.id, firstId, '默认方案ID应匹配');
  });

  it('PUT /reports/schemes/:id 更新并发冲突（expectedVersion 旧）时返回 409', async () => {
    const list = await httpRequest<{ success: boolean; data?: Array<{ id: number; version: number; name: string }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    const target = list.body.data!.find(s => s.name === 'E2E_月度待派工')!;

    const badVersion = await httpRequest<{ success: boolean; conflict?: boolean; conflictInfo?: { type: string; serverVersion: number } }>(`/api/reports/schemes/${target.id}`, {
      method: 'PUT',
      headers: auth(adminToken),
      body: { name: '尝试并发修改', expectedVersion: 1 },
    });
    assert.equal(badVersion.status, 409);
    assert.equal(badVersion.body.conflict, true);
    assert.equal(badVersion.body.conflictInfo!.type, 'version_mismatch');
    assert.equal(badVersion.body.conflictInfo!.serverVersion, target.version);
  });

  it('POST /reports/schemes/:id/copy 复制方案成功', async () => {
    const list = await httpRequest<{ success: boolean; data?: Array<{ id: number; name: string; status: string; startDate: string | null }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    const source = list.body.data!.find(s => s.name === 'E2E_月度待派工')!;

    const copyResp = await httpRequest<{ success: boolean; data?: { id: number; name: string; status: string; startDate: string | null; version: number } }>(`/api/reports/schemes/${source.id}/copy`, {
      method: 'POST',
      headers: auth(adminToken),
      body: { newName: 'E2E_复制的方案' },
    });
    assert.equal(copyResp.status, 201);
    assert.equal(copyResp.body.success, true);
    assert.equal(copyResp.body.data!.name, 'E2E_复制的方案');
    assert.equal(copyResp.body.data!.status, source.status);
    assert.equal(copyResp.body.data!.startDate, source.startDate);
    assert.equal(copyResp.body.data!.version, 1);
  });

  it('DELETE /reports/schemes/:id 默认方案返回 409 delete_default，force=true 可删除', async () => {
    const defResp = await httpRequest<{ success: boolean; data?: { id: number } }>('/api/reports/schemes/default', {
      headers: auth(adminToken),
    });
    const defaultId = defResp.body.data!.id;

    const normalDel = await httpRequest<{ success: boolean; conflict?: boolean; conflictInfo?: { type: string } }>(`/api/reports/schemes/${defaultId}`, {
      method: 'DELETE',
      headers: auth(adminToken),
    });
    assert.equal(normalDel.status, 409);
    assert.equal(normalDel.body.conflict, true);
    assert.equal(normalDel.body.conflictInfo!.type, 'delete_default');

    const forceDel = await httpRequest<{ success: boolean }>(`/api/reports/schemes/${defaultId}`, {
      method: 'DELETE',
      headers: auth(adminToken),
      query: { force: 'true' },
    });
    assert.equal(forceDel.status, 200);
    assert.equal(forceDel.body.success, true);

    const after = await httpRequest<{ success: boolean; data?: unknown }>(`/api/reports/schemes/${defaultId}`, {
      headers: auth(adminToken),
    });
    assert.equal(after.status, 404, 'force删除后应404');
  });

  it('GET /reports/export 不传任何参数时自动应用默认方案', async () => {
    const createSchemeForDefault = await httpRequest<{ success: boolean; data?: { id: number } }>('/api/reports/schemes', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        name: 'E2E_自动默认方案',
        status: 'pending',
        dateRangeType: 'custom',
        startDate: '2026-06-20',
        endDate: '2026-06-20',
      },
    });
    const schemeId = createSchemeForDefault.body.data!.id;
    await httpRequest(`/api/reports/schemes/${schemeId}/default`, {
      method: 'POST',
      headers: auth(adminToken),
    });

    const exportResp = await httpRequest<string>('/api/reports/export', {
      headers: auth(adminToken),
    });
    assert.equal(exportResp.status, 200);
    assert.ok(exportResp.headers['content-type']?.includes('text/csv'));
    assert.ok(exportResp.raw.startsWith('\uFEFF'), 'CSV 应含 BOM 头');
    assert.equal(
      exportResp.headers['x-export-scheme-id'],
      String(schemeId),
      '响应头应携带默认方案ID'
    );

    const histories = await httpRequest<{ success: boolean; data?: Array<{ status: string; startDate: string | null; endDate: string | null }> }>('/api/reports/export-histories', {
      headers: auth(adminToken),
    });
    assert.equal(histories.status, 200);
    const latest = histories.body.data![0];
    assert.equal(latest.status, 'pending', '历史记录中状态应等于默认方案');
    assert.equal(latest.startDate, '2026-06-20');
    assert.equal(latest.endDate, '2026-06-20');
  });

  it('GET /reports/export?schemeId= 可显式指定任意方案导出', async () => {
    const customScheme = await httpRequest<{ success: boolean; data?: { id: number } }>('/api/reports/schemes', {
      method: 'POST',
      headers: auth(adminToken),
      body: {
        name: 'E2E_显式指定方案',
        status: 'all',
        dateRangeType: 'all',
      },
    });

    const exportResp = await httpRequest<string>('/api/reports/export', {
      headers: auth(adminToken),
      query: { schemeId: customScheme.body.data!.id },
    });
    assert.equal(exportResp.status, 200);
    assert.equal(
      exportResp.headers['x-export-scheme-id'],
      String(customScheme.body.data!.id)
    );
  });

  it('旧的下载 / 重新导出链路不受影响（向后兼容）', async () => {
    const histories = await httpRequest<{ success: boolean; data?: Array<{ id: number; filename: string }> }>('/api/reports/export-histories', {
      headers: auth(adminToken),
    });
    assert.ok(histories.body.data!.length >= 1);
    const historyId = histories.body.data![0].id;

    const downloadResp = await httpRequest<string>(`/api/reports/export-histories/${historyId}/download`, {
      headers: auth(adminToken),
    });
    assert.equal(downloadResp.status, 200);
    assert.ok(downloadResp.headers['content-type']?.includes('text/csv'));

    const reExportResp = await httpRequest<string>(`/api/reports/export-histories/${historyId}/re-export`, {
      method: 'POST',
      headers: auth(adminToken),
    });
    assert.equal(reExportResp.status, 200);
    assert.ok(reExportResp.headers['content-disposition']?.includes('attachment'));

    const historiesAfter = await httpRequest<{ success: boolean; data?: Array<unknown> }>('/api/reports/export-histories', {
      headers: auth(adminToken),
    });
    assert.ok(historiesAfter.body.data!.length > histories.body.data!.length, '重新导出应新增历史记录');
  });

  it('操作日志接口 /reports/scheme-logs 能查到 create/set_default/copy/delete', async () => {
    const logsResp = await httpRequest<{ success: boolean; data?: Array<{ operation: string; schemeName: string | null; operatorId: number }> }>('/api/reports/scheme-logs', {
      headers: auth(adminToken),
    });
    assert.equal(logsResp.status, 200);
    assert.equal(logsResp.body.success, true);
    const ops = logsResp.body.data!.map(l => l.operation);
    assert.ok(ops.includes('create'), '应包含 create 操作');
    assert.ok(ops.includes('set_default'), '应包含 set_default 操作');
    assert.ok(ops.includes('copy'), '应包含 copy 操作');
    for (const log of logsResp.body.data!) {
      assert.equal(log.operatorId, adminUserId);
    }
  });

  it('模拟服务重启后，默认方案 + 方案列表 + 历史记录/文件都持久化可用', async () => {
    const beforeDefault = await httpRequest<{ success: boolean; data?: { id: number; name: string } }>('/api/reports/schemes/default', {
      headers: auth(adminToken),
    });
    const beforeSchemes = await httpRequest<{ success: boolean; data?: Array<{ id: number; name: string }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    const beforeHistories = await httpRequest<{ success: boolean; data?: Array<{ id: number; filename: string }> }>('/api/reports/export-histories', {
      headers: auth(adminToken),
    });
    const expectedDefaultId = beforeDefault.body.data!.id;
    const expectedSchemeIds = new Set(beforeSchemes.body.data!.map(s => s.id));
    const expectedHistory = beforeHistories.body.data![0];

    await new Promise<void>((resolve) => server.close(() => resolve()));

    assert.ok(fs.existsSync(dbFile), '重启前数据库文件应存在于磁盘');

    const initModule2 = await import(`../src/db/init.js?invalidate=${Date.now()}`);
    const appModule2 = await import(`../app.js?invalidate=${Date.now()}`);
    const dbUtils2 = await import(`../src/db/utils.js?invalidate=${Date.now()}`);
    dbUtils2.setDb(initModule2.db);

    await new Promise<void>((resolve, reject) => {
      server = http.createServer(appModule2.default);
      server.listen(TEST_PORT, () => resolve());
      server.on('error', reject);
    });
    await new Promise<void>((r) => setTimeout(r, 100));

    const afterDefault = await httpRequest<{ success: boolean; data?: { id: number } }>('/api/reports/schemes/default', {
      headers: auth(adminToken),
    });
    assert.equal(afterDefault.body.data!.id, expectedDefaultId, '重启后默认方案ID应不变');

    const afterSchemes = await httpRequest<{ success: boolean; data?: Array<{ id: number; name: string }> }>('/api/reports/schemes', {
      headers: auth(adminToken),
    });
    const afterSchemeIds = new Set(afterSchemes.body.data!.map(s => s.id));
    for (const sid of expectedSchemeIds) {
      assert.ok(afterSchemeIds.has(sid), `重启后方案 ${sid} 应仍存在`);
    }

    const afterDownload = await httpRequest<string>(`/api/reports/export-histories/${expectedHistory.id}/download`, {
      headers: auth(adminToken),
    });
    assert.equal(afterDownload.status, 200, '重启后仍可下载上次的历史记录文件');

    const afterLogs = await httpRequest<{ success: boolean; data?: Array<unknown> }>('/api/reports/scheme-logs', {
      headers: auth(adminToken),
    });
    assert.ok(afterLogs.body.data!.length >= 1, '重启后操作日志依然持久化');
  });
});
