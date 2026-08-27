import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const console = isDevelopmentBuild ? globalThis.console : {
  log: () => {},
  warn: (label) => globalThis.console.warn(typeof label === 'string' ? label : '[RevenueCat] Recoverable error'),
  error: (label) => globalThis.console.error(typeof label === 'string' ? label : '[RevenueCat] Error')
};

export const FUSION_PLUS_ENTITLEMENT = 'fusion_plus';
export const REVENUECAT_PRODUCT_IDS = {
  monthly: 'foodfusion_monthly',
  yearly: 'foodfusion_yearly'
};
const FOODFUSION_REVENUECAT_APPLE_PUBLIC_KEY = 'appl_RIOaBqqslDCNsXNRMcfLYjtUWjv';

const revenueCatApiKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || FOODFUSION_REVENUECAT_APPLE_PUBLIC_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

let configured = false;
let configuredUserId = null;
let lastOfferings = null;
let offeringsLoaded = false;
let setupPaused = false;
let lastRevenueCatError = '';

const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const devForceFusionPlus = isDevBuild && process.env.EXPO_PUBLIC_DEV_FORCE_FUSION_PLUS === 'true';
const DEV_SETUP_PAUSED_MESSAGE = 'Purchases are paused for Apple setup. App testing can continue.';
const PRODUCTION_PURCHASE_UNAVAILABLE_MESSAGE = 'Fusion+ checkout is unavailable right now. Please try again later.';

export function revenueCatErrorCategory(error) {
  if (error?.revenueCatCategory) {
    return error.revenueCatCategory;
  }
  if (error?.userCancelled || error?.code === 'PURCHASE_CANCELLED') {
    return 'purchase_cancelled';
  }
  const message = `${error?.message || error || ''}`.toLowerCase();
  if (/network|offline|internet|timed out|timeout|connection|temporarily unavailable/.test(message)) {
    return 'network';
  }
  if (/no current offering|offerings are empty|offering.*empty|no offerings/.test(message)) {
    return 'no_current_offering';
  }
  if (/missing.*package|products could not be fetched|no products/.test(message)) {
    return 'missing_packages';
  }
  if (/app store|configuration|configured|api key|bundle|project/.test(message)) {
    return 'configuration';
  }
  return 'unknown';
}

