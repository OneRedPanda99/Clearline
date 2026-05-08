"use client";

import { motion } from "framer-motion";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <motion.div
          className="h-8 w-8 rounded-full border-2 border-line border-t-brand"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
        />
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">{label}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "animate-pulse rounded-xl bg-gradient-to-r from-surface to-surface-raised " + className
      }
    />
  );
}
