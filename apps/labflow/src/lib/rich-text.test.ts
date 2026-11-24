import { describe, expect, it } from 'vitest';
import { continueList, indent, outdent, parseInline, parseRichText, toggleHeading, toggleList, toggleWrap } from './rich-text';

describe('parseInline', () => {
  it('reads bold, italic, struck-out and code, and leaves stray markers as typed', () => {
    expect(parseInline('**Spin** at *4 C*, not ~~room~~ `RT`')).toEqual([
      { kind: 'bold', text: 'Spin' },
      { kind: 'text', text: ' at ' },
      { kind: 'italic', text: '4 C' },
      { kind: 'text', text: ', not ' },
      { kind: 'strike', text: 'room' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'RT' },
    ]);
    expect(parseInline('_E. coli_ grew')[0]).toEqual({ kind: 'italic', text: 'E. coli' });
    // A multiplication sign or an unclosed marker is not formatting.
    expect(parseInline('3 * 4 = 12 and **not closed')).toEqual([{ kind: 'text', text: '3 * 4 = 12 and **not closed' }]);
    expect(parseInline('sample_id_2')).toEqual([{ kind: 'text', text: 'sample_id_2' }]);
  });
});

describe('parseRichText', () => {
  it('reads headings, lists, checklists, quotes and indented lines', () => {
    const blocks = parseRichText('## Method\n1. Thaw\n  - on ice\n- [x] Label\n- [ ] Spin\n> careful\n    indented\n\n\nend');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'item', 'item', 'item', 'item', 'quote', 'line', 'gap', 'line']);
    expect(blocks[1]).toMatchObject({ list: 'number', marker: '1.', depth: 0 });
    expect(blocks[2]).toMatchObject({ list: 'bullet', depth: 1 });
    expect(blocks[3]).toMatchObject({ list: 'check', checked: true });
    expect(blocks[4]).toMatchObject({ list: 'check', checked: false });
    expect(blocks[6]).toMatchObject({ kind: 'line', depth: 2 });
  });
});

describe('editing', () => {
  it('wraps and unwraps the selection, or opens a pair to type into', () => {
    expect(toggleWrap({ value: 'spin fast', start: 5, end: 9 }, '**')).toEqual({ value: 'spin **fast**', start: 7, end: 11 });
    expect(toggleWrap({ value: 'spin **fast**', start: 7, end: 11 }, '**')).toEqual({ value: 'spin fast', start: 5, end: 9 });
    expect(toggleWrap({ value: 'a ', start: 2, end: 2 }, '*')).toEqual({ value: 'a **', start: 3, end: 3 });
  });

  it('indents and outdents every selected line', () => {
    const e = { value: 'a\nb\nc', start: 0, end: 3 };
    const deeper = indent(e);
    expect(deeper.value).toBe('  a\n  b\nc');
    expect(outdent(deeper).value).toBe('a\nb\nc');
    expect(indent({ value: 'x', start: 1, end: 1 })).toEqual({ value: '  x', start: 3, end: 3 });
  });

  it('turns lines into a list and back, numbering them', () => {
    const numbered = toggleList({ value: 'thaw\nspin', start: 0, end: 9 }, 'number');
    expect(numbered.value).toBe('1. thaw\n2. spin');
    expect(toggleList(numbered, 'number').value).toBe('thaw\nspin');
    expect(toggleList(numbered, 'bullet').value).toBe('- thaw\n- spin');
    expect(toggleList({ value: 'label', start: 0, end: 0 }, 'check').value).toBe('- [ ] label');
    expect(toggleList({ value: 'a\n', start: 2, end: 2 }, 'number')).toEqual({ value: 'a\n1. ', start: 5, end: 5 });
    expect(toggleHeading({ value: 'Method', start: 0, end: 0 }).value).toBe('## Method');
  });

  it('continues a list on Enter, and ends it on an empty item', () => {
    expect(continueList({ value: '1. thaw', start: 7, end: 7 })).toEqual({ value: '1. thaw\n2. ', start: 11, end: 11 });
    expect(continueList({ value: '  - a', start: 5, end: 5 })!.value).toBe('  - a\n  - ');
    expect(continueList({ value: '- [x] a', start: 7, end: 7 })!.value).toBe('- [x] a\n- [ ] ');
    expect(continueList({ value: '- a\n- ', start: 6, end: 6 })).toEqual({ value: '- a\n', start: 4, end: 4 });
    expect(continueList({ value: 'plain', start: 5, end: 5 })).toBeNull();
  });
});
