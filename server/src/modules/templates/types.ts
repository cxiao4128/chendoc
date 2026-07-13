export interface Template {
  id: number;
  templateUid: string;
  title: string;
  summary?: string;
  html: string;
  contentJson?: string;
  sort: number;
  isBuiltIn: boolean;
  ownerId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  title: string;
  summary?: string;
  html: string;
  contentJson?: string;
  sort?: number;
}

export interface UpdateTemplateInput {
  title?: string;
  summary?: string;
  html?: string;
  contentJson?: string;
  sort?: number;
}
