import React, { useState, useCallback, useMemo } from "react";
import { Layout, Menu, Typography, Button, Space, theme } from "antd";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Settings,
  Sun,
  Moon,
  Terminal,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { useRouter } from "next/router";
import { useThemeMode } from "@/context/ThemeContext";
import { useRedact } from "@/context/RedactContext";
import { useRefresh } from "@/context/RefreshContext";
import { PromptShortcutModal } from "@/components/PromptShortcutModal";
import { useIsMobile } from "@/hooks/useIsMobile";

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
    key: "/investments",
    icon: <PiggyBank size={18} />,
    label: "Investimentos",
  },
  { type: "divider" as const },
  {
    key: "/settings",
    icon: <Settings size={18} />,
    label: "Configuracoes",
  },
];

const bottomNavItems: { key: string; icon: React.ReactNode; label: string }[] = [
  { key: "/overview", icon: <LayoutDashboard size={20} />, label: "Visao" },
  { key: "/transactions", icon: <ArrowLeftRight size={20} />, label: "Transacoes" },
  { key: "/investments", icon: <PiggyBank size={20} />, label: "Investir" },
  { key: "/settings", icon: <Settings size={20} />, label: "Config" },
];

const BOTTOM_NAV_HEIGHT = 64;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { mode, toggle: toggleTheme } = useThemeMode();
  const { redacted, toggle: toggleRedact } = useRedact();
  const { refreshing, trigger: triggerRefresh } = useRefresh();
  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { token } = theme.useToken();
  const isMobile = useIsMobile();

  const selected = useMemo(
    () => (router.pathname === "/" ? [] : [router.pathname]),
    [router.pathname]
  );

  const onMenuClick = useCallback(
    ({ key }: { key: string }) => router.push(key),
    [router]
  );

  if (isMobile) {
    return (
      <Layout style={{ minHeight: "100vh" }}>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 52,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={20} color={token.colorPrimary} />
            <Title level={5} style={{ margin: 0, fontSize: 14 }}>
              Financas
            </Title>
          </div>
          <Space size={4}>
            <Button
              icon={<Terminal size={16} />}
              onClick={() => setShortcutsOpen(true)}
              type="text"
              size="small"
              title="Atalhos"
            />
            <Button
              icon={
                <RefreshCw
                  size={16}
                  style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }}
                />
              }
              onClick={triggerRefresh}
              type="text"
              size="small"
              title="Atualizar"
            />
            <Button
              icon={redacted ? <EyeOff size={16} /> : <Eye size={16} />}
              onClick={toggleRedact}
              type="text"
              size="small"
              title={redacted ? "Mostrar valores" : "Ocultar valores"}
            />
            <Button
              icon={mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggleTheme}
              type="text"
              size="small"
              title={mode === "dark" ? "Tema claro" : "Tema escuro"}
            />
          </Space>
        </Header>
        <PromptShortcutModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <Content
          style={{
            padding: 12,
            paddingBottom: BOTTOM_NAV_HEIGHT + 16,
            overflowX: "hidden",
            overflowY: "auto",
            width: "100%",
            maxWidth: "100%",
            minHeight: `calc(100vh - 52px)`,
          }}
        >
          {children}
        </Content>
        {/* Bottom navigation */}
        <nav
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: BOTTOM_NAV_HEIGHT,
            background: token.colorBgContainer,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            display: "flex",
            justifyContent: "space-around",
            alignItems: "stretch",
            zIndex: 100,
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {bottomNavItems.map((item) => {
            const active = router.pathname === item.key;
            return (
              <button
                key={item.key}
                onClick={() => router.push(item.key)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 4px",
                  color: active ? token.colorPrimary : token.colorTextSecondary,
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  transition: "color 0.15s",
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </Layout>
    );
  }

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
              icon={
                <RefreshCw
                  size={16}
                  style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }}
                />
              }
              onClick={triggerRefresh}
              type="text"
              title="Atualizar"
            />
            <Button
              icon={redacted ? <EyeOff size={16} /> : <Eye size={16} />}
              onClick={toggleRedact}
              type="text"
              title={redacted ? "Mostrar valores" : "Ocultar valores"}
            />
            <Button
              icon={mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggleTheme}
              type="text"
              title={mode === "dark" ? "Tema claro" : "Tema escuro"}
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
