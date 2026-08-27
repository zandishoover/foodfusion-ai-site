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

function recipeClientId(recipe, recipeType = 'Meals') {
  return `${recipe.id || `${recipeType}-${recipe.title}`}`.slice(0, 160);
}

function recipeMetadata(recipe) {
  return {
    time: recipe.time || null,
    difficulty: recipe.difficulty || null,
    description: recipe.description || null,
    prepTimeMinutes: recipe.prepTimeMinutes || null,
    cookTimeMinutes: recipe.cookTimeMinutes || null,
    totalTimeMinutes: recipe.totalTimeMinutes || null,
    equipment: recipe.equipment || [],
    tips: recipe.tips || [],
    source: recipe.source || null,
    sourceUrl: recipe.sourceUrl || null,
    attribution: recipe.attribution || null
  };
}

function mapStoredRecipe(recipe, saved = {}) {
  return {
    ...(recipe.metadata || {}),
    id: recipe.client_id || recipe.id,
    remoteRecipeId: recipe.id,
    title: recipe.title,
    recipeType: recipe.recipe_type,
    time: recipe.metadata?.time || '',
    servings: recipe.servings,
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    macros: recipe.macros || {},
    missingIngredients: recipe.missing_ingredients || [],
    folder: saved.favorite_folder || 'Favorites',
    savedAt: saved.saved_at ? new Date(saved.saved_at).toLocaleDateString() : undefined
  };
}

