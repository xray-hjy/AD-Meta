import { magCatalogSuggestions, matchSuggestions } from './entitySuggestions';

const rows = Array.from({ length: 872 }, (_, i) => ({ magId: `CRR${i}_cleanbin_000001`, taxonomy: { species: i < 2 ? 'Species alpha' : `Species ${i}`, genus: 'Genus A' } }));
test('suggestions use the whole catalog, distinguish taxa from IDs, and count unique MAGs', () => {
  const entries = magCatalogSuggestions(rows);
  expect(matchSuggestions(entries, 'CRR871_cleanbin_000001').items[0].value).toBe('CRR871_cleanbin_000001');
  expect(matchSuggestions(entries, 'species ALPHA').items.find(item => item.kind === '分类')).toMatchObject({ value: 'Species alpha', count: 2 });
  const result = matchSuggestions(entries, 'Genus A');
  expect(result.items).toHaveLength(20);
  expect(result.total).toBe(873);
  expect(magCatalogSuggestions(rows, { taxa: false })).toHaveLength(872);
});
test('approximate names are marked but identifiers never fuzzy-match', () => {
  const entries = magCatalogSuggestions(rows);
  expect(matchSuggestions(entries, 'Speces alpha').items[0]).toMatchObject({ kind: '分类', value: 'Species alpha', approximate: true });
  expect(matchSuggestions(entries, 'CRR871_cleanbin_000002').items).toEqual([]);
});
