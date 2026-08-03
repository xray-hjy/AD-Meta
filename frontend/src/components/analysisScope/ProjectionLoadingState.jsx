export default function ProjectionLoadingState({ message = '正在按所选范围计算展示数据...' }) {
  return (
    <div className="projection-loading" role="status" aria-live="polite">
      <div className="projection-loading__bars" aria-hidden="true">
        {[72, 54, 84, 63, 46, 76].map((height, index) => (
          <span key={index} style={{ '--projection-bar-height': `${height}%` }} />
        ))}
      </div>
      <div>
        <strong>{message}</strong>
        <p>后端正在校验样本范围，并执行当前图表的专属计算策略。</p>
      </div>
    </div>
  );
}
