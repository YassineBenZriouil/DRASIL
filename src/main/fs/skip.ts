// Virtual or duplicate filesystems that whole-tree walks (sizes, search) never enter:
// they have no real files on disk, or would show the same files twice.
const SKIP: Record<string, string[]> = {
    linux: ['/proc', '/sys', '/dev', '/run'],
    darwin: ['/dev', '/System/Volumes', '/Volumes'],
};

export const skip = new Set(SKIP[process.platform] ?? []);
