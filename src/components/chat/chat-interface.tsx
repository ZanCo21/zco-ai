"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, SendHorizonal, FileText, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedQuestion {
  question: string;
  knowledgeId: string;
  title: string | null;
}

interface ChatSource {
  knowledgeId: string;
  chunkId: string;
  title: string;
  ref?: number;
  filename?: string | null;
  similarity: number;
}

interface ChatMessage {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: string;
  sources?: ChatSource[];
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    sender: "ai",
    text: "Hello! I'm your AI assistant. How can I help you today?",
    timestamp: "09:00",
  },
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedQuestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageSeq = useRef(0);
  const nextMessageId = (prefix: string) => `${prefix}-${++messageSeq.current}`;

  // Questions generated from the knowledge base and pre-checked against the
  // retrieval gate (worker /suggest). A new seed gives a different selection.
  const fetchSuggestions = useCallback(() => {
    const seed = Math.floor(Math.random() * 1_000_000);
    fetch(`/api/suggestions?limit=3&seed=${seed}`)
      .then((res) => res.json())
      .then((data) => setSuggestions(Array.isArray(data.questions) ? data.questions : []))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

  const loadSuggestions = () => {
    setSuggestionsLoading(true);
    fetchSuggestions();
  };

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const getCurrentTime = (): string => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleSend = async (e?: React.FormEvent, text?: string) => {
    if (e) e.preventDefault();
    const query = (text ?? input).trim();
    if (!query || isLoading) return;
    setSuggestions((prev) => prev.filter((s) => s.question !== query));

    const userMessage: ChatMessage = {
      id: nextMessageId("user"),
      sender: "user",
      text: query,
      timestamp: getCurrentTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response from AI");
      }

      const data = await res.json();

      const aiMessage: ChatMessage = {
        id: nextMessageId("ai"),
        sender: "ai",
        text: data.answer || "Maaf, terjadi kesalahan dalam menghasilkan jawaban.",
        timestamp: getCurrentTime(),
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: nextMessageId("ai-err"),
        sender: "ai",
        text: "Maaf, koneksi ke service AI sedang tidak tersedia. Pastikan backend dan Ollama berjalan.",
        timestamp: getCurrentTime(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] md:h-screen bg-white">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5 fill-white/20" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              AI Assistant
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">
                Online
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg) => {
            const isAI = msg.sender === "ai";

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-3 w-full",
                  isAI ? "justify-start" : "justify-end"
                )}
              >
                {/* AI Avatar */}
                {isAI && (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Sparkles className="w-4 h-4 fill-white/20" />
                  </div>
                )}

                {/* Message Bubble + Timestamp */}
                <div
                  className={cn(
                    "flex flex-col",
                    isAI ? "items-start" : "items-end"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl p-4 text-sm leading-relaxed max-w-xl",
                      isAI
                        ? "bg-white border border-slate-200/90 text-slate-800 shadow-2xs"
                        : "bg-indigo-600 text-white shadow-xs"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* Source Attribution */}
                    {isAI && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block w-full mb-1">
                          Sources:
                        </span>
                        {msg.sources.map((src, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs"
                          >
                            <FileText className="w-3 h-3 text-slate-400" />
                            <span title={src.filename ?? src.title}>
                              {src.ref ? `[${src.ref}] ` : ""}
                              {src.title}
                            </span>
                            <span className="text-indigo-600 font-medium">
                              ({(src.similarity * 100).toFixed(0)}%)
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span
                    className={cn(
                      "text-[11px] text-slate-400 mt-1",
                      isAI ? "ml-1" : "mr-1 text-right"
                    )}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {/* User Avatar */}
                {!isAI && (
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-semibold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    U
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-start gap-3 w-full justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 fill-white/20" />
              </div>
              <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-3.5 shadow-2xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom Input Area */}
      <div className="p-4 md:px-8 border-t border-slate-100 bg-white shrink-0">
        <form
          onSubmit={handleSend}
          className="max-w-4xl mx-auto"
        >
          {(suggestionsLoading || suggestions.length > 0) && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1" aria-label="Suggested questions">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
                Suggested
              </span>
              {suggestionsLoading
                ? [0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-7 w-44 shrink-0 rounded-full bg-slate-100 animate-pulse"
                      aria-hidden
                    />
                  ))
                : suggestions.map((s) => (
                    <button
                      key={s.question}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSend(undefined, s.question)}
                      title={s.title ? `From: ${s.title}` : undefined}
                      className="shrink-0 max-w-xs truncate px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {s.question}
                    </button>
                  ))}
              {!suggestionsLoading && (
                <button
                  type="button"
                  onClick={loadSuggestions}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  aria-label="Show other suggestions"
                  title="Show other suggestions"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="border border-slate-200 bg-white rounded-2xl p-1.5 pl-5 flex items-center gap-3 shadow-xs focus-within:border-indigo-600 focus-within:ring-1 focus-within:ring-indigo-600 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message... (Enter to send)"
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-800 placeholder:text-slate-400 py-2.5"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer",
                input.trim() && !isLoading
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
                  : "bg-slate-100 text-slate-400 hover:text-slate-600 cursor-not-allowed"
              )}
              aria-label="Send message"
            >
              <SendHorizonal className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2 font-normal">
            Responses are generated by AI and may not always be accurate.
          </p>
        </form>
      </div>
    </div>
  );
}
