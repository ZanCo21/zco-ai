/**
 * Ollama LLM integration
 * Calls local Ollama instance for text generation
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

export const NOT_FOUND_ANSWER =
  "Informasi yang diminta tidak ditemukan dalam knowledge base.";

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
      options: {
        // Factual extraction, not creative writing: keep sampling tight.
        temperature: 0.1,
        top_p: 0.9,
        // Ollama's default context window (4096) silently truncates the
        // *start* of long prompts, i.e. the instructions. Be explicit.
        num_ctx: 8192,
      },
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

export interface PromptSource {
  title: string;
  content: string;
}

/**
 * Build the RAG prompt. Context passages are numbered with their source title
 * so the model can attribute facts. The question is stated before AND after
 * the context, and the rules tell the model to read every passage: small local
 * models otherwise anchor on the first passage and answer "not found" even when
 * the answering passage is third (measured on gemma3:4b).
 */
export function buildRAGPrompt(query: string, sources: PromptSource[]): string {
  const context = sources
    .map((s, i) => `[${i + 1}] Sumber: ${s.title}\n${s.content}`)
    .join("\n\n---\n\n");
  const last = sources.length;

  return `Anda adalah asisten knowledge base. Jawab pertanyaan HANYA berdasarkan potongan KONTEKS di bawah.

PERTANYAAN: ${query}

KONTEKS (potongan dokumen hasil pencarian; potongan yang menjawab TIDAK selalu yang pertama):
${context}

ATURAN:
1. Baca SEMUA potongan [1] sampai [${last}] sebelum menjawab. Gunakan potongan mana pun yang membahas pertanyaan, walaupun potongan lain tidak relevan.
2. Gunakan hanya fakta yang tertulis dalam KONTEKS. Jangan menambah pengetahuan dari luar, jangan menebak. Salin angka, rumus, batas, dan istilah persis seperti di KONTEKS.
3. Potongan dapat berupa baris tabel berformat "Kolom: nilai | Kolom: nilai"; baris yang menyebut istilah pada pertanyaan adalah penjelasan istilah itu.
4. Jawab langsung dan ringkas dalam bahasa yang sama dengan pertanyaan (gunakan poin untuk daftar) dan sebutkan nomor potongan yang dipakai, misalnya [2].
5. Jika KONTEKS hanya menjawab sebagian, jawab bagian yang ada dan katakan bagian lainnya tidak ditemukan.
6. Hanya jika TIDAK ADA satu pun potongan yang membahas pertanyaan, jawab persis: "${NOT_FOUND_ANSWER}"
7. Jangan menjelaskan proses retrieval, TF-IDF, atau sistem internal.

PERTANYAAN: ${query}

JAWABAN:`;
}
