/** Google sign-in is optional. Switch it on by setting NEXT_PUBLIC_GOOGLE_SIGNIN=on once Google is set up in Supabase. */
export const googleSignInEnabled = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";
