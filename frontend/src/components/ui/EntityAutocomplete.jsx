import { useRef, useState } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Combobox } from '@base-ui/react/combobox';
import { matchSuggestions } from './entitySuggestions';
import './entity-autocomplete.css';

function SuggestionText({ item }) {
  return <><span className="entity-option__heading"><strong>{item.label}</strong><small>{item.approximate ? '相近名称' : item.kind}</small></span>
    <span className="entity-option__detail" title={item.detail}>{item.detail}</span></>;
}

function PopupContents({ Parts, items, total, loading, error, retry, note, allowFreeText = true }) {
  return <Parts.Popup className="entity-popup" aria-busy={loading || undefined}>
    <div className="entity-popup__heading"><span>{note}</span><span>{loading ? '检索中…' : `${total} 个候选`}</span></div>
    {error ? <div className="entity-popup__message" role="alert">{allowFreeText ? '候选加载失败；可继续输入关键词' : '候选加载失败，请重试'}{retry && <button type="button" onClick={retry}>重试</button>}</div> : null}
    {!loading && !error && !items.length ? <div className="entity-popup__message">{allowFreeText ? '没有匹配候选，可继续输入关键词' : '没有匹配候选，请调整名称或编号'}</div> : null}
    <Parts.List className="entity-popup__list">{item => <Parts.Item key={item.key} value={item} className="entity-option" title={`${item.label}\n${item.detail}`}><SuggestionText item={item} /></Parts.Item>}</Parts.List>
    <div className="entity-popup__footer">{total > items.length ? `展示前 ${items.length} 个 · 输入更多字符缩小范围` : '↑ ↓ 选择 · Enter 确认 · Esc 收起'}</div>
  </Parts.Popup>;
}

export default function EntityAutocomplete({ value, onChange, onSelect, items = [], total = items.length, loading = false, error = '', retry,
  label, id, placeholder = '输入名称或编号', maxLength = 200, disabled = false, onOpenChange, note = '名称 / 编号候选' }) {
  const composing = useRef(false);
  const host = useRef(null);
  const [accent, setAccent] = useState('#b65770');
  return <div ref={host} className="entity-autocomplete">
    <Autocomplete.Root value={value} items={items} filter={null} openOnInputClick disabled={disabled} modal={false}
      itemToStringValue={item => item.value}
      onOpenChange={open => { if (open && host.current) setAccent(getComputedStyle(host.current).getPropertyValue('--workspace-accent').trim() || '#b65770'); onOpenChange?.(open); }}
      onValueChange={(next, details) => { onChange(next); if (details.reason === 'item-press') onSelect?.(next, items.find(item => item.value === next)); }}>
      <Autocomplete.InputGroup className="entity-input-group">
        <span className="entity-input-icon" aria-hidden="true">⌕</span>
        <Autocomplete.Input id={id} aria-label={label} placeholder={placeholder} maxLength={maxLength} autoComplete="off"
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDownCapture={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); event.stopPropagation(); } }} />
        <Autocomplete.Clear className="entity-input-clear" aria-label={`清空${label}`} title="清空输入">×</Autocomplete.Clear>
        <Autocomplete.Trigger className="entity-input-trigger" aria-label={`${label}候选`} title="浏览候选">⌄</Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal><Autocomplete.Positioner sideOffset={7} align="start" className="entity-positioner" style={{ '--entity-accent': accent }}>
        <PopupContents Parts={Autocomplete} items={items} total={total} loading={loading} error={error} retry={retry} note={note} />
      </Autocomplete.Positioner></Autocomplete.Portal>
    </Autocomplete.Root>
  </div>;
}

// Fixed entity selection: arbitrary text never commits an ID. Full catalogs stay
// available while only the best 20 matches are mounted in the popup.
export function EntityCombobox({ value, onChange, entries, label, id, disabled = false, loading = false, error = '', retry, placeholder = '搜索并选择' }) {
  const [query, setQuery] = useState('');
  const result = matchSuggestions(entries, query);
  const selected = entries.find(item => item.value === value) || (value ? { key: value, value, label: value, detail: value, kind: '当前选择' } : null);
  const host = useRef(null);
  const [accent, setAccent] = useState('#b65770');
  return <div className="entity-autocomplete" ref={host}>
    <Combobox.Root items={entries} filteredItems={result.items} value={selected} disabled={disabled} openOnInputClick modal={false}
      isItemEqualToValue={(a, b) => a.value === b.value} itemToStringLabel={item => item.value} itemToStringValue={item => item.value}
      onInputValueChange={(next, details) => { if (details.reason === 'input-change') setQuery(next); }}
      onOpenChange={(open, details) => { if (!open || details.reason !== 'input-change') setQuery(''); if (open && host.current) setAccent(getComputedStyle(host.current).getPropertyValue('--workspace-accent').trim() || '#b65770'); }}
      onValueChange={item => { if (item) onChange(item.value); }}>
      <Combobox.InputGroup className="entity-input-group"><span className="entity-input-icon" aria-hidden="true">⌕</span>
        <Combobox.Input id={id} aria-label={label} placeholder={placeholder} title={value} />
        <Combobox.Trigger className="entity-input-trigger" aria-label={`${label}候选`}>⌄</Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal><Combobox.Positioner className="entity-positioner" sideOffset={7} align="start" style={{ '--entity-accent': accent }}>
        <PopupContents Parts={Combobox} items={result.items} total={result.total} loading={loading} error={error} retry={retry} note="搜索完整目录 · 确认后选择" allowFreeText={false} />
      </Combobox.Positioner></Combobox.Portal>
    </Combobox.Root>
  </div>;
}
