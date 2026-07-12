# Frontend UI Refactor Update Log

## 2026-07-06: React Frontend Skeleton And UI System Plan

This document records the agreed direction for the AD-Meta frontend refactor.
It is written as an implementation update log, but the code changes should be
done in small steps so chart behavior and API contracts remain stable.

## 2026-07-06: Phase 1 Skeleton Refactor Implemented

The first implementation pass is complete. This pass intentionally keeps the
existing chart components and backend API payloads stable while introducing the
new frontend skeleton.

Implemented changes:

- Added `frontend/src/app/App.jsx` as the new composition-focused application
  entry.
- Kept `frontend/src/App.jsx` as a compatibility wrapper so existing imports
  still work.
- Added `frontend/src/app/chartRegistry.js` to centralize chart labels,
  availability rules, subtitles, and component mapping.
- Added `frontend/src/app/labels.js` for dataset and feature-kind labels.
- Added `frontend/src/api/datasets.js` so feature code no longer builds dataset
  API URLs directly.
- Added data hooks:
  - `frontend/src/hooks/useDatasets.js`
  - `frontend/src/hooks/useDatasetSummary.js`
  - `frontend/src/hooks/useChartData.js`
  - `frontend/src/hooks/useActiveChart.js`
- Added layout components:
  - `frontend/src/components/layout/AppShell.jsx`
  - `frontend/src/components/layout/TopBar.jsx`
  - `frontend/src/components/layout/Sidebar.jsx`
  - `frontend/src/components/layout/MainWorkspace.jsx`
- Added dataset UI components:
  - `frontend/src/components/dataset/DatasetSelect.jsx`
  - `frontend/src/components/dataset/DatasetSummary.jsx`
  - `frontend/src/components/dataset/ChartNav.jsx`
- Added lightweight shared UI components:
  - `frontend/src/components/ui/MetricCard.jsx`
  - `frontend/src/components/ui/LoadingState.jsx`
  - `frontend/src/components/ui/ErrorState.jsx`
  - `frontend/src/components/ui/EmptyState.jsx`
- Added `frontend/src/components/Charts/ChartFrame.jsx` to standardize chart
  page chrome, loading state, error state, and empty state.
- Replaced the previous frontend layout CSS with a token-based split:
  - `frontend/src/styles/tokens.css`
  - `frontend/src/styles/base.css`
  - `frontend/src/styles/layout.css`
  - `frontend/src/styles/components.css`
- Updated `frontend/src/App.test.jsx` to cover the new chart registry labels,
  scroll-region structure, KO/taxonomy chart filtering, and phylum metadata
  passthrough.

Validation completed:

```bash
npm --prefix frontend run build
npm --prefix frontend test -- --runInBand --watch=false
```

Results:

- Production build completed successfully.
- Frontend test suite passed: 6 suites, 21 tests.

Notes:

- Radix UI and `lucide-react` wrappers were not introduced in this pass. The
  skeleton now has local UI seams where Radix-based Select, Tabs, Tooltip,
  Dialog, and Popover wrappers can be added safely in the next pass.
- Existing chart components under `frontend/src/components/Charts/` were kept
  in place to avoid a high-risk move during the skeleton refactor.
- Chart internals were not rewritten. This pass focused on application shell,
  data flow, style system, and navigation structure.

## 2026-07-06: AD/NC Color Standardization

The AD and NC colors are now standardized against the KO composition chart
(`PhylumChart`) colors:

- AD: `#e74c3c`
- NC: `#2ecc71`

Updated areas:

- Global design tokens in `frontend/src/styles/tokens.css`.
- Abundance comparison bars in `frontend/src/components/Charts/BarChart.jsx`.
- Boxplot fills, borders, and outlier markers in
  `frontend/src/components/Charts/BoxPlot.jsx`.
- Heatmap group strips and summary labels in
  `frontend/src/components/Charts/Heatmap.jsx`.
