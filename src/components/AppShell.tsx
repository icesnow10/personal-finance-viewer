import React, { useState, useCallback, useMemo } from "react";
import { Layout, Menu, Typography, Button, Space, theme } from "antd";
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  BarChart3,
  Wallet,
  PiggyBank,
  Settings,
  Sun,
  Moon,
  Terminal,
} from "lucide-react";
import { useRouter } from "next/router";
import { useThemeMode } from "@/context/ThemeContext";
import { PromptShortcutModal } from "@/components/PromptShortcutModal";

const { Sider, Header, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  {
    key: "/overview",
    icon: <LayoutDashboard size={18} />,
    label: "Visao Geral",
  },
  {
    key: "/transactions",
    icon: <ArrowLeftRight size={18} />,
    label: "Transacoes",
  },
  {
    key: "/income",
    icon: <TrendingUp size={18} />,
    label: "Receitas",
  },
  {
    key: "/investments",
    icon: <PiggyBank size={18} />,
    label: "Investimentos",
  },
  {
    key: "/reports",
    icon: <BarChart3 size={18} />,
    label: "Relatorios",
  },
  { type: "divider" as const },
  {
    key: "/settings",
    icon: <Settings size={18} />,
    label: "Configuracoes",
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { mode, toggle: toggleTheme } = useThemeMode();
  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { token } = theme.useToken();

  const selected = useMemo(
    () => (router.pathname === "/" ? [] : [router.pathname]),
    [router.pathname]
  );

  const onMenuClick = useCallback(
    ({ key }: { key: string }) => router.push(key),
    [router]
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
        width={220}
      >
        <div
          style={{
            padding: collapsed ? "16px 8px" : "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Wallet size={24} color={token.colorPrimary} />
          {!collapsed && (
            <Title level={5} style={{ margin: 0, whiteSpace: "nowrap" }}>
              Financas Pessoais
            </Title>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selected}
          items={menuItems}
          onClick={onMenuClick}
          style={{ border: "none", marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 56,
          }}
        >
          <Space>
            <Button
              icon={<Terminal size={16} />}
              onClick={() => setShortcutsOpen(true)}
              type="text"
              title="Atalhos de prompts"
            />
            <Button
              icon={mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggleTheme}
              type="text"
            />
          </Space>
        </Header>
        <PromptShortcutModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <Content style={{ padding: 24, overflow: "auto", height: "calc(100vh - 56px)" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
