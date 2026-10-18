"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="app-dialog" aria-labelledby={titleId} onCancel={onClose} onClose={onClose}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-content">
      <div className="flex items-start justify-between gap-4"><h2 id={titleId} className="text-2xl font-extrabold tracking-tight">{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>
      {children}
    </div>
  </dialog>;
}
