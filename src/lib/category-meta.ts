export const CATEGORY_EMOJI: Record<string, string> = {
  Groceries: "\uD83D\uDED2",
  "Food/Dining": "\uD83C\uDF7D\uFE0F",
  Housing: "\uD83C\uDFE0",
  Transportation: "\uD83D\uDE97",
  Health: "\uD83C\uDFE5",
  Shopping: "\uD83D\uDECD\uFE0F",
  Travel: "\u2708\uFE0F",
  Wellness: "\uD83C\uDFCB\uFE0F",
  Services: "\uD83D\uDD27",
  Subscriptions: "\uD83D\uDCF1",
  Insurance: "\uD83D\uDEE1\uFE0F",
  "Personal Care": "\u2702\uFE0F",
  Recreation: "\uD83C\uDFAD",
  "Family Support": "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67",
  "Investment (Troco Turbo)": "\uD83D\uDCB0",
  Income: "\uD83D\uDCB5",
  Uncategorized: "\u2753",
  Skipped: "\u23ED\uFE0F",
};

export const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#52c41a",
  "Food/Dining": "#fa8c16",
  Housing: "#1677ff",
  Transportation: "#722ed1",
  Health: "#eb2f96",
  Shopping: "#f5222d",
  Travel: "#13c2c2",
  Wellness: "#87d068",
  Services: "#2f54eb",
  Subscriptions: "#9254de",
  Insurance: "#597ef7",
  "Personal Care": "#ff85c0",
  Recreation: "#faad14",
  "Family Support": "#36cfc9",
  "Investment (Troco Turbo)": "#389e0d",
  Income: "#52c41a",
  Uncategorized: "#bfbfbf",
  Skipped: "#8c8c8c",
};

export const HOLDER_COLORS: Record<string, string> = {
  michel: "blue",
  carol: "magenta",
};

export const TYPE_COLORS: Record<string, string> = {
  income: "green",
  expense: "red",
  unclassified: "orange",
  skipped: "default",
};

export function getCategoryMeta(category: string) {
  return {
    emoji: CATEGORY_EMOJI[category] || "\uD83D\uDCCC",
    color: CATEGORY_COLORS[category] || "#8c8c8c",
  };
}
