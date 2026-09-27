import { useState } from 'react';
import type { ImageFile } from '@/api/images';
import { errorMessage } from '@/lib/errors';
import { pickImage, type ImageSource } from '@/lib/pick-image';

type Options = {
  // What to do with the chosen file, and how to take the current picture away.
  change: (file: ImageFile) => Promise<void>;
  remove: () => Promise<void>;
  // Receives the outcome, success or failure, as text for a snackbar.
  report: (message: string) => void;
  changed: string;
  removed: string;
};

// Choosing and removing a picture, shared by the profile screen and the household screen. `busy`
// covers the picker, the upload and the final save, so the avatar can show progress throughout.
export default function usePictureActions({ change, remove, report, changed, removed }: Options) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<boolean>, success: string, failure: string) {
    setBusy(true);
    try { if (await action()) report(success); }
    catch (error) { report(errorMessage(error, failure)); }
    finally { setBusy(false); }
  }

  return {
    busy,
    // Cancelling the picker is not a failure, so it ends quietly.
    pick: (source: ImageSource) => void run(async () => {
      const file = await pickImage(source, { profile: true });
      if (file) await change(file);
      return !!file;
    }, changed, 'Could not update the picture.'),
    remove: () => void run(async () => { await remove(); return true; }, removed, 'Could not remove the picture.'),
  };
}
