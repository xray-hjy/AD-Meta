import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { exportPixelRatio } from '../../components/Charts/chartExport';
import MagPhylogenySurface from './MagPhylogenySurface';

async function exportBlob(svg, settings) {
  if (settings.format !== 'png') return svg;
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const ratio = exportPixelRatio(settings, settings.pixelRatio);
    canvas.width = Math.max(1, Math.floor(settings.width * ratio));
    canvas.height = Math.max(1, Math.floor(settings.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG canvas unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Empty PNG'))));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPhylogeny(name, surface, settings) {
  const host = document.createElement('div');
  const root = createRoot(host);
  let svgBlob;
  try {
    flushSync(() => root.render(<MagPhylogenySurface {...surface} width={settings.width} height={settings.height}
      start={0} end={surface.model.leaves.length} hover={false} />));
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('Missing tree export');
    svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  } finally {
    root.unmount();
  }
  const data = await exportBlob(svgBlob, settings);
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}_.-]/gu, '_')}.${settings.format === 'png' ? 'png' : 'svg'}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
