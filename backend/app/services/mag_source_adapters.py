"""Read upstream result formats. No package builders, legacy loaders or fixed cohort dimensions."""
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from app.domain.mag import MagDataError
from app.services.mag_function_store import parse_dram

PARSER_VERSION = 'source-artifacts-2026-10-20.1'
RANKS = ('domain', 'phylum', 'class', 'order', 'family', 'genus', 'species')


def require(condition, source, message):
    if not condition:
        raise MagDataError(str(source), message, 'validation failed')


def rows(path: Path, delimiter=None):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=delimiter or (',' if path.suffix == '.csv' else '\t'))
        header = reader.fieldnames or []
        require(header and len(header) == len(set(header)), path, 'unique nonempty headers')
        for row in reader:
            require(None not in row and all(v is not None for v in row.values()), path, 'rectangular table')
            yield row


def index(items, key, source):
    result = {}
    for row in items:
        value = row[key]
        require(value and value not in result, source, f'unique nonempty {key}: {value}')
        result[value] = row
    return result


def number(value, source, minimum=0, maximum=None, optional=False, integer=False):
    if optional and (value is None or str(value).lower() in {'', 'na', 'n/a', 'none'}):
        return None
    try:
        result = float(value)
    except (ValueError, TypeError) as exc:
        raise MagDataError(str(source), 'numeric value', value) from exc
    require(math.isfinite(result) and result >= minimum and (maximum is None or result <= maximum), source, f'numeric range: {value}')
    require(not integer or result.is_integer(), source, f'integer: {value}')
    return int(result) if integer else result


def mag_id(value):
    # Explicit suffix normalization only. Do not strip arbitrary dots from IDs.
    return re.sub(r'\.(?:fa|fna|fasta)$', '', value)


def parse_samples(files, dependencies, spec):
    labels = index(rows(files['labels']), 'sample_id', files['labels'])
    extra = index(rows(files['metadata']), 'sample_id', files['metadata']) if 'metadata' in files else {}
    require(not extra or set(extra) == set(labels), 'metadata', 'metadata sample set equals selected cohort')
    result = []
    for sid, label in labels.items():
        raw = extra.get(sid, {})
        group = label['Group']
        require(group in {'AD', 'NC'}, sid, 'explicit AD/NC phenotype')
        require(not raw.get('disease') or raw['disease'] == group, sid, 'consistent phenotype across sources')
        gender = raw.get('Gender') or None
        require(gender in {None, 'F', 'M'}, sid, 'F/M or missing sex')
        result.append({'sampleId': sid, 'disease': group,
                       'age': number(raw.get('Age'), sid, maximum=120, optional=True), 'gender': gender,
                       'batch': raw.get('HPC_Batch', ''), 'sampleName': raw.get('Sample_name', ''),
                       'accession': raw.get('Accession', ''), 'sourceGroup': raw.get('Group', '')})
    return {'samples': result}, {'sampleCount': len(result), 'groupCounts': dict(Counter(r['disease'] for r in result)),
                                 'covariates': {k: sum(r[k] not in (None, '') for r in result) for k in ('age', 'gender', 'batch')}}


