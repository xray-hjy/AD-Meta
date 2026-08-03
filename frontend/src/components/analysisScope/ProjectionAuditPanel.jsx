import { useEffect, useId, useMemo, useState } from 'react';
import useProjectionAudit from '../../hooks/useProjectionAudit';
import useProjectionAuditOptions from '../../hooks/useProjectionAuditOptions';
import AuditFilterSelect from './AuditFilterSelect';
import ScopedSampleList from './ScopedSampleList';

const PRIMARY_SECTION = {
  abundance: 'selection',
  composition: 'aggregation',
  ko_contribution: 'contribution_selection',
  boxplot: 'feature_selection',
  pca: 'feature_selection',
  pcoa: 'ordination_filter',
  heatmap: 'statistical_filter',
  detection: 'detection_filter',
  differential_ko: 'statistical_filter',
  taxonomy: 'hierarchy_aggregation',
  taxonomy_sankey: 'hierarchy_aggregation',
};

const SECTION_LABELS = {
  selection: '展示与未展示特征',
  contribution_selection: '展示与未展示 KO',
  aggregation: 'Other 合并明细',
  feature_selection: '计算特征选择',
  ordination_filter: '排序分析过滤明细',
  statistical_filter: '统计筛选明细',
  detection_filter: '检出与展示筛选',
  hierarchy_aggregation: '层级合并明细',
  sankey_layout: '桑基布局压缩',
};

const STATUS_LABELS = {
  displayed: '已展示',
  merged: '已合并',
  excluded: '未进入当前展示',
  filtered: '未通过筛选',
  display_cap: '通过筛选，受展示上限限制',
};

const REASON_LABELS = {
  within_top_n: '位于当前 Top N',
  outside_top_n: '位于当前 Top N 之外',
  category_top_n_aggregation: '按类别 Top N 合并到 Other',
  largest_detection_rate_gap: '按检出率差排序进入展示',
  not_detected_above_threshold: '没有样本超过检出阈值',
  significance_effect_rank: '通过显著性与效应阈值并进入展示',
  q_value_threshold: '未通过 q 值阈值',
  effect_size_threshold: '未通过效应量阈值',
  below_prevalence_threshold: '未通过最低检出比例',
  balanced_effect_ranking: '按组间效应平衡排序进入展示',
  outside_balanced_top_n: '显著但位于分组平衡展示上限之外',
  taxonomy_long_tail_aggregation: '分类层级长尾合并',
  nonzero_visible_path: '非零丰度且分类路径完整展示',
  non_positive_or_unmapped: '非正丰度或未映射到展示树',
  sankey_layout_projection: '为控制桑基图列密度进行布局压缩',
  retained_unfiltered: '未启用物种过滤，保留进入分析的物种',
  meets_ordination_filter: '同时满足相对丰度与检出率阈值',
  below_minimum_relative_abundance: '未达到最低相对丰度阈值',
  below_minimum_prevalence: '未达到最低检出率阈值',
};

const TOP_N_ROLE_LABELS = {
  feature_selection: '计算前特征选择',
  display_cap: '合格结果展示上限',
  aggregation_limit: '长尾聚合上限',
  not_applicable: '当前图不使用通用 Top N',
};

const MERGE_AUDIT_KINDS = new Set(['composition', 'taxonomy', 'taxonomy_sankey']);

function formatNumber(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (number !== 0 && Math.abs(number) < 0.001) return number.toExponential(3);
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(number);
}

function formatCell(value, format) {
  if (format === 'percent') return value == null ? '—' : `${(Number(value) * 100).toFixed(3)}%`;
  if (format === 'number') return formatNumber(value);
  if (format === 'integer') return value == null ? '—' : new Intl.NumberFormat('zh-CN').format(Number(value));
  if (format === 'status') return STATUS_LABELS[value] || value || '—';
  if (format === 'reason') return REASON_LABELS[value] || value || '—';
  if (value == null || value === '') return '—';
  return String(value);
}

function initialSections(kind) {
  const sections = [PRIMARY_SECTION[kind] || 'selection'];
  if (kind === 'taxonomy_sankey') sections.push('sankey_layout');
  return sections;
}

const SAMPLE_PROMINENT_KINDS = new Set([
  'heatmap',
  'detection',
  'differential_ko',
  'pca',
  'pcoa',
]);

const EMPTY_FILTERS = {
  feature: '',
  sample: '',
  status: '',
  reason: '',
};

const FILTER_FIELDS = [
  { key: 'feature', label: '特征', emptyLabel: '全部特征' },
  { key: 'sample', label: '样本', emptyLabel: '全部参与样本' },
  { key: 'status', label: '处理结果', emptyLabel: '全部处理结果' },
  { key: 'reason', label: '原因', emptyLabel: '全部原因' },
];

function filterOptionLabel(field, option) {
  if (field === 'sample') {
    return [option.label, option.group].filter(Boolean).join(' · ');
  }
  if (field === 'status') return STATUS_LABELS[option.value] || option.label;
  if (field === 'reason') return REASON_LABELS[option.value] || option.label;
  return option.label;
}

