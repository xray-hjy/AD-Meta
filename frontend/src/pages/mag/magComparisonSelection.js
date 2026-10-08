import { getMagFeatures } from '../../api/mag';

// Chart selection is independent of the paginated result table.
export async function getMagComparisonSelection(params, options) {
  if (params.limit !== 0 && params.limit <= 300) return getMagFeatures(params, options);
  const pageSize = 300;
  const first = await getMagFeatures({ ...params, limit: pageSize, offset: 0 }, options);
  const target = params.limit === 0 ? first.total : Math.min(params.limit, first.total);
  const offsets = [];
  for (let offset = pageSize; offset < target; offset += pageSize) offsets.push(offset);
  const pages = await Promise.all(offsets.map(offset => getMagFeatures({ ...params,
    limit: params.limit === 0 ? pageSize : Math.min(pageSize, target - offset), offset }, options)));
  if (pages.some(page => page.total !== first.total || page.provenance.dataFingerprint !== first.provenance.dataFingerprint)) {
    throw new Error('MAG 数据版本发生变化，请重新加载图表。');
  }
  const items = [first, ...pages].flatMap(page => page.items).slice(0, target);
  if (items.length !== target || new Set(items.map(item => item.magId)).size !== target) {
    throw new Error('所选 MAG 未完整读取，请重试。');
  }
  return { ...first, items, limit: items.length, offset: 0 };
}
