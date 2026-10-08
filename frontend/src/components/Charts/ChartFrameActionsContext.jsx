import { createContext, useContext, useEffect, useRef } from 'react';

const ChartFrameActionsContext = createContext(null);
const ChartFrameToolbarContext = createContext(null);
export const ChartFrameSupplementContext = createContext(null);

export function ChartFrameActionsProvider({ registerActions, toolbarTarget = null, supplementTarget = null, children }) {
  return (
    <ChartFrameActionsContext.Provider value={registerActions}>
      <ChartFrameToolbarContext.Provider value={toolbarTarget}>
        <ChartFrameSupplementContext.Provider value={supplementTarget}>{children}</ChartFrameSupplementContext.Provider>
      </ChartFrameToolbarContext.Provider>
    </ChartFrameActionsContext.Provider>
  );
}

export function useChartFrameToolbarTarget() {
  return useContext(ChartFrameToolbarContext);
}

export function useChartFrameActions(actions, enabled = true) {
  const registerActions = useContext(ChartFrameActionsContext);
  const ownerRef = useRef(Symbol('chart-frame-actions'));

  useEffect(() => {
    if (!registerActions || !enabled) return undefined;
    return registerActions(ownerRef.current, actions);
  }, [actions, enabled, registerActions]);
}

