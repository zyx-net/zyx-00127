import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TicketDetail } from '../TicketDetail'
import * as apiModule from '../../api'
import type { StatusLog } from '../../../shared/types'

vi.mock('../../api')

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 2, username: 'dispatcher', role: 'dispatcher', name: '张调度' },
  }),
}))

const mockTicket = {
  id: 5,
  title: '厨房水管漏水',
  description: '洗菜池下水管漏水严重',
  address: '1栋2单元301室',
  repairTypeId: 1,
  repairTypeName: '漏水维修',
  residentId: 3,
  residentName: '张三',
  residentPhone: '13800000002',
  status: 'closed' as const,
  currentTechnicianId: 2,
  currentTechnicianName: '李师傅',
  currentTechnicianPhone: '13900000002',
  scheduledStartTime: '2026-06-22 14:00:00',
  scheduledEndTime: '2026-06-22 15:00:00',
  createdAt: '2026-06-21 10:00:00',
  updatedAt: '2026-06-22 16:00:00',
}

const mockStatusLogs = [
  { id: 1, ticketId: 5, fromStatus: '', toStatus: 'pending', reason: '住户提交报修', operatorId: 3, operatorName: '张三', createdAt: '2026-06-21 10:00:00' },
  { id: 2, ticketId: 5, fromStatus: 'pending', toStatus: 'assigned', reason: '首次派工', operatorId: 2, operatorName: '张调度', createdAt: '2026-06-21 11:00:00' },
  { id: 3, ticketId: 5, fromStatus: 'assigned', toStatus: 'reassigned', reason: '改派李师傅', operatorId: 2, operatorName: '张调度', createdAt: '2026-06-21 12:00:00' },
  { id: 4, ticketId: 5, fromStatus: 'reassigned', toStatus: 'completed', reason: '维修完成', operatorId: 2, operatorName: '张调度', createdAt: '2026-06-22 15:00:00' },
  { id: 5, ticketId: 5, fromStatus: 'completed', toStatus: 'closed', reason: '复核通过', operatorId: 1, operatorName: '系统管理员', createdAt: '2026-06-22 16:00:00' },
] as unknown as StatusLog[]

const mockAssignmentLogs = [
  { id: 1, ticketId: 5, fromTechnicianId: null, fromTechnicianName: null, toTechnicianId: 1, toTechnicianName: '王师傅', scheduledStartTime: '2026-06-22 09:00:00', scheduledEndTime: '2026-06-22 10:00:00', reason: '首次派工', operatorId: 2, operatorName: '张调度', createdAt: '2026-06-21 11:00:00' },
  { id: 2, ticketId: 5, fromTechnicianId: 1, fromTechnicianName: '王师傅', toTechnicianId: 2, toTechnicianName: '李师傅', scheduledStartTime: '2026-06-22 14:00:00', scheduledEndTime: '2026-06-22 15:00:00', reason: '改派李师傅', operatorId: 2, operatorName: '张调度', createdAt: '2026-06-21 12:00:00' },
]

const renderDetailPage = (ticketId = '5') => {
  const router = createMemoryRouter(
    [{ path: '/tickets/:id', element: <TicketDetail /> }],
    { initialEntries: [`/tickets/${ticketId}`] }
  )
  return render(<RouterProvider router={router} />)
}

const withinCard = (title: string) => {
  const titleEl = screen.getByText(title)
  const card = titleEl.closest('.ant-card') as HTMLElement
  return within(card)
}

describe('TicketDetail 详情页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiModule.ticketApi.getDetail).mockResolvedValue({
      ticket: mockTicket,
      statusLogs: mockStatusLogs,
      assignmentLogs: mockAssignmentLogs,
    })
  })

  it('渲染工单基本信息', async () => {
    renderDetailPage('5')

    expect(await screen.findByText('工单详情 #')).toBeInTheDocument()

    const infoCard = withinCard('厨房水管漏水')
    expect(infoCard.getByText(/张三/)).toBeInTheDocument()
    expect(infoCard.getByText('1栋2单元301室')).toBeInTheDocument()
    expect(infoCard.getByText('漏水维修')).toBeInTheDocument()
    expect(infoCard.getByText('已关闭')).toBeInTheDocument()
  })

  it('渲染完整状态时间线，包含所有 5 个状态节点', async () => {
    renderDetailPage('5')

    await screen.findByText('状态变更记录')

    const timeline = withinCard('状态变更记录')
    expect(timeline.getByText('待派工')).toBeInTheDocument()
    expect(timeline.getByText('已派工')).toBeInTheDocument()
    expect(timeline.getByText('已改派')).toBeInTheDocument()
    expect(timeline.getByText('待复核')).toBeInTheDocument()
    expect(timeline.getByText('已关闭')).toBeInTheDocument()
  })

  it('状态日志显示每个节点的操作人和原因', async () => {
    renderDetailPage('5')

    await screen.findByText('状态变更记录')

    const timeline = withinCard('状态变更记录')
    expect(timeline.getByText('张三')).toBeInTheDocument()
    expect(timeline.getByText('住户提交报修')).toBeInTheDocument()

    const zhangs = timeline.getAllByText('张调度')
    expect(zhangs.length).toBeGreaterThanOrEqual(3)

    expect(timeline.getByText('系统管理员')).toBeInTheDocument()
    expect(timeline.getByText('复核通过')).toBeInTheDocument()
    expect(timeline.getByText('改派李师傅')).toBeInTheDocument()
  })

  it('渲染派工历史，包含两次派工记录和技工变更', async () => {
    renderDetailPage('5')

    await screen.findByText('派工历史')

    const history = withinCard('派工历史')
    expect(history.getAllByText(/王师傅/).length).toBeGreaterThanOrEqual(1)
    expect(history.getAllByText(/李师傅/).length).toBeGreaterThanOrEqual(1)

    expect(history.getByText('首次派工')).toBeInTheDocument()
    expect(history.getByText('改派李师傅')).toBeInTheDocument()
  })

  it('派工历史显示操作人姓名', async () => {
    renderDetailPage('5')

    await screen.findByText('派工历史')

    const history = withinCard('派工历史')
    expect(history.getAllByText(/张调度/).length).toBeGreaterThanOrEqual(1)
  })

  it('状态标签显示正确的工单状态', async () => {
    renderDetailPage('5')

    await screen.findByText('工单详情 #')

    const statusTags = screen.getAllByText('已关闭')
    expect(statusTags.length).toBeGreaterThanOrEqual(1)
  })

  it('调用 API 时使用 URL 中的工单 ID', async () => {
    renderDetailPage('5')

    await screen.findByText('工单详情 #')

    expect(apiModule.ticketApi.getDetail).toHaveBeenCalledWith(5)
  })

  it('不同的工单 ID 调用不同的 API', async () => {
    renderDetailPage('99')

    await screen.findByText(/工单详情 #/)

    expect(apiModule.ticketApi.getDetail).toHaveBeenCalledWith(99)
  })
})
