export type WorkerRequest =
  | {
      type: 'call';
      id: number;
      method: string;
      self: number | null;
      json: string;
      blobs: Uint8Array[];
    }
  | { type: 'release'; handle: number }
  | { type: 'cancel'; listener: number };

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'event'; listener: number; json: string }
  | { type: 'result'; id: number; json: string; blobs: Uint8Array[] }
  | { type: 'error'; id: number; error: unknown };
