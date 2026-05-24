import { supabase, supabaseConfigured } from './supabaseAuth';

async function authenticatedUserId() {
  if (!supabaseConfigured || !supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return data.user?.id || null;
}

function priceNumber(value) {
  const parsed = Number(`${value || 0}`.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadSyncedUserData() {
  const userId = await authenticatedUserId();
  if (!userId) {
    return null;
  }
  const [
    { data: preferences, error: preferencesError },
    { data: pantryItems, error: pantryError },
    { data: cart, error: cartError }
  ] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('pantry_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('shopping_carts').select('id, fulfillment_mode').eq('user_id', userId).eq('status', 'active').maybeSingle()
  ]);
  if (preferencesError || pantryError || cartError) {
    throw preferencesError || pantryError || cartError;
  }
  let cartItems = [];
  if (cart) {
    const { data, error } = await supabase
      .from('shopping_cart_items')
      .select('*')
      .eq('user_id', userId)
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    cartItems = (data || []).map((item) => ({
      ...(item.product_payload || {}),
      id: item.external_product_id || item.id,
      name: item.product_name,
      store: item.store_name,
      price: `$${Number(item.unit_price).toFixed(2)}`,
      size: item.size,
      eta: item.eta,
      quantity: item.quantity
    }));
  }
  return {
    preferences,
    pantryItems: (pantryItems || []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      expiresAt: item.expires_on,
      low: item.is_low
    })),
    cartItems,
    fulfillmentMode: cart?.fulfillment_mode
  };
}

export async function syncUserPreferences(snapshot) {
  const userId = await authenticatedUserId();
  if (!userId) {
    return;
  }
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: userId,
    food_styles: snapshot.foodStyles || [],
    disliked_ingredients: snapshot.dislikedIngredients || [],
    equipment: snapshot.equipment || [],
    default_servings: snapshot.servings || 2,
    recipe_source: snapshot.recipeSource || 'hybrid',
    macro_lock: snapshot.macroLock || null,
    nutrition_goals: snapshot.nutritionGoals || {},
    household: snapshot.household || {},
    budget_goals: snapshot.budgetGoals || {},
    notification_preferences: snapshot.notificationPreferences || {},
    notifications_enabled: Boolean(snapshot.notificationsEnabled)
  });
  if (error) {
    throw error;
  }
}

export async function saveStructuredScanResult(scan) {
  const userId = await authenticatedUserId();
  if (!userId) {
    return;
  }
  const detections = (scan.detections || []).map((item) => {
    const rawConfidence = Number(item.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? rawConfidence > 1 ? rawConfidence / 100 : rawConfidence
      : null;
    return {
      name: item.name,
      confidence,
      estimated_quantity: item.estimatedQuantity || null,
      notes: item.notes || null
    };
  });
  const { data: storedScan, error: scanError } = await supabase.from('scans').insert({
    user_id: userId,
    source: scan.source === 'openai' ? 'openai' : 'manual',
    status: 'completed',
    recipe_type: scan.recipeType,
    scan_mode: 'camera',
    ingredient_count: detections.length,
    preferences_snapshot: scan.preferences || {}
  }).select('id').single();
  if (scanError) {
    throw scanError;
  }
  if (detections.length > 0) {
    const { error: ingredientError } = await supabase.from('scan_ingredients').insert(detections.map((item) => ({
      scan_id: storedScan.id,
      user_id: userId,
      ...item
    })));
    if (ingredientError) {
      throw ingredientError;
    }
  }
  if ((scan.recipes || []).length > 0) {
    const { error: recipeError } = await supabase.from('recipes').insert(scan.recipes.map((recipe) => ({
      user_id: userId,
      scan_id: storedScan.id,
      title: recipe.title,
      recipe_type: scan.recipeType,
      source: 'local',
      servings: recipe.servings || scan.servings || null,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      macros: recipe.macros || {},
      missing_ingredients: recipe.missingIngredients || [],
      metadata: { time: recipe.time || null, difficulty: recipe.difficulty || null }
    })));
    if (recipeError) {
      throw recipeError;
    }
  }
}

export async function replacePantryItems(items) {
  const userId = await authenticatedUserId();
  if (!userId) {
    return;
  }
  const { error: deleteError } = await supabase.from('pantry_items').delete().eq('user_id', userId);
  if (deleteError) {
    throw deleteError;
  }
  if (!items.length) {
    return;
  }
  const { error } = await supabase.from('pantry_items').insert(items.map((item) => ({
    user_id: userId,
    name: item.name,
    quantity: item.quantity || null,
    expires_on: item.expiresAt || null,
    freshness: 'fresh',
    is_low: Boolean(item.low)
  })));
  if (error) {
    throw error;
  }
}

export async function replaceActiveShoppingCart(items, fulfillmentMode = 'Delivery') {
  const userId = await authenticatedUserId();
  if (!userId) {
    return;
  }
  const subtotal = items.reduce((total, item) => total + priceNumber(item.price) * (item.quantity || 1), 0);
  const estimatedFees = items.length ? 5.99 : 0;
  const estimatedTax = subtotal * 0.07;
  const estimatedTotal = subtotal + estimatedFees + estimatedTax;
  const cartValues = {
    fulfillment_mode: fulfillmentMode,
    store_name: items[0]?.store || items[0]?.brand || null,
    subtotal,
    estimated_fees: estimatedFees,
    estimated_tax: estimatedTax,
    estimated_total: estimatedTotal
  };
  const { data: activeCart, error: findError } = await supabase
    .from('shopping_carts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (findError) {
    throw findError;
  }
  const cartResult = activeCart
    ? await supabase.from('shopping_carts').update(cartValues).eq('id', activeCart.id).eq('user_id', userId).select('id').single()
    : await supabase.from('shopping_carts').insert({ user_id: userId, status: 'active', ...cartValues }).select('id').single();
  if (cartResult.error) {
    throw cartResult.error;
  }
  const cart = cartResult.data;
  const { error: clearError } = await supabase.from('shopping_cart_items').delete().eq('cart_id', cart.id).eq('user_id', userId);
  if (clearError) {
    throw clearError;
  }
  if (!items.length) {
    return;
  }
  const { error } = await supabase.from('shopping_cart_items').insert(items.map((item) => ({
    cart_id: cart.id,
    user_id: userId,
    external_product_id: item.id || null,
    product_name: item.name,
    store_name: item.store || item.brand || 'Store',
    size: item.size || null,
    unit_price: priceNumber(item.price),
    quantity: item.quantity || 1,
    eta: item.eta || null,
    product_payload: item
  })));
  if (error) {
    throw error;
  }
}
