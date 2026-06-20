import React, { useState, useEffect } from 'react';
import {
  Form,
  Select,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Tabs,
  Typography,
  Modal,
  DatePicker,
  Input,
  message,
  Popconfirm,
} from 'antd';
import {
  EyeOutlined,
  UserOutlined,
  EnvironmentOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { ticketApi, publicApi, configApi } from '../api';
import {
  Ticket,
  Technician,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  AssignTicketRequest,
} from '../../shared/types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

export const Dispatch: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [assignForm] = Form.useForm<AssignTicketRequest>();
  const [reassignForm] = Form.useForm<AssignTicketRequest>();
  const [checkingConflict, setCheckingConflict] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, techs] = await Promise.all([
        ticketApi.getList(activeTab === 'all' ? undefined : activeTab),
        publicApi.getTechnicians(),
      ]);
      setTickets(list);
      setTechnicians(techs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const checkConflict = async (
    techId: number,
    start: Dayjs | null,
    end: Dayjs | null,
    excludeTicketId?: number
  ): Promise<boolean> => {
    if (!techId || !start || !end) return false;
    try {
      const result = await configApi.checkTechnicianConflict(
        techId,
        start.toISOString(),
        end.toISOString(),
        excludeTicketId
      );
      return result.hasConflict;
    } catch {
      return false;
    }
  };

  const handleAssign = async (values: AssignTicketRequest) => {
    if (!selectedTicket) return;
    setCheckingConflict(true);
    try {
      const hasConflict = await checkConflict(
        values.technicianId,
        dayjs(values.scheduledStartTime),
        dayjs(values.scheduledEndTime),
        selectedTicket.id
      );
      if (hasConflict) {
        message.error('该技工在此时段已有派工，请选择其他时段或技工');
        return;
      }
      await ticketApi.assign(selectedTicket.id, values);
      setAssignModalOpen(false);
      assignForm.resetFields();
      setSelectedTicket(null);
      loadData();
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleReassign = async (values: AssignTicketRequest) => {
    if (!selectedTicket) return;
    setCheckingConflict(true);
    try {
      const hasConflict = await checkConflict(
        values.technicianId,
        dayjs(values.scheduledStartTime),
        dayjs(values.scheduledEndTime),
        selectedTicket.id
      );
      if (hasConflict) {
        message.error('该技工在此时段已有派工，请选择其他时段或技工');
        return;
      }
      await ticketApi.reassign(selectedTicket.id, values);
      setReassignModalOpen(false);
      reassignForm.resetFields();
      setSelectedTicket(null);
      loadData();
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleComplete = async (ticket: Ticket) => {
    try {
      await ticketApi.complete(ticket.id, '维修完成，待管理员复核');
      loadData();
    } catch {
      // Error handled
    }
  };

  const openAssignModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    assignForm.resetFields();
    setAssignModalOpen(true);
  };

  const openReassignModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    reassignForm.resetFields();
    reassignForm.setFieldsValue({
      technicianId: ticket.currentTechnicianId || undefined,
    });
    setReassignModalOpen(true);
  };

  const columns = [
    {
      title: '工单ID',
      dataIndex: 'id',
      width: 80,
      fixed: 'left' as const,
      render: (id: number) => <Text strong>#{id}</Text>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      width: 180,
    },
    {
      title: '住户',
      dataIndex: 'residentName',
      width: 100,
      render: (name: string) => (
        <span>
          <UserOutlined style={{ color: '#999', marginRight: 4 }} />
          {name}
        </span>
      ),
    },
    {
      title: '维修类型',
      dataIndex: 'repairTypeName',
      width: 120,
      render: (name: string) => (
        <Tag color="blue" icon={<ToolOutlined />}>
          {name}
        </Tag>
      ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      ellipsis: true,
      width: 180,
      render: (addr: string) => (
        <span>
          <EnvironmentOutlined style={{ color: '#999', marginRight: 4 }} />
          {addr}
        </span>
      ),
    },
    {
      title: '当前技工',
      dataIndex: 'currentTechnicianName',
      width: 100,
      render: (name: string | null) => name || '-',
    },
    {
      title: '预约时间',
      dataIndex: 'scheduledStartTime',
      width: 160,
      render: (_: unknown, record: Ticket) => {
        if (!record.scheduledStartTime) return '-';
        return (
          <span>
            <ClockCircleOutlined style={{ color: '#999', marginRight: 4 }} />
            {dayjs(record.scheduledStartTime).format('MM-DD HH:mm')}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: Ticket['status']) => (
        <Tag color={TICKET_STATUS_COLORS[status]}>
          {TICKET_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: Ticket) => {
        const canAssign = record.status === 'pending';
        const canReassign = ['assigned', 'reassigned'].includes(record.status);
        const canComplete = ['assigned', 'reassigned'].includes(record.status);

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/ticket/${record.id}`)}
            >
              详情
            </Button>
            {canAssign && (
              <Button
                type="link"
                size="small"
                icon={<UserOutlined />}
                onClick={() => openAssignModal(record)}
              >
                派工
              </Button>
            )}
            {canReassign && (
              <Button
                type="link"
                size="small"
                icon={<SwapOutlined />}
                onClick={() => openReassignModal(record)}
              >
                改派
              </Button>
            )}
            {canComplete && (
              <Popconfirm
                title="确认标记为完工待复核？"
                description="标记后将等待管理员复核关闭"
                onConfirm={() => handleComplete(record)}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  type="link"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  style={{ color: '#10b981' }}
                >
                  完工
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const tabItems = [
    { key: 'all', label: `全部 (${tickets.length})` },
    { key: 'pending', label: `待派工 (${tickets.filter(t => t.status === 'pending').length})` },
    { key: 'assigned', label: `已派工 (${tickets.filter(t => t.status === 'assigned').length})` },
    { key: 'reassigned', label: `已改派 (${tickets.filter(t => t.status === 'reassigned').length})` },
    { key: 'completed', label: `待复核 (${tickets.filter(t => t.status === 'completed').length})` },
    { key: 'closed', label: `已关闭 (${tickets.filter(t => t.status === 'closed').length})` },
  ];

  const renderAssignForm = (
    form: typeof assignForm,
    onFinish: (values: AssignTicketRequest) => Promise<void>,
    isReassign: boolean
  ) => (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
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
        name="timeRange"
        label="预约时段"
        rules={[{ required: true, message: '请选择预约时段' }]}
      >
        <RangePicker
          showTime={{
            format: 'HH:mm',
            minuteStep: 30,
          }}
          format="YYYY-MM-DD HH:mm"
          style={{ width: '100%' }}
          minDate={dayjs().startOf('day')}
        />
      </Form.Item>

      <Form.Item
        name="reason"
        label={isReassign ? '改派原因' : '派工原因'}
        rules={[
          { required: true, message: `请填写${isReassign ? '改派' : '派工'}原因` },
          { min: 2, message: '原因至少2个字符' },
        ]}
      >
        <TextArea
          rows={3}
          placeholder={`请填写${isReassign ? '改派' : '派工'}原因，如：该技工擅长此类维修`}
          maxLength={200}
          showCount
        />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Space>
          <Button
            onClick={() => {
              isReassign ? setReassignModalOpen(false) : setAssignModalOpen(false);
              setSelectedTicket(null);
            }}
          >
            取消
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={checkingConflict}
            style={{
              background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
              border: 'none',
            }}
          >
            {isReassign ? '确认改派' : '确认派工'}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );

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
            调度台
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            工单派发与进度管理
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
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tickets}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            派工 - {selectedTicket?.title}
          </div>
        }
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setSelectedTicket(null);
        }}
        footer={null}
        width={520}
        destroyOnClose
      >
        {renderAssignForm(
          assignForm,
          values =>
            handleAssign({
              ...values,
              scheduledStartTime: values.scheduledStartTime || (values as unknown as { timeRange: [Dayjs, Dayjs] }).timeRange[0].toISOString(),
              scheduledEndTime: values.scheduledEndTime || (values as unknown as { timeRange: [Dayjs, Dayjs] }).timeRange[1].toISOString(),
            }),
          false
        )}
      </Modal>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            改派 - {selectedTicket?.title}
          </div>
        }
        open={reassignModalOpen}
        onCancel={() => {
          setReassignModalOpen(false);
          setSelectedTicket(null);
        }}
        footer={null}
        width={520}
        destroyOnClose
      >
        {renderAssignForm(
          reassignForm,
          values =>
            handleReassign({
              ...values,
              scheduledStartTime: values.scheduledStartTime || (values as unknown as { timeRange: [Dayjs, Dayjs] }).timeRange[0].toISOString(),
              scheduledEndTime: values.scheduledEndTime || (values as unknown as { timeRange: [Dayjs, Dayjs] }).timeRange[1].toISOString(),
            }),
          true
        )}
      </Modal>
    </div>
  );
};
