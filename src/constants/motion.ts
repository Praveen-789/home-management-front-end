import { FadeOut, LinearTransition } from 'react-native-reanimated';

// HomeHub's motion, kept in one place so every list moves the same way. It is short on purpose:
// motion here confirms what just happened, and nobody should have to wait for it.
//
// These are built once, outside any component, as Reanimated recommends. Reanimated also skips them
// by itself when the phone's "Remove animations" setting is on (its default, ReduceMotion.System).

// A row or card that has left its list fades away instead of vanishing.
export const rowExit = FadeOut.duration(180);

// What is left glides into the gap instead of jumping.
export const rowShift = LinearTransition.duration(220);
