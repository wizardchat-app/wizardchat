import initWasm, { Core } from '@wizardchat/core-wasm';
import type { WorkerReply, WorkerRequest } from './workerProtocol';

const scope = self as unknown as {
  postMessage(message: WorkerReply, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const reply = (message: WorkerReply, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);

// Results are moved, not copied; only buffers a view fully owns can be moved
function ownBuffers(blobs: Uint8Array[]): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const blob of blobs) {
    const { buffer } = blob;
    if (
      buffer instanceof ArrayBuffer &&
      blob.byteOffset === 0 &&
      blob.byteLength === buffer.byteLength
    ) {
      buffers.add(buffer);
    }
  }
  return [...buffers];
}

const ready = initWasm().then(
  () => new Core((listener, json) => reply({ type: 'event', listener, json }))
);

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  const core = await ready;
  switch (message.type) {
    case 'call':
      try {
        const [json, ...blobs] = await core.call(
          message.method,
          message.self ?? undefined,
          message.json,
          message.blobs
        );
        reply({ type: 'result', id: message.id, json, blobs }, ownBuffers(blobs));
      } catch (error) {
        reply({ type: 'error', id: message.id, error });
      }
      break;
    case 'release':
      core.release(message.handle);
      break;
    case 'cancel':
      core.cancel(message.listener);
      break;
  }
};

ready.then(
  () => reply({ type: 'ready' }),
  (error) => reply({ type: 'failed', error: String(error) })
);
