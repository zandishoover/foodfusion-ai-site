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
  process.env.EXPO_PUBLIC_SUPABASE_RESET_REDIRECT_URL ||
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

function userMetadataName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || '';
}

function emailPrefix(user) {
  return user?.email?.split('@')[0] || '';
}

async function loadProfileTableName(user) {
  if (!supabase || !user?.id) {
    return { name: '', source: '' };
  }

  const attempts = [
    { label: 'profile table user_id', query: () => supabase.from('profiles').select('name, full_name, email').eq('user_id', user.id).maybeSingle() },
    { label: 'profile table id', query: () => supabase.from('profiles').select('name, full_name, email').eq('id', user.id).maybeSingle() },
    { label: 'profile table user_id name', query: () => supabase.from('profiles').select('name, email').eq('user_id', user.id).maybeSingle() },
    { label: 'profile table id name', query: () => supabase.from('profiles').select('name, email').eq('id', user.id).maybeSingle() }
  ];

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt.query();
      if (error) {
        console.warn('[Profile] profile table load skipped:', { source: attempt.label, message: error.message });
        continue;
      }
      const name = data?.name || data?.full_name || '';
      if (name) {
        return { name, source: attempt.label };
      }
    } catch (error) {
      console.warn('[Profile] profile table load failed:', { source: attempt.label, message: error?.message || String(error) });
    }
  }

  return { name: '', source: '' };
}

async function saveProfileTableName(profile) {
  if (!supabase || !profile?.id || !profile?.name) {
    return false;
  }

  const rowWithBothIds = {
    id: profile.id,
    user_id: profile.id,
    name: profile.name,
    full_name: profile.name,
    email: profile.email || ''
  };
  const attempts = [
    { label: 'profiles id + user_id', payload: rowWithBothIds, options: { onConflict: 'id' } },
    { label: 'profiles id', payload: { id: profile.id, name: profile.name, full_name: profile.name, email: profile.email || '' }, options: { onConflict: 'id' } },
    { label: 'profiles user_id', payload: { user_id: profile.id, name: profile.name, full_name: profile.name, email: profile.email || '' }, options: { onConflict: 'user_id' } },
    { label: 'profiles id name', payload: { id: profile.id, name: profile.name, email: profile.email || '' }, options: { onConflict: 'id' } },
    { label: 'profiles user_id name', payload: { user_id: profile.id, name: profile.name, email: profile.email || '' }, options: { onConflict: 'user_id' } }
  ];

  for (const attempt of attempts) {
    try {
      const { error } = await supabase.from('profiles').upsert(attempt.payload, attempt.options);
      if (!error) {
        console.log('[Profile] saved display name to profile table:', { source: attempt.label, userId: profile.id });
        return true;
      }
      console.warn('[Profile] profile table save skipped:', { source: attempt.label, message: error.message });
    } catch (error) {
      console.warn('[Profile] profile table save failed:', { source: attempt.label, message: error?.message || String(error) });
    }
  }

  return false;
}

function profileFromUser(user, profileTableName = '') {
  if (!user) {
    return null;
  }

  const metadataName = userMetadataName(user);
  const prefix = emailPrefix(user);
  const name = profileTableName || metadataName || prefix || 'FoodFusion Member';
  const source = profileTableName
    ? 'profile table name'
    : metadataName
      ? (user.user_metadata?.full_name ? 'auth full_name metadata' : 'auth name metadata')
      : prefix
        ? 'email prefix'
        : 'fallback';
  console.log('[Profile] loaded display name source', { source, userId: user.id });

  return {
    id: user.id,
    name,
    email: user.email || ''
  };
}

async function profileFromUserWithRemote(user) {
  if (!user) {
    return null;
  }
  const profileTable = await loadProfileTableName(user);
  return profileFromUser(user, profileTable.name);
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
  return profileFromUserWithRemote(session?.user);
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
  return profileFromUserWithRemote(data.user);
}

export async function signUpWithSupabase(name, email, password) {
  console.log('[Supabase Auth] signUp request:', { email, nameProvided: Boolean(name) });
  if (!supabase) {
    throw new Error('Supabase auth is not configured in this build.');
  }
  const cleanName = name?.trim() || email.split('@')[0] || 'FoodFusion Member';
  console.log('[Auth] signup metadata name', { name: cleanName });
  console.log('[Auth] signup confirmation redirect', authConfirmationRedirectUrl);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: cleanName, full_name: cleanName },
      emailRedirectTo: authConfirmationRedirectUrl
    }
  });
  if (error) {
    console.warn('[Auth] email confirmation error', error);
    console.warn('[Supabase Auth] signUp error:', error);
    throw error;
  }
  console.log('[Auth] signup response', {
    hasUser: Boolean(data.user),
    hasSession: Boolean(data.session),
    userId: data.user?.id || null,
    email: data.user?.email || null
  });
  const profile = await profileFromUserWithRemote(data.user);
  if (profile) {
    await saveProfileTableName({ ...profile, name: cleanName });
  }
  if (data.user && !data.session) {
    console.log('[Auth] email confirmation sent', { email, redirectTo: authConfirmationRedirectUrl });
  }
  return {
    profile,
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

export async function resendSupabaseConfirmation(email) {
  if (!supabase) {
    throw new Error('Supabase auth is not configured in this build.');
  }
  console.log('[Auth] signup confirmation redirect', authConfirmationRedirectUrl);
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: authConfirmationRedirectUrl
    }
  });
  if (error) {
    console.warn('[Auth] email confirmation error', error);
    throw error;
  }
  console.log('[Auth] email confirmation sent', { email, redirectTo: authConfirmationRedirectUrl });
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
    profileFromUserWithRemote(session?.user)
      .then(onChange)
      .catch((error) => {
        console.warn('[Profile] auth state profile load failed:', error);
        onChange(profileFromUser(session?.user));
      });
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
