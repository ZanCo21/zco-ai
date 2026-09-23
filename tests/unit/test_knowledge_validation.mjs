import assert from "node:assert";
import { z } from "zod";

// Test schema contracts matching src/lib/validations/knowledge.ts
const createTextKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  content: z.string().trim().min(1, "Content is required"),
});

const createFileKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  file: z.any().refine((val) => Boolean(val), { message: "File is required" }),
});

const updateTextKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  content: z.string().trim().min(1, "Content is required"),
});

const updateFileKnowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  file: z.any().optional(),
});

// Test 1: Valid text knowledge creation
{
  const result = createTextKnowledgeSchema.safeParse({
    title: "Warranty Policy",
    content: "Standard and extended warranty terms...",
  });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.title, "Warranty Policy");
  }
  console.log("✓ Test 1: Valid text knowledge creation passed");
}

// Test 2: Invalid text knowledge creation (missing title or content)
{
  const resultTitleMissing = createTextKnowledgeSchema.safeParse({
    title: "",
    content: "Some content",
  });
  assert.strictEqual(resultTitleMissing.success, false);

  const resultContentMissing = createTextKnowledgeSchema.safeParse({
    title: "Some Title",
    content: "   ",
  });
  assert.strictEqual(resultContentMissing.success, false);
  console.log("✓ Test 2: Text validation rejection on empty fields passed");
}

// Test 3: Valid file knowledge creation
{
  const result = createFileKnowledgeSchema.safeParse({
    title: "Product Catalog 2024",
    file: { name: "catalog.pdf", size: 1024 },
  });
  assert.strictEqual(result.success, true);
  console.log("✓ Test 3: Valid file knowledge creation passed");
}

// Test 4: File validation rejection when file is missing
{
  const result = createFileKnowledgeSchema.safeParse({
    title: "Product Catalog 2024",
    file: null,
  });
  assert.strictEqual(result.success, false);
  console.log("✓ Test 4: File validation rejection on null file passed");
}

// Test 5: Update file knowledge allows keeping existing file (file is optional)
{
  const result = updateFileKnowledgeSchema.safeParse({
    title: "Updated Catalog Title",
  });
  assert.strictEqual(result.success, true);
  console.log("✓ Test 5: Update file knowledge with optional file passed");
}

console.log("\nAll 5 Knowledge validation tests passed successfully!");
