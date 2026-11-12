import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import { parseMatrixToUrl } from './matrixTo';

// Set before each parse call to pass current user context into the renderer.
let currentMyUserId: string | null = null;

// Set before each sanitize call to restrict <img> src to trusted media origins.
let currentAllowedImgOrigins: ReadonlySet<string> = new Set();

const EMPTY_ORIGINS: ReadonlySet<string> = new Set();

function prettifyUrl(href: string): string | null {
  try {
    const url = new URL(href);
    let hostname = url.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const tld = parts[parts.length - 1];
      const isCcTld = tld.length <= 2;
      const keep = isCcTld && parts.length > 3 ? 3 : 2;
      hostname = parts.slice(-keep).join('.');
    }
    return hostname;
  } catch {
    return null;
  }
}

function bareLink(link: string): string {
  const text = link.trim().toLowerCase();
  const scheme = text.indexOf('://');
  return (scheme >= 0 ? text.slice(scheme + 3) : text).replace(/\/+$/, '');
}

const renderer = new Renderer();

// Detect matrix.to user mention links and render as pill spans.
// All other links get the standard safe anchor treatment.
renderer.link = ({ href, title, tokens }) => {
  const text = tokens.map((t) => ('text' in t ? t.text : '')).join('');
  const safeHref = href ?? '';

  if (safeHref.startsWith('https://matrix.to/#/@')) {
    const userId = safeHref.slice('https://matrix.to/#/'.length);
    const displayName = text.startsWith('@') ? text : `@${text}`;
    const isSelf = currentMyUserId && userId === currentMyUserId;
    const span = document.createElement('span');
    span.className = isSelf ? 'mention-pill mention-pill-self' : 'mention-pill';
    span.setAttribute('data-user-id', userId);
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.textContent = displayName;
    return span.outerHTML;
  }

  const a = document.createElement('a');
  a.setAttribute('href', safeHref);
  if (title) a.setAttribute('title', title);
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener noreferrer');
  a.textContent = text;
  return a.outerHTML;
};

marked.use({
  renderer,
  breaks: true,
  gfm: true,
  pedantic: false,
});

const ALLOWED_TAGS = [
  'strong',
  'b', // bold
  'em',
  'i', // italic
  'u', // underline
  'del',
  's', // strikethrough
  'sup',
  'sub', // superscript / subscript
  'code',
  'pre', // inline / block code
  'blockquote', // quote
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6', // headings
  'ol',
  'ul',
  'li', // lists
  'a', // links
  'hr', // horizontal rule
  'br',
  'p', // line breaks / paragraphs
  'div', // block container
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption', // tables
  'details',
  'summary', // collapsible sections
  'span', // mention pills
  'img', // inline images (custom emoji, etc.)
];

const ALLOWED_ATTR = [
  'href', // links
  'title', // tooltip
  'target', // _blank
  'rel', // noopener noreferrer
  'class', // mention-pill class
  'data-user-id', // mention user ID
  'data-room-mention', // room mention marker
  'data-mx-spoiler', // spoiler / content warning
  'data-mx-emoticon', // MSC2545 custom emoticon marker
  'role', // mention-pill button semantics
  'tabindex', // mention-pill keyboard focus
  'src', // img source
  'alt', // img alt text
  'width', // img width
  'height', // img height
  'start', // ol start
  'type', // ol list style type
];

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // Allow data-* on our mention spans (data-user-id)
  ALLOW_DATA_ATTR: true,
  // Keep text content of stripped tags (don't delete the words, just the tags)
  KEEP_CONTENT: true,
  // Force all <a> targets to _blank and add rel safety
  ADD_ATTR: ['target'],
};

// Force every link to open in new tab after sanitization
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? '';
    if (!src) return;
    if (src.startsWith('mxc://')) return;
    try {
      if (currentAllowedImgOrigins.has(new URL(src).origin)) return;
    } catch {
      // Not an absolute URL; fall through and strip it.
    }
    node.removeAttribute('src');
  }
});

function roomPillLabel(href: string, text: string): string | null {
  const target = parseMatrixToUrl(href);
  if (target?.kind !== 'room' || target.eventId) return null;
  const label = text.trim();
  if (!label || label === href || /^https?:\/\//.test(label)) {
    return target.roomIdOrAlias.startsWith('#') ? target.roomIdOrAlias : null;
  }
  return label.startsWith('#') || label.startsWith('!') ? label : `#${label}`;
}