function revenueCatError(category, message, cause = null) {
  const error = new Error(message);
  error.revenueCatCategory = category;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

export function isKnownRevenueCatSetupError(error) {
  const message = error?.message || `${error || ''}`;
  return /there was a problem with the app store|products could not be fetched|offerings.*empty|offering.*empty|no offerings|no products|couldn't fetch|couldn.t be completed|couldn't be completed|could not be completed|offeringsmanager/i.test(message);
}

function friendlyRevenueCatError(error) {
  const message = error?.message || `${error || ''}` || 'RevenueCat is not ready.';
  const category = revenueCatErrorCategory(error);
  if (category === 'network') {
    return 'Unable to load subscription options. Check your connection and try again.';
  }
  if (category === 'no_current_offering') {
    return 'No current Fusion+ Offering is available. Please try again shortly.';
  }
  if (category === 'missing_packages') {
    return 'The monthly or yearly Fusion+ option is unavailable. Please try again shortly.';
  }
  if (category === 'configuration' || isKnownRevenueCatSetupError(error)) {
    return isDevBuild ? DEV_SETUP_PAUSED_MESSAGE : PRODUCTION_PURCHASE_UNAVAILABLE_MESSAGE;
  }
  return message;
}

function markRevenueCatError(error) {
  lastRevenueCatError = friendlyRevenueCatError(error);
  const configurationError = revenueCatErrorCategory(error) === 'configuration';
  if (isDevBuild && configurationError) {
    setupPaused = true;
    offeringsLoaded = false;
    console.log('[RevenueCat] setup paused:', lastRevenueCatError);
    return lastRevenueCatError;
  }
  console.warn('[RevenueCat] setup warning:', lastRevenueCatError);
  return lastRevenueCatError;
}

function inferPlanFromProduct(productIdentifier = '') {
  const normalized = `${productIdentifier}`.toLowerCase();
  if (normalized === REVENUECAT_PRODUCT_IDS.monthly) {
    return 'monthly';
  }
  if (normalized === REVENUECAT_PRODUCT_IDS.yearly) {
    return 'yearly';
  }
  if (normalized.includes('year') || normalized.includes('annual')) {
    return 'yearly';
  }
  if (normalized.includes('month')) {
    return 'monthly';
  }
  return 'yearly';
}

export function revenueCatConfigured() {
  return Boolean(revenueCatApiKey);
}

export function revenueCatSetupPaused() {
  return Boolean(setupPaused);
}

export function revenueCatOfferingsLoaded() {
  return Boolean(offeringsLoaded);
}

export function revenueCatLastError() {
  return lastRevenueCatError;
}

export function devForceFusionPlusActive() {
  return Boolean(devForceFusionPlus);
}

export function revenueCatDebugConfig() {
  return {
    configured: revenueCatConfigured(),
    apiKeyLoaded: Boolean(revenueCatApiKey),
    appUserId: configuredUserId,
    entitlement: FUSION_PLUS_ENTITLEMENT,
    monthlyProductId: REVENUECAT_PRODUCT_IDS.monthly,
    yearlyProductId: REVENUECAT_PRODUCT_IDS.yearly,
    offeringsLoaded,
    setupPaused,
    lastError: lastRevenueCatError,
    devForceFusionPlus
  };
}

export function mapCustomerInfoToSubscription(customerInfo) {
  if (devForceFusionPlus) {
    console.log('[RevenueCat] entitlement active', {
      entitlement: FUSION_PLUS_ENTITLEMENT,
      source: 'dev override'
    });
    return {
      isPremium: true,
      selectedPlan: 'yearly',
      subscriptionStatus: 'active',
      source: 'Dev override',
      entitlement: { identifier: FUSION_PLUS_ENTITLEMENT, isActive: true },
      expirationDate: null,
      renewsAt: null,
      willRenew: false,
      productIdentifier: 'dev_force_fusion_plus',
      managementURL: null,
      rawCustomerInfo: customerInfo || null
    };
  }

  const entitlement =
    customerInfo?.entitlements?.active?.[FUSION_PLUS_ENTITLEMENT] ||
    customerInfo?.entitlements?.all?.[FUSION_PLUS_ENTITLEMENT] ||
    null;
  const active = Boolean(entitlement?.isActive);
  const plan = inferPlanFromProduct(entitlement?.productIdentifier || customerInfo?.activeSubscriptions?.[0] || '');
  if (active) {
    console.log('[RevenueCat] entitlement active', {
      entitlement: FUSION_PLUS_ENTITLEMENT,
      productIdentifier: entitlement?.productIdentifier || null,
      expirationDate: entitlement?.expirationDate || null
    });
  }
  return {
    isPremium: active,
    selectedPlan: plan,
    subscriptionStatus: active ? 'active' : entitlement ? 'expired' : 'inactive',
    source: 'RevenueCat',
    entitlement,
    expirationDate: entitlement?.expirationDate || null,
    renewsAt: entitlement?.expirationDate || null,
    willRenew: Boolean(entitlement?.willRenew),
    productIdentifier: entitlement?.productIdentifier || customerInfo?.activeSubscriptions?.[0] || null,
    managementURL: customerInfo?.managementURL || null,
    rawCustomerInfo: customerInfo || null
  };
}

export async function initializeRevenueCat(userId = null) {
  if (!revenueCatApiKey) {
    return { configured: false, customerInfo: null };
  }

  if (!configured) {
    Purchases.configure({
      apiKey: revenueCatApiKey,
      ...(userId ? { appUserID: userId } : {})
    });
    configured = true;
    configuredUserId = userId || null;
    console.log('[RevenueCat] initialized', { userId: userId || 'anonymous' });
  } else if (configuredUserId !== userId) {
    if (userId) {
      const result = await Purchases.logIn(userId);
      configuredUserId = userId;
      console.log('[RevenueCat] initialized', { userId, created: result?.created });
    }
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { configured: true, customerInfo };
  } catch (error) {
    markRevenueCatError(error);
    if (isDevBuild && isKnownRevenueCatSetupError(error)) {
      return { configured: true, customerInfo: null };
    }
    throw new Error(lastRevenueCatError);
  }
}

export async function logOutRevenueCat() {
  if (!configured) {
    return null;
  }
  let currentAppUserId = configuredUserId;
  try {
    if (typeof Purchases.getAppUserID === 'function') {
      currentAppUserId = await Purchases.getAppUserID();
    }
  } catch (error) {
    console.warn('[RevenueCat] current user lookup failed before logout:', error?.message || String(error));
  }
  const isAnonymous = !currentAppUserId || `${currentAppUserId}`.startsWith('$RCAnonymousID:');
  if (isAnonymous) {
    configuredUserId = null;
    console.log('[RevenueCat] logout skipped: already anonymous');
    return null;
  }
  configuredUserId = null;
  return Purchases.logOut();
}

export async function getRevenueCatSubscription(userId) {
  const { configured: ready, customerInfo } = await initializeRevenueCat(userId);
  if (!ready) {
    return {
      isPremium: false,
      selectedPlan: 'yearly',
      subscriptionStatus: 'unavailable',
      source: 'RevenueCat unavailable',
      entitlement: null,
      expirationDate: null,
      renewsAt: null,
      productIdentifier: null,
      managementURL: null,
      rawCustomerInfo: null
    };
  }
  if (!customerInfo && setupPaused) {
    throw new Error(lastRevenueCatError || DEV_SETUP_PAUSED_MESSAGE);
  }
  return mapCustomerInfoToSubscription(customerInfo);
}

export async function checkPremiumAccess(userId) {
  try {
    const subscription = await getRevenueCatSubscription(userId);
    return Boolean(subscription.isPremium);
  } catch (error) {
    if (isDevBuild && isKnownRevenueCatSetupError(error)) {
      console.log('[RevenueCat] setup paused:', lastRevenueCatError || DEV_SETUP_PAUSED_MESSAGE);
      return false;
    }
    throw error;
  }
}

export async function getRevenueCatOfferings(userId) {
  try {
    await initializeRevenueCat(userId);
    lastOfferings = await Purchases.getOfferings();
    if (!lastOfferings?.current) {
      throw revenueCatError('no_current_offering', 'No current RevenueCat Offering was returned.');
    }
    offeringsLoaded = Boolean(lastOfferings.current.availablePackages?.length);
    if (!offeringsLoaded) {
      throw revenueCatError('no_current_offering', 'The current RevenueCat Offering has no available packages.');
    }
    setupPaused = false;
    lastRevenueCatError = '';
    return lastOfferings;
  } catch (error) {
    offeringsLoaded = false;
    const category = revenueCatErrorCategory(error);
    markRevenueCatError(error);
    throw revenueCatError(category, lastRevenueCatError, error);
  }
}

export function findPackageForPlan(offerings, planId) {
  const packages = offerings?.current?.availablePackages || [];
  const targetType = planId === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  const targetProductId = REVENUECAT_PRODUCT_IDS[planId] || REVENUECAT_PRODUCT_IDS.yearly;
  return packages.find((item) => item.product?.identifier === targetProductId) ||
    packages.find((item) => item.packageType === targetType) ||
    packages.find((item) => `${item.identifier}`.toLowerCase().includes(planId === 'monthly' ? 'month' : 'year')) ||
    packages.find((item) => `${item.product?.identifier || ''}`.toLowerCase().includes(planId === 'monthly' ? 'month' : 'year')) ||
    null;
}

export async function getRevenueCatPaywallPackages(userId) {
  const offerings = await getRevenueCatOfferings(userId);
  const packages = offerings.current.availablePackages || [];
  const monthly = packages.find((item) => item.product?.identifier === REVENUECAT_PRODUCT_IDS.monthly) || null;
  const yearly = packages.find((item) => item.product?.identifier === REVENUECAT_PRODUCT_IDS.yearly) || null;
  if (!monthly || !yearly) {
    const missing = [!monthly ? 'monthly' : null, !yearly ? 'yearly' : null].filter(Boolean).join(' and ');
    offeringsLoaded = false;
    const error = revenueCatError('missing_packages', `The current RevenueCat Offering is missing the ${missing} package.`);
    markRevenueCatError(error);
    throw error;
  }
  return { offerings, monthly, yearly };
}

export async function purchaseFusionPlan(userId, planId) {
  const offerings = lastOfferings || await getRevenueCatOfferings(userId);
  const selectedPackage = findPackageForPlan(offerings, planId);
  if (!selectedPackage) {
    offeringsLoaded = false;
    markRevenueCatError(new Error('RevenueCat products could not be fetched.'));
    throw new Error(lastRevenueCatError || 'Subscription option unavailable. Please try again shortly.');
  }

  const result = await Purchases.purchasePackage(selectedPackage);
  console.log('[RevenueCat] purchase success', {
    planId,
    productIdentifier: selectedPackage.product?.identifier || null
  });
  return mapCustomerInfoToSubscription(result.customerInfo);
}

export function purchaseMonthlySubscription(userId) {
  return purchaseFusionPlan(userId, 'monthly');
}

export function purchaseYearlySubscription(userId) {
  return purchaseFusionPlan(userId, 'yearly');
}

export async function restoreRevenueCatPurchases(userId) {
  try {
    await initializeRevenueCat(userId);
    const customerInfo = await Purchases.restorePurchases();
    console.log('[RevenueCat] restore success', { userId });
    return mapCustomerInfoToSubscription(customerInfo);
  } catch (error) {
    markRevenueCatError(error);
    throw new Error(lastRevenueCatError || 'Restore purchases is unavailable right now.');
  }
}

export function addRevenueCatCustomerInfoUpdateListener(listener) {
  const wrappedListener = (customerInfo) => listener(mapCustomerInfoToSubscription(customerInfo));
  Purchases.addCustomerInfoUpdateListener(wrappedListener);
  return () => Purchases.removeCustomerInfoUpdateListener(wrappedListener);
}