export async function loadSyncedUserData() {
  const userId = await authenticatedUserId();
  if (!userId) {
    return null;
  }
  const [
    { data: preferences, error: preferencesError },
    { data: pantryItems, error: pantryError },
    { data: cart, error: cartError },
    { data: scans, error: scansError },
    { data: recipeRows, error: recipesError },
    { data: orders, error: ordersError },
    { data: subscription, error: subscriptionError }
  ] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('pantry_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('shopping_carts').select('id, fulfillment_mode').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    supabase.from('scans').select('*').eq('user_id', userId).eq('status', 'completed').order('created_at', { ascending: false }).limit(30),
    supabase.from('user_recipes').select('*').eq('user_id', userId).order('last_opened_at', { ascending: false }).limit(30),
    supabase.from('orders').select('*').eq('user_id', userId).order('placed_at', { ascending: false }).limit(20),
    supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
  ]);
  if (preferencesError || pantryError || cartError || scansError || recipesError || ordersError || subscriptionError) {
    throw preferencesError || pantryError || cartError || scansError || recipesError || ordersError || subscriptionError;
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
  const scanIds = (scans || []).map((scan) => scan.id);
  const { data: scanRecipes, error: scanRecipesError } = scanIds.length
    ? await supabase.from('recipes').select('*').eq('user_id', userId).in('scan_id', scanIds).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (scanRecipesError) {
    throw scanRecipesError;
  }
  const savedRecipeIds = (recipeRows || []).map((item) => item.recipe_id);
  const { data: savedRecipes, error: savedRecipesError } = savedRecipeIds.length
    ? await supabase.from('recipes').select('*').eq('user_id', userId).in('id', savedRecipeIds)
    : { data: [], error: null };
  if (savedRecipesError) {
    throw savedRecipesError;
  }
  const orderIds = (orders || []).map((order) => order.id);
  const { data: orderItems, error: orderItemsError } = orderIds.length
    ? await supabase.from('order_items').select('*').eq('user_id', userId).in('order_id', orderIds)
    : { data: [], error: null };
  if (orderItemsError) {
    throw orderItemsError;
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
    fulfillmentMode: cart?.fulfillment_mode,
    favorites: (recipeRows || []).filter((saved) => saved.is_favorite).map((saved) => {
      const recipe = (savedRecipes || []).find((item) => item.id === saved.recipe_id);
      return recipe ? mapStoredRecipe(recipe, saved) : null;
    }).filter(Boolean),
    savedRecipeHistory: (recipeRows || []).map((saved) => {
      const recipe = (savedRecipes || []).find((item) => item.id === saved.recipe_id);
      if (!recipe) return null;
      const meal = mapStoredRecipe(recipe, saved);
      return {
        id: `saved-${recipe.id}`,
        date: new Date(saved.last_opened_at || saved.updated_at).toLocaleDateString(),
        mode: 'Opened',
        recipeType: meal.recipeType,
        personality: `${meal.recipeType} recent`,
        meals: [meal]
      };
    }).filter(Boolean),
    scanHistory: (scans || []).map((scan) => ({
      id: scan.client_id || scan.id,
      remoteScanId: scan.id,
      date: new Date(scan.created_at).toLocaleDateString(),
      mode: scan.scan_mode || 'Scan',
      recipeType: scan.recipe_type,
      personality: 'FoodFusion Scan',
      meals: (scanRecipes || []).filter((recipe) => recipe.scan_id === scan.id).map((recipe) => mapStoredRecipe(recipe))
    })),
    favoriteScanIds: (scans || []).filter((scan) => scan.favorite).map((scan) => scan.client_id || scan.id),
    orders: (orders || []).map((order) => ({
      id: order.external_order_id || order.id,
      remoteOrderId: order.id,
      mode: order.fulfillment_mode,
      store: order.store_name,
      eta: order.eta,
      total: Number(order.total),
      items: (orderItems || []).filter((item) => item.order_id === order.id).map((item) => ({
        ...(item.product_payload || {}),
        id: item.id,
        name: item.product_name,
        store: item.store_name,
        size: item.size,
        price: `$${Number(item.unit_price).toFixed(2)}`,
        quantity: item.quantity
      })),
      placedAt: new Date(order.placed_at).getTime(),
      date: new Date(order.placed_at).toLocaleDateString(),
      address: order.tracking_payload?.address || '',
      fulfillmentWindow: order.tracking_payload?.fulfillmentWindow || '',
      mcpTracking: order.tracking_payload?.tracking || null
    })),
    subscription
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
    primary_equipment: snapshot.primaryEquipment || 'Stove',
    default_servings: snapshot.servings || 2,
    recipe_source: snapshot.recipeSource || 'hybrid',
    macro_lock: snapshot.macroLock || null,
    nutrition_goals: snapshot.nutritionGoals || {},
    household: snapshot.household || {},
    budget_goals: snapshot.budgetGoals || {},
    notification_preferences: snapshot.notificationPreferences || {},
    notifications_enabled: Boolean(snapshot.notificationsEnabled),
    shopping_location: snapshot.shoppingLocation || {}
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
  const scanValues = {
    user_id: userId,
    client_id: scan.clientId || null,
    source: scan.source === 'openai' ? 'openai' : 'manual',
    status: 'completed',
    recipe_type: scan.recipeType,
    scan_mode: 'camera',
    ingredient_count: detections.length,
    preferences_snapshot: scan.preferences || {}
  };
  const { data: existingScan, error: lookupError } = scan.clientId
    ? await supabase.from('scans').select('id').eq('user_id', userId).eq('client_id', scan.clientId).maybeSingle()
    : { data: null, error: null };
  if (lookupError) {
    throw lookupError;
  }
  const { data: storedScan, error: scanError } = existingScan
    ? await supabase.from('scans').update(scanValues).eq('id', existingScan.id).eq('user_id', userId).select('id').single()
    : await supabase.from('scans').insert(scanValues).select('id').single();
  if (scanError) {
    throw scanError;
  }
  if (detections.length > 0) {
    await supabase.from('scan_ingredients').delete().eq('scan_id', storedScan.id).eq('user_id', userId);
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
    await supabase.from('recipes').delete().eq('scan_id', storedScan.id).eq('user_id', userId);
    const { error: recipeError } = await supabase.from('recipes').insert(scan.recipes.map((recipe) => ({
      user_id: userId,
      scan_id: storedScan.id,
      client_id: recipeClientId({ ...recipe, id: `${scan.clientId || storedScan.id}-${recipe.id || recipe.title}` }, scan.recipeType),
      title: recipe.title,
      recipe_type: scan.recipeType,
      source: 'local',
      servings: recipe.servings || scan.servings || null,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      macros: recipe.macros || {},
      missing_ingredients: recipe.missingIngredients || [],
      metadata: recipeMetadata(recipe)
    })));
    if (recipeError) {
      throw recipeError;
    }
  }
  return storedScan.id;
}

export async function replaceFavoriteRecipes(favorites = []) {
  const userId = await authenticatedUserId();
  if (!userId) {
    return [];
  }
  const savedRecipes = [];
  for (const meal of favorites) {
    const clientId = recipeClientId(meal, meal.recipeType);
    const recipeValues = {
      user_id: userId,
      client_id: clientId,
      title: meal.title,
      recipe_type: meal.recipeType || 'Meals',
      source: 'local',
      servings: meal.servings || null,
      ingredients: meal.ingredients || [],
      steps: meal.steps || [],
      macros: meal.macros || {},
      missing_ingredients: meal.missingIngredients || [],
      metadata: recipeMetadata(meal)
    };
    const { data: existingRecipe, error: lookupError } = await supabase
      .from('recipes').select('id').eq('user_id', userId).eq('client_id', clientId).maybeSingle();
    if (lookupError) throw lookupError;
    const recipeResult = existingRecipe
      ? await supabase.from('recipes').update(recipeValues).eq('id', existingRecipe.id).eq('user_id', userId).select('id').single()
      : await supabase.from('recipes').insert(recipeValues).select('id').single();
    if (recipeResult.error) throw recipeResult.error;
    const savedAt = meal.savedAt ? new Date(meal.savedAt).toISOString() : new Date().toISOString();
    const { error: savedError } = await supabase.from('user_recipes').upsert({
      user_id: userId,
      recipe_id: recipeResult.data.id,
      is_favorite: true,
      favorite_folder: meal.folder || 'Favorites',
      saved_at: savedAt
    });
    if (savedError) throw savedError;
    savedRecipes.push(recipeResult.data.id);
  }
  const { data: existingFavorites, error: existingError } = await supabase
    .from('user_recipes').select('recipe_id').eq('user_id', userId).eq('is_favorite', true);
  if (existingError) throw existingError;
  const removedIds = (existingFavorites || []).map((item) => item.recipe_id).filter((id) => !savedRecipes.includes(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from('user_recipes').delete().eq('user_id', userId).in('recipe_id', removedIds);
    if (error) throw error;
  }
  return favorites;
}

export async function saveOpenedRecipe(meal) {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const clientId = recipeClientId(meal, meal.recipeType);
  const values = {
    user_id: userId,
    client_id: clientId,
    title: meal.title,
    recipe_type: meal.recipeType || 'Meals',
    source: 'local',
    servings: meal.servings || null,
    ingredients: meal.ingredients || [],
    steps: meal.steps || [],
    macros: meal.macros || {},
    missing_ingredients: meal.missingIngredients || [],
    metadata: recipeMetadata(meal)
  };
  const { data: existingRecipe, error: recipeLookupError } = await supabase
    .from('recipes').select('id').eq('user_id', userId).eq('client_id', clientId).maybeSingle();
  if (recipeLookupError) throw recipeLookupError;
  const recipeResult = existingRecipe
    ? await supabase.from('recipes').update(values).eq('id', existingRecipe.id).eq('user_id', userId).select('id').single()
    : await supabase.from('recipes').insert(values).select('id').single();
  if (recipeResult.error) throw recipeResult.error;
  const { data: existingSaved, error: savedLookupError } = await supabase
    .from('user_recipes').select('is_favorite, favorite_folder, saved_at').eq('user_id', userId).eq('recipe_id', recipeResult.data.id).maybeSingle();
  if (savedLookupError) throw savedLookupError;
  const { error: savedError } = await supabase.from('user_recipes').upsert({
    user_id: userId,
    recipe_id: recipeResult.data.id,
    is_favorite: Boolean(existingSaved?.is_favorite),
    favorite_folder: existingSaved?.favorite_folder || null,
    saved_at: existingSaved?.saved_at || null,
    last_opened_at: new Date().toISOString()
  });
  if (savedError) throw savedError;
}

export async function syncSubscriptionStatus({
  isPremium = false,
  selectedPlan = 'yearly',
  provider = 'mvp_local',
  status,
  renewsAt = null,
  externalSubscriptionId = null
} = {}) {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan: isPremium ? selectedPlan : 'free',
    status: status || (isPremium ? 'active' : 'inactive'),
    provider,
    started_at: isPremium ? new Date().toISOString() : null,
    renews_at: renewsAt,
    cancelled_at: isPremium ? null : new Date().toISOString(),
    external_subscription_id: externalSubscriptionId
  });
  if (error) throw error;
}

