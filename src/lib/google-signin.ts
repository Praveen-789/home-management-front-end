import { Platform } from 'react-native';

// Load on tap so older builds can still use password login.
export async function chooseGoogleAccount(): Promise<string | null> {
  if (Platform.OS !== 'android') throw new Error('Google sign-in is currently available on Android.');
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw new Error('Google sign-in is not configured for this app yet.');
  let google: typeof import('@react-native-google-signin/google-signin');
  try { google = require('@react-native-google-signin/google-signin'); }
  catch { throw new Error('Please install the latest HomeHub development build to use Google sign-in.'); }
  const { GoogleSignin, statusCodes, isErrorWithCode } = google;
  try {
    GoogleSignin.configure({ webClientId, offlineAccess: false });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Always allow account selection, including after a previous logout.
    await GoogleSignin.signOut();
    const response = await GoogleSignin.signIn();
    if (google.isCancelledResponse(response)) return null;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');
    return idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS) throw new Error('Google sign-in is already in progress.');
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Please update Google Play services and try again.');
      if (error.code === '10') throw new Error('Google sign-in setup needs checking. Please contact HomeHub support.');
    }
    throw new Error('Could not sign in with Google. Please try again.');
  }
}
