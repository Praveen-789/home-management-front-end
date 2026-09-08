import { jwtDecode } from 'jwt-decode';

// Decoding only reads expiry; the backend verifies the token's signature.
export function tokenExpiresAt(token: string): number {
  try {
    const { exp } = jwtDecode(token);
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}
