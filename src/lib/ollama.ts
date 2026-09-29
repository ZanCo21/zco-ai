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

export function buildRAGPrompt(
  query: string,
  context: string
): string {
  return `Anda adalah komponen penyusun jawaban dalam sistem knowledge base.

Tugas Anda HANYA menyusun jawaban berdasarkan informasi yang diberikan pada KONTEKS.

KONTEKS:
${context}

PERTANYAAN:
${query}

ATURAN:
1. Gunakan hanya informasi yang terdapat dalam KONTEKS.
2. Jangan mencari, menebak, atau menambahkan fakta dari pengetahuan Anda sendiri.
3. Jangan mengubah makna atau fakta dari KONTEKS.
4. Anda boleh menyusun ulang kalimat agar lebih natural, jelas, dan mudah dipahami.
5. Jika pertanyaan dapat dijawab berdasarkan KONTEKS, jawab secara langsung dan ringkas.
6. Jika informasi yang dibutuhkan tidak terdapat dalam KONTEKS, jawab:
   "Informasi yang diminta tidak ditemukan dalam knowledge base."
7. Jangan menjelaskan proses retrieval, TF-IDF, cosine similarity, atau sistem internal.

JAWABAN:`;
}