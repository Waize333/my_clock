"use client";
import { useEffect } from "react";
export function useUnsavedChanges(
  dirty: boolean,
  busy: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return () => {
    if (busy) return;
    if (!dirty || window.confirm("Discard your unsaved changes?")) close();
  };
}