def parse_coverm(files, dependencies, spec):
    sample_rows = dependencies['samples']['samples']
    sample_ids = [r['sampleId'] for r in sample_rows]
    with files['matrix'].open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream, delimiter='\t')
        header = next(reader)
        require(header[0] == 'Sample' and len(header) > 1 and len(set(header)) == len(header), files['matrix'], 'Sample + unique MAG columns')
    mags = header[1:]
    table = index(rows(files['matrix']), 'Sample', files['matrix'])
    require(set(table) == set(sample_ids), files['matrix'], 'sample set matches shared cohort metadata')
    matrix = np.asarray([[number(table[sid][mid], files['matrix'], maximum=100) for mid in mags] for sid in sample_ids])
    lengths = index(rows(files['lengths']), 'MAG', files['lengths'])
    require(set(lengths) == set(mags), files['lengths'], 'MAG set matches abundance columns')
    representatives = [{'magId': mid, 'lengthBp': number(lengths[mid]['length_bp'], mid, minimum=1, integer=True)} for mid in mags]
    manifest = index(rows(files['manifest']), 'Sample', files['manifest'])
    mapping = index(rows(files['mapping']), 'Sample', files['mapping'])
    require(set(manifest) == set(mapping) == set(sample_ids), 'CoverM', 'consistent sample keys')
    mapped_col, unmapped_col = spec['mappedColumn'], spec['unmappedColumn']
    mapped = np.asarray([number(mapping[sid][mapped_col], sid, maximum=100) for sid in sample_ids])
    unmapped = np.asarray([number(mapping[sid][unmapped_col], sid, maximum=100) for sid in sample_ids])
    error = float(np.max(np.abs(matrix.sum(axis=1) - mapped)))
    tolerance = 0.001
    require(np.max(np.abs(mapped + unmapped - 100)) <= tolerance and error <= tolerance, 'CoverM', 'matrix sum = mapped; mapped + unmapped = 100 within 0.001 percentage points')
    samples = [{**s, 'mappedPercent': float(mapped[i]), 'unmappedPercent': float(unmapped[i]),
                'r1Uri': manifest[s['sampleId']]['R1'], 'r2Uri': manifest[s['sampleId']]['R2'],
                'covermLabel': manifest[s['sampleId']]['CoverMLabel']} for i, s in enumerate(sample_rows)]
    generation = None
    if 'parameters' in files:
        params = files['parameters'].read_text(encoding='utf-8')
        def parameter(label):
            match = re.search(r'^'+re.escape(label)+r':\s*\n([^\n]+)', params, re.M)
            return match.group(1).strip() if match else ''
        generation = {'tool': 'CoverM', 'toolVersion': parameter('CoverM version').removeprefix('coverm '),
                      'mapper': parameter('Mapper'), 'genomeInputMode': parameter('Genome input mode'),
                      'minimumCoveredFraction': float(parameter('Minimum covered fraction')),
                      'outputFormat': parameter('Output format'), 'bamCaching': parameter('BAM caching'),
                      'methods': ['mean', 'relative_abundance', 'covered_fraction', 'variance', 'count', 'reads_per_base', 'length'],
                      'basis': 'Archived CoverM_run_parameters.txt; input hashes recorded by the cohort importer'}
    return {'samples': samples, 'representatives': representatives, 'matrix': matrix,
            'sample_ids': sample_ids, 'mag_ids': mags}, {'sampleCount': len(samples), 'representativeMagCount': len(mags),
            'unit': '%', 'maxMappingError': error, 'generation': generation, 'normalization': 'upstream percent retained; no reclosure'}


def parse_metrics(files, dependencies, spec):
    data = dependencies['abundance']
    result = [{'id': mid+'|'+sid, 'sampleId': sid, 'magId': mid} for sid in data['sample_ids'] for mid in data['mag_ids']]
    for name, path in files.items():
        table = index(rows(path), 'Sample', path)
        require(set(table) == set(data['sample_ids']), path, 'coverage sample set equals abundance')
        for raw in table.values():
            require(set(raw) == {'Sample', *data['mag_ids']}, path, 'coverage MAG set equals abundance')
        for row in result:
            raw = table[row['sampleId']]
            row[name] = number(raw[row['magId']], path, maximum=1 if name == 'coveredFraction' else None)
    return {'coverage_metrics': result}, {'sampleCount': len(data['sample_ids']), 'magCount': len(data['mag_ids']),
            'metrics': list(files), 'units': {'meanCoverage': 'fold', 'coveredFraction': 'fraction', 'readCount': 'reads',
                                           'variance': 'coverage variance', 'readsPerBase': 'reads/base'}}


def parse_quality(files, dependencies, spec):
    source = index(rows(files['report']), 'Name', files['report'])
    fields = {'Completeness': ('completenessPercent', 100), 'Contamination': ('contaminationPercent', 100),
              'Coding_Density': ('codingDensity', 1), 'GC_Content': ('gcContent', 1),
              'Contig_N50': ('contigN50Bp', None), 'Genome_Size': ('genomeSizeBp', None),
              'Total_Coding_Sequences': ('totalCodingSequences', None), 'Total_Contigs': ('totalContigs', None),
              'Max_Contig_Length': ('maxContigLengthBp', None)}
    result = []
    for mid, raw in source.items():
        row = {'magId': mid, 'completenessModel': raw['Completeness_Model_Used']}
        for name, (target, limit) in fields.items():
            row[target] = number(raw[name], mid, maximum=limit, integer=limit is None)
        row['inReferenceBand'] = row['completenessPercent'] >= 90 and row['contaminationPercent'] <= 5
        result.append(row)
    by_id = {r['magId']: r for r in result}
    for rep in dependencies['abundance']['representatives']:
        require(rep['magId'] in by_id and by_id[rep['magId']]['genomeSizeBp'] == rep['lengthBp'], 'CheckM2', f'representative length and quality: {rep["magId"]}')
    tool = {'name': 'CheckM2'}
    if 'log' in files:
        version = re.search(r'Running CheckM2 version (\S+)', files['log'].read_text(encoding='utf-8'))
        if version:
            tool['version'] = version.group(1)
    return {'quality': result}, {'assessedBins': len(result), 'referenceBandCount': sum(r['inReferenceBand'] for r in result), 'tool': tool}


