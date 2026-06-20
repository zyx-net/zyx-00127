import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { setDb } from '../src/db/utils';

export const setupTestDb = (): sqlite3.Database => {
  const db = new sqlite3.Database(':memory:');
  setDb(db as unknown as Parameters<typeof setDb>[0]);
  return db;
};

export const runSql = (db: sqlite3.Database, sql: string, params: unknown[] = [] ): Promise<{ lastID: number; changes: number }> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

export const getSql = <T = unknown>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
};

export const allSql = <T = unknown>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
};

export const closeDb = (db: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.close(err => {
      if (err) reject(err);
      else resolve();
    });
  });
};

export const createTables = async (db: sqlite3.Database): Promise<void> => {
  const r = (sql: string) => runSql(db, sql);

  await r('PRAGMA foreign_keys = ON');

  await r(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('resident', 'dispatcher', 'admin')),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await r(`
    CREATE TABLE repair_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await r(`
    CREATE TABLE technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      skill VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await r(`
    CREATE TABLE shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES technicians(id)
    )
  `);

  await r(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      address VARCHAR(500) NOT NULL,
      repair_type_id INTEGER NOT NULL,
      resident_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'reassigned', 'completed', 'closed')),
      current_technician_id INTEGER,
      scheduled_start_time DATETIME,
      scheduled_end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_type_id) REFERENCES repair_types(id),
      FOREIGN KEY (resident_id) REFERENCES users(id),
      FOREIGN KEY (current_technician_id) REFERENCES technicians(id)
    )
  `);

  await r(`
    CREATE TABLE assignment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      from_technician_id INTEGER,
      to_technician_id INTEGER NOT NULL,
      scheduled_start_time DATETIME NOT NULL,
      scheduled_end_time DATETIME NOT NULL,
      reason TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (from_technician_id) REFERENCES technicians(id),
      FOREIGN KEY (to_technician_id) REFERENCES technicians(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  await r(`
    CREATE TABLE status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      from_status VARCHAR(20) NOT NULL,
      to_status VARCHAR(20) NOT NULL,
      reason TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  await r(`
    CREATE TABLE export_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status VARCHAR(20),
      start_date VARCHAR(20),
      end_date VARCHAR(20),
      filename VARCHAR(255) NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name VARCHAR(100) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);
};

export const seedTestData = async (db: sqlite3.Database): Promise<{
  adminId: number;
  dispatcherId: number;
  zhangsanId: number;
  lisiId: number;
  techWangId: number;
  techLiId: number;
  techZhangId: number;
  leakTypeId: number;
  electricTypeId: number;
}> => {
  const pwdHash = bcrypt.hashSync('123456', 10);

  const admin = await runSql(db, 'INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)',
    ['admin', pwdHash, 'admin', '系统管理员', '13800000000']);
  const dispatcher = await runSql(db, 'INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)',
    ['dispatcher', pwdHash, 'dispatcher', '张调度', '13800000001']);
  const zhangsan = await runSql(db, 'INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)',
    ['zhangsan', pwdHash, 'resident', '张三', '13800000002']);
  const lisi = await runSql(db, 'INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)',
    ['lisi', pwdHash, 'resident', '李四', '13800000003']);

  const leakType = await runSql(db, 'INSERT INTO repair_types (name, description) VALUES (?, ?)',
    ['漏水维修', '水管、水龙头等漏水问题']);
  await runSql(db, 'INSERT INTO repair_types (name, description) VALUES (?, ?)',
    ['电路维修', '开关、插座等电路问题']);
  const electricType = { lastID: 2 };

  const techWang = await runSql(db, 'INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)',
    ['王师傅', '13900000001', '水电维修']);
  const techLi = await runSql(db, 'INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)',
    ['李师傅', '13900000002', '管道疏通']);
  const techZhang = await runSql(db, 'INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)',
    ['张师傅', '13900000003', '综合维修']);

  return {
    adminId: admin.lastID,
    dispatcherId: dispatcher.lastID,
    zhangsanId: zhangsan.lastID,
    lisiId: lisi.lastID,
    techWangId: techWang.lastID,
    techLiId: techLi.lastID,
    techZhangId: techZhang.lastID,
    leakTypeId: leakType.lastID,
    electricTypeId: electricType.lastID,
  };
};

export const getUserFixture = (id: number, role: 'resident' | 'dispatcher' | 'admin', name: string) => ({
  id,
  username: role === 'resident' ? (name === '张三' ? 'zhangsan' : 'lisi') : role,
  role,
  name,
  phone: '13800000000',
  createdAt: '2026-01-01 00:00:00',
});

// silence console.log during tests
export const silenceConsole = (): (() => void) => {
  const origLog = console.log;
  const origError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = origLog;
    console.error = origError;
  };
};
