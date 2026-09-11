import { beginNavigationTiming, cancelNavigationTiming } from '@/lib/performance-timing';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';

// One lock per screen, shared by all its navigation controls. A ref closes the
// same-frame double-tap window before React can render the disabled state.
export default function usePushOnce() {
  const navigation = useNavigation();
  const locked = useRef(false);
  const [navigating, setNavigating] = useState(false);

  useFocusEffect(useCallback(() => {
    locked.current = false;
    setNavigating(false);
    return () => { locked.current = true; };
  }, []));

  const push = useCallback((href: Href) => {
    if (locked.current || !navigation.isFocused()) return;
    locked.current = true;
    setNavigating(true);
    try {
      beginNavigationTiming(typeof href === 'string' ? href.split('?')[0] : href.pathname);
      router.push(href);
    } catch (error) {
      cancelNavigationTiming();
      locked.current = false;
      setNavigating(false);
      throw error;
    }
  }, [navigation]);

  return { push, navigating };
}
