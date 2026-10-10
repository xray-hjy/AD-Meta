import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createShowcaseController } from '../motion/createShowcaseController';
import { HOME_CHAPTERS } from '../homeContent';

export default function useHomeShowcase({ pageRef, storyRef, hostRef, apiRef, pinned, onOpen, dialogOpen }) {
  const [selection, setSelection] = useState({ key: HOME_CHAPTERS[0].key, index: 0 });
  const dialogState = useRef(dialogOpen);
  useLayoutEffect(() => { dialogState.current = dialogOpen; }, [dialogOpen]);
  // The parent page ref is attached after child layout effects. Initialize
  // after the complete React commit so the controller can safely measure it.
  useEffect(() => {
    if (!pinned) { apiRef.current = null; return; }
    const controller = createShowcaseController({
      page: pageRef.current, story: storyRef.current, host: hostRef.current, chapters: HOME_CHAPTERS,
      onSelection(next) { setSelection(previous => previous.key === next.key && previous.index === next.index ? previous : next); },
      onOpen, dialogOpen: () => dialogState.current,
    });
    apiRef.current = controller;
    return () => { controller.dispose(); apiRef.current = null; };
  }, [apiRef, pageRef, storyRef, hostRef, pinned, onOpen]);
  return selection;
}