- KO LDA enrichment bars and summary labels in
  `frontend/src/components/Charts/KoLdaBarChart.jsx`.
- KO LDA color assertions in
  `frontend/src/components/Charts/KoLdaBarChart.test.jsx`.

Validation completed:

```bash
npm --prefix frontend test -- --runInBand --watch=false
```

Result:

- Frontend test suite passed: 6 suites, 21 tests.

## 2026-07-06: Remove Nested Chart Cards And Fix Chart Sizing

The Sunburst, PCA, and PCoA views were still rendering their own bordered
containers inside the shared `ChartFrame`, which produced nested cards and
duplicated chart headers. Their ECharts instances also relied on percentage
height inside the new layout, which could collapse into an incorrect visual
ratio.

Updated areas:

- `frontend/src/components/Charts/SunburstChart.jsx`
  - Removed the inner bordered card.
  - Removed the duplicate ECharts title.
  - Kept the sunburst/treemap toggle as a floating chart action.
  - Set an explicit chart height so the sunburst no longer renders as a tiny
    chart near the top of a large panel.
- `frontend/src/components/Charts/OrdinationChart.jsx`
  - Removed the inner bordered card used by PCA and PCoA.
  - Removed duplicate ECharts title/subtitle text.
  - Set an explicit chart height for stable PCA/PCoA proportions.
  - Kept PERMANOVA as a simple footer row for PCoA.
- `frontend/src/components/Charts/PCAPlot.jsx`
  - Simplified to delegate display to `OrdinationChart`.
- `frontend/src/components/Charts/PCoAPlot.jsx`
  - Simplified to delegate display to `OrdinationChart`.
  - Cleaned the PERMANOVA footer text.
- `frontend/src/styles/components.css`
  - Added `chart-plain`, `chart-plain--sunburst`,
    `chart-plain--ordination`, `chart-plain__footer`, and
    `chart-floating-button`.

Validation completed:

```bash
npm --prefix frontend test -- --runInBand --watch=false
npm --prefix frontend run build
```

Results:

- Frontend test suite passed: 6 suites, 21 tests.
- Production build completed successfully.

## 2026-07-07: Merge Redundant Chart Text Into The Shared Frame

The first nested-card cleanup only addressed several obvious chart views. A
second pass applied the same rule across the remaining major visualizations:
the shared `ChartFrame` owns the page-level title, subtitle, border, and
spacing; chart components keep only chart-specific controls, metrics, and
legends.

Implemented changes:

- `frontend/src/components/Charts/BarChart.jsx`
  - Removed the internal ECharts title/subtitle.
  - Removed the internal bordered card.
  - Kept Top N controls as a lightweight control strip.
  - Cleaned visible Chinese labels in the chart option.
- `frontend/src/components/Charts/BoxPlot.jsx`
  - Removed the internal bordered card and duplicate title/subtitle.
  - Merged scale mode, selected feature count, and feature chips into the chart
    control area.
  - Cleaned tooltip labels.
- `frontend/src/components/Charts/PhylumChart.jsx`
  - Removed the internal card and duplicate composition title.
  - Converted the four summary cards into a compact inline stat strip.
  - Kept the D3 composition chart itself unchanged.
- `frontend/src/components/Charts/DetectionHeatmap.jsx`
  - Removed the internal card and nested information card.
  - Merged detection rule, sample counts, Top N, sorting, and interpretation
    notes into a single info strip.
- `frontend/src/components/Charts/KoLdaBarChart.jsx`
  - Removed the internal card and nested information card.
  - Merged p-value threshold, significant count, AD/NC enrichment counts,
    displayed Top N, and interpretation notes into a single info strip.
  - Preserved the diverging LDA axis semantics.
- `frontend/src/components/Charts/Heatmap.jsx`
  - Removed the bordered card shell from individual heatmap panels.
  - Converted the top filter summary and missing-cache notice to shared,
    lightweight chart information styles.
  - Kept sub-chart labels and export controls because the heatmap view contains
    multiple distinct subplots.
