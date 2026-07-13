export interface ToolbarColorOption {
  name: string;
  value: string;
}

export const TEXT_COLORS: ToolbarColorOption[] = [
  { name: "默认", value: "" },
  { name: "黑色", value: "#000000" },
  { name: "深灰", value: "#374151" },
  { name: "红色", value: "#dc2626" },
  { name: "橙色", value: "#ea580c" },
  { name: "黄色", value: "#ca8a04" },
  { name: "绿色", value: "#16a34a" },
  { name: "青色", value: "#0891b2" },
  { name: "蓝色", value: "#2563eb" },
  { name: "紫色", value: "#9333ea" },
  { name: "粉色", value: "#db2777" }
];

export const HIGHLIGHT_COLORS: ToolbarColorOption[] = [
  { name: "无", value: "" },
  { name: "黄色", value: "#fef08a" },
  { name: "橙色", value: "#fed7aa" },
  { name: "绿色", value: "#bbf7d0" },
  { name: "青色", value: "#a5f3fc" },
  { name: "蓝色", value: "#bfdbfe" },
  { name: "紫色", value: "#e9d5ff" },
  { name: "粉色", value: "#fbcfe8" },
  { name: "红色", value: "#fecaca" },
  { name: "灰色", value: "#e5e7eb" }
];
