import ChartStyleToolbar from './ChartStyleToolbar';
import { boxStyleDefaults, cleanBoxStyle } from './boxStyle';

const choice = (value, label) => ({ value, label });
export default function BoxStyleToolbar({ option, preferences, config, onChange, onReset }) {
  const values = { ...boxStyleDefaults(option), ...cleanBoxStyle(preferences) };
  const fields = [
    { key: 'points', label: config.pointLabel || '散点', type: 'switch', description: config.pointDescription },
    { key: 'pointOutline', label: '点轮廓', type: 'switch', disabled: !values.points, description: '为散点显示深灰色描边，不改变 AD / NC 填充颜色' },
    { key: 'medians', label: '中位数值', type: 'switch', description: '标注当前坐标尺度下的中位数；多物种图标注位于箱须上方，过密时自动隐藏；中位线始终保留' },
    { key: 'grid', label: '网格', type: 'switch' },
    { key: 'width', label: '箱宽', more: true, options: [choice('thin', '细'), choice('standard', '标准'), choice('thick', '宽')] },
    { key: 'pointSize', label: '点大小', more: true, disabled: !values.points,
      options: [choice('small', '小'), choice('standard', '标准'), choice('large', '大')] },
    { key: 'opacity', label: '点透明度', more: true, disabled: !values.points,
      options: [choice('light', '淡'), choice('standard', '默认'), choice('strong', '深')] },
    { key: 'font', label: '标签字号', more: true, options: [choice('small', '小'), choice('standard', '标准'), choice('large', '大')] },
    ...(config.allowLegend !== false && option.legend ? [{ key: 'legend', label: '图例', more: true, type: 'switch' }] : []),
    { key: 'animation', label: '动画', more: true, type: 'switch' },
  ];
  return <ChartStyleToolbar fields={fields} values={values} onChange={onChange} onReset={onReset} />;
}