- `frontend/src/styles/components.css`
  - Added shared chart control, info, stat, chip, and heatmap panel classes.
- `frontend/src/components/Charts/PhylumChart.test.jsx`
  - Updated tests to assert the merged information strip instead of removed
    internal titles.

Validation completed:

```bash
npm --prefix frontend test -- --runInBand --watch=false
npm --prefix frontend run build
```

Results:

- Frontend test suite passed: 6 suites, 21 tests.
- Production build completed successfully.

Final cleanup check:

- No major chart component keeps an internal ECharts title/subtitle.
- No major chart component keeps a page-level inner bordered card under
  `ChartFrame`.
- Repeated title/subtitle text was removed from chart internals rather than
  merely hiding borders.

## Goals

- Keep React as the frontend framework.
- Keep ECharts, D3, and Canvas as the visualization stack.
- Introduce a stable application shell for dataset selection, chart navigation,
  summary metrics, and chart workspaces.
- Use existing headless UI packages for complex interaction primitives instead
  of adopting a heavy visual UI framework.
- Build a lightweight AD-Meta design system with CSS variables and local
  wrapper components.
- Reduce responsibility inside `App.jsx`.
- Keep chart components focused on rendering `data -> chart`.
- Fix scattered visual styles and inconsistent chart containers.
- Fix visible Chinese mojibake in frontend UI text during the refactor.

## Non-Goals

- Do not replace React.
- Do not replace the backend precompute model.
- Do not move scientific calculations back into the frontend.
- Do not adopt Ant Design, MUI, or another strongly styled UI framework for the
  whole app.
- Do not change public API payloads unless a chart explicitly needs a backend
  contract update.
- Do not rewrite all chart internals in one pass.

## UI Library Decision

The project should use a headless UI approach:

- Use Radix UI for interaction primitives.
- Use `lucide-react` for icons.
- Keep visual styling inside AD-Meta CSS tokens and local components.
- Do not import Radix components directly in feature code. Wrap them under
  `frontend/src/components/ui/`.

Recommended packages:

```text
@radix-ui/react-select
@radix-ui/react-tabs
@radix-ui/react-tooltip
@radix-ui/react-dialog
@radix-ui/react-popover
lucide-react
```

Rationale:

- Radix solves keyboard behavior, focus management, popover positioning, and
  accessibility details.
- It does not impose a strong visual style.
- AD-Meta can keep a scientific dashboard look instead of becoming a generic
  admin console.
- Wrapper components keep third-party choices contained.

## Target Frontend Structure

The frontend should move toward this structure:

```text
frontend/src/
  app/
    App.jsx
    chartRegistry.js
    labels.js

  api/
    client.js
    datasets.js

  components/
    ui/
      Button.jsx
      IconButton.jsx
      Select.jsx
      Tabs.jsx
      Tooltip.jsx
      Dialog.jsx
      Popover.jsx
      Panel.jsx
      MetricCard.jsx
      LoadingState.jsx
      ErrorState.jsx
      EmptyState.jsx
      Toolbar.jsx

    layout/
      AppShell.jsx
      TopBar.jsx
      Sidebar.jsx
      MainWorkspace.jsx

    dataset/
      DatasetSelect.jsx
      DatasetSummary.jsx
      ChartNav.jsx

    charts/
      ChartFrame.jsx
      BarChart.jsx
      PhylumChart.jsx
      BoxPlot.jsx
      Heatmap.jsx
      DetectionHeatmap.jsx
      KoLdaBarChart.jsx
      SunburstChart.jsx
      PCAPlot.jsx
      PCoAPlot.jsx

  hooks/
    useDatasets.js
    useDatasetSummary.js
    useChartData.js
    useActiveChart.js
    useTooltip.js

  styles/
    tokens.css
    base.css
    layout.css
    components.css
```

