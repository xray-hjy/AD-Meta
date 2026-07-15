import { HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import EChartBase, { echarts } from './EChartBase';

echarts.use([GridComponent, HeatmapChart, TooltipComponent, VisualMapComponent]);

export default EChartBase;
