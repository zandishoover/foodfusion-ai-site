import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

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

export function isKnownRevenueCatSetupError(error) {
  const message = error?.message || `${error || ''}`;
  return /there was a problem with the app store|products could not be fetched|offerings.*empty|offering.*empty|no offerings|no products|couldn't fetch|couldn.t be completed|couldn't be completed|could not be completed|offeringsmanager/i.test(message);
}

function friendlyRevenueCatError(error) {
  const message = error?.message || `${error || ''}` || 'RevenueCat is not ready.';
  if (isKnownRevenueCatSetupError(error)) {
    return isDevBuild ? DEV_SETUP_PAUSED_MESSAGE : PRODUCTION_PURCHASE_UNAVAILABLE_MESSAGE;
  }
  return message;
}

function markRevenueCatError(error) {
  lastRevenueCatError = friendlyRevenueCatError(error);
  const knownSetupError = isKnownRevenueCatSetupError(error);
  if (isDevBuild && knownSetupError) {
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
    selectedPlan: active ? plan : 'yearly',
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
    offeringsLoaded = Boolean(lastOfferings?.current?.availablePackages?.length);
    if (!offeringsLoaded) {
      throw new Error('RevenueCat offerings are empty.');
    }
    setupPaused = false;
    lastRevenueCatError = '';
    return lastOfferings;
  } catch (error) {
    offeringsLoaded = false;
    markRevenueCatError(error);
    throw new Error(lastRevenueCatError);
  }
}

function findPackageForPlan(offerings, planId) {
  const packages = offerings?.current?.availablePackages || [];
  const targetType = planId === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  const targetProductId = REVENUECAT_PRODUCT_IDS[planId] || REVENUECAT_PRODUCT_IDS.yearly;
  return packages.find((item) => item.product?.identifier === targetProductId) ||
    packages.find((item) => item.packageType === targetType) ||
    packages.find((item) => `${item.identifier}`.toLowerCase().includes(planId === 'monthly' ? 'month' : 'year')) ||
    packages.find((item) => `${item.product?.identifier || ''}`.toLowerCase().includes(planId === 'monthly' ? 'month' : 'year')) ||
    null;
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
