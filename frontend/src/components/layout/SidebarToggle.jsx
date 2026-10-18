import { useSidebar } from './SidebarContext';

export default function SidebarToggle() {
  const { collapsed, registerToggle, regionId, toggle } = useSidebar() || {};
  if (!toggle) return null;

  const label = collapsed ? '展开导航栏' : '收起导航栏';
  return (
    <button
      ref={registerToggle}
      type="button"
      className="sidebar-toggle"
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls={regionId}
      title={label}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="sidebar-toggle__rail" d="M5 4v16" />
        <path className="sidebar-toggle__arrow" d="m15 8-4 4 4 4" />
      </svg>
    </button>
  );
}
