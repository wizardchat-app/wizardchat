/** `@wizardchat/core` on the web: the core compiled to wasm, in a worker so its crypto, storage
 * and sync don't block the page */
import { dispatchEvent, ensure, setTransport } from './runtime';
import type { WorkerReply, WorkerRequest } from './workerProtocol';

export * from './api.gen';

setTransport(
  () =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
      const pending = new Map<
        number,
        {
          resolve: (value: { json: string; blobs: Uint8Array[] }) => void;
          reject: (e: unknown) => void;
        }
      >();
      let nextId = 1;
      const post = (message: WorkerRequest) => worker.postMessage(message);

      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const message = event.data;
        switch (message.type) {
          case 'ready':
            resolve({
              call(method, self, args) {
                const id = nextId++;
                return new Promise((res, rej) => {
                  pending.set(id, { resolve: res, reject: rej });
                  post({ type: 'call', id, method, self, json: args.json, blobs: args.blobs });
                });
              },
              release: (handle) => post({ type: 'release', handle }),
              cancel: (listener) => post({ type: 'cancel', listener }),
            });
            break;
          case 'failed':
            reject(new Error(message.error));
            break;
          case 'event':
            dispatchEvent(message.listener, message.json);
            break;
          case 'result':
            pending.get(message.id)?.resolve({ json: message.json, blobs: message.blobs });
            pending.delete(message.id);
            break;
          case 'error':
            pending.get(message.id)?.reject(message.error);
            pending.delete(message.id);
            break;
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || 'core worker failed'));
    })
);

/** Loads the core; every call also waits for it */
export default function init(): Promise<void> {
  return ensure();
}
