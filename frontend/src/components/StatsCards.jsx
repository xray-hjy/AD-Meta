/**
 * 【永久】统计卡片组件
 * 
 * 显示4个统计数字：总样本数、AD组、NC组、物种总数
 * 接收 props.stats，纯展示无状态
 */

import './StatsCards.css';

function StatsCards({ stats }) {
  // 数据没加载完时显示占位
  if (!stats) {
    return (
      <div className="stats-container">
        <div className="stat-card">加载中...</div>
      </div>
    );
  }

  const cards = [
    { label: '总样本数', value: stats.totalSamples },
    { label: 'AD组', value: stats.adSamples },
    { label: 'NC组', value: stats.ncSamples },
    { label: '物种总数', value: stats.totalSpecies },
  ];

  return (
    <div className="stats-container">
      {cards.map((card, i) => (
        <div className="stat-card" key={i}>
          <div className="stat-value">{card.value}</div>
          <div className="stat-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

export default StatsCards;