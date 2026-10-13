const number = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumSignificantDigits: 5 });

export function distributionChartOption(data, transform, colors) {
  const log = transform === 'log';
  const change = value => log ? Math.log10(value + 1) : value;
  const boxKey = log ? 'logBox' : 'box';
  return {
    animation: false,
    aria: { enabled: true, description: `${data.cohort} ${data.genus.name} AD/NC 箱线图与每条 Run 的散点。箱体展示四分位区间，零值与离群点全部保留。` },
    grid: { top: 35, bottom: 50, left: 75, right: 25 },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true, formatter: param => {
      if (param.seriesType === 'boxplot') {
        const box = data.boxes[param.dataIndex];
        return `${box.group} · ${box.count} Run\n检出 ${box.detectedCount}/${box.count}\n中位数 ${number(box.box?.[2])}%\nQ1–Q3 ${number(box.box?.[1])}–${number(box.box?.[3])}%`;
      }
      const point = param.data.sample;
      return `${point.group} · ${point.runId}\n原丰度 ${number(point.value)}%\n待解析 ${number(point.unresolvedPercent)}%\n年龄 ${point.ageYears ?? point.ageRaw ?? '未知'}\n性别 ${{ female: '女', male: '男', unknown: '未知' }[point.sex] || '未知'}${point.sourceSexCode ? `（原码 ${point.sourceSexCode}）` : ''}\n参与者 ${point.participantId || '待核对'}\n读取数 ${point.readCount == null ? '未知' : number(point.readCount)} · 来源 QC ${point.qcStatus || '未知'}`;
    } },
    xAxis: [
      { type: 'category', data: ['AD', 'NC'], axisTick: { show: false }, axisLabel: { formatter: value => `${value}\n(n=${data.boxes.find(b => b.group === value)?.count || 0} Run)` } },
      { type: 'value', min: -.5, max: 1.5, show: false },
    ],
    yAxis: { type: 'value', min: 0, name: log ? 'log10(丰度 % + 1)' : '相对丰度（%）', nameLocation: 'end',
      nameTextStyle: { align: 'left', padding: [0, 0, 0, -55] }, axisLabel: { formatter: value => number(value) }, splitLine: { lineStyle: { color: '#e8edf2' } } },
    series: [
      { name: '箱线图', type: 'boxplot', boxWidth: [32, 72], data: data.boxes.map(box => ({ value: box[boxKey], itemStyle: { color: colors[box.group], opacity: .3, borderColor: colors[box.group], borderWidth: 2 } })), z: 1 },
      ...['AD', 'NC'].map(group => ({ name: group, type: 'scatter', xAxisIndex: 1, symbol: group === 'AD' ? 'circle' : 'diamond', symbolSize: 7,
        data: data.points.filter(p => p.group === group).map(p => ({ value: [(group === 'AD' ? 0 : 1) + p.jitter, change(p.value)], sample: p })),
        itemStyle: { color: colors[group], opacity: .78, borderColor: '#fff', borderWidth: .7 }, emphasis: { scale: 1.5 }, z: 3 })),
    ],
  };
}
