import type { Settings } from './settings';

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

// 'estimate' = still being calculated (a lower bound so far).
// 'incomplete' = finished, but some folders inside could not be read (also a lower bound).
// 'cached' = a total saved by an earlier calculation (see savedAt); it may be out of date.
export type SizeState = 'complete' | 'estimate' | 'incomplete' | 'cached';

export interface SizeInfo {
    path: string;
    bytes: number;
    // Files and folders inside, at any depth.
    items: number;
    state: SizeState;
    savedAt?: number;
    // Some excluded folder inside was skipped, so the total leaves it out.
    excluded?: boolean;
}

export type SizeEvent =
    | { type: 'sizes'; sizes: SizeInfo[] }
    | { type: 'progress'; scanned: number; done: boolean }
    // The size worker stopped unexpectedly; the window should start the calculation again.
    | { type: 'restart' };

export type TransferMode = 'move' | 'copy';

// 'replace' sends the existing item to the Trash first; 'merge' is offered for folder onto folder.
export type ConflictChoice =
    'replace' | 'merge' | 'keepBoth' | 'skip' | 'cancel';

export interface ItemInfo {
    kind: NodeKind;
    size?: number;
    modified?: number;
}

export interface OpFailure {
    path: string;
    error: string;
}

export interface OpSummary {
    completed: number;
    skipped: number;
    failed: OpFailure[];
    cancelled: boolean;
    // Things the user should know, e.g. where a partial copy was left.
    notes: string[];
}

export type OpEvent =
    | {
          id: number;
          type: 'progress';
          done: number;
          // 0 when the total isn't known (moves within one drive are instant).
          total: number;
          bytesDone: number;
          bytesTotal: number;
          current: string;
      }
    | {
          id: number;
          type: 'conflict';
          source: string;
          target: string;
          incoming: ItemInfo;
          existing: ItemInfo;
          // The "existing" item is the very same item (copying into its own folder).
          same: boolean;
      }
    | { id: number; type: 'done'; summary: OpSummary };

export interface OpResult {
    path?: string;
    error?: string;
}

export type MenuEntry =
    | { id: string; label: string; enabled?: boolean; accelerator?: string }
    | { separator: true };

export interface SearchResult {
    path: string;
    name: string;
    kind: NodeKind;
    size?: number;
    modified?: number;
}

// Everything a search could not cover, so results never claim more than they checked.
export interface SearchCoverage {
    folders: number;
    unreadable: number;
    unreadableSamples: string[];
    // Folders skipped because they're on the excluded list in Settings.
    excluded: number;
    // Stopped at the result limit, or cancelled before it finished.
    limited: boolean;
    cancelled: boolean;
}

export type SearchEvent =
    | { id: number; type: 'results'; results: SearchResult[] }
    | { id: number; type: 'progress'; folders: number }
    | { id: number; type: 'done'; coverage: SearchCoverage };

export interface DrasilApi {
    platform: string;
    getSettings(): Promise<Settings>;
    setSettings(patch: Partial<Settings>): Promise<Settings>;
    cacheInfo(): Promise<{ files: number; bytes: number }>;
    clearCache(): Promise<void>;
    locations(): Promise<Location[]>;
    // `id` is picked by the caller so events can't arrive before it's known.
    list(path: string, id: number): Promise<void>;
    cancel(id: number): void;
    onListEvent(callback: (event: ListEvent) => void): () => void;
    // Starts calculating folder sizes under `root`, replacing any previous calculation.
    startSizes(root: string): Promise<void>;
    // Asks for size updates of these folders (they are calculated first).
    watchSizes(paths: string[]): void;
    onSizeEvent(callback: (event: SizeEvent) => void): () => void;
    // Open with the default app / show in the system file manager. Resolve to an error message, or ''.
    open(path: string): Promise<string>;
    reveal(path: string): Promise<string>;
    mkdir(parent: string, name: string): Promise<OpResult>;
    rename(path: string, name: string): Promise<OpResult>;
    trash(paths: string[]): Promise<OpSummary>;
    deletePermanently(paths: string[]): Promise<OpSummary>;
    // Progress, conflicts and the final summary arrive as OpEvents with this `id`.
    transfer(
        id: number,
        mode: TransferMode,
        sources: string[],
        dest: string
    ): Promise<void>;
    resolveConflict(id: number, choice: ConflictChoice, all: boolean): void;
    cancelOp(id: number): void;
    onOpEvent(callback: (event: OpEvent) => void): () => void;
    copyText(text: string): void;
    // Folders open in the tree; changes to them by other apps arrive through onFsChanged.
    watchFolders(paths: string[]): void;
    onFsChanged(callback: (paths: string[]) => void): () => void;
    logError(message: string): void;
    // Searches names under `root` (partial, case-insensitive). Starting a new search cancels the last one.
    search(id: number, root: string, query: string): Promise<void>;
    cancelSearch(id: number): void;
    onSearchEvent(callback: (event: SearchEvent) => void): () => void;
    // Shows a native context menu; resolves to the chosen entry's id, or null.
    popupMenu(
        entries: MenuEntry[],
        x: number,
        y: number
    ): Promise<string | null>;
}
