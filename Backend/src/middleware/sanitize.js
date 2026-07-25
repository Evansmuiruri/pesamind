// ============================================
// INPUT SANITIZATION (Strip script/HTML tags)
// ============================================
// Basic defense-in-depth against stored XSS via free-text fields
// (notes, descriptions, worker names, etc.). This does not replace
// output-encoding on the frontend, but stops obviously malicious
// payloads from ever reaching the database.

const SCRIPT_TAG_RE = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/gi;
const EVENT_HANDLER_RE = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;

function sanitizeString(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(SCRIPT_TAG_RE, '')
        .replace(HTML_TAG_RE, '')
        .replace(EVENT_HANDLER_RE, '')
        .replace(JS_PROTOCOL_RE, '');
}

function sanitizeValue(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
        return sanitizeObject(value);
    }
    return sanitizeString(value);
}

function sanitizeObject(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        result[key] = sanitizeValue(obj[key]);
    }
    return result;
}

function sanitizeInput(req, res, next) {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params);
        }
        next();
    } catch (error) {
        console.error('Sanitization error:', error);
        next();
    }
}

module.exports = { sanitizeInput, sanitizeString };
