const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();

// Bounded edit distance is for names only; similar identifiers never become matches.
function nearName(a, b) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 2) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
    if (Math.min(...next) > 2) return false;
  }
  return previous[b.length] <= 2;
}

export function matchSuggestions(entries, query, limit = 20) {
  const needle = normalize(query);
  const matches = [];
  for (const entry of entries) {
    const id = normalize(entry.value);
    const names = [entry.label, ...(entry.aliases || [])].map(normalize);
    let score = !needle ? 6 : id === needle ? 0 : entry.kind !== '分类' && id.startsWith(needle) ? 1
      : names.includes(needle) ? 2 : names.some(name => name.startsWith(needle)) ? 3
        : [id, ...names].some(name => name.includes(needle)) ? 4 : null;
    if (score == null && entry.kind === '分类' && nearName(needle, names[0])) score = 5;
    if (score != null) matches.push({ entry: score === 5 ? { ...entry, approximate: true } : entry, score });
  }
  matches.sort((a, b) => a.score - b.score || (a.entry.kind === '分类' ? 0 : 1) - (b.entry.kind === '分类' ? 0 : 1) || a.entry.key.localeCompare(b.entry.key));
  return { items: matches.slice(0, limit).map(item => item.entry), total: matches.length };
}

export function magCatalogSuggestions(rows, { taxa = true } = {}) {
  const names = new Map();
  const entries = rows.map(row => {
    const aliases = Object.entries(row.taxonomy || {}).filter(([key, value]) => ['domain', 'phylum', 'class', 'order', 'family', 'genus', 'species'].includes(key) && value).map(([, value]) => value);
    if (taxa) for (const name of new Set(aliases)) {
      if (!names.has(name)) names.set(name, new Set());
      names.get(name).add(row.magId);
    }
    return { key: `mag:${row.magId}`, value: row.magId, label: row.taxonomy?.species || row.taxonomy?.genus || row.magId,
      detail: row.magId, kind: '代表 MAG', aliases };
  });
  for (const [name, ids] of names) entries.push({ key: `taxon:${name}`, value: name, label: name, kind: '分类', count: ids.size,
    detail: `${ids.size} 个代表 MAG · 分类名称检索` });
  return entries;
}
