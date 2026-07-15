import {
  BarChart,
  BoxplotChart,
  LineChart,
  ScatterChart,
} from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import EChartBase, { echarts } from './EChartBase';

echarts.use([
  BarChart,
  BoxplotChart,
  DataZoomComponent,
  GridComponent,
  LabelLayout,
  LegendComponent,
  LineChart,
  ScatterChart,
  ToolboxComponent,
  TooltipComponent,
  UniversalTransition,
]);

export default EChartBase;
