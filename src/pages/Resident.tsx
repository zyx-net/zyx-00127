import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Tabs,
  Typography,
  Modal,
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EnvironmentOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { publicApi, ticketApi } from '../api';
import { useAuthStore } from '../store/authStore';
import {
  Ticket,
  RepairType,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  CreateTicketRequest,
} from '../../shared/types';

const { Title, Text } = Typography;
const { TextArea } = Input;

export const Resident: React.FC = () => {
  const [form] = Form.useForm<CreateTicketRequest>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [types, list] = await Promise.all([
        publicApi.getRepairTypes(),
        ticketApi.getList(activeTab === 'all' ? undefined : activeTab),
      ]);
      setRepairTypes(types);
      setTickets(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleCreate = async (values: CreateTicketRequest) => {
    try {
      await ticketApi.create(values);
      setShowCreate(false);
      form.resetFields();
      loadData();
    } catch {
      // Error handled
    }
  };

  const columns = [
    {
      title: '工单ID',
      dataIndex: 'id',
      width: 80,
      render: (id: number) => <Text strong>#{id}</Text>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
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
      render: (addr: string) => (
        <span>
          <EnvironmentOutlined style={{ color: '#999', marginRight: 4 }} />
          {addr}
        </span>
      ),
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
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: Ticket) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/ticket/${record.id}`)}
        >
          详情
        </Button>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待派工' },
    { key: 'assigned', label: '已派工' },
    { key: 'reassigned', label: '已改派' },
    { key: 'completed', label: '待复核' },
    { key: 'closed', label: '已关闭' },
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
            报修中心
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            欢迎，{user?.name}，您可以在这里提交报修和查看工单进度
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setShowCreate(true)}
          style={{
            background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
            border: 'none',
            height: 40,
            borderRadius: 8,
          }}
        >
          提交报修
        </Button>
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
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f' }}>
            提交报修
          </div>
        }
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ repairTypeId: undefined }}
        >
          <Form.Item
            name="title"
            label="报修标题"
            rules={[
              { required: true, message: '请输入报修标题' },
              { min: 2, message: '标题至少2个字符' },
            ]}
          >
            <Input placeholder="请简要描述问题，如：厨房水龙头漏水" maxLength={100} />
          </Form.Item>

          <Form.Item
            name="repairTypeId"
            label="维修类型"
            rules={[{ required: true, message: '请选择维修类型' }]}
          >
            <Select
              placeholder="请选择维修类型"
              options={repairTypes.map(t => ({
                label: t.name,
                value: t.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="address"
            label="报修地址"
            rules={[
              { required: true, message: '请填写报修地址' },
              { min: 5, message: '地址信息不完整' },
            ]}
          >
            <Input
              prefix={<EnvironmentOutlined style={{ color: '#999' }} />}
              placeholder="例如：1栋2单元301室"
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="问题描述"
            rules={[{ max: 1000, message: '描述不能超过1000字' }]}
          >
            <TextArea
              rows={4}
              placeholder="请详细描述问题现象、发生时间等信息"
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setShowCreate(false)}>取消</Button>
              <Button
                type="primary"
                htmlType="submit"
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                  border: 'none',
                }}
              >
                提交报修
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
