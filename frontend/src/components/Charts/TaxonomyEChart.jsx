import { forwardRef } from 'react';
import { SankeyChart, SunburstChart, TreeChart, TreemapChart } from 'echarts/charts';
import { GraphicComponent, TitleComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import EChartBase, { echarts } from './EChartBase';

echarts.use([
  LabelLayout,
  GraphicComponent,
  SankeyChart,
  SVGRenderer,
  SunburstChart,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TreeChart,
  TreemapChart,
  UniversalTransition,
]);

const TaxonomyEChart = forwardRef(function TaxonomyEChart(props, ref) {
  return <EChartBase ref={ref} {...props} showDataTable={false} />;
});

export default TaxonomyEChart;
