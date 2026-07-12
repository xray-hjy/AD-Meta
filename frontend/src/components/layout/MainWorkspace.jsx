export default function MainWorkspace({ children, chartKey }) {
  return (
    <main className="main-content" data-scroll-region="main" key={chartKey}>
      {children}
    </main>
  );
}
