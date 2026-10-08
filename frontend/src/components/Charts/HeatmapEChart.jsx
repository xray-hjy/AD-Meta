import { HeatmapChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, ToolboxComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import EChartBase, { echarts } from './EChartBase';

echarts.use([GraphicComponent, GridComponent, HeatmapChart, ToolboxComponent, TooltipComponent, VisualMapComponent]);

export default EChartBase;