## Application Skeleton

The target page layout is a data-analysis workspace:

```text
TopBar
  Project name, active dataset, dataset type, refresh/export/help actions

Sidebar
  Dataset selector
  Dataset summary metrics
  Chart navigation

MainWorkspace
  ChartFrame
    Chart title
    Subtitle or compact description
    Toolbar
    Loading/error/empty states
    Chart body
```

The sidebar should be a stable navigation and context area. The main workspace
should prioritize chart readability and interaction. Footer content should be
removed or visually minimized because it is not central to the analysis task.

## Design Tokens

Add a token layer in `frontend/src/styles/tokens.css`.

Suggested initial tokens:

```css
:root {
  --color-bg-app: #f6f7f9;
  --color-bg-panel: #ffffff;
  --color-bg-muted: #f0f3f7;
  --color-text-main: #172033;
  --color-text-muted: #667085;
  --color-border: #d9dee7;

  --color-ad: #d95f4f;
  --color-nc: #3c9b7b;
  --color-accent: #2563eb;
  --color-warning: #d97706;
  --color-danger: #c2410c;

  --radius-sm: 4px;
  --radius-md: 8px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;

  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
}
```

Guidelines:

- Keep the UI quiet and work-focused.
- Keep chart color meaning stable: AD uses `--color-ad`, NC uses
  `--color-nc`.
- Avoid one-note palettes.
- Prefer 4px or 8px radius for common controls and panels.
- Do not let every chart define its own unrelated panel border, radius, and
  background.

## API Layer Changes

Keep `api/client.js` as the low-level JSON fetcher.

Add `api/datasets.js`:

```js
export function listDatasets() {}
export function getDataset(slug) {}
export function getDatasetSummary(slug) {}
export function getChart(slug, chartType) {}
```

Expected benefit:

- Components and hooks stop building API URLs directly.
- Future API path changes stay localized.
- Error handling remains consistent.

## Data Hooks

Move data loading out of `App.jsx`.

Add:

- `useDatasets()`
- `useDatasetSummary(slug)`
- `useChartData(slug, chartType)`
- `useActiveChart(summary)`

Each hook should return a predictable state object:

```js
{
  data,
  loading,
  error,
  reload
}
```

`useActiveChart` should ensure the current chart remains valid when switching
between taxonomy and KO datasets.

## Chart Registry

Add `frontend/src/app/chartRegistry.js`.

Purpose:

- Define chart labels.
- Define chart availability by feature kind.
- Map chart keys to chart components.
- Avoid duplicating tab logic and switch statements in `App.jsx`.

Example shape:

```js
export const CHARTS = {
  species: {
    label: 'Abundance comparison',
    availableFor: ['taxonomy', 'ko'],
    component: BarChart,
  },
  phylum: {
    label: 'Composition overview',
    availableFor: ['taxonomy', 'ko'],
    component: PhylumChart,
  },
  boxplot: {
    label: 'Abundance boxplot',
    availableFor: ['taxonomy'],
    component: BoxPlot,
  },
  heatmap: {
    label: 'Differential heatmap',
    availableFor: ['taxonomy'],
    component: Heatmap,
  },
  detection: {
    label: 'KO detection heatmap',
    availableFor: ['ko'],
    component: DetectionHeatmap,
  },
  lda: {
    label: 'KO LDA',
    availableFor: ['ko'],
    component: KoLdaBarChart,
  },
};
```

Use Chinese labels in the final UI once the source encoding and text cleanup
are handled. The registry should be the single place for chart navigation text.

## ChartFrame

Add `components/charts/ChartFrame.jsx`.

Responsibilities:

- Unified chart title and subtitle.
- Unified toolbar area.
- Unified loading, error, and empty states.
- Unified panel spacing, border, and background.
- Optional fullscreen/export slots.

Chart components should no longer each invent their own outer shell. For
example:

