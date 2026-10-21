import { describe, expect, it } from 'vitest';
import { compileRoomCss, compileRoomHtml, widgetDocument } from './index.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('Room CSS closed grammar', () => {
  it('scopes every selector and emits canonical declarations', () => {
    expect(compileRoomCss('.room-title {font-weight: 700}', id)).toBe(
      `.room-canvas[data-personalization="${id}"] .pal-custom-title{font-weight:700;}`,
    );
  });
  it.each([
    '@import "https://evil.test";',
    'body{font-weight:700}',
    '.room-title,.room-card{font-weight:700}',
    '.room-title:hover{font-weight:700}',
    '.room-title{background:url(https://evil.test)}',
    '.room-title{position:fixed}',
    '.room-title{font-weight:700!important}',
    '.room-title{--x:700}',
    '.room-title{font-weight:var(--x)}',
    '.room-title{font-weight:7/**/00}',
    '.room-title{&{font-weight:700}}',
    '.room-ti\\74le{font-weight:700}',
    '<style>body{}</style>',
  ])('rejects %s', (source) =>
    expect(() => compileRoomCss(source, id)).toThrow(),
  );
  it('bounds source, rules, declarations and server scope', () => {
    expect(() => compileRoomCss(' '.repeat(8193), id)).toThrow();
    expect(() => compileRoomCss('.room-title{}'.repeat(65), id)).toThrow();
    expect(() =>
      compileRoomCss(`.room-title{${'font-weight:700;'.repeat(257)}}`, id),
    ).toThrow();
    expect(() => compileRoomCss('', '"]body{')).toThrow();
  });
});
describe('static widget HTML', () => {
  it('canonicalizes text, entities and permitted elements', () => {
    expect(
      compileRoomHtml('<p>Hello <strong>friends</strong> &amp; &lt;3</p>'),
    ).toBe('<p>Hello <strong>friends</strong> &amp; &lt;3</p>');
  });
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg><script/></svg>',
    '<math><mtext>x</mtext></math>',
    '<p style="color:red">x</p>',
    '<p onclick="x">x</p>',
    '<a href="https://evil.test">go</a>',
    '<iframe srcdoc="x"></iframe>',
    '<form><input></form>',
    '<style>@import "https://evil.test";</style>',
    '<!-- hidden -->',
    '<p id="x">x</p>',
    '<template><p>x</p></template>',
    '<meta http-equiv="refresh" content="0;url=https://evil.test">',
  ])('rejects %s', (source) => expect(() => compileRoomHtml(source)).toThrow());
  it('bounds bytes, nodes and depth', () => {
    expect(() => compileRoomHtml('é'.repeat(4097))).toThrow();
    expect(() => compileRoomHtml('<br>'.repeat(129))).toThrow();
    expect(() =>
      compileRoomHtml('<span>'.repeat(9) + 'x' + '</span>'.repeat(9)),
    ).toThrow();
  });
  it('fixes the child CSP without accepting caller policy', () => {
    expect(widgetDocument(compileRoomHtml('<p>Hi</p>'))).toContain(
      "default-src 'none'",
    );
  });
});
