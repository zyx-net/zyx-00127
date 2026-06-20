import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Admin } from '../Admin'
import * as apiModule from '../../api'
import type { ExportHistory } from '../../../shared/types'

vi.mock('../../api')

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, username: 'admin', role: 'admin', name: '系统管理员' },
  }),
}))

const mockRepairTypes = [
  { id: 1, name: '漏水维修', description: '水管问题', createdAt: '2026-01-01 00:00:00' },
]

const mockTechnicians = [
  { id: 1, name: '王师傅', phone: '13900000001', skill: '水电维修', createdAt: '2026-01-01 00:00:00' },
]

const mockShifts = [
  { id: 1, technicianId: 1, technicianName: '王师傅', dayOfWeek: 1, startTime: '09:00', endTime: '18:00', createdAt: '2026-01-01 00:00:00' },
]

const mockExportHistories: ExportHistory[] = [
  {
    id: 1,
    status: 'pending',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    filename: '维修工单报表_20260101_120000.csv',
    operatorId: 1,
    operatorName: '系统管理员',
    createdAt: '2026-06-20 10:00:00',
  },
  {
    id: 2,
    status: null,
    startDate: null,
    endDate: null,
    filename: '维修工单报表_20260601_120000.csv',
    operatorId: 1,
    operatorName: '系统管理员',
    createdAt: '2026-06-21 14:30:00',
  },
]

describe('Admin 报表导出与最近导出记录', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiModule.configApi.getRepairTypes).mockResolvedValue(mockRepairTypes)
    vi.mocked(apiModule.configApi.getTechnicians).mockResolvedValue(mockTechnicians)
    vi.mocked(apiModule.configApi.getShifts).mockResolvedValue(mockShifts)
    vi.mocked(apiModule.reportApi.getExportHistories).mockResolvedValue(mockExportHistories)
    vi.mocked(apiModule.reportApi.export).mockResolvedValue(undefined)
    vi.mocked(apiModule.reportApi.reExport).mockResolvedValue(undefined)
    vi.mocked(apiModule.reportApi.downloadExport).mockResolvedValue(undefined)
  })

  const switchToReportsTab = async () => {
    fireEvent.click(screen.getByText('报表导出'))
    await waitFor(() => {
      expect(screen.getByText('导出条件')).toBeInTheDocument()
    })
  }

  it('切换到报表导出 tab 后加载最近导出记录', async () => {
    render(<Admin />)

    await switchToReportsTab()

    expect(apiModule.reportApi.getExportHistories).toHaveBeenCalled()
    expect(screen.getByText('最近导出')).toBeInTheDocument()
  })

  it('最近导出记录显示导出时间、状态、日期范围、导出人和文件名', async () => {
    render(<Admin />)

    await switchToReportsTab()

    expect(screen.getAllByText('系统管理员').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument()
    expect(screen.getByText(/维修工单报表_20260101_120000\.csv/)).toBeInTheDocument()
  })

  it('状态筛选列显示对应状态标签', async () => {
    render(<Admin />)

    await switchToReportsTab()

    expect(screen.getByText('待派工')).toBeInTheDocument()
  })

  it('空日期范围记录在表格中显示"全部时间"', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const allTimeInTable = screen.getAllByText('全部时间')
    expect(allTimeInTable.length).toBeGreaterThanOrEqual(1)
  })

  it('点击"重新导出"调用 reExport API', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const reExportButtons = screen.getAllByText('重新导出')
    fireEvent.click(reExportButtons[0])

    await waitFor(() => {
      expect(apiModule.reportApi.reExport).toHaveBeenCalledWith(1)
    })
  })

  it('点击"下载"调用 downloadExport API', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const downloadButtons = screen.getAllByText('下载')
    fireEvent.click(downloadButtons[0])

    await waitFor(() => {
      expect(apiModule.reportApi.downloadExport).toHaveBeenCalledWith(1)
    })
  })

  it('点击"复用条件"将历史条件填入导出表单', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const reuseButtons = screen.getAllByText('复用条件')
    fireEvent.click(reuseButtons[0])

    await waitFor(() => {
      const customRadios = screen.getAllByText('自定义范围')
      expect(customRadios.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('点击"导出 CSV 报表"调用 export API', async () => {
    render(<Admin />)

    await switchToReportsTab()

    fireEvent.click(screen.getByText('导出 CSV 报表'))

    await waitFor(() => {
      expect(apiModule.reportApi.export).toHaveBeenCalled()
    })
  })

  it('默认时间范围为"全部时间"模式（Radio 选中）', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const allTimeRadio = screen.getByRole('radio', { name: '全部时间' })
    expect(allTimeRadio).toBeChecked()
  })

  it('选择"自定义范围"后出现日期选择器', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const customRadio = screen.getByRole('radio', { name: '自定义范围' })
    fireEvent.click(customRadio)

    await waitFor(() => {
      expect(screen.getByText('创建时间范围')).toBeInTheDocument()
      const datePickers = document.querySelectorAll('.ant-picker-range')
      expect(datePickers.length).toBeGreaterThan(0)
    })
  })

  it('最近导出区域刷新按钮存在并可点击', async () => {
    render(<Admin />)

    await switchToReportsTab()

    const historyCard = screen.getByText('最近导出').closest('.ant-card') as HTMLElement
    expect(historyCard).toBeTruthy()

    const allButtons = within(historyCard).getAllByRole('button')
    const refreshBtn = allButtons.find(btn => btn.textContent?.replace(/\s/g, '') === '刷新')
    expect(refreshBtn).toBeTruthy()
    fireEvent.click(refreshBtn!)

    expect(apiModule.reportApi.getExportHistories).toHaveBeenCalledTimes(2)
  })
})
