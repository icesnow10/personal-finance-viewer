import React from "react";
import { Empty, Button } from "antd";
import { Upload } from "lucide-react";
import { useRouter } from "next/router";

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({
  message = "Importe um arquivo de budget JSON para visualizar os dados",
}: EmptyStateProps) {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: 400,
      }}
    >
      <Empty description={message}>
        <Button
          type="primary"
          icon={<Upload size={14} />}
          onClick={() => router.push("/")}
        >
          Importar Dados
        </Button>
      </Empty>
    </div>
  );
}
