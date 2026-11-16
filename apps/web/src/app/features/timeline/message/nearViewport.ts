import { useEffect, useState, type RefObject } from 'react';

const ROOT_MARGIN = '1000px 0px';

type Listener = () => void;

const listeners = new WeakMap<Element, Listener>();
const observers = new WeakMap<Element, IntersectionObserver>();
let viewportObserver: IntersectionObserver | null = null;

function handleEntries(entries: IntersectionObserverEntry[], observer: IntersectionObserver) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    const listener = listeners.get(entry.target);
    listeners.delete(entry.target);
    listener?.();
  }
}

// rootMargin only extends the root's box: with the viewport as root, media inside a scrolled
// container would be clipped by it and never count as near
function scrollParent(el: Element): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
  }
  return null;
}

function observerFor(root: Element | null): IntersectionObserver {
  if (!root) {
    viewportObserver ??= new IntersectionObserver(handleEntries, { rootMargin: ROOT_MARGIN });
    return viewportObserver;
  }
  let observer = observers.get(root);
  if (!observer) {
    observer = new IntersectionObserver(handleEntries, { root, rootMargin: ROOT_MARGIN });
    observers.set(root, observer);
  }
  return observer;
}

function observeNear(el: Element, listener: Listener): () => void {
  const observer = observerFor(scrollParent(el));
  listeners.set(el, listener);
  observer.observe(el);
  return () => {
    listeners.delete(el);
    observer.unobserve(el);
  };
}

export function isInViewport(el: Element | null | undefined): boolean {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

// Latches to true once the element came within the margin of its scroll container, so media
// already loaded stays loaded
export function useNearViewport(
  ref: RefObject<Element | null> | undefined,
  active: boolean
): boolean {
  const [near, setNear] = useState(!ref || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near || !active || !ref) return;
    const el = ref.current;
    if (!el) {
      setNear(true);
      return;
    }
    return observeNear(el, () => setNear(true));
  }, [ref, near, active]);

  return near;
}
