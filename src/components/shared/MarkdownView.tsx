import React from "react";
import { Typography, theme } from "antd";

const { Title, Text, Paragraph } = Typography;

/**
 * Minimal Markdown renderer for the attribution / missing_information reports.
 * Supports: headings (h1-h4), paragraphs, bold (**text**), italics (*text*),
 * inline code (`code`), unordered lists, tables (GFM), horizontal rules, blockquotes.
 * No external dependencies.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; headers: string[]; aligns: ("left" | "right" | "center")[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; text: string };

function inlineFormat(raw: string, token: ReturnType<typeof theme.useToken>["token"]): React.ReactNode {
  // Escape: process bold, italics, code, emoji pass-through
  const parts: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) parts.push(buf);
    buf = "";
  };
  while (i < raw.length) {
    if (raw[i] === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        parts.push(
          <code
            key={parts.length}
            style={{
              background: token.colorFillQuaternary,
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: "0.9em",
              fontFamily: "SFMono-Regular, Consolas, monospace",
            }}
          >
            {raw.slice(i + 1, end)}
          </code>
        );
        i = end + 1;
        continue;
      }
    }
    if (raw[i] === "*" && raw[i + 1] === "*") {
      const end = raw.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        parts.push(
          <strong key={parts.length}>{inlineFormat(raw.slice(i + 2, end), token)}</strong>
        );
        i = end + 2;
        continue;
      }
    }
    if (raw[i] === "*") {
      const end = raw.indexOf("*", i + 1);
      if (end !== -1) {
        flush();
        parts.push(<em key={parts.length}>{raw.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += raw[i];
    i++;
  }
  flush();
  return parts;
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }
    // code fence
    if (/^```/.test(line)) {
      const fenceEnd = lines.slice(i + 1).findIndex((l) => /^```/.test(l));
      const end = fenceEnd === -1 ? lines.length : i + 1 + fenceEnd;
      blocks.push({ kind: "code", text: lines.slice(i + 1, end).join("\n") });
      i = end + 1;
      continue;
    }
    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const chunk: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        chunk.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "blockquote", text: chunk.join(" ") });
      continue;
    }
    // table
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const headers = line.split("|").slice(1, -1).map((s) => s.trim());
      const alignLine = lines[i + 1].split("|").slice(1, -1).map((s) => s.trim());
      const aligns: ("left" | "right" | "center")[] = alignLine.map((a) => {
        if (/^:-+:$/.test(a)) return "center";
        if (/^-+:$/.test(a)) return "right";
        return "left";
      });
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((s) => s.trim()));
        i++;
      }
      blocks.push({ kind: "table", headers, aligns, rows });
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    // paragraph (join consecutive lines)
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\|.*\|\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: para.join(" ") });
  }
  return blocks;
}

export function MarkdownView({ source }: { source: string }) {
  const { token } = theme.useToken();
  const blocks = React.useMemo(() => parse(source), [source]);

  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: token.colorText }}>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "heading": {
            const level = Math.min(5, b.level) as 1 | 2 | 3 | 4 | 5;
            return (
              <Title key={idx} level={level} style={{ marginTop: level === 1 ? 0 : 20, marginBottom: 12 }}>
                {inlineFormat(b.text, token)}
              </Title>
            );
          }
          case "paragraph":
            return (
              <Paragraph key={idx} style={{ marginBottom: 12 }}>
                {inlineFormat(b.text, token)}
              </Paragraph>
            );
          case "list":
            return (
              <ul key={idx} style={{ marginBottom: 12, paddingLeft: 24 }}>
                {b.items.map((it, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {inlineFormat(it, token)}
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={idx} style={{ overflowX: "auto", marginBottom: 16 }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      {b.headers.map((h, i) => (
                        <th
                          key={i}
                          style={{
                            textAlign: b.aligns[i] ?? "left",
                            padding: "8px 12px",
                            borderBottom: `2px solid ${token.colorBorderSecondary}`,
                            background: token.colorFillQuaternary,
                            fontWeight: 600,
                          }}
                        >
                          {inlineFormat(h, token)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            style={{
                              textAlign: b.aligns[c] ?? "left",
                              padding: "6px 12px",
                              borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                          >
                            {inlineFormat(cell, token)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={idx} style={{ border: 0, borderTop: `1px solid ${token.colorBorderSecondary}`, margin: "20px 0" }} />;
          case "blockquote":
            return (
              <div
                key={idx}
                style={{
                  borderLeft: `3px solid ${token.colorPrimary}`,
                  padding: "8px 14px",
                  marginBottom: 12,
                  background: token.colorFillQuaternary,
                  color: token.colorTextSecondary,
                }}
              >
                {inlineFormat(b.text, token)}
              </div>
            );
          case "code":
            return (
              <pre
                key={idx}
                style={{
                  background: token.colorFillQuaternary,
                  padding: 12,
                  borderRadius: 6,
                  overflow: "auto",
                  fontSize: 12,
                  fontFamily: "SFMono-Regular, Consolas, monospace",
                  marginBottom: 12,
                }}
              >
                {b.text}
              </pre>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
