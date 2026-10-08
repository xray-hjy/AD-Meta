import {
  BarChart,
  BoxplotChart,
  CustomChart,
  LineChart,
  ScatterChart,
} from 'echarts/charts';
import {
  DataZoomComponent,
  BrushComponent,
  MarkAreaComponent,
  MarkLineComponent,
  GridComponent,
  GraphicComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import EChartBase, { echarts } from './EChartBase';

echarts.use([
  BarChart,
  BoxplotChart,
  CustomChart,
  DataZoomComponent,
  BrushComponent,
  MarkAreaComponent,
  MarkLineComponent,
  GridComponent,
  GraphicComponent,
  LabelLayout,
  LegendComponent,
  LineChart,
  ScatterChart,
  ToolboxComponent,
  TooltipComponent,
  UniversalTransition,
]);

export default EChartBase;