export async function clearRemoteScanHistory() {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const { error } = await supabase.from('scans').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function deleteRemoteScan(clientId) {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const isRemoteId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(clientId);
  const query = supabase.from('scans').delete().eq('user_id', userId);
  const { error } = isRemoteId ? await query.eq('id', clientId) : await query.eq('client_id', clientId);
  if (error) throw error;
}

export async function setRemoteScanFavorite(clientId, favorite) {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const isRemoteId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(clientId);
  const query = supabase.from('scans').update({ favorite }).eq('user_id', userId);
  const { error } = isRemoteId ? await query.eq('id', clientId) : await query.eq('client_id', clientId);
  if (error) throw error;
}

export async function savePlacedOrder(order) {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const values = {
    user_id: userId,
    external_order_id: order.id,
    integration_source: 'local',
    store_name: order.store,
    fulfillment_mode: order.mode,
    status: 'order_placed',
    eta: order.eta || null,
    subtotal: order.subtotal || 0,
    estimated_fees: order.fees || 0,
    estimated_tax: order.tax || 0,
    total: order.total || 0,
    tracking_payload: {
      address: order.address || '',
      fulfillmentWindow: order.fulfillmentWindow || '',
      tracking: order.mcpTracking || null
    },
    placed_at: new Date(order.placedAt || Date.now()).toISOString()
  };
  const { data: existingOrder, error: findError } = await supabase
    .from('orders').select('id').eq('user_id', userId).eq('external_order_id', order.id).maybeSingle();
  if (findError) throw findError;
  const result = existingOrder
    ? await supabase.from('orders').update(values).eq('id', existingOrder.id).eq('user_id', userId).select('id').single()
    : await supabase.from('orders').insert(values).select('id').single();
  if (result.error) throw result.error;
  const orderId = result.data.id;
  const { error: removeItemsError } = await supabase.from('order_items').delete().eq('order_id', orderId).eq('user_id', userId);
  if (removeItemsError) throw removeItemsError;
  if (order.items?.length) {
    const { error } = await supabase.from('order_items').insert(order.items.map((item) => ({
      order_id: orderId,
      user_id: userId,
      product_name: item.name,
      store_name: item.store || item.brand || order.store,
      size: item.size || null,
      unit_price: priceNumber(item.price),
      quantity: item.quantity || 1,
      product_payload: item
    })));
    if (error) throw error;
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
