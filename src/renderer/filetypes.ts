export type FileCategory =
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'archive'
    | 'code'
    | 'app'
    | 'other';

const EXTENSIONS: Record<Exclude<FileCategory, 'other'>, string> = {
    image: 'png jpg jpeg gif webp svg bmp tif tiff heic avif ico raw',
    video: 'mp4 mkv mov avi webm wmv m4v',
    audio: 'mp3 wav flac aac ogg m4a opus wma',
    document: 'pdf doc docx txt md rtf odt xls xlsx ppt pptx csv epub',
    archive: 'zip rar 7z tar gz bz2 xz zst iso dmg',
    code: 'js ts tsx jsx py c cpp h hpp cs rs go java kt rb php json yml yaml toml html css sh ps1 bat',
    app: 'exe msi app apk deb rpm appimage dll so dylib',
};

const BY_EXT = new Map<string, FileCategory>();
for (const [cat, exts] of Object.entries(EXTENSIONS))
    for (const ext of exts.split(' ')) BY_EXT.set(ext, cat as FileCategory);

export const CATEGORY_COLOR: Record<FileCategory, string> = {
    image: '#c792ea',
    video: '#f78c6c',
    audio: '#ffcb6b',
    document: '#82aaff',
    archive: '#d4a373',
    code: '#89ddff',
    app: '#ff5370',
    other: '#9aa7a1',
};

export const CATEGORY_NAME: Record<FileCategory, string> = {
    image: 'image',
    video: 'video',
    audio: 'audio file',
    document: 'document',
    archive: 'archive',
    code: 'code file',
    app: 'program',
    other: 'file',
};

export function extension(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function fileCategory(name: string): FileCategory {
    return BY_EXT.get(extension(name)) ?? 'other';
}
