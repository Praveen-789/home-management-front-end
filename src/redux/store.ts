import { configureStore } from '@reduxjs/toolkit';
import { tasksReducer, tasksReset } from '@/redux/tasks-slice';
import { useAuthStore } from '@/stores/auth-store';

// The single Redux store. Only the tasks feature lives here; auth, households and the theme stay in
// their Zustand stores. See TASKS.md for why the boundary sits there.
export const store = configureStore({
  reducer: { tasks: tasksReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Task data belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) store.dispatch(tasksReset());
});
