"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface DeleteKnowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeTitle: string;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
}

export function DeleteKnowledgeModal({
  open,
  onOpenChange,
  knowledgeTitle,
  onConfirm,
  isDeleting = false,
}: DeleteKnowledgeModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md rounded-2xl p-6 bg-white border border-slate-200">
        <AlertDialogHeader className="flex flex-col items-center sm:items-start text-center sm:text-left gap-0">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
            <Trash2 className="w-5 h-5" />
          </div>
          <AlertDialogTitle className="text-lg font-bold text-slate-900">
            Delete Knowledge
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-500 mt-2 leading-normal">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-slate-800">
              &quot;{knowledgeTitle}&quot;
            </span>
            ? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-6 flex flex-row justify-end gap-3 border-0 bg-transparent p-0">
          <AlertDialogCancel
            disabled={isDeleting}
            className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-medium px-5 py-2.5 h-auto text-sm"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
            }}
            className="rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium px-5 py-2.5 h-auto text-sm transition-colors"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
