import StyledSelect from '../ui/StyledSelect';
import { useState } from 'react';

const STORAGE_KEY = 'admeta:chart:export-defaults:v1';
const FACTORY = { format: 'svg', size: 'auto', pixelRatio: 2, width: 1800, height: 1000 };
const presets = { standard: { width: 1100, height: 640 }, large: { width: 1800, height: 1000 } };

function readDefaults(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return FACTORY;
    return {
      format: saved.format === 'png' ? 'png' : 'svg',
      size: ['auto', 'standard', 'large', 'custom'].includes(saved.size) ? saved.size : 'auto',
      pixelRatio: [1, 2, 3, 4].includes(saved.pixelRatio) ? saved.pixelRatio : 2,
      width: Math.max(640, Math.min(60000, Number(saved.width) || 1800)),
      height: Math.max(420, Math.min(60000, Number(saved.height) || 1000)),
    };
  } catch { return FACTORY; }
}

export default function ChartImageExportSettings({ action, close, storageKey = STORAGE_KEY }) {
  const [settings, setSettings] = useState(() => readDefaults(storageKey));
  const [message, setMessage] = useState('');
  const update = (key, value) => { setSettings(current => ({ ...current, [key]: value })); setMessage(''); };
  const size = settings.size === 'auto' ? action.suggestedSize
    : presets[settings.size] || { width: Number(settings.width), height: Number(settings.height) };
  const valid = Number.isFinite(size.width) && Number.isFinite(size.height)
    && size.width >= 640 && size.width <= 60000 && size.height >= 420 && size.height <= 60000;
  const ratio = valid ? Math.min(settings.pixelRatio, 16384 / size.width, 16384 / size.height,
    Math.sqrt(32000000 / (size.width * size.height))) : 1;
  const saveDefaults = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); setMessage('已保存为默认设置'); }
    catch { setMessage('浏览器未允许保存设置，本次仍可导出'); }
  };
  const restoreDefaults = () => {
    setSettings(FACTORY);
    try { localStorage.removeItem(storageKey); } catch { /* Optional browser storage. */ }
    setMessage('已恢复推荐设置');
  };
  return <form className="chart-image-export" onSubmit={event => {
    event.preventDefault();
    if (!valid) return;
    void action.onClick({ format: settings.format, width: size.width, height: size.height, pixelRatio: settings.pixelRatio });
    close();
  }}>
    <div className="chart-image-export__formats" aria-label="图像格式">
      {['svg', 'png'].map(format => <button key={format} type="button" className="analysis-button"
        aria-pressed={settings.format === format} onClick={() => update('format', format)}>
        <strong>{format.toUpperCase()}</strong><span>{format === 'svg' ? '矢量 · 论文排版' : '位图 · 演示分享'}</span>
      </button>)}
    </div>
    <label className="chart-export-field">导出尺寸<StyledSelect aria-label="导出尺寸" value={settings.size} onChange={event => update('size', event.target.value)}>
      <option value="auto">自动适配完整图表（推荐）</option>
      <option value="standard">标准 · 1100 × 640</option>
      <option value="large">大图 · 1800 × 1000</option>
      <option value="custom">自定义尺寸</option>
    </StyledSelect></label>
    {settings.size === 'custom' ? <div className="chart-image-export__dimensions">
      <label>宽度（px）<input type="number" required min="640" max="60000" step="1" value={settings.width} onChange={event => update('width', event.target.value)} /></label>
      <span aria-hidden="true">×</span>
      <label>高度（px）<input type="number" required min="420" max="60000" step="1" value={settings.height} onChange={event => update('height', event.target.value)} /></label>
    </div> : null}
    <label className="chart-export-field">分辨率<StyledSelect aria-label="分辨率" value={settings.pixelRatio} disabled={settings.format === 'svg'} onChange={event => update('pixelRatio', Number(event.target.value))}>
      <option value="1">1× · 标准</option><option value="2">2× · 高清（推荐）</option>
      <option value="3">3× · 高精度</option><option value="4">4× · 超清</option>
    </StyledSelect></label>
    <div className="chart-image-export__summary">
      <strong>{valid ? settings.format === 'svg' ? `${size.width} × ${size.height} · SVG 矢量`
        : `${Math.floor(size.width * ratio)} × ${Math.floor(size.height * ratio)} px · PNG` : '请输入有效的尺寸'}</strong>
      <span>{settings.format === 'svg' ? '矢量可无损缩放，无需设置像素分辨率。'
        : valid && ratio < settings.pixelRatio ? '大图已自动适配输出像素尺寸。' : '清晰度倍数用于增加输出像素，不改变图表布局。'}</span>
      <span>导出当前完整图表集合，保留主题和图例选择，不含导航面板。</span>
    </div>
    <div className="chart-image-export__defaults">
      <button type="button" className="analysis-button" disabled={!valid} onClick={saveDefaults}>设为默认</button>
      <button type="button" className="analysis-button" onClick={restoreDefaults}>恢复默认</button>
    </div>
    {message ? <p role="status" className="chart-image-export__message">{message}</p> : null}
    <button type="submit" disabled={!valid} className="analysis-button chart-export-submit">下载 {settings.format.toUpperCase()} 图像</button>
  </form>;
}

