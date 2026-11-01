/**
 * A Rich Text node, as the record format writes it (a subset of what Question
 * Commons declares, plus display math, which it lacks). Declared here so the
 * game needs nothing from the record library.
 */
export type RichTextMark = { type: string; attrs?: Record<string, unknown>; href?: string; title?: string };
export type RichTextNode = {
  type: string;
  text?: string;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  asset?: string;
  alt?: string;
  caption?: string;
  source?: string;
  level?: number;
  start?: number;
  language?: string;
  header?: boolean;
  pending?: { image?: number; page?: number };
  crop?: { left: number; top: number; right: number; bottom: number };
};

/**
 * Rich Text: a question's words with formatting, math and pictures, in the
 * shape Question Commons uses (plus display math, which it lacks). A
 * picture names its bytes by `asset`, the hash they are kept under (see
 * pictures.svelte.ts). Every question also keeps a plain-text copy, for search,
 * spreadsheets and History; questions with nothing but plain text keep only that.
 */

export type RichNode = Omit<RichTextNode, 'type' | 'content'> & {
  type: RichTextNode['type'] | 'display-math';
  content?: RichNode[];
  /** A picture's width as a share of its natural width, as the editor's drag handle leaves it. */
  ratio?: number;
};
export type RichText = RichNode[];
export type RichMark = RichTextMark;

/** The rich versions of a question's words, choice for choice. */
export type RichQuestion = {
  prompt: RichText;
  choices: RichText[];
  /** A párosítás fogalmai, a fogalmak sorrendjében. */
  prompts?: RichText[];
  explanation?: RichText;
};

const PICTURE = '[picture]';

/**
 * A Picture Note: words in square brackets where a Picture should go, left by
 * an import that couldn't bring the Picture: "[picture]" or
 * "[picture: a parabola opening down]".
 */
export const pictureNote = (description?: string) => (description?.trim() ? `[picture: ${description.trim()}]` : PICTURE);
const PICTURE_NOTE = /\[picture(?::[^\]]*)?\]/i;

/** Whether Rich Text (or plain text) still has a Picture Note in it. */
export function hasPictureNote(value: RichText | string | undefined): boolean {
  if (typeof value === 'string') return PICTURE_NOTE.test(value);
  // Only the words: a real picture's plain text reads "[picture]" too.
  const words = (nodes: RichNode[] | undefined): string => (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : words(n.content))).join(' ');
  return PICTURE_NOTE.test(words(value));
}

export function plainOf(rich: RichText | undefined): string {
  const walk = (node: RichNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hard-break') return '\n';
    if (node.type === 'inline-math' || node.type === 'display-math') return node.source ?? '';
    if (node.type === 'code-block') return node.text ?? '';
    if (node.type === 'block-image') return node.alt ? `[${node.alt}]` : PICTURE;
    if (node.type === 'blank') return '_____';
    const inner = (node.content ?? []).map(walk).join(node.type === 'table-row' ? ' ' : '');
    const block = ['paragraph', 'heading', 'list-item', 'table-row', 'display-math'].includes(node.type);
    return block && !inner.endsWith('\n') ? `${inner}\n` : inner;
  };
  return (rich ?? [])
    .map((node) => {
      const text = walk(node);
      return node.type === 'block-image' || node.type === 'display-math' || node.type === 'code-block' ? `${text}\n` : text;
    })
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Plain text as Rich Text: one paragraph, its line breaks kept. */
export function fromPlain(text: string): RichText {
  const content: RichNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) content.push({ type: 'hard-break' });
    if (line) content.push({ type: 'text', text: line });
  });
  return [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }];
}

/** Whether Rich Text says nothing plain text couldn't. */
export function isPlain(rich: RichText): boolean {
  if (rich.length > 1) return false;
  const [only] = rich;
  if (!only) return true;
  if (only.type !== 'paragraph') return false;
  return (only.content ?? []).every((node) => (node.type === 'text' && !node.marks?.length) || node.type === 'hard-break');
}

/** Whether Rich Text has anything in it: words, math or a picture. */
export function hasContent(rich: RichText | undefined): boolean {
  const filled = (node: RichNode): boolean =>
    (node.type === 'text' && !!node.text?.trim()) ||
    node.type === 'block-image' ||
    ((node.type === 'inline-math' || node.type === 'display-math') && !!node.source?.trim()) ||
    node.type === 'rule' ||
    (node.type === 'code-block' && !!node.text?.trim()) ||
    (node.content ?? []).some(filled);
  return (rich ?? []).some(filled);
}

