import type { Component } from "vue";
import type { FieldType } from "./types";

export type FormEditorTab = "edit" | "stats" | "settings";
export type FormStatus = "draft" | "published" | "closed";

export type FieldCategory = {
  title: string;
  items: Array<{ type: FieldType; name: string; desc: string; icon: Component; color: string; tag?: string }>;
};

export type FieldCategories = Record<string, FieldCategory>;

export type FormEditorStats = {
  submissionCount: number;
  viewCount: number;
  ipCount: number;
  sampleCount: number;
  fieldStats: Array<{ fieldId: string; label: string; count: number; percentage: number }>;
};
