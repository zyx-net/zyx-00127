import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

const runAsync = (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getAsync = <T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
};

const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

const createTables = async (): Promise<void> => {
  await runAsync('PRAGMA foreign_keys = ON');

  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('resident', 'dispatcher', 'admin')),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS repair_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      skill VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES technicians(id)
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS tickets (
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

  await runAsync(`
    CREATE TABLE IF NOT EXISTS assignment_logs (
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

  await runAsync(`
    CREATE TABLE IF NOT EXISTS status_logs (
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

  await runAsync('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_tickets_resident ON tickets(resident_id)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(current_technician_id)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_status_logs_ticket ON status_logs(ticket_id)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_assignment_logs_ticket ON assignment_logs(ticket_id)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_shifts_technician ON shifts(technician_id)');
};

const insertSeedData = async (): Promise<void> => {
  const pwdHash = hashPassword('123456');

  await runAsync(`INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`, ['admin', pwdHash, 'admin', '系统管理员', '13800000000']);
  await runAsync(`INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`, ['dispatcher', pwdHash, 'dispatcher', '张调度', '13800000001']);
  await runAsync(`INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`, ['zhangsan', pwdHash, 'resident', '张三', '13800000002']);
  await runAsync(`INSERT INTO users (username, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`, ['lisi', pwdHash, 'resident', '李四', '13800000003']);

  await runAsync(`INSERT INTO repair_types (name, description) VALUES (?, ?)`, ['漏水维修', '水管、水龙头、热水器等漏水问题']);
  await runAsync(`INSERT INTO repair_types (name, description) VALUES (?, ?)`, ['电路维修', '开关、插座、灯具等电路问题']);
  await runAsync(`INSERT INTO repair_types (name, description) VALUES (?, ?)`, ['管道疏通', '马桶、下水道堵塞问题']);
  await runAsync(`INSERT INTO repair_types (name, description) VALUES (?, ?)`, ['门窗维修', '门窗、锁具损坏问题']);
  await runAsync(`INSERT INTO repair_types (name, description) VALUES (?, ?)`, ['家电维修', '空调、冰箱等家电故障']);

  await runAsync(`INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)`, ['王师傅', '13900000001', '水电维修']);
  await runAsync(`INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)`, ['李师傅', '13900000002', '管道疏通']);
  await runAsync(`INSERT INTO technicians (name, phone, skill) VALUES (?, ?, ?)`, ['张师傅', '13900000003', '综合维修']);

  for (let techId = 1; techId <= 3; techId++) {
    for (let day = 1; day <= 5; day++) {
      await runAsync(`INSERT INTO shifts (technician_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)`, [techId, day, '09:00', '18:00']);
    }
  }

  await runAsync(`INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status) VALUES (?, ?, ?, ?, ?, ?)`, ['卫生间水龙头漏水', '主卫生间洗手盆水龙头滴水，已持续3天', '1栋1单元101室', 1, 3, 'pending']);
  await runAsync(`INSERT INTO tickets (title, description, address, repair_type_id, resident_id, status) VALUES (?, ?, ?, ?, ?, ?)`, ['客厅灯不亮', '客厅吸顶灯开关后不亮，可能是镇流器坏了', '2栋3单元502室', 2, 4, 'pending']);

  console.log('数据库初始化完成，已插入种子数据');
};

const initDb = async (): Promise<void> => {
  try {
    await createTables();

    const result = await getAsync<{ count: number }>('SELECT COUNT(*) as count FROM users');
    if (!result || result.count === 0) {
      await insertSeedData();
    } else {
      console.log('数据库已存在，跳过初始化');
    }
  } catch (err) {
    console.error('数据库初始化失败:', err);
    throw err;
  }
};

export { db, initDb, DB_PATH };
