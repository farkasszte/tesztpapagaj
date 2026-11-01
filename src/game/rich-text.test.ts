import { expect, test } from 'bun:test';
import { fromPlain, fromProse, hasContent, isPlain, picturesIn, plainOf, renamePictures, toProse, type RichText } from './rich-text';

const rich: RichText = [
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Solve ' },
      { type: 'inline-math', source: 'x^2 = 9' },
      { type: 'text', text: ' for H', marks: [{ type: 'strong' }] },
      { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
    ],
  },
  { type: 'display-math', source: '\\frac{a}{b}' },
  { type: 'block-image', asset: 'abc123', alt: 'A triangle', ratio: 0.5 },
  { type: 'bullet-list', content: [{ type: 'list-item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
];

test('rich text survives the trip through the editor’s document', () => {
  expect(fromProse(toProse(rich))).toEqual(rich);
  expect(fromProse(toProse(fromPlain('two\nlines')))).toEqual(fromPlain('two\nlines'));
});

test('the editor’s marks, math, LaTeX blocks and pictures come out as Rich Text', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'big', marks: [{ type: 'strong' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
          { type: 'math_inline', attrs: { value: '\\pi' } },
          { type: 'image', attrs: { src: 'picture:p1' } },
          { type: 'image', attrs: { src: 'https://elsewhere.example/x.png' } },
        ],
      },
      { type: 'code_block', attrs: { language: 'LaTeX' }, content: [{ type: 'text', text: 'e^{i\\pi}' }] },
      { type: 'image-block', attrs: { src: 'picture:p2', caption: '', ratio: 1 } },
    ],
  };
  expect(fromProse(doc)).toEqual([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'big', marks: [{ type: 'strong' }] },
        { type: 'inline-math', source: '\\pi' },
        { type: 'block-image', asset: 'p1' },
      ],
    },
    { type: 'display-math', source: 'e^{i\\pi}' },
    { type: 'block-image', asset: 'p2' },
  ]);
});

test('plain text of rich text keeps the words, the math source and a mark where a picture is', () => {
  expect(plainOf(rich)).toBe('Solve x^2 = 9 for H2\n\\frac{a}{b}\n[A triangle]\none');
  expect(plainOf(fromPlain('a\nb'))).toBe('a\nb');
});

test('only text with nothing but words and line breaks counts as plain', () => {
  expect(isPlain(fromPlain('just words\nand a break'))).toBe(true);
  expect(isPlain(rich)).toBe(false);
  expect(isPlain([{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'emphasis' }] }] }])).toBe(false);
});

test('a picture or math counts as content even with no words', () => {
  expect(hasContent(fromPlain('  '))).toBe(false);
  expect(hasContent([{ type: 'block-image', asset: 'a' }])).toBe(true);
  expect(hasContent([{ type: 'paragraph', content: [{ type: 'inline-math', source: 'x' }] }])).toBe(true);
});

test('pictures are found anywhere, and can be renamed', () => {
  expect([...picturesIn({ question: { rich: { prompt: rich, choices: [[{ type: 'block-image', asset: 'z' }]] } } })]).toEqual(['abc123', 'z']);
  expect(picturesIn(renamePictures(rich, (a) => (a === 'abc123' ? 'new' : undefined)))).toEqual(new Set(['new']));
});
