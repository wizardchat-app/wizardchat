const NATIVE_MENU_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), a[href]';

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

export function installContextMenuGuard(): void {
  if (import.meta.env.DEV) return;
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || e.shiftKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(NATIVE_MENU_TARGETS) || hasTextSelection()) return;
    e.preventDefault();
  });
}