function isRoomLink(href: string): boolean {
  const target = parseMatrixToUrl(href);
  return target?.kind === 'room' && !target.eventId;
}

function applyMentionPills(html: string, myUserId?: string): string {
  if (!html.includes('matrix.to/#/')) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  tmp.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('https://matrix.to/#/@')) {
      const label = roomPillLabel(href, a.textContent ?? '');
      if (label) {
        a.className = 'mention-pill room-pill';
        a.textContent = label;
      }
      return;
    }

    const userId = href.slice('https://matrix.to/#/'.length);
    const displayName = a.textContent ?? userId;
    const label = displayName.startsWith('@') ? displayName : `@${displayName}`;
    const isSelf = myUserId && userId === myUserId;

    const span = document.createElement('span');
    span.className = isSelf ? 'mention-pill mention-pill-self' : 'mention-pill';
    span.setAttribute('data-user-id', userId);
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.textContent = label;
    a.replaceWith(span);
  });

  return tmp.innerHTML;
}

function prettifyAnchors(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  tmp.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    // Skip mention-pill links (already handled by applyMentionPills)
    if (href.startsWith('https://matrix.to/#/@') || isRoomLink(href)) return;

    // Links with their own text (Markdown `[text](url)`) keep it
    if (bareLink(a.textContent ?? '') !== bareLink(href)) return;
    const pretty = prettifyUrl(href);
    if (!pretty || pretty === a.textContent) return;

    const fullText = a.textContent ?? href;
    const prettySpan = document.createElement('span');
    prettySpan.className = 'pretty-text';
    prettySpan.textContent = pretty;
    const fullSpan = document.createElement('span');
    fullSpan.className = 'full-text';
    fullSpan.textContent = fullText;

    a.textContent = '';
    a.appendChild(prettySpan);
    a.appendChild(fullSpan);
    a.classList.add('prettified-link');
  });

  return tmp.innerHTML;
}

function highlightRoomMentions(html: string): string {
  if (!/@(room|everyone|all)/i.test(html)) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Only highlight room mentions that aren't inside links, code spans, or
  // already-pillified mention/room spans.
  const re = /(^|[\s(])@(room|everyone|all)(?=[\s).,!?;:]|$)/gi;
  const walker = tmp.ownerDocument.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
  const pending: { textNode: Text; parts: Array<string | Node> }[] = [];

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    const skip =
      parent && parent.closest('code, pre, a, .mention-pill, .room-mention, .room-mention-pill');
    if (!skip && textNode.data) {
      const parts: Array<string | Node> = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(textNode.data)) !== null) {
        if (m.index > lastIndex) parts.push(textNode.data.slice(lastIndex, m.index));
        if (m[1]) parts.push(m[1]);
        const span = tmp.ownerDocument.createElement('span');
        span.className = 'room-mention';
        span.textContent = m[0].slice(m[1].length);
        parts.push(span);
        lastIndex = m.index + m[0].length;
      }
      if (parts.length > 0) {
        if (lastIndex < textNode.data.length) parts.push(textNode.data.slice(lastIndex));
        pending.push({ textNode, parts });
      }
    }
    node = walker.nextNode();
  }

  for (const { textNode, parts } of pending) {
    const frag = tmp.ownerDocument.createDocumentFragment();
    for (const part of parts) {
      frag.append(typeof part === 'string' ? tmp.ownerDocument.createTextNode(part) : part);
    }
    textNode.replaceWith(frag);
  }

  return tmp.innerHTML;
}

export const URL_RE = /https?:\/\/[^\s<>"')]+/g;

function autoLinkUrls(html: string): string {
  if (!html.includes('://')) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const walker = tmp.ownerDocument.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
  const pending: { textNode: Text; parts: Array<string | Node> }[] = [];

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    const skip = parent && parent.closest('a, code, pre');
    if (!skip && textNode.data && URL_RE.test(textNode.data)) {
      URL_RE.lastIndex = 0;
      const parts: Array<string | Node> = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = URL_RE.exec(textNode.data)) !== null) {
        if (m.index > lastIndex) parts.push(textNode.data.slice(lastIndex, m.index));
        const a = tmp.ownerDocument.createElement('a');
        a.href = m[0];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = m[0];
        parts.push(a);
        lastIndex = m.index + m[0].length;
      }
      if (parts.length > 0) {
        if (lastIndex < textNode.data.length) parts.push(textNode.data.slice(lastIndex));
        pending.push({ textNode, parts });
      }
    }
    node = walker.nextNode();
  }

  for (const { textNode, parts } of pending) {
    const frag = tmp.ownerDocument.createDocumentFragment();
    for (const part of parts) {
      frag.append(typeof part === 'string' ? tmp.ownerDocument.createTextNode(part) : part);
    }
    textNode.replaceWith(frag);
  }

  return tmp.innerHTML;
}

