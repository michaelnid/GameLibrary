function parseCookieHeader(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return {};
    }

    const pairs = cookieHeader.split(';');
    const cookies = {};

    for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx <= 0) continue;

        const rawName = pair.slice(0, idx).trim();
        const rawValue = pair.slice(idx + 1).trim();
        if (!rawName) continue;

        try {
            cookies[rawName] = decodeURIComponent(rawValue);
        } catch (err) {
            cookies[rawName] = rawValue;
        }
    }

    return cookies;
}

function readCookie(req, name) {
    if (!req || !name) return null;
    const cookies = parseCookieHeader(req.headers?.cookie);
    return cookies[name] || null;
}

module.exports = {
    parseCookieHeader,
    readCookie
};
