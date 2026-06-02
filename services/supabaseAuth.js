import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
// Use Supabase's CJS artifact on Hermes; its ESM artifact contains an optional
// dynamic telemetry import that Hermes cannot compile in production bundles.
import { createClient, processLock } from '@supabase/supabase-js/dist/index.cjs';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const authRedirectUrl = process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URL;
const hostedAuthBaseUrl = 'https://foodfusion-ai-site.onrender.com';
const authConfirmationRedirectUrl =
  process.env.EXPO_PUBLIC_SUPABASE_CONFIRM_REDIRECT_URL ||
  `${hostedAuthBaseUrl}/confirm`;
const passwordResetRedirectUrl =
  process.env.EXPO_PUBLIC_SUPABASE_PASSWORD_RESET_REDIRECT_URL ||
  `${hostedAuthBaseUrl}/reset-password`;

const usesSetupPlaceholder =
  supabaseUrl?.includes('your-project.supabase.co') ||
  supabaseKey?.includes('your-publishable-key');

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey && !usesSetupPlaceholder);

export const supabaseAuthConfig = {
  supabaseConfigured,
  supabaseUrlLoaded: Boolean(supabaseUrl),
  publishableKeyLoaded: Boolean(supabaseKey),
  redirectUrlLoaded: Boolean(authRedirectUrl),
  supabaseUrl: supabaseUrl || '',
  redirectUrl: authRedirectUrl || '',
  authConfirmationRedirectUrl,
  passwordResetRedirectUrl,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false
};

// GoTrue's auto-refresh tick probes the auth lock with a zero timeout.
// In one React Native JS process, queue that probe behind in-flight auth work
// instead of logging a harmless timeout while AsyncStorage is being read.
function reactNativeAuthLock(name, acquireTimeout, operation) {
  return processLock(name, acquireTimeout === 0 ? -1 : acquireTimeout, operation);
}

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: reactNativeAuthLock,
        lockAcquireTimeout: 10000
      }
    })
  : null;

let sessionRequest = null;

function profileFromUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'FoodFusion Member',
    email: user.email || ''
  };
}

async function getSupabaseSession() {
  if (!supabase) {
    console.log('[Supabase Auth] getSession skipped: client not configured');
    return null;
  }
  if (!sessionRequest) {
    console.log('[Supabase Auth] getSession request starting');
    sessionRequest = supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Supabase Auth] getSession error:', error);
          throw error;
        }
        console.log('[Supabase Auth] getSession response:', {
          sessionExists: Boolean(data.session),
          userId: data.session?.user?.id || null,
          email: data.session?.user?.email || null
        });
        return data.session || null;
      })
      .finally(() => {
        sessionRequest = null;
      });
  }
  return sessionRequest;
}

export async function getSupabaseSessionProfile() {
  const session = await getSupabaseSession();
  return profileFromUser(session?.user);
}

export async function getSupabaseAccessToken() {
  const session = await getSupabaseSession();
  return session?.access_token || null;
}

export async function getSupabaseAuthDebug() {
  const session = await getSupabaseSession();
  return {
    ...supabaseAuthConfig,
    sessionExists: Boolean(session),
    sessionUserId: session?.user?.id || null,
    sessionEmail: session?.user?.email || null
  };
}

export async function signInWithSupabase(email, password) {
  console.log('[Supabase Auth] signInWithPassword request:', {
    email,
    supabaseUrlLoaded: Boolean(supabaseUrl),
    publishableKeyLoaded: Boolean(supabaseKey),
    redirectUrlLoaded: Boolean(authRedirectUrl)
  });
  if (!supabase) {
    const error = new Error('Supabase auth is not configured in this build.');
    console.warn('[Supabase Auth] signInWithPassword unavailable:', error.message);
    throw error;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.log('[Supabase Auth] signInWithPassword response:', {
    hasUser: Boolean(data?.user),
    hasSession: Boolean(data?.session),
    userId: data?.user?.id || null,
    email: data?.user?.email || null,
    error: error ? { message: error.message, status: error.status, name: error.name } : null
  });
  if (error) {
    throw error;
  }
  console.log('[Supabase Auth] session creation:', {
    sessionExists: Boolean(data.session),
    expiresAt: data.session?.expires_at || null
  });
  return profileFromUser(data.user);
}

export async function signUpWithSupabase(name, email, password) {
  console.log('[Supabase Auth] signUp request:', { email, nameProvided: Boolean(name) });
  if (!supabase) {
    throw new Error('Supabase auth is not configured in this build.');
  }
  console.log('[Auth] signup confirmation redirect', authConfirmationRedirectUrl);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: authConfirmationRedirectUrl
    }
  });
  if (error) {
    console.warn('[Supabase Auth] signUp error:', error);
    throw error;
  }
  console.log('[Supabase Auth] signUp response:', {
    hasUser: Boolean(data.user),
    hasSession: Boolean(data.session),
    userId: data.user?.id || null,
    email: data.user?.email || null
  });
  return {
    profile: profileFromUser(data.user),
    confirmationRequired: Boolean(data.user && !data.session)
  };
}

export async function resetSupabasePassword(email) {
  console.log('[Auth] password reset redirect', passwordResetRedirectUrl);
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    { redirectTo: passwordResetRedirectUrl }
  );
  if (error) {
    console.warn('[Auth] reset email sent failed:', error);
    throw error;
  }
  console.log('[Auth] reset email sent', { email, redirectTo: passwordResetRedirectUrl });
}

export async function signOutOfSupabase() {
  if (!supabase) {
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export function observeSupabaseAuth(onChange) {
  if (!supabase) {
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    console.log('[Supabase Auth] auth state change event:', {
      event: _event,
      sessionExists: Boolean(session),
      userId: session?.user?.id || null,
      email: session?.user?.email || null
    });
    onChange(profileFromUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}

export function manageSupabaseAutoRefresh() {
  if (!supabase) {
    return () => {};
  }

  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}
