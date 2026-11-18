import { escapeTooltipText } from '../../utils/tooltipHtml';

export function preciseTaxonomy(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number !== 0 && Math.abs(number) < 0.001 ? number.toExponential(4) : String(Number(number.toPrecision(7)));
}
export function taxonomyIndex(tree) {
  const roots = [];
  const byId = new Map();
  const total = tree.reduce((sum, node) => sum + Number(node.value || 0), 0);
  function visit(nodes, parentId = '', path = []) {
    return nodes.map((node, index) => {
      const id = `${parentId}/${index}:${node.name}`;
      const names = [...path, node.name];
      const entry = { ...node, id, fullPath: names.join(' > '), pathNames: names, parentId,
        originalRatio: total > 0 ? Number(node.value || 0) / total : 0 };
      byId.set(id, entry);
      if (node.children?.length) entry.children = visit(node.children, id, names);
      return entry;
    });
  }
  roots.push(...visit(tree));
  return { roots, byId, entries: [...byId.values()], total };
}
export function taxonomySemantics(projection, total) {
  const count = Number(projection?.projection?.sampleCount || 0);
  const relative = projection?.dataSemantics?.abundanceScale === 'relative_abundance';
  return { sampleCount: count, relative, total,
    unit: relative ? '样本相对丰度之和（比例累加，非百分比）' : '源丰度之和（输入单位未声明）',
    valueLabel: relative ? '累计相对丰度（比例）' : '累计源丰度',
    scope: projection?.scope || null };
}
export function taxonomyValueLines(node, semantics, parentValue) {
  const value = Number(node?.value || 0);
  return [
    `${semantics.valueLabel}: ${preciseTaxonomy(value)}`,
    semantics.sampleCount > 0 ? `所选 ${semantics.sampleCount} 个样本的均值: ${preciseTaxonomy(value / semantics.sampleCount * (semantics.relative ? 100 : 1))}${semantics.relative ? '%' : '（源单位）'}` : '样本数未知，不能推算样本均值',
    `占完整范围总和: ${semantics.total > 0 ? preciseTaxonomy(value / semantics.total * 100) : '—'}%`,
    parentValue > 0 ? `占父级: ${preciseTaxonomy(value / parentValue * 100)}%` : null,
  ].filter(Boolean);
}
export function taxonomyTooltip(params, semantics, entries = new Map()) {
  const node = params.data || {};
  const parent = entries.get(node.parentId);
  const lines = taxonomyValueLines({ ...node, value: node.value ?? params.value }, semantics, parent?.value);
  const merged = Number(node.mergedCount || 0);
  return [`<b>${escapeTooltipText(node.label || params.name || node.name || '')}</b>`,
    escapeTooltipText(node.fullPath || (params.treePathInfo || []).map(item => item.name).filter(Boolean).join(' > ')),
    ...lines.map(escapeTooltipText), merged ? `合并小分类: ${merged}` : null,
    node.isMergedPhyla ? '旭日图展示合并；可点击查看成员' : merged ? '展示合并节点，可在详情查看成员' : null,
  ].filter(Boolean).join('<br/>');
}
export function clampLegendPosition(position, bounds, card = {}) {
  return { x: Math.max(0, Math.min(Math.max(0, bounds.width - (card.width || 320)), position.x)),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - (card.height || 260)), position.y)) };
}

export function withoutTaxonomyLabels(value) {
  if (Array.isArray(value)) return value.map(withoutTaxonomyLabels);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    (key === 'label' || key === 'upperLabel') && item && typeof item === 'object'
      ? { ...item, show: false } : withoutTaxonomyLabels(item)]));
}
