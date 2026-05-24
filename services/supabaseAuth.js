import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const authRedirectUrl = process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URL;

const usesSetupPlaceholder =
  supabaseUrl?.includes('your-project.supabase.co') ||
  supabaseKey?.includes('your-publishable-key');

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey && !usesSetupPlaceholder);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock
      }
    })
  : null;

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

export async function getSupabaseSessionProfile() {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return profileFromUser(data.session?.user);
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
