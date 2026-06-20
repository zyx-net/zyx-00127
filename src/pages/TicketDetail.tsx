import React, { useState, useEffect } from 'react';
import {
  Card,
  Tag,
  Descriptions,
  Typography,
  Timeline,
  Button,
  Space,
  Divider,
  Avatar,
  Popconfirm,
  List,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ticketApi } from '../api';
import { useAuthStore } from '../store/authStore';
import {
  Ticket,
  StatusLog,
  AssignmentLog,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
} from '../../shared/types';

const { Title, Text } = Typography;

export const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [assignmentLogs, setAssignmentLogs] = useState<AssignmentLog[]>([]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await ticketApi.getDetail(parseInt(id));
      setTicket(data.ticket);
      setStatusLogs(data.statusLogs);
      setAssignmentLogs(data.assignmentLogs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleComplete = async () => {
    if (!ticket) return;
    try {
      await ticketApi.complete(ticket.id, '维修完成，待管理员复核');
      loadData();
    } catch {
      // Error handled
    }
  };

  const handleClose = async () => {
    if (!ticket) return;
    try {
      await ticketApi.close(ticket.id, '复核通过，工单已关闭');
      loadData();
    } catch {
      // Error handled
    }
  };

  const isDispatcherOrAdmin = user?.role === 'dispatcher' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const canComplete =
    isDispatcherOrAdmin &&
    ticket &&
    ['assigned', 'reassigned'].includes(ticket.status);
  const canClose = isAdmin && ticket?.status === 'completed';

  if (!ticket && !loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="secondary">工单不存在或无权限查看</Text>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate(-1)} icon={<ArrowLeftOutlined />}>
            返回
          </Button>
        </div>
      </div>
    );
  }

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
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ marginBottom: 8 }}
          >
            返回
          </Button>
          <Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
            工单详情 #{ticket?.id}
          </Title>
        </div>
        <Space>
          {canComplete && (
            <Popconfirm
              title="确认标记为完工待复核？"
              description="标记后将等待管理员复核关闭"
              onConfirm={handleComplete}
              okText="确认"
              cancelText="取消"
            >
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                style={{ background: '#8b5cf6', border: 'none' }}
              >
                完工待复核
              </Button>
            </Popconfirm>
          )}
          {canClose && (
            <Popconfirm
              title="确认复核关闭？"
              description="关闭后工单将无法再修改"
              onConfirm={handleClose}
              okText="确认关闭"
              cancelText="取消"
              okButtonProps={{ style: { background: '#10b981', border: 'none' } }}
            >
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                style={{ background: '#10b981', border: 'none' }}
              >
                复核关闭
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          loading={loading}
          style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{ticket?.title}</span>
              {ticket && (
                <Tag color={TICKET_STATUS_COLORS[ticket.status]}>
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Tag>
              )}
            </div>
          }
        >
          <Descriptions column={2} size="middle">
            <Descriptions.Item
              label={
                <span>
                  <UserOutlined style={{ marginRight: 4 }} />
                  住户
                </span>
              }
            >
              {ticket?.residentName} ({ticket?.residentPhone})
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <span>
                  <ToolOutlined style={{ marginRight: 4 }} />
                  维修类型
                </span>
              }
            >
              <Tag color="blue">{ticket?.repairTypeName}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <span>
                  <EnvironmentOutlined style={{ marginRight: 4 }} />
                  地址
                </span>
              }
              span={2}
            >
              {ticket?.address}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <span>
                  <UserSwitchOutlined style={{ marginRight: 4 }} />
                  当前技工
                </span>
              }
            >
              {ticket?.currentTechnicianName
                ? `${ticket.currentTechnicianName} (${ticket.currentTechnicianPhone})`
                : '未指派'}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <span>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  预约时间
                </span>
              }
            >
              {ticket?.scheduledStartTime && ticket?.scheduledEndTime
                ? `${dayjs(ticket.scheduledStartTime).format('YYYY-MM-DD HH:mm')} ~ ${dayjs(
                    ticket.scheduledEndTime
                  ).format('HH:mm')}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="问题描述" span={2}>
              {ticket?.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {ticket ? dayjs(ticket.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {ticket ? dayjs(ticket.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {assignmentLogs.length > 0 && (
          <Card
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
            title={
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                <SwapOutlined style={{ marginRight: 8, color: '#3b82f6' }} />
                派工历史
              </div>
            }
          >
            <List
              dataSource={assignmentLogs}
              renderItem={log => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar style={{ backgroundColor: '#f97316' }}>
                        <UserSwitchOutlined />
                      </Avatar>
                    }
                    title={
                      <Space>
                        <Text strong>
                          {log.fromTechnicianName
                            ? `${log.fromTechnicianName} → ${log.toTechnicianName}`
                            : `派给 ${log.toTechnicianName}`}
                        </Text>
                        <Tag color="orange">
                          {dayjs(log.scheduledStartTime).format('MM-DD HH:mm')} ~{' '}
                          {dayjs(log.scheduledEndTime).format('HH:mm')}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {log.operatorName} 操作于{' '}
                          {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary">原因：</Text>
                          {log.reason}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        )}

        <Card
          style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          title={
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              <ClockCircleOutlined style={{ marginRight: 8, color: '#1e3a5f' }} />
              状态变更记录
            </div>
          }
        >
          <Timeline
            items={statusLogs.map(log => ({
              color:
                log.toStatus === 'closed'
                  ? 'green'
                  : log.toStatus === 'completed'
                  ? 'purple'
                  : log.toStatus === 'pending'
                  ? 'gray'
                  : 'blue',
              dot:
                log.toStatus === 'closed' ? (
                  <CheckCircleOutlined style={{ fontSize: 16 }} />
                ) : undefined,
              children: (
                <div>
                  <Space style={{ marginBottom: 4 }}>
                    <Text strong>{log.operatorName}</Text>
                    <Tag color={TICKET_STATUS_COLORS[log.toStatus]}>
                      {TICKET_STATUS_LABELS[log.toStatus]}
                    </Tag>
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">原因：</Text>
                    {log.reason}
                  </div>
                </div>
              ),
            }))}
          />
        </Card>
      </Space>
    </div>
  );
};
