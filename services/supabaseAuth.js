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

const usesSetupPlaceholder =
  supabaseUrl?.includes('your-project.supabase.co') ||
  supabaseKey?.includes('your-publishable-key');

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey && !usesSetupPlaceholder);

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
    return null;
  }
  if (!sessionRequest) {
    sessionRequest = supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }
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

export async function signInWithSupabase(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return profileFromUser(data.user);
}

export async function signUpWithSupabase(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) {
    throw error;
  }
  return {
    profile: profileFromUser(data.user),
    confirmationRequired: Boolean(data.user && !data.session)
  };
}

export async function resetSupabasePassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    authRedirectUrl ? { redirectTo: authRedirectUrl } : undefined
  );
  if (error) {
    throw error;
  }
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
