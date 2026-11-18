// @vitest-environment node
import { createChartArchive, dataUrlBytes } from './chartExportArchive';

test('SVG archive preserves UTF-8 names, file bytes and ZIP directory offsets', async () => {
  const bytes = dataUrlBytes('data:image/svg+xml;charset=UTF-8,%3Csvg%3E%E7%89%A9%E7%A7%8D%3C%2Fsvg%3E');
  const archive = createChartArchive([{ name: '物种-page-1.svg', bytes }, { name: 'page-2.svg', bytes: new Uint8Array([1, 2, 3]) }]);
  const buffer = await archive.arrayBuffer();
  const view = new DataView(buffer);
  const fileNameLength = view.getUint16(26, true);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint16(6, true)).toBe(0x800);
  expect(new TextDecoder().decode(new Uint8Array(buffer, 30 + fileNameLength, bytes.length))).toBe('<svg>物种</svg>');
  expect(view.getUint16(buffer.byteLength - 12, true)).toBe(2);
  expect(view.getUint32(view.getUint32(buffer.byteLength - 6, true), true)).toBe(0x02014b50);
  expect(dataUrlBytes('data:image/png;base64,AQID')).toEqual(new Uint8Array([1, 2, 3]));
});
