import { useEffect, useMemo, useState } from 'react';
import { getNavigationSections } from '../../app/analysisDomains';

function groupCharts(charts) {
  const groups = [];
  const groupIndex = new Map();

  charts.forEach(chart => {
    if (!chart.group) {
      groups.push({ type: 'item', chart });
      return;
    }

    const key = chart.group.key;
    if (!groupIndex.has(key)) {
      groupIndex.set(key, groups.length);
      groups.push({
        type: 'group',
        key,
        label: chart.group.label,
        subtitle: chart.group.subtitle,
        children: [],
      });
    }

    groups[groupIndex.get(key)].children.push(chart);
  });

  return groups;
}

function sectionEntries(groupedCharts, section) {
  return groupedCharts.filter(entry => {
    const key = entry.type === 'group' ? entry.key : entry.chart.key;
    return section.charts.includes(key);
  });
}

function chartStatusLabel(chart) {
  return chart.status === 'planned' ? '规划中' : '';
}

function chartIsDisabled(chart) {
  return chart.status === 'planned' || chart.disabled === true;
}

function ChartLabel({ chart }) {
  const status = chartStatusLabel(chart);
  return (
    <span className="nav-item-label">
      {chart.label}
      {status ? <span className="nav-item-status">{status}</span> : null}
    </span>
  );
}

export default function ChartNav({ charts, activeChart, featureKind, onChange, onPrefetch }) {
  const groupedCharts = useMemo(() => groupCharts(charts), [charts]);
  const navigationSections = useMemo(() => getNavigationSections(featureKind), [featureKind]);
  const activeGroup = groupedCharts.find(group =>
    group.type === 'group' && group.children.some(child => child.key === activeChart)
  );
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(activeGroup ? [activeGroup.key] : []));

  useEffect(() => {
    if (!activeGroup) return;
    setExpandedGroups(current => {
      if (current.has(activeGroup.key)) return current;
      const next = new Set(current);
      next.add(activeGroup.key);
      return next;
    });
  }, [activeGroup]);

  function toggleGroup(key) {
    setExpandedGroups(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderEntry(entry) {
    if (entry.type === 'item') {
      const { chart } = entry;
      const disabled = chartIsDisabled(chart);
      return (
        <button
          key={chart.key}
          type="button"
          className={`nav-item ${activeChart === chart.key ? 'nav-item--active' : ''} ${disabled ? 'nav-item--disabled' : ''}`}
          disabled={disabled}
          aria-disabled={disabled}
          title={disabled ? chart.requirement || `${chart.label}：规划中` : undefined}
          onClick={() => onChange(chart.key)}
          onMouseEnter={() => onPrefetch?.(chart.key)}
          onFocus={() => onPrefetch?.(chart.key)}
        >
          <ChartLabel chart={chart} />
          <span className="nav-item-hint">{chart.subtitle}</span>
        </button>
      );
    }

    const expanded = expandedGroups.has(entry.key);
    const groupActive = entry.children.some(child => child.key === activeChart);

    return (
      <div className="nav-group" key={entry.key}>
        <button
          type="button"
          className={`nav-item nav-item--group ${groupActive ? 'nav-item--group-active' : ''}`}
          aria-expanded={expanded}
          onClick={() => toggleGroup(entry.key)}
        >
          <span className="nav-item-label">{entry.label}</span>
          <span className="nav-item-hint">{entry.subtitle}</span>
        </button>

        {expanded ? (
          <div className="nav-sublist">
            {entry.children.map(chart => (
              <button
                key={chart.key}
                type="button"
                className={`nav-item nav-item--child ${activeChart === chart.key ? 'nav-item--active' : ''} ${chartIsDisabled(chart) ? 'nav-item--disabled' : ''}`}
                disabled={chartIsDisabled(chart)}
                aria-disabled={chartIsDisabled(chart)}
                title={chartIsDisabled(chart) ? chart.requirement || `${chart.label}：规划中` : undefined}
                onClick={() => onChange(chart.key)}
                onMouseEnter={() => onPrefetch?.(chart.key)}
                onFocus={() => onPrefetch?.(chart.key)}
              >
                <ChartLabel chart={chart} />
                <span className="nav-item-hint">{chart.subtitle}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <nav className="nav-list" aria-label="图表导航">
      {navigationSections.map(section => {
        const entries = sectionEntries(groupedCharts, section);
        if (entries.length === 0) return null;
        return (
          <section className="analysis-nav-section" key={section.key}>
            <h4 className="analysis-nav-section__title">{section.label}</h4>
            <div className="analysis-nav-section__items">
              {entries.map(renderEntry)}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
