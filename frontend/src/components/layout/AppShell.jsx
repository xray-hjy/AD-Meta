export default function AppShell({ topbar, sidebar, main, tone = 'species' }) {
  return (
    <div className={`app app--${tone}`}>
      {topbar}
      <div className="app-body">
        {sidebar}
        {main}
      </div>
    </div>
  );
}
