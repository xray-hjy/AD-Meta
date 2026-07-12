export default function AppShell({ topbar, sidebar, main }) {
  return (
    <div className="app">
      {topbar}
      <div className="app-body">
        {sidebar}
        {main}
      </div>
    </div>
  );
}
