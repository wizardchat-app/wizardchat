import { getCachedBlobUrl, setCachedBlobUrl } from './mediaCache';

export type MediaPriority = 'high' | 'low';

interface Task {
  key: string;
  fetchBlob: () => Promise<Blob>;
  priority: MediaPriority;
  waiters: number;
  started: boolean;
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
}

const MAX_CONCURRENT = 6;
const tasks = new Map<string, Task>();
const pending: Task[] = [];
let active = 0;

function abortError(): Error {
  return new DOMException('Media load cancelled', 'AbortError');
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function takeNext(): Task | undefined {
  const index = pending.findIndex((task) => task.priority === 'high');
  return pending.splice(index === -1 ? 0 : index, 1)[0];
}

function pump(): void {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const task = takeNext();
    if (!task) return;
    task.started = true;
    active++;
    task
      .fetchBlob()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setCachedBlobUrl(task.key, url, blob.type, blob.size);
        task.resolve(url);
      }, task.reject)
      .finally(() => {
        active--;
        tasks.delete(task.key);
        pump();
      });
  }
}

function release(task: Task): void {
  task.waiters--;
  if (task.waiters > 0 || task.started) return;
  const index = pending.indexOf(task);
  if (index !== -1) pending.splice(index, 1);
  tasks.delete(task.key);
  task.reject(abortError());
}

// Loads timeline media into a cached blob URL with bounded concurrency; requests for the same
// key share one download, and a request whose callers all went away before it started is dropped
export function loadMediaUrl(
  key: string,
  fetchBlob: () => Promise<Blob>,
  options: { priority?: MediaPriority; signal?: AbortSignal } = {}
): Promise<string> {
  const { priority = 'low', signal } = options;
  const cached = getCachedBlobUrl(key);
  if (cached) return Promise.resolve(cached);
  if (signal?.aborted) return Promise.reject(abortError());

  let task = tasks.get(key);
  if (task) {
    task.waiters++;
    if (priority === 'high') task.priority = 'high';
  } else {
    let resolve!: (url: string) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    task = { key, fetchBlob, priority, waiters: 1, started: false, promise, resolve, reject };
    tasks.set(key, task);
    pending.push(task);
  }

  const current = task;
  if (signal) signal.addEventListener('abort', () => release(current), { once: true });
  else current.waiters = Number.POSITIVE_INFINITY;
  pump();
  return current.promise;
}
