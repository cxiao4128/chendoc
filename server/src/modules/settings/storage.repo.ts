// Storage repository - R2 schema validation

import { z } from "zod";

export const r2ConfigSchema = z.object({
  accountId: z.string().trim().min(1),
  accessKeyId: z.string().trim().optional(),
  secretAccessKey: z.string().trim().optional(),
  bucket: z.string().trim().min(1),
  publicUrl: z.string().trim().url(),
  endpoint: z.string().trim().url().optional().or(z.literal("")),
  region: z.string().trim().default("auto")
});
