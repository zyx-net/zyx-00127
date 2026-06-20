import bcrypt from 'bcryptjs';
import { get } from '../db/utils';
import { generateToken } from '../middleware/auth';
import { LoginResponse, User } from '../../../shared/types';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  name: string;
  phone: string;
  created_at: string;
}

export const login = async (username: string, password: string): Promise<LoginResponse | null> => {
  const userRow = await get<UserRow>(
    'SELECT * FROM users WHERE username = ?',
    [username]
  );

  if (!userRow) return null;

  const isValid = bcrypt.compareSync(password, userRow.password_hash);
  if (!isValid) return null;

  const user: User = {
    id: userRow.id,
    username: userRow.username,
    role: userRow.role as User['role'],
    name: userRow.name,
    phone: userRow.phone,
    createdAt: userRow.created_at,
  };

  const token = generateToken(user);

  return { token, user };
};
