import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';

// Typed versions of the React Redux hooks, so screens never need to annotate state or dispatch.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
