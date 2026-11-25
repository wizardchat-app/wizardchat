export type ScrollInfo = {
  offsetTop: number;
  top: number;
  height: number;
  viewHeight: number;
  scrollable: boolean;
};

export const getScrollInfo = (target: HTMLElement): ScrollInfo => ({
  offsetTop: Math.round(target.offsetTop),
  top: Math.round(target.scrollTop),
  height: Math.round(target.scrollHeight),
  viewHeight: Math.round(target.offsetHeight),
  scrollable: target.scrollHeight > target.offsetHeight,
});

export const scrollToBottom = (scrollEl: HTMLElement, behavior?: 'auto' | 'instant' | 'smooth') => {
  scrollEl.scrollTo({
    top: Math.round(scrollEl.scrollHeight - scrollEl.offsetHeight),
    behavior,
  });
};

export const isIntersectingScrollView = (
  scrollElement: HTMLElement,
  childElement: HTMLElement
): boolean => {
  const scrollTop = scrollElement.offsetTop + scrollElement.scrollTop;
  const scrollBottom = scrollTop + scrollElement.offsetHeight;

  const childTop = childElement.offsetTop;
  const childBottom = childTop + childElement.clientHeight;

  if (childTop >= scrollTop && childTop < scrollBottom) return true;
  if (childBottom > scrollTop && childBottom <= scrollBottom) return true;
  if (childTop < scrollTop && childBottom > scrollBottom) return true;
  return false;
};

export const isInScrollView = (scrollElement: HTMLElement, childElement: HTMLElement): boolean => {
  const scrollTop = scrollElement.offsetTop + scrollElement.scrollTop;
  const scrollBottom = scrollTop + scrollElement.offsetHeight;
  return (
    childElement.offsetTop >= scrollTop &&
    childElement.offsetTop + childElement.offsetHeight <= scrollBottom
  );
};

export const canFitInScrollView = (
  scrollElement: HTMLElement,
  childElement: HTMLElement
): boolean => childElement.offsetHeight < scrollElement.offsetHeight;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