function sampleScopeView(scopeInfo, requestScope) {
  const scope = scopeInfo?.mode ? scopeInfo : requestScope || {};
  const mode = scope.mode || 'cohort';
  const count = Number(scopeInfo?.sampleCount ?? 0);
  const groups = scopeInfo?.groupCounts || {};
  if (mode === 'group') {
    const group = scopeInfo?.group || requestScope?.groups?.[0] || '';
    return { label: `${group} 组`, detail: `${count} 个样本`, count };
  }
  if (mode === 'sample') {
    const sampleCode = scopeInfo?.sampleCode || requestScope?.sampleCodes?.[0] || '';
    const group = Object.keys(groups)[0];
    return { label: '单样本', detail: [sampleCode, group].filter(Boolean).join(' · '), count };
  }
  const groupDetail = [
    groups.AD != null ? `AD ${groups.AD}` : '',
    groups.NC != null ? `NC ${groups.NC}` : '',
  ].filter(Boolean).join(' · ');
  if (mode === 'subset') {
    return { label: '自定义子集', detail: [`${count} 个样本`, groupDetail].filter(Boolean).join(' · '), count };
  }
  return { label: '全部样本', detail: [`${count} 个样本`, groupDetail].filter(Boolean).join(' · '), count };
}

export default function ProjectionAuditPanel({
  runKey,
  artifactKey,
  projectionKind,
  projectionRequest,
  projectionData,
}) {
  const projectionKey = projectionData?.projectionKey || '';
  const filterFormId = useId();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(PRIMARY_SECTION[projectionKind] || 'selection');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [filterDraft, setFilterDraft] = useState({ ...EMPTY_FILTERS });
  const [optionSearches, setOptionSearches] = useState({ ...EMPTY_FILTERS });
  const [enabledOptionFields, setEnabledOptionFields] = useState([]);
  const [sort, setSort] = useState({ by: '', direction: 'asc' });
  const [offset, setOffset] = useState(0);
  const limit = 100;

  useEffect(() => {
    setSection(PRIMARY_SECTION[projectionKind] || 'selection');
    setFilters({ ...EMPTY_FILTERS });
    setFilterDraft({ ...EMPTY_FILTERS });
    setOptionSearches({ ...EMPTY_FILTERS });
    setEnabledOptionFields([]);
    setSort({ by: '', direction: 'asc' });
    setOffset(0);
  }, [projectionKey, projectionKind]);

  const auditRequest = useMemo(() => ({
    projectionKey,
    ...projectionRequest,
    section,
    filters,
    sortBy: sort.by,
    sortDirection: sort.direction,
    limit,
    offset,
  }), [filters, limit, offset, projectionKey, projectionRequest, section, sort]);
  const state = useProjectionAudit(
    runKey,
    artifactKey,
    projectionKind,
    auditRequest,
    open,
  );
  const optionStates = useProjectionAuditOptions(
    runKey,
    artifactKey,
    projectionKind,
    auditRequest,
    optionSearches,
    enabledOptionFields,
    open && Boolean(state.data),
  );
  const sections = state.data?.sections?.map(item => item.key)
    || initialSections(projectionKind);
  const columns = state.data?.columns || [];
  const summary = state.data?.summary || {};
  const scopeFallback = {
    ...(projectionData?.scope || projectionRequest?.scope || {}),
    sampleCount: projectionData?.projection?.sampleCount,
    groupCounts: projectionData?.projection?.groupCounts || {},
  };
  const scopeView = sampleScopeView(state.data?.sampleScope || scopeFallback, projectionRequest?.scope);
  const sampleListProminent = projectionRequest?.scope?.mode !== 'cohort'
    || SAMPLE_PROMINENT_KINDS.has(projectionKind);
  const total = state.data?.total || 0;
  const pageStart = total ? offset + 1 : 0;
  const pageEnd = Math.min(offset + limit, total);

  const chooseSection = next => {
    setSection(next);
    setFilters({ ...EMPTY_FILTERS });
    setFilterDraft({ ...EMPTY_FILTERS });
    setOptionSearches({ ...EMPTY_FILTERS });
    setEnabledOptionFields([]);
    setSort({ by: '', direction: 'asc' });
    setOffset(0);
  };

  const submitFilters = event => {
    event.preventDefault();
    setOffset(0);
    setFilters({ ...filterDraft });
  };

  const clearFilters = () => {
    setFilterDraft({ ...EMPTY_FILTERS });
    setFilters({ ...EMPTY_FILTERS });
    setOffset(0);
  };

  const toggleSort = column => {
    if (!column.sortable) return;
    setSort(current => {
      if (current.by === column.key) {
        return {
          by: column.key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        by: column.key,
        direction: column.key === 'rank' || !column.format ? 'asc' : 'desc',
      };
    });
    setOffset(0);
  };

  const hasFilters = Object.values(filters).some(Boolean)
    || Object.values(filterDraft).some(Boolean);

  return (
    <details className="projection-audit" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>查看筛选与合并明细</summary>
      {open ? (
        <div className="projection-audit__content">
          <p className="projection-audit__context">明细与当前图表参数及投影版本一致。</p>
          <div className="projection-audit__scope" aria-label="当前分析范围">
            <span>分析范围</span>
            <strong>{scopeView.label}</strong>
            {scopeView.detail ? <span>{scopeView.detail}</span> : null}
          </div>
          <ScopedSampleList
            runKey={runKey}
            artifactKey={artifactKey}
            scope={projectionRequest?.scope}
            sampleCount={scopeView.count}
            prominent={sampleListProminent}
          />
          <div className="projection-audit__tabs" role="tablist" aria-label="审计明细类型">
            {sections.map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                className={section === key ? 'is-active' : ''}
                onClick={() => chooseSection(key)}
              >
                {SECTION_LABELS[key] || key}
              </button>
            ))}
          </div>
          {state.data ? (
            <dl className="projection-audit__summary">
              <div><dt>样本</dt><dd>{formatNumber(summary.sampleCount)}</dd></div>
              <div><dt>源特征</dt><dd>{formatNumber(summary.sourceFeatureCount)}</dd></div>
              <div><dt>当前展示</dt><dd>{formatNumber(summary.returnedFeatureCount)}</dd></div>
              {MERGE_AUDIT_KINDS.has(projectionKind) ? (
                <div><dt>合并</dt><dd>{formatNumber(summary.mergedFeatureCount ?? 0)}</dd></div>
              ) : null}
              <div><dt>未展示</dt><dd>{formatNumber(summary.truncatedFeatureCount ?? 0)}</dd></div>
              {summary.topNRole && summary.topNRole !== 'not_applicable' ? (
                <div>
                  <dt>Top N 作用</dt>
                  <dd>{TOP_N_ROLE_LABELS[summary.topNRole] || summary.topNRole}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="projection-audit__toolbar">
            <form className="projection-audit__filter-form" onSubmit={submitFilters}>
              {FILTER_FIELDS.map(field => {
                const inputId = `${filterFormId}-${field.key}`;
                return (
                  <AuditFilterSelect
                    id={inputId}
                    key={field.key}
                    label={field.label}
                    emptyLabel={field.emptyLabel}
                    value={filterDraft[field.key]}
                    options={optionStates[field.key]?.items || []}
                    loading={optionStates[field.key]?.loading || false}
                    search={optionSearches[field.key]}
                    optionLabel={option => filterOptionLabel(field.key, option)}
                    onOpen={() => setEnabledOptionFields(current => (
                      current.includes(field.key) ? current : [...current, field.key]
                    ))}
                    onSearch={value => setOptionSearches(current => ({
                      ...current,
                      [field.key]: value,
                    }))}
                    onChange={value => setFilterDraft(current => ({
                        ...current,
                        [field.key]: value,
                    }))}
                  />
                );
              })}
              <div className="projection-audit__filter-actions">
                <button type="submit" disabled={state.fetching}>查询</button>
                <button type="button" disabled={!hasFilters || state.fetching} onClick={clearFilters}>
                  清空
                </button>
              </div>
            </form>
            <span>{state.fetching ? '正在读取...' : `共 ${total} 条，显示 ${pageStart}-${pageEnd}`}</span>
          </div>
          {state.error ? (
            <div className="projection-audit__message is-error">
              <span>{state.error}</span>
              <button type="button" onClick={() => state.reload()}>重试</button>
            </div>
          ) : null}
          {!state.error && state.loading ? (
            <div className="projection-audit__message">正在生成当前投影的可追溯明细...</div>
          ) : null}
          {!state.error && !state.loading ? (
            <div className="projection-audit__table-scroll">
              <table>
                <thead>
                  <tr>
                    {columns.map(column => {
                      const active = sort.by === column.key;
                      const ariaSort = active
                        ? (sort.direction === 'asc' ? 'ascending' : 'descending')
                        : 'none';
                      return (
                        <th key={column.key} aria-sort={column.sortable ? ariaSort : undefined}>
                          {column.sortable ? (
                            <button
                              type="button"
                              className={`projection-audit__sort${active ? ' is-active' : ''}`}
                              onClick={() => toggleSort(column)}
                              title={`${column.label}：点击排序`}
                            >
                              <span>{column.label}</span>
                              <span className="projection-audit__sort-indicator" aria-hidden="true">
                                {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </button>
                          ) : column.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(state.data?.items || []).map((item, index) => (
                    <tr key={`${section}-${offset + index}`}>
                      {columns.map(column => (
                        <td key={column.key} title={String(item[column.key] ?? '')}>
                          {formatCell(item[column.key], column.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!state.data?.items?.length ? (
                    <tr><td colSpan={Math.max(1, columns.length)}>当前条件下没有明细记录。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="projection-audit__pagination">
            <button type="button" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              上一页
            </button>
            <button type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </details>
  );
}
