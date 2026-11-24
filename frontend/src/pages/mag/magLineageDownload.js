export function lineageMembersCsv(data) {
  const fields = Object.keys(data.items[0] || {});
  const columns = [...fields, 'dataFingerprint', 'requestFingerprint'];
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = data.items.map(row => ({ ...row, dataFingerprint: data.provenance.dataFingerprint,
    requestFingerprint: data.provenance.requestFingerprint }));
  return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))].map(row => row.map(escape).join(',')).join('\r\n');
}

export function downloadLineageMembers(data) {
  const url = URL.createObjectURL(new Blob([lineageMembersCsv(data)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `ADMeta-lineage-${data.cluster.clusterId}-${data.provenance.dataFingerprint.slice(0, 12)}-all-members.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
