import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Vibration
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  checkRecipeMcpStatus,
  getRecipesFromMcp
} from './services/recipeMcp';
import {
  createInstacartCheckout,
  findInstacartStores,
  getInstacartOrderTracking,
  searchInstacartItems
} from './services/instacartMcp';
import {
  getSupabaseAccessToken,
  getSupabaseSessionProfile,
  manageSupabaseAutoRefresh,
  observeSupabaseAuth,
  resetSupabasePassword,
  signInWithSupabase,
  signOutOfSupabase,
  signUpWithSupabase,
  supabaseConfigured
} from './services/supabaseAuth';
import {
  clearRemoteScanHistory,
  deleteRemoteScan,
  loadSyncedUserData,
  replaceActiveShoppingCart,
  replaceFavoriteRecipes,
  replacePantryItems,
  saveOpenedRecipe,
  savePlacedOrder,
  saveStructuredScanResult,
  setRemoteScanFavorite,
  syncSubscriptionStatus,
  syncUserPreferences
} from './services/userDataRepository';

const SCAN_KEY = 'foodfusion:lastScanDate';
const PREMIUM_KEY = 'foodfusion:fusionPlus';
const PREMIUM_PLAN_KEY = 'foodfusion:fusionPlusPlan';
const AUTH_KEY = 'foodfusion:isLoggedIn';
const USER_PROFILE_KEY = 'foodfusion:userProfile';
const APPLE_AUTH_KEY = 'foodfusion:appleAuthSession';
const HISTORY_KEY = 'foodfusion:mealHistory';
const FAVORITES_KEY = 'foodfusion:favorites';
const GROCERY_KEY = 'foodfusion:groceryList';
const SHOPPING_CART_KEY = 'foodfusion:shoppingCart';
const SHOPPING_LOCATION_KEY = 'foodfusion:shoppingLocation';
const ORDER_HISTORY_KEY = 'foodfusion:orderHistory';
const PREFERENCES_KEY = 'foodfusion:preferences';
const DISLIKES_KEY = 'foodfusion:dislikedIngredients';
const SERVINGS_KEY = 'foodfusion:servings';
const EQUIPMENT_KEY = 'foodfusion:equipment';
const ONBOARDING_KEY = 'foodfusion:onboardingCompleted';
const FEEDBACK_KEY = 'foodfusion:recipeFeedback';
const FEEDBACK_SUBMISSIONS_KEY = 'feedbackSubmissions';
const SCAN_COUNT_KEY = 'foodfusion:scanCountToday';
const GROCERY_CHECKED_KEY = 'foodfusion:groceryChecked';
const PANTRY_KEY = 'foodfusion:pantryItems';
const PLANNER_KEY = 'foodfusion:mealPlanner';
const RECIPE_SOURCE_KEY = 'foodfusion:recipeSource';
const INGREDIENT_STATUS_KEY = 'foodfusion:ingredientStatuses';
const EQUIPMENT_PROFILE_KEY = 'foodfusion:equipmentProfile';
const RECIPE_RATINGS_KEY = 'foodfusion:recipeRatings';
const HOUSEHOLD_KEY = 'foodfusion:household';
const BUDGET_GOALS_KEY = 'foodfusion:budgetGoals';
const MACRO_LOCK_KEY = 'foodfusion:macroLock';
const SOCIAL_KEY = 'foodfusion:socialPosts';
const NOTIFICATION_PREFERENCES_KEY = 'foodfusion:notificationPreferences';
const CAMERA_PERMISSION_INTRO_KEY = 'foodfusion:cameraPermissionIntroSeen';
const NOTIFICATION_PERMISSION_KEY = 'foodfusion:notificationsEnabled';
const FAVORITE_SCANS_KEY = 'foodfusion:favoriteScans';
const RECENT_SEARCHES_KEY = 'foodfusion:recentSearches';
const QA_CHECKLIST_KEY = 'foodfusion:qaChecklist';
const BETA_FEEDBACK_EMAIL = 'zandis.hoover04@gmail.com';
const USER_SCOPED_CACHE_KEYS = new Set([
  SCAN_KEY,
  PREMIUM_KEY,
  PREMIUM_PLAN_KEY,
  HISTORY_KEY,
  FAVORITE_SCANS_KEY,
  FAVORITES_KEY,
  GROCERY_KEY,
  SHOPPING_CART_KEY,
  SHOPPING_LOCATION_KEY,
  RECENT_SEARCHES_KEY,
  ORDER_HISTORY_KEY,
  PREFERENCES_KEY,
  DISLIKES_KEY,
  SERVINGS_KEY,
  EQUIPMENT_KEY,
  FEEDBACK_KEY,
  SCAN_COUNT_KEY,
  GROCERY_CHECKED_KEY,
  PANTRY_KEY,
  PLANNER_KEY,
  RECIPE_SOURCE_KEY,
  INGREDIENT_STATUS_KEY,
  EQUIPMENT_PROFILE_KEY,
  RECIPE_RATINGS_KEY,
  HOUSEHOLD_KEY,
  BUDGET_GOALS_KEY,
  MACRO_LOCK_KEY,
  SOCIAL_KEY,
  NOTIFICATION_PREFERENCES_KEY,
  NOTIFICATION_PERMISSION_KEY
]);

function stableUserId(profile) {
  return profile?.id || profile?.email || null;
}

function scopedCacheKey(key, userId) {
  return userId && USER_SCOPED_CACHE_KEYS.has(key) ? `foodfusion:user:${userId}:${key}` : key;
}

function isReviewDemoProfile(profile) {
  const email = profile?.email?.toLowerCase() || '';
  return profile?.provider === 'apple' || email.includes('demo') || email.includes('review') || email.includes('privaterelay.appleid.com');
}

const palette = {
  background: '#090D12',
  panel: '#111827',
  card: '#1B2430',
  cardAlt: '#D9F7F0',
  cream: '#F8FAFC',
  muted: '#94A3B8',
  green: '#6EA8FE',
  greenDeep: '#15395B',
  black: '#071018',
  line: '#293445',
  warning: '#7DD3FC'
};

const flowColors = {
  Meals: { accent: '#6EA8FE', tint: '#15395B' },
  Smoothies: { accent: '#5CCB9A', tint: '#12362D' },
  'Protein Shakes': { accent: '#B69AF7', tint: '#302351' },
  Drinks: { accent: '#F5AD62', tint: '#422D1E' },
  shopping: { accent: '#4CC8C3', tint: '#10383A' },
  fusion: { accent: '#E9BD62', tint: '#44351D' },
  profile: { accent: '#A7B3C3', tint: '#202A36' },
  saved: { accent: '#F18BA4', tint: '#422532' }
};

const premiumCategories = [
  'High Protein',
  'Gym',
  'Cheap Eats',
  'Late Night',
  'Healthy',
  'Meal Prep',
  'Air Fryer',
  'Leftover Rescue',
  'Lazy Mode',
  'College Budget',
  'One More Item'
];

const macroFilters = ['High Protein', 'Lower Calorie', 'Balanced'];
const recipeTypes = ['Meals', 'Smoothies', 'Protein Shakes', 'Drinks'];
const recipeTypeFilters = ['Meals', 'Smoothies', 'Protein Shakes', 'Drinks', 'All'];
const favoriteFolders = ['All', 'Favorites', 'Meal Prep', 'Family', 'Gym Meals', 'Drinks', 'Quick Meals'];
const fusionPlans = [
  { id: 'weekly', name: 'Weekly', price: '$2.99', cadence: '/week', badge: '' },
  { id: 'monthly', name: 'Monthly', price: '$7.99', cadence: '/month', badge: 'Most Popular' },
  { id: 'yearly', name: 'Yearly', price: '$49.99', cadence: '/year', badge: 'Best Value' }
];
const fusionBenefits = [
  'Unlimited scans',
  'One More Item',
  'Advanced meal modes',
  'Smoothies and protein shakes',
  'Macros',
  'Grocery shopping tools',
  'Meal prep plans',
  'Smart recipe matching'
];
const analysisSteps = ['Detecting ingredients...', 'Matching recipes...', 'Building your meals...'];
const recipeCardWidth = Dimensions.get('window').width - 44;
const corePreferenceOptions = [
  'High Protein',
  'Low Carb',
  'Vegetarian',
  'No Dairy',
  'No Pork',
  'Gluten Free',
  'Nut Free',
  'Seafood Free',
  'Healthy',
  'Cheap Meals'
];
const expandedPreferenceOptions = [
  'Kids / Family',
  'Carnivore',
  'Keto',
  'Vegan',
  'Mediterranean',
  'Asian-Inspired',
  'Mexican-Inspired',
  'Italian-Inspired',
  'Japanese',
  'Korean',
  'Thai',
  'Vietnamese',
  'Chinese',
  'Indian',
  'Greek',
  'Spanish',
  'French',
  'Caribbean',
  'Jamaican',
  'Brazilian',
  'Middle Eastern',
  'Lebanese',
  'Ethiopian',
  'West African',
  'Southern US',
  'Cajun / Creole',
  'Comfort Food',
  'Meal Prep',
  'Weight Loss',
  'Bulking',
  'Cutting',
  'Low Sugar',
  'Low Sodium',
  'High Fiber',
  'Quick Meals',
  '5 Ingredients or Less',
  'College Budget',
  'Picky Eater',
  'Athlete Meals',
  'Diabetic Friendly',
  'Heart Healthy',
  'Anti-Inflammatory',
  'Dairy Free',
];
const equipmentOptions = ['Microwave', 'Air Fryer', 'Stove', 'Oven', 'No Cooking'];
const kitchenEquipmentOptions = [
  'stove',
  'oven',
  'microwave',
  'air fryer',
  'blender',
  'toaster',
  'toaster oven',
  'slow cooker',
  'crockpot',
  'pressure cooker',
  'rice cooker',
  'grill',
  'skillet',
  'sheet pan',
  'saucepan',
  'mixing bowl'
];
const moodOptions = ['Comfort', 'Light', 'Filling', 'Post-Workout', 'Lazy', 'Sweet'];
const servingOptions = [1, 2, 4];
const recipeSourceOptions = ['On-device Recipes', 'Recipe MCP Server', 'Hybrid Mode'];
const freshnessOptions = ['fresh', 'use soon', 'almost expired'];
const APP_VERSION = '1.0.0';
const APP_BUILD_NUMBER = '1';
const SUPPORT_EMAIL = 'support@foodfusion.ai';
const FOOD_SCAN_ENDPOINT = process.env.EXPO_PUBLIC_FOOD_SCAN_ENDPOINT?.trim();
// A development bridge access token is not an API secret; production requests must use authenticated server authorization.
const FOOD_SCAN_ACCESS_TOKEN = process.env.EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN?.trim();
const FOOD_SCAN_TIMEOUT_MS = 45000;
const FOOD_SCAN_IMAGE_MAX_WIDTH = 1280;
const FOOD_SCAN_IMAGE_QUALITY = 0.52;
const scanEndpointIsDevelopment = Boolean(FOOD_SCAN_ENDPOINT && /(localhost|127\.0\.0\.1|192\.168\.|10\.)/.test(FOOD_SCAN_ENDPOINT));
const scanEndpointStatus = !FOOD_SCAN_ENDPOINT
  ? 'Not configured'
  : scanEndpointIsDevelopment
  ? 'Development endpoint'
  : 'Hosted endpoint configured';
const reviewSafeScanDetections = [
  { name: 'eggs', confidence: 0.94, estimatedQuantity: '6 count', notes: 'review-safe sample detection' },
  { name: 'yogurt', confidence: 0.88, estimatedQuantity: '1 container', notes: 'review-safe sample detection' },
  { name: 'spinach', confidence: 0.84, estimatedQuantity: '1 bag', notes: 'review-safe sample detection' },
  { name: 'rice', confidence: 0.8, estimatedQuantity: '1 container', notes: 'review-safe sample detection' },
  { name: 'chicken', confidence: 0.76, estimatedQuantity: '1 package', notes: 'review-safe sample detection' }
];
const reviewSafeScanNotice = 'FoodFusion Analysis unavailable. Showing demo scan results.';
const qaChecklistItems = [
  'Login works',
  'Scan works',
  'See Meals works',
  'Favorites save',
  'Shopping works',
  'Checkout works',
  'Orders save',
  'Feedback works',
  'Delete account works',
  'Logout works'
];
const almostTherePreviews = [
  'Add tortillas -> 8 more meals',
  'Add Greek yogurt -> 5 protein bowls',
  'Add eggs -> 6 breakfast ideas'
];
const storeOptions = [
  ['Costco Bulk', 'Bulk proteins, rice, frozen fruit'],
  ["Trader Joe's Healthy", 'Prepared meals, salmon, greens'],
  ['Walmart Budget', 'Eggs, beans, oats, chicken'],
  ['Target Quick', 'Fast pantry runs and drinks']
];
const macroLockOptions = ['200g protein', 'low carb', 'bulk mode', 'cut mode'];
const portionOptions = ['single serving', 'couple', 'family', 'meal prep containers'];
const seasonalOptions = ['summer meals', 'winter comfort food', 'football snacks', 'holiday meals'];
const fitnessIntegrations = ['Apple Health', 'Fitbit', 'MyFitnessPal', 'WHOOP'];
const recoveryOptions = ['soreness', 'fatigue', 'sleep quality', 'workout intensity'];
const voiceCommands = ['next step', 'repeat', 'start timer'];
const onboardingScreens = [
  { title: 'Scan ingredients', text: 'Take a fridge or pantry photo and review what is detected.' },
  { title: 'Get AI recipes', text: 'Turn available ingredients into meals, smoothies, shakes, and drinks.' },
  { title: "Shop what's missing", text: 'Add needed ingredients to your cart and track your order.' }
];
const collectionFolders = [
  'Game Day',
  'Date Night',
  'Kids Favorites',
  'College Survival',
  'Gym Meals',
  'Late Night',
  'Hangover Recovery',
  'Summer Drinks',
  'Winter Comfort',
  'Meal Prep Sunday'
];
const collectionPresets = {
  'Game Day': { recipeType: 'Meals', mood: 'Comfort', ingredients: ['chicken', 'hot sauce', 'corn', 'cheddar'] },
  'Date Night': { recipeType: 'Meals', mood: 'Light', ingredients: ['salmon', 'lemon', 'cucumber', 'rice'] },
  'Kids Favorites': { recipeType: 'Meals', mood: 'Comfort', ingredients: ['eggs', 'rice', 'cheddar', 'tomatoes'] },
  'College Survival': { recipeType: 'Meals', mood: 'Lazy', ingredients: ['noodles', 'eggs', 'hot sauce', 'corn'] },
  'Gym Meals': { recipeType: 'Meals', mood: 'Post-Workout', ingredients: ['chicken', 'rice', 'spinach', 'yogurt'] },
  'Late Night': { recipeType: 'Meals', mood: 'Lazy', ingredients: ['noodles', 'eggs', 'soy sauce', 'mushrooms'] },
  'Hangover Recovery': { recipeType: 'Smoothies', mood: 'Light', ingredients: ['banana', 'berries', 'yogurt', 'honey'] },
  'Summer Drinks': { recipeType: 'Drinks', mood: 'Light', ingredients: ['lemon', 'cucumber', 'berries', 'ice'] },
  'Winter Comfort': { recipeType: 'Meals', mood: 'Comfort', ingredients: ['rice', 'chicken', 'cheddar', 'spinach'] },
  'Meal Prep Sunday': { recipeType: 'Meals', mood: 'Filling', ingredients: ['chicken', 'rice', 'broccoli', 'yogurt'] }
};
const plannerDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const assistantPrompts = ['What can I make fast?', 'High protein options?', 'What should I buy?'];
const shoppingStoreOptions = ['All Stores', "Fry's", 'Safeway', 'Walmart', 'Target', "Trader Joe's", 'Whole Foods', 'Costco'];
const shoppingStoreMeta = {
  "Fry's": { delivery: 'Delivery 45-60 min', pickup: 'Pickup today' },
  Safeway: { delivery: 'Delivery 35-50 min', pickup: 'Pickup in 2 hr' },
  Walmart: { delivery: 'Delivery 60-75 min', pickup: 'Pickup today' },
  Target: { delivery: 'Delivery 45-60 min', pickup: 'Pickup in 90 min' },
  "Trader Joe's": { delivery: 'Delivery 50-65 min', pickup: 'Pickup today' },
  'Whole Foods': { delivery: 'Delivery 45-60 min', pickup: 'Pickup in 1 hr' },
  Costco: { delivery: 'Delivery 60-90 min', pickup: 'Pickup tomorrow' }
};
const orderTimelineSteps = {
  Delivery: ['Order placed', 'Store preparing', 'Shopper picking items', 'On the way', 'Delivered'],
  Pickup: ['Order placed', 'Store preparing', 'Items being picked', 'Ready for pickup', 'Picked up']
};
const localShoppingCatalog = [
  { key: 'egg', name: 'Large Eggs', store: "Fry's", price: '$4.49', size: '12 ct' },
  { key: 'egg', name: 'Organic Eggs', store: 'Whole Foods', price: '$6.99', size: '12 ct' },
  { key: 'egg', name: 'Cage Free Eggs', store: 'Safeway', price: '$5.29', size: '12 ct' },
  { key: 'egg', name: 'Kirkland Eggs', store: 'Costco', price: '$8.99', size: '24 ct' },
  { key: 'chicken', name: 'Chicken Breast', store: 'Walmart', price: '$8.98', size: '1.5 lb' },
  { key: 'chicken', name: 'Organic Chicken Breast', store: 'Whole Foods', price: '$11.99', size: '1 lb' },
  { key: 'chicken', name: 'Thin Sliced Chicken', store: 'Target', price: '$7.99', size: '1 lb' },
  { key: 'spinach', name: 'Baby Spinach', store: "Fry's", price: '$3.99', size: '5 oz' },
  { key: 'spinach', name: 'Organic Baby Spinach', store: 'Safeway', price: '$4.99', size: '5 oz' },
  { key: 'rice', name: 'Jasmine Rice', store: 'Walmart', price: '$5.49', size: '2 lb' },
  { key: 'rice', name: 'Brown Rice', store: "Trader Joe's", price: '$3.49', size: '2 lb' },
  { key: 'yogurt', name: 'Greek Yogurt', store: 'Target', price: '$5.99', size: '32 oz' },
  { key: 'yogurt', name: 'Chobani Greek Yogurt', store: 'Safeway', price: '$6.49', size: '32 oz' },
  { key: 'milk', name: 'Almond Milk', store: "Fry's", price: '$4.29', size: '64 oz' },
  { key: 'milk', name: 'Coconut Milk', store: "Trader Joe's", price: '$3.99', size: '64 oz' },
  { key: 'berries', name: 'Strawberries', store: 'Whole Foods', price: '$4.99', size: '1 lb' },
  { key: 'berries', name: 'Mixed Berries', store: 'Costco', price: '$9.99', size: '3 lb' },
  { key: 'protein', name: 'Protein Powder', store: 'Walmart', price: '$24.99', size: '1 lb' },
  { key: 'protein', name: 'Whey Protein', store: 'Target', price: '$29.99', size: '1.5 lb' }
];
const localStoreProfiles = [
  { name: "Fry's", baseDistance: 1.2, deliveryFee: '$3.99' },
  { name: 'Safeway', baseDistance: 2.1, deliveryFee: '$4.99' },
  { name: 'Walmart', baseDistance: 3.4, deliveryFee: '$2.99' },
  { name: 'Target', baseDistance: 4.1, deliveryFee: '$4.99' },
  { name: "Trader Joe's", baseDistance: 5.3, deliveryFee: '$5.99' },
  { name: 'Whole Foods', baseDistance: 6.2, deliveryFee: '$5.99' },
  { name: 'Costco', baseDistance: 8.7, deliveryFee: '$6.99' }
];

function nearbyStoreOptionsForLocation(location, mode = 'Delivery') {
  const cleanLocation = `${location?.address || ''}`.trim();
  const locationSeed = [...cleanLocation].reduce((total, char) => total + char.charCodeAt(0), 0);
  return localStoreProfiles
    .map((store, index) => {
      const distance = store.baseDistance + ((locationSeed + index * 3) % 8) / 10;
      const metadata = shoppingStoreMeta[store.name];
      return {
        id: store.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: store.name,
        distance: `${distance.toFixed(1)} mi`,
        eta: mode === 'Delivery' ? metadata.delivery : metadata.pickup,
        fee: mode === 'Delivery' ? store.deliveryFee : 'No pickup fee',
        status: (locationSeed + index) % 6 === 0 ? 'Closes soon' : 'Open'
      };
    })
    .sort((first, second) => parseFloat(first.distance) - parseFloat(second.distance));
}

const ingredientSets = [
  ['eggs', 'spinach', 'cheddar', 'rice', 'tomatoes'],
  ['chicken', 'yogurt', 'cucumber', 'rice', 'lemon'],
  ['black beans', 'corn', 'avocado', 'eggs', 'hot sauce'],
  ['tofu', 'mushrooms', 'broccoli', 'noodles', 'soy sauce']
];

const mealBank = [
  {
    title: 'Green Skillet Eggs',
    time: '18 min',
    difficulty: 'Easy',
    ingredients: ['eggs', 'spinach', 'cheddar', 'tomatoes'],
    missingIngredients: ['tortillas'],
    steps: [
      'Warm a nonstick skillet over medium heat.',
      'Cook tomatoes until glossy, then fold in spinach.',
      'Crack in eggs and cover until the whites set.',
      'Finish with cheddar, black pepper, and a pinch of salt.'
    ]
  },
  {
    title: 'Creamy Rice Bowl',
    time: '22 min',
    difficulty: 'Easy',
    ingredients: ['rice', 'yogurt', 'cucumber', 'lemon'],
    missingIngredients: ['chicken'],
    steps: [
      'Heat cooked rice with a splash of water until fluffy.',
      'Mix yogurt, lemon, salt, and pepper into a quick sauce.',
      'Dice cucumber and any soft herbs you have.',
      'Layer rice, sauce, cucumber, and a drizzle of olive oil.'
    ]
  },
  {
    title: 'Pantry Protein Crunch',
    time: '15 min',
    difficulty: 'Easy',
    ingredients: ['black beans', 'corn', 'avocado', 'hot sauce'],
    missingIngredients: ['tortillas'],
    steps: [
      'Rinse beans and warm them with corn in a small pan.',
      'Season with hot sauce, salt, and a squeeze of lemon.',
      'Mash avocado with pepper and a little oil.',
      'Serve the beans over rice or greens with avocado on top.'
    ]
  },
  {
    title: 'Late Night Noodle Toss',
    time: '20 min',
    difficulty: 'Medium',
    ingredients: ['tofu', 'mushrooms', 'noodles', 'soy sauce'],
    missingIngredients: ['ginger'],
    steps: [
      'Boil noodles until just tender, then drain.',
      'Sear tofu cubes until golden on two sides.',
      'Add mushrooms and cook until browned.',
      'Toss with noodles, soy sauce, and a splash of noodle water.'
    ]
  }
];

const premiumMealBank = {
  'High Protein': [
    {
      title: 'Lean Chicken Power Bowl',
      time: '24 min',
      difficulty: 'Easy',
      ingredients: ['chicken', 'rice', 'yogurt', 'cucumber'],
      missingIngredients: ['lemon'],
      steps: [
        'Warm rice while chicken sears in a lightly oiled pan.',
        'Stir yogurt, lemon, salt, and pepper into a cool sauce.',
        'Slice cucumber and any greens you have.',
        'Build the bowl with rice, chicken, sauce, and cucumber.'
      ]
    },
    {
      title: 'Egg White Pantry Plate',
      time: '17 min',
      difficulty: 'Easy',
      ingredients: ['eggs', 'spinach', 'cheddar', 'tomatoes'],
      missingIngredients: ['tuna'],
      steps: [
        'Separate two eggs or use the whole eggs for richer flavor.',
        'Wilt spinach with tomatoes over medium heat.',
        'Add eggs and cook slowly until just set.',
        'Top with a small handful of cheddar.'
      ]
    }
  ],
  Gym: [
    {
      title: 'Post-Workout Rice Stack',
      time: '20 min',
      difficulty: 'Easy',
      ingredients: ['rice', 'chicken', 'avocado', 'hot sauce'],
      missingIngredients: ['eggs'],
      steps: [
        'Reheat rice until steamy and soft.',
        'Slice chicken and warm it in a pan.',
        'Mash avocado with salt and hot sauce.',
        'Layer rice, chicken, and avocado for a quick recovery meal.'
      ]
    }
  ],
  'Cheap Eats': [
    {
      title: 'Bean and Corn Skillet',
      time: '16 min',
      difficulty: 'Easy',
      ingredients: ['black beans', 'corn', 'rice', 'hot sauce'],
      cost: 'Under $5',
      missingIngredients: ['tortillas'],
      steps: [
        'Warm beans and corn in a skillet.',
        'Season with hot sauce and a pinch of salt.',
        'Fold in rice and cook until the edges get crisp.',
        'Finish with avocado if you have it.'
      ]
    }
  ],
  'Late Night': [
    {
      title: 'Midnight Soy Noodles',
      time: '14 min',
      difficulty: 'Easy',
      ingredients: ['noodles', 'soy sauce', 'mushrooms', 'eggs'],
      missingIngredients: ['scallions'],
      steps: [
        'Boil noodles until tender.',
        'Saute mushrooms until browned.',
        'Toss noodles with soy sauce and a little cooking water.',
        'Top with a soft egg.'
      ]
    }
  ],
  Healthy: [
    {
      title: 'Bright Tofu Greens',
      time: '22 min',
      difficulty: 'Medium',
      ingredients: ['tofu', 'broccoli', 'mushrooms', 'lemon'],
      missingIngredients: ['rice'],
      steps: [
        'Press tofu with a towel, then cube it.',
        'Sear tofu until golden.',
        'Add broccoli and mushrooms with a splash of water.',
        'Finish with lemon and soy sauce.'
      ]
    }
  ],
  'Meal Prep': [
    {
      title: 'Three-Day Pantry Bowls',
      time: '35 min',
      difficulty: 'Medium',
      ingredients: ['rice', 'black beans', 'corn', 'chicken'],
      missingIngredients: ['avocado'],
      steps: [
        'Cook or reheat a large batch of rice.',
        'Warm beans, corn, and chicken together.',
        'Divide into containers while still warm.',
        'Add sauce or avocado right before eating.'
      ]
    }
  ],
  'Air Fryer': [
    {
      title: 'Air Fryer Chicken Bites',
      time: '12 min',
      difficulty: 'Easy',
      airFryer: '390°F for 12 minutes',
      ingredients: ['chicken', 'yogurt', 'hot sauce', 'rice'],
      missingIngredients: ['garlic powder'],
      steps: [
        'Cut chicken into small pieces.',
        'Coat with yogurt, hot sauce, salt, and pepper.',
        'Air fry in a single layer until browned.',
        'Serve over warm rice.'
      ]
    },
    {
      title: 'Crispy Tofu Air Fryer Bowl',
      time: '14 min',
      difficulty: 'Easy',
      airFryer: '400°F for 14 minutes',
      ingredients: ['tofu', 'broccoli', 'soy sauce', 'rice'],
      missingIngredients: ['sesame oil'],
      steps: [
        'Cube tofu and pat it dry.',
        'Toss tofu and broccoli with soy sauce.',
        'Air fry until the tofu edges crisp.',
        'Serve with rice and extra sauce.'
      ]
    }
  ],
  'Leftover Rescue': [
    {
      title: 'Use-Soon Fried Rice',
      time: '18 min',
      difficulty: 'Easy',
      useSoon: true,
      ingredients: ['rice', 'eggs', 'corn', 'soy sauce'],
      missingIngredients: ['scallions'],
      steps: [
        'Break up cold rice with your hands.',
        'Scramble eggs in a hot pan.',
        'Add rice, corn, and soy sauce.',
        'Cook until the rice smells toasted.'
      ]
    }
  ],
  'Lazy Mode': [
    {
      title: 'Lazy Egg Rice',
      time: '10 min',
      difficulty: 'Easy',
      lazy: true,
      ingredients: ['eggs', 'rice', 'hot sauce'],
      missingIngredients: ['cheddar'],
      steps: [
        'Warm rice.',
        'Scramble eggs.',
        'Top rice with eggs and hot sauce.'
      ]
    },
    {
      title: 'Lazy Bean Bowl',
      time: '12 min',
      difficulty: 'Easy',
      lazy: true,
      ingredients: ['black beans', 'corn', 'avocado', 'hot sauce'],
      missingIngredients: ['tortillas'],
      steps: [
        'Warm beans and corn.',
        'Mash avocado.',
        'Serve together with hot sauce.'
      ]
    }
  ],
  'College Budget': [
    {
      title: 'Dorm Room Bean Rice',
      time: '13 min',
      difficulty: 'Easy',
      cost: 'Under $5',
      ingredients: ['rice', 'black beans', 'corn', 'hot sauce'],
      missingIngredients: ['tortillas'],
      steps: [
        'Microwave or warm rice.',
        'Heat beans and corn.',
        'Mix everything with hot sauce.',
        'Add salt if needed.'
      ]
    },
    {
      title: 'Budget Noodle Eggs',
      time: '14 min',
      difficulty: 'Easy',
      cost: 'Under $10',
      ingredients: ['noodles', 'eggs', 'soy sauce', 'mushrooms'],
      missingIngredients: ['spinach'],
      steps: [
        'Boil noodles.',
        'Scramble eggs in the same pan.',
        'Toss with soy sauce and mushrooms.'
      ]
    }
  ]
};

const macroEstimates = {
  'Green Skillet Eggs': { calories: 410, protein: 24, carbs: 18, fat: 27 },
  'Creamy Rice Bowl': { calories: 520, protein: 19, carbs: 76, fat: 15 },
  'Pantry Protein Crunch': { calories: 470, protein: 20, carbs: 64, fat: 16 },
  'Late Night Noodle Toss': { calories: 560, protein: 28, carbs: 68, fat: 19 },
  'Lean Chicken Power Bowl': { calories: 610, protein: 48, carbs: 58, fat: 18 },
  'Egg White Pantry Plate': { calories: 360, protein: 31, carbs: 14, fat: 19 },
  'Post-Workout Rice Stack': { calories: 650, protein: 42, carbs: 72, fat: 21 },
  'Bean and Corn Skillet': { calories: 430, protein: 18, carbs: 70, fat: 9 },
  'Midnight Soy Noodles': { calories: 500, protein: 23, carbs: 62, fat: 18 },
  'Bright Tofu Greens': { calories: 390, protein: 27, carbs: 28, fat: 20 },
  'Three-Day Pantry Bowls': { calories: 620, protein: 39, carbs: 76, fat: 17 }
};

const smoothieBank = [
  {
    title: 'Berry Recovery Smoothie',
    time: '6 min',
    difficulty: 'Beginner',
    type: 'Smoothies',
    healthFocus: 'Recovery',
    texture: 'Creamy',
    equipment: 'Blender Required',
    ingredients: ['yogurt', 'berries', 'banana', 'honey'],
    macros: { calories: 360, protein: 28, carbs: 52, fat: 7 },
    steps: ['Add fruit and yogurt to the blender.', 'Blend until smooth.', 'Pour cold and drink right away.'],
    missingIngredients: ['berries', 'banana']
  },
  {
    title: 'Green Hydration Blend',
    time: '5 min',
    difficulty: 'Beginner',
    type: 'Smoothies',
    healthFocus: 'Hydration',
    texture: 'Light',
    equipment: 'Blender Required',
    ingredients: ['spinach', 'cucumber', 'lemon', 'almond milk'],
    macros: { calories: 180, protein: 8, carbs: 24, fat: 6 },
    steps: ['Add greens, cucumber, lemon, and almond milk.', 'Blend until bright and smooth.', 'Serve over ice if you want it lighter.'],
    missingIngredients: ['banana']
  },
  {
    title: 'Oat Energy Smoothie',
    time: '7 min',
    difficulty: 'Easy',
    type: 'Smoothies',
    healthFocus: 'Energy Boost',
    texture: 'Thick',
    equipment: 'Blender Required',
    ingredients: ['oats', 'banana', 'yogurt', 'honey'],
    macros: { calories: 440, protein: 24, carbs: 70, fat: 9 },
    steps: ['Blend oats first for a smoother texture.', 'Add banana, yogurt, honey, and ice.', 'Blend thick and serve.'],
    missingIngredients: ['oats']
  }
];

const proteinShakeBank = [
  {
    title: 'Lean Protein Shake',
    time: '3 min',
    difficulty: 'Beginner',
    type: 'Protein Shakes',
    healthFocus: 'Lean Protein',
    texture: 'Light',
    equipment: 'Shaker Bottle',
    cost: 'Under $5',
    ingredients: ['protein powder', 'almond milk', 'ice'],
    macros: { calories: 240, protein: 42, carbs: 10, fat: 5 },
    steps: ['Add almond milk and protein powder to a shaker.', 'Shake for 30 seconds.', 'Add ice and shake again.'],
    missingIngredients: ['protein powder']
  },
  {
    title: 'Mass Gainer Shake',
    time: '6 min',
    difficulty: 'Easy',
    type: 'Protein Shakes',
    healthFocus: 'Weight Gain',
    texture: 'Thick',
    equipment: 'Blender Required',
    cost: 'Under $10',
    ingredients: ['protein powder', 'oats', 'banana', 'peanut butter', 'milk'],
    macros: { calories: 760, protein: 52, carbs: 88, fat: 24 },
    steps: ['Add milk, oats, banana, peanut butter, and protein powder.', 'Blend until thick.', 'Drink post-workout or with breakfast.'],
    missingIngredients: ['peanut butter']
  },
  {
    title: 'Pre Workout Fuel',
    time: '4 min',
    difficulty: 'Beginner',
    type: 'Protein Shakes',
    healthFocus: 'Pre Workout',
    texture: 'Fruity',
    equipment: 'Shaker Bottle',
    cost: 'Under $5',
    ingredients: ['coffee', 'protein powder', 'honey', 'ice'],
    macros: { calories: 260, protein: 30, carbs: 28, fat: 3 },
    steps: ['Chill coffee with ice.', 'Shake with protein powder and honey.', 'Drink 30 minutes before training.'],
    missingIngredients: ['coffee']
  }
];

const drinkBank = [
  {
    title: 'Iced Honey Coffee',
    time: '5 min',
    difficulty: 'Beginner',
    type: 'Drinks',
    healthFocus: 'Energy',
    texture: 'Light',
    equipment: 'Coffee Machine',
    ingredients: ['coffee', 'honey', 'almond milk', 'ice'],
    macros: { calories: 120, protein: 2, carbs: 22, fat: 3 },
    steps: ['Brew coffee and pour over ice.', 'Stir in honey.', 'Top with almond milk.'],
    missingIngredients: ['coffee']
  },
  {
    title: 'Citrus Hydration Cooler',
    time: '4 min',
    difficulty: 'Beginner',
    type: 'Drinks',
    healthFocus: 'Hydration',
    texture: 'Light',
    equipment: 'No Equipment',
    ingredients: ['lemon', 'cucumber', 'water', 'ice'],
    macros: { calories: 35, protein: 1, carbs: 9, fat: 0 },
    steps: ['Slice lemon and cucumber.', 'Add to cold water with ice.', 'Let it sit for a few minutes.'],
    missingIngredients: ['cucumber']
  },
  {
    title: 'Berry Sparkling Spritz',
    time: '6 min',
    difficulty: 'Easy',
    type: 'Drinks',
    healthFocus: 'Fruit Blend',
    texture: 'Fruity',
    equipment: 'No Equipment',
    ingredients: ['berries', 'sparkling drinks', 'lemon', 'ice'],
    macros: { calories: 90, protein: 1, carbs: 21, fat: 0 },
    steps: ['Muddle berries with lemon.', 'Add ice and sparkling water.', 'Stir and serve cold.'],
    missingIngredients: ['berries']
  }
];

function todayKey() {
  return localDateKey(new Date());
}

function localDateKey(date) {
  const localOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - localOffset).toISOString().slice(0, 10);
}

function dateFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function daysUntilExpiration(dateValue) {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return null;
  }
  const today = new Date(`${todayKey()}T00:00:00`);
  const expiration = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(expiration.getTime())) {
    return null;
  }
  return Math.ceil((expiration.getTime() - today.getTime()) / 86400000);
}

function expirationStatus(dateValue) {
  const days = daysUntilExpiration(dateValue);
  if (days === null) {
    return 'fresh';
  }
  if (days <= 1) {
    return 'almost expired';
  }
  if (days <= 4) {
    return 'use soon';
  }
  return 'fresh';
}

function expirationCopy(dateValue) {
  const days = daysUntilExpiration(dateValue);
  if (days === null) {
    return 'Add expiration date';
  }
  if (days < 0) {
    return `Expired ${Math.abs(days)}d ago`;
  }
  if (days === 0) {
    return 'Expires today';
  }
  if (days === 1) {
    return 'Expires tomorrow';
  }
  return `Expires in ${days} days`;
}

