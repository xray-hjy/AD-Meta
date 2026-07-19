import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ad-meta:accessibility:colorblind-v1';

const ColorVisionContext = createContext({
  colorBlindFriendly: true,
  setColorBlindFriendly: () => {},
});

function readStoredPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored == null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function ColorVisionProvider({ children, initialEnabled }) {
  const [colorBlindFriendly, setColorBlindFriendly] = useState(
    () => initialEnabled ?? readStoredPreference()
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(colorBlindFriendly));
    } catch {
      // Storage can be unavailable in restricted browsing modes.
    }
    document.documentElement.dataset.colorBlindFriendly = String(colorBlindFriendly);
  }, [colorBlindFriendly]);

  const value = useMemo(
    () => ({ colorBlindFriendly, setColorBlindFriendly }),
    [colorBlindFriendly]
  );

  return (
    <ColorVisionContext.Provider value={value}>
      {children}
    </ColorVisionContext.Provider>
  );
}

export function useColorVision() {
  return useContext(ColorVisionContext);
}
