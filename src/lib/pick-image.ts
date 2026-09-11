import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ImageFile } from '@/api/images';
import { imageFileName, uploadSize } from '@/lib/images';

export type ImageSource = 'camera' | 'library';

// Opens the camera or the photo library, then shrinks the picture so its longest side is at most
// 1600 pixels and saves it as a JPEG in the cache. Returns null when the person cancels. Throws
// with text fit to show when they refused the permission the source needs.
export async function pickImage(source: ImageSource): Promise<ImageFile | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === 'camera' ? 'Allow camera access in Settings to take a photo.' : 'Allow photo access in Settings to choose a photo.');
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  const size = uploadSize(asset.width, asset.height);
  if (size) context.resize(size);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, name: imageFileName('jpg', Date.now()), type: 'image/jpeg' };
}
