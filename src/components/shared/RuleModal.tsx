import React, { useState } from "react";
import { Modal, Form, Input, Select, message } from "antd";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/categories";

type RuleType = "expense" | "income";

interface RuleModalProps {
  open: boolean;
  onClose: () => void;
  type: RuleType;
}

interface ExpenseRule {
  merchantPattern: string;
  category: string;
  subcategory: string;
}

interface IncomeRule {
  source: string;
  holder: string;
  description: string;
}

export function RuleModal({ open, onClose, type }: RuleModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const subcategoryOptions = selectedCategory
    ? (CATEGORIES[selectedCategory] || []).map((s) => ({ label: s, value: s }))
    : [];

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...values }),
      });

      if (!res.ok) throw new Error("Falha ao salvar regra");

      message.success("Regra adicionada com sucesso!");
      form.resetFields();
      setSelectedCategory("");
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return; // validation error
      message.error(err.message || "Erro ao salvar regra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={type === "expense" ? "Nova Recorrencia" : "Nova Receita Recorrente"}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={loading}
      okText="Salvar"
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {type === "expense" ? (
          <>
            <Form.Item
              name="merchantPattern"
              label="Merchant Pattern"
              rules={[{ required: true, message: "Informe o pattern do merchant" }]}
            >
              <Input placeholder="Ex: Apple.Com/Bill" />
            </Form.Item>
            <Form.Item
              name="category"
              label="Categoria"
              rules={[{ required: true, message: "Selecione a categoria" }]}
            >
              <Select
                showSearch
                placeholder="Selecione a categoria"
                options={CATEGORY_NAMES.filter(
                  (c) => c !== "Investment (Troco Turbo)"
                ).map((c) => ({ label: c, value: c }))}
                onChange={(v) => {
                  setSelectedCategory(v);
                  form.setFieldValue("subcategory", undefined);
                }}
              />
            </Form.Item>
            <Form.Item
              name="subcategory"
              label="Subcategoria"
              rules={[{ required: true, message: "Informe a subcategoria" }]}
            >
              <Select
                showSearch
                placeholder="Selecione ou digite"
                options={subcategoryOptions}
                mode={undefined}
                allowClear
              />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item
              name="source"
              label="Fonte / Nome"
              rules={[{ required: true, message: "Informe a fonte da receita" }]}
            >
              <Input placeholder="Ex: MICHEL HERSZENHAUT" />
            </Form.Item>
            <Form.Item
              name="holder"
              label="Titular"
              rules={[{ required: true, message: "Selecione o titular" }]}
            >
              <Select
                options={[
                  { label: "Michel", value: "Michel" },
                  { label: "Carol", value: "Carol" },
                  { label: "Ambos", value: "Both" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label="Descricao"
              rules={[{ required: true, message: "Informe a descricao" }]}
            >
              <Input placeholder="Ex: Salary" />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
