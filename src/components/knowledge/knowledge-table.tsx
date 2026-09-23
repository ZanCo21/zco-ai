"use client";

import React, { useState } from "react";
import { Plus, FileText, SquarePen, Trash2, Eye, BookOpen } from "lucide-react";
import { KnowledgeItem, UpdateKnowledgeModal } from "./update-knowledge-modal";
import { AddKnowledgeModal } from "./add-knowledge-modal";
import { DeleteKnowledgeModal } from "./delete-knowledge-modal";
import { ViewKnowledgeModal } from "./view-knowledge-modal";
import { cn } from "@/lib/utils";

interface KnowledgeTableProps {
  initialItems: KnowledgeItem[];
}

export function KnowledgeTable({ initialItems }: KnowledgeTableProps) {
  const [items, setItems] = useState<KnowledgeItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshItems = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to refresh items:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setEditModalOpen(true);
  };

  const handleDelete = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setDeleteModalOpen(true);
  };

  const handleView = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setViewModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/knowledge/${selectedItem.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
        setDeleteModalOpen(false);
        setSelectedItem(null);
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateValue: string | Date | number): string => {
    try {
      const d = new Date(dateValue);
      return d.toISOString().split("T")[0];
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Knowledge Base
          </h2>
          <p className="text-sm text-slate-400 font-medium mt-1">
            {items.length} {items.length === 1 ? "entry" : "entries"} in your
            knowledge base
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-all shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Knowledge</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table
            className={cn(
              "w-full text-left border-collapse transition-opacity",
              loading && "opacity-60"
            )}
          >
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  TITLE
                </th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  CONTENT
                </th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  TYPE
                </th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  CREATED
                </th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <p className="text-base font-medium text-slate-700">
                        No knowledge entries yet
                      </p>
                      <p className="text-sm text-slate-400 mt-1 max-w-sm">
                        Add text entries or upload documents to train your AI
                        assistant.
                      </p>
                      <button
                        type="button"
                        onClick={() => setAddModalOpen(true)}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add First Knowledge
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isFile = item.sourceType === "file";
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Title */}
                      <td className="py-4 px-6 font-medium text-slate-900 max-w-xs truncate">
                        {item.title}
                      </td>

                      {/* Content / Description */}
                      <td className="py-4 px-6 max-w-sm">
                        {isFile ? (
                          <div
                            onClick={() => handleView(item)}
                            className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline cursor-pointer font-normal truncate"
                          >
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="truncate">
                              {item.originalFilename || "document.pdf"}
                            </span>
                          </div>
                        ) : (
                          <p className="text-slate-500 truncate max-w-xs md:max-w-md">
                            {item.content}
                          </p>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            isFile
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-emerald-50 text-emerald-600"
                          )}
                        >
                          {isFile ? "File" : "Text"}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-6 whitespace-nowrap text-slate-500">
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleView(item)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 flex items-center justify-center transition-colors"
                            title="View knowledge details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center transition-colors"
                            title="Edit knowledge"
                          >
                            <SquarePen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition-colors"
                            title="Delete knowledge"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AddKnowledgeModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSuccess={refreshItems}
      />

      <UpdateKnowledgeModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        item={selectedItem}
        onSuccess={refreshItems}
      />

      <DeleteKnowledgeModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        knowledgeTitle={selectedItem?.title || ""}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />

      <ViewKnowledgeModal
        open={viewModalOpen}
        onOpenChange={setViewModalOpen}
        item={selectedItem}
      />
    </div>
  );
}
