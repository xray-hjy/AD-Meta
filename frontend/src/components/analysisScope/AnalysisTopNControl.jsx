import { useId, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import TopNSettingsPanel from './TopNSettingsPanel';
import '../ui/selection-controls.css';

// Shared by the scope toolbar and the chart header; calculations still use the same policy.
export default function AnalysisTopNControl({ control, value, featureLabel, onChange, availableCount = null, loading = false }) {
  const id = useId();
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState({});
  if (!control) return null;
  const label = control.label || `Top N ${featureLabel}`;
  return <div className="projection-controls__top-n">
    <label htmlFor={id}>{label}<small aria-hidden="true">{control.purpose === 'feature_selection' ? '计算参数' : '展示设置'}</small></label>
    <Popover.Root open={open} modal={false} onOpenChange={next => {
      if (next) { const computed = getComputedStyle(trigger.current); setTheme({ '--control-accent': computed.getPropertyValue('--workspace-accent'), '--control-soft': computed.getPropertyValue('--workspace-accent-soft') }); }
      setOpen(next);
    }}>
      <Popover.Trigger id={id} ref={trigger} type="button" className="styled-select-trigger" aria-label={label}>
        Top {value}<span aria-hidden="true">⌄</span>
      </Popover.Trigger>
      <Popover.Portal><Popover.Positioner className="selection-positioner" align="start" sideOffset={8} positionMethod="fixed" collisionPadding={16} style={theme}>
        <Popover.Popup className="selection-count-popup selection-popup-transition">
          <div className="selection-count-heading"><Popover.Title>{featureLabel}显示数量{control.purpose === 'feature_selection' ? ' / 参与计算' : ''}</Popover.Title>
            <Popover.Close type="button" aria-label="关闭数量设置">×</Popover.Close></div>
          <TopNSettingsPanel control={control} value={value} featureLabel={featureLabel} availableCount={availableCount} loading={loading}
            onChange={onChange} close={() => setOpen(false)} />
        </Popover.Popup>
      </Popover.Positioner></Popover.Portal>
    </Popover.Root>
  </div>;
}
