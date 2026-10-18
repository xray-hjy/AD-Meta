import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SidebarContext } from './SidebarContext';

const STORAGE_KEY = 'ad-meta:workspace:sidebar-collapsed-v1';

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function AppShell({ topbar, sidebar, main, tone = 'species' }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const regionId = useId();
  const regionRef = useRef(null);
  const toggleRef = useRef(null);
  const registerToggle = useCallback(node => {
    toggleRef.current = node;
  }, []);
  const toggle = useCallback(() => {
    if (!collapsed && regionRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus({ preventScroll: true });
    }
    setCollapsed(current => !current);
  }, [collapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Keep the control usable when browser storage is unavailable.
    }
  }, [collapsed]);

  const sidebarState = useMemo(
    () => ({ collapsed, toggle, regionId, registerToggle }),
    [collapsed, toggle, regionId, registerToggle],
  );

  return (
    <SidebarContext.Provider value={sidebarState}>
      <div className={`app app--${tone}${collapsed ? ' app--sidebar-collapsed' : ''}`}>
        {topbar}
        <div className="app-body">
          <div
            id={regionId}
            ref={regionRef}
            className="sidebar-region"
            aria-hidden={collapsed || undefined}
            inert={collapsed}
          >
            <div className="sidebar-region__content">{sidebar}</div>
          </div>
          {main}
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
