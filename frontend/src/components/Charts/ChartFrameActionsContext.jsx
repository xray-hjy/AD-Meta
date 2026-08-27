import { createContext, useContext, useEffect, useRef } from 'react';

const ChartFrameActionsContext = createContext(null);

export function ChartFrameActionsProvider({ registerActions, children }) {
  return (
    <ChartFrameActionsContext.Provider value={registerActions}>
      {children}
    </ChartFrameActionsContext.Provider>
  );
}

export function useChartFrameActions(actions, enabled = true) {
  const registerActions = useContext(ChartFrameActionsContext);
  const ownerRef = useRef(Symbol('chart-frame-actions'));

  useEffect(() => {
    if (!registerActions || !enabled) return undefined;
    return registerActions(ownerRef.current, actions);
  }, [actions, enabled, registerActions]);
}

