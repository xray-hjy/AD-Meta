export function getSelectableRuns(runs) {
  return runs.filter(run => run.selectorVisible !== false);
}

export function selectAnalysisRun(runs, requestedKey) {
  return runs.find(run => run.key === requestedKey)
    || runs.find(run => run.isDefault && run.selectorVisible !== false)
    || getSelectableRuns(runs)[0]
    || null;
}
