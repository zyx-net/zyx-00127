import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  HomeOutlined,
  DashboardOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ROLE_LABELS } from '../../shared/types';

const { Header, Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const getMenuItems = () => {
    const items = [];

    if (user?.role === 'resident') {
      items.push({
        key: '/resident',
        icon: <HomeOutlined />,
        label: <Link to="/resident">报修中心</Link>,
      });
    }

    if (user?.role === 'dispatcher' || user?.role === 'admin') {
      items.push({
        key: '/dispatch',
        icon: <DashboardOutlined />,
        label: <Link to="/dispatch">调度台</Link>,
      });
    }

    if (user?.role === 'admin') {
      items.push({
        key: '/admin',
        icon: <SettingOutlined />,
        label: <Link to="/admin">管理配置</Link>,
      });
    }

    return items;
  };

  const userMenu = {
    items: [
      {
        key: 'info',
        icon: <UserOutlined />,
        label: `${user?.name} (${user ? ROLE_LABELS[user.role] : ''})`,
        disabled: true,
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout,
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: 'linear-gradient(180deg, #1e3a5f 0%, #0f2744 100%)',
        }}
        width={220}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '0 20px',
            color: '#fff',
            fontSize: collapsed ? 20 : 18,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <FileTextOutlined style={{ marginRight: collapsed ? 0 : 10 }} />
          {!collapsed && <span>维修调度台</span>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          style={{
            background: 'transparent',
            borderRight: 'none',
            marginTop: 16,
          }}
          theme="dark"
          items={getMenuItems()}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 500, color: '#1e3a5f' }}>
            社区维修调度管理系统
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button
              type="text"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Avatar
                size="small"
                style={{ backgroundColor: '#1e3a5f' }}
                icon={<UserOutlined />}
              />
              <span style={{ color: '#333' }}>{user?.name}</span>
            </Button>
          </Dropdown>
        </Header>
        <Content
          style={{
            padding: 24,
            background: '#f5f7fa',
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};
