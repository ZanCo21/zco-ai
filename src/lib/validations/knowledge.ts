import { z } from "zod";

export const createTextKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  content: z.string().trim().min(1, "Content is required"),
});

export const createFileKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  file: z.custom<File>(
    (val) => {
      if (typeof window === "undefined") return Boolean(val);
      return val instanceof File;
    },
    { message: "File is required" }
  ),
});

export const updateTextKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  content: z.string().trim().min(1, "Content is required"),
});

export const updateFileKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  file: z
    .custom<File | null | undefined>(
      (val) => {
        if (!val) return true;
        if (typeof window === "undefined") return true;
        return val instanceof File;
      },
      { message: "Invalid file" }
    )
    .optional(),
});

export type CreateTextKnowledgeInput = z.infer<typeof createTextKnowledgeSchema>;
export type CreateFileKnowledgeInput = z.infer<typeof createFileKnowledgeSchema>;
export type UpdateTextKnowledgeInput = z.infer<typeof updateTextKnowledgeSchema>;
export type UpdateFileKnowledgeInput = z.infer<typeof updateFileKnowledgeSchema>;
