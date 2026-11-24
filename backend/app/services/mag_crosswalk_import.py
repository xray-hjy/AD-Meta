"""Import archive-based MAG taxonomy correspondences for the current release."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict

from app.services.mag_source_adapters import RANKS, index, number, require, rows

NCBI_MAPPED = {'matched_exact_ncbi_species_taxid', 'ncbi_species_taxid_not_observed_in_reads'}
ACCESSION = re.compile(r'GC[AF]_\d+\.\d+')
TAXID = re.compile(r'[1-9]\d*')


def ncbi_genus_path(taxonomy):
    ranks = defaultdict(set)
    for step in re.split(r'[;|]', taxonomy or ''):
        rank, _, label = step.strip().partition('__')
        if label.strip():
            ranks['domain' if rank in {'d', 'k'} else rank].add(label.strip())
    domains, genera = ranks['domain'], ranks['g']
    domain = next(iter(domains)) if len(domains) == 1 else None
    genus = next(iter(genera)) if len(genera) == 1 else None
    return domain if domain in {'Bacteria', 'Archaea'} else None, genus


def archive_receipt(files, spec):
    receipt = {}
    for name, source in spec['archiveSources'].items():
        path = files[name]
        with path.open('rb') as stream:
            require(hashlib.file_digest(stream, 'sha256').hexdigest() == source['sha256'],
                    path, 'SHA-256 matches the formal archive inventory')
        receipt[name] = {**source, 'status': 'verified'}
    return receipt


def reference_rows(path, release):
    references = defaultdict(set)
    for row in rows(path):
        accession = row['normalized_accession']
        require(ACCESSION.fullmatch(accession) and re.sub(r'^(?:RS_|GB_)', '', row['accession']) == accession,
                path, 'consistent versioned GCF/GCA accessions')
        require(row['metadata_source'] in {f'bac120_metadata_{release}.tsv.gz', f'ar53_metadata_{release}.tsv.gz'},
                path, 'reference metadata belongs to the current GTDB release')
        references[accession].add((row['ncbi_taxid'], row['ncbi_species_taxid'], row['ncbi_taxonomy']))
    require(references, path, 'nonempty accession mapping')
    return references


def lineage_evidence(row, gtdb, accession_records, references):
    accession = row['gtdbReferenceAccession'] or ''
    if row['gtdbClassification'] != gtdb['classification']:
        return 'conflict', '归档 GTDB 分类与本发布的 R232 分类冲突。'
    if not ACCESSION.fullmatch(accession) or row['mappingStatus'] not in NCBI_MAPPED:
        return 'pending', '缺少可用的 GTDB 参考与 NCBI 分类对应。'
    if row['gtdbReferenceSourceField'] != 'closest_genome_reference' or gtdb['closestReference'] != accession:
        return 'conflict', '归档参考 accession 与本发布的 GTDB-Tk 记录冲突。'
    taxid, species_taxid = row['referenceNcbiTaxid'], row['ncbiSpeciesTaxid']
    if not TAXID.fullmatch(taxid or '') or not TAXID.fullmatch(species_taxid or ''):
        return 'pending', '归档未提供有效的 NCBI 参考或物种 TaxID。'
    if len(accession_records[accession]) != 1:
        return 'conflict', '同一版本的参考 accession 在代表 MAG 表中对应不同 NCBI 记录。'
    joined = references.get(accession)
    if not joined:
        return 'pending', '参考归档中缺少该版本的 accession。'
    if len(joined) != 1:
        return 'conflict', '参考归档中同一版本的 accession 对应多个 NCBI 记录。'
    ref_taxid, ref_species, ref_lineage = next(iter(joined))
    if not TAXID.fullmatch(ref_taxid) or not TAXID.fullmatch(ref_species):
        return 'pending', '参考归档中缺少可核查的 NCBI TaxID。'
    if (ref_taxid, ref_species, ref_lineage) != (taxid, species_taxid, row['ncbiTaxonomy']):
        return 'conflict', '代表 MAG 表与参考归档的 NCBI TaxID 或分类路径冲突。'
    if row['ncbiDomain'] and row['ncbiDomain'] != gtdb['domain']:
        return 'conflict', 'NCBI 分类路径的域与本发布的 GTDB 域冲突。'
    if not row['ncbiDomain'] or not row['ncbiGenus']:
        return 'pending', '归档 NCBI 路径缺少可核查的细菌或古菌域、属信息。'
    return 'verified', None


def parse_crosswalk(files, dependencies, spec):
    archive = archive_receipt(files, spec)
    run = json.loads(files['gtdb_run'].read_text(encoding='utf-8'))
    release = str(run.get('database_version', '')).lower()
    require(release == spec['tool']['databaseRelease'], files['gtdb_run'], 'GTDB release matches the archived crosswalk')
    taxonomy = {
        row['magId']: {**row, 'classification': ';'.join(
            f'{prefix}__{row[rank]}' for prefix, rank in zip('dpcofgs', RANKS, strict=True)
        )}
        for row in dependencies['taxonomy']['taxonomy']
    }
    source = files['representatives']
    original = index(rows(source), 'MAG_ID', source)
    require(set(original) == set(dependencies['abundance']['mag_ids']) == set(taxonomy), source,
            'exactly one row per current representative MAG')
    references = reference_rows(files['references'], release)
    by_accession = defaultdict(set)
    records = []
    for mag_id, raw in original.items():
        row = {parts[0] + ''.join(part.title() for part in parts[1:]): value or None
               for field, value in raw.items() if field != 'MAG_ID' for parts in [field.split('_')]}
        for key, maximum in (('gtdbReferenceAni', 100), ('gtdbReferenceAf', 1)):
            row[key] = number(row[key], source, maximum=maximum, optional=True)
        row['magId'] = mag_id
        row['ncbiDomain'], row['ncbiGenus'] = ncbi_genus_path(row['ncbiTaxonomy'])
        if row['gtdbReferenceAccession']:
            by_accession[row['gtdbReferenceAccession']].add((row['referenceNcbiTaxid'], row['ncbiSpeciesTaxid'], row['ncbiTaxonomy']))
        records.append(row)
    for row in records:
        row['ncbiLineageStatus'], row['ncbiLineageReason'] = lineage_evidence(
            row, taxonomy[row['magId']], by_accession, references)
    return {'crosswalk': records}, {
        'archive': archive, 'magCount': len(records), 'referenceAccessionCount': len(by_accession),
        'referenceTableCount': len(references),
        'missingReferenceCount': len(by_accession.keys() - references.keys()),
        'extraReferenceCount': len(references.keys() - by_accession.keys()),
        'statusCounts': dict(Counter(row['mappingStatus'] for row in records)),
        'ncbiLineageStatusCounts': dict(Counter(row['ncbiLineageStatus'] for row in records)),
        'tool': {'gtdbTkVersion': run.get('version')},
    }
