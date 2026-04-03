import React, { createContext, useContext, useState, useCallback } from "react";

interface RedactContextValue {
  redacted: boolean;
  toggle: () => void;
}

const RedactContext = createContext<RedactContextValue>({
  redacted: false,
  toggle: () => {},
});

export function RedactProvider({ children }: { children: React.ReactNode }) {
  const [redacted, setRedacted] = useState(false);
  const toggle = useCallback(() => setRedacted((r) => !r), []);
  return (
    <RedactContext.Provider value={{ redacted, toggle }}>
      {children}
    </RedactContext.Provider>
  );
}

export function useRedact() {
  return useContext(RedactContext);
}
