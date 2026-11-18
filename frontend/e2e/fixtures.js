import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Browser smoke tests exercise UI/API contracts without publishing research data
// or claiming that a formal R model ran. All inputs live in the isolated E2E root.
export function createE2eManifest(directory) {
  mkdirSync(directory, { recursive: true });
  const samples = Array.from({ length: 8 }, (_, i) => ({
    id: `CRR90000${i + 1}`, group: i < 4 ? 'AD' : 'NC',
    values: [i === 0 ? 0 : 10 + i, 20 - i, 5 + (i % 3), 30 + (i % 2)],
  }));
  const species = [
    'k__Bacteria|p__Firmicutes|c__Clostridia|o__Eubacteriales|f__Lachnospiraceae|g__Blautia|s__Blautia_fixture',
    'k__Bacteria|p__Bacteroidota|c__Bacteroidia|o__Bacteroidales|f__Bacteroidaceae|g__Bacteroides|s__Bacteroides_fixture',
    'k__Bacteria|p__Firmicutes|c__Bacilli|o__Lactobacillales|f__Lactobacillaceae|g__Lactobacillus|s__Lactobacillus_fixture',
    'k__Bacteria|p__Actinomycetota|c__Actinomycetes|o__Bifidobacteriales|f__Bifidobacteriaceae|g__Bifidobacterium|s__Bifidobacterium_fixture',
  ];
  const phylumFixture = process.env.AD_META_E2E_PHYLUM === '1';
  const realSpeciesInput = process.env.AD_META_E2E_SPECIES_INPUT;
  if (phylumFixture) species.push('k__Bacteria|p__Rare_fixture|s__Rare_species', 'k__Bacteria|s__Unclassified_fixture');
  const declarations = [
    { slug: 'ad-nc-species', type: 'species_abundance', features: species },
    { slug: 'ad-nc-ko-abundance', type: 'ko_abundance', features: ['K00001', 'K00002', 'K00003', 'K00004'] },
  ];
  const datasets = declarations.map(({ slug, features }) => {
    const file = path.join(directory, `${slug}.csv`);
    writeFileSync(file, [
      ['Sample', 'Group', ...features].join(','),
      ...samples.map(({ id, group, values }) => [id, group, ...(phylumFixture && slug === 'ad-nc-species'
        ? [...values.map(value => value / 100), 1e-10, 0.00001] : values)].join(',')),
    ].join('\n') + '\n');
    const realSpecies = slug === 'ad-nc-species' && realSpeciesInput;
    const realDiting = slug === 'ad-nc-ko-abundance' && process.env.AD_META_E2E_DITING_ROOT;
    return {
      slug, name: `${realDiting ? 'Real-source DiTing fixture' : realSpecies ? 'Real-source heatmap fixture' : 'Synthetic UI fixture'}: ${slug}`,
      description: realSpecies || realDiting ? 'Isolated test copy of normalized species source data; external formal models deferred.' : 'Synthetic browser-test input; no scientific inference.',
      file: realDiting ? path.join(realDiting, 'ko_abundance_among_samples.tab') : realSpecies ? path.resolve(realSpecies) : file,
      ...(realDiting ? { inputFormat: 'diting_ko', sampleMetadataFile: path.resolve(realDiting, '../../ad-nc-species/PRJCA022804/samples.tsv'), pathwayFile: path.join(realDiting, 'pathways_relative_abundance.tab') } : {}),
      abundanceScale: realDiting ? 'normalized_abundance' : realSpecies || (phylumFixture && slug === 'ad-nc-species') ? 'relative_abundance' : 'unknown', normalization: 'unknown',
      source: { kind: realSpecies || realDiting ? 'provided_normalized_source_test_copy' : 'synthetic_ui_fixture' },
    };
  });
  const manifest = {
    manifestVersion: '1.0', datasets,
    analysisRuns: [{
      key: 'e2e-ui-fixture', name: process.env.AD_META_E2E_DITING_ROOT ? 'Real-source DiTing test' : realSpeciesInput ? 'Real-source heatmap test' : 'Synthetic UI fixture', status: 'published',
      description: realSpeciesInput ? 'Real-source species test copy plus a separate eight-sample synthetic KO fixture; formal R models deferred.' : 'Eight synthetic samples for UI checks; independent of research releases and R models.',
      pipeline: { name: 'synthetic-ui-fixture', version: '1' },
      artifacts: declarations.map(({ slug, type }) => ({
        key: `${slug}-matrix`, type, datasetSlug: slug, schemaVersion: '1.0',
      })),
    }],
  };
  const target = path.join(directory, 'storage_manifest.json');
  writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  return target;
}