/** The pictures (by hash) Rich Text shows, anywhere inside anything. */
export function picturesIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) picturesIn(item, into);
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (node.type === 'block-image' && typeof node.asset === 'string') into.add(node.asset);
    for (const child of Object.values(node)) if (child && typeof child === 'object') picturesIn(child, into);
  }
  return into;
}

/** Each picture's asset renamed, for pictures that arrive under another key. */
export function renamePictures(rich: RichText, rename: (asset: string) => string | undefined): RichText {
  return rich.map((node) => {
    const next: RichNode = { ...node };
    if (node.type === 'block-image' && node.asset) next.asset = rename(node.asset) ?? node.asset;
    if (node.content) next.content = renamePictures(node.content, rename);
    return next;
  });
}

// ---------------------------------------------------------------------------
// The editor (Milkdown Crepe, which is ProseMirror) keeps its own JSON.

export type ProseJSON = { type: string; attrs?: Record<string, unknown>; content?: ProseJSON[]; text?: string; marks?: ProseJSON[] };

/** How a picture's src reads in the editor: the hash, under a scheme of our own. */
export const PICTURE_SCHEME = 'picture:';

const safeHref = (href: unknown) => (typeof href === 'string' && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : '');

const markFrom: Record<string, (m: ProseJSON) => RichMark | null> = {
  strong: () => ({ type: 'strong' }),
  emphasis: () => ({ type: 'emphasis' }),
  inlineCode: () => ({ type: 'inline-code' }),
  strike_through: () => ({ type: 'strike' }),
  subscript: () => ({ type: 'subscript' }),
  superscript: () => ({ type: 'superscript' }),
  link: (m) => {
    const href = safeHref(m.attrs?.href);
    return href ? { type: 'link', href, ...(m.attrs?.title ? { title: String(m.attrs.title) } : {}) } : null;
  },
};

const markTo: Record<RichMark['type'], (m: RichMark) => ProseJSON> = {
  strong: () => ({ type: 'strong' }),
  emphasis: () => ({ type: 'emphasis' }),
  'inline-code': () => ({ type: 'inlineCode' }),
  strike: () => ({ type: 'strike_through' }),
  subscript: () => ({ type: 'subscript' }),
  superscript: () => ({ type: 'superscript' }),
  link: (m) => ({ type: 'link', attrs: { href: m.type === 'link' ? m.href : '', title: m.type === 'link' ? (m.title ?? null) : null } }),
};

function pictureOf(attrs: Record<string, unknown> = {}): RichNode | null {
  const src = String(attrs.src ?? '');
  if (!src.startsWith(PICTURE_SCHEME)) return null;
  const ratio = Number(attrs.ratio);
  const alt = String(attrs.caption ?? attrs.alt ?? '').trim();
  return {
    type: 'block-image',
    asset: src.slice(PICTURE_SCHEME.length),
    ...(alt ? { alt } : {}),
    ...(Number.isFinite(ratio) && ratio > 0 && ratio !== 1 ? { ratio } : {}),
  };
}

/** The editor's document as Rich Text. Anything it can't say is left out. */
export function fromProse(doc: ProseJSON): RichText {
  const many = (nodes: ProseJSON[] | undefined) => (nodes ?? []).flatMap((n) => one(n) ?? []);
  const withContent = (type: RichNode['type'], node: ProseJSON, extra: Partial<RichNode> = {}): RichNode => {
    const content = many(node.content);
    return { type, ...extra, ...(content.length ? { content } : {}) };
  };
  const one = (node: ProseJSON): RichNode | RichNode[] | null => {
    const attrs = node.attrs ?? {};
    switch (node.type) {
      case 'text': {
        const marks = (node.marks ?? []).flatMap((m) => markFrom[m.type]?.(m) ?? []);
        return node.text ? { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) } : null;
      }
      case 'hardbreak':
        return { type: 'hard-break' };
      case 'paragraph':
        return withContent('paragraph', node);
      case 'heading':
        return withContent('heading', node, { level: Math.min(6, Math.max(1, Number(attrs.level) || 1)) });
      case 'blockquote':
        return withContent('blockquote', node);
      case 'bullet_list':
        return withContent('bullet-list', node);
      case 'ordered_list':
        return withContent('ordered-list', node, { start: Number(attrs.order) || 1 });
      case 'list_item':
        return withContent('list-item', node);
      case 'code_block': {
        const source = (node.content ?? []).map((c) => c.text ?? '').join('');
        const language = String(attrs.language ?? '');
        if (language.toLowerCase() === 'latex') return { type: 'display-math', source };
        return { type: 'code-block', text: source, ...(language ? { language } : {}) };
      }
      case 'hr':
        return { type: 'rule' };
      case 'table':
        return withContent('table', node);
      case 'table_header_row':
        return withContent('table-row', node, { header: true });
      case 'table_row':
        return withContent('table-row', node);
      case 'table_header':
        return withContent('table-cell', node, { header: true });
      case 'table_cell':
        return withContent('table-cell', node);
      case 'math_inline':
        return { type: 'inline-math', source: String(attrs.value ?? '') };
      case 'image-block':
      case 'image':
        return pictureOf(attrs);
      default:
        // Something unknown keeps whatever it holds.
        return node.content ? many(node.content) : null;
    }
  };
  const blocks = many(doc.content);
  return blocks.length ? blocks : [{ type: 'paragraph' }];
}