def parse_taxonomy(files, dependencies, spec):
    result = []
    for name in ('bacteria', 'archaea'):
        for raw in rows(files[name]):
            ranks = raw['classification'].split(';')
            require(len(ranks) == len(RANKS), files[name], 'seven GTDB ranks')
            result.append({'magId': raw['user_genome'], **{rank: value.split('__', 1)[-1] for rank, value in zip(RANKS, ranks, strict=True)},
                           'classificationMethod': raw['classification_method'],
                           'closestReference': raw.get('closest_genome_reference') if raw.get('closest_genome_reference') not in {'N/A', ''} else None,
                           'closestAni': number(raw.get('closest_genome_ani'), name, maximum=100, optional=True),
                           'closestAf': number(raw.get('closest_genome_af'), name, maximum=1, optional=True),
                           'msaPercent': number(raw.get('msa_percent'), name, maximum=100, optional=True)})
    keyed = index(result, 'magId', 'GTDBTk')
    require(set(keyed) == set(dependencies['abundance']['mag_ids']), 'GTDBTk', 'taxonomy equals representative set')
    run = json.loads(files['run'].read_text(encoding='utf-8')) if 'run' in files else {}
    return {'taxonomy': result}, {'magCount': len(result), 'domains': dict(Counter(r['domain'] for r in result)),
                                 'tool': {'name': 'GTDB-Tk', 'version': run.get('version'), 'databaseRelease': run.get('database_version')}}


