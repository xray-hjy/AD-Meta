export function fullCohortLabel(summary) {
  const fitted = summary.sampleCount === summary.cohortSampleCount
    ? `${summary.sampleCount} 样本` : `纳入 ${summary.sampleCount} / ${summary.cohortSampleCount} 样本`;
  return `${summary.projectAccession} 队列内关联分析 · 完整队列 · ${fitted}`;
}

export function covariateLabels(summary) {
  const labels = { age: '年龄', gender: '性别', batch: `处理批次（${summary.batchSourceColumn}）` };
  return summary.covariates.map(key => labels[key]).join('、');
}
