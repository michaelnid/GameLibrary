const path = require('path');

const SAFE_FILENAME_REGEX = /^[A-Za-z0-9._-]{1,255}$/;

function sanitizeFilename(filename) {
    if (typeof filename !== 'string') return null;

    const trimmed = filename.trim();
    if (!trimmed) return null;

    const base = path.basename(trimmed);
    if (!base || base === '.' || base === '..') return null;
    if (!SAFE_FILENAME_REGEX.test(base)) return null;

    return base;
}

function safeResolveWithin(baseDir, filename) {
    const safeName = sanitizeFilename(filename);
    if (!safeName) return null;

    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(resolvedBase, safeName);

    if (!resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
        return null;
    }

    return {
        filename: safeName,
        path: resolvedPath
    };
}

module.exports = {
    sanitizeFilename,
    safeResolveWithin
};