def parse_drep(files, dependencies, spec):
    samples = {r['sampleId']: r for r in dependencies['samples']['samples']}
    quality = {r['magId']: r for r in dependencies['quality']['quality']}
    assignments = index(rows(files['clusters']), 'genome', files['clusters'])
    winners = index(rows(files['winners']), 'cluster', files['winners'])
    members = defaultdict(list)
    for raw in assignments.values():
        members[raw['secondary_cluster']].append(raw)
    require(set(members) == set(winners), 'dRep', 'one winner per cluster')
    reps = {mag_id(r['genome']) for r in winners.values()}
    require(reps == set(dependencies['abundance']['mag_ids']), 'dRep', 'representatives equal abundance MAGs')
    directional = {}
    for raw in rows(files['comparisons']):
        reference, query = mag_id(raw['reference']), mag_id(raw['querry'])
        if reference in reps:
            key = (reference, query)
            require(key not in directional, 'Ndb', f'unique directional pair {key}')
            directional[key] = (number(raw['ani'], 'Ndb', maximum=1), number(raw['alignment_coverage'], 'Ndb', maximum=1))
    result = []
    for cluster, cluster_rows in members.items():
        winner = winners[cluster]
        representative = mag_id(winner['genome'])
        require(sum(mag_id(r['genome']) == representative for r in cluster_rows) == 1, cluster, 'winner is a member')
        for raw in cluster_rows:
            mid = mag_id(raw['genome'])
            require((representative, mid) in directional, 'Ndb', f'directional representative-reference/member-query pair for {mid}')
            ani, af = directional[(representative, mid)]
            row = {'clusterId': cluster, 'representativeMag': representative, 'memberMag': mid,
                   'isRepresentative': representative == mid, 'clusterMemberCount': len(cluster_rows),
                   'memberToRepAni': ani, 'memberToRepAlignmentCoverage': af,
                   'aniDirection': 'representative_reference__member_query',
                   'representativeScore': float(winner['score']),
                   'secondaryClusterDistanceThreshold': float(raw['threshold']),
                   'equivalentAniThreshold': 1 - float(raw['threshold']),
                   'clusterMethod': raw['cluster_method'], 'comparisonAlgorithm': raw['comparison_algorithm'],
                   'primaryCluster': raw['primary_cluster']}
            for prefix, code in (('member', mid), ('representative', representative)):
                sid = code.split('__', 1)[0]
                require(sid in samples and code in quality, code, 'known source sample and quality record')
                s, q = samples[sid], quality[code]
                row.update({prefix+'SourceSampleId': sid, prefix+'SampleName': s['sampleName'],
                            prefix+'SampleAccession': s['accession'], prefix+'Disease': s['disease'],
                            prefix+'Group': s['sourceGroup'], prefix+'HpcBatch': s['batch'],
                            prefix+'CompletenessPercent': q['completenessPercent'], prefix+'ContaminationPercent': q['contaminationPercent']})
            result.append(row)
    index(result, 'memberMag', 'dRep')
    parameters = json.loads(files['parameters'].read_text(encoding='utf-8')) if 'parameters' in files else {}
    input_verification = {}
    expected_members = {mag_id(name) for name in assignments}
    for role in ('input_quality', 'script_quality'):
        if role not in files:
            continue
        source_rows = index(rows(files[role]), 'genome', files[role])
        require({mag_id(name) for name in source_rows} == expected_members, role, 'input MAG IDs equal Cdb members')
        for name, raw in source_rows.items():
            q = quality[mag_id(name)]
            require(abs(float(raw['completeness']) - q['completenessPercent']) < 1e-8
                    and abs(float(raw['contamination']) - q['contaminationPercent']) < 1e-8,
                    name, 'input quality values equal CheckM2 report')
        input_verification[role] = len(source_rows)
    if 'input_list' in files:
        listed = [mag_id(line.strip().rsplit('/', 1)[-1]) for line in files['input_list'].read_text().splitlines() if line.strip()]
        require(len(listed) == len(set(listed)) and set(listed) == expected_members, 'input_list', 'unique Cdb member set')
        input_verification['input_list'] = len(listed)
    if 'input_filtered' in files:
        filtered = index(rows(files['input_filtered']), 'Name', files['input_filtered'])
        require({mag_id(name) for name in filtered} == expected_members, 'input_filtered', 'filtered MAG IDs equal Cdb members')
        for name, raw in filtered.items():
            q = quality[mag_id(name)]
            require(abs(float(raw['Completeness']) - q['completenessPercent']) < 1e-8
                    and abs(float(raw['Contamination']) - q['contaminationPercent']) < 1e-8,
                    name, 'filtered quality values equal CheckM2 report')
        input_verification['input_filtered'] = len(filtered)
    return {'lineage': result}, {'qualifiedBins': len(result), 'representativeMags': len(reps),
                                'clusterCount': len(members), 'below095AniCount': sum(r['memberToRepAni'] < .95 for r in result),
                                'inputVerification': input_verification,
                                'parameters': {key: parameters.get(key) for key in ('completeness','contamination','P_ani','S_ani','clusterAlg','S_algorithm')}}


def parse_arg(files, dependencies, spec):
    mags = set(dependencies['abundance']['mag_ids'])
    manifest = index(rows(files['manifest']), 'MAG', files['manifest'])
    require(set(manifest) == mags, 'DRAMMA', 'run manifest covers representative set')
    counts = index(rows(files['counts']), 'MAG', files['counts'])
    require(set(counts) == mags, 'DRAMMA', 'counts cover representative set')
    hits = {}
    for category, name in (('known_hmm_hit', 'known'), ('novel_candidate', 'novel075')):
        for raw in rows(files[name]):
            key = raw['MAG'] + '|' + raw['Protein_ID']
            require(raw['MAG'] in mags and key not in hits, name, 'unique protein in known/novel result sets')
            hits[key] = {'id': key, 'magId': raw['MAG'], 'proteinId': raw['Protein_ID'], 'contigId': raw['Contig_ID'],
                         'category': category, 'queryName': raw['query_name'], 'modelScore': number(raw['prob'], name, maximum=1),
                         'label': int(raw['Label']), 'passes': {k: v.lower() == 'true' for k, v in raw.items() if k.startswith('passed_')}}
    narrow = set()
    for raw in rows(files['novel095']):
        key = raw['MAG'] + '|' + raw['Protein_ID']
        require(key in hits and hits[key]['category'] == 'novel_candidate' and key not in narrow, 'DRAMMA', 'p095 subset of p075')
        narrow.add(key)
    per_known = Counter(r['magId'] for r in hits.values() if r['category'] == 'known_hmm_hit')
    per_novel = Counter(r['magId'] for r in hits.values() if r['category'] == 'novel_candidate')
    per_narrow = Counter(hits[key]['magId'] for key in narrow)
    summary = []
    for mid, raw in counts.items():
        for name, actual in [('Known_ARG_hits', per_known[mid]), ('Novel_candidates_p075', per_novel[mid]), ('Novel_candidates_p095', per_narrow[mid])]:
            require(int(raw[name]) == actual, mid, f'counts equal protein detail: {name}')
        summary.append({'magId': mid, 'knownHits': per_known[mid], 'novel075': per_novel[mid], 'novel095': per_narrow[mid],
                        'totalProteins': int(raw['Total_predicted_proteins']), 'status': manifest[mid]['Status']})
    failures = [r['magId'] for r in summary if r['status'] != 'success']
    return {'arg_summary': summary, 'arg_hits': list(hits.values())}, {'magCount': len(summary), 'failedMags': failures,
            'status': 'partial' if failures else 'ready', 'knownHits': sum(per_known.values()),
            'novel075': sum(per_novel.values()), 'novel095': len(narrow),
            'note': 'HMM matches and model candidates are separate; upstream passed flags retained, not recomputed from prob.'}


