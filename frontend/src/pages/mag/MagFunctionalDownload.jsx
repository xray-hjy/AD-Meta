import { useState } from 'react';
import { magFunctionalRequest, magFunctionDownloadUrl } from '../../api/mag';

export default function MagFunctionalDownload({ kind, params, children }) {
  const [status, setStatus] = useState('');
  const request = magFunctionalRequest(`download/${kind}`, params);
  if (!request.post) return <a className="analysis-button" href={magFunctionDownloadUrl(kind, params)}>{children}</a>;
  const download = async () => {
    setStatus('正在准备下载…');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}${request.path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.options.body), signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        let message = `下载失败：${response.status}`;
        try { message = (await response.json()).detail || message; } catch { /* Proxies may return HTML. */ }
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `MAG-${kind}.csv`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('下载已准备');
    } catch (error) { setStatus(error.message || '下载失败，请重试'); }
  };
  return <><button className="analysis-button" type="button" disabled={status === '正在准备下载…'} onClick={download}>{children}</button><span role="status" className="mag-muted">{status}</span></>;
}
