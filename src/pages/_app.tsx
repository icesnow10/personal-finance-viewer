import type { AppProps } from "next/app";
import { ConfigProvider, theme } from "antd";
import { BudgetProvider } from "@/context/BudgetContext";
import { ThemeProvider, useThemeMode } from "@/context/ThemeContext";
import { RedactProvider } from "@/context/RedactContext";
import { AppShell } from "@/components/AppShell";
import "@/styles/globals.css";

function AppInner({ Component, pageProps }: AppProps) {
  const { mode } = useThemeMode();

  return (
    <ConfigProvider
      theme={{
        algorithm:
          mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#6366f1",
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    >
      <RedactProvider>
        <BudgetProvider>
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
        </BudgetProvider>
      </RedactProvider>
    </ConfigProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider>
      <AppInner {...props} />
    </ThemeProvider>
  );
}
