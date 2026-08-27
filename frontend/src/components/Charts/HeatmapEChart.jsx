import { HeatmapChart } from 'echarts/charts';
import { GridComponent, ToolboxComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import EChartBase, { echarts } from './EChartBase';

echarts.use([GridComponent, HeatmapChart, ToolboxComponent, TooltipComponent, VisualMapComponent]);

export default EChartBase;
