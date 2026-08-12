import { useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_SELECTION = Object.freeze({
  mode: 'ranked',
  ranking: 'mean_abundance',
  limit: 30,
  items: Object.freeze([]),
});

function storageKey(runKey, artifactKey, chartKey) {
  return `admeta:feature-selection:${runKey}:${artifactKey}:${chartKey}`;
}

function normalize(value) {
  if (!value || !['ranked', 'explicit'].includes(value.mode)) return { ...DEFAULT_SELECTION };
  const items = Array.isArray(value.items)
    ? value.items
      .filter(item => item?.featureId != null)
      .map(item => ({
        featureId: String(item.featureId),
        fullName: String(item.fullName || item.featureId),
        shortName: String(item.shortName || item.fullName || item.featureId),
        included: item.included !== false,
      }))
    : [];
  return {
    mode: value.mode,
    ranking: 'mean_abundance',
    limit: Number(value.limit) || 30,
    items,
  };
}

export default function useFeatureSelection(runKey, artifactKey, chartKey, enabled = true) {
  const key = useMemo(
    () => enabled && runKey && artifactKey ? storageKey(runKey, artifactKey, chartKey) : '',
    [artifactKey, chartKey, enabled, runKey]
  );
  const [state, setState] = useState(() => ({
    key: '',
    applied: { ...DEFAULT_SELECTION },
    draft: { ...DEFAULT_SELECTION },
  }));

  useEffect(() => {
    if (!key) return;
    let value;
    try {
      value = normalize(JSON.parse(window.sessionStorage.getItem(key) || 'null'));
    } catch {
      value = DEFAULT_SELECTION;
    }
    setState({ key, applied: value, draft: value });
  }, [key]);

  const update = useCallback(nextOrUpdater => {
    setState(current => {
      if (!key) return current;
      const currentValue = current.key === key ? current.draft : { ...DEFAULT_SELECTION };
      const nextValue = normalize(
        typeof nextOrUpdater === 'function' ? nextOrUpdater(currentValue) : nextOrUpdater
      );
      return {
        key,
        applied: current.key === key ? current.applied : { ...DEFAULT_SELECTION },
        draft: nextValue,
      };
    });
  }, [key]);

  const value = state.key === key ? state.draft : DEFAULT_SELECTION;
  const applied = state.key === key ? state.applied : DEFAULT_SELECTION;
  const ready = !enabled || !key || state.key === key;
  const selectionSignature = useCallback(selection => JSON.stringify({
    mode: selection.mode,
    limit: selection.limit,
    items: selection.items.map(item => ({
      featureId: String(item.featureId),
      included: item.included !== false,
    })),
  }), []);
  const isDirty = selectionSignature(value) !== selectionSignature(applied);
  const dirtyCount = useMemo(() => {
    if (!isDirty) return 0;
    if (value.mode !== applied.mode || value.mode === 'ranked') return 1;
    const draftItems = new Map(value.items.map(item => [
      String(item.featureId),
      item.included !== false,
    ]));
    const appliedItems = new Map(applied.items.map(item => [
      String(item.featureId),
      item.included !== false,
    ]));
    const ids = new Set([...draftItems.keys(), ...appliedItems.keys()]);
    return [...ids].filter(id => (
      !draftItems.has(id)
      || !appliedItems.has(id)
      || draftItems.get(id) !== appliedItems.get(id)
    )).length;
  }, [applied, isDirty, value]);

  const apply = useCallback(() => {
    setState(current => {
      if (!key || current.key !== key) return current;
      const nextValue = normalize(current.draft);
      if (
        nextValue.mode === 'explicit'
        && !nextValue.items.some(item => item.included !== false)
      ) return current;
      window.sessionStorage.setItem(key, JSON.stringify(nextValue));
      return { key, applied: nextValue, draft: nextValue };
    });
  }, [key]);

  const reset = useCallback(() => {
    setState(current => (
      !key || current.key !== key
        ? current
        : { ...current, draft: current.applied }
    ));
  }, [key]);

  const request = useMemo(() => (
    applied.mode === 'explicit' && applied.items.some(item => item.included !== false)
      ? {
        mode: 'explicit',
        ranking: 'mean_abundance',
        limit: applied.items.filter(item => item.included !== false).length,
        featureIds: applied.items
          .filter(item => item.included !== false)
          .map(item => String(item.featureId)),
      }
      : { mode: 'ranked', ranking: 'mean_abundance', limit: applied.limit, featureIds: [] }
  ), [applied]);

  return {
    value,
    applied,
    request,
    update,
    apply,
    reset,
    isDirty,
    dirtyCount,
    ready,
  };
}
