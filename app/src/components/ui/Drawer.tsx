"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: "md" | "lg";
}

export function Drawer({ open, onClose, title, children, width = "md" }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className={
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-ink shadow-2xl " +
              (width === "lg" ? "sm:max-w-2xl" : "sm:max-w-md")
            }
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <p className="text-base font-semibold tracking-tight">{title}</p>
              <button onClick={onClose} className="rounded-lg px-2 py-1 text-text-dim hover:bg-surface-hover" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
