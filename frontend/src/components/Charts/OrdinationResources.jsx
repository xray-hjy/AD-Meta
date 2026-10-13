import { useState } from 'react';
import ClientDataTable from '../data-display/ClientDataTable';
import ResultDisclosure from '../data-display/ResultDisclosure';

function percent(value) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`;
}

function Table({ ariaLabel, columns, rows }) {
  const [open, setOpen] = useState(false);
  if (!rows?.length) return null;
  return (
    <ResultDisclosure className="ordination-resources__detail result-section--table" title={`${ariaLabel}（${rows.length} 项）`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      {open ? (
        <ClientDataTable
          ariaLabel={`${ariaLabel}，可滚动`}
          rows={rows}
          renderRow={(row, index) => (
            <tr key={`${row.feature || row.sample || row.axis || index}`}>
              {columns.map(column => <td key={column.key}>{column.format ? column.format(row[column.key]) : row[column.key]}</td>)}
            </tr>
          )}
        >
          <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        </ClientDataTable>
      ) : null}
    </ResultDisclosure>
  );
}

export default function OrdinationResources({ data }) {
  const resources = data?.resources || {};
  const pca = data?.method === 'PCA';
  const componentSummary = resources.componentSummary || [];
  const loadings = resources.featureLoadings || [];
  const dispersion = resources.dispersionDistances || [];
  const eigen = resources.eigenDiagnostics || [];
  if (!componentSummary.length && !loadings.length && !dispersion.length && !eigen.length) return null;
  return (
    <section className="ordination-resources" aria-label="排序分析解释资源">
      <h4>计算解释资源</h4>
      {pca ? <>
        <Table ariaLabel="主成分解释率" rows={componentSummary} columns={[
          { key: 'component', label: '主成分' },
          { key: 'explainedVarianceRatio', label: '解释率', format: percent },
          { key: 'cumulativeExplainedVarianceRatio', label: '累计解释率', format: percent },
        ]} />
        <Table ariaLabel="特征载荷" rows={loadings} columns={[
          { key: 'selectionRank', label: '选择排序' }, { key: 'feature', label: '特征' },
          { key: 'meanRelativeAbundance', label: '平均相对丰度', format: percent },
          { key: 'pc1Loading', label: 'PC1 载荷', format: value => Number(value).toFixed(4) },
          { key: 'pc2Loading', label: 'PC2 载荷', format: value => Number(value).toFixed(4) },
        ]} />
      </> : <>
        <Table ariaLabel="样本到组质心的距离" rows={dispersion} columns={[
          { key: 'sample', label: '样本' }, { key: 'group', label: '分组' },
          { key: 'distanceToGroupCentroid', label: '距离', format: value => Number(value).toFixed(5) },
        ]} />
        <Table ariaLabel="PCoA 特征值诊断" rows={eigen} columns={[
          { key: 'axis', label: '轴' }, { key: 'sign', label: '符号' },
          { key: 'eigenvalue', label: '特征值', format: value => Number(value).toFixed(7) },
          { key: 'positiveExplainedVarianceRatio', label: '正轴解释率', format: percent },
        ]} />
      </>}
    </section>
  );
}
