import { Component, useEffect } from 'react';

export function StartupReady() {
  useEffect(() => {
    window.__AD_META_STARTUP__?.finish();
  }, []);
  return null;
}

export default class StartupBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    window.__AD_META_STARTUP__?.finish();
  }

  render() {
    if (this.state.failed) {
      return <section className="app-startup" role="alert">
        <h1>页面暂时无法显示</h1>
        <p>请刷新重试。若问题持续，请稍后再试。</p>
        <button type="button" onClick={() => window.location.reload()}>刷新重试</button>
      </section>;
    }
    return this.props.children;
  }
}
