import { formatMagNumber } from './magDistributionView';
import DataTableViewport from '../../components/data-display/DataTableViewport';

export const MAG_COLUMNS = [
  { key: 'magId', label: 'MAG ID', hint: '研究证据', accessible: 'MAG ID（查看 MAG 研究证据）' },
  { key: 'taxonomy', label: 'GTDB 分类', hint: '层级', accessible: 'GTDB 分类 / 层级' },
  { key: 'adMeanPercent', label: 'AD 均值', hint: '%' },
  { key: 'ncMeanPercent', label: 'NC 均值', hint: '%' },
  { key: 'adMedianPercent', label: 'AD 中位数', hint: '%' },
  { key: 'ncMedianPercent', label: 'NC 中位数', hint: '%' },
  { key: 'meanDifferencePercentPoints', label: 'AD−NC', hint: '百分点' },
  { key: 'adAboveThresholdPercent', label: 'AD 超过阈值', hint: '%' },
  { key: 'ncAboveThresholdPercent', label: 'NC 超过阈值', hint: '%' },
  { key: 'rankBiserial', label: '秩效应量' },
  { key: 'pValue', label: 'p 值', hint: '未校正' },
  { key: 'qValue', label: 'BH-FDR q', hint: '秩检验' },
  { key: 'completenessPercent', label: '完整度', hint: '%' },
  { key: 'contaminationPercent', label: '污染率', hint: '%' },
  { key: 'lengthBp', label: '长度', hint: 'bp' },
];
export const MAG_COLUMN_PRESETS = {
  丰度: ['magId', 'taxonomy', 'adMeanPercent', 'ncMeanPercent', 'adMedianPercent', 'ncMedianPercent', 'meanDifferencePercentPoints'],
  差异: ['magId', 'taxonomy', 'adMeanPercent', 'ncMeanPercent', 'meanDifferencePercentPoints', 'rankBiserial', 'pValue', 'qValue'],
  质量: ['magId', 'taxonomy', 'completenessPercent', 'contaminationPercent', 'lengthBp'],
  全部: MAG_COLUMNS.map(column => column.key),
};
const RANK_LABELS = { domain: '域', phylum: '门', class: '纲', order: '目', family: '科', genus: '属', species: '种' };
const number = formatMagNumber;
const ADJUSTED_COLUMNS = [
  { key: 'adjustedBeta', label: '校正 β', hint: '完整队列', estimateField: 'beta' },
  { key: 'adjustedQValue', label: '校正 q', hint: '完整队列', estimateField: 'qValue' },
];

export default function MagFeatureTable({ data, onSelect, pagination, page, description, visibleColumns, adjustedByMag }) {
  const columns = MAG_COLUMNS.filter(column => column.key === 'magId' || visibleColumns.includes(column.key));
  if (adjustedByMag) columns.splice(visibleColumns.includes('taxonomy') ? 2 : 1, 0, ...ADJUSTED_COLUMNS);
  return <DataTableViewport ariaLabel="MAG 候选列表，可横向滚动" className="mag-feature-table" resizable pagination={pagination} pageKey={page} description={description}>
    <thead><tr>{columns.map(column => <th scope="col" key={column.key} className={column.key === 'magId' ? 'mag-feature-table__identity' : column.key === 'taxonomy' ? '' : 'mag-feature-table__numeric'}
      aria-label={column.accessible || [column.label, column.hint].filter(Boolean).join(' ')}>
      {column.label}{column.hint ? <> <span className="mag-feature-table__hint">{column.hint}</span></> : null}
    </th>)}</tr></thead>
    <tbody>{data.items.map(row => {
      const adjusted = adjustedByMag?.get(row.magId);
      return <tr key={row.magId}>{columns.map(column => {
        if (column.estimateField) {
          const value = adjusted?.[column.estimateField];
          return <td key={column.key} className="mag-feature-table__numeric"
            title={value == null ? adjusted?.reason || '当前发布无此项估计' : String(value)}>{number(value)}</td>;
        }
        return <td key={column.key} className={column.key === 'magId' ? 'mag-feature-table__identity' : column.key === 'taxonomy' ? '' : 'mag-feature-table__numeric'}>
          {column.key === 'magId' ? <button className="analysis-text-button" title={`点击查看 MAG 研究证据 · ${row.taxonomyName || '分类未解析'} · ${row.magId}`} onClick={() => onSelect(row.magId)}>{row.magId}</button>
            : column.key === 'taxonomy' ? <>{row.taxonomyName || '未解析'}{row.taxonomyRank ? <small>（{RANK_LABELS[row.taxonomyRank] || row.taxonomyRank}级）</small> : null}</>
              : column.key === 'lengthBp' ? row.lengthBp?.toLocaleString('en-US') || '—' : number(row[column.key])}
        </td>;
      })}</tr>;
    })}</tbody>
  </DataTableViewport>;
}