def parse_genbank_region(path):
    text = path.read_text(encoding='utf-8')
    accession = re.search(r'^ACCESSION\s+(\S+)', text, re.M)
    if accession is None:
        raise MagDataError(str(path), 'GenBank accession', 'missing')
    start = re.search(r'Orig\. start\s*::\s*(\d+)', text)
    end = re.search(r'Orig\. end\s*::\s*(\d+)', text)
    if start is None or end is None:
        raise MagDataError(str(path), 'antiSMASH original coordinates', 'missing')
    features = text.split('FEATURES', 1)[1].split('\nORIGIN', 1)[0]
    region = re.search(r'\n     region\s+([^\n]+)(.*?)(?=\n     \S|\Z)', features, re.S)
    if region is None:
        raise MagDataError(str(path), 'region feature', 'missing')
    attributes = region.group(2)
    products = re.findall(r'/product="([^"]+)"', attributes)
    number_match = re.search(r'/region_number="(\d+)"', attributes)
    if number_match is None or not products:
        raise MagDataError(str(path), 'region number and product', 'missing')
    genes = []
    for match in re.finditer(r'\n     CDS\s+([^\n]+)(.*?)(?=\n     \S|\Z)', features, re.S):
        tag = re.search(r'/locus_tag="([^"]+)"', match.group(2))
        genes.append({'locusTag': tag.group(1) if tag else None, 'regionLocation': match.group(1).strip()})
    return {'contigId': accession.group(1), 'regionNumber': int(number_match.group(1)),
            'start': int(start.group(1)), 'end': int(end.group(1)), 'coordinateSystem': '0-based-half-open',
            'products': products, 'contigEdge': '/contig_edge="True"' in attributes, 'genes': genes, 'geneCount': len(genes)}


def parse_bgc(files, dependencies, spec):
    mags = set(dependencies['abundance']['mag_ids'])
    regions, statuses = [], {}
    paths = defaultdict(list)
    for path in files.values():
        paths[path.parent.name].append(path)
    for mid, group in paths.items():
        require(mid in mags, mid, 'BGC directory belongs to representative MAG')
        record_file = next((p for p in group if p.name == 'regions.js'), None)
        expected = None
        if record_file:
            text = record_file.read_text(encoding='utf-8')
            match = re.search(r'\bvar\s+recordData\s*=\s*', text)
            if match is None:
                raise MagDataError(str(record_file), 'recordData JSON assignment', 'missing')
            data, _ = json.JSONDecoder().raw_decode(text[match.end():])
            expected = sum(len(record.get('regions', [])) for record in data)
        gbks = [p for p in group if p.suffix == '.gbk']
        complete = expected is not None and expected == len(gbks)
        statuses[mid] = {'magId': mid, 'regionCount': len(gbks), 'status': 'success' if complete else 'partial', 'expectedRegions': expected}
        for path in gbks:
            row = parse_genbank_region(path)
            key = f'{mid}|{row["contigId"]}|{row["regionNumber"]}'
            regions.append({'id': key, 'magId': mid, **row, 'sourceName': path.name})
    index(regions, 'id', 'antiSMASH')
    for mid in mags - set(statuses):
        statuses[mid] = {'magId': mid, 'regionCount': None, 'status': 'not_provided', 'expectedRegions': None}
    incomplete = sum(r['status'] != 'success' for r in statuses.values())
    return {'bgc_regions': regions, 'bgc_status': list(statuses.values())}, {'regionCount': len(regions),
            'status': 'partial' if incomplete else 'ready', 'incompleteMags': incomplete,
            'products': dict(Counter(product for row in regions for product in row['products']))}


