export type NodeKind = 'directory' | 'file' | 'other';

// Directories start 'unscanned'. Files are always 'scanned' unless they can't be read.
export type NodeState =
    | 'unscanned'
    | 'loading'
    | 'partial'
    | 'scanned'
    | 'empty'
    | 'inaccessible'
    | 'unavailable'
    | 'error';

export interface FsNode {
    path: string;
    name: string;
    kind: NodeKind;
    state: NodeState;
    hidden: boolean;
    size?: number;
    modified?: number;
    // Set for symlinks and Windows junctions. `loop` means it points at its own folder or an ancestor.
    link?: { target: string; loop: boolean };
    error?: string;
}

// Final state of one directory listing. 'partial' means it was cancelled or failed midway.
export type ListState =
    'scanned' | 'empty' | 'partial' | 'inaccessible' | 'unavailable' | 'error';

export type ListEvent =
    | { id: number; type: 'batch'; nodes: FsNode[] }
    | {
          id: number;
          type: 'done';
          state: ListState;
          count: number;
          error?: string;
      };

export interface Location {
    path: string;
    name: string;
    kind: 'drive' | 'place';
}

export interface DrasilApi {
    locations(): Promise<Location[]>;
    // `id` is picked by the caller so events can't arrive before it's known.
    list(path: string, id: number): Promise<void>;
    cancel(id: number): void;
    onListEvent(callback: (event: ListEvent) => void): () => void;
}
