import { create } from 'zustand';
export const usePushState = create<{ enabled: boolean; busy: boolean; error: string }>(() => ({ enabled: false, busy: false, error: '' }));