const CACHE_LIMIT = 2000;
const cache = new Map<string, string>();

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSingleEmptyListItem(el: Element): boolean {
  if (el.tagName !== 'OL' && el.tagName !== 'UL') return false;
  if (el.children.length !== 1 || el.children[0].tagName !== 'LI') return false;
  const li = el.children[0];
  return li.children.length === 0 && (li.textContent ?? '').trim() === '';
}

function isPlainTextOnly(html: string): boolean {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const nodes = Array.from(tmp.children);
  if (nodes.length === 0) return false;

  for (const node of nodes) {
    if (node.tagName === 'OL' || node.tagName === 'UL') {
      if (!isSingleEmptyListItem(node)) return false;
      continue;
    }
    if (node.tagName !== 'P') return false;
    const hasNonBreak = Array.from(node.querySelectorAll('*')).some(
      (child) => child.tagName !== 'BR'
    );
    if (hasNonBreak) return false;
  }
  return true;
}

function cacheKey(
  kind: string,
  markdown: string,
  myUserId: string | undefined,
  renderPills: boolean,
  prettifyLinks: boolean,
  alreadyHtml: boolean,
  allowedImgOrigins: ReadonlySet<string>
): string {
  const originsKey = allowedImgOrigins.size ? Array.from(allowedImgOrigins).sort().join(',') : '';
  return (
    kind +
    (renderPills ? '1' : '0') +
    (prettifyLinks ? '1' : '0') +
    (alreadyHtml ? '1' : '0') +
    '|' +
    originsKey +
    '|' +
    (myUserId ?? '') +
    '\n' +
    markdown
  );
}

function readCache(key: string): string | undefined {
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
  }
  return cached;
}

function writeCache(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function postProcess(
  html: string,
  myUserId: string | undefined,
  renderPills: boolean,
  prettifyLinks: boolean
): string {
  const linked = autoLinkUrls(html);
  const prettified = prettifyLinks ? prettifyAnchors(linked) : linked;
  const pillified = renderPills ? applyMentionPills(prettified, myUserId) : prettified;
  return highlightRoomMentions(pillified);
}

export function markdownToHtml(
  markdown: string,
  myUserId?: string,
  renderPills = true,
  prettifyLinks = false,
  alreadyHtml = false,
  allowedImgOrigins: ReadonlySet<string> = EMPTY_ORIGINS
): string {
  if (!markdown) return '';

  const key = cacheKey(
    'md',
    markdown,
    myUserId,
    renderPills,
    prettifyLinks,
    alreadyHtml,
    allowedImgOrigins
  );
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  // Thread myUserId into the marked link renderer (handles markdown-style links)
  currentMyUserId = myUserId ?? null;
  const raw = alreadyHtml ? markdown : (marked.parse(markdown) as string);
  currentMyUserId = null;

  let final: string;
  if (!alreadyHtml && markdown.trim() && isPlainTextOnly(raw)) {
    final = postProcess(
      escapeHtmlText(markdown).replace(/\n/g, '<br>'),
      myUserId,
      renderPills,
      prettifyLinks
    );
  } else {
    // Sanitize, auto-link bare URLs, prettify links, then convert matrix.to <a> tags to pill spans
    currentAllowedImgOrigins = allowedImgOrigins;
    const sanitized = DOMPurify.sanitize(raw, PURIFY_CONFIG) as string;
    currentAllowedImgOrigins = EMPTY_ORIGINS;
    final = postProcess(sanitized, myUserId, renderPills, prettifyLinks);
  }

  writeCache(key, final);
  return final;
}

export function plainTextToHtml(
  text: string,
  myUserId?: string,
  renderPills = true,
  prettifyLinks = false
): string {
  if (!text) return '';

  const key = cacheKey('plain', text, myUserId, renderPills, prettifyLinks, false, EMPTY_ORIGINS);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const escaped = escapeHtmlText(text).replace(/\n/g, '<br>');
  const final = postProcess(escaped, myUserId, renderPills, prettifyLinks);

  writeCache(key, final);
  return final;
}
