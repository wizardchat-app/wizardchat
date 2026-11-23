import { useCallback, useRef, useState } from 'react';

function hasFiles(e: React.DragEvent | DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const depthRef = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (++depthRef.current === 1) setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setIsDragging(false);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  return { isDragging, dropProps: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}

// Files dropped outside a drop zone would otherwise replace the app with the file
export function installFileDropGuard(): void {
  const guard = (e: DragEvent) => {
    if (e.defaultPrevented || !hasFiles(e)) return;
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  window.addEventListener('dragover', guard);
  window.addEventListener('drop', guard);
}
