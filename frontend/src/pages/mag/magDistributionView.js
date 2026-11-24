export const formatMagNumber = value => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });

// Only the shared axis changes. Samples and backend box statistics remain intact.
export function distributionRange(data, focus = false) {
  const values = data.samples.map(s => s.abundancePercent).filter(Number.isFinite);
  const fullMax = Math.max(0, ...values);
  const whiskerMax = Math.max(0, ...data.boxes.flatMap(box => box.values).filter(Number.isFinite));
  const upper = focus && whiskerMax > 0 ? Math.min(fullMax, whiskerMax * 1.08) : fullMax;
  const max = upper > 0 ? upper * (focus && whiskerMax > 0 ? 1 : 1.08) : 1;
  const outside = Object.fromEntries(['AD', 'NC'].map(group => [group,
    data.samples.filter(s => s.disease === group && Number.isFinite(s.abundancePercent) && (s.abundancePercent < 0 || s.abundancePercent > max)).length]));
  return { min: 0, max, outside, focused: focus, fallback: focus && whiskerMax === 0 };
}

export function distributionRangeLabel(range) {
  return `${range.focused ? '放大主体' : '完整范围'} · 共享纵轴 ${formatMagNumber(range.min)}–${formatMagNumber(range.max)}% · 视野外 AD ${range.outside.AD} / NC ${range.outside.NC} 个样本`;
}

export function distributionCsv(data) {
  const columns = ['magId', 'sampleId', 'disease', 'age', 'gender', 'batch', 'abundancePercent', 'abundanceUnit', 'dataFingerprint', 'requestFingerprint'];
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = data.samples.map(sample => ({ ...sample, magId: data.feature.magId, abundanceUnit: '%',
    dataFingerprint: data.provenance.dataFingerprint, requestFingerprint: data.provenance.requestFingerprint }));
  return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))].map(row => row.map(escape).join(',')).join('\r\n');
}

export function downloadDistributionCsv(data) {
  const url = URL.createObjectURL(new Blob([distributionCsv(data)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `ADMeta-${data.feature.magId}-${data.provenance.requestFingerprint.slice(0, 12)}-samples.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
