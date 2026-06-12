import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  List,
  Button,
  Typography,
  Tag,
  message,
  theme,
  Input,
  Switch,
  Popconfirm,
  Empty,
  Form,
  Space,
} from "antd";
import { Clock, Trash2, Plus, RefreshCw, Pencil, Play } from "lucide-react";

const { Text } = Typography;

type Schedule = {
  id: string;
  label: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  lastRun?: number;
  lastResult?: string;
};

export function PromptShortcutModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={18} color={token.colorPrimary} />
          <span>Agendados</span>
        </div>
      }
      width={680}
    >
      {contextHolder}
      <SchedulesTab messageApi={messageApi} />
    </Modal>
  );
}

function SchedulesTab({
  messageApi,
}: {
  messageApi: ReturnType<typeof message.useMessage>[0];
}) {
  const { token } = theme.useToken();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedules");
      const data = await res.json();
      if (Array.isArray(data.schedules)) setSchedules(data.schedules);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (values: {
    label: string;
    prompt: string;
    cron: string;
  }) => {
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, enabled: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      messageApi.error(data.error || "Falha ao criar agendamento");
      return;
    }
    form.resetFields();
    messageApi.success("Agendamento criado");
    load();
  };

  const toggle = async (id: string, enabled: boolean) => {
    const res = await fetch("/api/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (!res.ok) {
      const data = await res.json();
      messageApi.error(data.error || "Falha");
      return;
    }
    load();
  };

  const remove = async (id: string) => {
    const res = await fetch("/api/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      messageApi.error(data.error || "Falha");
      return;
    }
    messageApi.success("Removido");
    load();
  };

  const startEdit = (s: Schedule) => {
    editForm.setFieldsValue({ label: s.label, prompt: s.prompt, cron: s.cron });
    setEditing(s);
  };

  const saveEdit = async (values: { label: string; prompt: string; cron: string }) => {
    if (!editing) return;
    const res = await fetch("/api/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ id: editing.id, ...values }),
    });
    const data = await res.json();
    if (!res.ok) {
      messageApi.error(data.error || "Falha ao salvar");
      return;
    }
    messageApi.success("Agendamento atualizado");
    setEditing(null);
    load();
  };

  const runNow = async (id: string) => {
    const res = await fetch("/api/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) {
      messageApi.error(data.error || "Falha");
      return;
    }
    messageApi.success("Disparado manualmente");
    load();
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "start", gap: 8, marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 13, flex: 1 }}>
          Cron executa enquanto o servidor Next.js estiver rodando. Expressão no formato
          padrão <Tag style={{ fontFamily: "monospace" }}>min hora dia mês diaSem</Tag>
          — ex.: <Tag style={{ fontFamily: "monospace" }}>0 9 * * *</Tag> = todo dia às 09:00.
        </Text>
        <Button
          size="small"
          type="text"
          icon={<RefreshCw size={12} />}
          loading={loading}
          onClick={load}
        >
          Atualizar
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={create}
        style={{
          padding: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <Form.Item
          name="label"
          label="Nome"
          rules={[{ required: true, message: "obrigatório" }]}
          style={{ marginBottom: 10 }}
        >
          <Input placeholder="Ex: Heartbeat diário" />
        </Form.Item>
        <Form.Item
          name="prompt"
          label="Prompt"
          rules={[{ required: true, message: "obrigatório" }]}
          style={{ marginBottom: 10 }}
        >
          <Input placeholder="/heartbeat trevo current month" style={{ fontFamily: "monospace" }} />
        </Form.Item>
        <Form.Item
          name="cron"
          label="Cron"
          rules={[{ required: true, message: "obrigatório" }]}
          style={{ marginBottom: 10 }}
        >
          <Input placeholder="0 9 * * *" style={{ fontFamily: "monospace" }} />
        </Form.Item>
        <Button type="primary" icon={<Plus size={14} />} htmlType="submit">
          Adicionar
        </Button>
      </Form>

      {schedules.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={loading ? "Carregando..." : "Nenhum agendamento"}
        />
      ) : (
        <List
          dataSource={schedules}
          renderItem={(s) => (
            <List.Item
              key={s.id}
              style={{
                padding: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8,
                marginBottom: 6,
              }}
              actions={[
                <Switch
                  key="toggle"
                  size="small"
                  checked={s.enabled}
                  onChange={(checked) => toggle(s.id, checked)}
                />,
                <Button
                  key="run"
                  size="small"
                  icon={<Play size={12} />}
                  onClick={() => runNow(s.id)}
                >
                  Rodar
                </Button>,
                <Button
                  key="edit"
                  size="small"
                  icon={<Pencil size={12} />}
                  onClick={() => startEdit(s)}
                />,
                <Popconfirm
                  key="del"
                  title="Remover?"
                  onConfirm={() => remove(s.id)}
                  okText="Sim"
                  cancelText="Não"
                >
                  <Button size="small" danger icon={<Trash2 size={12} />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{s.label}</span>
                    {!s.enabled && <Tag color="default">pausado</Tag>}
                  </Space>
                }
                description={
                  <div style={{ fontSize: 12 }}>
                    <Tag style={{ fontFamily: "monospace" }}>{s.cron}</Tag>
                    <Tag style={{ fontFamily: "monospace" }}>{s.prompt}</Tag>
                    {s.lastRun && (
                      <div style={{ marginTop: 4, color: token.colorTextSecondary }}>
                        último: {new Date(s.lastRun).toLocaleString("pt-BR")} — {s.lastResult}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        okText="Salvar"
        cancelText="Cancelar"
        title="Editar agendamento"
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={saveEdit}
          preserve={false}
        >
          <Form.Item
            name="label"
            label="Nome"
            rules={[{ required: true, message: "obrigatório" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="prompt"
            label="Prompt"
            rules={[{ required: true, message: "obrigatório" }]}
          >
            <Input style={{ fontFamily: "monospace" }} />
          </Form.Item>
          <Form.Item
            name="cron"
            label="Cron"
            rules={[{ required: true, message: "obrigatório" }]}
          >
            <Input style={{ fontFamily: "monospace" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
