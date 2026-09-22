/**
 * Ollama LLM integration
 * Calls local Ollama instance for text generation
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
}

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

export async function generateWithOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama generate failed: ${res.statusText}`);
  }

  const data: OllamaGenerateResponse = await res.json();
  return data.response;
}

export async function ollamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export function buildRAGPrompt(query: string, context: string): string {
  return `Berdasarkan konteks berikut, jawab pertanyaan dengan akurat dan faktual:

Konteks:
${context}

Pertanyaan: ${query}

Petunjuk:
- Jawab hanya berdasarkan konteks yang diberikan
- Jika informasi tidak ada dalam konteks, katakan "Informasi tidak ditemukan dalam knowledge base"
- Jangan mengarang atau menambahkan informasi di luar konteks
- Berikan jawaban yang jelas dan ringkas

Jawaban:`;
}
