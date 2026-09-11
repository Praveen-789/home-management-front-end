import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { isApiError } from '@/api/client';
import * as tasksApi from '@/api/tasks';
import type { Task, TaskInput, TaskPage } from '@/api/tasks';
import { uploadImage, type ImageFile } from '@/api/images';
import { errorMessage } from '@/lib/errors';
import { applyTask, forgetTask, storeTaskPage, type TaskCache, type TaskFilter } from '@/lib/task-helpers';
import { withToken } from '@/stores/with-token';

export const PAGE_SIZE = 20;

// The tasks slice of the Redux store. `latestRequest` remembers the newest list request per
// household so a slow reply for a filter the user already left cannot overwrite the newer list.
export type TasksState = TaskCache & { latestRequest: Record<string, string> };

const initialState: TasksState = { tasksById: {}, listsByHousehold: {}, latestRequest: {} };

// Thunks reject with this plain object. Redux serializes thrown errors, which would lose the HTTP
// status the detail screen needs to tell "deleted" from "failed to load".
export type TaskFailure = { message: string; status?: number };

export const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as TaskFailure).status === 404;

const toFailure = (error: unknown): TaskFailure =>
  ({ message: errorMessage(error), ...(isApiError(error) ? { status: error.status } : {}) });

type ThunkConfig = { rejectValue: TaskFailure };

// Each thunk dispatches `pending` when called, then `fulfilled` with the API result or `rejected`
// with a TaskFailure. The reducers below react to those actions; screens call `.unwrap()` to get the
// result or the failure as a thrown value.
export const loadTasks = createAsyncThunk<TaskPage, { householdId: string; filter: TaskFilter; page?: number }, ThunkConfig>(
  'tasks/loadTasks',
  async ({ householdId, filter, page = 1 }, { rejectWithValue }) => {
    try {
      const query = { page, limit: PAGE_SIZE, ...(filter === 'ALL' ? {} : { status: filter }) };
      return await withToken((token) => tasksApi.listTasks(token, householdId, query));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

export const loadTask = createAsyncThunk<Task, { householdId: string; taskId: string }, ThunkConfig>(
  'tasks/loadTask',
  async ({ householdId, taskId }, { rejectWithValue }) => {
    try {
      return await withToken((token) => tasksApi.getTask(token, householdId, taskId));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

export const createTask = createAsyncThunk<Task, { householdId: string; input: TaskInput & { title: string } }, ThunkConfig>(
  'tasks/createTask',
  async ({ householdId, input }, { rejectWithValue }) => {
    try {
      return await withToken((token) => tasksApi.createTask(token, householdId, input));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

export const updateTask = createAsyncThunk<Task, { householdId: string; taskId: string; input: TaskInput }, ThunkConfig>(
  'tasks/updateTask',
  async ({ householdId, taskId, input }, { rejectWithValue }) => {
    try {
      return await withToken((token) => tasksApi.updateTask(token, householdId, taskId, input));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

export const deleteTask = createAsyncThunk<void, { householdId: string; taskId: string }, ThunkConfig>(
  'tasks/deleteTask',
  async ({ householdId, taskId }, { rejectWithValue }) => {
    try {
      await withToken((token) => tasksApi.deleteTask(token, householdId, taskId));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

// Uploads the file to Cloudinary with a ticket from the backend, then records it on the task.
export const addTaskImage = createAsyncThunk<Task, { householdId: string; taskId: string; file: ImageFile }, ThunkConfig>(
  'tasks/addTaskImage',
  async ({ householdId, taskId, file }, { rejectWithValue }) => {
    try {
      return await withToken(async (token) => {
        const input = await uploadImage(token, householdId, file);
        return tasksApi.addTaskImage(token, householdId, taskId, input);
      });
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

export const removeTaskImage = createAsyncThunk<Task, { householdId: string; taskId: string; imageId: string }, ThunkConfig>(
  'tasks/removeTaskImage',
  async ({ householdId, taskId, imageId }, { rejectWithValue }) => {
    try {
      return await withToken((token) => tasksApi.removeTaskImage(token, householdId, taskId, imageId));
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    // Dispatched when the signed-in user changes, so no tasks leak between accounts.
    tasksReset: () => initialState,
  },
  // Reducers are pure: given the current state and an action, they describe the next state. Redux
  // Toolkit wraps them in Immer, so "mutating" `state` here actually builds a new immutable state.
  extraReducers: (builder) => {
    builder
      .addCase(loadTasks.pending, (state, action) => {
        state.latestRequest[action.meta.arg.householdId] = action.meta.requestId;
      })
      .addCase(loadTasks.fulfilled, (state, action) => {
        const { householdId, filter, page = 1 } = action.meta.arg;
        if (state.latestRequest[householdId] !== action.meta.requestId) return;
        storeTaskPage(state, householdId, filter, page, action.payload);
      })
      .addCase(loadTask.fulfilled, (state, action) => {
        applyTask(state, action.meta.arg.householdId, action.payload);
      })
      .addCase(createTask.fulfilled, (state, action) => {
        applyTask(state, action.meta.arg.householdId, action.payload, true);
      })
      .addCase(updateTask.fulfilled, (state, action) => {
        applyTask(state, action.meta.arg.householdId, action.payload);
      })
      .addCase(addTaskImage.fulfilled, (state, action) => {
        applyTask(state, action.meta.arg.householdId, action.payload);
      })
      .addCase(removeTaskImage.fulfilled, (state, action) => {
        applyTask(state, action.meta.arg.householdId, action.payload);
      })
      .addCase(deleteTask.fulfilled, (state, action) => {
        forgetTask(state, action.meta.arg.householdId, action.meta.arg.taskId);
      });
  },
});

export const { tasksReset } = tasksSlice.actions;
export const tasksReducer = tasksSlice.reducer;

// Selectors take the whole store state and return one piece of it. Screens subscribe through them,
// so they re-render only when that piece changes.
type TasksRoot = { tasks: TasksState };
export const selectTask = (taskId: string) => (state: TasksRoot) => state.tasks.tasksById[taskId];
export const selectTaskList = (householdId: string) => (state: TasksRoot) => state.tasks.listsByHousehold[householdId];