```jsx
<ChartFrame
  title="Top 20 species abundance"
  subtitle="Mean abundance comparison between AD and NC groups"
  loading={loading}
  error={error}
>
  <BarChart data={data} featureLabel={featureLabel} />
</ChartFrame>
```

The heatmap can keep its internal canvas, zoom, and lightbox logic, but its
outer page-level shell should still come from `ChartFrame`.

## UI Wrapper Components

Create local wrappers in `components/ui/`.

Initial components:

- `Button`
- `IconButton`
- `Select`
- `Tabs`
- `Tooltip`
- `Dialog`
- `Popover`
- `Panel`
- `MetricCard`
- `LoadingState`
- `ErrorState`
- `EmptyState`
- `Toolbar`

Rules:

- Feature code imports local UI components, not Radix directly.
- Icons come from `lucide-react`.
- Buttons with familiar actions should use icons where appropriate.
- UI components should use CSS classes and design tokens, not large inline style
  objects.

## Specific File Changes

### `frontend/src/App.jsx`

Planned changes:

- Move to `frontend/src/app/App.jsx`.
- Remove direct API URL construction.
- Remove direct tab registry logic.
- Remove direct chart switch statement.
- Compose `AppShell`, `Sidebar`, and `MainWorkspace`.
- Consume hooks for datasets, summary, and chart payload.

### `frontend/src/index.js`

Planned changes:

- Import the new app path.
- Import `styles/tokens.css`, `styles/base.css`, `styles/layout.css`, and
  `styles/components.css`.

### `frontend/src/api/client.js`

Planned changes:

- Keep `fetchJson`.
- Keep environment-based API base URL.
- Ensure error messages are clean Chinese or clean English, not mojibake.

### `frontend/src/api/datasets.js`

New file:

- `listDatasets`
- `getDataset`
- `getDatasetSummary`
- `getChart`

### `frontend/src/components/StatsCards.jsx`

Planned changes:

- Replace with or rename to `components/dataset/DatasetSummary.jsx`.
- Use `MetricCard`.
- Keep payload compatibility with existing `summary` response.

### `frontend/src/components/Charts/*`

Planned changes:

- Move toward `components/charts/*`.
- Keep chart rendering behavior stable.
- Remove repeated outer container styles.
- Keep ECharts/D3/Canvas logic intact unless a chart-specific bug is being
  fixed.
- Use shared AD/NC colors.

### `frontend/src/components/Charts/Heatmap.jsx`

Planned changes:

- Keep existing canvas rendering path.
- Keep export and lightbox behavior.
- Move generic buttons, shell text, and state UI toward shared components.
- Avoid changing heatmap payload assumptions during the first skeleton pass.

## Text And Encoding Cleanup

Visible frontend text currently includes mojibake in several files. During the
refactor:

- Rewrite UI labels as valid UTF-8.
- Centralize repeated labels in `app/labels.js` or chart registry metadata.
- Keep scientific terms consistent:
  - `物种`
  - `KO`
  - `丰度`
  - `组成`
  - `检出率`
  - `差异热图`
  - `AD 组`
  - `NC 组`
- Avoid changing backend payload field names just to fix display labels.

## Implementation Phases

### Phase 1: Skeleton And Styles

Changes:

- Add style token files.
- Add layout components.
- Move App into the new app structure.
- Keep existing chart components working.

Validation:

- Frontend starts successfully.
- Dataset selector still loads datasets.
- Existing chart tabs still render.

### Phase 2: API And Hooks

Changes:

- Add `api/datasets.js`.
- Add data hooks.
- Add chart registry.
- Remove fetch effects from `App.jsx`.

Validation:

- Switching datasets works.
- Switching taxonomy and KO datasets shows only valid charts.
- API errors still show user-readable messages.

### Phase 3: UI Wrappers And ChartFrame

Changes:

- Add Radix-based local UI wrappers.
- Add `lucide-react` icon usage.
- Add `ChartFrame`.
- Convert sidebar, metrics, tabs, loading, empty, and error states to shared UI.

