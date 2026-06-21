import { request, downloadFile } from '../utils/request';
import {
  LoginRequest, LoginResponse, Ticket, CreateTicketRequest,
  AssignTicketRequest, RepairType, Technician, Shift,
  StatusLog, AssignmentLog, ExportHistory, ExportScheme,
  SchemeOperationLog, CreateSchemeRequest, UpdateSchemeRequest
} from '../../shared/types';

export const authApi = {
  login: (data: LoginRequest) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    }),
};

export const ticketApi = {
  getList: (status?: string) => {
    const url = status ? `/tickets?status=${encodeURIComponent(status)}` : '/tickets';
    return request<Ticket[]>(url);
  },
  getDetail: (id: number) =>
    request<{ ticket: Ticket; statusLogs: StatusLog[]; assignmentLogs: AssignmentLog[] }>(`/tickets/${id}`),
  create: (data: CreateTicketRequest) =>
    request<{ id: number }>('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  assign: (id: number, data: AssignTicketRequest) =>
    request<void>(`/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reassign: (id: number, data: AssignTicketRequest) =>
    request<void>(`/tickets/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  complete: (id: number, reason?: string) =>
    request<void>(`/tickets/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  close: (id: number, reason?: string) =>
    request<void>(`/tickets/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

export const publicApi = {
  getRepairTypes: () => request<RepairType[]>('/public/repair-types', { skipAuth: true }),
  getTechnicians: () => request<Technician[]>('/public/technicians', { skipAuth: true }),
};

export const configApi = {
  getRepairTypes: () => request<RepairType[]>('/config/repair-types'),
  createRepairType: (name: string, description: string) =>
    request<{ id: number }>('/config/repair-types', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  updateRepairType: (id: number, name: string, description: string) =>
    request<void>(`/config/repair-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    }),
  deleteRepairType: (id: number) =>
    request<void>(`/config/repair-types/${id}`, {
      method: 'DELETE',
    }),
  getTechnicians: () => request<Technician[]>('/config/technicians'),
  checkTechnicianConflict: (techId: number, startTime: string, endTime: string, excludeTicketId?: number) => {
    let url = `/config/technicians/${techId}/conflict?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
    if (excludeTicketId) {
      url += `&excludeTicketId=${excludeTicketId}`;
    }
    return request<{ hasConflict: boolean }>(url);
  },
  createTechnician: (name: string, phone: string, skill: string) =>
    request<{ id: number }>('/config/technicians', {
      method: 'POST',
      body: JSON.stringify({ name, phone, skill }),
    }),
  updateTechnician: (id: number, name: string, phone: string, skill: string) =>
    request<void>(`/config/technicians/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, phone, skill }),
    }),
  deleteTechnician: (id: number) =>
    request<void>(`/config/technicians/${id}`, {
      method: 'DELETE',
    }),
  getShifts: () => request<Shift[]>('/config/shifts'),
  createShift: (technicianId: number, dayOfWeek: number, startTime: string, endTime: string) =>
    request<{ id: number }>('/config/shifts', {
      method: 'POST',
      body: JSON.stringify({ technicianId, dayOfWeek, startTime, endTime }),
    }),
  updateShift: (id: number, dayOfWeek: number, startTime: string, endTime: string) =>
    request<void>(`/config/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ dayOfWeek, startTime, endTime }),
    }),
  deleteShift: (id: number) =>
    request<void>(`/config/shifts/${id}`, {
      method: 'DELETE',
    }),
};

export const reportApi = {
  export: (status?: string, startDate?: string, endDate?: string, dateRangeType?: string, schemeId?: number) => {
    const params: Record<string, string | undefined> = { status, startDate, endDate, dateRangeType };
    if (schemeId !== undefined) {
      params.schemeId = String(schemeId);
    }
    return downloadFile('/reports/export', params);
  },
  getExportHistories: () =>
    request<ExportHistory[]>('/reports/export-histories'),
  reExport: (id: number) =>
    downloadFile(`/reports/export-histories/${id}/re-export`, {}, 'POST'),
  downloadExport: (id: number) =>
    downloadFile(`/reports/export-histories/${id}/download`, {}),
  getSchemes: () =>
    request<ExportScheme[]>('/reports/schemes'),
  getDefaultScheme: () =>
    request<ExportScheme | null>('/reports/schemes/default'),
  getScheme: (id: number) =>
    request<ExportScheme>(`/reports/schemes/${id}`),
  createScheme: (data: CreateSchemeRequest) =>
    request<ExportScheme>('/reports/schemes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateScheme: (id: number, data: UpdateSchemeRequest) =>
    request<ExportScheme>(`/reports/schemes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  setDefaultScheme: (id: number) =>
    request<ExportScheme>(`/reports/schemes/${id}/default`, {
      method: 'POST',
    }),
  copyScheme: (id: number, newName: string) =>
    request<ExportScheme>(`/reports/schemes/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    }),
  deleteScheme: (id: number, force?: boolean) =>
    request<void>(`/reports/schemes/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    }),
  getSchemeLogs: (id?: number) => {
    const url = id !== undefined ? `/reports/schemes/${id}/logs` : '/reports/scheme-logs';
    return request<SchemeOperationLog[]>(url);
  },
};