const pictureSrc = (node: RichNode) => `${PICTURE_SCHEME}${node.asset ?? ''}`;

/** Rich Text as the editor's document. */
export function toProse(rich: RichText): ProseJSON {
  const inline = (node: RichNode): ProseJSON | null => {
    switch (node.type) {
      case 'text':
        return node.text ? { type: 'text', text: node.text, ...(node.marks?.length ? { marks: node.marks.map((m) => markTo[m.type](m)) } : {}) } : null;
      case 'hard-break':
        return { type: 'hardbreak' };
      case 'inline-math':
        return { type: 'math_inline', attrs: { value: node.source ?? '' } };
      case 'block-image':
        return { type: 'image', attrs: { src: pictureSrc(node), alt: node.alt ?? '', title: '' } };
      case 'blank':
        return { type: 'text', text: '_____' };
      default:
        return null;
    }
  };
  const inlines = (nodes: RichNode[] | undefined) => {
    const content = (nodes ?? []).flatMap((n) => inline(n) ?? []);
    return content.length ? { content } : {};
  };
  const blocks = (nodes: RichNode[] | undefined): ProseJSON[] => (nodes ?? []).flatMap((n) => block(n) ?? []);
  const paragraphs = (nodes: RichNode[] | undefined) => {
    const content = blocks(nodes);
    return content.length ? content : [{ type: 'paragraph' }];
  };
  const block = (node: RichNode): ProseJSON | null => {
    switch (node.type) {
      case 'paragraph':
        return { type: 'paragraph', ...inlines(node.content) };
      case 'heading':
        return { type: 'heading', attrs: { level: node.level ?? 1 }, ...inlines(node.content) };
      case 'blockquote':
        return { type: 'blockquote', content: paragraphs(node.content) };
      case 'bullet-list':
        return { type: 'bullet_list', content: blocks(node.content) };
      case 'ordered-list':
        return { type: 'ordered_list', attrs: { order: node.start ?? 1 }, content: blocks(node.content) };
      case 'list-item':
        return { type: 'list_item', content: paragraphs(node.content) };
      case 'code-block':
        return { type: 'code_block', attrs: { language: node.language ?? '' }, ...(node.text ? { content: [{ type: 'text', text: node.text }] } : {}) };
      case 'display-math':
        return { type: 'code_block', attrs: { language: 'LaTeX' }, ...(node.source ? { content: [{ type: 'text', text: node.source }] } : {}) };
      case 'rule':
        return { type: 'hr' };
      case 'table':
        return { type: 'table', content: blocks(node.content) };
      case 'table-row':
        return { type: node.header ? 'table_header_row' : 'table_row', content: blocks(node.content) };
      case 'table-cell':
        return { type: node.header ? 'table_header' : 'table_cell', content: paragraphs(node.content) };
      case 'block-image':
        return { type: 'image-block', attrs: { src: pictureSrc(node), caption: node.alt ?? '', ratio: node.ratio ?? 1 } };
      default: {
        // Inline content at the top level goes in a paragraph of its own.
        const alone = inline(node);
        return alone ? { type: 'paragraph', content: [alone] } : null;
      }
    }
  };
  return { type: 'doc', content: paragraphs(rich) };
}

/**
 * A question's Rich Text as a screen may see it: none while its words are
 * hidden, and the explanation only once the answer is out.
 */
export function richShown(question: { rich?: RichQuestion }, words: boolean, explanation: boolean): RichQuestion | null {
  const rich = question.rich;
  if (!rich || !words) return null;
  return { prompt: rich.prompt, choices: rich.choices, ...(explanation && rich.explanation ? { explanation: rich.explanation } : {}) };
}

/** Rich Text with each picture swapped for a Picture Note, for places too small to carry pictures (share links). */
export function withoutPictures(rich: RichText): RichText {
  return rich.map((node) => {
    if (node.type === 'block-image') return { type: 'text', text: pictureNote(node.alt) };
    return node.content ? { ...node, content: withoutPictures(node.content) } : node;
  });
}