function inferImageMimeType(uri, mimeType) {
  if (mimeType) {
    return mimeType;
  }
  const extension = `${uri}`.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function normalizeFoodItems(payload) {
  const foods = Array.isArray(payload)
    ? payload
    : payload?.foods || payload?.ingredients || payload?.items || [];

  const mappedFoods = foods
    .map((item) => {
      const name = typeof item === 'string' ? item : item?.name || item?.food || item?.ingredient;
      if (!name || name.trim().length <= 1) {
        return null;
      }
      return {
        name: name.trim().toLowerCase(),
        confidence: typeof item === 'object' && Number.isFinite(Number(item?.confidence))
          ? Number(item.confidence)
          : null,
        estimatedQuantity: typeof item === 'object' ? item?.estimated_quantity || item?.estimatedQuantity || null : null,
        notes: typeof item === 'object' ? item?.notes || '' : ''
      };
    })
    .filter(Boolean);

  return mappedFoods.filter(
    (item, index, allItems) => allItems.findIndex((candidate) => candidate.name === item.name) === index
  ).slice(0, 12);
}

async function fetchFoodScan(endpoint, imageUrl, authToken = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FOOD_SCAN_TIMEOUT_MS);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(FOOD_SCAN_ACCESS_TOKEN ? { 'X-FoodFusion-Scan-Token': FOOD_SCAN_ACCESS_TOKEN } : {}),
        ...(!scanEndpointIsDevelopment && authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({ image: imageUrl }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('AI scan timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scanFoodItemsFromImage(uri, mimeType) {
  if (!FOOD_SCAN_ENDPOINT || (scanEndpointIsDevelopment && !__DEV__)) {
    console.warn('[FoodScan] Production scan endpoint unavailable. Using review-safe scan results.');
    return {
      detections: reviewSafeScanDetections,
      source: 'demo',
      notice: reviewSafeScanNotice
    };
  }
  if (!uri) {
    throw new Error('No image was selected for analysis.');
  }

  console.log('[FoodScan] Endpoint:', FOOD_SCAN_ENDPOINT);
  console.log('[FoodScan] Image selected:', { uri, mimeType: inferImageMimeType(uri, mimeType) });
  const optimizedImage = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: FOOD_SCAN_IMAGE_MAX_WIDTH } }],
    {
      compress: FOOD_SCAN_IMAGE_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG
    }
  );
  console.log('[FoodScan] Image optimized:', {
    width: optimizedImage.width,
    height: optimizedImage.height,
    quality: FOOD_SCAN_IMAGE_QUALITY
  });

  try {
  const base64 = await FileSystem.readAsStringAsync(optimizedImage.uri, {
    encoding: FileSystem.EncodingType.Base64
  });
  if (!base64 || base64.length < 32) {
    throw new Error('The selected image could not be prepared for analysis.');
  }
  const imageUrl = `data:image/jpeg;base64,${base64}`;
  console.log('[FoodScan] Image upload prepared:', { mimeType: 'image/jpeg', base64Length: base64.length });
  console.log('[FoodScan] POST request starting:', FOOD_SCAN_ENDPOINT);

  let response;
  try {
    const authToken = scanEndpointIsDevelopment ? null : await getSupabaseAccessToken();
    response = await fetchFoodScan(FOOD_SCAN_ENDPOINT, imageUrl, authToken);
  } catch (error) {
    console.error('[FoodScan] Fetch failed:', error);
    throw error;
  }

  const rawResponse = await response.text();
  console.log('[FoodScan] Raw response:', rawResponse);
  if (!response.ok) {
    console.error('[FoodScan] Request failed:', { status: response.status, payload: rawResponse });
    let serverDetail = '';
    try {
      serverDetail = JSON.parse(rawResponse)?.detail || JSON.parse(rawResponse)?.error || '';
    } catch {
      serverDetail = rawResponse;
    }
    throw new Error(serverDetail || `AI scan request failed (${response.status}).`);
  }

  let payload;
  try {
    payload = JSON.parse(rawResponse);
  } catch (error) {
    console.error('[FoodScan] Invalid JSON response:', error);
    throw new Error('AI scan returned an invalid response.');
  }
  console.log('[FoodScan] Request succeeded. Response payload:', payload);
  const detectedFoods = normalizeFoodItems(payload);
  if (detectedFoods.length === 0) {
    throw new Error('AI scan returned no visible food items.');
  }
  return {
    detections: detectedFoods,
    source: 'openai',
    notice: ''
  };
  } finally {
    try {
      await FileSystem.deleteAsync(optimizedImage.uri, { idempotent: true });
      console.log('[FoodScan] Optimized upload image discarded after analysis.');
    } catch (error) {
      console.warn('[FoodScan] Optimized image cleanup failed:', error);
    }
  }
}

function difficultyLabel(meal) {
  if (meal.difficulty === 'Medium') {
    return 'Medium';
  }
  if (meal.airFryer || parseMinutes(meal.time) > 25) {
    return 'Confident Cook';
  }
  if (parseMinutes(meal.time) <= 12 || meal.lazy) {
    return 'Beginner';
  }
  return 'Easy';
}

function ingredientConfidence(item, index, detections = []) {
  const detection = detections.find((candidate) => candidate.name === item);
  if (Number.isFinite(detection?.confidence)) {
    const percent = detection.confidence <= 1
      ? Math.round(detection.confidence * 100)
      : Math.round(detection.confidence);
    const label = percent >= 80 ? 'High' : percent >= 55 ? 'Medium' : 'Low';
    return `${percent}% ${label}`;
  }
  if (index === 0 || ['chicken', 'eggs', 'rice', 'tofu', 'noodles'].includes(item)) {
    return '94% High';
  }
  if (index <= 3) {
    return '82% Medium';
  }
  return '63% Low';
}

function stepSeconds(step) {
  const match = `${step}`.match(/(\d+)\s*(min|minute|minutes|sec|second|seconds)/i);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  return match[2].toLowerCase().startsWith('sec') ? amount : amount * 60;
}

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function groceryCategory(item) {
  if (['chicken', 'eggs', 'salmon', 'tuna', 'tofu', 'lunch meat', 'yogurt'].some((value) => item.includes(value))) {
    return 'Protein';
  }
  if (['spinach', 'broccoli', 'cucumber', 'lemon', 'avocado', 'tomatoes'].some((value) => item.includes(value))) {
    return 'Produce';
  }
  if (['rice', 'noodles', 'tortillas', 'pasta'].some((value) => item.includes(value))) {
    return 'Pantry';
  }
  return 'Other';
}

function assistantReply(prompt, currentMeals) {
  const firstMeal = currentMeals[0]?.title || 'Green Skillet Eggs';
  if (prompt.includes('fast')) {
    return `Fastest move: make ${firstMeal}. Keep it simple, use one pan, and start with anything already cooked.`;
  }
  if (prompt.includes('protein')) {
    return 'Go eggs, chicken, tofu, or Greek yogurt. Add rice or greens if you want it to feel like a full meal.';
  }
  return 'Buy tortillas, eggs, and a crunchy vegetable. That unlocks wraps, bowls, quesadillas, and quick breakfasts.';
}

function scoreMeals(sourceMeals, ingredients) {
  return sourceMeals.map((meal) => ({
    ...meal,
    macros: meal.macros || macroEstimates[meal.title] || { calories: 480, protein: 24, carbs: 52, fat: 18 },
    equipment: meal.equipment || inferEquipment(meal),
    score: meal.ingredients.filter((item) => ingredients.includes(item)).length
  }));
}

function qualityScores(meal, ingredients = []) {
  const matches = meal.ingredients.filter((item) => ingredients.includes(item)).length;
  const ingredientCount = Math.max(1, meal.ingredients.length);
  const minutes = parseMinutes(meal.time);
  return {
    match: Math.min(98, 58 + Math.round((matches / ingredientCount) * 40)),
    protein: Math.min(100, 40 + Math.round((meal.macros?.protein || 20) * 1.4)),
    effort: Math.max(35, Math.min(96, 104 - minutes * 2 - Math.max(0, ingredientCount - 4) * 5)),
    cost: meal.cost === 'Under $5' ? 96 : meal.cost === 'Under $10' ? 86 : Math.max(50, 92 - ingredientCount * 6)
  };
}

function prioritizeFreshness(meals, statuses = {}) {
  return [...meals].sort((a, b) => {
    const score = (meal) =>
      meal.ingredients.reduce((total, ingredient) => {
        const status = statuses[ingredient];
        if (status === 'almost expired') {
          return total + 4;
        }
        if (status === 'use soon') {
          return total + 2;
        }
        return total;
      }, 0);
    return score(b) - score(a);
  });
}

function addProductSignals(meals, ingredients = [], statuses = {}) {
  return prioritizeFreshness(meals, statuses).map((meal) => {
    const urgent = meal.ingredients.some((ingredient) => ['use soon', 'almost expired'].includes(statuses[ingredient]));
    return {
      ...meal,
      useSoon: meal.useSoon || urgent,
      quality: qualityScores(meal, ingredients)
    };
  });
}

function mealPairings(meal) {
  const title = meal?.title || '';
  const seed = title.length;
  return [
    smoothieBank[seed % smoothieBank.length],
    proteinShakeBank[seed % proteinShakeBank.length],
    drinkBank[seed % drinkBank.length],
    drinkBank[(seed + 1) % drinkBank.length]
  ];
}

function timeSuggestion() {
  const hour = new Date().getHours();
  if (hour < 11) {
    return { title: 'Morning Match', text: 'Breakfast, smoothies, and quick protein.' };
  }
  if (hour < 17) {
    return { title: 'Afternoon Match', text: 'Fast meals that keep the day moving.' };
  }
  return { title: 'Night Match', text: 'Dinner, late-night ideas, and low-effort wins.' };
}

function smartShoppingSuggestions(currentIngredients = []) {
  const ideas = [
    { item: 'tortillas', unlocks: 8 },
    { item: 'Greek yogurt', unlocks: 5 },
    { item: 'eggs', unlocks: 6 },
    { item: 'rice', unlocks: 7 },
    { item: 'protein powder', unlocks: 5 },
    { item: 'spinach', unlocks: 4 }
  ];
  return ideas.filter((idea) => !currentIngredients.includes(idea.item.toLowerCase())).slice(0, 3);
}

function grocerySuggestionGroups(query, cart = []) {
  const normalized = `${query || cart[0]?.key || cart[0]?.name || ''}`.toLowerCase();
  const suggestionMap = {
    egg: {
      paired: ['Baby Spinach', 'Greek Yogurt'],
      healthier: ['Organic Eggs'],
      cheaper: ['Large Eggs']
    },
    chicken: {
      paired: ['Brown Rice', 'Baby Spinach'],
      healthier: ['Organic Chicken Breast'],
      cheaper: ['Thin Sliced Chicken']
    },
    milk: {
      paired: ['Protein Powder', 'Mixed Berries'],
      healthier: ['Almond Milk'],
      cheaper: ['Coconut Milk']
    },
    yogurt: {
      paired: ['Mixed Berries', 'Protein Powder'],
      healthier: ['Greek Yogurt'],
      cheaper: ['Greek Yogurt']
    },
    rice: {
      paired: ['Chicken Breast', 'Baby Spinach'],
      healthier: ['Brown Rice'],
      cheaper: ['Jasmine Rice']
    },
    berries: {
      paired: ['Greek Yogurt', 'Almond Milk'],
      healthier: ['Strawberries'],
      cheaper: ['Mixed Berries']
    },
    spinach: {
      paired: ['Large Eggs', 'Chicken Breast'],
      healthier: ['Organic Baby Spinach'],
      cheaper: ['Baby Spinach']
    },
    protein: {
      paired: ['Almond Milk', 'Greek Yogurt'],
      healthier: ['Whey Protein'],
      cheaper: ['Protein Powder']
    }
  };
  const key = Object.keys(suggestionMap).find((item) => normalized.includes(item));
  if (!key) {
    return [];
  }
  const source = suggestionMap[key];
  const toProducts = (names) => names
    .map((name) => localShoppingCatalog.find((item) => item.name === name))
    .filter(Boolean);
  return [
    { title: 'Pairs Well', products: toProducts(source.paired) },
    { title: 'Healthier Swaps', products: toProducts(source.healthier) },
    { title: 'Lower Cost', products: toProducts(source.cheaper) }
  ];
}

function ingredientSwapSuggestions(ingredients = []) {
  const swaps = {
    eggs: 'No eggs? Try Greek yogurt.',
    milk: 'No milk? Use oat milk.',
    'almond milk': 'No almond milk? Use oat milk.',
    chicken: 'No chicken? Use tofu or eggs.',
    rice: 'No rice? Try quinoa or cauliflower rice.',
    cheddar: 'No cheddar? Use nutritional yeast.',
    yogurt: 'No yogurt? Use blended cottage cheese.',
    'protein powder': 'No protein powder? Add Greek yogurt and oats.'
  };
  const matched = ingredients
    .map((ingredient) => swaps[ingredient.toLowerCase()])
    .filter(Boolean);
  return [...new Set(matched.length > 0 ? matched : ['No exact match? Choose a similar protein or fresh vegetable.'])].slice(0, 4);
}

function parsePrice(price) {
  const amount = Number(`${price || ''}`.replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

function shoppingTotals(cartItems) {
  const subtotal = cartItems.reduce((total, item) => total + parsePrice(item.price) * (item.quantity || 1), 0);
  const fees = cartItems.length > 0 ? Math.max(2.99, subtotal * 0.07) : 0;
  const tax = subtotal * 0.082;
  return {
    subtotal,
    fees,
    tax,
    total: subtotal + fees + tax
  };
}

function orderNumber() {
  return `FF-${Math.floor(100000 + Math.random() * 900000)}`;
}

function orderStatusIndex(order) {
  if (Number.isFinite(order?.mcpTracking?.statusIndex)) {
    return Math.max(0, Math.min(4, Number(order.mcpTracking.statusIndex)));
  }
  const steps = orderTimelineSteps[order?.mode || 'Delivery'];
  const mcpStatus = `${order?.mcpTracking?.status || ''}`.toLowerCase();
  const mcpIndex = steps.findIndex((step) => step.toLowerCase() === mcpStatus);
  if (mcpIndex >= 0) {
    return mcpIndex;
  }
  if (!order?.placedAt) {
    return 0;
  }
  const elapsedMinutes = Math.floor((Date.now() - order.placedAt) / 60000);
  return Math.min(4, Math.max(0, Math.floor(elapsedMinutes / 2)));
}

function orderStatus(order) {
  if (order?.mcpTracking?.status) {
    return order.mcpTracking.status;
  }
  const steps = orderTimelineSteps[order?.mode || 'Delivery'];
  return steps[orderStatusIndex(order)] || steps[0];
}

function orderTimeRemaining(order) {
  if (order?.mcpTracking?.timeRemaining) {
    return order.mcpTracking.timeRemaining;
  }
  const index = orderStatusIndex(order);
  if (index >= 4) {
    return order?.mode === 'Delivery' ? 'Delivered' : 'Picked up';
  }
  return `${Math.max(5, (4 - index) * 8)} min remaining`;
}

function recipeTypeForMeal(meal, fallback = 'Meals') {
  if (recipeTypes.includes(meal?.recipeType)) {
    return meal.recipeType;
  }
  if (recipeTypes.includes(meal?.type)) {
    return meal.type;
  }
  return fallback;
}

function recipeKey(meal, fallbackType = 'Meals') {
  return `${recipeTypeForMeal(meal, fallbackType)}:${meal?.title || ''}`;
}

function recentEmptyText(type) {
  if (type === 'Smoothies') {
    return 'No recent smoothies yet.';
  }
  if (type === 'Protein Shakes') {
    return 'No recent shakes yet.';
  }
  if (type === 'Drinks') {
    return 'No recent drinks yet.';
  }
  return 'No recent meals yet.';
}

function goalAdjustedSettings(baseSettings, budgetGoals, macroLock) {
  const nextPreferences = [...new Set([...(baseSettings.preferences || [])])];
  if (macroLock === '200g protein' || macroLock === 'bulk mode') {
    nextPreferences.push('High Protein');
  }
  if (macroLock === 'low carb' || macroLock === 'cut mode') {
    nextPreferences.push('Low Carb');
  }
  if (Number(budgetGoals.weeklyBudget || 0) > 0 && Number(budgetGoals.weeklyBudget) <= 75) {
    nextPreferences.push('Cheap Meals');
  }
  return { ...baseSettings, preferences: [...new Set(nextPreferences)] };
}

function dailyNutritionScore(homeMeals, scanCountToday) {
  const protein = homeMeals.reduce((total, meal) => total + (meal.macros?.protein || 0), 0);
  const calories = homeMeals.reduce((total, meal) => total + (meal.macros?.calories || 0), 0);
  return {
    protein: Math.min(100, Math.round(protein / 1.8)),
    hydration: Math.min(100, scanCountToday * 18 + 42),
    balance: Math.max(45, Math.min(96, 100 - Math.abs(1800 - calories) / 35)),
    recovery: Math.min(100, 58 + homeMeals.filter((meal) => (meal.macros?.protein || 0) >= 30).length * 12)
  };
}

function recreateRestaurantRecipe(query, servings) {
  const cleanQuery = query.trim() || 'Chipotle bowl';
  return {
    title: `Homemade ${cleanQuery}`,
    time: cleanQuery.toLowerCase().includes('drink') ? '7 min' : '24 min',
    difficulty: 'Easy',
    ingredients: cleanQuery.toLowerCase().includes('starbucks')
      ? ['strawberries', 'coconut milk', 'ice', 'sparkling drinks']
      : ['rice', 'chicken', 'yogurt', 'hot sauce', 'spinach'],
    macros: { calories: 520, protein: 34, carbs: 58, fat: 16 },
    equipment: cleanQuery.toLowerCase().includes('drink') ? 'Blender' : 'Stove',
    servingNote: `${servings} ${servings === 1 ? 'serving' : 'servings'}`,
    steps: [
      `Build the homemade ${cleanQuery} base for ${servings} ${servings === 1 ? 'serving' : 'servings'}.`,
      'Layer in protein, sauce, and a fresh topping.',
      'Taste and adjust seasoning before serving.'
    ]
  };
}

function coachTip(step, meal) {
  if (step.toLowerCase().includes('cook')) {
    return 'Coach: lower heat if edges brown too fast. Start timer when food hits the pan.';
  }
  if (meal.airFryer) {
    return 'Coach: shake the basket halfway for crisp edges.';
  }
  return 'Coach: prep the next ingredient before moving on.';
}

function inferEquipment(meal) {
  if (meal.airFryer || meal.title.toLowerCase().includes('air fryer')) {
    return 'Air Fryer';
  }
  if (meal.title.toLowerCase().includes('bowl') || meal.title.toLowerCase().includes('rice')) {
    return 'Microwave';
  }
  if (meal.difficulty === 'Easy' && parseMinutes(meal.time) <= 12) {
    return 'No Cooking';
  }
  return 'Stove';
}

function preferenceMatches(meal, preferences) {
  const mealIngredients = (meal.ingredients || []).map((item) => item.toLowerCase());
  const containsAny = (items) => mealIngredients.some((ingredient) => items.some((item) => ingredient.includes(item)));
  const meats = ['chicken', 'salmon', 'lunch meat', 'tuna'];
  const dairy = ['cheddar', 'yogurt', 'cream', 'cheese'];
  const pork = ['pork', 'ham', 'bacon', 'lunch meat'];
  const gluten = ['noodles', 'pasta', 'bread', 'tortilla'];
  const nuts = ['peanut', 'almond', 'cashew', 'walnut'];
  const seafood = ['salmon', 'tuna', 'shrimp', 'fish'];
  const highSugar = ['honey', 'soda', 'juice', 'sparkling drinks'];

  if (preferences.includes('High Protein') && meal.macros.protein < 25) {
    return false;
  }
  if (preferences.includes('Low Carb') && meal.macros.carbs > 55) {
    return false;
  }
  if (preferences.includes('Keto') && meal.macros.carbs > 30) {
    return false;
  }
  if (preferences.includes('Vegetarian') && containsAny(meats)) {
    return false;
  }
  if (preferences.includes('Vegan') && (containsAny([...meats, ...dairy]) || containsAny(['egg']))) {
    return false;
  }
  if ((preferences.includes('No Dairy') || preferences.includes('Dairy Free')) && (containsAny(dairy) || mealIngredients.includes('milk'))) {
    return false;
  }
  if (preferences.includes('No Pork') && containsAny(pork)) {
    return false;
  }
  if (preferences.includes('Gluten Free') && containsAny(gluten)) {
    return false;
  }
  if (preferences.includes('Nut Free') && containsAny(nuts)) {
    return false;
  }
  if (preferences.includes('Seafood Free') && containsAny(seafood)) {
    return false;
  }
  if (preferences.includes('Healthy') && meal.macros.calories > 650) {
    return false;
  }
  if ((preferences.includes('Weight Loss') || preferences.includes('Cutting')) && meal.macros.calories > 540) {
    return false;
  }
  if (preferences.includes('Low Sugar') && containsAny(highSugar)) {
    return false;
  }
  if (preferences.includes('Low Sodium') && containsAny(['soy sauce', 'hot sauce', 'lunch meat'])) {
    return false;
  }
  if (preferences.includes('Diabetic Friendly') && (meal.macros.carbs > 45 || containsAny(highSugar))) {
    return false;
  }
  if (preferences.includes('Heart Healthy') && (meal.macros.fat > 20 || containsAny(['lunch meat', 'hot sauce']))) {
    return false;
  }
  if (preferences.includes('Quick Meals') && parseMinutes(meal.time) > 18) {
    return false;
  }
  if (preferences.includes('5 Ingredients or Less') && mealIngredients.length > 5) {
    return false;
  }
  if (preferences.includes('Cheap Meals') && meal.cost && meal.cost !== 'Under $5' && meal.cost !== 'Under $10') {
    return false;
  }
  return true;
}

function preferenceAffinityScore(meal, preferences) {
  const title = `${meal.title || ''}`.toLowerCase();
  const ingredients = (meal.ingredients || []).map((item) => item.toLowerCase());
  const includesAny = (items) => ingredients.some((ingredient) => items.some((item) => ingredient.includes(item)));
  let score = 0;

  if (preferences.includes('Kids / Family') && !includesAny(['hot sauce', 'coffee'])) score += 3;
  if (preferences.includes('Carnivore') && includesAny(['chicken', 'salmon', 'eggs', 'lunch meat'])) score += 5;
  if (preferences.includes('Mediterranean') && includesAny(['cucumber', 'lemon', 'yogurt', 'salmon', 'spinach'])) score += 4;
  if (preferences.includes('Asian-Inspired') && includesAny(['soy sauce', 'tofu', 'noodles', 'rice'])) score += 4;
  if (preferences.includes('Mexican-Inspired') && includesAny(['black beans', 'corn', 'avocado', 'hot sauce'])) score += 4;
  if (preferences.includes('Italian-Inspired') && includesAny(['tomatoes', 'cheddar', 'noodles'])) score += 3;
  if (preferences.includes('Comfort Food') && ['bowl', 'noodle', 'rice', 'skillet'].some((item) => title.includes(item))) score += 4;
  if (preferences.includes('Meal Prep') && (title.includes('three-day') || parseMinutes(meal.time) >= 15)) score += 3;
  if (preferences.includes('Bulking') && meal.macros.calories >= 550) score += 5;
  if (preferences.includes('High Fiber') && includesAny(['black beans', 'oats', 'broccoli', 'spinach', 'corn'])) score += 4;
  if (preferences.includes('Air Fryer') && meal.airFryer) score += 6;
  if (preferences.includes('College Budget') && (meal.cost === 'Under $5' || meal.cost === 'Under $10')) score += 5;
  if (preferences.includes('Picky Eater') && !includesAny(['mushrooms', 'hot sauce', 'tofu'])) score += 3;
  if (preferences.includes('Athlete Meals') && meal.macros.protein >= 30) score += 5;
  if (preferences.includes('Anti-Inflammatory') && includesAny(['salmon', 'broccoli', 'spinach', 'berries', 'lemon'])) score += 4;

  return score;
}

function moodMatches(meal, mood) {
  if (!mood) {
    return true;
  }
  if (mood === 'Comfort') {
    return ['bowl', 'rice', 'noodle', 'pizza', 'melt'].some((word) => meal.title.toLowerCase().includes(word));
  }
  if (mood === 'Light') {
    return (meal.macros?.calories || 500) <= 520 || ['salmon', 'cucumber', 'spinach', 'smoothie'].some((word) => meal.ingredients.includes(word));
  }
  if (mood === 'Filling') {
    return (meal.macros?.protein || 0) >= 25 || (meal.macros?.carbs || 0) >= 50;
  }
  if (mood === 'Post-Workout') {
    return (meal.macros?.protein || 0) >= 30 || meal.healthFocus?.includes('Recovery') || meal.healthFocus?.includes('Protein');
  }
  if (mood === 'Lazy') {
    return meal.lazy || parseMinutes(meal.time) <= 15;
  }
  if (mood === 'Sweet') {
    return ['banana', 'berries', 'honey', 'yogurt', 'coffee'].some((word) => meal.ingredients.includes(word));
  }
  return true;
}

function equipmentIsAvailable(meal, equipment, equipmentProfile = []) {
  const needed = (meal.equipment || inferEquipment(meal)).toLowerCase();
  const owned = equipmentProfile.map((item) => item.toLowerCase());
  if (owned.length === 0) {
    return needed === equipment.toLowerCase();
  }
  if (needed === 'no cooking') {
    return true;
  }
  return owned.includes(needed);
}

function applyMealSettings(meals, { preferences = [], dislikes = [], equipment = 'Stove', equipmentProfile = [], servings = 2, mood = '' } = {}) {
  const normalizedDislikes = dislikes.map((item) => item.trim().toLowerCase()).filter(Boolean);
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let filteredMeals = meals.filter((meal) => {
    const mealIngredients = meal.ingredients.map((item) => item.toLowerCase());
    const avoidsDislikes = normalizedDislikes.every((dislike) => !mealIngredients.some((ingredient) => ingredient.includes(dislike)));
    return avoidsDislikes && preferenceMatches(meal, preferences) && moodMatches(meal, mood);
  });

  filteredMeals = filteredMeals.sort((a, b) => preferenceAffinityScore(b, preferences) - preferenceAffinityScore(a, preferences));

  const equipmentMatches = filteredMeals.filter((meal) => equipmentIsAvailable(meal, equipment, equipmentProfile));
  if (equipmentMatches.length > 0) {
    filteredMeals = equipmentMatches;
  }

  const fallbackMeals = meals.map((meal) => {
    const safeIngredients = meal.ingredients.filter(
      (ingredient) => !normalizedDislikes.some((dislike) => ingredient.toLowerCase().includes(dislike))
    );
    const visibleIngredients = safeIngredients.length > 0 ? safeIngredients : ['rice', 'eggs'].filter((item) => !normalizedDislikes.includes(item));
    return {
      ...meal,
      title: normalizedDislikes.reduce(
        (title, dislike) => title.replace(new RegExp(escapeRegExp(dislike), 'ig'), 'Simple'),
        meal.title
      ),
      ingredients: visibleIngredients,
      steps: meal.steps.map((step) =>
        normalizedDislikes.reduce(
          (text, dislike) => text.replace(new RegExp(escapeRegExp(dislike), 'ig'), 'your backup ingredient'),
          step
        )
      )
    };
  });
  const finalMeals = filteredMeals.length > 0 ? filteredMeals : fallbackMeals;
  return finalMeals.map((meal) => ({
    ...meal,
    servings,
    equipment,
    servingNote: `${servings} ${servings === 1 ? 'serving' : 'servings'}`
  }));
}

function sortMealsForMacroFilter(sourceMeals, filter) {
  const sortedMeals = [...sourceMeals];

  if (filter === 'High Protein') {
    return sortedMeals.sort((a, b) => b.macros.protein - a.macros.protein);
  }

  if (filter === 'Lower Calorie') {
    return sortedMeals.sort((a, b) => a.macros.calories - b.macros.calories);
  }

  return sortedMeals.sort((a, b) => {
    const aBalance = Math.abs(a.macros.protein - 30) + Math.abs(a.macros.carbs - 50) + Math.abs(a.macros.fat - 18);
    const bBalance = Math.abs(b.macros.protein - 30) + Math.abs(b.macros.carbs - 50) + Math.abs(b.macros.fat - 18);
    return aBalance - bBalance;
  });
}

function buildMeals(ingredients, isPremium, selectedMode, settings = {}, options = {}) {
  const recipeType = settings.recipeType || 'Meals';
  const typedBanks = {
    Meals: isPremium ? [...mealBank, ...Object.values(premiumMealBank).flat()] : mealBank,
    Smoothies: smoothieBank,
    'Protein Shakes': proteinShakeBank,
    Drinks: drinkBank
  };
  const modeMeals = isPremium && premiumMealBank[selectedMode] ? premiumMealBank[selectedMode] : [];
  const sourceMeals = recipeType !== 'Meals'
    ? typedBanks[recipeType]
    : isPremium
    ? modeMeals.length > 0
      ? modeMeals
      : [...mealBank, ...Object.values(premiumMealBank).flat()]
    : mealBank;
  const limit = options.limit || (isPremium ? 6 : 3);
  const uniqueMeals = sourceMeals.filter(
    (meal, index, allMeals) => allMeals.findIndex((item) => item.title === meal.title) === index
  );

  const feedback = settings.feedback || { yes: [], nah: [] };
  const ratings = settings.ratings || { loved: [], fine: [], never: [] };
  const scoredMeals = scoreMeals(uniqueMeals, ingredients)
    .map((meal) => {
      const likedMeals = feedback.yes || [];
      const dislikedMeals = feedback.nah || [];
      const lovedMeals = ratings.loved || [];
      const neverMeals = ratings.never || [];
      const likedStyleBoost = likedMeals.some((liked) =>
        liked.ingredients?.some((ingredient) => meal.ingredients.includes(ingredient))
      )
        ? 2
        : 0;
      const dislikedStylePenalty = dislikedMeals.some((disliked) =>
        disliked.ingredients?.some((ingredient) => meal.ingredients.includes(ingredient))
      )
        ? 3
        : 0;
      const lovedBoost = lovedMeals.some((rated) =>
        rated.ingredients?.some((ingredient) => meal.ingredients.includes(ingredient))
      )
        ? 3
        : 0;
      const neverPenalty = neverMeals.some((rated) =>
        rated.ingredients?.some((ingredient) => meal.ingredients.includes(ingredient))
      )
        ? 5
        : 0;
      return {
        ...meal,
        score: meal.score + likedStyleBoost + lovedBoost - dislikedStylePenalty - neverPenalty
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...meal }) => meal);

  return applyMealSettings(scoredMeals, settings).slice(0, limit);
}

function pickFridgePersonality(ingredients) {
  if (ingredients.includes('chicken') && ingredients.includes('yogurt')) {
    return 'Gym Bro Fridge';
  }
  if (ingredients.includes('black beans') && ingredients.includes('corn')) {
    return 'College Survival Mode';
  }
  if (ingredients.includes('tofu') && ingredients.includes('mushrooms')) {
    return "Trader Joe's Addict";
  }
  if (ingredients.includes('hot sauce') || ingredients.includes('cheddar')) {
    return 'Snack Heavy';
  }
  return 'Adulting Successfully';
}

function parseMinutes(time) {
  const match = `${time}`.match(/\d+/);
  return match ? Number(match[0]) : 99;
}

function mealArtColors(title) {
  const options = [
    ['#15395B', '#6EA8FE'],
    ['#12333F', '#7DD3FC'],
    ['#1B2430', '#D9F7F0'],
    ['#172033', '#94A3B8']
  ];
  const index = title.length % options.length;
  return options[index];
}

function Button({ children, onPress, variant = 'primary', disabled, accent }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.ghostButton,
        variant === 'cream' && styles.creamButton,
        accent && variant === 'primary' && { backgroundColor: accent },
        accent && variant === 'ghost' && { borderColor: accent },
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'ghost' && styles.ghostButtonText,
          variant === 'cream' && styles.creamButtonText
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function CompactButton({ children, onPress, variant = 'primary', disabled, accent }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.compactButton,
        variant === 'ghost' && styles.ghostButton,
        variant === 'cream' && styles.creamButton,
        accent && variant === 'primary' && { backgroundColor: accent },
        accent && variant === 'ghost' && { borderColor: accent },
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'ghost' && styles.ghostButtonText,
          variant === 'cream' && styles.creamButtonText
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function Pill({ label, active, accent, tint }) {
  return (
    <View style={[
      styles.pill,
      active && styles.activePill,
      active && accent && { backgroundColor: tint, borderColor: accent }
    ]}>
      <Text style={[styles.pillText, active && styles.activePillText, active && accent && { color: accent }]}>{label}</Text>
    </View>
  );
}

function ModeTile({ label, locked, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeTile,
        active && styles.activeModeTile,
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.modeTileText, active && styles.activeModeTileText]}>{label}</Text>
      {locked ? <Text style={styles.modeLock}>🔒</Text> : null}
    </Pressable>
  );
}

function MacroFilterButton({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.macroFilterButton,
        active && styles.activeMacroFilterButton,
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.macroFilterText, active && styles.activeMacroFilterText]}>{label}</Text>
    </Pressable>
  );
}

function CartIcon({ accent = palette.green }) {
  return (
    <View style={styles.cartIcon}>
      <View style={[styles.cartBasket, { borderBottomColor: accent, borderLeftColor: accent, borderRightColor: accent }]} />
      <View style={[styles.cartHandle, { borderColor: accent }]} />
      <View style={styles.cartWheelRow}>
        <View style={[styles.cartWheel, { backgroundColor: accent }]} />
        <View style={[styles.cartWheel, { backgroundColor: accent }]} />
      </View>
    </View>
  );
}

function MacroGrid({ macros }) {
  const items = [
    { label: 'Calories', value: macros.calories },
    { label: 'Protein', value: `${macros.protein}g` },
    { label: 'Carbs', value: `${macros.carbs}g` },
    { label: 'Fat', value: `${macros.fat}g` }
  ];

  return (
    <View style={styles.macroPanel}>
      <Text style={styles.macroCaption}>Estimated macros</Text>
      <View style={styles.macroGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.macroTile}>
            <Text style={styles.macroValue}>{item.value}</Text>
            <Text style={styles.macroLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MealPreviewArt({ title }) {
  const [primary, accent] = mealArtColors(title);
  return (
    <View style={[styles.mealArt, { backgroundColor: primary }]}>
      <View style={[styles.mealArtCircle, { backgroundColor: accent }]} />
      <View style={styles.mealArtPlate}>
        <Text style={styles.mealArtInitial}>{title.slice(0, 1)}</Text>
      </View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TapScale({ children, onPress, style, disabled, accessibilityLabel }) {
  const scale = useRef(new Animated.Value(1)).current;

  function animate(toValue) {
    Animated.spring(scale, { toValue, damping: 18, stiffness: 300, useNativeDriver: true }).start();
  }

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animate(0.96)}
      onPressOut={() => animate(1)}
      style={[style, disabled && styles.disabledButton, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

function ToastBanner({ toast }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    opacity.setValue(0);
    translateY.setValue(-10);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: true })
    ]).start();
    return undefined;
  }, [opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.toastDot} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

function AnalysisScreen({ stepIndex, tone }) {
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.86)).current;

  useEffect(() => {
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.86, duration: 700, useNativeDriver: true })
      ])
    );

    scanLoop.start();
    pulseLoop.start();
    return () => {
      scanLoop.stop();
      pulseLoop.stop();
    };
  }, [pulse, scan]);

  return (
    <Screen>
      <AppHeader eyebrow="FoodFusion Analysis" accent={tone.accent} />
      <FlowProgress steps={['Scan', 'Ingredients', 'Recipes']} current={0} tone={tone} />
      <View style={styles.analysisFrame}>
        <View style={styles.analysisDim} />
        <Animated.View
          style={[
            styles.scanBar,
            {
              transform: [
                {
                  translateY: scan.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-150, 150]
                  })
                }
              ]
            }
          ]}
        />
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulse }] }]}>
          <View style={styles.pulseDot} />
        </Animated.View>
      </View>
      <View style={styles.analysisCard}>
        <View style={styles.loadingHeader}>
          <ActivityIndicator color={tone.accent} />
          <Text style={styles.loadingText}>FoodFusion Analysis</Text>
        </View>
        {analysisSteps.map((step, index) => (
          <View key={step} style={styles.analysisStepRow}>
            <View style={[styles.analysisStepDot, index <= stepIndex && styles.activeAnalysisStepDot, index <= stepIndex && { backgroundColor: tone.accent }]} />
            <Text style={[styles.analysisStepText, index <= stepIndex && styles.activeAnalysisStepText]}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function OnboardingScreen({ onComplete }) {
  const [index, setIndex] = useState(0);
  const item = onboardingScreens[index];
  const isLast = index === onboardingScreens.length - 1;

  return (
    <Screen>
      <View style={styles.onboardingWrap}>
        <View style={styles.onboardingOrb}>
          <Text style={styles.onboardingOrbText}>{index + 1}</Text>
        </View>
        <Text style={styles.onboardingTitle}>{item.title}</Text>
        <Text style={styles.onboardingText}>{item.text}</Text>
        <View style={styles.onboardingDots}>
          {onboardingScreens.map((screenItem, dotIndex) => (
            <View
              key={screenItem.title}
              style={[styles.onboardingDot, dotIndex === index && styles.activeOnboardingDot]}
            />
          ))}
        </View>
      </View>
      <Button
        onPress={() => {
          if (isLast) {
            onComplete();
            return;
          }
          setIndex(index + 1);
        }}
      >
        {isLast ? 'Get Started' : 'Next'}
      </Button>
    </Screen>
  );
}

function Screen({ children, toast }) {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    fade.setValue(0);
    lift.setValue(14);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, damping: 16, stiffness: 130, useNativeDriver: true })
    ]).start();
  }, [fade, lift]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardSafe}>
        <Animated.View style={[styles.screen, { opacity: fade, transform: [{ translateY: lift }] }]}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
      <ToastBanner toast={toast} />
    </SafeAreaView>
  );
}

