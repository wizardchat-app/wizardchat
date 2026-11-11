import type { Descendant } from 'slate';

const EMOTICONS: Record<string, string> = {
  '>:-(': '😠',
  '>:(': '😠',
  ":'(": '😢',
  ":')": '🥲',
  '</3': '💔',
  '<3': '❤️',
  ':-)': '🙂',
  ':)': '🙂',
  ':-(': '🙁',
  ':(': '🙁',
  ':-D': '😄',
  ':D': '😄',
  xD: '😆',
  XD: '😆',
  ';-)': '😉',
  ';)': '😉',
  ':-P': '😛',
  ':P': '😛',
  ':-p': '😛',
  ':p': '😛',
  ':-O': '😮',
  ':O': '😮',
  ':-o': '😮',
  ':o': '😮',
  ':-|': '😐',
  ':|': '😐',
  ':-/': '😕',
  ':/': '😕',
  ':-*': '😘',
  ':*': '😘',
  'B-)': '😎',
  '^_^': '😊',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(
  `(^|\\s)(${Object.keys(EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')})(?=$|\\s|[.,!?])`,
  'g'
);

export function replaceEmoticons(text: string): string {
  return text.replace(
    PATTERN,
    (_, before: string, emoticon: string) => before + EMOTICONS[emoticon]
  );
}

export function withEmoticons(value: Descendant[]): Descendant[] {
  return value.map((node) => convert(node));
}

function convert(node: Descendant): Descendant {
  if ('text' in node) {
    return node.code ? node : { ...node, text: replaceEmoticons(node.text) };
  }
  if (node.type === 'code-block') return node;
  return { ...node, children: node.children.map(convert) } as Descendant;
}
