import ChartStyleToolbar from './ChartStyleToolbar';
import { barStyleDefaults, cleanBarStyle } from './barStyle';

const choice = (value, label) => ({ value, label });
export default function BarStyleToolbar({ option, preferences, config, onChange, onReset }) {
  const values = { ...barStyleDefaults(option), ...cleanBarStyle(preferences) };
  if (config.allowOrientation) values.transposed = Boolean(preferences.transposed);
  if (config.allowGroupMarkers) values.groupMarkers = Boolean(preferences.groupMarkers);
  if (config.allowGroupHover) values.groupHover = preferences.groupHover !== false;
  if (config.allowValueZoom) values.valueZoom = preferences.valueZoom !== false;
  const fields = [
    ...(config.allowOrientation ? [{ key: 'transposed', label: '交换横纵轴', type: 'toggle', description: '切换横向与竖向条形图，保留原始数值和排名' }] : []),
    { key: 'rounded', label: '圆角', type: 'switch', disabled: config.lineMode },
    { key: 'values', label: '数值', type: 'switch' },
    { key: 'grid', label: '网格', type: 'switch' },
    ...(config.allowGroupMarkers ? [{ key: 'groupMarkers', label: '分组标记', type: 'switch', disabled: config.lineMode, description: `以虚线分隔每个${config.featureLabel || '特征'}的柱组，并显示组名；密集视野自动简化` }] : []),
    ...(config.allowGroupHover ? [{ key: 'groupHover', label: '分组悬浮', type: 'switch', description: config.lineMode
      ? '鼠标进入折线或数据点时显示该组提示，并高亮同组折线；移到空白处恢复'
      : '鼠标进入柱体时显示该组提示，并高亮当前视野内的同组柱；移到空白处恢复。柱组分隔线由“分组标记”独立控制' }] : []),
    { key: 'width', label: '柱宽', more: true, disabled: config.lineMode, options: [choice('thin', '细'), choice('standard', '标准'), choice('thick', '粗')] },
    ...(!config.integerValues ? [{ key: 'precision', label: '小数位', more: true, disabled: !values.values,
      options: [choice('auto', '自动'), choice('0', '0 位'), choice('1', '1 位'), choice('2', '2 位'), choice('3', '3 位')] }] : []),
    { key: 'font', label: '标签字号', more: true, options: [choice('small', '小'), choice('standard', '标准'), choice('large', '大')] },
    ...(config.allowValueZoom ? [{ key: 'valueZoom', label: '数值轴缩放', more: true, type: 'switch', description: '显示右侧数值轴范围拖动条，区间之外留空并保持特征顺序' }] : []),
    ...(option.legend ? [{ key: 'legend', label: '图例', more: true, type: 'switch' }] : []),
    { key: 'animation', label: '动画', more: true, type: 'switch' },
  ];
  return <ChartStyleToolbar fields={fields} values={values} onChange={onChange} onReset={onReset} />;
}
