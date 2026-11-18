import { escapeTooltipText } from '../../utils/tooltipHtml';
export const DETECTION_SORTS = { gap: '绝对检出率差', ad: 'AD 检出率', nc: 'NC 检出率', overall: '总体检出率', id: 'KO 编号' };
export function detectionRows(data) {
  const ad = data?.groups?.find(g => g.group === 'AD')?.sampleCount || 0;
  const nc = data?.groups?.find(g => g.group === 'NC')?.sampleCount || 0;
  return (data?.allItems || data?.items || []).map(r => ({ ...r, adSampleCount: r.adSampleCount ?? ad, ncSampleCount: r.ncSampleCount ?? nc }));
}
export function filterDetection(rows, { search = '', field = 'overall', minimum = 0, maximum = 100, sort = 'gap' }) {
  const value = r => field === 'gap' ? r.rateGap * 100 : (field === 'ad' ? r.adDetectionRate : field === 'nc' ? r.ncDetectionRate : r.overallDetectionRate) * 100;
  return rows.filter(r => r.koId.toLowerCase().includes(search.toLowerCase()) && value(r) >= minimum && value(r) <= maximum)
    .sort((a, b) => sort === 'id' ? a.koId.localeCompare(b.koId) :
      (sort === 'ad' ? b.adDetectionRate - a.adDetectionRate : sort === 'nc' ? b.ncDetectionRate - a.ncDetectionRate : sort === 'overall' ? b.overallDetectionRate - a.overallDetectionRate : Math.abs(b.rateGap) - Math.abs(a.rateGap)) || a.koId.localeCompare(b.koId));
}
export function parseDetectionIds(text, rows) {
  const ids = [...new Set(text.split(/[\s,，;；]+/).filter(Boolean).map(x => x.toUpperCase()))], known = new Set(rows.map(r => r.koId));
  return { valid: ids.filter(id => known.has(id)), unknown: ids.filter(id => !known.has(id)) };
}
export const detectionPercent = n => `${(n * 100).toFixed(2)}%`;
export function detectionTooltip(r) {
  return `${escapeTooltipText(r.koId)}<br/>AD ${r.adDetectedSamples}/${r.adSampleCount} (${detectionPercent(r.adDetectionRate)})<br/>NC ${r.ncDetectedSamples}/${r.ncSampleCount} (${detectionPercent(r.ncDetectionRate)})<br/>AD − NC ${(r.rateGap * 100).toFixed(2)} 个百分点`;
}
