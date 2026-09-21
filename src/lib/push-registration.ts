// Web keeps live chat and the in-app inbox; phone push registration is native-only.
export async function registerPush(_token: string, _request: boolean, _current: () => boolean, _ownerId: string, _devicePushToken?: unknown): Promise<void> {}
export async function unregisterPush(_token: string): Promise<void> {}
