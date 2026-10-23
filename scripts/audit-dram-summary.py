"""Read-only audit of a received DRAM summary; no application import or raw writes."""
from __future__ import annotations

import argparse
from array import array
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
from itertools import zip_longest
import json
from pathlib import Path
import re


def table(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as handle:
        yield from csv.DictReader(handle, delimiter='\t')


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def audit(root):
    report = {'summary_path': root.as_posix(), 'audit_kind': 'read-only, independent local recount'}
    expected = json.loads((root / 'run_summary.json').read_text(encoding='utf-8'))
    report['upstream_run'] = expected['inputs']['DRAM_run_id']
    report['summary_run'] = expected['run_stamp']
    files = list(root.iterdir())
    assert all(p.is_file() for p in files)
    report['files'] = {'count': len(files), 'bytes': sum(p.stat().st_size for p in files)}
    hashes = {p.name: digest(p) for p in files}
    checked = []
    for row in table(root / 'output_manifest.tsv'):
        path = root / row['file']
        assert path.parent.resolve() == root.resolve()
        assert path.stat().st_size == int(row['bytes']) and hashes[path.name] == row['sha256']
        checked.append(path.name)
    report['internal_manifest_verified_files'] = len(checked)
    archive = root.parents[3]
    archive_checked = []
    for row in table(archive / 'files.tsv'):
        relative = Path(row['path'])
        if relative.parent.as_posix() != root.relative_to(archive).as_posix():
            continue
        assert hashes[relative.name] == row['sha256']
        assert (archive / relative).stat().st_size == int(row['bytes'])
        archive_checked.append(relative.name)
    assert set(archive_checked) == set(hashes)
    report['archive_manifest_verified_files'] = len(archive_checked)

    summary = {r['MAG_ID']: r for r in table(root / 'mag_dram_annotation_summary.tsv')}
    report['mag_count'] = len(summary)
    report['domain_counts'] = dict(Counter(r['Domain'] for r in summary.values()))
    master = {r['MAG_ID']: r for r in table(root / 'mag_master_metadata.tsv')}
    quality_taxonomy = {r['MAG_ID']: r for r in table(root / 'mag_quality_taxonomy.tsv')}
    lengths = {r['MAG']: r for r in table(archive / 'CoverM/mag_length.tsv')}
    quality = {r['Name']: r for r in table(archive / 'CheckM2/quality_report.tsv')}
    arg = {r['MAG']: r for r in table(archive / 'DRAMMA/summary/mag_arg_counts.tsv')}
    taxonomy = {}
    for domain in ('bac120', 'ar53'):
        taxonomy.update({r['user_genome']: r for r in table(
            archive / f'GTDBTk/GTDBTk_results/classify/AD_dRep.{domain}.summary.tsv')})
    with (archive / 'dRep/dRep_results/data_tables/Wdb.csv').open(encoding='utf-8', newline='') as handle:
        winners = {Path(r['genome']).stem for r in csv.DictReader(handle)}
    assert set(summary) == set(master) == set(quality_taxonomy) == set(lengths) == set(taxonomy) == winners
    for mid in summary:
        assert master[mid]['GTDB_taxonomy'] == quality_taxonomy[mid]['GTDB_classification'] == taxonomy[mid]['classification']
        assert int(master[mid]['CoverM_length_bp']) == int(lengths[mid]['length_bp'])
        assert int(summary[mid]['Gene_count']) == int(master[mid]['DRAM2_Gene_count']) == int(arg[mid]['Total_predicted_proteins'])
        for field in quality[mid]:
            if field != 'Name':
                assert quality_taxonomy[mid]['CheckM2_' + field] == master[mid]['CheckM2_' + field] == quality[mid][field]
    report['existing_source_cross_checks'] = {
        'mag_set_matches_drep_coverm_gtdb': True,
        'checkm2_all_fields_match_for_representatives': True,
        'gtdb_classification_matches': True, 'coverm_lengths_match': True,
        'dramma_predicted_protein_totals_match': True,
        'note': 'Protein totals do not establish one-to-one gene identity across tools.'}
    matrices = {}
    ko = {}
    ko_features = []
    for kind in expected['validation']['feature_counts']:
        nonzero = total = nrows = 0
        ids = set()
        for counts, presence in zip_longest(table(root / f'mag_{kind}_counts.tsv'),
                                            table(root / f'mag_{kind}_presence.tsv')):
            assert counts is not None and presence is not None
            assert list(counts) == list(presence)
            mid = counts['MAG_ID']
            assert mid == presence['MAG_ID'] and mid not in ids and mid in summary
            assert counts['Domain'] == presence['Domain'] == summary[mid]['Domain']
            ids.add(mid)
            features = [k for k in counts if k not in {'MAG_ID', 'Domain'}]
            assert len(features) == expected['validation']['feature_counts'][kind]
            values = array('I', (int(counts[k]) for k in features))
            assert all(int(presence[k]) == int(v > 0) for k, v in zip(features, values))
            nz = sum(v > 0 for v in values)
            assert nz == int(summary[mid][kind + '_unique_features'])
            nonzero += nz
            total += sum(values)
            nrows += 1
            if kind == 'kofam_ko':
                ko[mid] = values
                if ko_features:
                    assert features == ko_features
                ko_features = features
        assert ids == set(summary)
        matrices[kind] = {'mags': nrows, 'features': len(features), 'nonzero_cells': nonzero,
                          'feature_assignments': total, 'presence_consistent': True}
    report['matrices'] = matrices
    ko_index = {feature: i for i, feature in enumerate(ko_features)}

    genes = Counter()
    ranks = Counter()
    gene_ko = defaultdict(Counter)
    witnesses = {key: [] for key in ('K00929', 'K00634', 'K01580', 'K01442')}
    for row in table(root / 'dram_all_genes.tsv.gz'):
        mid = row['input_fasta']
        assert mid in summary
        genes[mid] += 1
        ranks[row['rank']] += 1
        for key in set(re.findall(r'K\d{5}', row['kofam_id'])):
            gene_ko[mid][key] += 1
            if key in witnesses and len(witnesses[key]) < 2:
                witnesses[key].append({k: row[k] for k in
                                       ('query_id', 'input_fasta', 'scaffold', 'gene_number', 'kofam_id')})
    assert all(genes[mid] == int(summary[mid]['Gene_count']) for mid in summary)
    errors = sum(gene_ko[mid].get(key, 0) != values[i]
                 for mid, values in ko.items() for i, key in enumerate(ko_features))
    assert errors == 0
    report['genes'] = {'rows': sum(genes.values()), 'ranks': dict(ranks),
                        'per_mag_gene_totals_match': True, 'best_hit_ko_matrix_mismatched_cells': errors,
                        'witnesses': witnesses}
    distill = list(table(root / 'mag_distill_summary.tsv'))
    meta = ['gene_id', 'gene_description', 'topic_ecosystem', 'module', 'workbook']
    exact = [r for r in distill if re.fullmatch(r'K\d{5}', r['gene_id']) and r['gene_id'] in ko_index]
    mismatched_rows = mismatched_cells = 0
    examples = []
    for row in exact:
        key = row['gene_id']
        differences = sum(int(row[mid]) != values[ko_index[key]] for mid, values in ko.items())
        mismatched_rows += differences > 0
        mismatched_cells += differences
        if key in witnesses:
            examples.append({'ko': key, 'description': row['gene_description'],
                             'ko_carrier_mags': sum(values[ko_index[key]] > 0 for values in ko.values()),
                             'ko_gene_count': sum(values[ko_index[key]] for values in ko.values()),
                             'distill_value_sum': sum(int(row[mid]) for mid in ko),
                             'mismatched_mags': differences})
    report['distill'] = {'logical_rows': len(distill),
                         'unique_gene_id': len({r['gene_id'] for r in distill}),
                         'unique_metadata_tuples': len({tuple(r[k] for k in meta) for r in distill}),
                         'workbooks': dict(Counter(r['workbook'] for r in distill)),
                         'single_ko_rows_present_in_ko_matrix': len(exact),
                         'single_ko_rows_with_different_values': mismatched_rows,
                         'single_ko_mismatched_cells': mismatched_cells, 'examples': examples,
                         'interpretation': 'Discrepancy established; root cause and intended summary rules not established.'}
    with Path('backend/storage/raw/ad-nc-ko-abundance/PRJCA022804/ko_abundance_among_samples.tab').open(
            encoding='utf-8-sig', newline='') as handle:
        reader = csv.reader(handle, delimiter='\t')
        next(reader)
        community = {r[0] for r in reader if r and re.fullmatch(r'K\d{5}', r[0])}
    report['community_ko_identity_overlap'] = {'community_standard_ko': len(community),
        'mag_ko': len(ko_index), 'shared_ids': len(community & set(ko_index)),
        'mag_only_ids': len(set(ko_index) - community),
        'note': 'Identifier overlap only; abundance units and detection procedures differ.'}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('summary', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = json.dumps(audit(args.summary), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result, encoding='utf-8')
        print(args.output)
    else:
        print(result)