def newick_tree(text):
    tokens = re.findall(r"'(?:[^']|'')*'|[^\s(),:;]+|[(),:;]", re.sub(r'\[[^\]]*\]', '', text))
    position = 0

    def node():
        nonlocal position
        item = {}
        if tokens[position] == '(':
            position += 1
            children = [node()]
            while tokens[position] == ',':
                position += 1
                children.append(node())
            require(tokens[position] == ')', 'Newick', 'closing parenthesis')
            position += 1
            item['children'] = children
        if position < len(tokens) and tokens[position] not in {',', ')', ':', ';'}:
            item['name'] = tokens[position].strip("'").replace("''", "'")
            position += 1
        if position < len(tokens) and tokens[position] == ':':
            position += 1
            item['branchLength'] = number(tokens[position], 'Newick')
            position += 1
        return item

    root = node()
    require(position == len(tokens)-1 and tokens[position] == ';', 'Newick', 'one complete tree')
    return root


def parse_trees(files, dependencies, spec):
    result = []
    mags = set(dependencies['abundance']['mag_ids'])
    for name, path in files.items():
        tree = newick_tree(path.read_text(encoding='utf-8').strip())
        leaves = []

        def visit(node, leaf_list=leaves):
            if 'children' in node:
                for child in node['children']:
                    visit(child, leaf_list)
            else:
                leaf_list.append(node.get('name'))

        visit(tree)
        require(len(set(leaves)) == len(leaves) and set(leaves) <= mags, path, 'unique tree leaves belong to representative MAGs')
        result.append({'id': name, 'tree': tree, 'leafIds': leaves, 'sourceName': path.name, 'method': 'IQ-TREE'})
    return {'trees': result}, {'treeCount': len(result), 'leafCount': sum(len(r['leafIds']) for r in result)}


def parse_inventory(files, dependencies, spec):
    inventory = []
    base = files['inventory'].parent
    for raw in rows(files['inventory']):
        path = (base / raw['path']).resolve()
        require(path.is_relative_to(base) and path.is_file(), raw['path'], 'archived regular file under raw directory')
        require(path.stat().st_size == int(raw['bytes']), raw['path'], 'archived size matches copy receipt')
        inventory.append({'id': raw['path'], 'file': path.relative_to(base).as_posix(),
                          'bytes': int(raw['bytes']), 'sha256': raw['sha256']})
    index(inventory, 'id', 'archive inventory')
    return {'archived_files': inventory}, {'fileCount': len(inventory), 'totalBytes': sum(r['bytes'] for r in inventory),
                                         'note': 'Copy receipt verifies original bytes; parsed sources additionally hashed during import.'}


ADAPTERS = {'samples': (parse_samples, ()), 'coverm': (parse_coverm, ('samples',)), 'coverm_metrics': (parse_metrics, ('abundance',)),
            'checkm2': (parse_quality, ('abundance',)), 'gtdbtk': (parse_taxonomy, ('abundance',)),
            'drep': (parse_drep, ('samples', 'abundance', 'quality')), 'dramma': (parse_arg, ('abundance',)),
            'antismash': (parse_bgc, ('abundance',)), 'iqtree': (parse_trees, ('abundance',))}
ADAPTERS['archive_inventory'] = (parse_inventory, ())
ADAPTERS['dram_summary'] = (parse_dram, ('abundance', 'quality', 'taxonomy'))


def parse_script_methods(files, dependencies, spec):
    """Archive method descriptions; collected scripts are not execution receipts."""
    scripts = {key: {'file': spec['files'][key], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'bytes': path.stat().st_size} for key, path in files.items()}
    return {}, {'scope': 'collected-script-methods', 'scripts': scripts, 'scriptCount': len(scripts)}


ADAPTERS['script_methods'] = (parse_script_methods, ())
