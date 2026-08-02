import fs from 'fs';
import path from 'path';

export const START_MARKER = '<!-- AMATLAS:PROGRESS:START -->';
export const END_MARKER = '<!-- AMATLAS:PROGRESS:END -->';
export const MAX_CURRENT_CODE_UNITS = 5600;
export const MAX_PROGRESS_FILE_BYTES = 64 * 1024;

function countLines(text) {
  if (!text) return 0;
  const breaks = text.match(/\r\n|\r|\n/g) || [];
  const trailingBreak = /(?:\r\n|\r|\n)$/.test(text) ? 1 : 0;
  return breaks.length + 1 - trailingBreak;
}

function scanLines(text) {
  const lines = [];
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    lines.push({ text: line, start, after: newline < 0 ? end : newline + 1 });
    if (newline < 0) break;
    start = newline + 1;
  }
  return lines;
}

function fileType(stat) {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  if (stat.isFIFO()) return 'fifo';
  if (stat.isSocket()) return 'socket';
  if (stat.isCharacterDevice()) return 'character_device';
  if (stat.isBlockDevice()) return 'block_device';
  return 'other';
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function unreadable(filePath, error) {
  return {
    status: 'unreadable',
    path: filePath,
    code: error && error.code ? error.code : 'UNKNOWN',
    error: error && error.message ? error.message : String(error)
  };
}

export function parseProgressText(input) {
  const raw = typeof input === 'string' ? input : String(input ?? '');
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const metadata = { codeUnitCount: raw.length, lineCount: countLines(raw) };
  const lines = scanLines(text);
  const starts = lines.filter((line) => line.text === START_MARKER);
  const ends = lines.filter((line) => line.text === END_MARKER);

  if (starts.length === 0 && ends.length === 0) {
    return { status: 'legacy', ...metadata };
  }

  const errors = [];
  if (starts.length !== 1) errors.push(`START marker count must be 1 (actual ${starts.length})`);
  if (ends.length !== 1) errors.push(`END marker count must be 1 (actual ${ends.length})`);

  let currentCodeUnits;
  if (starts.length === 1 && ends.length === 1) {
    const start = starts[0];
    const end = ends[0];
    if (end.start <= start.start) {
      errors.push('END marker must follow START marker');
    } else {
      const bodyStart = start.after;
      let bodyEnd = end.start;
      if (bodyEnd > bodyStart && text[bodyEnd - 1] === '\n') {
        bodyEnd--;
        if (bodyEnd > bodyStart && text[bodyEnd - 1] === '\r') bodyEnd--;
      }
      const current = text.slice(bodyStart, bodyEnd);
      currentCodeUnits = current.length;
      if (!current.trim()) errors.push('current block body must be non-empty');
      if (currentCodeUnits > MAX_CURRENT_CODE_UNITS) {
        errors.push(`current block is ${currentCodeUnits} UTF-16 code units; maximum is ${MAX_CURRENT_CODE_UNITS}`);
      }
      if (errors.length === 0) {
        return { status: 'valid', current, currentCodeUnits, ...metadata };
      }
    }
  }

  return { status: 'invalid', errors, currentCodeUnits, ...metadata };
}

export function readProgressFile(filePath, projectRoot = path.dirname(filePath)) {
  let root;
  let entry;
  try {
    root = fs.realpathSync(projectRoot);
    entry = fs.lstatSync(filePath, { bigint: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return { status: 'missing', path: filePath };
    return unreadable(filePath, error);
  }

  if (entry.isSymbolicLink()) {
    try {
      if (!isWithinRoot(root, fs.realpathSync(filePath))) {
        return { status: 'tree_external', path: filePath, fileType: 'symlink' };
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') return unreadable(filePath, error);
    }
    return { status: 'non_regular', path: filePath, fileType: 'symlink' };
  }

  if (!entry.isFile()) {
    return { status: 'non_regular', path: filePath, fileType: fileType(entry) };
  }

  try {
    if (!isWithinRoot(root, fs.realpathSync(filePath))) {
      return { status: 'tree_external', path: filePath, fileType: 'file' };
    }
  } catch (error) {
    return unreadable(filePath, error);
  }

  const entryBytes = Number(entry.size);
  if (entryBytes > MAX_PROGRESS_FILE_BYTES) {
    return {
      status: 'oversized',
      path: filePath,
      fileBytes: entryBytes,
      maximumFileBytes: MAX_PROGRESS_FILE_BYTES
    };
  }

  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (opened.dev !== entry.dev || opened.ino !== entry.ino) {
      return { status: 'non_regular', path: filePath, fileType: 'changed_during_open' };
    }
    if (!opened.isFile()) {
      return { status: 'non_regular', path: filePath, fileType: fileType(opened) };
    }
    const openedBytes = Number(opened.size);
    if (openedBytes > MAX_PROGRESS_FILE_BYTES) {
      return {
        status: 'oversized',
        path: filePath,
        fileBytes: openedBytes,
        maximumFileBytes: MAX_PROGRESS_FILE_BYTES
      };
    }

    const buffer = Buffer.alloc(MAX_PROGRESS_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_PROGRESS_FILE_BYTES) {
      const afterRead = fs.fstatSync(descriptor, { bigint: true });
      return {
        status: 'oversized',
        path: filePath,
        fileBytes: Math.max(bytesRead, Number(afterRead.size)),
        maximumFileBytes: MAX_PROGRESS_FILE_BYTES
      };
    }
    return { ...parseProgressText(buffer.toString('utf8', 0, bytesRead)), path: filePath, fileBytes: bytesRead };
  } catch (error) {
    return unreadable(filePath, error);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
