import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type RefreshFn = () => void | Promise<void>;

interface RefreshContextValue {
  refreshing: boolean;
  register: (fn: RefreshFn) => () => void;
  trigger: () => Promise<void>;
}

const RefreshContext = createContext<RefreshContextValue>({
  refreshing: false,
  register: () => () => {},
  trigger: async () => {},
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const fnsRef = useRef<Set<RefreshFn>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const register = useCallback((fn: RefreshFn) => {
    fnsRef.current.add(fn);
    return () => {
      fnsRef.current.delete(fn);
    };
  }, []);

  const trigger = useCallback(async () => {
    if (fnsRef.current.size === 0) return;
    setRefreshing(true);
    try {
      await Promise.all([...fnsRef.current].map((fn) => Promise.resolve(fn())));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshing, register, trigger }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}

export function useRegisterRefresh(fn: RefreshFn, deps: React.DependencyList) {
  const { register } = useRefresh();
  useEffect(() => {
    const unregister = register(fn);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
