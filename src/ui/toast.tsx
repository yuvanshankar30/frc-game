import { useEffect, useState } from 'react';
import { create } from 'zustand';

interface ToastStore {
  msg: string | null;
  id: number;
  show: (m: string) => void;
}

export const useToast = create<ToastStore>((set, get) => ({
  msg: null,
  id: 0,
  show: (msg) => set({ msg, id: get().id + 1 }),
}));

export const toast = (m: string) => useToast.getState().show(m);

export function Toaster() {
  const { msg, id } = useToast();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [msg, id]);
  if (!visible || !msg) return null;
  return <div className="toast">{msg}</div>;
}