Validation:

- Keyboard interaction works for select/tabs/dialogs.
- Chart containers have consistent spacing and style.
- No chart is clipped by the new shell.

### Phase 4: Chart Cleanup

Changes:

- Gradually remove large inline style objects from chart components.
- Share AD/NC colors.
- Standardize chart titles, toolbars, and export actions.
- Fix remaining mojibake in chart UI text.

Validation:

- Existing frontend tests pass.
- Manual chart smoke test passes for species and KO datasets.
- Heatmap export/lightbox still works.

## Testing Checklist

Run after each phase:

```bash
CI=1 npm --prefix frontend test -- --runInBand --watch=false
npm --prefix frontend run build
```

Manual smoke checklist:

- Open the app at `http://127.0.0.1:3000`.
- Confirm dataset list loads.
- Select taxonomy dataset.
- Open species, phylum, boxplot, heatmap, sunburst, PCA, and PCoA charts.
- Select KO dataset.
- Open species, phylum, detection, and LDA charts.
- Confirm invalid chart tabs are not shown for the active dataset type.
- Confirm loading, empty, and error states are readable.
- Confirm no visible mojibake remains in normal UI text.
- Confirm chart text does not overlap at common desktop widths.

## Risk Notes

- Moving files can break imports, especially tests that import chart components
  directly.
- Heatmap has complex canvas and lightbox behavior; keep its internal logic
  stable during the skeleton pass.
- ECharts components may have size issues if their parent layout changes.
  Validate chart resizing after `AppShell` is introduced.
- Radix wrappers should be introduced gradually to avoid mixing raw Radix and
  local UI APIs throughout the app.
- Frontend text cleanup must avoid changing backend payload field names.

## 2026-07-07 Update: Chart Title De-Duplication

User feedback:

- Removing nested chart cards must not remove useful title and description
  information.
- The correct behavior is to compare the outer card text and inner chart text,
  merge non-duplicated information into one chart header, and only remove the
  repeated shell.

Changes:

- Split chart metadata into navigation text and frame text in
  `frontend/src/app/chartRegistry.js`.
- Keep sidebar entries concise with `navLabel` and `navSubtitle`.
- Restore richer chart-level titles and descriptions through `title` and
  `subtitle`, rendered by the shared `ChartFrame`.
- Add `resolveChartMeta()` so chart headers can include dataset-specific
  details, including feature label/count and PCoA PERMANOVA summary when the
  payload provides it.
- Update `frontend/src/app/App.jsx` to render the merged chart metadata from
  `ChartFrame` instead of relying only on the sidebar label.

Examples:

- Sidebar: `PCA` / `样本聚类趋势`.
- Chart header: `β多样性 PCA` /
  `Top N 物种；后端预计算`.
- Sidebar: `PCoA` / `Bray-Curtis 距离主坐标分析`.
- Chart header: `β多样性 PCoA` /
  `Bray-Curtis · Top N 物种；后端预计算；PERMANOVA ...`.
- Sidebar and chart header both keep `分类层级图`, while the chart header keeps
  the fuller hierarchy description and switchable view context.

Validation:

- `CI=1 npm --prefix frontend test -- --runInBand --watch=false`
- `npm --prefix frontend run build`

## Completion Criteria

The frontend skeleton refactor is considered complete when:

- `App.jsx` is mostly composition rather than data-fetching and chart-switching
  logic.
- API calls are centralized under `api/`.
- Dataset and chart data loading are handled by hooks.
- Chart navigation is generated from `chartRegistry.js`.
- Shared UI components are used for select, tabs, tooltip, modal/popover,
  buttons, metric cards, and state views.
- ChartFrame wraps all major chart views.
- Common design tokens control colors, spacing, typography, and panel styling.
- Normal frontend UI no longer displays mojibake.
- Frontend tests and production build pass.
