const DATA_TYPES = {
  taxonomy: '物种丰度',
  ko: '群落 KO 丰度',
};

const ABUNDANCE_SCALES = {
  counts: '计数',
  relative_abundance: '相对丰度',
  normalized_abundance: '标准化丰度',
};

const MISSING_VALUE_POLICIES = {
  error: '缺失值不允许导入',
  zero: '缺失值补零',
};

const DUPLICATE_FEATURE_POLICIES = {
  reject: '重复特征列不允许导入',
  coalesce_equal_selected: '所选样本中数值一致的重复特征列合并',
};

function displayValue(value, vocabulary = {}) {
  if (value == null || value === '' || value === 'unknown') return '未提供';
  return vocabulary[value] || value;
}

function formatCount(value) {
  return value == null ? '未提供' : value.toLocaleString();
}

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function DatasetSemanticsNotice({ abundanceScale, normalization }) {
  return (
    <span className="dataset-semantics-notice">
      丰度尺度：{displayValue(abundanceScale, ABUNDANCE_SCALES)} · 标准化方法：{displayValue(normalization)}
    </span>
  );
}

export default function DatasetDescription({ id, data, loading, error, revision, onRetry }) {
  const groupSummary = data && Object.entries(data.groupCounts)
    .map(([group, count]) => `${group} ${formatCount(count)}`)
    .join(' · ');
  const sampleScope = data?.sampleIdPrefixes?.length
    ? data.sampleIdPrefixes.join('、')
    : null;
  const originalSampleCount = data?.sampleCount != null && data?.excludedSampleCount != null
    ? data.sampleCount + data.excludedSampleCount
    : null;
  const groupMapping = data && Object.entries(data.groupMapping)
    .map(([source, group]) => `${source} → ${group}`)
    .join(' · ');

  return (
    <section id={id} className="dataset-description" aria-label="数据集信息">
      <div className="dataset-description__heading">
        <div>
          <span className="dataset-description__eyebrow">已发布数据集</span>
          <h3>数据集信息</h3>
          {data?.datasetName ? <p className="dataset-description__name">{data.datasetName}</p> : null}
        </div>
      </div>
      {!revision ? <p className="dataset-description__message">当前数据集未提供版本信息。</p> : null}
      {loading ? <p className="dataset-description__message" role="status">正在读取数据集信息…</p> : null}
      {error ? (
        <p className="dataset-description__message" role="alert">数据集信息暂时无法读取。<button type="button" onClick={onRetry}>重试</button></p>
      ) : null}
      {data ? (
        <>
          <dl className="dataset-description__facts">
            <Detail label="数据类型">{DATA_TYPES[data.featureKind] || data.featureLabel}</Detail>
            <Detail label="数据结构">样本 × {data.featureLabel}</Detail>
            <Detail label="样本数">{formatCount(data.sampleCount)}</Detail>
            <Detail label="特征数">{formatCount(data.featureCount)}</Detail>
            <Detail label="分组构成">{groupSummary || '未提供'}</Detail>
            <Detail label="丰度尺度">{displayValue(data.abundanceScale, ABUNDANCE_SCALES)}</Detail>
            <Detail label="标准化方法">{displayValue(data.normalization)}</Detail>
          </dl>
          {data.cohortSource ? (
            <section className="dataset-description__source" aria-label="样本与公开来源">
              <h4>样本与公开来源</h4>
              <dl>
                <Detail label="NGDC 测序项目">
                  <a href={data.cohortSource.studyUrl} target="_blank" rel="noopener noreferrer">
                    {data.cohortSource.studyAccession}
                  </a>
                </Detail>
                <Detail label="BioProject">
                  <a href={data.cohortSource.projectUrl} target="_blank" rel="noopener noreferrer">
                    {data.cohortSource.projectAccession}
                  </a>
                </Detail>
                <Detail label="样本核对">当前版本样本编号集合与登记的公开来源名单一致（{data.cohortSource.verifiedOn}）</Detail>
                {data.cohortSource.publication ? (
                  <Detail label="原始测序数据关联论文">
                    <a href={data.cohortSource.publication.url} target="_blank" rel="noopener noreferrer">
                      {data.cohortSource.publication.title}
                    </a>
                    <span className="dataset-description__citation">
                      {data.cohortSource.publication.journal} · {data.cohortSource.publication.year} · DOI: {data.cohortSource.publication.doi}
                    </span>
                  </Detail>
                ) : null}
              </dl>
            </section>
          ) : null}
          <details className="dataset-description__version">
            <summary>导入与版本信息</summary>
            <dl>
              {data.sourceFileName ? <Detail label="源文件">{data.sourceFileName}</Detail> : null}
              {originalSampleCount != null ? <Detail label="输入样本记录">{formatCount(originalSampleCount)}</Detail> : null}
              {sampleScope ? <Detail label="样本编号前缀">{sampleScope}</Detail> : null}
              {data.excludedSampleCount != null ? <Detail label="筛选排除">{formatCount(data.excludedSampleCount)}</Detail> : null}
              {groupMapping ? <Detail label="原始分组映射">{groupMapping}</Detail> : null}
              <Detail label="缺失值规则">{displayValue(data.missingValuePolicy, MISSING_VALUE_POLICIES)}</Detail>
              {data.imputedCellCount != null ? <Detail label="实际补齐单元格">{formatCount(data.imputedCellCount)}</Detail> : null}
              {data.duplicateFeaturePolicy ? <Detail label="重复特征规则">{displayValue(data.duplicateFeaturePolicy, DUPLICATE_FEATURE_POLICIES)}</Detail> : null}
              <Detail label="数据版本">{data.datasetRevision}</Detail>
              <Detail label="源文件 SHA-256">{data.sourceSha256}</Detail>
            </dl>
          </details>
        </>
      ) : null}
    </section>
  );
}
