export function functionalMatrixGeometry(rows, columns) {
  const cellWidth = columns <= 8 ? 64 : 36;
  return { world: { width: Math.max(1, columns) * cellWidth, height: Math.max(1, rows) * 24 },
    viewportHeight: Math.min(760, Math.max(280, rows * 24 + 160)), cellWidth, cellHeight: 24 };
}

export function phylogenyHeight(leaves) {
  return Math.min(740, Math.max(240, leaves * 28 + 145));
}
