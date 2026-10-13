import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { ChartFrameSupplementContext } from './ChartFrameActionsContext';

// Result tables stay independent of chart folding in the sectioned workspace.
export default function ChartSupplement({ children }) {
  const target = useContext(ChartFrameSupplementContext);
  return target ? createPortal(children, target) : children;
}
