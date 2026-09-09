export default function MainWorkspace({ children, chartKey }) {
  return (
    <main id="analysis-results" className="main-content" data-scroll-region="main" key={chartKey} tabIndex={-1}>
      {children}
    </main>
  );
}
