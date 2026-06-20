import React, { useEffect } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { LoginRequest } from '../../shared/types';

const { Title, Text } = Typography;

export const Login: React.FC = () => {
  const [form] = Form.useForm<LoginRequest>();
  const { token, setAuth, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (token && user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (user.role === 'resident') {
        navigate('/resident', { replace: true });
      } else if (user.role === 'dispatcher') {
        navigate('/dispatch', { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      }
    }
  }, [token, user, navigate, location.state]);

  const handleSubmit = async (values: LoginRequest) => {
    try {
      const result = await authApi.login(values);
      setAuth(result.token, result.user);

      if (result.user.role === 'resident') {
        navigate('/resident', { replace: true });
      } else if (result.user.role === 'dispatcher') {
        navigate('/dispatch', { replace: true });
      } else if (result.user.role === 'admin') {
        navigate('/admin', { replace: true });
      }
    } catch {
      // Error handled by request util
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #1e3a5f 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(59, 130, 246, 0.1)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -100,
          left: -100,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.1)',
        }}
      />

      <Card
        style={{
          width: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          borderRadius: 12,
          zIndex: 1,
        }}
        bodyStyle={{ padding: '40px 40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#fff',
              fontSize: 28,
            }}
          >
            <FileTextOutlined />
          </div>
          <Title level={3} style={{ margin: 0, color: '#1e3a5f' }}>
            维修调度台
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            社区维修工单管理系统
          </Text>
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
          message={
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>住户: zhangsan / 123456</div>
              <div>调度员: dispatcher / 123456</div>
              <div>管理员: admin / 123456</div>
            </div>
          }
        />

        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          initialValues={{ username: '', password: '' }}
        >
          <Form.Item
            name="username"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#999' }} />}
              placeholder="请输入账号"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              style={{
                height: 44,
                fontSize: 15,
                fontWeight: 500,
                background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                border: 'none',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(30, 58, 95, 0.3)',
              }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>

        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0',
            textAlign: 'center',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            © 2026 社区维修调度管理系统
          </Text>
        </div>
      </Card>
    </div>
  );
};
