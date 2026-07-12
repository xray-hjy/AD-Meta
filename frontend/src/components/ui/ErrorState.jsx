export default function ErrorState({ title = '数据读取失败', message }) {
  return (
    <div className="state-view state-view--error">
      <span className="state-view__icon" aria-hidden="true">!</span>
      <p>{title}</p>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