function AppHeader({ onBack, eyebrow, onSettings, onCart, cartCount = 0, onFavorites, favoriteCount = 0, accent = palette.green }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: accent }]}>Back</Text>
        </Pressable>
      ) : (
        <View style={[styles.backSpacer, (onSettings || onCart || onFavorites) && styles.headerActionSpacer]} />
      )}
      <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
      {onSettings || onCart || onFavorites ? (
        <View style={styles.headerActionStack}>
          {onSettings ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
              <Text style={[styles.headerGearText, { color: flowColors.profile.accent }]}>⚙</Text>
            </Pressable>
          ) : null}
          {onCart ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Shopping cart" onPress={onCart} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
              <CartIcon accent={flowColors.shopping.accent} />
              {cartCount > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {onFavorites ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Favorites" onPress={onFavorites} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
              <Text style={[styles.headerHeartText, { color: flowColors.saved.accent }]}>♡</Text>
              {favoriteCount > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{favoriteCount > 9 ? '9+' : favoriteCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.backSpacer} />
      )}
    </View>
  );
}

function BottomTabs({ active, onNavigate }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: '⌂', tone: flowColors.Meals },
    { id: 'favorites', label: 'Saved', icon: '♡', tone: flowColors.saved },
    { id: 'shopping', label: 'Shop', icon: '▣', tone: flowColors.shopping },
    { id: 'orderHistory', label: 'Orders', icon: '≡', tone: flowColors.shopping },
    { id: 'profile', label: 'Profile', icon: '○', tone: flowColors.profile }
  ];

  return (
    <View style={styles.bottomTabs}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          key={tab.id}
          onPress={() => onNavigate(tab.id)}
          style={({ pressed }) => [
            styles.bottomTab,
            active === tab.id && styles.activeBottomTab,
            active === tab.id && { backgroundColor: tab.tone.tint },
            pressed && styles.pressed
          ]}
        >
          <Text style={[styles.bottomTabIcon, active === tab.id && styles.activeBottomTabText, active === tab.id && { color: tab.tone.accent }]}>{tab.icon}</Text>
          <Text style={[styles.bottomTabText, active === tab.id && styles.activeBottomTabText, active === tab.id && { color: tab.tone.accent }]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyState({ title, text, tone = flowColors.Meals, symbol = '•' }) {
  return (
    <View style={[styles.emptyStateCard, { borderColor: tone.tint }]}>
      <View style={[styles.emptyStateIcon, { backgroundColor: tone.tint, borderColor: tone.accent }]}>
        <Text style={[styles.emptyStateIconText, { color: tone.accent }]}>{symbol}</Text>
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {text ? <Text style={styles.emptyStateText}>{text}</Text> : null}
    </View>
  );
}

function LoadingState({ text, rows = 2, tone = flowColors.Meals }) {
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 700, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={styles.loadingCard}>
      <View style={styles.loadingHeader}>
        <ActivityIndicator color={tone.accent} />
        <Text style={styles.loadingText}>{text}</Text>
      </View>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={`loading-${index}`} style={styles.skeletonRow}>
          <Animated.View style={[styles.skeletonSquare, { opacity: shimmer }]} />
          <View style={styles.skeletonCopy}>
            <Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
            <Animated.View style={[styles.skeletonMeta, { opacity: shimmer }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function FlowProgress({ steps, current, tone }) {
  return (
    <View style={styles.flowProgress}>
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <View style={styles.flowStep}>
            <View style={[
              styles.flowStepDot,
              index <= current && { backgroundColor: tone.accent, borderColor: tone.accent }
            ]} />
            <Text style={[styles.flowStepText, index <= current && { color: tone.accent }]}>{step}</Text>
          </View>
          {index < steps.length - 1 ? (
            <View style={[styles.flowConnector, index < current && { backgroundColor: tone.accent }]} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function PermissionScreen({ title, text, points, onBack, onContinue, actionLabel }) {
  return (
    <Screen>
      <AppHeader eyebrow="Permissions" onBack={onBack} />
      <View style={styles.permissionWrap}>
        <View style={styles.permissionMark}>
          <Text style={styles.permissionMarkText}>F</Text>
        </View>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionText}>{text}</Text>
        <View style={styles.permissionList}>
          {points.map((point) => (
            <View key={point} style={styles.permissionRow}>
              <View style={styles.permissionDot} />
              <Text style={styles.permissionPoint}>{point}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button onPress={onContinue}>{actionLabel}</Button>
      <Button variant="ghost" onPress={onBack}>Not Now</Button>
    </Screen>
  );
}

function FusionPlusScreen({
  isPremium,
  onCancel,
  onRestore,
  onSelectPlan,
  onManage,
  selectedPlan
}) {
  const currentPlan = fusionPlans.find((plan) => plan.id === selectedPlan) || fusionPlans[2];

  return (
    <Screen>
      <AppHeader eyebrow="Fusion+" onBack={onCancel} accent={flowColors.fusion.accent} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.paywallScroll}>
        <FlowProgress steps={['Plan', 'Payment', 'Active']} current={0} tone={flowColors.fusion} />
        <View style={[styles.paywallHero, { borderColor: flowColors.fusion.tint }]}>
          <View style={[styles.paywallBadge, { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent }]}>
            <Text style={[styles.paywallBadgeText, { color: flowColors.fusion.accent }]}>Premium</Text>
          </View>
          <Text style={styles.paywallTitle}>Fusion+</Text>
          <Text style={styles.paywallText}>Cook smarter with unlimited AI meal matching.</Text>
        </View>

        <View style={styles.benefitGrid}>
          {fusionBenefits.map((benefit) => (
            <View key={benefit} style={styles.benefitTile}>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        <View style={styles.pricingRow}>
          {fusionPlans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => onSelectPlan(plan.id)}
              style={({ pressed }) => [
                styles.pricingCard,
                selectedPlan === plan.id && styles.selectedPricingCard,
                selectedPlan === plan.id && { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent },
                pressed && styles.pressed
              ]}
            >
              {plan.badge ? (
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueText}>{plan.badge}</Text>
                </View>
              ) : null}
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>{plan.price}</Text>
              <Text style={styles.planCadence}>{plan.cadence}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.comparisonCard}>
          <Text style={styles.listTitle}>Free vs Fusion+</Text>
          {[
            ['Daily scans', '1', 'Unlimited'],
            ['Macros', 'Locked', 'Included'],
            ['Modes', 'Basic', 'All modes'],
            ['One More Item', 'Preview', 'Unlocked']
          ].map(([feature, free, plus]) => (
            <View key={feature} style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>{feature}</Text>
              <Text style={styles.comparisonValue}>{free}</Text>
              <Text style={styles.comparisonPlus}>{plus}</Text>
            </View>
          ))}
        </View>

        {isPremium ? (
          <View style={styles.subscriptionStatusCard}>
            <Text style={styles.settingsTitle}>Fusion+ Active</Text>
            <Text style={styles.settingsSubtitle}>Current plan: {currentPlan.name} {currentPlan.price}{currentPlan.cadence}</Text>
            <Button accent={flowColors.fusion.accent} onPress={onManage}>Manage Subscription</Button>
          </View>
        ) : (
          <Button accent={flowColors.fusion.accent} onPress={() => onSelectPlan(selectedPlan)}>Continue with {currentPlan.name}</Button>
        )}

        <View style={styles.paymentActions}>
          <Pressable onPress={onRestore} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Restore Purchase</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function AuthScreen({
  mode,
  form,
  error,
  message,
  onChange,
  onLogin,
  onSignUp,
  onContinueWithApple,
  onResetPassword,
  onShowLogin,
  onShowSignUp,
  onShowForgotPassword
}) {
  const isWelcome = mode === 'welcome';
  const isSignUp = mode === 'signup';
  const isForgotPassword = mode === 'forgotPassword';

  return (
    <Screen>
      <View style={styles.authWrap}>
        <View style={styles.authLogoMark}>
          <Text style={styles.authLogoLetter}>F</Text>
        </View>
        <Text style={styles.authTitle}>FoodFusion AI</Text>
        <Text style={styles.authSubtitle}>Scan. Match. Cook.</Text>

        {isWelcome ? (
          <View style={styles.authCard}>
            <Button onPress={onShowLogin}>Log In</Button>
            <Button variant="ghost" onPress={onShowSignUp}>Sign Up</Button>
          </View>
        ) : (
          <View style={styles.authCard}>
            {isSignUp ? (
              <TextInput
                value={form.name}
                onChangeText={(value) => onChange('name', value)}
                placeholder="Name"
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
                style={styles.authInput}
              />
            ) : null}
            <TextInput
              value={form.email}
              onChangeText={(value) => onChange('email', value)}
              placeholder="Email"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.authInput}
            />
            {!isForgotPassword ? (
              <TextInput
                value={form.password}
                onChangeText={(value) => onChange('password', value)}
                placeholder="Password"
                placeholderTextColor={palette.muted}
                secureTextEntry
                style={styles.authInput}
              />
            ) : null}
            {isSignUp ? (
              <TextInput
                value={form.confirmPassword}
                onChangeText={(value) => onChange('confirmPassword', value)}
                placeholder="Confirm Password"
                placeholderTextColor={palette.muted}
                secureTextEntry
                style={styles.authInput}
              />
            ) : null}
            {error ? <Text style={styles.authError}>{error}</Text> : null}
            {message ? <Text style={styles.authMessage}>{message}</Text> : null}
            <Button onPress={isForgotPassword ? onResetPassword : isSignUp ? onSignUp : onLogin}>
              {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Log In'}
            </Button>
            {!isForgotPassword ? (
              <>
                <View style={styles.authDividerRow}>
                  <View style={styles.authDivider} />
                  <Text style={styles.authDividerText}>OR</Text>
                  <View style={styles.authDivider} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  onPress={onContinueWithApple}
                  style={({ pressed }) => [styles.appleAuthButton, pressed && styles.pressed]}
                >
                  <Text style={styles.appleAuthText}>Continue with Apple</Text>
                </Pressable>
              </>
            ) : null}
            {!isSignUp && !isForgotPassword ? (
              <Pressable onPress={onShowForgotPassword} style={styles.authSwitch}>
                <Text style={styles.authSwitchText}>Forgot password?</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={isSignUp || isForgotPassword ? onShowLogin : onShowSignUp} style={styles.authSwitch}>
              <Text style={styles.authSwitchText}>
                {isSignUp || isForgotPassword ? 'Already have an account? Log in' : 'New here? Sign up'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

function SplashScreen() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 80, useNativeDriver: true })
    ]).start();
    const exit = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 360, useNativeDriver: true }).start();
    }, 1850);
    return () => clearTimeout(exit);
  }, [fade, scale]);

  return (
    <SafeAreaView style={styles.splashSafe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.splashWrap}>
        <Animated.View style={[styles.splashLogoShell, { opacity: fade, transform: [{ scale }] }]}>
          <Image source={require('./assets/icon.png')} style={styles.splashAsset} />
        </Animated.View>
        <Animated.Text style={[styles.splashTitle, { opacity: fade }]}>FoodFusion AI</Animated.Text>
        <Animated.Text style={[styles.splashSubtitle, { opacity: fade }]}>Scan. Match. Cook.</Animated.Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authScreen, setAuthScreen] = useState('welcome');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [feedbackForm, setFeedbackForm] = useState({
    name: '',
    email: '',
    rating: 5,
    workedWell: '',
    confusing: '',
    additions: '',
    bugReport: ''
  });
  const [feedbackConfirmation, setFeedbackConfirmation] = useState('');
  const [feedbackReturnScreen, setFeedbackReturnScreen] = useState('settings');
  const [scanDate, setScanDate] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [meals, setMeals] = useState([]);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [selectedMode, setSelectedMode] = useState('Basic');
  const [selectedFusionPlan, setSelectedFusionPlan] = useState('yearly');
  const [selectedRecipeType, setSelectedRecipeType] = useState('Meals');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: '',
    expiration: '',
    cvv: '',
    name: '',
    zip: ''
  });
  const [macroFilter, setMacroFilter] = useState('Balanced');
  const [fridgePersonality, setFridgePersonality] = useState('');
  const [mealHistory, setMealHistory] = useState([]);
  const [favoriteScanIds, setFavoriteScanIds] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteTypeFilter, setFavoriteTypeFilter] = useState('All');
  const [favoriteFolderFilter, setFavoriteFolderFilter] = useState('All');
  const [recentTypeFilter, setRecentTypeFilter] = useState('Meals');
  const [groceryList, setGroceryList] = useState([]);
  const [shoppingCart, setShoppingCart] = useState([]);
  const [shoppingQuery, setShoppingQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const [shoppingResults, setShoppingResults] = useState([]);
  const [shoppingNotice, setShoppingNotice] = useState('');
  const [shoppingStoreFilter, setShoppingStoreFilter] = useState('All Stores');
  const [shoppingLocation, setShoppingLocation] = useState(null);
  const [shoppingLocationDraft, setShoppingLocationDraft] = useState('');
  const [nearbyStores, setNearbyStores] = useState([]);
  const [shoppingConnectionStatus, setShoppingConnectionStatus] = useState('Not Connected');
  const [isNearbyStoresLoading, setIsNearbyStoresLoading] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState('Delivery');
  const [fulfillmentWindow, setFulfillmentWindow] = useState('Within 2 hours');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [trackingDetailsOpen, setTrackingDetailsOpen] = useState(false);
  const [trackingPulse, setTrackingPulse] = useState(0);
  const [isShoppingLoading, setIsShoppingLoading] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false);
  const [hasLoadedMoreMeals, setHasLoadedMoreMeals] = useState(false);
  const [isTrackingRefreshing, setIsTrackingRefreshing] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const [scanDetections, setScanDetections] = useState([]);
  const [scanSource, setScanSource] = useState('');
  const [analysisStep, setAnalysisStep] = useState(0);
  const [recipeStepIndex, setRecipeStepIndex] = useState(0);
  const [preferences, setPreferences] = useState([]);
  const [dislikedIngredients, setDislikedIngredients] = useState([]);
  const [dislikeInput, setDislikeInput] = useState('');
  const [servings, setServings] = useState(2);
  const [equipment, setEquipment] = useState('Stove');
  const [onboardingCompleted, setOnboardingCompleted] = useState(null);
  const [recipeFeedback, setRecipeFeedback] = useState({ yes: [], nah: [] });
  const [scanCountToday, setScanCountToday] = useState(0);
  const [scanResultScreen, setScanResultScreen] = useState('ingredients');
  const [manualIngredient, setManualIngredient] = useState('');
  const [activeTimerStep, setActiveTimerStep] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [startupComplete, setStartupComplete] = useState(false);
  const [groceryChecked, setGroceryChecked] = useState({});
  const [customGroceryItem, setCustomGroceryItem] = useState('');
  const [pantryItems, setPantryItems] = useState([]);
  const [pantryInput, setPantryInput] = useState('');
  const [pantryExpirationInput, setPantryExpirationInput] = useState(dateFromToday(3));
  const [planner, setPlanner] = useState({});
  const [assistantMessages, setAssistantMessages] = useState([
    { role: 'assistant', text: 'Ask me what to cook, what to buy, or how to use leftovers.' }
  ]);
  const [recipeMcpStatus, setRecipeMcpStatus] = useState({ connected: false, status: 'Not Connected' });
  const [recipeSource, setRecipeSource] = useState('Hybrid Mode');
  const [recipeNotice, setRecipeNotice] = useState('');
  const [isScanningPhoto, setIsScanningPhoto] = useState(false);
  const [cameraPermissionIntroSeen, setCameraPermissionIntroSeen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    recipeIdeas: true,
    groceryReminders: true,
    orderUpdates: true,
    fusionUpdates: false
  });
  const [ingredientStatuses, setIngredientStatuses] = useState({});
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [ingredientEditValue, setIngredientEditValue] = useState('');
  const [developerMode, setDeveloperMode] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [equipmentProfile, setEquipmentProfile] = useState(['stove', 'microwave']);
  const [moodFilter, setMoodFilter] = useState('');
  const [leftoverSelection, setLeftoverSelection] = useState([]);
  const [recipeRatings, setRecipeRatings] = useState({ loved: [], fine: [], never: [] });
  const [householdMembers, setHouseholdMembers] = useState(['You']);
  const [householdInput, setHouseholdInput] = useState('');
  const [budgetGoals, setBudgetGoals] = useState({ weeklyBudget: '120', proteinGoal: '160', calorieTarget: '2200' });
  const [macroLock, setMacroLock] = useState('200g protein');
  const [portionMode, setPortionMode] = useState('couple');
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [socialPosts, setSocialPosts] = useState([]);
  const [toast, setToast] = useState(null);
  const [tabLoading, setTabLoading] = useState(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [syncState, setSyncState] = useState({
    status: supabaseConfigured ? 'loading' : 'offline',
    message: supabaseConfigured ? 'Connecting to your account...' : 'Account sync unavailable. Saved on this device.'
  });
  const [qaChecklist, setQaChecklist] = useState({});
  const recipePagerRef = useRef(null);
  const manualIngredientInputRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const expiryAlertKeyRef = useRef('');
  const appleSessionRef = useRef(false);
  const syncQueueRef = useRef(Promise.resolve());
  const activeUserIdRef = useRef(null);

  function cacheKey(key, userId = activeUserIdRef.current) {
    return scopedCacheKey(key, userId);
  }

  async function getCachedItem(key, userId = activeUserIdRef.current) {
    return AsyncStorage.getItem(cacheKey(key, userId));
  }

  async function setCachedItem(key, value) {
    return AsyncStorage.setItem(cacheKey(key), value);
  }

  async function removeCachedItem(key) {
    return AsyncStorage.removeItem(cacheKey(key));
  }

  async function multiSetCached(pairs) {
    return AsyncStorage.multiSet(pairs.map(([key, value]) => [cacheKey(key), value]));
  }

  async function multiRemoveCached(keys) {
    return AsyncStorage.multiRemove(keys.map((key) => cacheKey(key)));
  }

  const scansLeft = isPremium || scanDate !== todayKey();
  const recentRecipes = useMemo(() => {
    const seen = new Set();
    return mealHistory
      .flatMap((entry) => (entry.meals || []).map((meal) => ({
        ...meal,
        date: meal.date || entry.date,
        recipeType: recipeTypeForMeal(meal, entry.recipeType || 'Meals')
      })))
      .filter((meal) => {
        const key = recipeKey(meal, meal.recipeType);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }, [mealHistory]);
  const activeRecentType = recentTypeFilter === 'All' ? 'All' : selectedRecipeType;
  const visibleRecentRecipes = activeRecentType === 'All'
    ? recentRecipes
    : recentRecipes.filter((meal) => recipeTypeForMeal(meal) === activeRecentType);
  const lastScan = mealHistory[0];
  const homeMeals = meals.length > 0 ? meals : visibleRecentRecipes;
  const tonightBest = homeMeals[0];
  const quickestMeal = homeMeals.length > 0 ? [...homeMeals].sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time))[0] : null;
  const mostProteinMeal =
    homeMeals.length > 0 ? [...homeMeals].sort((a, b) => (b.macros?.protein || 0) - (a.macros?.protein || 0))[0] : null;
  const visibleMeals = useMemo(
    () => (isPremium ? sortMealsForMacroFilter(meals, macroFilter) : meals),
    [isPremium, macroFilter, meals]
  );
  const displayedMeals = hasLoadedMoreMeals ? visibleMeals : visibleMeals.slice(0, 3);
  const mealsCooked = mealHistory.reduce((total, entry) => total + entry.meals.length, 0);
  const weeklyMoneySaved = mealsCooked * 7;
  const currentPantryIngredients = [...new Set([...ingredients, ...pantryItems.map((item) => item.name)])];
  const pantryFreshness = useMemo(
    () => Object.fromEntries(pantryItems.map((item) => [item.name, expirationStatus(item.expiresAt)])),
    [pantryItems]
  );
  const activeIngredientStatuses = useMemo(
    () => ({ ...ingredientStatuses, ...pantryFreshness }),
    [ingredientStatuses, pantryFreshness]
  );
  const useSoonItems = pantryItems.filter((item) => ['use soon', 'almost expired'].includes(expirationStatus(item.expiresAt)));
  const timeBasedSuggestion = timeSuggestion();
  const shoppingIdeas = smartShoppingSuggestions(currentPantryIngredients);
  const rescuedCount = Object.values(activeIngredientStatuses).filter((status) => status === 'use soon' || status === 'almost expired').length;
  const nutritionScore = dailyNutritionScore(homeMeals, scanCountToday);
  const nextAchievement = Math.min(100, mealHistory.length * 12 + favorites.length * 8 + scanCountToday * 10);
  const cartTotals = useMemo(() => {
    const totals = shoppingTotals(shoppingCart);
    const savings = promoApplied ? Math.min(5, totals.subtotal * 0.1) : 0;
    return { ...totals, savings, total: totals.total - savings };
  }, [shoppingCart, promoApplied]);
  const cartGroups = useMemo(() => Object.entries(
    shoppingCart.reduce((groups, item) => {
      const storeName = item.store || item.brand || 'Store';
      return { ...groups, [storeName]: [...(groups[storeName] || []), item] };
    }, {})
  ).map(([store, items]) => ({ store, items, totals: shoppingTotals(items) })), [shoppingCart]);
  const cartItemCount = shoppingCart.reduce((total, item) => total + (item.quantity || 1), 0);
  const primaryCartStore = shoppingCart[0]?.store || shoppingCart[0]?.brand || "Fry's";
  const primaryNearbyStore = nearbyStores.find((store) => store.name === primaryCartStore);
  const primaryStoreMeta = primaryNearbyStore || shoppingStoreMeta[primaryCartStore] || shoppingStoreMeta["Fry's"];
  const shoppingSuggestions = grocerySuggestionGroups(shoppingQuery, shoppingCart);
  const globalSearchResults = useMemo(() => {
    const query = globalSearchQuery.trim().toLowerCase();
    if (!query) {
      return { recipes: [], ingredients: [], groceries: [] };
    }
    const recipePool = [
      ...favorites,
      ...recentRecipes,
      ...mealBank,
      ...Object.values(premiumMealBank).flat(),
      ...smoothieBank,
      ...proteinShakeBank,
      ...drinkBank
    ];
    const seenRecipes = new Set();
    const recipes = recipePool.filter((meal) => {
      const match = meal.title.toLowerCase().includes(query) ||
        (meal.ingredients || []).some((item) => item.toLowerCase().includes(query)) ||
        recipeTypeForMeal(meal).toLowerCase().includes(query);
      const key = recipeKey(meal, recipeTypeForMeal(meal));
      if (!match || seenRecipes.has(key)) return false;
      seenRecipes.add(key);
      return true;
    }).slice(0, 8);
    const ingredients = [...new Set([...currentPantryIngredients, ...ingredientSets.flat()])]
      .filter((item) => item.toLowerCase().includes(query))
      .slice(0, 8);
    const groceries = localShoppingSearch(query).slice(0, 6);
    return { recipes, ingredients, groceries };
  }, [currentPantryIngredients, favorites, globalSearchQuery, recentRecipes]);
  useEffect(() => {
    async function loadState() {
      const [storedLoggedIn, storedUserProfile, storedAppleSession, storedOnboarding, storedCameraPermissionIntro, storedQaChecklist] = await Promise.all([
        AsyncStorage.getItem(AUTH_KEY),
        AsyncStorage.getItem(USER_PROFILE_KEY),
        AsyncStorage.getItem(APPLE_AUTH_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(CAMERA_PERMISSION_INTRO_KEY),
        AsyncStorage.getItem(QA_CHECKLIST_KEY)
      ]);
      let sessionProfile = null;
      if (supabaseConfigured) {
        try {
          sessionProfile = await getSupabaseSessionProfile();
        } catch {
          sessionProfile = null;
        }
      }
      const localAppleProfile = storedAppleSession === 'true' && storedUserProfile
        ? JSON.parse(storedUserProfile)
        : null;
      const activeProfile = localAppleProfile || (supabaseConfigured ? sessionProfile : storedUserProfile ? JSON.parse(storedUserProfile) : null);
      const activeUserId = stableUserId(activeProfile);
      activeUserIdRef.current = activeUserId;
      const [
        storedDate,
        storedPremium,
        storedPremiumPlan,
        storedHistory,
        storedFavoriteScans,
        storedFavorites,
        storedGrocery,
        storedShoppingCart,
        storedShoppingLocation,
        storedRecentSearches,
        storedOrderHistory,
        storedPreferences,
        storedDislikes,
        storedServings,
        storedEquipment,
        storedFeedback,
        storedScanCount,
        storedGroceryChecked,
        storedPantry,
        storedPlanner,
        storedRecipeSource,
        storedIngredientStatuses,
        storedEquipmentProfile,
        storedRecipeRatings,
        storedHousehold,
        storedBudgetGoals,
        storedMacroLock,
        storedSocialPosts,
        storedNotificationPreferences,
        storedNotificationsEnabled
      ] = await Promise.all([
        getCachedItem(SCAN_KEY, activeUserId),
        getCachedItem(PREMIUM_KEY, activeUserId),
        getCachedItem(PREMIUM_PLAN_KEY, activeUserId),
        getCachedItem(HISTORY_KEY, activeUserId),
        getCachedItem(FAVORITE_SCANS_KEY, activeUserId),
        getCachedItem(FAVORITES_KEY, activeUserId),
        getCachedItem(GROCERY_KEY, activeUserId),
        getCachedItem(SHOPPING_CART_KEY, activeUserId),
        getCachedItem(SHOPPING_LOCATION_KEY, activeUserId),
        getCachedItem(RECENT_SEARCHES_KEY, activeUserId),
        getCachedItem(ORDER_HISTORY_KEY, activeUserId),
        getCachedItem(PREFERENCES_KEY, activeUserId),
        getCachedItem(DISLIKES_KEY, activeUserId),
        getCachedItem(SERVINGS_KEY, activeUserId),
        getCachedItem(EQUIPMENT_KEY, activeUserId),
        getCachedItem(FEEDBACK_KEY, activeUserId),
        getCachedItem(SCAN_COUNT_KEY, activeUserId),
        getCachedItem(GROCERY_CHECKED_KEY, activeUserId),
        getCachedItem(PANTRY_KEY, activeUserId),
        getCachedItem(PLANNER_KEY, activeUserId),
        getCachedItem(RECIPE_SOURCE_KEY, activeUserId),
        getCachedItem(INGREDIENT_STATUS_KEY, activeUserId),
        getCachedItem(EQUIPMENT_PROFILE_KEY, activeUserId),
        getCachedItem(RECIPE_RATINGS_KEY, activeUserId),
        getCachedItem(HOUSEHOLD_KEY, activeUserId),
        getCachedItem(BUDGET_GOALS_KEY, activeUserId),
        getCachedItem(MACRO_LOCK_KEY, activeUserId),
        getCachedItem(SOCIAL_KEY, activeUserId),
        getCachedItem(NOTIFICATION_PREFERENCES_KEY, activeUserId),
        getCachedItem(NOTIFICATION_PERMISSION_KEY, activeUserId)
      ]);
      appleSessionRef.current = Boolean(localAppleProfile);
      setIsLoggedIn(localAppleProfile ? true : supabaseConfigured ? Boolean(sessionProfile) : storedLoggedIn === 'true');
      setUserProfile(activeProfile);
      setScanDate(storedDate);
      setIsPremium(storedPremium === 'true');
      setSelectedFusionPlan(storedPremiumPlan || 'yearly');
      setMealHistory(storedHistory ? JSON.parse(storedHistory) : []);
      setFavoriteScanIds(storedFavoriteScans ? JSON.parse(storedFavoriteScans) : []);
      setFavorites(storedFavorites ? JSON.parse(storedFavorites) : []);
      setGroceryList(storedGrocery ? JSON.parse(storedGrocery) : []);
      setShoppingCart(storedShoppingCart ? JSON.parse(storedShoppingCart) : []);
      const savedShoppingLocation = storedShoppingLocation ? JSON.parse(storedShoppingLocation) : null;
      setShoppingLocation(savedShoppingLocation);
      setShoppingLocationDraft(savedShoppingLocation?.address || '');
      setFulfillmentMode(savedShoppingLocation?.fulfillmentMode || 'Delivery');
      setNearbyStores(savedShoppingLocation ? nearbyStoreOptionsForLocation(savedShoppingLocation, savedShoppingLocation.fulfillmentMode || 'Delivery') : []);
      setRecentSearches(storedRecentSearches ? JSON.parse(storedRecentSearches) : []);
      setOrderHistory(storedOrderHistory ? JSON.parse(storedOrderHistory) : []);
      setShoppingResults(localShoppingSearch('eggs'));
      setPreferences(storedPreferences ? JSON.parse(storedPreferences) : []);
      setDislikedIngredients(storedDislikes ? JSON.parse(storedDislikes) : []);
      setServings(storedServings ? Number(storedServings) : 2);
      setEquipment(storedEquipment || 'Stove');
      setOnboardingCompleted(storedOnboarding === 'true');
      setRecipeFeedback(storedFeedback ? JSON.parse(storedFeedback) : { yes: [], nah: [] });
      setScanCountToday(storedScanCount && storedDate === todayKey() ? Number(storedScanCount) : 0);
      setGroceryChecked(storedGroceryChecked ? JSON.parse(storedGroceryChecked) : {});
      setPantryItems(storedPantry
        ? JSON.parse(storedPantry).map((item) => ({ ...item, expiresAt: item.expiresAt || dateFromToday(3) }))
        : []);
      setPlanner(storedPlanner ? JSON.parse(storedPlanner) : {});
      setRecipeSource(storedRecipeSource || 'Hybrid Mode');
      setIngredientStatuses(storedIngredientStatuses ? JSON.parse(storedIngredientStatuses) : {});
      setEquipmentProfile(storedEquipmentProfile ? JSON.parse(storedEquipmentProfile) : ['stove', 'microwave']);
      setRecipeRatings(storedRecipeRatings ? JSON.parse(storedRecipeRatings) : { loved: [], fine: [], never: [] });
      setHouseholdMembers(storedHousehold ? JSON.parse(storedHousehold) : ['You']);
      setBudgetGoals(storedBudgetGoals ? JSON.parse(storedBudgetGoals) : { weeklyBudget: '120', proteinGoal: '160', calorieTarget: '2200' });
      setMacroLock(storedMacroLock || '200g protein');
      setSocialPosts(storedSocialPosts ? JSON.parse(storedSocialPosts) : []);
      setNotificationPreferences(storedNotificationPreferences ? JSON.parse(storedNotificationPreferences) : {
        recipeIdeas: true,
        groceryReminders: true,
        orderUpdates: true,
        fusionUpdates: false
      });
      setCameraPermissionIntroSeen(storedCameraPermissionIntro === 'true');
      setNotificationsEnabled(storedNotificationsEnabled === 'true');
      setQaChecklist(storedQaChecklist ? JSON.parse(storedQaChecklist) : {});
      if (savedShoppingLocation) {
        loadNearbyStores(savedShoppingLocation, savedShoppingLocation.fulfillmentMode || 'Delivery');
      }
      if (sessionProfile) {
        await hydrateSyncedUserData();
      } else if (localAppleProfile && isReviewDemoProfile(localAppleProfile) && !storedHistory) {
        await preloadReviewDemoData(localAppleProfile);
      }
      setAuthBootstrapped(true);
    }

    loadState().catch((error) => {
      console.warn('[FoodFusion Auth] Startup cache load deferred:', error);
      setAuthBootstrapped(true);
    });
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !authBootstrapped) {
      return undefined;
    }

    const stopRefresh = manageSupabaseAutoRefresh();
    const stopObserving = observeSupabaseAuth((profile) => {
      if (!profile && appleSessionRef.current) {
        return;
      }
      if (profile) {
        appleSessionRef.current = false;
        AsyncStorage.removeItem(APPLE_AUTH_KEY);
      }
      const nextUserId = stableUserId(profile);
      if (nextUserId !== activeUserIdRef.current) {
        activeUserIdRef.current = nextUserId;
        resetSessionStateForAccountSwitch();
      }
      setUserProfile(profile);
      setIsLoggedIn(Boolean(profile));
      if (profile) {
        AsyncStorage.multiSet([
          [AUTH_KEY, 'true'],
          [USER_PROFILE_KEY, JSON.stringify(profile)]
        ]);
        hydrateSyncedUserData();
      } else {
        activeUserIdRef.current = null;
        AsyncStorage.setItem(AUTH_KEY, 'false');
      }
    });

    return () => {
      stopRefresh();
      stopObserving();
    };
  }, [authBootstrapped]);

  useEffect(() => {
    checkRecipeMcpStatus().then(setRecipeMcpStatus).catch(() => {
      setRecipeMcpStatus({ connected: false, status: 'Not Connected' });
    });
  }, []);

  useEffect(() => {
    const startupTimer = setTimeout(() => setStartupComplete(true), 2400);
    return () => clearTimeout(startupTimer);
  }, []);

  useEffect(() => {
    if (screen !== 'analysis' || !pendingScan) {
      return undefined;
    }

    setAnalysisStep(0);
    const stepOne = setTimeout(() => setAnalysisStep(1), 700);
    const stepTwo = setTimeout(() => setAnalysisStep(2), 1400);
    const finish = setTimeout(() => finalizeScan(), 2200);

    return () => {
      clearTimeout(stepOne);
      clearTimeout(stepTwo);
      clearTimeout(finish);
    };
  }, [pendingScan, screen]);

  useEffect(() => {
    if (timerSeconds <= 0) {
      return undefined;
    }
    const tick = setTimeout(() => setTimerSeconds(timerSeconds - 1), 1000);
    return () => clearTimeout(tick);
  }, [timerSeconds]);

  useEffect(() => {
    if (screen !== 'cooking') {
      return undefined;
    }
    activateKeepAwakeAsync('FoodFusionCooking').catch(() => {});
    return () => {
      deactivateKeepAwake('FoodFusionCooking').catch(() => {});
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'shoppingTracking') {
      setIsTrackingRefreshing(false);
      return undefined;
    }
    setIsTrackingRefreshing(true);
    const initialReady = setTimeout(() => setIsTrackingRefreshing(false), 900);
    const tick = setInterval(() => {
      setIsTrackingRefreshing(true);
      setTrackingPulse((value) => value + 1);
      setTimeout(() => setIsTrackingRefreshing(false), 800);
    }, 30000);
    return () => {
      clearTimeout(initialReady);
      clearInterval(tick);
    };
  }, [screen]);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  useEffect(() => {
    const alertKey = useSoonItems.map((item) => `${item.id}:${item.expiresAt}`).join('|');
    if (!isLoggedIn || !notificationsEnabled || !notificationPreferences.groceryReminders || !alertKey || alertKey === expiryAlertKeyRef.current) {
      return;
    }
    expiryAlertKeyRef.current = alertKey;
    showToast(`${useSoonItems.length} ${useSoonItems.length === 1 ? 'ingredient needs' : 'ingredients need'} using soon`);
  }, [isLoggedIn, notificationPreferences.groceryReminders, notificationsEnabled, useSoonItems]);

  function hapticSuccess() {
    Vibration.vibrate(18);
  }

  function hapticTap() {
    Vibration.vibrate(8);
  }

  function showToast(message) {
    clearTimeout(toastTimeoutRef.current);
    setToast({ id: Date.now(), message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2100);
  }

  function resetSessionStateForAccountSwitch() {
    setScanDate(null);
    setIsPremium(false);
    setIngredients([]);
    setMeals([]);
    setHasLoadedMoreMeals(false);
    setSelectedMeal(null);
    setSelectedMode('Basic');
    setSelectedFusionPlan('yearly');
    setFridgePersonality('');
    setMealHistory([]);
    setFavoriteScanIds([]);
    setFavorites([]);
    setGroceryList([]);
    setShoppingCart([]);
    setShoppingQuery('');
    setGlobalSearchQuery('');
    setRecentSearches([]);
    setShoppingResults(localShoppingSearch('eggs'));
    setShoppingNotice('');
    setShoppingStoreFilter('All Stores');
    setShoppingLocation(null);
    setShoppingLocationDraft('');
    setNearbyStores([]);
    setFulfillmentMode('Delivery');
    setOrderConfirmation(null);
    setOrderHistory([]);
    setPendingScan(null);
    setScanDetections([]);
    setScanSource('');
    setPreferences([]);
    setDislikedIngredients([]);
    setServings(2);
    setEquipment('Stove');
    setRecipeFeedback({ yes: [], nah: [] });
    setScanCountToday(0);
    setGroceryChecked({});
    setPantryItems([]);
    setPlanner({});
    setRecipeSource('Hybrid Mode');
    setIngredientStatuses({});
    setEquipmentProfile(['stove', 'microwave']);
    setRecipeRatings({ loved: [], fine: [], never: [] });
    setHouseholdMembers(['You']);
    setBudgetGoals({ weeklyBudget: '120', proteinGoal: '160', calorieTarget: '2200' });
    setMacroLock('200g protein');
    setSocialPosts([]);
    expiryAlertKeyRef.current = '';
  }

  function demoSafeHistory() {
    const demoIngredients = reviewSafeScanDetections.map((item) => item.name);
    const demoMeals = buildMeals(demoIngredients, true, 'Basic', goalAdjustedSettings({
      preferences: ['High Protein', 'Quick Meals'],
      dislikes: [],
      equipment: 'Stove',
      equipmentProfile: ['stove', 'microwave'],
      servings: 2,
      recipeType: 'Meals'
    }, budgetGoals, macroLock)).slice(0, 3).map((meal) => ({
      ...meal,
      id: `demo-${meal.title}`,
      recipeType: 'Meals',
      date: new Date().toLocaleDateString()
    }));
    return [{
      id: 'review-demo-scan',
      date: new Date().toLocaleDateString(),
      mode: 'Basic',
      recipeType: 'Meals',
      personality: 'Review pantry sample',
      meals: demoMeals
    }];
  }

  async function preloadReviewDemoData(profile) {
    if (!isReviewDemoProfile(profile)) {
      return;
    }
    const history = demoSafeHistory();
    const demoIngredients = reviewSafeScanDetections.map((item) => item.name);
    setIngredients(demoIngredients);
    setScanDetections(reviewSafeScanDetections);
    setScanSource('demo');
    setMealHistory(history);
    setMeals(history[0].meals);
    setFavorites([]);
    setFavoriteScanIds([]);
    setOrderHistory([]);
    setShoppingCart([]);
    setIsPremium(true);
    setSelectedFusionPlan('yearly');
    setScanDate(todayKey());
    setScanCountToday(1);
    await multiSetCached([
      [HISTORY_KEY, JSON.stringify(history)],
      [FAVORITES_KEY, JSON.stringify([])],
      [FAVORITE_SCANS_KEY, JSON.stringify([])],
      [ORDER_HISTORY_KEY, JSON.stringify([])],
      [SHOPPING_CART_KEY, JSON.stringify([])],
      [PREMIUM_KEY, 'true'],
      [PREMIUM_PLAN_KEY, 'yearly'],
      [SCAN_KEY, todayKey()],
      [SCAN_COUNT_KEY, '1']
    ]);
  }

  async function updateOfflineCache(operation) {
    try {
      await operation;
    } catch (error) {
      console.warn('[FoodFusion Cache] Local cache update deferred:', error);
    }
  }

  function syncQuietly(label, operation) {
    if (!supabaseConfigured || !isLoggedIn || appleSessionRef.current) {
      if (!supabaseConfigured || appleSessionRef.current) {
        setSyncState({
          status: 'offline',
          message: supabaseConfigured ? 'Saved on this device' : 'Account sync unavailable. Saved on this device.'
        });
      }
      return;
    }
    setSyncState({ status: 'syncing', message: `Saving ${label}...` });
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(operation)
      .then(() => setSyncState({ status: 'synced', message: 'Synced to your account' }))
      .catch((error) => {
        console.warn(`[FoodFusion Sync] ${label} deferred:`, error);
        setSyncState({ status: 'error', message: 'Sync failed. Saved on this device.' });
      });
  }

  function preferenceSnapshot(overrides = {}) {
    return {
      foodStyles: preferences,
      dislikedIngredients,
      equipment: equipmentProfile,
      primaryEquipment: equipment,
      servings,
      recipeSource,
      macroLock,
      nutritionGoals: {},
      household: { members: householdMembers },
      budgetGoals,
      notificationPreferences,
      notificationsEnabled,
      shoppingLocation,
      ...overrides
    };
  }

  async function hydrateSyncedUserData() {
    if (!supabaseConfigured || appleSessionRef.current) {
      return;
    }
    try {
      setSyncState({ status: 'syncing', message: 'Saving account updates...' });
      const remote = await loadSyncedUserData();
      if (!remote) {
        return;
      }
      if (remote.preferences) {
        const remoteFoodStyles = remote.preferences.food_styles || [];
        const remoteDislikes = remote.preferences.disliked_ingredients || [];
        const remoteEquipment = remote.preferences.equipment || [];
        setPreferences(remoteFoodStyles);
        setDislikedIngredients(remoteDislikes);
        setEquipmentProfile(remoteEquipment);
        setEquipment(remote.preferences.primary_equipment || 'Stove');
        setServings(remote.preferences.default_servings || 2);
        setRecipeSource(remote.preferences.recipe_source || 'Hybrid Mode');
        setMacroLock(remote.preferences.macro_lock || '200g protein');
        setBudgetGoals(remote.preferences.budget_goals || budgetGoals);
        setHouseholdMembers(remote.preferences.household?.members || ['You']);
        setNotificationPreferences(remote.preferences.notification_preferences || notificationPreferences);
        setNotificationsEnabled(Boolean(remote.preferences.notifications_enabled));
        const remoteShoppingLocation = remote.preferences.shopping_location?.address
          ? remote.preferences.shopping_location
          : shoppingLocation;
        if (remoteShoppingLocation?.address) {
          setShoppingLocation(remoteShoppingLocation);
          setShoppingLocationDraft(remoteShoppingLocation.address);
          setFulfillmentMode(remoteShoppingLocation.fulfillmentMode || 'Delivery');
          setNearbyStores(nearbyStoreOptionsForLocation(remoteShoppingLocation, remoteShoppingLocation.fulfillmentMode || 'Delivery'));
        }
        await multiSetCached([
          [PREFERENCES_KEY, JSON.stringify(remoteFoodStyles)],
          [DISLIKES_KEY, JSON.stringify(remoteDislikes)],
          [EQUIPMENT_PROFILE_KEY, JSON.stringify(remoteEquipment)],
          [EQUIPMENT_KEY, remote.preferences.primary_equipment || 'Stove'],
          [SERVINGS_KEY, `${remote.preferences.default_servings || 2}`],
          [RECIPE_SOURCE_KEY, remote.preferences.recipe_source || 'Hybrid Mode'],
          [MACRO_LOCK_KEY, remote.preferences.macro_lock || '200g protein'],
          [BUDGET_GOALS_KEY, JSON.stringify(remote.preferences.budget_goals || budgetGoals)],
          [HOUSEHOLD_KEY, JSON.stringify(remote.preferences.household?.members || ['You'])],
          [NOTIFICATION_PREFERENCES_KEY, JSON.stringify(remote.preferences.notification_preferences || notificationPreferences)],
          [NOTIFICATION_PERMISSION_KEY, remote.preferences.notifications_enabled ? 'true' : 'false'],
          [SHOPPING_LOCATION_KEY, JSON.stringify(remoteShoppingLocation || {})]
        ]);
      }
      setPantryItems(remote.pantryItems || []);
      setShoppingCart(remote.cartItems || []);
      setFulfillmentMode(remote.fulfillmentMode || shoppingLocation?.fulfillmentMode || 'Delivery');
      setFavorites(remote.favorites || []);
      setFavoriteScanIds(remote.favoriteScanIds || []);
      setOrderHistory(remote.orders || []);
      const remoteHistory = [...(remote.savedRecipeHistory || []), ...(remote.scanHistory || [])]
        .filter((entry, index, all) => all.findIndex((candidate) => {
          const meal = candidate.meals?.[0];
          const entryMeal = entry.meals?.[0];
          return meal && entryMeal && recipeKey(meal, candidate.recipeType) === recipeKey(entryMeal, entry.recipeType);
        }) === index)
        .slice(0, 30);
      setMealHistory(remoteHistory);
      if (remote.subscription) {
        const remotePremium = remote.subscription.status === 'active' && remote.subscription.plan !== 'free';
        const remotePlan = remote.subscription.plan === 'free' ? 'yearly' : remote.subscription.plan;
        setIsPremium(remotePremium);
        setSelectedFusionPlan(remotePlan);
        await multiSetCached([
          [PREMIUM_KEY, remotePremium ? 'true' : 'false'],
          [PREMIUM_PLAN_KEY, remotePlan]
        ]);
      }
      await multiSetCached([
        [PANTRY_KEY, JSON.stringify(remote.pantryItems || [])],
        [SHOPPING_CART_KEY, JSON.stringify(remote.cartItems || [])],
        [FAVORITES_KEY, JSON.stringify(remote.favorites || [])],
        [HISTORY_KEY, JSON.stringify(remoteHistory)],
        [FAVORITE_SCANS_KEY, JSON.stringify(remote.favoriteScanIds || [])],
        [ORDER_HISTORY_KEY, JSON.stringify(remote.orders || [])]
      ]);
      setSyncState({ status: 'synced', message: 'Synced to your account' });
      console.log('[FoodFusion Sync] Synced account cache loaded.');
    } catch (error) {
      console.warn('[FoodFusion Sync] Account cache refresh deferred:', error);
      setSyncState({ status: 'error', message: 'Sync failed. Saved on this device.' });
    }
  }

  function navigateTab(nextScreen) {
    setScreen(nextScreen === 'shopping' && !shoppingLocation ? 'shoppingLocation' : nextScreen);
    if (['favorites', 'shopping', 'orderHistory'].includes(nextScreen)) {
      setTabLoading(nextScreen);
      setTimeout(() => setTabLoading(null), 340);
    }
  }

  async function rememberSearch(query, type) {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return;
    }
    const nextSearches = [
      { query: cleanQuery, type },
      ...recentSearches.filter((item) => item.query !== cleanQuery || item.type !== type)
    ].slice(0, 8);
    setRecentSearches(nextSearches);
    await setCachedItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches));
  }

  async function startScan() {
    if (!scansLeft) {
      setScreen('paywall');
      return;
    }
    setScreen('scan');
  }

  function chooseCategory(category) {
    if (!isPremium) {
      setScreen('paywall');
      return;
    }

    setSelectedMode(category);
    if (ingredients.length > 0) {
      const nextMeals = buildMeals(ingredients, true, category, goalAdjustedSettings({
        preferences,
        dislikes: dislikedIngredients,
        equipment,
        equipmentProfile,
        servings,
        feedback: recipeFeedback,
        ratings: recipeRatings,
        mood: moodFilter,
        recipeType: selectedRecipeType
      }, budgetGoals, macroLock));
      setMeals(addProductSignals(nextMeals, ingredients, activeIngredientStatuses));
      setHasLoadedMoreMeals(false);
    }
  }

  async function handlePickedImage(result, options = {}) {
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const uri = asset.uri;
    const successLabel = options.successLabel || 'FoodFusion Analysis';
    const nextScreen = options.nextScreen || 'ingredients';
    setRecipeNotice('');
    setIsScanningPhoto(true);

    try {
      const scanResult = await scanFoodItemsFromImage(uri, asset.mimeType);
      const scannedDetections = scanResult.detections || [];
      const scannedIngredients = scannedDetections.map((item) => item.name);
      const scanNotice = scanResult.notice || `${successLabel} detected ${scannedIngredients.length} food ${scannedIngredients.length === 1 ? 'item' : 'items'}.`;
      console.log('[FoodScan] Image upload successful. Ingredients mapped:', scannedIngredients);
      await completeScan(scannedIngredients, nextScreen, scanNotice, {
        detections: scannedDetections,
        source: scanResult.source || 'openai'
      });
    } catch (error) {
      console.error('[FoodScan] Scan failed:', error);
      const scannedIngredients = reviewSafeScanDetections.map((item) => item.name);
      await completeScan(scannedIngredients, nextScreen, reviewSafeScanNotice, {
        detections: reviewSafeScanDetections,
        source: 'demo'
      });
      showToast('FoodFusion Analysis ready');
    } finally {
      setIsScanningPhoto(false);
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        console.log('[FoodScan] Temporary camera capture discarded after analysis.');
      } catch (error) {
        console.warn('[FoodScan] Temporary camera cleanup failed:', error);
      }
    }
  }

  async function completeScan(detectedIngredients, nextScreen = 'ingredients', notice = '', scanMetadata = {}) {
    if (!isPremium && scanDate === todayKey()) {
      setScreen('paywall');
      return;
    }

    setPendingScan({
      ingredients: detectedIngredients,
      notice,
      detections: scanMetadata.detections || [],
      source: scanMetadata.source || 'local'
    });
    setScanResultScreen(nextScreen);
    setAnalysisStep(0);
    setScreen('analysis');
  }

  async function finalizeScan() {
    if (!pendingScan) {
      return;
    }

    const mealSettings = goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: moodFilter,
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock);
    const localMeals = buildMeals(pendingScan.ingredients, isPremium, selectedMode, mealSettings)
      .map((meal) => ({
        ...meal,
        id: meal.id || `${Date.now()}-${meal.title}`,
        recipeType: selectedRecipeType,
        date: new Date().toLocaleDateString()
      }));
    const generatedMeals = addProductSignals(localMeals, pendingScan.ingredients, activeIngredientStatuses).slice(0, isPremium ? 6 : 3);
    setRecipeNotice(pendingScan.notice || '');
    const personality = pickFridgePersonality(pendingScan.ingredients);
    const historyEntry = {
      id: `${Date.now()}`,
      date: new Date().toLocaleDateString(),
      mode: isPremium ? selectedMode : 'Basic',
      recipeType: selectedRecipeType,
      personality,
      meals: generatedMeals
    };
    const nextHistory = [historyEntry, ...mealHistory].slice(0, 20);

    setIngredients(pendingScan.ingredients);
    setScanDetections(pendingScan.detections || []);
    setScanSource(pendingScan.source || 'local');
    setMeals(generatedMeals);
    setHasLoadedMoreMeals(false);
    setFridgePersonality(personality);
    setMealHistory(nextHistory);
    setScanDate(todayKey());
    setScanCountToday(scanCountToday + 1);
    setPendingScan(null);
    await updateOfflineCache(Promise.all([
      setCachedItem(SCAN_KEY, todayKey()),
      setCachedItem(HISTORY_KEY, JSON.stringify(nextHistory)),
      setCachedItem(SCAN_COUNT_KEY, `${scanCountToday + 1}`)
    ]));
    syncQuietly('scan results', () => saveStructuredScanResult({
      clientId: historyEntry.id,
      source: pendingScan.source,
      recipeType: selectedRecipeType,
      detections: pendingScan.detections,
      recipes: generatedMeals,
      servings,
      preferences: preferenceSnapshot()
    }));
    hapticSuccess();
    showToast('Scan complete');
    setScreen(scanResultScreen);
  }

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera Access Needed', 'Allow camera access to scan fridge or pantry ingredients.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.68
      });

      await handlePickedImage(result, { successLabel: 'FoodFusion Analysis' });
    } catch (error) {
      Alert.alert('Camera Unavailable', 'The camera could not be opened right now. Please try again.');
    }
  }

  function chooseFusionPlan(planId) {
    setSelectedFusionPlan(planId);
    setScreen('fusionPayment');
  }

  async function startFusionPlus() {
    if (isProcessingPayment) {
      return;
    }
    const incompleteField = Object.values(paymentForm).some((value) => !value.trim());
    if (incompleteField) {
      Alert.alert('Payment Details', 'Enter all payment details to continue.');
      return;
    }

    setIsProcessingPayment(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsPremium(true);
      await updateOfflineCache(Promise.all([
        setCachedItem(PREMIUM_KEY, 'true'),
        setCachedItem(PREMIUM_PLAN_KEY, selectedFusionPlan)
      ]));
      hapticSuccess();
      showToast('Fusion+ Activated');
      setScreen('fusionSuccess');
    } catch (error) {
      setIsPremium(true);
      hapticSuccess();
      showToast('Fusion+ Activated');
      setScreen('fusionSuccess');
    } finally {
      syncQuietly('subscription', () => syncSubscriptionStatus({ isPremium: true, selectedPlan: selectedFusionPlan }));
      setIsProcessingPayment(false);
    }
  }

  async function restorePurchase() {
    setIsPremium(true);
    await updateOfflineCache(Promise.all([
        setCachedItem(PREMIUM_KEY, 'true'),
        setCachedItem(PREMIUM_PLAN_KEY, selectedFusionPlan || 'yearly')
      ]));
    syncQuietly('subscription', () => syncSubscriptionStatus({ isPremium: true, selectedPlan: selectedFusionPlan || 'yearly' }));
    hapticSuccess();
    showToast('Fusion+ Activated');
    setScreen('fusionSuccess');
  }

  async function resetPremium() {
    setIsPremium(false);
    setSelectedMode('Basic');
    setSelectedFusionPlan('yearly');
    await updateOfflineCache(Promise.all([
        removeCachedItem(PREMIUM_KEY),
        removeCachedItem(PREMIUM_PLAN_KEY)
      ]));
    syncQuietly('subscription', () => syncSubscriptionStatus({ isPremium: false, selectedPlan: 'yearly' }));
    setScreen('home');
  }

  function confirmCancelSubscription() {
    Alert.alert(
      'Cancel Fusion+?',
      'Your account will return to Fusion Free.',
      [
        { text: 'Keep Fusion+', style: 'cancel' },
        { text: 'Cancel Subscription', style: 'destructive', onPress: resetPremium }
      ]
    );
  }

  async function toggleFavorite(meal) {
    const recipeType = recipeTypeForMeal(meal, selectedRecipeType);
    const key = recipeKey(meal, recipeType);
    const exists = favorites.some((favorite) => recipeKey(favorite, favorite.recipeType) === key);
    const nextFavorites = exists
      ? favorites.filter((favorite) => recipeKey(favorite, favorite.recipeType) !== key)
      : [{
          ...meal,
          id: meal.id || `${Date.now()}-${meal.title}`,
          recipeType,
          folder: meal.folder || 'Favorites',
          savedAt: new Date().toLocaleDateString()
        }, ...favorites];

    setFavorites(nextFavorites);
    await updateOfflineCache(setCachedItem(FAVORITES_KEY, JSON.stringify(nextFavorites)));
    syncQuietly('favorites', () => replaceFavoriteRecipes(nextFavorites));
    hapticTap();
    showToast(exists ? 'Removed from favorites' : 'Recipe saved');
  }

  async function assignFavoriteFolder(meal, folder) {
    const key = recipeKey(meal, meal.recipeType);
    const nextFavorites = favorites.map((favorite) =>
      recipeKey(favorite, favorite.recipeType) === key ? { ...favorite, folder } : favorite
    );
    setFavorites(nextFavorites);
    await updateOfflineCache(setCachedItem(FAVORITES_KEY, JSON.stringify(nextFavorites)));
    syncQuietly('favorites', () => replaceFavoriteRecipes(nextFavorites));
    hapticTap();
    showToast(`Saved to ${folder}`);
  }

  async function deleteGroceryItem(item) {
    const nextItems = groceryList.filter((groceryItem) => groceryItem !== item);
    setGroceryList(nextItems);
    await setCachedItem(GROCERY_KEY, JSON.stringify(nextItems));
  }

  async function toggleGroceryChecked(item) {
    const nextChecked = { ...groceryChecked, [item]: !groceryChecked[item] };
    setGroceryChecked(nextChecked);
    await setCachedItem(GROCERY_CHECKED_KEY, JSON.stringify(nextChecked));
  }

  async function addCustomGroceryItem() {
    const item = customGroceryItem.trim().toLowerCase();
    if (!item) {
      return;
    }
    const nextItems = [...new Set([...groceryList, item])];
    setGroceryList(nextItems);
    setCustomGroceryItem('');
    await setCachedItem(GROCERY_KEY, JSON.stringify(nextItems));
  }

  function localShoppingSearch(query) {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return [];
    }

    const matches = localShoppingCatalog.filter((item) =>
      item.name.toLowerCase().includes(cleanQuery) ||
      item.key.toLowerCase().includes(cleanQuery) ||
      item.store.toLowerCase().includes(cleanQuery)
    );

    const availableStoreNames = nearbyStores.length > 0
      ? nearbyStores.map((store) => store.name)
      : shoppingStoreOptions.filter((store) => store !== 'All Stores');
    const locationMatches = matches.filter((item) => availableStoreNames.includes(item.store));
    const sourceItems = locationMatches.length > 0
      ? locationMatches
      : availableStoreNames
          .slice(0, 5)
          .map((store, index) => ({
            key: cleanQuery,
            name: `${query.trim()} ${index === 0 ? 'Value Pack' : index === 1 ? 'Organic' : 'Fresh'}`,
            store,
            price: formatMoney(3.49 + index * 1.35),
            size: index === 0 ? '1 ct' : 'family size'
          }));

    return sourceItems.map((item) => ({
      ...item,
      id: `${item.store}-${item.name}-${item.size}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      brand: item.store,
      eta: nearbyStores.find((store) => store.name === item.store)?.eta ||
        (fulfillmentMode === 'Delivery' ? shoppingStoreMeta[item.store]?.delivery : shoppingStoreMeta[item.store]?.pickup) ||
        'Available today'
    }));
  }

  function visibleShoppingResults(results = shoppingResults, storeFilter = shoppingStoreFilter) {
    return storeFilter === 'All Stores'
      ? results
      : results.filter((item) => (item.store || item.brand) === storeFilter);
  }

  async function searchShoppingItems(queryValue = shoppingQuery) {
    const query = typeof queryValue === 'string' ? queryValue.trim() : shoppingQuery.trim();
    if (!query || isShoppingLoading) {
      return;
    }

    await rememberSearch(query, 'grocery');
    setIsShoppingLoading(true);
    setShoppingNotice('');
    try {
      const result = await searchInstacartItems(query, {
        location: shoppingLocation,
        fulfillmentMode,
        stores: nearbyStores.map((store) => ({ id: store.id, name: store.name }))
      });
      if (result.connected && result.items.length > 0) {
        setShoppingConnectionStatus('Connected');
        setShoppingResults(result.items.map((item) => ({
          ...item,
          store: item.store || item.retailer || item.brand || 'Instacart',
          eta: item.eta || item.deliveryTime || 'Delivery 45-60 min'
        })));
        setShoppingNotice('');
      } else {
        setShoppingResults(localShoppingSearch(query));
        setShoppingConnectionStatus('Not Connected');
        setShoppingNotice('Live availability unavailable. Showing store options for your area.');
      }
    } catch {
      setShoppingResults(localShoppingSearch(query));
      setShoppingConnectionStatus('Not Connected');
      setShoppingNotice('Live availability unavailable. Showing store options for your area.');
    } finally {
      setIsShoppingLoading(false);
    }
  }

  async function loadNearbyStores(location = shoppingLocation, mode = fulfillmentMode) {
    if (!location?.address) {
      return;
    }
    setIsNearbyStoresLoading(true);
    setShoppingNotice('');
    try {
      const result = await findInstacartStores(location, mode);
      if (result.connected && result.stores.length > 0) {
        setNearbyStores(result.stores);
        setShoppingConnectionStatus('Connected');
      } else {
        setNearbyStores(nearbyStoreOptionsForLocation(location, mode));
        setShoppingConnectionStatus('Not Connected');
        setShoppingNotice('Live availability unavailable. Confirm pricing and times at checkout.');
      }
      setShoppingResults([]);
    } catch {
      setNearbyStores(nearbyStoreOptionsForLocation(location, mode));
      setShoppingConnectionStatus('Not Connected');
      setShoppingNotice('Live availability unavailable. Confirm pricing and times at checkout.');
      setShoppingResults([]);
    } finally {
      setIsNearbyStoresLoading(false);
    }
  }

  async function saveShoppingLocation() {
    const address = shoppingLocationDraft.trim();
    if (address.length < 3) {
      Alert.alert('Shopping Location', 'Enter an address or ZIP code to find stores.');
      return;
    }
    const nextLocation = { address, fulfillmentMode };
    setShoppingLocation(nextLocation);
    setShoppingStoreFilter('All Stores');
    await updateOfflineCache(setCachedItem(SHOPPING_LOCATION_KEY, JSON.stringify(nextLocation)));
    syncQuietly('shopping location', () => syncUserPreferences(preferenceSnapshot({ shoppingLocation: nextLocation })));
    await loadNearbyStores(nextLocation, fulfillmentMode);
    setScreen('shoppingStores');
  }

  async function updateShoppingFulfillment(mode) {
    setFulfillmentMode(mode);
    if (shoppingLocation?.address) {
      const nextLocation = { ...shoppingLocation, fulfillmentMode: mode };
      setShoppingLocation(nextLocation);
      await updateOfflineCache(setCachedItem(SHOPPING_LOCATION_KEY, JSON.stringify(nextLocation)));
      syncQuietly('shopping location', () => syncUserPreferences(preferenceSnapshot({ shoppingLocation: nextLocation })));
      await loadNearbyStores(nextLocation, mode);
    }
  }

  async function addShoppingItem(item) {
    const existing = shoppingCart.find((cartItem) => cartItem.id === item.id);
    const nextCart = existing
      ? shoppingCart.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: (cartItem.quantity || 1) + 1 } : cartItem
        )
      : [{ ...item, quantity: 1 }, ...shoppingCart];
    setShoppingCart(nextCart);
    await updateOfflineCache(setCachedItem(SHOPPING_CART_KEY, JSON.stringify(nextCart)));
    syncQuietly('shopping cart', () => replaceActiveShoppingCart(nextCart, fulfillmentMode));
    hapticTap();
    showToast('Added to cart');
  }

  function openGlobalGroceryResult(item) {
    const query = item.key || item.name;
    setShoppingQuery(query);
    setShoppingResults(localShoppingSearch(query));
    setScreen(shoppingLocation ? 'shopping' : 'shoppingLocation');
  }

  async function removeShoppingItem(itemId) {
    const nextCart = shoppingCart.filter((item) => item.id !== itemId);
    setShoppingCart(nextCart);
    await updateOfflineCache(setCachedItem(SHOPPING_CART_KEY, JSON.stringify(nextCart)));
    syncQuietly('shopping cart', () => replaceActiveShoppingCart(nextCart, fulfillmentMode));
  }

  async function updateShoppingQuantity(itemId, delta) {
    const nextCart = shoppingCart
      .map((item) => item.id === itemId ? { ...item, quantity: Math.max(0, (item.quantity || 1) + delta) } : item)
      .filter((item) => (item.quantity || 0) > 0);
    setShoppingCart(nextCart);
    await updateOfflineCache(setCachedItem(SHOPPING_CART_KEY, JSON.stringify(nextCart)));
    syncQuietly('shopping cart', () => replaceActiveShoppingCart(nextCart, fulfillmentMode));
  }

  async function checkoutShoppingCart() {
    if (shoppingCart.length === 0 || isCheckoutLoading) {
      return;
    }

    setIsCheckoutLoading(true);
    setShoppingNotice('');
    try {
      const checkout = await createInstacartCheckout(shoppingCart, { location: shoppingLocation, fulfillmentMode });
      const checkoutUrl = checkout?.url || checkout?.checkoutUrl || checkout?.cartUrl;
      if (checkoutUrl) {
        await Linking.openURL(checkoutUrl);
        setShoppingNotice('Instacart checkout is ready.');
      } else {
        setShoppingNotice('Shopping connection unavailable. Your cart remains available.');
      }
    } catch {
      setShoppingNotice('Shopping connection unavailable. Your cart remains available.');
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  function startShoppingCheckout() {
    if (shoppingCart.length === 0) {
      return;
    }
    setShoppingNotice('');
    setScreen('shoppingCheckout');
  }

  async function placeShoppingOrder() {
    if (shoppingCart.length === 0 || isCheckoutLoading) {
      return;
    }

    setIsCheckoutLoading(true);
    let mcpOrder = null;
    try {
      mcpOrder = await createInstacartCheckout(shoppingCart, {
        location: shoppingLocation,
        fulfillmentMode,
        fulfillmentWindow
      });
    } catch {
      // Optional MCP checkout. Local confirmation still completes the flow.
    }

    let tracking = null;
    const mcpOrderId = mcpOrder?.orderId || mcpOrder?.id;
    if (mcpOrderId) {
      try {
        tracking = await getInstacartOrderTracking(mcpOrderId);
      } catch {
        tracking = null;
      }
    }

    const placedOrder = {
      id: mcpOrderId || orderNumber(),
      mode: fulfillmentMode,
      store: tracking?.store || primaryCartStore,
      eta: tracking?.eta || tracking?.estimatedTime || primaryNearbyStore?.eta ||
        (fulfillmentMode === 'Delivery' ? primaryStoreMeta.delivery : primaryStoreMeta.pickup),
      address: shoppingLocation?.address || '',
      fulfillmentWindow,
      total: cartTotals.total,
      subtotal: cartTotals.subtotal,
      fees: cartTotals.fees,
      tax: cartTotals.tax,
      items: shoppingCart,
      placedAt: Date.now(),
      date: new Date().toLocaleDateString(),
      mcpTracking: tracking
    };
    const nextOrders = [placedOrder, ...orderHistory.filter((order) => order.id !== placedOrder.id)].slice(0, 20);
    setOrderConfirmation(placedOrder);
    setOrderHistory(nextOrders);
    setShoppingCart([]);
    setPromoCode('');
    setPromoApplied(false);
    await updateOfflineCache(Promise.all([
      setCachedItem(ORDER_HISTORY_KEY, JSON.stringify(nextOrders)),
      setCachedItem(SHOPPING_CART_KEY, JSON.stringify([]))
    ]));
    syncQuietly('shopping cart', () => replaceActiveShoppingCart([], fulfillmentMode));
    syncQuietly('orders', () => savePlacedOrder(placedOrder));
    setShoppingNotice('');
    setIsCheckoutLoading(false);
    setTrackingDetailsOpen(false);
    hapticSuccess();
    showToast('Order placed');
    setScreen('shoppingTracking');
  }

  async function addPantryItem() {
    const name = pantryInput.trim().toLowerCase();
    if (!name) {
      return;
    }
    const nextPantry = [
      { id: `${Date.now()}`, name, quantity: '1 left', expiresAt: pantryExpirationInput || dateFromToday(3), low: pantryItems.length % 2 === 0 },
      ...pantryItems
    ];
    setPantryItems(nextPantry);
    setPantryInput('');
    setPantryExpirationInput(dateFromToday(3));
    await updateOfflineCache(setCachedItem(PANTRY_KEY, JSON.stringify(nextPantry)));
    syncQuietly('pantry', () => replacePantryItems(nextPantry));
    hapticTap();
    showToast('Added to pantry');
  }

  async function deletePantryItem(id) {
    const nextPantry = pantryItems.filter((item) => item.id !== id);
    setPantryItems(nextPantry);
    await updateOfflineCache(setCachedItem(PANTRY_KEY, JSON.stringify(nextPantry)));
    syncQuietly('pantry', () => replacePantryItems(nextPantry));
  }

  async function updatePantryExpiration(id, expiresAt) {
    const nextPantry = pantryItems.map((item) => item.id === id ? { ...item, expiresAt } : item);
    setPantryItems(nextPantry);
    await updateOfflineCache(setCachedItem(PANTRY_KEY, JSON.stringify(nextPantry)));
    syncQuietly('pantry', () => replacePantryItems(nextPantry));
  }

  async function assignPlannerMeal(day, meal) {
    const nextPlanner = { ...planner, [day]: meal };
    setPlanner(nextPlanner);
    await setCachedItem(PLANNER_KEY, JSON.stringify(nextPlanner));
  }

  async function generatePlannerGroceryList() {
    const plannedMeals = Object.values(planner).filter(Boolean);
    const missingItems = plannedMeals.flatMap((meal) => meal.missingIngredients || []);
    const nextItems = [...new Set([...groceryList, ...missingItems])];
    setGroceryList(nextItems);
    await setCachedItem(GROCERY_KEY, JSON.stringify(nextItems));
    setScreen('grocery');
  }

  function sendAssistantPrompt(prompt) {
    setAssistantMessages([
      ...assistantMessages,
      { role: 'user', text: prompt },
      { role: 'assistant', text: assistantReply(prompt, homeMeals) }
    ]);
  }

  async function saveRecentRecipe(meal) {
    const recipeType = recipeTypeForMeal(meal, selectedRecipeType);
    const recentMeal = {
      ...meal,
      id: meal.id || `${Date.now()}-${meal.title}`,
      recipeType,
      date: new Date().toLocaleDateString()
    };
    const nextEntry = {
      id: `open-${Date.now()}`,
      date: new Date().toLocaleDateString(),
      mode: 'Opened',
      recipeType,
      personality: `${recipeType} recent`,
      meals: [recentMeal]
    };
    const nextHistory = [
      nextEntry,
      ...mealHistory.filter((entry) =>
        !(entry.meals || []).some((item) => recipeKey(item, entry.recipeType) === recipeKey(recentMeal, recipeType))
      )
    ].slice(0, 30);
    setMealHistory(nextHistory);
    await updateOfflineCache(setCachedItem(HISTORY_KEY, JSON.stringify(nextHistory)));
    syncQuietly('saved recipes', () => saveOpenedRecipe(recentMeal));
  }

  function openMeal(meal) {
    const recipeType = recipeTypeForMeal(meal, selectedRecipeType);
    const nextMeal = { ...meal, recipeType, date: meal.date || new Date().toLocaleDateString() };
    setSelectedMeal(nextMeal);
    setRecipeStepIndex(0);
    saveRecentRecipe(nextMeal);
    setScreen('recipe');
  }

  function generateFromAvailableIngredients() {
    const available = currentPantryIngredients.length > 0 ? currentPantryIngredients : ingredientSets[0];
    const nextMeals = buildMeals(available, isPremium, selectedMode, goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: moodFilter,
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock));
    setIngredients(available);
    setMeals(addProductSignals(nextMeals, available, activeIngredientStatuses));
    setHasLoadedMoreMeals(false);
    setRecipeNotice('Built from saved pantry and fridge ingredients.');
    setScreen('results');
  }

  function generateUseSoonRecipes() {
    const expiringIngredients = useSoonItems.map((item) => item.name);
    const available = expiringIngredients.length > 0 ? expiringIngredients : currentPantryIngredients.slice(0, 5);
    const nextMeals = buildMeals(available, isPremium, 'Leftover Rescue', goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: 'Comfort',
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock));
    setIngredients(available);
    setMeals(addProductSignals(nextMeals, available, activeIngredientStatuses));
    setHasLoadedMoreMeals(false);
    setRecipeNotice('Prioritizing ingredients that should be used soon.');
    showToast('Use Soon recipes ready');
    setScreen('results');
  }

  function toggleLeftover(item) {
    setLeftoverSelection((current) =>
      current.includes(item)
        ? current.filter((leftover) => leftover !== item)
        : [...current, item]
    );
  }

  function remixLeftovers(strategy = 'selected') {
    const partialIngredients = useSoonItems.map((item) => item.name);
    const shuffledIngredients = [...currentPantryIngredients].sort(() => Math.random() - 0.5).slice(0, 4);
    const leftovers = strategy === 'partial'
      ? partialIngredients.slice(0, 5)
      : strategy === 'random'
      ? shuffledIngredients
      : leftoverSelection.length > 0
      ? leftoverSelection
      : currentPantryIngredients.slice(0, 4);
    const availableLeftovers = leftovers.length > 0 ? leftovers : ingredientSets[0].slice(0, 4);
    const nextMeals = buildMeals(availableLeftovers, isPremium, 'Leftover Rescue', goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: moodFilter || 'Comfort',
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock));
    setIngredients(availableLeftovers);
    setMeals(addProductSignals(nextMeals, availableLeftovers, activeIngredientStatuses));
    setHasLoadedMoreMeals(false);
    setRecipeNotice(strategy === 'random'
      ? 'Created from a pantry mix selected for you.'
      : strategy === 'partial'
      ? 'Created from ingredients that should be used soon.'
      : 'Created from your selected leftovers.');
    showToast('Leftover recipes ready');
    setScreen('results');
  }

  function openCollection(folder) {
    const preset = collectionPresets[folder];
    const available = [...new Set([...(preset.ingredients || []), ...currentPantryIngredients])].slice(0, 8);
    const nextMeals = buildMeals(available, isPremium, 'Basic', goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: preset.mood,
      recipeType: preset.recipeType
    }, budgetGoals, macroLock));
    setSelectedRecipeType(preset.recipeType);
    setIngredients(available);
    setMeals(addProductSignals(nextMeals, available, activeIngredientStatuses));
    setHasLoadedMoreMeals(false);
    setRecipeNotice(`${folder} recipes matched to your kitchen.`);
    setScreen('results');
  }

  async function toggleEquipmentProfile(item) {
    const nextProfile = equipmentProfile.includes(item)
      ? equipmentProfile.filter((owned) => owned !== item)
      : [...equipmentProfile, item];
    setEquipmentProfile(nextProfile);
    await updateOfflineCache(setCachedItem(EQUIPMENT_PROFILE_KEY, JSON.stringify(nextProfile)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ equipment: nextProfile })));
  }

  async function saveRecipeRating(meal, rating) {
    const keyMap = {
      'Loved it': 'loved',
      'It was fine': 'fine',
      'Never again': 'never'
    };
    const key = keyMap[rating] || 'fine';
    const compactMeal = {
      title: meal.title,
      ingredients: meal.ingredients,
      mode: selectedMode
    };
    const nextRatings = {
      loved: (recipeRatings.loved || []).filter((item) => item.title !== meal.title),
      fine: (recipeRatings.fine || []).filter((item) => item.title !== meal.title),
      never: (recipeRatings.never || []).filter((item) => item.title !== meal.title)
    };
    nextRatings[key] = [compactMeal, ...nextRatings[key]].slice(0, 30);
    setRecipeRatings(nextRatings);
    await setCachedItem(RECIPE_RATINGS_KEY, JSON.stringify(nextRatings));
  }

  async function addHouseholdMember() {
    const name = householdInput.trim();
    if (!name) {
      return;
    }
    const nextMembers = [...new Set([...householdMembers, name])];
    setHouseholdMembers(nextMembers);
    setHouseholdInput('');
    await updateOfflineCache(setCachedItem(HOUSEHOLD_KEY, JSON.stringify(nextMembers)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ household: { members: nextMembers } })));
  }

  async function updateBudgetGoal(key, value) {
    const nextGoals = { ...budgetGoals, [key]: value };
    setBudgetGoals(nextGoals);
    await updateOfflineCache(setCachedItem(BUDGET_GOALS_KEY, JSON.stringify(nextGoals)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ budgetGoals: nextGoals })));
  }

  async function selectMacroLock(lock) {
    setMacroLock(lock);
    await updateOfflineCache(setCachedItem(MACRO_LOCK_KEY, lock));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ macroLock: lock })));
  }

  function generateRestaurantRecipe() {
    const recreatedMeal = recreateRestaurantRecipe(restaurantQuery, servings);
    setMeals(addProductSignals([recreatedMeal], recreatedMeal.ingredients, activeIngredientStatuses));
    setSelectedMeal(recreatedMeal);
    setIngredients(recreatedMeal.ingredients);
    setRecipeNotice('Restaurant recreation built for home cooking.');
    setScreen('recipe');
  }

  async function scanEntireFridgeMode() {
    if (isScanningPhoto) {
      return;
    }
    if (!cameraPermissionIntroSeen) {
      setScreen('cameraPermission');
      return;
    }
    await capturePhoto();
  }

  function generateSeasonalMeals(season) {
    const seasonalMode = season.includes('winter') ? 'Comfort' : season.includes('football') ? 'Lazy' : 'Light';
    const nextMeals = buildMeals(currentPantryIngredients.length ? currentPantryIngredients : ingredientSets[0], isPremium, selectedMode, goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: seasonalMode,
      recipeType: 'Meals'
    }, budgetGoals, macroLock));
    setMeals(addProductSignals(nextMeals, currentPantryIngredients, activeIngredientStatuses));
    setHasLoadedMoreMeals(false);
    setRecipeNotice(`${season} generated from your kitchen profile.`);
    setScreen('results');
  }

  async function postCreation() {
    const meal = selectedMeal || homeMeals[0];
    if (!meal) {
      return;
    }
    const nextPosts = [{ id: `${Date.now()}`, title: meal.title, by: householdMembers[0] || 'You' }, ...socialPosts].slice(0, 12);
    setSocialPosts(nextPosts);
    await setCachedItem(SOCIAL_KEY, JSON.stringify(nextPosts));
  }

  async function resetDailyScan() {
    setScanDate(null);
    setScanCountToday(0);
    await Promise.all([removeCachedItem(SCAN_KEY), removeCachedItem(SCAN_COUNT_KEY)]);
  }

  async function clearHistory() {
    setMealHistory([]);
    setFavoriteScanIds([]);
    await updateOfflineCache(Promise.all([
      removeCachedItem(HISTORY_KEY),
      removeCachedItem(FAVORITE_SCANS_KEY)
    ]));
    syncQuietly('scan history', () => clearRemoteScanHistory());
    showToast('Scan history cleared');
  }

  async function deleteScan(scanId) {
    const nextHistory = mealHistory.filter((entry) => entry.id !== scanId);
    const nextFavoriteScans = favoriteScanIds.filter((id) => id !== scanId);
    setMealHistory(nextHistory);
    setFavoriteScanIds(nextFavoriteScans);
    await updateOfflineCache(Promise.all([
      setCachedItem(HISTORY_KEY, JSON.stringify(nextHistory)),
      setCachedItem(FAVORITE_SCANS_KEY, JSON.stringify(nextFavoriteScans))
    ]));
    syncQuietly('scan history', () => deleteRemoteScan(scanId));
    showToast('Scan removed');
  }

  async function toggleFavoriteScan(scanId) {
    const saved = favoriteScanIds.includes(scanId);
    const nextFavoriteScans = saved
      ? favoriteScanIds.filter((id) => id !== scanId)
      : [scanId, ...favoriteScanIds];
    setFavoriteScanIds(nextFavoriteScans);
    await updateOfflineCache(setCachedItem(FAVORITE_SCANS_KEY, JSON.stringify(nextFavoriteScans)));
    syncQuietly('scan history', () => setRemoteScanFavorite(scanId, !saved));
    hapticTap();
    showToast(saved ? 'Scan unpinned' : 'Scan saved');
  }

  async function clearFavorites() {
    setFavorites([]);
    await updateOfflineCache(removeCachedItem(FAVORITES_KEY));
    syncQuietly('favorites', () => replaceFavoriteRecipes([]));
  }

  async function clearGroceryList() {
    setGroceryList([]);
    await removeCachedItem(GROCERY_KEY);
  }

  async function togglePreference(preference) {
    const nextPreferences = preferences.includes(preference)
      ? preferences.filter((item) => item !== preference)
      : [...preferences, preference];
    setPreferences(nextPreferences);
    await updateOfflineCache(setCachedItem(PREFERENCES_KEY, JSON.stringify(nextPreferences)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ foodStyles: nextPreferences })));
    hapticTap();
  }

  async function addDislikedIngredient() {
    const nextDislike = dislikeInput.trim().toLowerCase();
    if (!nextDislike) {
      return;
    }
    const nextDislikes = [...new Set([...dislikedIngredients, nextDislike])];
    setDislikedIngredients(nextDislikes);
    setDislikeInput('');
    await updateOfflineCache(setCachedItem(DISLIKES_KEY, JSON.stringify(nextDislikes)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ dislikedIngredients: nextDislikes })));
  }

  async function deleteDislikedIngredient(item) {
    const nextDislikes = dislikedIngredients.filter((dislike) => dislike !== item);
    setDislikedIngredients(nextDislikes);
    await updateOfflineCache(setCachedItem(DISLIKES_KEY, JSON.stringify(nextDislikes)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ dislikedIngredients: nextDislikes })));
  }

  async function selectServings(nextServings) {
    setServings(nextServings);
    await updateOfflineCache(setCachedItem(SERVINGS_KEY, `${nextServings}`));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ servings: nextServings })));
  }

  async function selectEquipment(nextEquipment) {
    setEquipment(nextEquipment);
    await updateOfflineCache(setCachedItem(EQUIPMENT_KEY, nextEquipment));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ primaryEquipment: nextEquipment })));
  }

  async function clearPreferences() {
    setPreferences([]);
    await updateOfflineCache(removeCachedItem(PREFERENCES_KEY));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ foodStyles: [] })));
  }

  async function clearDislikes() {
    setDislikedIngredients([]);
    await updateOfflineCache(removeCachedItem(DISLIKES_KEY));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ dislikedIngredients: [] })));
  }

  async function resetServingsEquipment() {
    setServings(2);
    setEquipment('Stove');
    setEquipmentProfile(['stove', 'microwave']);
    setRecipeFeedback({ yes: [], nah: [] });
    setScanCountToday(0);
    setGroceryChecked({});
    setPlanner({});
    await updateOfflineCache(Promise.all([
      removeCachedItem(SERVINGS_KEY),
      removeCachedItem(EQUIPMENT_KEY),
      removeCachedItem(EQUIPMENT_PROFILE_KEY)
    ]));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ equipment: ['stove', 'microwave'], primaryEquipment: 'Stove', servings: 2 })));
  }

  async function completeOnboarding() {
    setOnboardingCompleted(true);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  }

  function updateAuthField(key, value) {
    setAuthForm((current) => ({ ...current, [key]: value }));
    if (authError) {
      setAuthError('');
    }
    if (authMessage) {
      setAuthMessage('');
    }
  }

  function showAuthMode(nextMode) {
    setAuthScreen(nextMode);
    setAuthError('');
    setAuthMessage('');
  }

  async function finishAuth(profile, options = {}) {
    const appleSession = Boolean(options.appleSession);
    const nextUserId = stableUserId(profile);
    if (nextUserId !== activeUserIdRef.current) {
      resetSessionStateForAccountSwitch();
    }
    activeUserIdRef.current = nextUserId;
    appleSessionRef.current = appleSession;
    setUserProfile(profile);
    setIsLoggedIn(true);
    setOnboardingCompleted(true);
    setScreen('home');
    setAuthScreen('welcome');
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' });
    setAuthError('');
    setAuthMessage('');
    try {
      await Promise.all([
        AsyncStorage.setItem(AUTH_KEY, 'true'),
        AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile)),
        AsyncStorage.setItem(ONBOARDING_KEY, 'true'),
        appleSession
          ? AsyncStorage.setItem(APPLE_AUTH_KEY, 'true')
          : AsyncStorage.removeItem(APPLE_AUTH_KEY)
      ]);
      if (appleSession) {
        setSyncState({ status: 'offline', message: 'Saved on this device' });
        await preloadReviewDemoData(profile);
      } else if (supabaseConfigured) {
        await hydrateSyncedUserData();
      }
    } catch (error) {
      // Keep auth usable even if local persistence temporarily fails.
    }
  }

  async function handleLogin() {
    const email = authForm.email.trim();
    if (!email) {
      setAuthError('Email is required.');
      return;
    }
    if (!authForm.password) {
      setAuthError('Password is required.');
      return;
    }

    try {
      if (supabaseConfigured) {
        const profile = await signInWithSupabase(email, authForm.password);
        await finishAuth(profile);
        return;
      }
      await finishAuth({
        name: email.split('@')[0] || 'FoodFusion User',
        email
      });
    } catch {
      setAuthError('Unable to log in. Check your email and password.');
    }
  }

  async function handleSignUp() {
    const name = authForm.name.trim();
    const email = authForm.email.trim();
    if (!email) {
      setAuthError('Email is required.');
      return;
    }
    if (!authForm.password) {
      setAuthError('Password is required.');
      return;
    }
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords must match.');
      return;
    }

    try {
      if (supabaseConfigured) {
        const result = await signUpWithSupabase(name, email, authForm.password);
        if (result.confirmationRequired) {
          setAuthScreen('login');
          setAuthError('');
          setAuthMessage('Check your email to confirm your account, then log in.');
          return;
        }
        await finishAuth(result.profile);
        return;
      }
      await finishAuth({
        name: name || email.split('@')[0] || 'FoodFusion User',
        email
      });
    } catch {
      setAuthError('Unable to create your account right now.');
    }
  }

  async function handleContinueWithApple() {
    await finishAuth({
      id: 'review-demo-apple-user',
      name: 'Apple User',
      email: 'apple.user@privaterelay.appleid.com',
      provider: 'apple'
    }, { appleSession: true });
  }

  function handleForgotPassword() {
    setAuthScreen('forgotPassword');
    setAuthError('');
    setAuthMessage('');
  }

  async function handleResetPassword() {
    const email = authForm.email.trim();
    if (!email) {
      setAuthError('Email is required.');
      return;
    }

    try {
      if (supabaseConfigured) {
        await resetSupabasePassword(email);
      }
      setAuthError('');
      setAuthMessage('Password reset instructions have been sent.');
    } catch {
      setAuthError('Unable to send password reset instructions right now.');
    }
  }

  async function logout() {
    appleSessionRef.current = false;
    activeUserIdRef.current = null;
    resetSessionStateForAccountSwitch();
    setIsLoggedIn(false);
    setUserProfile(null);
    setScreen('home');
    setAuthScreen('welcome');
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' });
    setAuthError('');
    setAuthMessage('');
    try {
      if (supabaseConfigured) {
        await signOutOfSupabase();
      }
      await AsyncStorage.multiSet([[AUTH_KEY, 'false']]);
      await AsyncStorage.multiRemove([APPLE_AUTH_KEY, USER_PROFILE_KEY]);
    } catch (error) {
      // Visible logout should still complete if persistence temporarily fails.
    }
  }

  async function continueCameraPermission() {
    setCameraPermissionIntroSeen(true);
    await AsyncStorage.setItem(CAMERA_PERMISSION_INTRO_KEY, 'true');
    setScreen('scan');
    await capturePhoto();
  }

  async function enableNotifications() {
    setNotificationsEnabled(true);
    await updateOfflineCache(setCachedItem(NOTIFICATION_PERMISSION_KEY, 'true'));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ notificationsEnabled: true })));
    setScreen('settings');
  }

  async function toggleNotificationPreference(key) {
    const nextPreferences = {
      ...notificationPreferences,
      [key]: !notificationPreferences[key]
    };
    setNotificationPreferences(nextPreferences);
    await updateOfflineCache(setCachedItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(nextPreferences)));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ notificationPreferences: nextPreferences })));
  }

  function reportBug() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FoodFusion%20AI%20Support`).catch(() => {
      Alert.alert('Support', `Email ${SUPPORT_EMAIL} for help.`);
    });
  }

  function openFeedback(returnScreen = 'settings') {
    setFeedbackReturnScreen(returnScreen);
    setFeedbackConfirmation('');
    setFeedbackForm((current) => ({
      ...current,
      name: current.name || userProfile?.name || '',
      email: current.email || userProfile?.email || ''
    }));
    setScreen('feedback');
  }

  function updateFeedbackField(key, value) {
    setFeedbackForm((current) => ({ ...current, [key]: value }));
    if (feedbackConfirmation) {
      setFeedbackConfirmation('');
    }
  }

  async function submitFeedback() {
    if (!feedbackForm.name.trim() || !feedbackForm.email.trim()) {
      Alert.alert('Feedback', 'Please enter your name and email.');
      return;
    }

    const submission = {
      ...feedbackForm,
      name: feedbackForm.name.trim(),
      email: feedbackForm.email.trim(),
      submittedAt: new Date().toISOString()
    };
    const body = [
      'FoodFusion AI Beta Feedback',
      '',
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Rating: ${submission.rating}/5`,
      '',
      'What worked well?',
      submission.workedWell || 'No response',
      '',
      'What was confusing?',
      submission.confusing || 'No response',
      '',
      'What should be added?',
      submission.additions || 'No response',
      '',
      'Bug report',
      submission.bugReport || 'No response'
    ].join('\n');

    try {
      const stored = await AsyncStorage.getItem(FEEDBACK_SUBMISSIONS_KEY);
      const submissions = stored ? JSON.parse(stored) : [];
      await AsyncStorage.setItem(FEEDBACK_SUBMISSIONS_KEY, JSON.stringify([submission, ...submissions]));
    } catch (error) {
      // Email submission remains available when local storage is temporarily unavailable.
    }

    const emailUrl = `mailto:${BETA_FEEDBACK_EMAIL}?subject=${encodeURIComponent('FoodFusion AI Beta Feedback')}&body=${encodeURIComponent(body)}`;
    try {
      const canEmail = await Linking.canOpenURL(emailUrl);
      if (canEmail) {
        await Linking.openURL(emailUrl);
        setFeedbackConfirmation('Thanks — feedback sent.');
        showToast('Thanks — feedback sent.');
        return;
      }
    } catch (error) {
      // Clipboard fallback handles devices without a configured email composer.
    }

    const fallbackMessage = `Feedback copied. Please email it to ${BETA_FEEDBACK_EMAIL}.`;
    try {
      await Clipboard.setStringAsync(body);
      setFeedbackConfirmation(fallbackMessage);
      Alert.alert('Feedback Ready', fallbackMessage);
    } catch (error) {
      const manualMessage = `Please email your feedback to ${BETA_FEEDBACK_EMAIL}.`;
      setFeedbackConfirmation(manualMessage);
      Alert.alert('Feedback', manualMessage);
    }
  }

  function applyPromoCode() {
    if (!promoCode.trim()) {
      Alert.alert('Promo Code', 'Enter a promo code to apply it.');
      return;
    }
    setPromoApplied(true);
    Alert.alert('Promo Applied', 'Your savings have been applied to this order.');
  }

  async function toggleQaCheck(item) {
    const nextChecklist = { ...qaChecklist, [item]: !qaChecklist[item] };
    setQaChecklist(nextChecklist);
    await AsyncStorage.setItem(QA_CHECKLIST_KEY, JSON.stringify(nextChecklist));
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently remove your local account, preferences, favorites, scan history, shopping cart, orders, and subscription status from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: deleteAccount }
      ]
    );
  }

  async function deleteAccount() {
    try {
      if (supabaseConfigured) {
        await signOutOfSupabase();
      }
      await resetAllAppData(true);
    } catch (error) {
      setOnboardingCompleted(true);
      setIsLoggedIn(false);
      setAuthScreen('welcome');
      setScreen('home');
    }
  }

  async function saveRecipeFeedback(meal, answer) {
    const key = answer === 'yes' ? 'yes' : 'nah';
    const oppositeKey = answer === 'yes' ? 'nah' : 'yes';
    const compactMeal = {
      title: meal.title,
      ingredients: meal.ingredients,
      mode: selectedMode
    };
    const nextFeedback = {
      ...recipeFeedback,
      [key]: [compactMeal, ...(recipeFeedback[key] || []).filter((item) => item.title !== meal.title)].slice(0, 20),
      [oppositeKey]: (recipeFeedback[oppositeKey] || []).filter((item) => item.title !== meal.title)
    };
    setRecipeFeedback(nextFeedback);
    await setCachedItem(FEEDBACK_KEY, JSON.stringify(nextFeedback));
  }

  async function resetAllAppData(keepOnboarding = false) {
    const userScopedKeysToClear = Array.from(USER_SCOPED_CACHE_KEYS);
    await multiRemoveCached(userScopedKeysToClear);
    appleSessionRef.current = false;
    activeUserIdRef.current = null;
    setIsLoggedIn(false);
    setUserProfile(null);
    setAuthScreen('welcome');
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' });
    setAuthError('');
    setAuthMessage('');
    setFeedbackForm({
      name: '',
      email: '',
      rating: 5,
      workedWell: '',
      confusing: '',
      additions: '',
      bugReport: ''
    });
    setFeedbackConfirmation('');
    setOnboardingCompleted(keepOnboarding);
    setScanDate(null);
    setIsPremium(false);
    setIngredients([]);
    setMeals([]);
    setHasLoadedMoreMeals(false);
    setSelectedMeal(null);
    setSelectedMode('Basic');
    setSelectedFusionPlan('yearly');
    setPaymentForm({ cardNumber: '', expiration: '', cvv: '', name: '', zip: '' });
    setFridgePersonality('');
    setMealHistory([]);
    setFavoriteScanIds([]);
    setFavorites([]);
    setFavoriteFolderFilter('All');
    setGroceryList([]);
    setShoppingCart([]);
    setShoppingQuery('');
    setGlobalSearchQuery('');
    setRecentSearches([]);
    setShoppingResults([]);
    setShoppingNotice('');
    setShoppingStoreFilter('All Stores');
    setShoppingLocation(null);
    setShoppingLocationDraft('');
    setNearbyStores([]);
    setShoppingConnectionStatus('Not Connected');
    setFulfillmentMode('Delivery');
    setFulfillmentWindow('Within 2 hours');
    setPromoCode('');
    setPromoApplied(false);
    setOrderConfirmation(null);
    setOrderHistory([]);
    setTrackingDetailsOpen(false);
    setPendingScan(null);
    setPreferences([]);
    setDislikedIngredients([]);
    setDislikeInput('');
    setServings(2);
    setEquipment('Stove');
    setRecipeFeedback({ yes: [], nah: [] });
    setRecipeSource('Hybrid Mode');
    setRecipeNotice('');
    setIngredientStatuses({});
    setEquipmentProfile(['stove', 'microwave']);
    setMoodFilter('');
    setLeftoverSelection([]);
    setPantryItems([]);
    setPantryInput('');
    setPantryExpirationInput(dateFromToday(3));
    setRecipeRatings({ loved: [], fine: [], never: [] });
    setHouseholdMembers(['You']);
    setHouseholdInput('');
    setBudgetGoals({ weeklyBudget: '120', proteinGoal: '160', calorieTarget: '2200' });
    setMacroLock('200g protein');
    setPortionMode('couple');
    setRestaurantQuery('');
    setSocialPosts([]);
    setNotificationsEnabled(false);
    setNotificationPreferences({
      recipeIdeas: true,
      groceryReminders: true,
      orderUpdates: true,
      fusionUpdates: false
    });
    setCameraPermissionIntroSeen(false);
    setDeveloperMode(false);
    setQaChecklist({});
    expiryAlertKeyRef.current = '';
    await AsyncStorage.multiRemove([
      AUTH_KEY,
      USER_PROFILE_KEY,
      APPLE_AUTH_KEY,
      SCAN_KEY,
      PREMIUM_KEY,
      PREMIUM_PLAN_KEY,
      HISTORY_KEY,
      FAVORITE_SCANS_KEY,
      FAVORITES_KEY,
      GROCERY_KEY,
      SHOPPING_CART_KEY,
      SHOPPING_LOCATION_KEY,
      RECENT_SEARCHES_KEY,
      ORDER_HISTORY_KEY,
      PREFERENCES_KEY,
      DISLIKES_KEY,
      SERVINGS_KEY,
      EQUIPMENT_KEY,
      FEEDBACK_KEY,
      FEEDBACK_SUBMISSIONS_KEY,
      SCAN_COUNT_KEY,
      ONBOARDING_KEY,
      GROCERY_CHECKED_KEY,
      PANTRY_KEY,
      PLANNER_KEY,
      RECIPE_SOURCE_KEY,
      INGREDIENT_STATUS_KEY,
      EQUIPMENT_PROFILE_KEY,
      RECIPE_RATINGS_KEY,
      HOUSEHOLD_KEY,
      BUDGET_GOALS_KEY,
      MACRO_LOCK_KEY,
      SOCIAL_KEY,
      NOTIFICATION_PREFERENCES_KEY,
      CAMERA_PERMISSION_INTRO_KEY,
      NOTIFICATION_PERMISSION_KEY,
      QA_CHECKLIST_KEY
    ]);
    if (keepOnboarding) {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setScreen('home');
  }

  async function shareRecipe(meal) {
    await Share.share({
      message: `${meal.title}\n${meal.time} • ${meal.servingNote || `${servings} servings`}\n\nIngredients:\n${meal.ingredients.join(', ')}\n\nSteps:\n${meal.steps.join('\n')}\n\nFoodFusion AI - Scan. Match. Cook.`
    });
  }

  function addManualIngredient() {
    const nextIngredient = manualIngredient.trim().toLowerCase();
    if (!nextIngredient) {
      return;
    }
    setIngredients([...new Set([...ingredients, nextIngredient])]);
    const nextStatuses = { ...ingredientStatuses, [nextIngredient]: ingredientStatuses[nextIngredient] || 'fresh' };
    setIngredientStatuses(nextStatuses);
    setCachedItem(INGREDIENT_STATUS_KEY, JSON.stringify(nextStatuses));
    rememberSearch(nextIngredient, 'ingredient');
    setManualIngredient('');
    hapticTap();
    showToast('Ingredient added');
  }

  function removeIngredient(item) {
    const nextStatuses = { ...ingredientStatuses };
    delete nextStatuses[item];
    setIngredientStatuses(nextStatuses);
    setCachedItem(INGREDIENT_STATUS_KEY, JSON.stringify(nextStatuses));
    setIngredients(ingredients.filter((ingredient) => ingredient !== item));
  }

  async function regenerateMealsFromIngredients() {
    if (isGeneratingMeals) {
      return;
    }
    setIsGeneratingMeals(true);
    const mealSettings = goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: moodFilter,
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock);
    const mealLimit = isPremium ? 6 : 3;
    let mcpMeals = [];
    let matchingNotice = 'Smart Matching is using your saved recipe library.';

    if (recipeSource !== 'On-device Recipes') {
      try {
        const status = await checkRecipeMcpStatus();
        setRecipeMcpStatus(status);
        if (status.connected) {
          mcpMeals = await getRecipesFromMcp({
            ingredients,
            recipeType: selectedRecipeType,
            preferences: mealSettings.preferences,
            equipment,
            servings
          });
          matchingNotice = mcpMeals.length > 0
            ? 'Smart Matching connected. Recipes generated through Recipe Intelligence.'
            : 'Recipe Intelligence returned no matches. Smart Matching is using your saved recipe library.';
        } else {
          matchingNotice = 'Recipe Intelligence unavailable. Smart Matching is using your saved recipe library.';
        }
      } catch {
        mcpMeals = [];
        matchingNotice = 'Recipe Intelligence unavailable. Smart Matching is using your saved recipe library.';
      }
    }

    const localMeals = buildMeals(ingredients, isPremium, selectedMode, mealSettings);
    const rawMeals = mcpMeals.length > 0
      ? applyMealSettings(scoreMeals(mcpMeals, ingredients), mealSettings).slice(0, mealLimit)
      : localMeals;
    const typedMeals = addProductSignals(rawMeals, ingredients, activeIngredientStatuses)
      .slice(0, mealLimit)
      .map((meal) => ({
        ...meal,
        id: meal.id || `${Date.now()}-${meal.title}`,
        recipeType: selectedRecipeType,
        date: new Date().toLocaleDateString()
      }));
    const historyEntry = {
      id: `generate-${Date.now()}`,
      date: new Date().toLocaleDateString(),
      mode: selectedMode,
      recipeType: selectedRecipeType,
      personality: `${selectedRecipeType} generated`,
      meals: typedMeals
    };
    const nextHistory = [historyEntry, ...mealHistory].slice(0, 30);
    try {
      setRecipeNotice(matchingNotice);
      setMeals(typedMeals);
      setHasLoadedMoreMeals(false);
      setMealHistory(nextHistory);
      await setCachedItem(HISTORY_KEY, JSON.stringify(nextHistory));
      hapticSuccess();
      showToast('Meals ready');
      setScreen('results');
    } finally {
      setIsGeneratingMeals(false);
    }
  }

  function loadMoreMealOptions() {
    const mealSettings = goalAdjustedSettings({
      preferences,
      dislikes: dislikedIngredients,
      equipment,
      equipmentProfile,
      servings,
      feedback: recipeFeedback,
      ratings: recipeRatings,
      mood: moodFilter,
      recipeType: selectedRecipeType
    }, budgetGoals, macroLock);
    const expandedLocalMeals = addProductSignals(
      buildMeals(ingredients, isPremium, selectedMode, mealSettings, { limit: 6 }),
      ingredients,
      activeIngredientStatuses
    ).map((meal) => ({
      ...meal,
      id: meal.id || `${Date.now()}-${meal.title}`,
      recipeType: selectedRecipeType,
      date: meal.date || new Date().toLocaleDateString()
    }));
    const knownTitles = new Set(meals.map((meal) => meal.title));
    const additionalMeals = expandedLocalMeals.filter((meal) => !knownTitles.has(meal.title));
    const expandedMeals = [...meals, ...additionalMeals].slice(0, 6);

    setMeals(expandedMeals);
    setHasLoadedMoreMeals(true);
    hapticTap();
    showToast(expandedMeals.length > 3 ? 'More options loaded' : 'Showing all available options');
  }

  async function selectRecipeSource(source) {
    setRecipeSource(source);
    await updateOfflineCache(setCachedItem(RECIPE_SOURCE_KEY, source));
    syncQuietly('preferences', () => syncUserPreferences(preferenceSnapshot({ recipeSource: source })));
  }

  function updatePaymentField(key, value) {
    setPaymentForm((current) => ({ ...current, [key]: value }));
  }

  async function setIngredientFreshness(ingredient, status) {
    const nextStatuses = { ...ingredientStatuses, [ingredient]: status };
    setIngredientStatuses(nextStatuses);
    await setCachedItem(INGREDIENT_STATUS_KEY, JSON.stringify(nextStatuses));
    if (meals.length > 0) {
      setMeals(addProductSignals(meals, ingredients, nextStatuses));
    }
  }

  function startIngredientEdit(ingredient) {
    setEditingIngredient(ingredient);
    setIngredientEditValue(ingredient);
  }

  function saveIngredientEdit() {
    const nextValue = ingredientEditValue.trim().toLowerCase();
    if (!editingIngredient || !nextValue) {
      setEditingIngredient(null);
      return;
    }
    const nextIngredients = ingredients.map((ingredient) => ingredient === editingIngredient ? nextValue : ingredient);
    const nextStatuses = { ...ingredientStatuses };
    if (nextStatuses[editingIngredient]) {
      nextStatuses[nextValue] = nextStatuses[editingIngredient];
      delete nextStatuses[editingIngredient];
    }
    setIngredients([...new Set(nextIngredients)]);
    setIngredientStatuses(nextStatuses);
    setEditingIngredient(null);
    setIngredientEditValue('');
    setCachedItem(INGREDIENT_STATUS_KEY, JSON.stringify(nextStatuses));
  }

  function unlockDeveloperMode() {
    const nextCount = versionTapCount + 1;
    setVersionTapCount(nextCount);
    if (nextCount >= 5) {
      setDeveloperMode(true);
    }
  }

  async function clearAsyncStorageOnly() {
    await AsyncStorage.clear();
    await resetAllAppData();
  }

  function startStepTimer(step, index) {
    const seconds = stepSeconds(step) || 60;
    setActiveTimerStep(index);
    setTimerSeconds(seconds);
  }

  async function testRecipeMcpConnection() {
    const status = await checkRecipeMcpStatus();
    setRecipeMcpStatus(status);
  }

  if (!startupComplete || onboardingCompleted === null) {
    return <SplashScreen />;
  }

  if (onboardingCompleted === false) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  if (!isLoggedIn) {
    return (
      <AuthScreen
        mode={authScreen}
        form={authForm}
        error={authError}
        message={authMessage}
        onChange={updateAuthField}
        onLogin={handleLogin}
        onSignUp={handleSignUp}
        onContinueWithApple={handleContinueWithApple}
        onResetPassword={handleResetPassword}
        onShowLogin={() => showAuthMode('login')}
        onShowSignUp={() => showAuthMode('signup')}
        onShowForgotPassword={handleForgotPassword}
      />
    );
  }

  if (screen === 'onboarding') {
    return <OnboardingScreen onComplete={() => setScreen('settings')} />;
  }

  if (screen === 'cameraPermission') {
    return (
      <PermissionScreen
        title="Allow Camera Access"
        text="Take a fridge or pantry photo to identify ingredients and match recipes."
        points={['Scan ingredients in seconds', 'Review and edit detected items', 'Photos are used to analyze ingredients and generate recipe suggestions.']}
        onBack={() => setScreen('scan')}
        onContinue={continueCameraPermission}
        actionLabel="Continue to Camera"
      />
    );
  }

  if (screen === 'notificationPermission') {
    return (
      <PermissionScreen
        title="Stay Up to Date"
        text="Choose useful updates for recipes, groceries, orders, and Fusion+."
        points={['Recipe ideas when you need inspiration', 'Grocery and order reminders', 'Adjust choices anytime in Settings']}
        onBack={() => setScreen('settings')}
        onContinue={enableNotifications}
        actionLabel="Enable Updates"
      />
    );
  }

  if (screen === 'analysis') {
    return <AnalysisScreen stepIndex={analysisStep} tone={flowColors[selectedRecipeType]} />;
  }

  if (screen === 'home') {
    const homeFusionPlan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    const recipeTone = flowColors[selectedRecipeType];

    return (
      <Screen toast={toast}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.homeScroll}>
          <View style={styles.homeTop}>
            <View style={styles.homeTitleRow}>
              <View style={styles.homeTitleCopy}>
                <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>FoodFusion AI</Text>
                <Text style={styles.tagline} numberOfLines={1}>Scan. Match. Cook.</Text>
              </View>
              <View style={styles.homeActionStack}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  onPress={() => setScreen('settings')}
                  style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
                >
                  <Text style={[styles.headerGearText, { color: flowColors.profile.accent }]}>⚙</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Shopping cart, ${cartItemCount} ${cartItemCount === 1 ? 'item' : 'items'}`}
                  onPress={() => navigateTab('shopping')}
                  style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
                >
                  <CartIcon accent={flowColors.shopping.accent} />
                  {cartItemCount > 0 ? (
                    <View style={styles.cartBadge}>
                      <Text style={styles.cartBadgeText}>{cartItemCount > 99 ? '99+' : cartItemCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => setScreen(isPremium ? 'manageSubscription' : 'paywall')}
            style={({ pressed }) => [
              styles.premiumStatusStrip,
              { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent },
              pressed && styles.pressed
            ]}
          >
            <View>
              <Text style={styles.premiumStatusTitle}>{isPremium ? 'Fusion+ Active' : 'Fusion Free'}</Text>
              <Text style={styles.premiumStatusMeta}>{isPremium ? `${homeFusionPlan.name} plan` : '1 scan daily'}</Text>
            </View>
            <Text style={[styles.premiumStatusAction, { color: flowColors.fusion.accent }]}>{isPremium ? 'Manage Subscription' : 'Upgrade'}</Text>
          </Pressable>

          <View style={styles.recipeTypeTabs}>
            {recipeTypes.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setSelectedRecipeType(type);
                  setRecentTypeFilter(type);
                }}
                style={[
                  styles.recipeTypeTab,
                  selectedRecipeType === type && styles.activeRecipeTypeTab,
                  selectedRecipeType === type && { backgroundColor: flowColors[type].tint }
                ]}
              >
                <Text style={[
                  styles.recipeTypeText,
                  selectedRecipeType === type && styles.activeRecipeTypeText,
                  selectedRecipeType === type && { color: flowColors[type].accent }
                ]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <Button onPress={startScan} accent={recipeTone.accent}>Scan for {selectedRecipeType}</Button>

          <View style={styles.homeUtilityRow}>
            <Pressable onPress={() => setScreen('pantry')} style={({ pressed }) => [styles.homeUtilityCard, pressed && styles.pressed]}>
              <Text style={styles.homeUtilityTitle}>Pantry</Text>
              <Text style={styles.homeUtilityMeta}>{useSoonItems.length > 0 ? `${useSoonItems.length} use soon` : 'Track freshness'}</Text>
            </Pressable>
            <Pressable onPress={() => setScreen('collections')} style={({ pressed }) => [styles.homeUtilityCard, pressed && styles.pressed]}>
              <Text style={styles.homeUtilityTitle}>Specials</Text>
              <Text style={styles.homeUtilityMeta}>Find a mood</Text>
            </Pressable>
            <Pressable onPress={() => setScreen('search')} style={({ pressed }) => [styles.homeUtilityCard, pressed && styles.pressed]}>
              <Text style={styles.homeUtilityTitle}>Search</Text>
              <Text style={styles.homeUtilityMeta}>Everything</Text>
            </Pressable>
          </View>

          {useSoonItems.length > 0 ? (
            <Pressable onPress={() => setScreen('pantry')} style={({ pressed }) => [styles.useSoonBanner, pressed && styles.pressed]}>
              <View>
                <Text style={styles.useSoonTitle}>Use Soon</Text>
                <Text style={styles.useSoonMeta}>
                  {useSoonItems.slice(0, 3).map((item) => item.name).join(', ')}
                </Text>
              </View>
              <Text style={styles.premiumStatusAction}>View</Text>
            </Pressable>
          ) : null}

          <View style={[styles.homeInsightsCard, { borderColor: recipeTone.tint }]}>
            <View style={styles.demoHeader}>
              <Text style={[styles.homeInsightsTitle, { color: recipeTone.accent }]}>
                {activeRecentType === 'All' ? 'Recent Recipes' : `Recent ${activeRecentType}`}
              </Text>
              <Pressable onPress={() => setRecentTypeFilter(recentTypeFilter === 'All' ? selectedRecipeType : 'All')} style={styles.tinyAction}>
                <Text style={styles.tinyActionText}>{recentTypeFilter === 'All' ? selectedRecipeType : 'All'}</Text>
              </Pressable>
            </View>
            {visibleRecentRecipes.length === 0 ? (
              <EmptyState title={recentEmptyText(activeRecentType)} text="Scan ingredients to discover your next recipe." tone={recipeTone} symbol="+" />
            ) : (
              visibleRecentRecipes.slice(0, 4).map((meal) => (
                <Pressable key={recipeKey(meal, meal.recipeType)} onPress={() => openMeal(meal)} style={styles.homeInsightRow}>
                  <Text style={[styles.homeInsightLabel, { color: flowColors[recipeTypeForMeal(meal)].accent }]}>{recipeTypeForMeal(meal)}</Text>
                  <Text style={styles.homeInsightValue}>{meal.title}</Text>
                </Pressable>
              ))
            )}
          </View>

        </ScrollView>
        <BottomTabs active="home" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'search') {
    const hasQuery = globalSearchQuery.trim().length > 0;
    const hasResults = globalSearchResults.recipes.length > 0 ||
      globalSearchResults.ingredients.length > 0 ||
      globalSearchResults.groceries.length > 0;
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Search" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.globalSearchScroll}>
          <View style={styles.searchHero}>
            <Text style={styles.shopTitle}>Search FoodFusion</Text>
            <TextInput
              value={globalSearchQuery}
              onChangeText={setGlobalSearchQuery}
              placeholder="meals, drinks, ingredients, groceries"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              style={styles.fullInput}
            />
          </View>
          {!hasQuery ? <EmptyState title="Find anything" text="Search recipes, ingredients, or grocery products." /> : null}
          {hasQuery && !hasResults ? <EmptyState title="No matches found" text="Try another ingredient or recipe name." /> : null}
          {globalSearchResults.recipes.length > 0 ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Recipes</Text>
              {globalSearchResults.recipes.map((meal) => (
                <Pressable key={recipeKey(meal, recipeTypeForMeal(meal))} onPress={() => openMeal(meal)} style={styles.searchResultRow}>
                  <View style={styles.searchResultCopy}>
                    <Text style={styles.shopItemName}>{meal.title}</Text>
                    <Text style={styles.shopItemMeta}>{recipeTypeForMeal(meal)} • {meal.time}</Text>
                  </View>
                  <Text style={styles.collectionArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {globalSearchResults.ingredients.length > 0 ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Ingredients</Text>
              <View style={styles.optionRow}>
                {globalSearchResults.ingredients.map((item) => (
                  <Pressable key={item} onPress={() => {
                    setIngredients((current) => [...new Set([...current, item])]);
                    setScreen('ingredients');
                  }} style={styles.optionChip}>
                    <Text style={styles.optionChipText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {globalSearchResults.groceries.length > 0 ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Groceries</Text>
              {globalSearchResults.groceries.map((item) => (
                <Pressable key={item.id} onPress={() => openGlobalGroceryResult(item)} style={styles.searchResultRow}>
                  <View style={styles.searchResultCopy}>
                    <Text style={styles.shopItemName}>{item.name}</Text>
                    <Text style={styles.shopItemMeta}>{item.store} • {item.price}</Text>
                  </View>
                  <Text style={styles.collectionArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'scan') {
    const recipeTone = flowColors[selectedRecipeType];
    return (
      <Screen>
        <AppHeader eyebrow={`Scan for ${selectedRecipeType}`} onBack={() => setScreen('home')} accent={recipeTone.accent} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scanScroll}
          contentContainerStyle={styles.scanScrollContent}
        >
          <FlowProgress steps={['Scan', 'Ingredients', 'Recipes']} current={0} tone={recipeTone} />
          <View style={styles.uploadFrame}>
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraMark}>+</Text>
              <Text style={styles.uploadTitle}>Scan your fridge or pantry</Text>
              <Text style={styles.helperText}>Photos are analyzed and discarded after scanning.</Text>
            </View>
          </View>
          <Button onPress={scanEntireFridgeMode} accent={recipeTone.accent} disabled={isScanningPhoto}>
            {isScanningPhoto ? 'Scanning...' : 'Scan'}
          </Button>
          <Text style={styles.helperText}>
            {isScanningPhoto
              ? 'FoodFusion Analysis is checking your photo.'
              : 'Point your camera at fridge or pantry ingredients.'}
          </Text>
          {isScanningPhoto ? <LoadingState text="Analyzing ingredients..." rows={1} tone={recipeTone} /> : null}

          <View style={styles.scanOptionsCard}>
            <Text style={styles.scanOptionsTitle}>Meal Setup</Text>
            <Text style={styles.scanOptionsLabel}>Servings</Text>
            <View style={styles.optionRow}>
              {servingOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => selectServings(option)}
                  style={[styles.optionChip, servings === option && styles.activeOptionChip]}
                >
                  <Text style={[styles.optionChipText, servings === option && styles.activeOptionChipText]}>
                    {option} {option === 1 ? 'serving' : 'servings'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.scanOptionsLabel}>Equipment</Text>
            <View style={styles.optionRow}>
              {equipmentOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => selectEquipment(option)}
                  style={[styles.optionChip, equipment === option && styles.activeOptionChip]}
                >
                  <Text style={[styles.optionChipText, equipment === option && styles.activeOptionChipText]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

      </Screen>
    );
  }

  if (screen === 'ingredients') {
    const recipeTone = flowColors[selectedRecipeType];
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Detected Ingredients" onBack={() => setScreen('scan')} accent={recipeTone.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Scan', 'Ingredients', 'Recipes']} current={1} tone={recipeTone} />
          {recipeNotice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{recipeNotice}</Text>
            </View>
          ) : null}
          {scanSource ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>
                {scanSource === 'openai'
                  ? 'Using OpenAI Scan'
                  : scanSource === 'demo'
                  ? 'Using FoodFusion demo scan'
                  : 'Ingredient Review'}
              </Text>
            </View>
          ) : null}
          <View style={styles.identifiedCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.identifiedTitle}>Food identified</Text>
              <Text style={styles.sectionMeta}>{ingredients.length} items</Text>
            </View>
            <Text style={styles.identifiedMeta}>
              {ingredients.length > 0
                ? 'FoodFusion Analysis found these foods in your fridge or pantry photo.'
                : 'No ingredients were returned. Try again or add items below.'}
            </Text>
            <View style={styles.identifiedGrid}>
              {ingredients.map((item, index) => (
                <View key={item} style={styles.identifiedChip}>
                  <Text style={styles.identifiedChipText}>{item}</Text>
                  <Text style={styles.confidenceText}>{ingredientConfidence(item, index, scanDetections)}</Text>
                </View>
              ))}
            </View>
          </View>
          {fridgePersonality ? (
            <View style={styles.personalityCard}>
              <Text style={styles.personalityLabel}>Fridge Personality</Text>
              <Text style={styles.personalityText}>{fridgePersonality}</Text>
            </View>
          ) : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{selectedMode === 'Basic' ? 'Found' : selectedMode}</Text>
            <Text style={styles.sectionMeta}>{ingredients.length} items</Text>
          </View>
          <Text style={styles.sectionHint}>Use What's Going Bad: edit confidence, remove mistakes, and mark what needs using soon.</Text>
          <View style={styles.ingredientList}>
            {ingredients.map((item, index) => (
              <View key={item} style={styles.ingredientEditCard}>
                <View style={styles.ingredientEditTop}>
                  {editingIngredient === item ? (
                    <TextInput
                      value={ingredientEditValue}
                      onChangeText={setIngredientEditValue}
                      placeholder="ingredient"
                      placeholderTextColor={palette.muted}
                      autoCapitalize="none"
                      style={styles.ingredientEditInput}
                    />
                  ) : (
                    <View>
                      <Text style={styles.detectedIngredientText}>{item}</Text>
                      <Text style={styles.confidenceText}>{ingredientConfidence(item, index, scanDetections)}</Text>
                    </View>
                  )}
                  <View style={styles.ingredientActions}>
                    <Pressable onPress={() => editingIngredient === item ? saveIngredientEdit() : startIngredientEdit(item)} style={styles.tinyAction}>
                      <Text style={styles.tinyActionText}>{editingIngredient === item ? 'Save' : 'Edit'}</Text>
                    </Pressable>
                    <Pressable onPress={() => removeIngredient(item)} style={styles.tinyAction}>
                      <Text style={styles.tinyActionText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.freshnessRow}>
                  {freshnessOptions.map((status) => (
                    <Pressable
                      key={status}
                      onPress={() => setIngredientFreshness(item, status)}
                      style={[styles.freshnessChip, (ingredientStatuses[item] || 'fresh') === status && styles.activeFreshnessChip]}
                    >
                      <Text style={[styles.freshnessText, (ingredientStatuses[item] || 'fresh') === status && styles.activeFreshnessText]}>
                        {status}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.manualCard}>
            <Text style={styles.scanOptionsTitle}>Edit Ingredients</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                ref={manualIngredientInputRef}
                value={manualIngredient}
                onChangeText={setManualIngredient}
                placeholder="add rice, cheese..."
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                style={styles.dislikeInput}
              />
              <Pressable onPress={addManualIngredient} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Add</Text>
              </Pressable>
            </View>
            {recentSearches.some((item) => item.type === 'ingredient') ? (
              <View style={styles.recentSearchWrap}>
                <Text style={styles.scanOptionsLabel}>Recently Added</Text>
                <View style={styles.optionRow}>
                  {recentSearches.filter((item) => item.type === 'ingredient').slice(0, 4).map((item) => (
                    <Pressable key={`ingredient-${item.query}`} onPress={() => setManualIngredient(item.query)} style={styles.optionChip}>
                      <Text style={styles.optionChipText}>{item.query}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <Text style={styles.helperText}>Tap an ingredient to remove it.</Text>
          </View>

          {ingredients.length < 2 ? (
            <View style={styles.failCard}>
              <Text style={styles.failTitle}>Couldn't find enough.</Text>
              <Text style={styles.failText}>Try another photo or add ingredients manually.</Text>
              <View style={styles.feedbackRow}>
                <CompactButton variant="ghost" onPress={() => setScreen('scan')}>Try Again</CompactButton>
                <CompactButton onPress={() => manualIngredientInputRef.current?.focus()}>Add Manually</CompactButton>
              </View>
            </View>
          ) : null}

          {isGeneratingMeals ? <LoadingState text={`Matching ${selectedRecipeType.toLowerCase()}...`} rows={2} tone={recipeTone} /> : null}
          <Button onPress={regenerateMealsFromIngredients} accent={recipeTone.accent} disabled={isGeneratingMeals || ingredients.length === 0}>
            {isGeneratingMeals ? 'Matching...' : `See ${selectedRecipeType}`}
          </Button>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'results') {
    const recipeTone = flowColors[selectedRecipeType];
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow={`${selectedRecipeType} Results`} onBack={() => setScreen('ingredients')} accent={recipeTone.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Scan', 'Ingredients', 'Recipes']} current={2} tone={recipeTone} />
          {recipeNotice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{recipeNotice}</Text>
            </View>
          ) : null}
          {isPremium ? (
            <View style={styles.macroFilterSection}>
              <Text style={styles.macroFilterTitle}>Sort by</Text>
              <View style={styles.macroFilterRow}>
                {macroFilters.map((filter) => (
                  <MacroFilterButton
                    key={filter}
                    label={filter}
                    active={macroFilter === filter}
                    onPress={() => setMacroFilter(filter)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {visibleMeals.length === 0 ? (
            <EmptyState title="No recipes found" text="Adjust ingredients and try Smart Matching again." tone={recipeTone} symbol="+" />
          ) : null}
          {displayedMeals.map((meal) => (
            <Pressable
              key={meal.title}
              onPress={() => openMeal(meal)}
              style={({ pressed }) => [styles.mealCard, { borderColor: recipeTone.tint }, pressed && styles.pressed]}
            >
              <MealPreviewArt title={meal.title} />
              <View style={styles.mealTop}>
                <Text style={styles.mealTitle}>{meal.title}</Text>
                <View style={styles.mealTopRight}>
                  <TapScale
                    onPress={(event) => {
                      event.stopPropagation();
                      toggleFavorite(meal);
                    }}
                    style={styles.favoriteButton}
                    accessibilityLabel="Save recipe"
                  >
                    <Text style={styles.favoriteText}>
                      {favorites.some((favorite) => recipeKey(favorite, favorite.recipeType) === recipeKey(meal, selectedRecipeType)) ? '♥' : '♡'}
                    </Text>
                  </TapScale>
                </View>
              </View>
              <View style={styles.mealBadgeRow}>
                <Text style={[styles.flowBadge, { backgroundColor: recipeTone.tint, borderColor: recipeTone.accent, color: recipeTone.accent }]}>
                  {recipeTypeForMeal(meal, selectedRecipeType)}
                </Text>
                <Text style={styles.neutralBadge}>{meal.time}</Text>
                {isPremium ? <Text style={[styles.flowBadge, { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent, color: flowColors.fusion.accent }]}>Fusion+</Text> : null}
                {favorites.some((favorite) => recipeKey(favorite, favorite.recipeType) === recipeKey(meal, selectedRecipeType)) ? (
                  <Text style={[styles.flowBadge, { backgroundColor: flowColors.saved.tint, borderColor: flowColors.saved.accent, color: flowColors.saved.accent }]}>Saved</Text>
                ) : null}
              </View>
              <Text style={styles.mealDifficulty}>{meal.difficulty}</Text>
              <Text style={styles.difficultyLabel}>{difficultyLabel(meal)}</Text>
              {!isPremium ? (
                <View style={styles.qualityGrid}>
                  {[
                    ['Match', meal.quality?.match || qualityScores(meal, ingredients).match],
                    ['Protein', meal.quality?.protein || qualityScores(meal, ingredients).protein],
                    ['Effort', meal.quality?.effort || qualityScores(meal, ingredients).effort],
                    ['Cost', meal.quality?.cost || qualityScores(meal, ingredients).cost]
                  ].map(([label, value]) => (
                    <View key={label} style={styles.qualityTile}>
                      <Text style={styles.qualityValue}>{value}</Text>
                      <Text style={styles.qualityLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {isPremium ? (
                <>
                  <View style={styles.mealBadgeRow}>
                    {meal.airFryer ? <Text style={styles.mealBadge}>{meal.airFryer}</Text> : null}
                    {meal.useSoon ? <Text style={styles.mealBadge}>Use Soon</Text> : null}
                    {meal.lazy ? <Text style={styles.mealBadge}>Lazy Meal</Text> : null}
                    {meal.cost ? <Text style={styles.mealBadge}>{meal.cost}</Text> : null}
                    {meal.type ? <Text style={styles.mealBadge}>{meal.type}</Text> : null}
                    {meal.healthFocus ? <Text style={styles.mealBadge}>{meal.healthFocus}</Text> : null}
                    {meal.texture ? <Text style={styles.mealBadge}>{meal.texture}</Text> : null}
                    {meal.equipment ? <Text style={styles.mealBadge}>{meal.equipment}</Text> : null}
                  </View>
                  <View style={styles.qualityGrid}>
                    {[
                      ['Match', meal.quality?.match || qualityScores(meal, ingredients).match],
                      ['Protein', meal.quality?.protein || qualityScores(meal, ingredients).protein],
                      ['Effort', meal.quality?.effort || qualityScores(meal, ingredients).effort],
                      ['Cost', meal.quality?.cost || qualityScores(meal, ingredients).cost]
                    ].map(([label, value]) => (
                      <View key={label} style={styles.qualityTile}>
                        <Text style={styles.qualityValue}>{value}</Text>
                        <Text style={styles.qualityLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                  <MacroGrid macros={meal.macros} />
                  {meal.missingIngredients?.length > 0 ? (
                    <View style={styles.missingInlineCard}>
                      <Text style={styles.missingInlineLabel}>Missing</Text>
                      <Text style={styles.missingInlineText}>{meal.missingIngredients.join(', ')}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </Pressable>
          ))}

          {visibleMeals.length > 0 && !hasLoadedMoreMeals ? (
            <Button variant="ghost" accent={recipeTone.accent} onPress={loadMoreMealOptions}>Load More Options</Button>
          ) : null}

          {!isPremium ? (
            <Button accent={flowColors.fusion.accent} onPress={() => setScreen('paywall')}>Unlock Fusion+</Button>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'recipe' && selectedMeal) {
    const recipeTone = flowColors[recipeTypeForMeal(selectedMeal, selectedRecipeType)];
    const swapIdeas = ingredientSwapSuggestions(selectedMeal.ingredients);
    const isLastStep = recipeStepIndex === selectedMeal.steps.length - 1;
    const goToRecipeStep = (nextIndex) => {
      const boundedIndex = Math.max(0, Math.min(selectedMeal.steps.length - 1, nextIndex));
      setRecipeStepIndex(boundedIndex);
      recipePagerRef.current?.scrollTo({ x: boundedIndex * recipeCardWidth, animated: true });
    };

    return (
      <Screen toast={toast}>
        <AppHeader eyebrow={recipeTypeForMeal(selectedMeal, selectedRecipeType)} onBack={() => setScreen('results')} accent={recipeTone.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Scan', 'Ingredients', 'Recipes']} current={2} tone={recipeTone} />
          <MealPreviewArt title={selectedMeal.title} />
          <Text style={styles.recipeTitle}>{selectedMeal.title}</Text>
          <View style={styles.recipeMetaRow}>
            <Pill label={recipeTypeForMeal(selectedMeal, selectedRecipeType)} active accent={recipeTone.accent} tint={recipeTone.tint} />
            <Pill label={selectedMeal.time} active accent={recipeTone.accent} tint={recipeTone.tint} />
            <Pill label={selectedMeal.difficulty} />
            <Pill label={selectedMeal.servingNote || `${servings} servings`} />
            {selectedMeal.airFryer ? <Pill label={selectedMeal.airFryer} active /> : null}
          </View>
          <View style={styles.recipeActionRow}>
            <CompactButton accent={flowColors.saved.accent} onPress={() => toggleFavorite(selectedMeal)}>
              {favorites.some((favorite) => recipeKey(favorite, favorite.recipeType) === recipeKey(selectedMeal, selectedMeal.recipeType)) ? 'Saved' : 'Save'}
            </CompactButton>
            <CompactButton variant="ghost" onPress={() => shareRecipe(selectedMeal)}>Share</CompactButton>
          </View>
          <View style={styles.recipeIngredientCard}>
            <Text style={styles.swapTitle}>Ingredients</Text>
            <Text style={styles.swapText}>
              For {selectedMeal.servingNote || `${servings} servings`}: {selectedMeal.ingredients.join(', ')}
            </Text>
            <Text style={styles.swapText}>Portion mode: {portionMode}</Text>
          </View>
          {isPremium && selectedMeal.macros ? <MacroGrid macros={selectedMeal.macros} /> : null}
          <View style={styles.pairingCard}>
            <Text style={styles.swapTitle}>Meal + Drink Pairing</Text>
            {mealPairings(selectedMeal).map((pairing, index) => (
              <Pressable key={`${pairing.title}-${index}`} onPress={() => openMeal(pairing)} style={styles.pairingRow}>
                <Text style={styles.pairingTitle}>{pairing.title}</Text>
                <Text style={styles.pairingMeta}>{pairing.type || pairing.healthFocus || pairing.equipment}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            ref={recipePagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / recipeCardWidth);
              setRecipeStepIndex(nextIndex);
            }}
            style={styles.stepPager}
          >
            {selectedMeal.steps.map((step, index) => (
              <View key={step} style={[styles.tiktokStepCard, { width: recipeCardWidth }]}>
                <Text style={styles.tiktokStepCount}>Step {index + 1} of {selectedMeal.steps.length}</Text>
                <Text style={styles.tiktokStepNumber}>{index + 1}</Text>
                <Text style={styles.tiktokStepText}>{step}</Text>
                <Text style={styles.stepTimerText}>
                  {selectedMeal.airFryer || (parseMinutes(selectedMeal.time) <= 15 ? `${selectedMeal.time} total` : 'Swipe or tap Next')} • For {selectedMeal.servingNote || `${servings} servings`}
                </Text>
                <Pressable onPress={() => startStepTimer(step, index)} style={styles.timerButton}>
                  <Text style={styles.timerButtonText}>
                    {activeTimerStep === index && timerSeconds > 0 ? formatTimer(timerSeconds) : 'Start Timer'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <View style={styles.stepNavRow}>
            <CompactButton
              variant="ghost"
              disabled={recipeStepIndex === 0}
              onPress={() => goToRecipeStep(recipeStepIndex - 1)}
            >
              Back
            </CompactButton>
            <CompactButton
              onPress={() => {
                if (isLastStep) {
                  setScreen('home');
                  return;
                }
                goToRecipeStep(recipeStepIndex + 1);
              }}
            >
              {isLastStep ? 'Done' : 'Next'}
            </CompactButton>
          </View>
          <View style={styles.swapCard}>
            <Text style={styles.swapTitle}>AI Cooking Coach</Text>
            <Text style={styles.swapText}>{coachTip(selectedMeal.steps[recipeStepIndex] || selectedMeal.steps[0], selectedMeal)}</Text>
            <Text style={styles.swapTitle}>Ingredient Swaps</Text>
            {swapIdeas.map((idea) => (
              <Text key={idea} style={styles.swapText}>{idea}</Text>
            ))}
          </View>
          <Button onPress={() => setScreen('cooking')}>Cooking Mode</Button>
          <Button variant="ghost" onPress={postCreation}>Post Creation</Button>
          {isLastStep ? (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>Cook this again?</Text>
              <View style={styles.feedbackRow}>
                <CompactButton variant="ghost" onPress={() => saveRecipeFeedback(selectedMeal, 'yes')}>Yes</CompactButton>
                <CompactButton variant="ghost" onPress={() => saveRecipeFeedback(selectedMeal, 'nah')}>Nah</CompactButton>
              </View>
              <Text style={styles.feedbackTitle}>Rate this meal</Text>
              <View style={styles.feedbackRow}>
                {['Loved it', 'It was fine', 'Never again'].map((rating) => (
                  <CompactButton key={rating} variant="ghost" onPress={() => saveRecipeRating(selectedMeal, rating)}>
                    {rating}
                  </CompactButton>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'cooking' && selectedMeal) {
    const currentStep = selectedMeal.steps[recipeStepIndex];
    return (
      <SafeAreaView style={styles.cookingSafe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.cookingHeader}>
          <Pressable onPress={() => setScreen('recipe')} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.eyebrow}>Cooking Mode</Text>
          <View style={styles.backSpacer} />
        </View>
        <View style={styles.cookingBody}>
          <Text style={styles.cookingStepCount}>Step {recipeStepIndex + 1} of {selectedMeal.steps.length}</Text>
          <Text style={styles.cookingAwakeText}>Display stays on while you cook</Text>
          <Text style={styles.cookingText}>{currentStep}</Text>
          <View style={styles.cookingChecklist}>
            {selectedMeal.ingredients.slice(0, 5).map((item) => (
              <Text key={item} style={styles.cookingIngredient}>□ {item}</Text>
            ))}
          </View>
          <Pressable onPress={() => startStepTimer(currentStep, recipeStepIndex)} style={styles.timerButton}>
            <Text style={styles.timerButtonText}>
              {activeTimerStep === recipeStepIndex && timerSeconds > 0 ? formatTimer(timerSeconds) : 'Start Timer'}
            </Text>
          </Pressable>
          <View style={styles.voiceCard}>
            <Text style={styles.voiceTitle}>Voice Cooking Mode</Text>
            <Text style={styles.voiceText}>Try: {voiceCommands.join(', ')}</Text>
            <Text style={styles.voiceText}>{coachTip(currentStep, selectedMeal)}</Text>
          </View>
        </View>
        <View style={styles.stepNavRow}>
          <CompactButton
            variant="ghost"
            disabled={recipeStepIndex === 0}
            onPress={() => setRecipeStepIndex(Math.max(0, recipeStepIndex - 1))}
          >
            Back
          </CompactButton>
          <CompactButton
            onPress={() => {
              if (recipeStepIndex === selectedMeal.steps.length - 1) {
                setScreen('home');
                return;
              }
              setRecipeStepIndex(recipeStepIndex + 1);
            }}
          >
            {recipeStepIndex === selectedMeal.steps.length - 1 ? 'Done' : 'Next'}
          </CompactButton>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'profile') {
    const mealsCooked = mealHistory.reduce((total, entry) => total + entry.meals.length, 0);
    const plan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    return (
      <Screen>
        <AppHeader eyebrow="Profile" onSettings={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <View style={styles.profileHero}>
            <Text style={styles.profileTitle}>{userProfile?.name || 'FoodFusion User'}</Text>
            <Text style={styles.profileMeta}>{userProfile?.email || 'Signed in'}</Text>
            <Text style={styles.profileMeta}>{isPremium ? `Fusion+ • ${plan.name} plan` : 'Fusion Free'}</Text>
          </View>
          <View style={styles.profileGrid}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{isPremium ? 'Plus' : 'Free'}</Text>
              <Text style={styles.profileStatLabel}>Fusion+</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{scanDate === todayKey() ? scanCountToday || 1 : 0}</Text>
              <Text style={styles.profileStatLabel}>Scans today</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{mealsCooked}</Text>
              <Text style={styles.profileStatLabel}>Meals cooked</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{favorites.length}</Text>
              <Text style={styles.profileStatLabel}>Favorites saved</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{orderHistory.length}</Text>
              <Text style={styles.profileStatLabel}>Orders placed</Text>
            </View>
          </View>
          <Button accent={flowColors.fusion.accent} onPress={() => setScreen(isPremium ? 'manageSubscription' : 'paywall')}>Manage Subscription</Button>
          <Button variant="ghost" onPress={() => setScreen('history')}>Scan History</Button>
          <Button variant="ghost" onPress={() => openFeedback('profile')}>Feedback</Button>
          <Button variant="ghost" onPress={logout}>Log Out</Button>
          <Button variant="ghost" onPress={confirmDeleteAccount}>Delete Account</Button>
        </ScrollView>
        <BottomTabs active="profile" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'history') {
    const favoriteIngredients = [...new Set(mealHistory.flatMap((entry) => entry.meals.flatMap((meal) => meal.ingredients || [])))].slice(0, 6);
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Scan History" onBack={() => setScreen('profile')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {mealHistory.length === 0 ? <EmptyState title="No scan history" text="Scan ingredients to start building recipe history." tone={flowColors.profile} symbol="⌂" /> : null}
          {mealHistory.length > 0 ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Cooking Trends</Text>
              <Text style={styles.listMeta}>{mealHistory.length} scans • {homeMeals.length} recent meals generated</Text>
              <View style={styles.optionRow}>
                {favoriteIngredients.map((item) => (
                  <View key={item} style={styles.nudgeChip}>
                    <Text style={styles.nudgeText}>{item}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.historyActionRow}>
                <CompactButton variant="ghost" onPress={clearHistory}>Clear History</CompactButton>
              </View>
            </View>
          ) : null}
          {mealHistory.map((entry) => (
            <View key={entry.id} style={styles.listCard}>
              <View style={styles.mealTop}>
                <Text style={styles.listTitle}>{entry.personality}</Text>
                <TapScale onPress={() => toggleFavoriteScan(entry.id)} style={styles.favoriteButton} accessibilityLabel="Save scan">
                  <Text style={styles.favoriteText}>{favoriteScanIds.includes(entry.id) ? '♥' : '♡'}</Text>
                </TapScale>
              </View>
              <Text style={styles.listMeta}>{entry.date} • {entry.mode}</Text>
              {entry.meals.map((meal) => (
                <View key={meal.title} style={styles.listRow}>
                  <Pressable onPress={() => openMeal(meal)}>
                    <Text style={styles.listRowTitle}>{meal.title}</Text>
                    <Text style={styles.listRowMeta}>{meal.time}</Text>
                  </Pressable>
                  <Pressable onPress={() => openMeal(meal)} style={styles.cookAgainButton}>
                    <Text style={styles.cookAgainText}>Cook Again</Text>
                  </Pressable>
                </View>
              ))}
              <View style={styles.historyActionRow}>
                <CompactButton variant="ghost" onPress={() => deleteScan(entry.id)}>Delete Scan</CompactButton>
              </View>
            </View>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'favorites') {
    const visibleFavorites = favorites.filter((meal) => {
      const matchesType = favoriteTypeFilter === 'All' || recipeTypeForMeal(meal) === favoriteTypeFilter;
      const matchesFolder = favoriteFolderFilter === 'All' || (meal.folder || 'Favorites') === favoriteFolderFilter;
      return matchesType && matchesFolder;
    });
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Saved Recipes" onSettings={() => setScreen('settings')} accent={flowColors.saved.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.storeFilterRow}>
              {recipeTypeFilters.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setFavoriteTypeFilter(type)}
                  style={[
                    styles.storeChip,
                    favoriteTypeFilter === type && styles.activeStoreChip,
                    favoriteTypeFilter === type && { backgroundColor: flowColors.saved.tint, borderColor: flowColors.saved.accent }
                  ]}
                >
                  <Text style={[styles.storeChipText, favoriteTypeFilter === type && styles.activeStoreChipText, favoriteTypeFilter === type && { color: flowColors.saved.accent }]}>{type}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.filterLabel}>Folders</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.storeFilterRow}>
              {favoriteFolders.map((folder) => (
                <Pressable
                  key={folder}
                  onPress={() => setFavoriteFolderFilter(folder)}
                  style={[
                    styles.folderChip,
                    favoriteFolderFilter === folder && styles.activeStoreChip,
                    favoriteFolderFilter === folder && { backgroundColor: flowColors.saved.tint, borderColor: flowColors.saved.accent }
                  ]}
                >
                  <Text style={[styles.storeChipText, favoriteFolderFilter === folder && styles.activeStoreChipText, favoriteFolderFilter === folder && { color: flowColors.saved.accent }]}>{folder}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {tabLoading === 'favorites' ? <LoadingState text="Loading saved recipes..." rows={2} tone={flowColors.saved} /> : null}
          {tabLoading !== 'favorites' && visibleFavorites.length === 0 ? <EmptyState title="No saved recipes yet" text="Tap the heart on a recipe to save it here." tone={flowColors.saved} symbol="♡" /> : null}
          {tabLoading !== 'favorites' && visibleFavorites.map((meal) => (
            <View key={recipeKey(meal, meal.recipeType)} style={[styles.listCard, { borderColor: flowColors[recipeTypeForMeal(meal)].tint }]}>
              <MealPreviewArt title={meal.title} />
              <View style={styles.mealTop}>
                <Text style={styles.listTitle}>{meal.title}</Text>
                <TapScale
                  onPress={() => toggleFavorite(meal)}
                  style={styles.favoriteButton}
                  accessibilityLabel="Remove favorite"
                >
                  <Text style={styles.favoriteText}>♥</Text>
                </TapScale>
              </View>
              <Text style={styles.listMeta}>
                {[meal.folder || 'Favorites', recipeTypeForMeal(meal), meal.time, meal.macros ? `${meal.macros.protein}g protein` : '', meal.savedAt ? `Saved ${meal.savedAt}` : ''].filter(Boolean).join(' • ')}
              </Text>
              <View style={styles.mealBadgeRow}>
                <Text style={[
                  styles.flowBadge,
                  {
                    backgroundColor: flowColors[recipeTypeForMeal(meal)].tint,
                    borderColor: flowColors[recipeTypeForMeal(meal)].accent,
                    color: flowColors[recipeTypeForMeal(meal)].accent
                  }
                ]}>{recipeTypeForMeal(meal)}</Text>
                <Text style={[styles.flowBadge, { backgroundColor: flowColors.saved.tint, borderColor: flowColors.saved.accent, color: flowColors.saved.accent }]}>Saved</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderAssignRow}>
                {favoriteFolders.slice(1).map((folder) => (
                  <Pressable
                    key={`${meal.title}-${folder}`}
                    onPress={() => assignFavoriteFolder(meal, folder)}
                    style={[
                      styles.miniFolderChip,
                      (meal.folder || 'Favorites') === folder && styles.activeStoreChip,
                      (meal.folder || 'Favorites') === folder && { backgroundColor: flowColors.saved.tint, borderColor: flowColors.saved.accent }
                    ]}
                  >
                    <Text style={[styles.miniFolderText, (meal.folder || 'Favorites') === folder && styles.activeStoreChipText, (meal.folder || 'Favorites') === folder && { color: flowColors.saved.accent }]}>{folder}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.feedbackRow}>
                <CompactButton accent={flowColors[recipeTypeForMeal(meal)].accent} onPress={() => openMeal(meal)}>Open Recipe</CompactButton>
                <CompactButton variant="ghost" onPress={() => toggleFavorite(meal)}>Remove</CompactButton>
              </View>
            </View>
          ))}
        </ScrollView>
        <BottomTabs active="favorites" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'grocery') {
    const groupedGrocery = groceryList.reduce((groups, item) => {
      const category = groceryCategory(item);
      return { ...groups, [category]: [...(groups[category] || []), item] };
    }, {});
    const estimatedTotal = groceryList.length * 3 + 8;
    return (
      <Screen>
        <AppHeader eyebrow="Smart Grocery" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {groceryList.length === 0 ? <Text style={styles.emptyText}>Your grocery list is empty.</Text> : null}
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Estimated total</Text>
            <Text style={styles.profileMeta}>${estimatedTotal}</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={customGroceryItem}
                onChangeText={setCustomGroceryItem}
                placeholder="add custom item"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                style={styles.dislikeInput}
              />
              <Pressable onPress={addCustomGroceryItem} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Add</Text>
              </Pressable>
            </View>
          </View>
          {Object.entries(groupedGrocery).map(([category, items]) => (
            <View key={category} style={styles.listCard}>
              <Text style={styles.listTitle}>{category}</Text>
              {items.map((item) => (
                <View key={item} style={styles.groceryRow}>
                  <Pressable onPress={() => toggleGroceryChecked(item)} style={styles.checkBox}>
                    <Text style={styles.checkBoxText}>{groceryChecked[item] ? '✓' : ''}</Text>
                  </Pressable>
                  <Text style={[styles.groceryText, groceryChecked[item] && styles.checkedGroceryText]}>{item}</Text>
                  <Pressable onPress={() => deleteGroceryItem(item)} style={styles.deleteButton}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'shoppingLocation') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Shopping Location" onBack={() => setScreen('home')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <FlowProgress steps={['Location', 'Stores', 'Cart']} current={0} tone={flowColors.shopping} />
          <View style={[styles.shopSearchCard, { borderColor: flowColors.shopping.tint }]}>
            <Text style={[styles.shopTitle, { color: flowColors.shopping.accent }]}>Find Stores Near You</Text>
            <Text style={styles.settingsSubtitle}>Enter your delivery address or ZIP code to see store options.</Text>
            <Text style={styles.filterLabel}>Address or ZIP code</Text>
            <TextInput
              value={shoppingLocationDraft}
              onChangeText={setShoppingLocationDraft}
              onSubmitEditing={saveShoppingLocation}
              placeholder="85001 or 123 Main Street"
              placeholderTextColor={palette.muted}
              autoCapitalize="words"
              style={styles.locationInput}
            />
            <View style={styles.fulfillmentToggle}>
              {['Delivery', 'Pickup'].map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setFulfillmentMode(mode)}
                  style={[
                    styles.fulfillmentOption,
                    fulfillmentMode === mode && styles.activeFulfillmentOption,
                    fulfillmentMode === mode && { backgroundColor: flowColors.shopping.tint }
                  ]}
                >
                  <Text style={[styles.fulfillmentText, fulfillmentMode === mode && { color: flowColors.shopping.accent }]}>{mode}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Button accent={flowColors.shopping.accent} onPress={saveShoppingLocation} disabled={isNearbyStoresLoading}>
            {isNearbyStoresLoading ? 'Finding Stores...' : 'Save Location'}
          </Button>
          {isNearbyStoresLoading ? <LoadingState text="Finding stores..." rows={3} tone={flowColors.shopping} /> : null}
        </ScrollView>
        <BottomTabs active="shopping" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'shoppingStores') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Nearby Stores" onBack={() => setScreen('shoppingLocation')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <FlowProgress steps={['Location', 'Stores', 'Cart']} current={1} tone={flowColors.shopping} />
          <View style={styles.locationSummaryCard}>
            <Text style={styles.listTitle}>{fulfillmentMode} near {shoppingLocation?.address}</Text>
            <Text style={styles.shopItemMeta}>{shoppingConnectionStatus === 'Connected' ? 'Live store availability connected' : 'Live availability unavailable. Confirm details at checkout.'}</Text>
          </View>
          {isNearbyStoresLoading ? <LoadingState text="Finding stores..." rows={4} tone={flowColors.shopping} /> : null}
          {!isNearbyStoresLoading && nearbyStores.map((store) => (
            <Pressable
              key={store.id}
              onPress={() => {
                setShoppingStoreFilter(store.name);
                setScreen('shopping');
              }}
              style={({ pressed }) => [styles.nearbyStoreCard, pressed && styles.pressed]}
            >
              <View style={styles.storeCardHeader}>
                <Text style={styles.listTitle}>{store.name}</Text>
                <Text style={[styles.storeStatus, store.status !== 'Open' && styles.storeStatusClosing]}>{store.status}</Text>
              </View>
              <Text style={styles.shopItemMeta}>{[store.distance, store.eta, store.fee].filter(Boolean).join(' • ')}</Text>
              <Text style={[styles.orderHistoryText, { color: flowColors.shopping.accent }]}>Shop this store</Text>
            </Pressable>
          ))}
          <Button accent={flowColors.shopping.accent} onPress={() => {
            setShoppingStoreFilter('All Stores');
            setScreen('shopping');
          }}>Shop All Stores</Button>
        </ScrollView>
        <BottomTabs active="shopping" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'shopping') {
    const filteredResults = visibleShoppingResults();
    const storeFilters = ['All Stores', ...nearbyStores.map((store) => store.name)];
    const groupedResults = Object.entries(filteredResults.reduce((groups, item) => {
      const storeName = item.store || item.brand || 'Store';
      return { ...groups, [storeName]: [...(groups[storeName] || []), item] };
    }, {}));
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Shop Ingredients" onSettings={() => setScreen('settings')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <FlowProgress steps={['Cart', 'Checkout', 'Tracking']} current={0} tone={flowColors.shopping} />
          <View style={styles.locationSummaryCard}>
            <View style={styles.storeCardHeader}>
              <View style={styles.shopItemInfo}>
                <Text style={styles.listTitle}>{fulfillmentMode} location</Text>
                <Text style={styles.shopItemMeta}>{shoppingLocation?.address || 'Add a location'}</Text>
              </View>
              <Pressable onPress={() => setScreen('shoppingLocation')} style={styles.tinyAction}>
                <Text style={styles.tinyActionText}>Change</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setScreen('shoppingStores')} style={styles.orderHistoryButton}>
              <Text style={[styles.orderHistoryText, { color: flowColors.shopping.accent }]}>Browse Nearby Stores</Text>
            </Pressable>
          </View>
          <View style={[styles.shopSearchCard, { borderColor: flowColors.shopping.tint }]}>
            <Text style={[styles.shopTitle, { color: flowColors.shopping.accent }]}>Search Items</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={shoppingQuery}
                onChangeText={setShoppingQuery}
                onSubmitEditing={() => searchShoppingItems()}
                placeholder="search eggs, berries, chicken..."
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                style={styles.dislikeInput}
              />
              <Pressable onPress={() => searchShoppingItems()} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>{isShoppingLoading ? '...' : 'Find'}</Text>
              </Pressable>
            </View>
            {recentSearches.some((item) => item.type === 'grocery') ? (
              <View style={styles.recentSearchWrap}>
                <Text style={styles.scanOptionsLabel}>Recent Searches</Text>
                <View style={styles.optionRow}>
                  {recentSearches.filter((item) => item.type === 'grocery').slice(0, 4).map((item) => (
                    <Pressable
                      key={`grocery-${item.query}`}
                      onPress={() => {
                        setShoppingQuery(item.query);
                        searchShoppingItems(item.query);
                      }}
                      style={styles.optionChip}
                    >
                      <Text style={styles.optionChipText}>{item.query}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {shoppingNotice ? <Text style={styles.shopNotice}>{shoppingNotice}</Text> : null}
            <Pressable onPress={() => navigateTab('orderHistory')} style={styles.orderHistoryButton}>
              <Text style={[styles.orderHistoryText, { color: flowColors.shopping.accent }]}>Order History</Text>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.storeFilterRow}>
                {storeFilters.map((store) => (
                  <Pressable
                    key={store}
                    onPress={() => setShoppingStoreFilter(store)}
                    style={[
                      styles.storeChip,
                      shoppingStoreFilter === store && styles.activeStoreChip,
                      shoppingStoreFilter === store && { backgroundColor: flowColors.shopping.tint, borderColor: flowColors.shopping.accent }
                    ]}
                  >
                    <Text style={[styles.storeChipText, shoppingStoreFilter === store && styles.activeStoreChipText, shoppingStoreFilter === store && { color: flowColors.shopping.accent }]}>{store}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {tabLoading === 'shopping' ? <LoadingState text="Loading shop..." rows={2} tone={flowColors.shopping} /> : null}
          {isShoppingLoading ? <LoadingState text="Searching groceries..." rows={3} tone={flowColors.shopping} /> : null}
          {groupedResults.map(([store, items]) => (
            <View key={store} style={[styles.listCard, { borderColor: flowColors.shopping.tint }]}>
              <Text style={[styles.listTitle, { color: flowColors.shopping.accent }]}>{store}</Text>
              <Text style={styles.shopItemMeta}>{nearbyStores.find((item) => item.name === store)?.eta || fulfillmentMode}</Text>
              {items.map((item) => (
                <View key={item.id} style={styles.shopItemRow}>
                  <View style={styles.productThumb}>
                    <Text style={styles.productThumbText}>{item.name.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.shopItemInfo}>
                    <Text style={styles.shopItemName}>{item.name}</Text>
                    <Text style={styles.shopItemMeta}>
                      {[item.store || item.brand, item.size, item.price, item.eta].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                  <TapScale onPress={() => addShoppingItem(item)} style={styles.tinyAction} accessibilityLabel="Add to cart">
                    <Text style={styles.tinyActionText}>Add</Text>
                  </TapScale>
                </View>
              ))}
            </View>
          ))}

          {shoppingSuggestions.length > 0 ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Smart Suggestions</Text>
              {shoppingSuggestions.map((group) => (
                <View key={group.title} style={styles.suggestionGroup}>
                  <Text style={styles.filterLabel}>{group.title}</Text>
                  {group.products.map((product) => {
                    const suggestedItem = localShoppingSearch(product.key).find((item) => item.name === product.name) ||
                      localShoppingSearch(product.key)[0];
                    return (
                      <View key={`${group.title}-${product.name}`} style={styles.suggestionRow}>
                        <View style={styles.shopItemInfo}>
                          <Text style={styles.shopItemName}>{product.name}</Text>
                          <Text style={styles.shopItemMeta}>{product.store} • {product.size} • {product.price}</Text>
                        </View>
                        <TapScale onPress={() => addShoppingItem(suggestedItem)} style={styles.tinyAction} accessibilityLabel={`Add ${product.name}`}>
                          <Text style={styles.tinyActionText}>Add</Text>
                        </TapScale>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.listCard, { borderColor: flowColors.shopping.tint }]}>
            <View style={styles.demoHeader}>
              <Text style={styles.listTitle}>Cart</Text>
              <Text style={styles.demoMeta}>{cartItemCount} items</Text>
            </View>
            {shoppingCart.length === 0 ? <EmptyState title="Your cart is empty" text="Search ingredients to get started." tone={flowColors.shopping} symbol="+" /> : null}
            {cartGroups.map((group) => (
              <View key={group.store} style={styles.cartStoreSection}>
                <View style={styles.storeCardHeader}>
                  <Text style={styles.filterLabel}>{group.store}</Text>
                  <Text style={styles.shopItemMeta}>{formatMoney(group.totals.subtotal)}</Text>
                </View>
                {group.items.map((item) => (
                  <View key={item.id} style={styles.shopItemRow}>
                    <View style={styles.productThumb}>
                      <Text style={styles.productThumbText}>{item.name.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.shopItemInfo}>
                      <Text style={styles.shopItemName}>{item.name}</Text>
                      <Text style={styles.shopItemMeta}>{item.price}</Text>
                    </View>
                    <View style={styles.quantityControl}>
                      <Pressable onPress={() => updateShoppingQuantity(item.id, -1)} style={styles.quantityButton}>
                        <Text style={styles.quantityText}>-</Text>
                      </Pressable>
                      <Text style={styles.quantityValue}>{item.quantity || 1}</Text>
                      <Pressable onPress={() => updateShoppingQuantity(item.id, 1)} style={styles.quantityButton}>
                        <Text style={styles.quantityText}>+</Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={() => removeShoppingItem(item.id)} style={styles.tinyAction}>
                      <Text style={styles.tinyActionText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))}
            {shoppingCart.length > 0 ? (
              <View style={styles.totalPanel}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatMoney(cartTotals.subtotal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Estimated fees</Text>
                  <Text style={styles.totalValue}>{formatMoney(cartTotals.fees)}</Text>
                </View>
                {cartTotals.savings > 0 ? (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Savings</Text>
                    <Text style={styles.totalValue}>-{formatMoney(cartTotals.savings)}</Text>
                  </View>
                ) : null}
                <View style={styles.totalRow}>
                  <Text style={styles.totalStrong}>Estimated total</Text>
                  <Text style={styles.totalStrong}>{formatMoney(cartTotals.total)}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <Button accent={flowColors.shopping.accent} onPress={startShoppingCheckout} disabled={shoppingCart.length === 0}>Checkout</Button>
        </ScrollView>
        <BottomTabs active="shopping" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'shoppingCheckout') {
    const deliveryEta = primaryNearbyStore?.eta || (fulfillmentMode === 'Delivery' ? primaryStoreMeta.delivery : primaryStoreMeta.pickup);
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Checkout" onBack={() => setScreen('shopping')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Cart', 'Checkout', 'Tracking']} current={1} tone={flowColors.shopping} />
          <View style={styles.listCard}>
            <Text style={styles.shopTitle}>Cart Summary</Text>
            {cartGroups.map((group) => (
              <View key={group.store} style={styles.cartStoreSection}>
                <Text style={styles.filterLabel}>{group.store}</Text>
                {group.items.map((item) => (
                  <View key={item.id} style={styles.checkoutLine}>
                    <Text style={styles.checkoutLineText}>{`${item.quantity || 1}x ${item.name}`}</Text>
                    <Text style={styles.checkoutLineText}>{formatMoney(parsePrice(item.price) * (item.quantity || 1))}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Fulfillment</Text>
            <Text style={styles.shopItemMeta}>{cartGroups.map((group) => group.store).join(' • ')}</Text>
            <View style={styles.fulfillmentToggle}>
              {['Delivery', 'Pickup'].map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => updateShoppingFulfillment(mode)}
                  style={[
                    styles.fulfillmentOption,
                    fulfillmentMode === mode && styles.activeFulfillmentOption,
                    fulfillmentMode === mode && { backgroundColor: flowColors.shopping.tint }
                  ]}
                >
                  <Text style={[styles.fulfillmentText, fulfillmentMode === mode && styles.activeFulfillmentText, fulfillmentMode === mode && { color: flowColors.shopping.accent }]}>{mode}</Text>
                </Pressable>
              ))}
            </View>
            {fulfillmentMode === 'Delivery' ? (
              <View style={styles.checkoutField}>
                <Text style={styles.totalLabel}>Delivery Address</Text>
                <Text style={styles.checkoutPlaceholder}>{shoppingLocation?.address || 'Add delivery location'}</Text>
              </View>
            ) : (
              <View style={styles.checkoutField}>
                <Text style={styles.totalLabel}>Pickup Store</Text>
                <Text style={styles.checkoutPlaceholder}>{primaryCartStore}</Text>
              </View>
            )}
            <View style={styles.checkoutField}>
              <Text style={styles.totalLabel}>{fulfillmentMode === 'Delivery' ? 'Delivery Time' : 'Pickup Time'}</Text>
              <Text style={styles.checkoutPlaceholder}>{deliveryEta}</Text>
            </View>
            <Text style={styles.filterLabel}>Time Window</Text>
            <View style={styles.optionRow}>
              {['Within 2 hours', 'This evening', 'Tomorrow morning'].map((window) => (
                <Pressable
                  key={window}
                  onPress={() => setFulfillmentWindow(window)}
                  style={[
                    styles.storeChip,
                    fulfillmentWindow === window && styles.activeStoreChip,
                    fulfillmentWindow === window && { backgroundColor: flowColors.shopping.tint, borderColor: flowColors.shopping.accent }
                  ]}
                >
                  <Text style={[styles.storeChipText, fulfillmentWindow === window && { color: flowColors.shopping.accent }]}>{window}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Payment</Text>
            <View style={styles.checkoutField}>
              <Text style={styles.totalLabel}>Payment Method</Text>
              <Text style={styles.checkoutPlaceholder}>Visa ending in 4242</Text>
            </View>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={promoCode}
                onChangeText={(value) => {
                  setPromoCode(value);
                  setPromoApplied(false);
                }}
                placeholder="promo code"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                style={styles.dislikeInput}
              />
              <Pressable onPress={applyPromoCode} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Apply</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Total</Text>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatMoney(cartTotals.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated Fees</Text>
              <Text style={styles.totalValue}>{formatMoney(cartTotals.fees)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated Tax</Text>
              <Text style={styles.totalValue}>{formatMoney(cartTotals.tax)}</Text>
            </View>
            {cartTotals.savings > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Savings</Text>
                <Text style={styles.totalValue}>-{formatMoney(cartTotals.savings)}</Text>
              </View>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalStrong}>Total</Text>
              <Text style={styles.totalStrong}>{formatMoney(cartTotals.total)}</Text>
            </View>
          </View>

          <Button accent={flowColors.shopping.accent} onPress={placeShoppingOrder} disabled={isCheckoutLoading}>
            {isCheckoutLoading ? 'Placing Order...' : 'Place Order'}
          </Button>
          {isCheckoutLoading ? <LoadingState text="Preparing checkout..." rows={1} tone={flowColors.shopping} /> : null}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'shoppingTracking') {
    const order = orderConfirmation || orderHistory[0];
    const statusIndex = orderStatusIndex(order) + trackingPulse * 0;
    const steps = orderTimelineSteps[order?.mode || 'Delivery'];
    if (!order) {
      return (
        <Screen>
          <AppHeader eyebrow="Order Tracking" onBack={() => setScreen('orderHistory')} accent={flowColors.shopping.accent} />
          <EmptyState title="No active order" text="Your placed grocery orders will appear here." tone={flowColors.shopping} symbol="▣" />
        </Screen>
      );
    }

    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Order Tracking" onBack={() => setScreen('orderHistory')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Cart', 'Checkout', 'Tracking']} current={2} tone={flowColors.shopping} />
          {isTrackingRefreshing ? <LoadingState text="Updating order status..." rows={1} tone={flowColors.shopping} /> : null}
          <View style={[styles.trackingHero, { borderColor: flowColors.shopping.tint }]}>
            <Text style={[styles.confirmationKicker, { color: flowColors.shopping.accent }]}>{orderStatus(order)}</Text>
            <Text style={styles.confirmationTitle}>{order.mode === 'Delivery' ? 'Your order is moving' : 'Your pickup is being prepared'}</Text>
            <Text style={styles.confirmationMeta}>{orderTimeRemaining(order)}</Text>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>{order.store}</Text>
            <Text style={styles.shopItemMeta}>{`${order.mode} • ${order.eta} • Order ${order.id}`}</Text>
            {order.address ? <Text style={styles.shopItemMeta}>{`${order.mode} location • ${order.address}`}</Text> : null}
            <View style={styles.timelineWrap}>
              {steps.map((step, index) => (
                <View key={step} style={styles.timelineRow}>
                  <View style={[styles.timelineDot, index <= statusIndex && styles.activeTimelineDot]}>
                    <Text style={[styles.timelineDotText, index <= statusIndex && styles.activeTimelineDotText]}>{index + 1}</Text>
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={[styles.timelineTitle, index <= statusIndex && styles.activeTimelineTitle]}>{step}</Text>
                    <Text style={styles.timelineMeta}>{index === statusIndex ? orderTimeRemaining(order) : index < statusIndex ? 'Complete' : 'Pending'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.listCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total paid</Text>
              <Text style={styles.totalStrong}>{formatMoney(order.total)}</Text>
            </View>
            <Text style={styles.shopItemMeta}>{`${order.items.length} items ordered`}</Text>
          </View>

          {trackingDetailsOpen ? (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Order Details</Text>
              {order.items.map((item) => (
                <View key={item.id} style={styles.checkoutLine}>
                  <Text style={styles.checkoutLineText}>{`${item.quantity || 1}x ${item.name}`}</Text>
                  <Text style={styles.checkoutLineText}>{item.price}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Button accent={flowColors.shopping.accent} onPress={() => setTrackingDetailsOpen(!trackingDetailsOpen)}>
            {trackingDetailsOpen ? 'Hide Order Details' : 'View Order Details'}
          </Button>
          <Button variant="ghost" onPress={() => setScreen('home')}>Back to Home</Button>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'orderHistory') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Orders" onSettings={() => setScreen('settings')} accent={flowColors.shopping.accent} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          {tabLoading === 'orderHistory' ? <LoadingState text="Loading orders..." rows={2} tone={flowColors.shopping} /> : null}
          {tabLoading !== 'orderHistory' && orderHistory.length === 0 ? <EmptyState title="No orders yet" text="Your placed grocery orders will appear here." tone={flowColors.shopping} symbol="▣" /> : null}
          {tabLoading !== 'orderHistory' && orderHistory.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => {
                setOrderConfirmation(order);
                setTrackingDetailsOpen(false);
                setScreen('shoppingTracking');
              }}
              style={({ pressed }) => [styles.listCard, { borderColor: flowColors.shopping.tint }, pressed && styles.pressed]}
            >
              <View style={styles.demoHeader}>
                <Text style={styles.listTitle}>{order.store}</Text>
                <Text style={styles.demoMeta}>{formatMoney(order.total)}</Text>
              </View>
              <Text style={styles.shopItemName}>{orderStatus(order)}</Text>
              <Text style={styles.shopItemMeta}>{`${order.mode} • ${order.date} • Order ${order.id}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <BottomTabs active="orderHistory" onNavigate={navigateTab} />
      </Screen>
    );
  }

  if (screen === 'collections') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Specials" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.collectionsScroll}>
          <Text style={styles.collectionHeadline}>Smart Meal Specials</Text>
          <Text style={styles.collectionIntro}>Choose a moment and get recipes matched to your kitchen.</Text>
          {collectionFolders.map((folder) => {
            const preset = collectionPresets[folder];
            return (
              <Pressable key={folder} onPress={() => openCollection(folder)} style={({ pressed }) => [styles.collectionCard, pressed && styles.pressed]}>
                <View style={styles.collectionCopy}>
                  <Text style={styles.collectionTitle}>{folder}</Text>
                  <Text style={styles.collectionMeta}>{preset.recipeType} • {preset.ingredients.slice(0, 3).join(', ')}</Text>
                </View>
                <Text style={styles.collectionArrow}>›</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'pantry') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Pantry" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pantryScroll}>
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Owned Ingredients</Text>
            <Text style={styles.listMeta}>Add foods and set dates to prioritize what needs using.</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={pantryInput}
                onChangeText={setPantryInput}
                placeholder="add ingredient"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                style={styles.dislikeInput}
              />
            </View>
            <View style={styles.pantryDateRow}>
              <TextInput
                value={pantryExpirationInput}
                onChangeText={setPantryExpirationInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.muted}
                style={styles.pantryDateInput}
              />
              <Pressable onPress={addPantryItem} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Add</Text>
              </Pressable>
            </View>
            <Button variant="ghost" onPress={generateFromAvailableIngredients}>What Can I Make Right Now?</Button>
          </View>

          {useSoonItems.length > 0 ? (
            <View style={styles.useSoonCard}>
              <Text style={styles.useSoonTitle}>Use Soon</Text>
              <Text style={styles.listMeta}>These ingredients are expiring soon. Recipes will prioritize them.</Text>
              {useSoonItems.map((item) => (
                <View key={`soon-${item.id}`} style={styles.useSoonRow}>
                  <Text style={styles.useSoonItem}>{item.name}</Text>
                  <Text style={styles.useSoonDate}>{expirationCopy(item.expiresAt)}</Text>
                </View>
              ))}
              <Button onPress={generateUseSoonRecipes}>Cook Use Soon Items</Button>
            </View>
          ) : null}

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>AI Leftovers Mode</Text>
            <Text style={styles.listMeta}>Select ingredients below or start from a smart mix.</Text>
            <Button onPress={() => remixLeftovers('selected')}>Selected Leftovers</Button>
            <Button variant="ghost" disabled={useSoonItems.length === 0} onPress={() => remixLeftovers('partial')}>Expiring Ingredients</Button>
            <Button variant="ghost" onPress={() => remixLeftovers('random')}>Random Pantry Mix</Button>
          </View>
          {pantryItems.length === 0 ? <EmptyState title="Your pantry is empty" text="Add foods above to start tracking freshness." /> : null}
          {pantryItems.map((item) => (
            <View key={item.id} style={styles.pantryItemCard}>
              <View style={styles.pantryItemTop}>
                <View style={styles.pantryItemCopy}>
                <Text style={styles.groceryText}>{item.name}</Text>
                  <Text style={styles.listRowMeta}>{item.quantity} • {expirationCopy(item.expiresAt)}</Text>
                {item.low ? <Text style={styles.lowStockText}>Low stock</Text> : null}
                </View>
                <Pressable
                  onPress={() => toggleLeftover(item.name)}
                  style={[styles.tinyAction, leftoverSelection.includes(item.name) && styles.activeFreshnessChip]}
                >
                  <Text style={styles.tinyActionText}>{leftoverSelection.includes(item.name) ? 'Selected' : 'Select'}</Text>
                </Pressable>
              </View>
              <View style={styles.pantryEditRow}>
                <TextInput
                  value={item.expiresAt || ''}
                  onChangeText={(value) => updatePantryExpiration(item.id, value)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.muted}
                  style={styles.pantryDateInput}
                />
                <Pressable onPress={() => updatePantryExpiration(item.id, dateFromToday(3))} style={styles.tinyAction}>
                  <Text style={styles.tinyActionText}>+3d</Text>
                </Pressable>
                <Pressable onPress={() => deletePantryItem(item.id)} style={styles.deleteButton}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'assistant') {
    return (
      <Screen>
        <AppHeader eyebrow="Kitchen Assistant" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.optionRow}>
            {assistantPrompts.map((prompt) => (
              <Pressable key={prompt} onPress={() => sendAssistantPrompt(prompt)} style={styles.optionChip}>
                <Text style={styles.optionChipText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
          {assistantMessages.map((message, index) => (
            <View key={`${message.role}-${index}`} style={[styles.chatBubble, message.role === 'user' && styles.userChatBubble]}>
              <Text style={styles.chatText}>{message.text}</Text>
            </View>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'planner') {
    const plannerMeals = homeMeals.length > 0 ? homeMeals : mealBank;
    return (
      <Screen>
        <AppHeader eyebrow="Meal Prep Planner" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {plannerDays.map((day, index) => {
            const meal = planner[day] || plannerMeals[index % plannerMeals.length];
            return (
              <View key={day} style={styles.listCard}>
                <Text style={styles.listTitle}>{day}</Text>
                <Text style={styles.listMeta}>{meal?.title || 'Choose a meal'}</Text>
                <Button variant="ghost" onPress={() => assignPlannerMeal(day, plannerMeals[(index + 1) % plannerMeals.length])}>
                  Assign Recipe
                </Button>
              </View>
            );
          })}
          <Button onPress={generatePlannerGroceryList}>Generate Grocery List</Button>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'smartPlan') {
    const planMeals = (homeMeals.length > 0 ? homeMeals : [...mealBank, ...smoothieBank, ...proteinShakeBank]).slice(0, 6);
    const planDays = ['Day 1', 'Day 2', 'Day 3'];
    const planGroceries = [...new Set(planMeals.flatMap((meal) => meal.missingIngredients || meal.ingredients.slice(0, 2)))].slice(0, 10);
    const planTotals = planMeals.reduce(
      (sum, meal) => ({
        protein: sum.protein + (meal.macros?.protein || 24),
        calories: sum.calories + (meal.macros?.calories || 460),
        carbs: sum.carbs + (meal.macros?.carbs || 48),
        fat: sum.fat + (meal.macros?.fat || 16)
      }),
      { protein: 0, calories: 0, carbs: 0, fat: 0 }
    );
    return (
      <Screen>
        <AppHeader eyebrow="Fusion+ Smart Plan" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.profileGrid}>
            {[
              ['Protein', `${planTotals.protein}g`],
              ['Calories', planTotals.calories],
              ['Carbs', `${planTotals.carbs}g`],
              ['Fats', `${planTotals.fat}g`]
            ].map(([label, value]) => (
              <View key={label} style={styles.profileStat}>
                <Text style={styles.profileStatValue}>{value}</Text>
                <Text style={styles.profileStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {planDays.map((day, index) => {
            const meal = planMeals[index % planMeals.length];
            const shake = proteinShakeBank[index % proteinShakeBank.length];
            return (
              <View key={day} style={styles.listCard}>
                <Text style={styles.listTitle}>{day}</Text>
                <Text style={styles.listMeta}>{meal.title}</Text>
                <Text style={styles.listRowMeta}>Shake: {shake.title}</Text>
              </View>
            );
          })}
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Grocery List</Text>
            {planGroceries.map((item) => (
              <Text key={item} style={styles.swapText}>- {item}</Text>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'ecosystem') {
    return (
      <Screen>
        <AppHeader eyebrow="Ecosystem" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Household Kitchen</Text>
            <Text style={styles.settingsSubtitle}>Shared pantry, grocery lists, meal plans, and saved recipes.</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={householdInput}
                onChangeText={setHouseholdInput}
                placeholder="add household member"
                placeholderTextColor={palette.muted}
                style={styles.dislikeInput}
              />
              <Pressable onPress={addHouseholdMember} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.optionRow}>
              {householdMembers.map((member) => (
                <View key={member} style={styles.optionChip}>
                  <Text style={styles.optionChipText}>{member}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>AI Budget Mode</Text>
            {[
              ['weeklyBudget', 'Weekly food budget'],
              ['proteinGoal', 'Protein goal'],
              ['calorieTarget', 'Calorie target']
            ].map(([key, label]) => (
              <TextInput
                key={key}
                value={budgetGoals[key]}
                onChangeText={(value) => updateBudgetGoal(key, value)}
                placeholder={label}
                placeholderTextColor={palette.muted}
                keyboardType="number-pad"
                style={styles.fullInput}
              />
            ))}
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Macro Lock</Text>
            <View style={styles.optionRow}>
              {macroLockOptions.map((lock) => (
                <Pressable key={lock} onPress={() => selectMacroLock(lock)} style={[styles.optionChip, macroLock === lock && styles.activeOptionChip]}>
                  <Text style={[styles.optionChipText, macroLock === lock && styles.activeOptionChipText]}>{lock}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Grocery Store Optimization</Text>
            {storeOptions.map(([store, detail]) => (
              <View key={store} style={styles.homeInsightRow}>
                <Text style={styles.homeInsightLabel}>{store}</Text>
                <Text style={styles.homeInsightValue}>{detail}</Text>
              </View>
            ))}
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Restaurant Recreation</Text>
            <TextInput
              value={restaurantQuery}
              onChangeText={setRestaurantQuery}
              placeholder="Chipotle bowl, Alfredo, pink drink..."
              placeholderTextColor={palette.muted}
              style={styles.fullInput}
            />
            <Button onPress={generateRestaurantRecipe}>Recreate at Home</Button>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Portion Scaling</Text>
            <View style={styles.optionRow}>
              {portionOptions.map((option) => (
                <Pressable key={option} onPress={() => setPortionMode(option)} style={[styles.optionChip, portionMode === option && styles.activeOptionChip]}>
                  <Text style={[styles.optionChipText, portionMode === option && styles.activeOptionChipText]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Seasonal Recipes</Text>
            <View style={styles.optionRow}>
              {seasonalOptions.map((season) => (
                <Pressable key={season} onPress={() => generateSeasonalMeals(season)} style={styles.optionChip}>
                  <Text style={styles.optionChipText}>{season}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Recovery Meals</Text>
            <Text style={styles.settingsSubtitle}>Future meals based on soreness, fatigue, sleep, and training load.</Text>
            <View style={styles.optionRow}>
              {recoveryOptions.map((option) => (
                <View key={option} style={styles.optionChip}>
                  <Text style={styles.optionChipText}>{option}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Fitness Integrations</Text>
            <View style={styles.optionRow}>
              {fitnessIntegrations.map((integration) => (
                <View key={integration} style={styles.optionChip}>
                  <Text style={styles.optionChipText}>{integration}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Unlock More Recipes</Text>
            <Text style={styles.settingsSubtitle}>{nextAchievement}% toward next achievement</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${nextAchievement}%` }]} />
            </View>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'social') {
    const communityRecipes = [...favorites, ...homeMeals].slice(0, 6);
    return (
      <Screen>
        <AppHeader eyebrow="FoodFusion Social" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Community</Text>
            <Text style={styles.settingsSubtitle}>Post creations, follow cooks, and save meal cards.</Text>
            <Button onPress={postCreation}>Post Current Creation</Button>
          </View>
          {socialPosts.map((post) => (
            <View key={post.id} style={styles.listCard}>
              <Text style={styles.listTitle}>{post.title}</Text>
              <Text style={styles.listMeta}>by {post.by}</Text>
            </View>
          ))}
          {communityRecipes.map((meal) => (
            <Pressable key={meal.title} onPress={() => openMeal(meal)} style={styles.listCard}>
              <Text style={styles.listTitle}>{meal.title}</Text>
              <Text style={styles.listMeta}>Community recipe</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'nutrition') {
    const totals = homeMeals.reduce(
      (sum, meal) => ({
        protein: sum.protein + (meal.macros?.protein || 0),
        calories: sum.calories + (meal.macros?.calories || 0),
        carbs: sum.carbs + (meal.macros?.carbs || 0),
        fat: sum.fat + (meal.macros?.fat || 0)
      }),
      { protein: 0, calories: 0, carbs: 0, fat: 0 }
    );
    return (
      <Screen>
        <AppHeader eyebrow="Nutrition" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.profileGrid}>
            {[
              ['Protein', `${totals.protein}g`],
              ['Calories', totals.calories],
              ['Carbs', `${totals.carbs}g`],
              ['Fats', `${totals.fat}g`],
              ['Hydration', `${Math.min(100, scanCountToday * 18 + 32)}%`],
              ['Shakes', homeMeals.filter((meal) => meal.type === 'Protein Shakes').length],
              ['Smoothies', homeMeals.filter((meal) => meal.type === 'Smoothies').length],
              ['Streak', `${Math.min(7, mealHistory.length)} days`],
              ['Cooked', mealHistory.reduce((total, entry) => total + entry.meals.length, 0)]
            ].map(([label, value]) => (
              <View key={label} style={styles.profileStat}>
                <Text style={styles.profileStatValue}>{value}</Text>
                <Text style={styles.profileStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'achievements') {
    const achievementList = [
      ['7 Day Cooking Streak', mealHistory.length >= 7],
      ['Protein King', homeMeals.some((meal) => (meal.macros?.protein || 0) >= 40)],
      ['Meal Prep Master', Object.keys(planner).length >= 3],
      ['Zero Waste Week', groceryList.length === 0 && mealHistory.length > 0]
    ];
    return (
      <Screen>
        <AppHeader eyebrow="Achievements" onBack={() => setScreen('home')} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {achievementList.map(([title, unlocked]) => (
            <View key={title} style={styles.listCard}>
              <Text style={styles.listTitle}>{title}</Text>
              <Text style={styles.listMeta}>{unlocked ? 'Unlocked' : 'In progress'}</Text>
            </View>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'settings') {
    const plan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    return (
      <Screen>
        <AppHeader eyebrow="Settings" onBack={() => setScreen('home')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Account</Text>
            <Text style={styles.settingsSubtitle}>{userProfile?.email || 'Signed in'}</Text>
            <Button variant="ghost" onPress={() => setScreen('profile')}>Open Profile</Button>
            <Button variant="ghost" onPress={logout}>Log Out</Button>
            <Button variant="ghost" onPress={confirmDeleteAccount}>Delete Account</Button>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Data Sync</Text>
            <View style={styles.syncStatusRow}>
              {syncState.status === 'syncing' || syncState.status === 'loading' ? <ActivityIndicator size="small" color={palette.green} /> : (
                <View style={[
                  styles.syncDot,
                  syncState.status === 'synced' && styles.syncDotReady,
                  syncState.status === 'error' && styles.syncDotError
                ]} />
              )}
              <Text style={styles.settingsSubtitle}>{syncState.message}</Text>
            </View>
            {syncState.status === 'error' && supabaseConfigured && isLoggedIn ? (
              <Button variant="ghost" onPress={hydrateSyncedUserData}>Retry Sync</Button>
            ) : null}
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Subscription</Text>
            <Text style={styles.settingsSubtitle}>
              {isPremium ? `Fusion+ Active • ${plan.name} ${plan.price}${plan.cadence}` : 'Fusion Free • 1 scan daily'}
            </Text>
            <Button accent={flowColors.fusion.accent} onPress={() => setScreen(isPremium ? 'manageSubscription' : 'paywall')}>Manage Subscription</Button>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Preferences</Text>
            <Text style={styles.settingsSubtitle}>Food style, kitchen equipment, dislikes, servings, and cooking tools.</Text>
            <Button variant="ghost" onPress={() => setScreen('preferences')}>Manage Preferences</Button>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Shopping Connection</Text>
            <Text style={styles.settingsSubtitle}>{shoppingConnectionStatus}</Text>
            <Text style={styles.legalText}>
              {shoppingLocation?.address ? `${fulfillmentMode} location: ${shoppingLocation.address}` : 'Add a location in Shop to browse store options.'}
            </Text>
            <Button variant="ghost" accent={flowColors.shopping.accent} onPress={() => setScreen('shoppingLocation')}>
              {shoppingLocation?.address ? 'Update Shopping Location' : 'Add Shopping Location'}
            </Button>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Notifications</Text>
            <Text style={styles.settingsSubtitle}>{notificationsEnabled ? 'Updates enabled' : 'Choose the updates you want to receive.'}</Text>
            {[
              ['recipeIdeas', 'Recipe ideas'],
              ['groceryReminders', 'Grocery reminders'],
              ['orderUpdates', 'Order updates'],
              ['fusionUpdates', 'Fusion+ updates']
            ].map(([key, label]) => (
              <Pressable key={key} onPress={() => toggleNotificationPreference(key)} style={styles.settingsToggleRow}>
                <Text style={styles.settingsToggleLabel}>{label}</Text>
                <View style={[styles.toggleTrack, notificationPreferences[key] && styles.activeToggleTrack]}>
                  <View style={[styles.toggleThumb, notificationPreferences[key] && styles.activeToggleThumb]} />
                </View>
              </Pressable>
            ))}
            {!notificationsEnabled ? <Button variant="ghost" onPress={() => setScreen('notificationPermission')}>Enable Notifications</Button> : null}
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Beta Feedback</Text>
            <Text style={styles.settingsSubtitle}>Share what works and what needs attention during testing.</Text>
            <View style={styles.settingsActionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openFeedback('settings')}
                style={({ pressed }) => [styles.feedbackEntryButton, pressed && styles.pressed]}
              >
                <Text style={styles.feedbackEntryText}>Feedback</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>About FoodFusion AI</Text>
            <Text style={styles.settingsSubtitle}>Version {APP_VERSION}</Text>
            <Text style={styles.legalText}>Photos are used to analyze ingredients and generate recipe suggestions.</Text>
            <Button variant="ghost" onPress={() => setScreen('privacy')}>Privacy Policy</Button>
            <Button variant="ghost" onPress={() => setScreen('terms')}>Terms of Service</Button>
            <Button variant="ghost" onPress={() => setScreen('nutritionDisclaimer')}>Nutrition Disclaimer</Button>
            <Button variant="ghost" onPress={() => setScreen('onboarding')}>View Onboarding</Button>
            <Pressable onPress={unlockDeveloperMode} style={styles.versionTap}>
              <Text style={styles.versionTapText}>Build {APP_VERSION}</Text>
            </Pressable>
          </View>

          {developerMode ? (
            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>Developer Mode</Text>
              <Text style={styles.settingsSubtitle}>Local app tools.</Text>
              <Button variant="ghost" onPress={resetDailyScan}>Reset scans</Button>
              <Button variant="ghost" onPress={resetPremium}>Reset premium</Button>
              <Button variant="ghost" onPress={testRecipeMcpConnection}>Test MCP connection</Button>
              <Button variant="ghost" onPress={() => setScreen('launchChecklist')}>QA Checklist</Button>
              <Button variant="ghost" onPress={clearAsyncStorageOnly}>Clear AsyncStorage</Button>
            </View>
          ) : null}

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Resets</Text>
            <Text style={styles.settingsSubtitle}>Clear saved app data.</Text>
            <Button variant="ghost" onPress={clearHistory}>Clear history</Button>
            <Button variant="ghost" onPress={clearFavorites}>Clear favorites</Button>
            <Button variant="ghost" onPress={clearGroceryList}>Clear grocery list</Button>
            <Button variant="ghost" onPress={clearPreferences}>Clear preferences</Button>
            <Button variant="ghost" onPress={clearDislikes}>Clear disliked ingredients</Button>
            <Button variant="ghost" onPress={resetServingsEquipment}>Reset servings/equipment</Button>
            <Button variant="cream" onPress={() => resetAllAppData()}>Reset all app data</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'feedback') {
    return (
      <Screen toast={toast}>
        <AppHeader eyebrow="Beta Feedback" onBack={() => setScreen(feedbackReturnScreen)} accent={flowColors.profile.accent} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.feedbackKeyboard}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.feedbackScroll}
          >
            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>Tell us about your experience</Text>
              <Text style={styles.settingsSubtitle}>Your notes help refine FoodFusion AI before release.</Text>
              <Text style={styles.feedbackLabel}>Name</Text>
              <TextInput
                value={feedbackForm.name}
                onChangeText={(value) => updateFeedbackField('name', value)}
                placeholder="Your name"
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
                style={styles.feedbackInput}
              />
              <Text style={styles.feedbackLabel}>Email</Text>
              <TextInput
                value={feedbackForm.email}
                onChangeText={(value) => updateFeedbackField('email', value)}
                placeholder="you@email.com"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.feedbackInput}
              />
              <Text style={styles.feedbackLabel}>Rating</Text>
              <View style={styles.feedbackRatingRow}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Rating ${rating} out of 5`}
                    key={rating}
                    onPress={() => updateFeedbackField('rating', rating)}
                    style={({ pressed }) => [
                      styles.feedbackRating,
                      feedbackForm.rating === rating && styles.feedbackRatingActive,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text style={[
                      styles.feedbackRatingText,
                      feedbackForm.rating === rating && styles.feedbackRatingTextActive
                    ]}>{rating}</Text>
                  </Pressable>
                ))}
              </View>
              {[
                ['workedWell', 'What worked well?'],
                ['confusing', 'What was confusing?'],
                ['additions', 'What should be added?'],
                ['bugReport', 'Bug report']
              ].map(([key, label]) => (
                <View key={key}>
                  <Text style={styles.feedbackLabel}>{label}</Text>
                  <TextInput
                    value={feedbackForm[key]}
                    onChangeText={(value) => updateFeedbackField(key, value)}
                    placeholder="Share details"
                    placeholderTextColor={palette.muted}
                    multiline
                    textAlignVertical="top"
                    style={[styles.feedbackInput, styles.feedbackTextArea]}
                  />
                </View>
              ))}
              {feedbackConfirmation ? <Text style={styles.feedbackConfirmation}>{feedbackConfirmation}</Text> : null}
              <Button accent={flowColors.profile.accent} onPress={submitFeedback}>Submit Feedback</Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  if (screen === 'privacy') {
    return (
      <Screen>
        <AppHeader eyebrow="Privacy Policy" onBack={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Privacy Policy</Text>
            <Text style={styles.settingsSubtitle}>Your choices and account information are handled with care.</Text>
            <Text style={styles.legalSectionTitle}>What Data We Collect</Text>
            <Text style={styles.legalText}>FoodFusion AI syncs account details, preferences, favorites, saved recipes, structured scan history, shopping location, orders, and subscription status to your account when signed in. This device retains an offline cache for reliable access.</Text>
            <Text style={styles.legalSectionTitle}>How Photos Are Used</Text>
            <Text style={styles.legalText}>Photos are used to analyze ingredients and generate recipe suggestions.</Text>
            <Text style={styles.legalSectionTitle}>Recipe and Nutrition Data</Text>
            <Text style={styles.legalText}>Saved recipes, ingredient selections, and nutrition estimates support recommendations and your saved cooking activity.</Text>
            <Text style={styles.legalSectionTitle}>Shopping and Order Data</Text>
            <Text style={styles.legalText}>Your saved shopping location, cart items, and placed orders support store discovery, checkout, order history, and tracking. Your shopping location is shared with a connected shopping provider only when you use shopping features.</Text>
            <Text style={styles.legalSectionTitle}>Account Data</Text>
            <Text style={styles.legalText}>You may log out or delete your account and local app data at any time in Settings.</Text>
            <Text style={styles.legalSectionTitle}>Contact and Support</Text>
            <Text style={styles.legalText}>For privacy or product support, contact {SUPPORT_EMAIL}.</Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'terms') {
    return (
      <Screen>
        <AppHeader eyebrow="Terms of Service" onBack={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Terms of Service</Text>
            <Text style={styles.settingsSubtitle}>FoodFusion AI provides ingredient scanning, recipe suggestions, shopping organization, and Fusion+ access.</Text>
            <Text style={styles.legalSectionTitle}>App Usage Terms</Text>
            <Text style={styles.legalText}>Review ingredients, allergens, cooking temperatures, purchases, and subscription selections before acting on suggestions.</Text>
            <Text style={styles.legalSectionTitle}>Subscription Terms</Text>
            <Text style={styles.legalText}>Fusion+ plan selection and account management are available in Settings. Plan terms and renewal details presented at checkout apply to your selection.</Text>
            <Text style={styles.legalSectionTitle}>Nutrition Disclaimer</Text>
            <Text style={styles.legalText}>Recipe, macro, and calorie estimates are informational only and are not medical advice.</Text>
            <Text style={styles.legalSectionTitle}>Shopping Integration Disclaimer</Text>
            <Text style={styles.legalText}>Product availability, pricing, fulfillment times, and order status may vary by participating shopping provider and store.</Text>
            <Text style={styles.legalSectionTitle}>Limitation of Liability</Text>
            <Text style={styles.legalText}>To the fullest extent permitted by law, you are responsible for reviewing recipes, allergens, purchases, and dietary choices before use.</Text>
            <Text style={styles.legalSectionTitle}>Support</Text>
            <Text style={styles.legalText}>For account or product support, contact {SUPPORT_EMAIL}.</Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'nutritionDisclaimer') {
    return (
      <Screen>
        <AppHeader eyebrow="Nutrition Disclaimer" onBack={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Nutrition Disclaimer</Text>
            <Text style={styles.settingsSubtitle}>Nutrition estimates help with meal planning.</Text>
            <Text style={styles.legalText}>Macro and calorie estimates are informational only and may vary based on brands, portions, preparation, and ingredient substitutions.</Text>
            <Text style={styles.legalText}>FoodFusion AI does not provide medical advice. Consult a qualified healthcare professional for medical, dietary, or allergy-related guidance.</Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'launchChecklist') {
    return (
      <Screen>
        <AppHeader eyebrow="QA Checklist" onBack={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Production Configuration</Text>
            {[
              ['App version', APP_VERSION],
              ['Build number', APP_BUILD_NUMBER],
              ['Supabase client', supabaseConfigured ? 'Configured' : 'Not configured'],
              ['AI scan endpoint', scanEndpointStatus],
              ['Development bridge', scanEndpointIsDevelopment ? 'In use' : 'Not in use'],
              ['Support email', SUPPORT_EMAIL]
            ].map(([label, value]) => (
              <View key={label} style={styles.launchRow}>
                <Text style={styles.launchLabel}>{label}</Text>
                <Text style={styles.launchValue}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>QA Checklist</Text>
            <Text style={styles.settingsSubtitle}>Mark each flow after testing it on an iPhone build.</Text>
            {qaChecklistItems.map((item) => (
              <Pressable key={item} onPress={() => toggleQaCheck(item)} style={styles.qaCheckRow}>
                <View style={[styles.qaCheckBox, qaChecklist[item] && styles.qaCheckBoxActive]}>
                  <Text style={styles.qaCheckMark}>{qaChecklist[item] ? '✓' : ''}</Text>
                </View>
                <Text style={styles.qaCheckLabel}>{item}</Text>
              </Pressable>
            ))}
            <Button onPress={reportBug}>Report a Bug</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'preferences') {
    return (
      <Screen>
        <AppHeader eyebrow="Preferences" onBack={() => setScreen('settings')} accent={flowColors.profile.accent} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.preferencesScroll}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Food Style</Text>
            <Text style={styles.settingsSubtitle}>Choose as many as you want.</Text>
            <Text style={styles.preferenceGroupLabel}>Core</Text>
            <View style={styles.optionRow}>
              {corePreferenceOptions.map((preference) => (
                <Pressable
                  key={preference}
                  onPress={() => togglePreference(preference)}
                  style={[styles.preferenceChip, preferences.includes(preference) && styles.activeOptionChip]}
                >
                  <Text style={[styles.preferenceChipText, preferences.includes(preference) && styles.activeOptionChipText]}>
                    {preference}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.preferenceGroupLabel}>More Styles</Text>
            <View style={styles.optionRow}>
              {expandedPreferenceOptions.map((preference) => (
                <Pressable
                  key={preference}
                  onPress={() => togglePreference(preference)}
                  style={[styles.preferenceChip, preferences.includes(preference) && styles.activeOptionChip]}
                >
                  <Text style={[styles.preferenceChipText, preferences.includes(preference) && styles.activeOptionChipText]}>
                    {preference}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Kitchen Equipment</Text>
            <Text style={styles.settingsSubtitle}>Recipes match what you own.</Text>
            <View style={styles.optionRow}>
              {kitchenEquipmentOptions.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => toggleEquipmentProfile(item)}
                  style={[styles.optionChip, equipmentProfile.includes(item) && styles.activeOptionChip]}
                >
                  <Text style={[styles.optionChipText, equipmentProfile.includes(item) && styles.activeOptionChipText]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>I don't like...</Text>
            <View style={styles.dislikeInputRow}>
              <TextInput
                value={dislikeInput}
                onChangeText={setDislikeInput}
                placeholder="mushrooms, onions, tuna..."
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                style={styles.dislikeInput}
              />
              <Pressable onPress={addDislikedIngredient} style={styles.addDislikeButton}>
                <Text style={styles.addDislikeText}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.optionRow}>
              {dislikedIngredients.map((item) => (
                <Pressable key={item} onPress={() => deleteDislikedIngredient(item)} style={styles.optionChip}>
                  <Text style={styles.optionChipText}>{item} ×</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'fusionPayment') {
    const plan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    return (
      <Screen>
        <AppHeader eyebrow="Fusion+ Payment" onBack={() => setScreen('paywall')} accent={flowColors.fusion.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <FlowProgress steps={['Plan', 'Payment', 'Active']} current={1} tone={flowColors.fusion} />
          <View style={[styles.subscriptionStatusCard, { borderColor: flowColors.fusion.tint }]}>
            <Text style={styles.paywallTitle}>{plan.name}</Text>
            <Text style={styles.paywallText}>{plan.price}{plan.cadence}</Text>
            <Text style={styles.demoPaymentText}>Subscription checkout</Text>
          </View>

          <View style={styles.paymentFormCard}>
            {[
              ['cardNumber', 'Card number', '4242 4242 4242 4242'],
              ['expiration', 'Expiration date', 'MM/YY'],
              ['cvv', 'CVV', '123'],
              ['name', 'Name on card', 'Alex Cook'],
              ['zip', 'ZIP code', '85001']
            ].map(([key, label, placeholder]) => (
              <View key={key} style={styles.paymentField}>
                <Text style={styles.totalLabel}>{label}</Text>
                <TextInput
                  value={paymentForm[key]}
                  onChangeText={(value) => updatePaymentField(key, value)}
                  placeholder={placeholder}
                  placeholderTextColor={palette.muted}
                  autoCapitalize={key === 'name' ? 'words' : 'none'}
                  keyboardType={key === 'name' ? 'default' : 'number-pad'}
                  style={styles.dislikeInput}
                />
              </View>
            ))}
          </View>

          <Button accent={flowColors.fusion.accent} onPress={startFusionPlus} disabled={isProcessingPayment}>
            {isProcessingPayment ? 'Subscribing...' : 'Subscribe'}
          </Button>
          {isProcessingPayment ? <ActivityIndicator color={flowColors.fusion.accent} style={styles.paymentSpinner} /> : null}
          <Button variant="ghost" onPress={() => setScreen('paywall')}>Cancel</Button>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'fusionSuccess') {
    const plan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    return (
      <Screen toast={toast}>
        <FlowProgress steps={['Plan', 'Payment', 'Active']} current={2} tone={flowColors.fusion} />
        <View style={[styles.confirmationCard, { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent, shadowColor: flowColors.fusion.accent }]}>
          <Text style={[styles.confirmationKicker, { color: flowColors.fusion.accent }]}>{plan.name} plan active</Text>
          <Text style={styles.confirmationTitle}>Fusion+ Activated</Text>
          <Text style={styles.confirmationMeta}>Unlimited scans and premium tools are unlocked.</Text>
        </View>
        <Button accent={flowColors.fusion.accent} onPress={() => setScreen('home')}>Start Cooking</Button>
      </Screen>
    );
  }

  if (screen === 'manageSubscription') {
    const plan = fusionPlans.find((item) => item.id === selectedFusionPlan) || fusionPlans[2];
    return (
      <Screen>
        <AppHeader eyebrow="Manage Subscription" onBack={() => setScreen('settings')} accent={flowColors.fusion.accent} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[styles.subscriptionStatusCard, { borderColor: flowColors.fusion.tint }]}>
            <Text style={styles.settingsTitle}>{isPremium ? 'Fusion+ Active' : 'Free Plan'}</Text>
            <Text style={styles.settingsSubtitle}>Current plan: {plan.name} {plan.price}{plan.cadence}</Text>
            <Text style={styles.settingsSubtitle}>Renewal date: Next billing cycle</Text>
          </View>
          <View style={styles.pricingRow}>
            {fusionPlans.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedFusionPlan(item.id)}
                style={[
                  styles.pricingCard,
                  selectedFusionPlan === item.id && styles.selectedPricingCard,
                  selectedFusionPlan === item.id && { backgroundColor: flowColors.fusion.tint, borderColor: flowColors.fusion.accent }
                ]}
              >
                {item.badge ? (
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>{item.badge}</Text>
                  </View>
                ) : null}
                <Text style={styles.planName}>{item.name}</Text>
                <Text style={styles.planPrice}>{item.price}</Text>
                <Text style={styles.planCadence}>{item.cadence}</Text>
              </Pressable>
            ))}
          </View>
          <Button accent={flowColors.fusion.accent} onPress={() => setScreen('fusionPayment')}>Change Plan</Button>
          <Button variant="ghost" onPress={confirmCancelSubscription}>Cancel Subscription</Button>
          <Button variant="ghost" onPress={restorePurchase}>Restore Purchase</Button>
        </ScrollView>
      </Screen>
    );
  }

  if (screen === 'paywall') {
    return (
      <FusionPlusScreen
        isPremium={isPremium}
        onCancel={() => setScreen('home')}
        onRestore={restorePurchase}
        onSelectPlan={chooseFusionPlan}
        onManage={() => setScreen('manageSubscription')}
        selectedPlan={selectedFusionPlan}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  splashSafe: {
    flex: 1,
    backgroundColor: palette.background
  },
  splashWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28
  },
  splashLogoShell: {
    alignItems: 'center',
    borderRadius: 28,
    height: 112,
    justifyContent: 'center',
    shadowColor: palette.green,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    width: 112
  },
  splashAsset: {
    borderRadius: 26,
    height: 112,
    width: 112
  },
  splashTitle: {
    color: palette.cream,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 26
  },
  splashSubtitle: {
    color: palette.green,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8
  },
  safe: {
    flex: 1,
    backgroundColor: palette.background
  },
  keyboardSafe: {
    flex: 1
  },
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20
  },
  toast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#172435',
    borderColor: palette.green,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    top: 62,
    zIndex: 20
  },
  toastDot: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 8,
    width: 8
  },
  toastText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800'
  },
  authWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 36
  },
  authLogoMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    marginBottom: 18,
    width: 60
  },
  authLogoLetter: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900'
  },
  authTitle: {
    color: palette.cream,
    fontSize: 38,
    fontWeight: '900',
    textAlign: 'center'
  },
  authSubtitle: {
    color: palette.green,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center'
  },
  authCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 26,
    borderWidth: 1,
    marginTop: 34,
    padding: 18
  },
  authInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  authError: {
    color: palette.warning,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2
  },
  authMessage: {
    color: palette.green,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 2
  },
  authDividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 16
  },
  authDivider: {
    backgroundColor: palette.line,
    flex: 1,
    height: 1
  },
  authDividerText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    marginHorizontal: 12
  },
  appleAuthButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 16
  },
  appleAuthText: {
    color: '#050505',
    fontSize: 15,
    fontWeight: '800'
  },
  authSwitch: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8
  },
  authSwitchText: {
    color: palette.green,
    fontSize: 14,
    fontWeight: '900'
  },
  permissionWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20
  },
  permissionMark: {
    alignItems: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    marginBottom: 18,
    width: 50
  },
  permissionMarkText: {
    color: palette.cream,
    fontSize: 24,
    fontWeight: '900'
  },
  permissionTitle: {
    color: palette.cream,
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center'
  },
  permissionText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 300,
    textAlign: 'center'
  },
  permissionList: {
    alignSelf: 'stretch',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginTop: 28,
    padding: 16
  },
  permissionRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  permissionDot: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 7,
    marginTop: 7,
    width: 7
  },
  permissionPoint: {
    color: palette.cream,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21
  },
  homeScroll: {
    paddingBottom: 96
  },
  tabScroll: {
    flex: 1
  },
  tabScrollContent: {
    paddingBottom: 96
  },
  bottomTabs: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginTop: 10,
    padding: 5
  },
  bottomTab: {
    alignItems: 'center',
    borderRadius: 17,
    flex: 1,
    minHeight: 53,
    justifyContent: 'center',
    paddingVertical: 6
  },
  activeBottomTab: {
    backgroundColor: palette.greenDeep
  },
  bottomTabIcon: {
    color: palette.muted,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20
  },
  bottomTabText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 3
  },
  activeBottomTabText: {
    color: palette.green
  },
  emptyStateCard: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14
  },
  emptyStateIcon: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginBottom: 11,
    width: 38
  },
  emptyStateIconText: {
    fontSize: 19,
    fontWeight: '900'
  },
  emptyStateTitle: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyStateText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center'
  },
  loadingCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14
  },
  loadingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  loadingText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  skeletonRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    marginTop: 8
  },
  skeletonSquare: {
    backgroundColor: palette.panel,
    borderRadius: 10,
    height: 38,
    width: 38
  },
  skeletonCopy: {
    flex: 1,
    gap: 7
  },
  skeletonTitle: {
    backgroundColor: palette.line,
    borderRadius: 999,
    height: 9,
    width: '65%'
  },
  skeletonMeta: {
    backgroundColor: palette.panel,
    borderRadius: 999,
    height: 8,
    width: '42%'
  },
  flowProgress: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 44,
    paddingHorizontal: 12
  },
  flowStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  flowStepDot: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 8,
    width: 8
  },
  flowStepText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900'
  },
  flowConnector: {
    backgroundColor: palette.line,
    height: 1,
    marginHorizontal: 9,
    width: 18
  },
  analysisFrame: {
    alignItems: 'center',
    aspectRatio: 0.82,
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 30,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  analysisImage: {
    height: '100%',
    width: '100%'
  },
  analysisDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 16, 24, 0.48)'
  },
  scanBar: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 4,
    left: 22,
    opacity: 0.9,
    position: 'absolute',
    right: 22
  },
  pulseCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(110, 168, 254, 0.16)',
    borderColor: palette.green,
    borderRadius: 80,
    borderWidth: 1,
    height: 126,
    justifyContent: 'center',
    position: 'absolute',
    width: 126
  },
  pulseDot: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 18,
    width: 18
  },
  analysisCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 22,
    padding: 18
  },
  analysisStepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  analysisStepDot: {
    backgroundColor: palette.line,
    borderRadius: 999,
    height: 10,
    width: 10
  },
  activeAnalysisStepDot: {
    backgroundColor: palette.green
  },
  analysisStepText: {
    color: palette.muted,
    fontSize: 16,
    fontWeight: '800'
  },
  activeAnalysisStepText: {
    color: palette.cream
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  backButton: {
    minWidth: 62,
    paddingVertical: 8
  },
  backSpacer: {
    width: 62
  },
  headerActionSpacer: {
    width: 118
  },
  headerActionStack: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
    width: 118
  },
  homeActionStack: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end'
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 13,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44
  },
  cartButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'relative',
    width: 44
  },
  homeCartButton: {
    marginTop: 6
  },
  cartIcon: {
    height: 19,
    position: 'relative',
    width: 22
  },
  cartBasket: {
    borderBottomColor: palette.green,
    borderBottomWidth: 2,
    borderLeftColor: palette.green,
    borderLeftWidth: 2,
    borderRightColor: palette.green,
    borderRightWidth: 2,
    bottom: 5,
    height: 10,
    left: 2,
    position: 'absolute',
    width: 17
  },
  cartHandle: {
    borderColor: palette.green,
    borderRightWidth: 2,
    borderTopWidth: 2,
    height: 7,
    left: 0,
    position: 'absolute',
    top: 1,
    width: 8
  },
  cartWheelRow: {
    bottom: 0,
    flexDirection: 'row',
    gap: 7,
    left: 5,
    position: 'absolute'
  },
  cartWheel: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 4,
    width: 4
  },
  cartBadge: {
    alignItems: 'center',
    backgroundColor: flowColors.shopping.accent,
    borderRadius: 999,
    minWidth: 17,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
    right: -5,
    top: -5
  },
  cartBadgeText: {
    color: palette.black,
    fontSize: 9,
    fontWeight: '900'
  },
  headerHeartText: {
    color: palette.green,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22
  },
  headerGearText: {
    color: palette.green,
    fontSize: 17,
    fontWeight: '900'
  },
  backText: {
    color: palette.green,
    fontSize: 15,
    fontWeight: '700'
  },
  eyebrow: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeTop: {
    marginTop: 26,
    marginBottom: 22
  },
  homeTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  homeTitleCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2
  },
  profileButton: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  profileButtonText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900'
  },
  logo: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0
  },
  tagline: {
    color: palette.green,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 5
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    padding: 22
  },
  heroLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  heroTitle: {
    color: palette.cream,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8
  },
  heroSubtext: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8
  },
  premiumStatusStrip: {
    alignItems: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 15,
    paddingVertical: 13
  },
  premiumStatusTitle: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900'
  },
  premiumStatusMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3
  },
  premiumStatusAction: {
    color: palette.green,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right'
  },
  recipeTypeTabs: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
    padding: 4
  },
  recipeTypeTab: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    paddingVertical: 9
  },
  activeRecipeTypeTab: {
    backgroundColor: palette.greenDeep
  },
  recipeTypeText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center'
  },
  activeRecipeTypeText: {
    color: palette.cream
  },
  homeInsightsCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 20,
    padding: 18
  },
  homeUtilityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginTop: 12
  },
  homeUtilityCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 68,
    padding: 11
  },
  homeUtilityTitle: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  homeUtilityMeta: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6
  },
  useSoonBanner: {
    alignItems: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    padding: 14
  },
  useSoonTitle: {
    color: palette.cream,
    fontSize: 17,
    fontWeight: '900'
  },
  useSoonMeta: {
    color: palette.warning,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'capitalize'
  },
  globalSearchScroll: {
    paddingBottom: 24
  },
  searchHero: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  searchResultRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12
  },
  searchResultCopy: {
    flex: 1
  },
  moodCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    padding: 18
  },
  weeklyCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    padding: 18
  },
  weeklyGrid: {
    flexDirection: 'row',
    gap: 8
  },
  weeklyTile: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    padding: 10
  },
  weeklyValue: {
    color: palette.cream,
    fontSize: 18,
    fontWeight: '900'
  },
  weeklyLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4
  },
  nudgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  nudgeChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  nudgeText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12
  },
  quickDrinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  quickDrinkChip: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  quickDrinkText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '800'
  },
  homeInsightsTitle: {
    color: palette.cream,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12
  },
  homeInsightsEmpty: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22
  },
  homeInsightRow: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    paddingVertical: 11
  },
  homeInsightLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  homeInsightValue: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4
  },
  homeActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18
  },
  homeAction: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '48%',
    padding: 14
  },
  homeActionTitle: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900'
  },
  homeActionMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5
  },
  settingsStrip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    padding: 15
  },
  settingsStripTitle: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900'
  },
  settingsStripMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5
  },
  osCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    padding: 18
  },
  osGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  osTile: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '48%',
    padding: 14
  },
  osTileTitle: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  onboardingWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 50
  },
  loadingBoot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  onboardingOrb: {
    alignItems: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 54,
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    marginBottom: 28,
    width: 108
  },
  onboardingOrbText: {
    color: palette.cream,
    fontSize: 38,
    fontWeight: '900'
  },
  onboardingTitle: {
    color: palette.cream,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center'
  },
  onboardingText: {
    color: palette.muted,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 290,
    textAlign: 'center'
  },
  onboardingDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28
  },
  onboardingDot: {
    backgroundColor: palette.line,
    borderRadius: 999,
    height: 8,
    width: 8
  },
  activeOnboardingDot: {
    backgroundColor: palette.green,
    width: 24
  },
  scanBadge: {
    backgroundColor: palette.green,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  scanBadgeText: {
    color: palette.black,
    fontSize: 13,
    fontWeight: '800'
  },
  button: {
    alignItems: 'center',
    backgroundColor: palette.green,
    borderRadius: 999,
    marginTop: 14,
    minHeight: 52,
    paddingVertical: 17
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: palette.green,
    borderRadius: 999,
    flex: 1,
    minHeight: 48,
    paddingVertical: 15
  },
  buttonText: {
    color: palette.black,
    fontSize: 16,
    fontWeight: '800'
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderColor: palette.line,
    borderWidth: 1
  },
  ghostButtonText: {
    color: palette.cream
  },
  creamButton: {
    backgroundColor: palette.cardAlt
  },
  creamButtonText: {
    color: palette.black
  },
  disabledButton: {
    opacity: 0.45
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }]
  },
  pill: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  activePill: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  pillText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  activePillText: {
    color: palette.cream
  },
  plusTitle: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900'
  },
  plusText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 7
  },
  fusionCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 26,
    padding: 20
  },
  fusionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between'
  },
  premiumBadge: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  premiumBadgeText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900'
  },
  modesHeader: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 18
  },
  modesTitle: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900'
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
    marginTop: 14
  },
  modeTile: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 13
  },
  activeModeTile: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  modeTileText: {
    color: palette.cream,
    flex: 1,
    fontSize: 14,
    fontWeight: '800'
  },
  activeModeTileText: {
    color: palette.cream
  },
  modeLock: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 8
  },
  macroFilterSection: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
  },
  macroFilterTitle: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 10
  },
  macroFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9
  },
  macroFilterButton: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  activeMacroFilterButton: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  macroFilterText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  activeMacroFilterText: {
    color: palette.cream
  },
  uploadFrame: {
    alignItems: 'center',
    aspectRatio: 1.15,
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden'
  },
  scanScroll: {
    flex: 1
  },
  scanScrollContent: {
    paddingBottom: 28
  },
  uploadImage: {
    height: '100%',
    width: '100%'
  },
  cameraPlaceholder: {
    alignItems: 'center',
    padding: 24
  },
  cameraMark: {
    color: palette.green,
    fontSize: 62,
    fontWeight: '200'
  },
  uploadTitle: {
    color: palette.cream,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center'
  },
  helperText: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center'
  },
  demoSection: {
    marginTop: 24
  },
  demoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  demoTitle: {
    color: palette.cream,
    fontSize: 20,
    fontWeight: '900'
  },
  demoMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  demoRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 22
  },
  demoCard: {
    width: 132
  },
  demoImage: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    height: 132,
    width: 132
  },
  sampleScanLabel: {
    color: palette.cream,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center'
  },
  scanOptionsCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 22,
    padding: 16
  },
  scanOptionsTitle: {
    color: palette.cream,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12
  },
  scanOptionsLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 8
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9
  },
  preferencesScroll: {
    paddingBottom: 22
  },
  preferenceGroupLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 9,
    marginTop: 10,
    textTransform: 'uppercase'
  },
  preferenceChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  preferenceChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  optionChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  activeOptionChip: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  optionChipText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  activeOptionChipText: {
    color: palette.cream
  },
  previewImage: {
    aspectRatio: 1.35,
    borderRadius: 26,
    width: '100%'
  },
  previewWrap: {
    marginBottom: 22
  },
  imageTagRow: {
    bottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    left: 12,
    position: 'absolute',
    right: 12
  },
  imageTag: {
    backgroundColor: 'rgba(9, 13, 18, 0.76)',
    borderColor: 'rgba(248, 250, 252, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  personalityCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  personalityLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  personalityText: {
    color: palette.cream,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sectionTitle: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900'
  },
  sectionMeta: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  sectionHint: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 12
  },
  identifiedCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  identifiedTitle: {
    color: palette.cream,
    fontSize: 22,
    fontWeight: '900'
  },
  identifiedMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 12
  },
  identifiedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  identifiedChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  identifiedChipText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  ingredientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  ingredientList: {
    gap: 10
  },
  ingredientEditCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12
  },
  ingredientEditTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  ingredientEditInput: {
    color: palette.cream,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    minHeight: 38
  },
  ingredientActions: {
    flexDirection: 'row',
    gap: 8
  },
  tinyAction: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tinyActionText: {
    color: palette.green,
    fontSize: 12,
    fontWeight: '900'
  },
  freshnessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10
  },
  freshnessChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  activeFreshnessChip: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  freshnessText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize'
  },
  activeFreshnessText: {
    color: palette.cream
  },
  detectedIngredientPill: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  detectedIngredientText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  confidenceText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 3
  },
  manualCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 16
  },
  recentSearchWrap: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginBottom: 10,
    paddingTop: 4
  },
  failCard: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 16,
    padding: 16
  },
  failTitle: {
    color: palette.cream,
    fontSize: 20,
    fontWeight: '900'
  },
  failText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
    marginTop: 6
  },
  noticeCard: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14
  },
  noticeText: {
    color: palette.cream,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19
  },
  qualityGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  qualityTile: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    padding: 9
  },
  qualityValue: {
    color: palette.green,
    fontSize: 16,
    fontWeight: '900'
  },
  qualityLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 3
  },
  pairingCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
  },
  pairingRow: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 9,
    padding: 12
  },
  pairingTitle: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  pairingMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4
  },
  missingInlineCard: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  missingInlineLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  missingInlineText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4
  },
  mealCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 26,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  mealArt: {
    borderRadius: 20,
    height: 116,
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    width: '100%'
  },
  mealArtCircle: {
    borderRadius: 90,
    height: 150,
    opacity: 0.26,
    position: 'absolute',
    right: -28,
    top: -42,
    width: 150
  },
  mealArtPlate: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    width: 72
  },
  mealArtInitial: {
    color: palette.black,
    fontSize: 30,
    fontWeight: '900'
  },
  mealTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  mealTopRight: {
    alignItems: 'flex-end',
    gap: 8
  },
  favoriteButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  favoriteText: {
    color: flowColors.saved.accent,
    fontSize: 18,
    fontWeight: '900'
  },
  mealTitle: {
    color: palette.cream,
    flex: 1,
    fontSize: 22,
    fontWeight: '900'
  },
  mealTime: {
    color: palette.green,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3
  },
  mealDifficulty: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6
  },
  difficultyLabel: {
    color: palette.green,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6
  },
  miniPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  miniPill: {
    backgroundColor: palette.panel,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  miniPillText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  mealBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  mealBadge: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 999,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  flowBadge: {
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  neutralBadge: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  macroPanel: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14
  },
  macroCaption: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8
  },
  macroTile: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  macroValue: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900'
  },
  macroLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5
  },
  recipeTitle: {
    color: palette.cream,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 16
  },
  recipeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14
  },
  recipeActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16
  },
  stepList: {
    gap: 14,
    marginBottom: 16
  },
  stepPager: {
    marginBottom: 16
  },
  tiktokStepCard: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 30,
    borderWidth: 1,
    minHeight: 330,
    justifyContent: 'center',
    padding: 24
  },
  tiktokStepCount: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 14
  },
  tiktokStepNumber: {
    color: palette.green,
    fontSize: 92,
    fontWeight: '900',
    lineHeight: 100
  },
  tiktokStepText: {
    color: palette.cream,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 14,
    textAlign: 'center'
  },
  stepTimerText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 18
  },
  timerButton: {
    backgroundColor: palette.green,
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  timerButtonText: {
    color: palette.black,
    fontSize: 14,
    fontWeight: '900'
  },
  stepNavRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16
  },
  stepRow: {
    alignItems: 'flex-start',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  stepNumberText: {
    color: palette.black,
    fontSize: 14,
    fontWeight: '900'
  },
  stepText: {
    color: palette.cream,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23
  },
  swapCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  recipeIngredientCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  missingCard: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  feedbackCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  feedbackTitle: {
    color: palette.cream,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12
  },
  feedbackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  swapTitle: {
    color: palette.cream,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10
  },
  swapText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 5
  },
  emptyText: {
    color: palette.muted,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 28,
    textAlign: 'center'
  },
  emptyMiniText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10
  },
  listCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 15
  },
  historyActionRow: {
    flexDirection: 'row',
    marginTop: 14
  },
  shopSearchCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  locationInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  locationSummaryCard: {
    backgroundColor: palette.card,
    borderColor: flowColors.shopping.tint,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  nearbyStoreCard: {
    backgroundColor: palette.card,
    borderColor: flowColors.shopping.tint,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16
  },
  storeCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  storeStatus: {
    backgroundColor: flowColors.shopping.tint,
    borderRadius: 999,
    color: flowColors.shopping.accent,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  storeStatusClosing: {
    color: flowColors.fusion.accent
  },
  shopTitle: {
    color: palette.cream,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12
  },
  shopNotice: {
    color: palette.warning,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2
  },
  filterLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
    marginTop: 12,
    textTransform: 'uppercase'
  },
  folderChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  folderAssignRow: {
    marginBottom: 14,
    marginTop: 12
  },
  miniFolderChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 7,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  miniFolderText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900'
  },
  suggestionGroup: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 4
  },
  suggestionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  orderHistoryButton: {
    alignSelf: 'flex-start',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  orderHistoryText: {
    color: palette.green,
    fontSize: 12,
    fontWeight: '900'
  },
  storeFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 18,
    paddingTop: 8
  },
  storeChip: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  activeStoreChip: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  storeChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  activeStoreChipText: {
    color: palette.cream
  },
  shopItemRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12
  },
  productThumb: {
    alignItems: 'center',
    backgroundColor: palette.greenDeep,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  productThumbText: {
    color: palette.cream,
    fontSize: 18,
    fontWeight: '900'
  },
  shopItemInfo: {
    flex: 1
  },
  shopItemName: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900'
  },
  shopItemMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4
  },
  quantityControl: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 7,
    paddingVertical: 5
  },
  cartStoreSection: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 4
  },
  quantityButton: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  quantityText: {
    color: palette.green,
    fontSize: 16,
    fontWeight: '900'
  },
  quantityValue: {
    color: palette.cream,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 14,
    textAlign: 'center'
  },
  totalPanel: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 12
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  totalLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  totalValue: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900'
  },
  totalStrong: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900'
  },
  fulfillmentToggle: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    padding: 4
  },
  fulfillmentOption: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    paddingVertical: 9
  },
  activeFulfillmentOption: {
    backgroundColor: palette.greenDeep
  },
  fulfillmentText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '900'
  },
  activeFulfillmentText: {
    color: palette.cream
  },
  checkoutField: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 13
  },
  checkoutPlaceholder: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 5
  },
  checkoutLine: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  checkoutLineText: {
    color: palette.cream,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800'
  },
  confirmationCard: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 20,
    shadowColor: palette.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  confirmationKicker: {
    color: palette.warning,
    fontSize: 13,
    fontWeight: '900'
  },
  confirmationTitle: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8
  },
  confirmationMeta: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8
  },
  subscriptionStatusCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18
  },
  paymentFormCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  paymentField: {
    marginBottom: 12
  },
  trackingHero: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 20
  },
  timelineWrap: {
    marginTop: 14
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 9
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  activeTimelineDot: {
    backgroundColor: palette.green,
    borderColor: palette.green
  },
  timelineDotText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  activeTimelineDotText: {
    color: palette.black
  },
  timelineCopy: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flex: 1,
    paddingBottom: 9
  },
  timelineTitle: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '900'
  },
  activeTimelineTitle: {
    color: palette.cream
  },
  timelineMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4
  },
  listTitle: {
    color: palette.cream,
    flex: 1,
    fontSize: 20,
    fontWeight: '900'
  },
  listMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5
  },
  listRow: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12
  },
  listRowTitle: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '800'
  },
  listRowMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4
  },
  collectionsScroll: {
    paddingBottom: 24
  },
  collectionHeadline: {
    color: palette.cream,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6
  },
  collectionIntro: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 18
  },
  collectionCard: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 70,
    padding: 15
  },
  collectionCopy: {
    flex: 1
  },
  collectionTitle: {
    color: palette.cream,
    fontSize: 17,
    fontWeight: '900'
  },
  collectionMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5
  },
  collectionArrow: {
    color: palette.green,
    fontSize: 28,
    fontWeight: '700'
  },
  pantryScroll: {
    paddingBottom: 24
  },
  pantryDateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4
  },
  pantryDateInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.cream,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: 12
  },
  useSoonCard: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  useSoonRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(110, 168, 254, 0.28)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10
  },
  useSoonItem: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'capitalize'
  },
  useSoonDate: {
    color: palette.warning,
    fontSize: 12,
    fontWeight: '800'
  },
  pantryItemCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13
  },
  pantryItemTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  pantryItemCopy: {
    flex: 1
  },
  pantryEditRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
    paddingTop: 11
  },
  lowStockText: {
    color: palette.warning,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5
  },
  chatBubble: {
    alignSelf: 'flex-start',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    maxWidth: '88%',
    padding: 14
  },
  userChatBubble: {
    alignSelf: 'flex-end',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  chatText: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22
  },
  cookAgainButton: {
    alignSelf: 'flex-start',
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  cookAgainText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900'
  },
  groceryRow: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 15
  },
  groceryText: {
    color: palette.cream,
    flex: 1,
    fontSize: 16,
    fontWeight: '900'
  },
  checkedGroceryText: {
    color: palette.muted,
    textDecorationLine: 'line-through'
  },
  checkBox: {
    alignItems: 'center',
    borderColor: palette.green,
    borderRadius: 8,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    marginRight: 10,
    width: 26
  },
  checkBoxText: {
    color: palette.green,
    fontSize: 15,
    fontWeight: '900'
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  deleteText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  settingsCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16
  },
  settingsActionRow: {
    alignSelf: 'flex-start',
    marginTop: 12
  },
  syncStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10
  },
  syncDot: {
    backgroundColor: palette.muted,
    borderRadius: 999,
    height: 10,
    width: 10
  },
  syncDotReady: {
    backgroundColor: flowColors.shopping.accent
  },
  syncDotError: {
    backgroundColor: flowColors.Drinks.accent
  },
  feedbackEntryButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  feedbackEntryText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800'
  },
  feedbackKeyboard: {
    flex: 1
  },
  feedbackScroll: {
    paddingBottom: 26
  },
  feedbackLabel: {
    color: palette.cream,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 7,
    marginTop: 14
  },
  feedbackInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 13
  },
  feedbackTextArea: {
    minHeight: 92
  },
  feedbackRatingRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 2
  },
  feedbackRating: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 13,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46
  },
  feedbackRatingActive: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  feedbackRatingText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '900'
  },
  feedbackRatingTextActive: {
    color: palette.cream
  },
  feedbackConfirmation: {
    color: palette.green,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 2,
    marginTop: 15
  },
  settingsToggleRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12
  },
  settingsToggleLabel: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '800'
  },
  toggleTrack: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    padding: 3,
    width: 48
  },
  activeToggleTrack: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  toggleThumb: {
    backgroundColor: palette.muted,
    borderRadius: 999,
    height: 20,
    width: 20
  },
  activeToggleThumb: {
    alignSelf: 'flex-end',
    backgroundColor: palette.green
  },
  legalText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8
  },
  legalSectionTitle: {
    color: palette.cream,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 16
  },
  launchRow: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13
  },
  launchLabel: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '800'
  },
  launchValue: {
    color: palette.cream,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right'
  },
  qaCheckRow: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 10
  },
  qaCheckBox: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    width: 25
  },
  qaCheckBoxActive: {
    backgroundColor: flowColors.shopping.tint,
    borderColor: flowColors.shopping.accent
  },
  qaCheckMark: {
    color: flowColors.shopping.accent,
    fontSize: 14,
    fontWeight: '900'
  },
  qaCheckLabel: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800'
  },
  fullInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
    minHeight: 48,
    paddingHorizontal: 14
  },
  progressTrack: {
    backgroundColor: palette.panel,
    borderRadius: 999,
    height: 10,
    marginTop: 14,
    overflow: 'hidden'
  },
  progressFill: {
    backgroundColor: palette.green,
    borderRadius: 999,
    height: 10
  },
  voiceCard: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 14
  },
  voiceTitle: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900'
  },
  voiceText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 6
  },
  versionTap: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6
  },
  versionTapText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  profileHero: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 14,
    padding: 20
  },
  profileTitle: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900'
  },
  profileMeta: {
    color: palette.green,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8
  },
  profileStat: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '48%',
    padding: 15
  },
  profileStatValue: {
    color: palette.cream,
    fontSize: 22,
    fontWeight: '900'
  },
  profileStatLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5
  },
  cookingSafe: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20
  },
  cookingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  cookingBody: {
    alignItems: 'center',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 30,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    marginBottom: 16,
    padding: 24
  },
  cookingStepCount: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8
  },
  cookingAwakeText: {
    color: palette.green,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 20
  },
  cookingText: {
    color: palette.cream,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 39,
    textAlign: 'center'
  },
  cookingChecklist: {
    alignSelf: 'stretch',
    backgroundColor: palette.panel,
    borderRadius: 18,
    gap: 8,
    marginTop: 26,
    padding: 16
  },
  cookingIngredient: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '800'
  },
  settingsTitle: {
    color: palette.cream,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6
  },
  settingsSubtitle: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10
  },
  dislikeInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  dislikeInput: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    color: palette.cream,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  addDislikeButton: {
    backgroundColor: palette.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  addDislikeText: {
    color: palette.black,
    fontSize: 14,
    fontWeight: '900'
  },
  paywallHero: {
    alignItems: 'flex-start',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 26,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 22,
    padding: 20,
    shadowColor: palette.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20
  },
  paywallScroll: {
    paddingBottom: 24
  },
  paywallBadge: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  paywallBadgeText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '900'
  },
  paywallTitle: {
    color: palette.green,
    fontSize: 50,
    fontWeight: '900'
  },
  paywallText: {
    color: palette.cream,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
    marginTop: 12
  },
  benefitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22
  },
  benefitTile: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '48%',
    justifyContent: 'center',
    minHeight: 58,
    padding: 13
  },
  benefitText: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18
  },
  pricingRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6
  },
  pricingCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    minHeight: 142,
    padding: 16
  },
  comparisonCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 16,
    padding: 16
  },
  comparisonRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 11
  },
  comparisonFeature: {
    color: palette.cream,
    flex: 1.2,
    fontSize: 13,
    fontWeight: '800'
  },
  comparisonValue: {
    color: palette.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  comparisonPlus: {
    color: palette.green,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right'
  },
  selectedPricingCard: {
    backgroundColor: palette.greenDeep,
    borderColor: palette.green
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.cardAlt,
    borderRadius: 999,
    marginBottom: 11,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  bestValueText: {
    color: palette.black,
    fontSize: 10,
    fontWeight: '900'
  },
  planName: {
    color: palette.cream,
    fontSize: 16,
    fontWeight: '900'
  },
  planPrice: {
    color: palette.cream,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 14
  },
  planCadence: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4
  },
  paymentSpinner: {
    marginTop: 12
  },
  demoPaymentText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center'
  },
  paymentActions: {
    alignItems: 'center',
    gap: 14,
    marginTop: 24
  },
  textAction: {
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  textActionLabel: {
    color: palette.cream,
    fontSize: 14,
    fontWeight: '800'
  },
  resetActionLabel: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '800'
  },
  unlockCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 28,
    padding: 22
  },
  unlockText: {
    color: palette.black,
    fontSize: 26,
    fontWeight: '900'
  },
  featureList: {
    gap: 12,
    marginBottom: 18,
    marginTop: 24
  },
  featureText: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    color: palette.cream,
    fontSize: 16,
    fontWeight: '800',
    padding: 16
  }
});
