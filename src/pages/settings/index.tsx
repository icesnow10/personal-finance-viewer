import React, { useEffect, useState } from "react";
import { Typography, Input, Button, Card, Space, Alert, theme } from "antd";
import { FolderOpen, Save, Check } from "lucide-react";
import { useBudget } from "@/hooks/useBudget";

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { token } = theme.useToken();
  const { refresh } = useBudget();
  const [resourcesPath, setResourcesPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((config) => {
        if (config.resourcesPath) setResourcesPath(config.resourcesPath);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourcesPath: resourcesPath.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      return;
    }

    setSaved(true);
    await refresh();
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return null;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <Title level={4} style={{ marginBottom: 24, fontWeight: 400 }}>Configuracoes</Title>

      <Card>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <FolderOpen size={16} color={token.colorPrimary} />
            <Text strong>Diretorio de dados</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
            Caminho absoluto para a pasta que contem as subpastas mensais (ex: 2026-01, 2026-02).
            Cada subpasta deve ter <code>expenses/result/</code> com os JSONs de budget.
          </Text>
        </div>

        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={resourcesPath}
            onChange={(e) => {
              setResourcesPath(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="C:\Users\you\personal-finance\resources"
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
          <Button
            type="primary"
            icon={saved ? <Check size={14} /> : <Save size={14} />}
            onClick={handleSave}
          >
            {saved ? "Salvo" : "Salvar"}
          </Button>
        </Space.Compact>

        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ marginTop: 12 }}
          />
        )}

        {saved && (
          <Alert
            type="success"
            message="Configuracao salva. Dados recarregados."
            showIcon
            style={{ marginTop: 12 }}
          />
        )}

        <div style={{ marginTop: 20, padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Estrutura esperada:
          </Text>
          <pre style={{ fontSize: 11, color: token.colorTextSecondary, margin: "8px 0 0", lineHeight: 1.6 }}>
{`{caminho}/
  2026-01/
    expenses/
      result/
        budget_january_2026.json
  2026-02/
    expenses/
      result/
        budget_february_2026.json`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
