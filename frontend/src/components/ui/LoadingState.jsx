export default function LoadingState({ message = '正在读取图表缓存，请稍候...' }) {
  return (
    <div className="state-view">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}
