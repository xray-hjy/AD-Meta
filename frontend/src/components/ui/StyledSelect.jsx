import { Children, isValidElement, useId, useRef, useState } from 'react';
import { Select } from '@base-ui/react/select';
import SelectOptionsList from './SelectOptionsList';
import './selection-controls.css';

function optionsFrom(children) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type !== 'option') return optionsFrom(child.props.children);
    const label = child.props.children;
    return [{ value: String(child.props.value ?? Children.toArray(label).join('')), label, disabled: child.props.disabled, hidden: child.props.hidden }];
  });
}

// Accept native option children and change-event values so existing scientific
// filters keep their data contracts while the menu gains themed styling.
export default function StyledSelect({ children, value, defaultValue, onChange, disabled, required, name, form, id,
  className = '', style, onBlur, ...triggerProps }) {
  const generatedId = useId();
  const trigger = useRef(null);
  const [theme, setTheme] = useState({});
  const items = optionsFrom(children);
  const readTheme = () => {
    const computed = getComputedStyle(trigger.current);
    setTheme({ '--control-accent': computed.getPropertyValue('--workspace-accent'), '--control-soft': computed.getPropertyValue('--workspace-accent-soft') });
  };
  return <Select.Root items={items} value={value == null ? undefined : String(value)}
    defaultValue={defaultValue == null ? undefined : String(defaultValue)} disabled={disabled} required={required} name={name} form={form} modal={false}
    onOpenChange={open => { if (open) readTheme(); }} onValueChange={(next, details) => {
      if (next == null) return;
      const target = { value: String(next), name, id: id || generatedId };
      onChange?.({ target, currentTarget: target, nativeEvent: details.event });
    }}>
    <Select.Trigger {...triggerProps} id={id || generatedId} ref={trigger} type="button" onBlur={onBlur}
      className={`styled-select-trigger ${className}`.trim()} style={style}>
      <Select.Value className="styled-select-value" />
      <Select.Icon className="styled-select-chevron">⌄</Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Positioner className="selection-positioner" align="start" sideOffset={7} alignItemWithTrigger={false}
      collisionPadding={16} positionMethod="fixed" style={theme}>
      <Select.Popup className="styled-select-popup selection-popup-transition" onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
        <SelectOptionsList>
          {items.filter(item => !item.hidden).map(item => <Select.Item key={item.value} value={item.value} data-select-value={item.value} disabled={item.disabled} className="styled-select-option">
            <Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator>✓</Select.ItemIndicator>
          </Select.Item>)}
        </SelectOptionsList>
      </Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root>;
}
