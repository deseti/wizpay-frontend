"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/50 animate-slide-up pb-safe",
          className
        )}
      >
        {/* Handle bar */}
        <div className="sticky top-0 z-10 flex items-center justify-center pt-3 pb-2 bg-card/95 backdrop-blur-2xl">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {title && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-border/30">
            <h3 className="text-lg font-bold tracking-tight">{title}</h3>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
