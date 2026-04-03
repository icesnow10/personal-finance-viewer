import React from "react";
import { Typography } from "antd";

const { Title } = Typography;

interface SectionHeaderProps {
  title: string;
  children?: React.ReactNode;
  level?: 4 | 5;
}

export function SectionHeader({ title, children, level = 5 }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <Title level={level} style={{ margin: 0, textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 }}>
        {title}
      </Title>
      {children && <div>{children}</div>}
    </div>
  );
}
