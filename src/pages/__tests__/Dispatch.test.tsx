import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Dispatch } from '../Dispatch'
import { TicketDetail } from '../TicketDetail'
import * as apiModule from '../../api'
import type { StatusLog, AssignmentLog, Technician } from '../../../shared/types'

vi.mock('../../api')

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 2, username: 'dispatcher', role: 'dispatcher', name: '张调度' },
  }),
}))

const mockTickets = [
  {
    id: 1,
    title: '卫生间水龙头漏水',
    description: '主卫生间漏水',
    address: '1栋1单元101室',
    repairTypeId: 1,
    repairTypeName: '漏水维修',
    residentId: 3,
    residentName: '张三',
    status: 'pending' as const,
    currentTechnicianId: null,
    currentTechnicianName: null,
    scheduledStartTime: null,
    scheduledEndTime: null,
    createdAt: '2026-06-20 10:00:00',
    updatedAt: '2026-06-20 10:00:00',
  },
  {
    id: 2,
    title: '客厅灯不亮',
    description: '客厅吸顶灯坏了',
    address: '2栋3单元502室',
    repairTypeId: 2,
    repairTypeName: '电路维修',
    residentId: 4,
    residentName: '李四',
    status: 'assigned' as const,
    currentTechnicianId: 1,
    currentTechnicianName: '王师傅',
    scheduledStartTime: '2026-06-21 09:00:00',
    scheduledEndTime: '2026-06-21 10:00:00',
    createdAt: '2026-06-20 11:00:00',
    updatedAt: '2026-06-21 08:00:00',
  },
]

const mockTechnicians: Technician[] = [
  { id: 1, name: '王师傅', phone: '13900000001', skill: '水电维修', createdAt: '2026-01-01 00:00:00' },
  { id: 2, name: '李师傅', phone: '13900000002', skill: '管道疏通', createdAt: '2026-01-01 00:00:00' },
]

const mockDetailTicket = {
  id: 1,
  title: '卫生间水龙头漏水',
  description: '主卫生间洗手盆水龙头滴水',
  address: '1栋1单元101室',
  repairTypeId: 1,
  repairTypeName: '漏水维修',
  residentId: 3,
  residentName: '张三',
  residentPhone: '13800000002',
  status: 'pending' as const,
  currentTechnicianId: null,
  currentTechnicianName: null,
  scheduledStartTime: null,
  scheduledEndTime: null,
  createdAt: '2026-06-20 10:00:00',
  updatedAt: '2026-06-20 10:00:00',
}

const mockStatusLogs = [
  { id: 1, ticketId: 1, fromStatus: '', toStatus: 'pending', reason: '住户提交报修', operatorId: 3, operatorName: '张三', createdAt: '2026-06-20 10:00:00' },
] as unknown as StatusLog[]

const mockAssignmentLogs: AssignmentLog[] = []

const renderWithRouter = (initialPath = '/dispatch') => {
  const router = createMemoryRouter(
    [
      { path: '/dispatch', element: <Dispatch /> },
      { path: '/tickets/:id', element: <TicketDetail /> },
    ],
    { initialEntries: [initialPath] }
  )
  return render(<RouterProvider router={router} />)
}

const withinCard = (title: string) => {
  const titleEl = screen.getByText(title)
  const card = titleEl.closest('.ant-card') as HTMLElement
  return within(card)
}

describe('Dispatch -> TicketDetail 链路', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiModule.ticketApi.getList).mockResolvedValue(mockTickets)
    vi.mocked(apiModule.publicApi.getTechnicians).mockResolvedValue(mockTechnicians)
    vi.mocked(apiModule.ticketApi.getDetail).mockResolvedValue({
      ticket: mockDetailTicket,
      statusLogs: mockStatusLogs,
      assignmentLogs: mockAssignmentLogs,
    })
  })

  it('渲染调度台工单列表', async () => {
    renderWithRouter('/dispatch')

    expect(await screen.findByText('卫生间水龙头漏水')).toBeInTheDocument()
    expect(screen.getByText('客厅灯不亮')).toBeInTheDocument()
    expect(screen.getByText('1栋1单元101室')).toBeInTheDocument()
    expect(screen.getByText('待派工')).toBeInTheDocument()
    expect(screen.getByText('已派工')).toBeInTheDocument()
  })

  it('每条工单都有"详情"按钮', async () => {
    renderWithRouter('/dispatch')

    await screen.findByText('卫生间水龙头漏水')
    expect(screen.getAllByText('详情').length).toBe(2)
  })

  it('点击"详情"按钮跳转到工单详情页', async () => {
    renderWithRouter('/dispatch')

    await screen.findByText('卫生间水龙头漏水')

    const detailButtons = screen.getAllByText('详情')
    fireEvent.click(detailButtons[0])

    expect(await screen.findByText('工单详情 #')).toBeInTheDocument()
    expect(apiModule.ticketApi.getDetail).toHaveBeenCalledWith(1)
  })

  it('第二条工单点击详情跳转到对应 ID 的详情页', async () => {
    renderWithRouter('/dispatch')

    await screen.findByText('卫生间水龙头漏水')

    const detailButtons = screen.getAllByText('详情')
    fireEvent.click(detailButtons[1])

    expect(await screen.findByText('工单详情 #')).toBeInTheDocument()
    expect(apiModule.ticketApi.getDetail).toHaveBeenCalledWith(2)
  })

  it('详情页显示基本信息、状态记录和派工历史', async () => {
    renderWithRouter('/tickets/1')

    expect(await screen.findByText('工单详情 #')).toBeInTheDocument()
    expect(screen.getByText('卫生间水龙头漏水')).toBeInTheDocument()
    expect(screen.getByText('1栋1单元101室')).toBeInTheDocument()
    expect(screen.getByText('漏水维修')).toBeInTheDocument()
    expect(screen.getByText('状态变更记录')).toBeInTheDocument()
  })

  it('详情页状态时间线显示操作人和原因', async () => {
    renderWithRouter('/tickets/1')

    await screen.findByText('状态变更记录')

    const timeline = withinCard('状态变更记录')
    expect(timeline.getByText('待派工')).toBeInTheDocument()
    expect(timeline.getByText('张三')).toBeInTheDocument()
    expect(timeline.getByText('住户提交报修')).toBeInTheDocument()
  })

  it('调用 API 获取工单列表和技工列表', async () => {
    renderWithRouter('/dispatch')

    await screen.findByText('卫生间水龙头漏水')

    expect(apiModule.ticketApi.getList).toHaveBeenCalled()
    expect(apiModule.publicApi.getTechnicians).toHaveBeenCalled()
  })
})
