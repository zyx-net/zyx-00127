import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Table,
  Space,
  Tabs,
  Typography,
  Modal,
  Popconfirm,
  DatePicker,
  Radio,
  Tag,
  message,
  Tooltip,
  Divider,
  List,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ToolOutlined,
  UserOutlined,
  CalendarOutlined,
  FileTextOutlined,
  RedoOutlined,
  HistoryOutlined,
  SaveOutlined,
  CopyOutlined,
  StarOutlined,
  StarFilled,
  AppstoreOutlined,
  ExclamationCircleOutlined,
  AuditOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { configApi, reportApi } from '../api';
import {
  RepairType,
  Technician,
  Shift,
  ExportHistory,
  ExportScheme,
  TICKET_STATUS_LABELS,
  SchemeOperationLog,
} from '../../shared/types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const OPERATION_LABELS: Record<string, string> = {
  create: '创建',
  update: '更新',
  overwrite: '覆盖更新',
  copy: '复制',
  delete: '删除',
  set_default: '设为默认',
};

export const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState('repair-types');
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);

  const [repairTypeModalOpen, setRepairTypeModalOpen] = useState(false);
  const [technicianModalOpen, setTechnicianModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingRepairType, setEditingRepairType] = useState<RepairType | null>(null);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const [repairTypeForm] = Form.useForm<{ name: string; description: string }>();
  const [technicianForm] = Form.useForm<{ name: string; phone: string; skill: string }>();
  const [shiftForm] = Form.useForm<{
    technicianId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>();

  const [exportStatus, setExportStatus] = useState<string>('all');
  const [exportDateRangeType, setExportDateRangeType] = useState<string>('all');
  const [exportDateRange, setExportDateRange] = useState<
    [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  >(null);
  const [exportHistories, setExportHistories] = useState<ExportHistory[]>([]);
  const [exportHistoriesLoading, setExportHistoriesLoading] = useState(false);

  const [schemes, setSchemes] = useState<ExportScheme[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [saveSchemeModalOpen, setSaveSchemeModalOpen] = useState(false);
  const [editSchemeModalOpen, setEditSchemeModalOpen] = useState(false);
  const [copySchemeModalOpen, setCopySchemeModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<ExportScheme | null>(null);
  const [copySourceScheme, setCopySourceScheme] = useState<ExportScheme | null>(null);
  const [schemeLogs, setSchemeLogs] = useState<SchemeOperationLog[]>([]);
  const [schemeLogsModalOpen, setSchemeLogsModalOpen] = useState(false);
  const [viewSchemeId, setViewSchemeId] = useState<number | null>(null);

  const [saveSchemeForm] = Form.useForm<{ name: string; description?: string; overwrite?: boolean }>();
  const [editSchemeForm] = Form.useForm<{
    name: string;
    description?: string;
    status?: string;
    dateRangeType?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const [copySchemeForm] = Form.useForm<{ newName: string }>();

  const loadData = async () => {
    setLoading(true);
    try {
      const [types, techs, shiftList] = await Promise.all([
        configApi.getRepairTypes(),
        configApi.getTechnicians(),
        configApi.getShifts(),
      ]);
      setRepairTypes(types);
      setTechnicians(techs);
      setShifts(shiftList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadExportHistories();
      loadSchemes();
      autoApplyDefaultScheme();
    }
  }, [activeTab]);

  const autoApplyDefaultScheme = async () => {
    try {
      const defaultScheme = await reportApi.getDefaultScheme();
      if (defaultScheme) {
        applySchemeConditions(defaultScheme);
      }
    } catch {
      // ignore
    }
  };

  const applySchemeConditions = (scheme: ExportScheme) => {
    setExportStatus(scheme.status || 'all');
    if (scheme.dateRangeType === 'custom' && scheme.startDate && scheme.endDate) {
      setExportDateRangeType('custom');
      setExportDateRange([dayjs(scheme.startDate), dayjs(scheme.endDate)]);
    } else {
      setExportDateRangeType('all');
      setExportDateRange(null);
    }
    message.success(`已应用方案：${scheme.name}`);
  };

  const openRepairTypeModal = (item?: RepairType) => {
    setEditingRepairType(item || null);
    repairTypeForm.resetFields();
    if (item) {
      repairTypeForm.setFieldsValue({
        name: item.name,
        description: item.description,
      });
    }
    setRepairTypeModalOpen(true);
  };

  const openTechnicianModal = (item?: Technician) => {
    setEditingTechnician(item || null);
    technicianForm.resetFields();
    if (item) {
      technicianForm.setFieldsValue({
        name: item.name,
        phone: item.phone,
        skill: item.skill,
      });
    }
    setTechnicianModalOpen(true);
  };

  const openShiftModal = (item?: Shift) => {
    setEditingShift(item || null);
    shiftForm.resetFields();
    if (item) {
      shiftForm.setFieldsValue({
        technicianId: item.technicianId,
        dayOfWeek: item.dayOfWeek,
        startTime: item.startTime,
        endTime: item.endTime,
      });
    }
    setShiftModalOpen(true);
  };

  const handleSaveRepairType = async (values: { name: string; description: string }) => {
    try {
      if (editingRepairType) {
        await configApi.updateRepairType(editingRepairType.id, values.name, values.description);
      } else {
        await configApi.createRepairType(values.name, values.description);
      }
      setRepairTypeModalOpen(false);
      setEditingRepairType(null);
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleSaveTechnician = async (values: { name: string; phone: string; skill: string }) => {
    try {
      if (editingTechnician) {
        await configApi.updateTechnician(
          editingTechnician.id,
          values.name,
          values.phone,
          values.skill
        );
      } else {
        await configApi.createTechnician(values.name, values.phone, values.skill);
      }
      setTechnicianModalOpen(false);
      setEditingTechnician(null);
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleSaveShift = async (values: {
    technicianId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }) => {
    try {
      if (editingShift) {
        await configApi.updateShift(
          editingShift.id,
          values.dayOfWeek,
          values.startTime,
          values.endTime
        );
      } else {
        await configApi.createShift(
          values.technicianId,
          values.dayOfWeek,
          values.startTime,
          values.endTime
        );
      }
      setShiftModalOpen(false);
      setEditingShift(null);
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleDeleteRepairType = async (id: number) => {
    try {
      await configApi.deleteRepairType(id);
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleDeleteTechnician = async (id: number) => {
    try {
      await configApi.deleteTechnician(id);
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleDeleteShift = async (id: number) => {
    try {
      await configApi.deleteShift(id);
      loadData();
    } catch {
      // Error handled
    }
  };

  const loadExportHistories = async () => {
    setExportHistoriesLoading(true);
    try {
      const histories = await reportApi.getExportHistories();
      setExportHistories(histories);
    } catch {
      // Error handled
    } finally {
      setExportHistoriesLoading(false);
    }
  };

  const loadSchemes = async () => {
    setSchemesLoading(true);
    try {
      const list = await reportApi.getSchemes();
      setSchemes(list);
    } catch {
      // Error handled
    } finally {
      setSchemesLoading(false);
    }
  };

  const handleExport = async () => {
    if (exportDateRangeType === 'custom') {
      if (!exportDateRange || !exportDateRange[0] || !exportDateRange[1]) {
        message.error('自定义范围需要选择开始和结束日期');
        return;
      }
      if (exportDateRange[0].isAfter(exportDateRange[1])) {
        message.error('结束日期不能早于开始日期');
        return;
      }
    }

    try {
      const startDate = exportDateRangeType === 'custom' ? exportDateRange?.[0]?.format('YYYY-MM-DD') : undefined;
      const endDate = exportDateRangeType === 'custom' ? exportDateRange?.[1]?.format('YYYY-MM-DD') : undefined;

      await reportApi.export(
        exportStatus,
        startDate,
        endDate,
        exportDateRangeType
      );
      message.success('导出成功');
      loadExportHistories();
    } catch {
      // Error handled
    }
  };

  const handleExportWithScheme = async (scheme: ExportScheme) => {
    try {
      const startDate = scheme.dateRangeType === 'custom' && scheme.startDate ? scheme.startDate : undefined;
      const endDate = scheme.dateRangeType === 'custom' && scheme.endDate ? scheme.endDate : undefined;

      await reportApi.export(
        scheme.status || undefined,
        startDate,
        endDate,
        scheme.dateRangeType,
        scheme.id
      );
      message.success(`使用方案 "${scheme.name}" 导出成功`);
      loadExportHistories();
    } catch {
      // Error handled
    }
  };

  const handleReExport = async (record: ExportHistory) => {
    try {
      await reportApi.reExport(record.id);
      message.success('重新导出成功');
      loadExportHistories();
    } catch {
      // Error handled
    }
  };

  const handleDownloadExport = async (record: ExportHistory) => {
    try {
      await reportApi.downloadExport(record.id);
    } catch {
      // Error handled
    }
  };

  const applyHistoryConditions = (record: ExportHistory) => {
    setExportStatus(record.status || 'all');
    if (record.startDate && record.endDate) {
      setExportDateRangeType('custom');
      setExportDateRange([dayjs(record.startDate), dayjs(record.endDate)]);
    } else {
      setExportDateRangeType('all');
      setExportDateRange(null);
    }
  };

  const openSaveSchemeModal = () => {
    saveSchemeForm.resetFields();
    setSaveSchemeModalOpen(true);
  };

  const handleSaveScheme = async (values: { name: string; description?: string; overwrite?: boolean }) => {
    const startDate = exportDateRangeType === 'custom' ? exportDateRange?.[0]?.format('YYYY-MM-DD') : undefined;
    const endDate = exportDateRangeType === 'custom' ? exportDateRange?.[1]?.format('YYYY-MM-DD') : undefined;

    try {
      await reportApi.createScheme({
        name: values.name,
        description: values.description,
        status: exportStatus !== 'all' ? exportStatus : null,
        startDate: startDate || null,
        endDate: endDate || null,
        dateRangeType: exportDateRangeType,
        overwrite: values.overwrite,
      });
      message.success(values.overwrite ? '方案已覆盖更新' : '方案创建成功');
      setSaveSchemeModalOpen(false);
      loadSchemes();
    } catch (err: unknown) {
      const e = err as { conflict?: boolean; conflictInfo?: { type: string; existingId?: number }; error?: string };
      if (e.conflict && e.conflictInfo?.type === 'duplicate_name') {
        Modal.confirm({
          title: '方案名称冲突',
          icon: <ExclamationCircleOutlined />,
          content: `方案名称 "${values.name}" 已存在，是否覆盖更新现有方案？`,
          okText: '覆盖更新',
          cancelText: '取消',
          onOk: async () => {
            try {
              await reportApi.createScheme({
                name: values.name,
                description: values.description,
                status: exportStatus !== 'all' ? exportStatus : null,
                startDate: startDate || null,
                endDate: endDate || null,
                dateRangeType: exportDateRangeType,
                overwrite: true,
              });
              message.success('方案已覆盖更新');
              setSaveSchemeModalOpen(false);
              loadSchemes();
            } catch {
              // handled
            }
          },
        });
      }
    }
  };

  const handleSetDefaultScheme = async (scheme: ExportScheme) => {
    try {
      await reportApi.setDefaultScheme(scheme.id);
      message.success(`已将 "${scheme.name}" 设为默认方案`);
      loadSchemes();
    } catch {
      // handled
    }
  };

  const openEditSchemeModal = (scheme: ExportScheme) => {
    setEditingScheme(scheme);
    editSchemeForm.resetFields();
    editSchemeForm.setFieldsValue({
      name: scheme.name,
      description: scheme.description || undefined,
      status: scheme.status || 'all',
      dateRangeType: scheme.dateRangeType,
      startDate: scheme.startDate || undefined,
      endDate: scheme.endDate || undefined,
    });
    setEditSchemeModalOpen(true);
  };

  const handleEditScheme = async (values: {
    name: string;
    description?: string;
    status?: string;
    dateRangeType?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    if (!editingScheme) return;
    try {
      await reportApi.updateScheme(editingScheme.id, {
        name: values.name,
        description: values.description,
        status: values.status !== 'all' ? values.status : null,
        startDate: values.dateRangeType === 'custom' ? values.startDate || null : null,
        endDate: values.dateRangeType === 'custom' ? values.endDate || null : null,
        dateRangeType: values.dateRangeType,
        expectedVersion: editingScheme.version,
      });
      message.success('方案更新成功');
      setEditSchemeModalOpen(false);
      setEditingScheme(null);
      loadSchemes();
    } catch (err: unknown) {
      const e = err as {
        conflict?: boolean;
        conflictInfo?: { type: string; serverVersion?: number };
        error?: string;
      };
      if (e.conflict && e.conflictInfo?.type === 'version_mismatch') {
        Modal.error({
          title: '并发冲突',
          content: '该方案已被他人修改，请刷新列表后再试。',
        });
      } else if (e.conflict && e.conflictInfo?.type === 'duplicate_name') {
        message.error('方案名称已被占用，请换一个名称');
      } else {
        message.error(e.error || '更新失败');
      }
    }
  };

  const openCopySchemeModal = (scheme: ExportScheme) => {
    setCopySourceScheme(scheme);
    copySchemeForm.resetFields();
    copySchemeForm.setFieldsValue({ newName: `${scheme.name} - 副本` });
    setCopySchemeModalOpen(true);
  };

  const handleCopyScheme = async (values: { newName: string }) => {
    if (!copySourceScheme) return;
    try {
      await reportApi.copyScheme(copySourceScheme.id, values.newName);
      message.success('方案复制成功，可在列表中找到并微调');
      setCopySchemeModalOpen(false);
      setCopySourceScheme(null);
      loadSchemes();
    } catch (err: unknown) {
      const e = err as { conflict?: boolean; error?: string };
      if (e.conflict) {
        message.error(`新方案名称 "${values.newName}" 已存在，请换一个`);
      } else {
        message.error(e.error || '复制失败');
      }
    }
  };

  const handleDeleteScheme = async (scheme: ExportScheme, force = false) => {
    try {
      await reportApi.deleteScheme(scheme.id, force);
      message.success(force ? '默认方案已删除' : '方案已删除');
      loadSchemes();
    } catch (err: unknown) {
      const e = err as { conflict?: boolean; conflictInfo?: { type: string }; error?: string };
      if (e.conflict && e.conflictInfo?.type === 'delete_default') {
        Modal.confirm({
          title: '删除默认方案',
          icon: <ExclamationCircleOutlined />,
          content: `"${scheme.name}" 是当前默认方案，确认仍要删除吗？`,
          okText: '确认删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            try {
              await reportApi.deleteScheme(scheme.id, true);
              message.success('默认方案已删除');
              loadSchemes();
            } catch {
              // handled
            }
          },
        });
      }
    }
  };

  const handleViewSchemeLogs = async (schemeId?: number) => {
    try {
      const logs = await reportApi.getSchemeLogs(schemeId);
      setSchemeLogs(logs);
      setViewSchemeId(schemeId || null);
      setSchemeLogsModalOpen(true);
    } catch {
      // handled
    }
  };

  const repairTypeColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '类型名称',
      dataIndex: 'name',
      width: 150,
      render: (name: string) => (
        <span>
          <ToolOutlined style={{ color: '#3b82f6', marginRight: 6 }} />
          {name}
        </span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record: RepairType) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openRepairTypeModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该维修类型？"
            description="删除后无法恢复，已有工单使用的类型无法删除"
            onConfirm={() => handleDeleteRepairType(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const technicianColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (name: string) => (
        <span>
          <UserOutlined style={{ color: '#3b82f6', marginRight: 6 }} />
          {name}
        </span>
      ),
    },
    {
      title: '电话',
      dataIndex: 'phone',
      width: 140,
    },
    {
      title: '技能',
      dataIndex: 'skill',
      width: 150,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record: Technician) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openTechnicianModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该技工？"
            description="有未完成工单的技工无法删除"
            onConfirm={() => handleDeleteTechnician(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const shiftColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '技工',
      dataIndex: 'technicianName',
      width: 120,
    },
    {
      title: '星期',
      dataIndex: 'dayOfWeek',
      width: 100,
      render: (d: number) => WEEK_DAYS[d],
    },
    {
      title: '上班时间',
      dataIndex: 'startTime',
      width: 120,
    },
    {
      title: '下班时间',
      dataIndex: 'endTime',
      width: 120,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record: Shift) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openShiftModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该班次？"
            onConfirm={() => handleDeleteShift(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const schemeColumns = [
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 60,
      render: (isDefault: boolean, record: ExportScheme) => (
        <Tooltip title={isDefault ? '当前默认方案' : '设为默认'}>
          {isDefault ? (
            <StarFilled style={{ color: '#fadb14', fontSize: 18 }} />
          ) : (
            <Button
              type="text"
              size="small"
              icon={<StarOutlined />}
              onClick={() => handleSetDefaultScheme(record)}
            />
          )}
        </Tooltip>
      ),
    },
    {
      title: '方案名称',
      dataIndex: 'name',
      width: 160,
      render: (name: string, record: ExportScheme) => (
        <Space>
          <AppstoreOutlined style={{ color: '#3b82f6' }} />
          <Text strong={record.isDefault}>{name}</Text>
          {record.isDefault && <Tag color="gold">默认</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (d: string | null) => d || <Text type="secondary">-</Text>,
    },
    {
      title: '状态筛选',
      dataIndex: 'status',
      width: 110,
      render: (s: string | null) =>
        s ? (
          <Tag color="blue">{TICKET_STATUS_LABELS[s as keyof typeof TICKET_STATUS_LABELS] || s}</Tag>
        ) : (
          <Tag>全部</Tag>
        ),
    },
    {
      title: '日期范围',
      width: 180,
      render: (_: unknown, record: ExportScheme) => {
        if (record.dateRangeType === 'custom' && record.startDate && record.endDate) {
          return `${record.startDate} ~ ${record.endDate}`;
        }
        return <Tag color="green">全部时间</Tag>;
      },
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 60,
      render: (v: number) => <Badge count={`v${v}`} showZero />,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 160,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      width: 300,
      fixed: 'right' as const,
      render: (_: unknown, record: ExportScheme) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleExportWithScheme(record)}
          >
            导出
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => applySchemeConditions(record)}
          >
            应用条件
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditSchemeModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => openCopySchemeModal(record)}
          >
            复制
          </Button>
          <Popconfirm
            title={`确认删除方案 "${record.name}"？`}
            onConfirm={() => handleDeleteScheme(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'repair-types',
      label: (
        <span>
          <ToolOutlined /> 维修类型
        </span>
      ),
    },
    {
      key: 'technicians',
      label: (
        <span>
          <UserOutlined /> 技工管理
        </span>
      ),
    },
    {
      key: 'shifts',
      label: (
        <span>
          <CalendarOutlined /> 班次配置
        </span>
      ),
    },
    {
      key: 'reports',
      label: (
        <span>
          <FileTextOutlined /> 报表导出
        </span>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
            管理配置
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            系统配置与数据管理
          </Text>
        </div>
        <Button onClick={loadData}>刷新</Button>
      </div>

      <Card
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: 0 }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 24px' }}
        />

        {activeTab === 'repair-types' && (
          <div style={{ padding: '0 24px 24px' }}>
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openRepairTypeModal()}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                新增类型
              </Button>
            </div>
            <Table
              rowKey="id"
              columns={repairTypeColumns}
              dataSource={repairTypes}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          </div>
        )}

        {activeTab === 'technicians' && (
          <div style={{ padding: '0 24px 24px' }}>
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openTechnicianModal()}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                新增技工
              </Button>
            </div>
            <Table
              rowKey="id"
              columns={technicianColumns}
              dataSource={technicians}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          </div>
        )}

        {activeTab === 'shifts' && (
          <div style={{ padding: '0 24px 24px' }}>
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openShiftModal()}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                新增班次
              </Button>
            </div>
            <Table
              rowKey="id"
              columns={shiftColumns}
              dataSource={shifts}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          </div>
        )}

        {activeTab === 'reports' && (
          <div style={{ padding: 24 }}>
            <Card
              size="small"
              title="导出条件"
              style={{ maxWidth: 600, marginBottom: 24 }}
              extra={
                <Button
                  icon={<SaveOutlined />}
                  size="small"
                  onClick={openSaveSchemeModal}
                >
                  保存为方案
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <Text style={{ marginBottom: 8, display: 'block' }}>工单状态</Text>
                  <Select
                    value={exportStatus}
                    onChange={setExportStatus}
                    style={{ width: '100%' }}
                    options={[
                      { label: '全部状态', value: 'all' },
                      { label: '待派工', value: 'pending' },
                      { label: '已派工', value: 'assigned' },
                      { label: '已改派', value: 'reassigned' },
                      { label: '待复核', value: 'completed' },
                      { label: '已关闭', value: 'closed' },
                    ]}
                  />
                </div>
                <div>
                  <Text style={{ marginBottom: 8, display: 'block' }}>创建时间范围</Text>
                  <Radio.Group
                    value={exportDateRangeType}
                    onChange={(e) => {
                      setExportDateRangeType(e.target.value);
                      if (e.target.value === 'all') {
                        setExportDateRange(null);
                      }
                    }}
                    style={{ marginBottom: 8 }}
                  >
                    <Radio value="all">全部时间</Radio>
                    <Radio value="custom">自定义范围</Radio>
                  </Radio.Group>
                  {exportDateRangeType === 'custom' && (
                    <RangePicker
                      value={exportDateRange}
                      onChange={setExportDateRange}
                      style={{ width: '100%' }}
                      format="YYYY-MM-DD"
                    />
                  )}
                </div>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleExport}
                  block
                  style={{
                    background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                    border: 'none',
                    height: 44,
                  }}
                >
                  导出 CSV 报表
                </Button>
              </Space>
            </Card>

            <Card
              size="small"
              title={
                <Space>
                  <AppstoreOutlined style={{ color: '#3b82f6' }} />
                  <span>导出方案管理</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    （⭐=默认方案，进入页面时自动应用）
                  </Text>
                </Space>
              }
              extra={
                <Space>
                  <Button
                    size="small"
                    icon={<AuditOutlined />}
                    onClick={() => handleViewSchemeLogs()}
                  >
                    操作日志
                  </Button>
                  <Button size="small" onClick={loadSchemes}>
                    刷新
                  </Button>
                </Space>
              }
              style={{ marginBottom: 24 }}
            >
              <Table
                rowKey="id"
                columns={schemeColumns}
                dataSource={schemes}
                loading={schemesLoading}
                pagination={{ pageSize: 5, showSizeChanger: false }}
                size="small"
                scroll={{ x: 1100 }}
                locale={{ emptyText: '暂无保存的方案，点击上方"保存为方案"创建第一个方案' }}
              />
            </Card>

            <Card
              size="small"
              title={
                <span>
                  <HistoryOutlined style={{ marginRight: 8 }} />
                  最近导出
                </span>
              }
              extra={
                <Button size="small" onClick={loadExportHistories}>
                  刷新
                </Button>
              }
            >
              <Table
                rowKey="id"
                columns={[
                  {
                    title: '导出时间',
                    dataIndex: 'createdAt',
                    width: 170,
                    render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
                  },
                  {
                    title: '状态筛选',
                    dataIndex: 'status',
                    width: 100,
                    render: (s: string | null) => s ? (
                      <Tag color="blue">{TICKET_STATUS_LABELS[s as keyof typeof TICKET_STATUS_LABELS] || s}</Tag>
                    ) : <Tag>全部</Tag>,
                  },
                  {
                    title: '日期范围',
                    width: 180,
                    render: (_: unknown, record: ExportHistory) => {
                      if (record.startDate && record.endDate) {
                        return `${record.startDate} ~ ${record.endDate}`;
                      }
                      return '全部时间';
                    },
                  },
                  {
                    title: '导出人',
                    dataIndex: 'operatorName',
                    width: 100,
                  },
                  {
                    title: '文件名',
                    dataIndex: 'filename',
                    ellipsis: true,
                    render: (f: string) => (
                      <Text style={{ fontSize: 12 }}>{f}</Text>
                    ),
                  },
                  {
                    title: '操作',
                    width: 200,
                    render: (_: unknown, record: ExportHistory) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadExport(record)}
                        >
                          下载
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          icon={<RedoOutlined />}
                          onClick={() => handleReExport(record)}
                        >
                          重新导出
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => applyHistoryConditions(record)}
                        >
                          复用条件
                        </Button>
                      </Space>
                    ),
                  },
                ]}
                dataSource={exportHistories}
                loading={exportHistoriesLoading}
                pagination={{ pageSize: 5, showSizeChanger: false }}
                size="small"
              />
            </Card>
          </div>
        )}
      </Card>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            {editingRepairType ? '编辑' : '新增'}维修类型
          </div>
        }
        open={repairTypeModalOpen}
        onCancel={() => {
          setRepairTypeModalOpen(false);
          setEditingRepairType(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={repairTypeForm}
          layout="vertical"
          onFinish={handleSaveRepairType}
        >
          <Form.Item
            name="name"
            label="类型名称"
            rules={[
              { required: true, message: '请输入类型名称' },
              { min: 2, message: '名称至少2个字符' },
            ]}
          >
            <Input placeholder="例如：漏水维修" maxLength={50} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入描述信息" maxLength={200} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setRepairTypeModalOpen(false);
                  setEditingRepairType(null);
                }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            {editingTechnician ? '编辑' : '新增'}技工
          </div>
        }
        open={technicianModalOpen}
        onCancel={() => {
          setTechnicianModalOpen(false);
          setEditingTechnician(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={technicianForm}
          layout="vertical"
          onFinish={handleSaveTechnician}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[
              { required: true, message: '请输入姓名' },
              { min: 2, message: '姓名至少2个字符' },
            ]}
          >
            <Input placeholder="请输入技工姓名" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="phone"
            label="电话"
            rules={[
              { required: true, message: '请输入电话' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
            ]}
          >
            <Input placeholder="请输入联系电话" maxLength={20} />
          </Form.Item>
          <Form.Item name="skill" label="技能">
            <Input placeholder="例如：水电维修、管道疏通" maxLength={50} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setTechnicianModalOpen(false);
                  setEditingTechnician(null);
                }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            {editingShift ? '编辑' : '新增'}班次
          </div>
        }
        open={shiftModalOpen}
        onCancel={() => {
          setShiftModalOpen(false);
          setEditingShift(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={shiftForm}
          layout="vertical"
          onFinish={handleSaveShift}
        >
          <Form.Item
            name="technicianId"
            label="选择技工"
            rules={[{ required: true, message: '请选择技工' }]}
          >
            <Select
              placeholder="请选择技工"
              options={technicians.map(t => ({
                label: `${t.name} (${t.skill || '综合维修'})`,
                value: t.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="dayOfWeek"
            label="星期"
            rules={[{ required: true, message: '请选择星期' }]}
          >
            <Select
              placeholder="请选择星期"
              options={WEEK_DAYS.map((name, index) => ({
                label: name,
                value: index,
              }))}
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="startTime"
              label="上班时间"
              rules={[{ required: true, message: '请输入上班时间' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="例如：09:00" maxLength={5} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="下班时间"
              rules={[{ required: true, message: '请输入下班时间' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="例如：18:00" maxLength={5} />
            </Form.Item>
          </div>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setShiftModalOpen(false);
                  setEditingShift(null);
                }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <SaveOutlined style={{ color: '#3b82f6' }} />
            <span>将当前筛选条件保存为方案</span>
          </Space>
        }
        open={saveSchemeModalOpen}
        onCancel={() => setSaveSchemeModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={saveSchemeForm} layout="vertical" onFinish={handleSaveScheme}>
          <Form.Item
            name="name"
            label="方案名称"
            rules={[
              { required: true, message: '请输入方案名称' },
              { min: 2, message: '名称至少2个字符' },
              { max: 100, message: '名称最多100个字符' },
            ]}
          >
            <Input placeholder="例如：本月待派工清单" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="方案描述（可选）">
            <TextArea rows={2} placeholder="简要说明该方案的用途或适用场景" maxLength={200} />
          </Form.Item>
          <Divider style={{ margin: '8px 0 16px' }} />
          <div style={{
            background: '#f5f7fa',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
          }}>
            <Text type="secondary">将保存以下条件：</Text>
            <List
              size="small"
              dataSource={[
                `工单状态：${exportStatus === 'all' ? '全部状态' : TICKET_STATUS_LABELS[exportStatus as keyof typeof TICKET_STATUS_LABELS] || exportStatus}`,
                `创建时间：${exportDateRangeType === 'custom' && exportDateRange && exportDateRange[0] && exportDateRange[1]
                  ? `${exportDateRange[0].format('YYYY-MM-DD')} ~ ${exportDateRange[1].format('YYYY-MM-DD')}`
                  : '全部时间'}`,
              ]}
              renderItem={(item) => <List.Item>• {item}</List.Item>}
            />
          </div>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setSaveSchemeModalOpen(false)}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                保存方案
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#3b82f6' }} />
            <span>编辑方案</span>
          </Space>
        }
        open={editSchemeModalOpen}
        onCancel={() => {
          setEditSchemeModalOpen(false);
          setEditingScheme(null);
        }}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form form={editSchemeForm} layout="vertical" onFinish={handleEditScheme}>
          <Form.Item
            name="name"
            label="方案名称"
            rules={[
              { required: true, message: '请输入方案名称' },
              { min: 2, message: '名称至少2个字符' },
            ]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="方案描述">
            <TextArea rows={2} maxLength={200} />
          </Form.Item>
          <Divider style={{ margin: '8px 0 16px' }} />
          <Text strong>筛选条件</Text>
          <div style={{ marginTop: 8 }}>
            <Form.Item
              name="status"
              label="工单状态"
              style={{ marginBottom: 12 }}
            >
              <Select
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '待派工', value: 'pending' },
                  { label: '已派工', value: 'assigned' },
                  { label: '已改派', value: 'reassigned' },
                  { label: '待复核', value: 'completed' },
                  { label: '已关闭', value: 'closed' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="dateRangeType"
              label="时间范围类型"
              style={{ marginBottom: 12 }}
            >
              <Radio.Group>
                <Radio value="all">全部时间</Radio>
                <Radio value="custom">自定义范围</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.dateRangeType !== cur.dateRangeType}>
              {({ getFieldValue }) =>
                getFieldValue('dateRangeType') === 'custom' ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item
                      name="startDate"
                      label="开始日期"
                      rules={[{ required: true, message: '请选择开始日期' }]}
                      style={{ marginBottom: 8 }}
                    >
                      <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>
                    <Form.Item
                      name="endDate"
                      label="结束日期"
                      rules={[{ required: true, message: '请选择结束日期' }]}
                    >
                      <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>
                  </Space>
                ) : null
              }
            </Form.Item>
          </div>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button
                onClick={() => {
                  setEditSchemeModalOpen(false);
                  setEditingScheme(null);
                }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                保存修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <CopyOutlined style={{ color: '#3b82f6' }} />
            <span>复制方案</span>
          </Space>
        }
        open={copySchemeModalOpen}
        onCancel={() => {
          setCopySchemeModalOpen(false);
          setCopySourceScheme(null);
        }}
        footer={null}
        destroyOnClose
      >
        {copySourceScheme && (
          <div style={{
            background: '#f5f7fa',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            marginBottom: 16,
          }}>
            <Text type="secondary">源方案：</Text>
            <Text strong>{copySourceScheme.name}</Text>
            <div style={{ marginTop: 8 }}>
              <Tag>
                {copySourceScheme.status
                  ? TICKET_STATUS_LABELS[copySourceScheme.status as keyof typeof TICKET_STATUS_LABELS] || copySourceScheme.status
                  : '全部状态'}
              </Tag>
              <Tag color="green">
                {copySourceScheme.dateRangeType === 'custom' && copySourceScheme.startDate && copySourceScheme.endDate
                  ? `${copySourceScheme.startDate} ~ ${copySourceScheme.endDate}`
                  : '全部时间'}
              </Tag>
            </div>
          </div>
        )}
        <Form form={copySchemeForm} layout="vertical" onFinish={handleCopyScheme}>
          <Form.Item
            name="newName"
            label="新方案名称"
            rules={[
              { required: true, message: '请输入新方案名称' },
              { min: 2, message: '名称至少2个字符' },
            ]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            复制后可在列表中找到该方案并"编辑"微调筛选条件
          </Text>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button
                onClick={() => {
                  setCopySchemeModalOpen(false);
                  setCopySourceScheme(null);
                }}
              >
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<CopyOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                确认复制
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <AuditOutlined style={{ color: '#3b82f6' }} />
            <span>方案操作日志{viewSchemeId ? '（单方案）' : '（全部）'}</span>
          </Space>
        }
        open={schemeLogsModalOpen}
        onCancel={() => {
          setSchemeLogsModalOpen(false);
          setSchemeLogs([]);
          setViewSchemeId(null);
        }}
        footer={[
          <Button key="close" icon={<CloseOutlined />} onClick={() => {
            setSchemeLogsModalOpen(false);
            setSchemeLogs([]);
            setViewSchemeId(null);
          }}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {schemeLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            暂无操作日志
          </div>
        ) : (
          <List
            dataSource={schemeLogs}
            renderItem={(log) => (
              <List.Item key={log.id}>
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#e6f4ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1677ff',
                      fontWeight: 600,
                    }}>
                      {log.operatorName.charAt(0)}
                    </div>
                  }
                  title={
                    <Space>
                      <Tag color="blue">{OPERATION_LABELS[log.operation] || log.operation}</Tag>
                      <Text strong>{log.schemeName || '（已删除方案）'}</Text>
                    </Space>
                  }
                  description={
                    <div>
                      <div>
                        <Text type="secondary">操作人：</Text>
                        <Text>{log.operatorName}</Text>
                        <Text type="secondary" style={{ marginLeft: 16 }}>
                          {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                      </div>
                      {log.detail && (
                        <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
                          {log.detail}
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
};
