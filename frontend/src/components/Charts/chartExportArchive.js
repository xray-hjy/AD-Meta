// A store-only ZIP keeps independent SVG pages editable without adding a runtime dependency.
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  bytes.forEach(byte => { value = (value >>> 8) ^ crcTable[(value ^ byte) & 255]; });
  return (value ^ 0xffffffff) >>> 0;
}

export function dataUrlBytes(url) {
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  const data = url.slice(comma + 1);
  return header.includes(';base64') ? Uint8Array.from(atob(data), char => char.charCodeAt(0))
    : encoder.encode(decodeURIComponent(data));
}

export function createChartArchive(files) {
  const local = [];
  const central = [];
  let offset = 0;
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const bytes = file.bytes;
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 0x21, true); // ZIP epoch: 1980-01-01
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    const directory = new Uint8Array(46 + name.length);
    const entry = new DataView(directory.buffer);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x800, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.set(name, 46);
    local.push(header, bytes);
    central.push(directory);
    offset += header.length + bytes.length;
  });
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, central.reduce((sum, item) => sum + item.length, 0), true);
  view.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
