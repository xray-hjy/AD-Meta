import { useState } from 'react';
import DataTableViewport from '../data-display/DataTableViewport';
import PaginationControls from '../data-display/PaginationControls';

const PAGE_SIZE = 100;

function percent(value) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`;
}

function Table({ ariaLabel, columns, rows }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  if (!rows?.length) return null;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  return (
    <details className="ordination-resources__detail">
      <summary onClick={() => setOpen(value => !value)}>
        {ariaLabel}（{rows.length} 项）
      </summary>
      {open ? <>
        <DataTableViewport
          ariaLabel={`${ariaLabel}，可滚动`}
          footer={`第 ${currentPage}/${pageCount} 页 · 每页最多 ${PAGE_SIZE} 项`}
        >
          <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>{pageRows.map((row, index) => (
            <tr key={`${row.feature || row.sample || row.axis || index}`}>
              {columns.map(column => <td key={column.key}>{column.format ? column.format(row[column.key]) : row[column.key]}</td>)}
            </tr>
          ))}</tbody>
        </DataTableViewport>
        <PaginationControls
          page={currentPage}
          pageCount={pageCount}
          onPageChange={setPage}
          ariaLabel={`${ariaLabel}分页`}
        />
      </> : null}
    </details>
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
