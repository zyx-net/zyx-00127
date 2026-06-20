export type UserRole = 'resident' | 'dispatcher' | 'admin';

export type TicketStatus = 'pending' | 'assigned' | 'reassigned' | 'completed' | 'closed';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: '待派工',
  assigned: '已派工',
  reassigned: '已改派',
  completed: '待复核',
  closed: '已关闭',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  pending: '#f59e0b',
  assigned: '#3b82f6',
  reassigned: '#f97316',
  completed: '#8b5cf6',
  closed: '#10b981',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  resident: '住户',
  dispatcher: '调度员',
  admin: '管理员',
};

export interface User {
  id: number;
  username: string;
  role: UserRole;
  name: string;
  phone: string;
  createdAt: string;
}

export interface RepairType {
  id: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface Technician {
  id: number;
  name: string;
  phone: string;
  skill: string;
  createdAt: string;
}

export interface Shift {
  id: number;
  technicianId: number;
  technicianName?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  address: string;
  repairTypeId: number;
  repairTypeName?: string;
  residentId: number;
  residentName?: string;
  residentPhone?: string;
  status: TicketStatus;
  currentTechnicianId: number | null;
  currentTechnicianName?: string;
  currentTechnicianPhone?: string;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentLog {
  id: number;
  ticketId: number;
  fromTechnicianId: number | null;
  fromTechnicianName?: string;
  toTechnicianId: number;
  toTechnicianName?: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  reason: string;
  operatorId: number;
  operatorName?: string;
  createdAt: string;
}

export interface StatusLog {
  id: number;
  ticketId: number;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  fromStatusLabel?: string;
  toStatusLabel?: string;
  reason: string;
  operatorId: number;
  operatorName?: string;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  address: string;
  repairTypeId: number;
}

export interface AssignTicketRequest {
  technicianId: number;
  scheduledStartTime: string;
  scheduledEndTime: string;
  reason: string;
}

export interface ExportHistory {
  id: number;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  filename: string;
  operatorId: number;
  operatorName: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
