// ============================================
// ⚙️ CONFIGURAZIONE
// ============================================
const SUPABASE_URL = 'https://hrjokojbvbmcftmjxihv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyam9rb2pidmJtY2Z0bWp4aWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NjY0NzYsImV4cCI6MjA3OTM0MjQ3Nn0.Lk2_VLJbsfQrtDbGgFq9mCNKKdkdyTdCOhktsYIO1Vg';
const STRIPE_PUBLIC_KEY = 'pk_live_51RMQy2ApBcFhRXHbNhYzC25TFA95DWOeo74P73ufWTLvRAt1zSVqQZNucFKEq8ErJYCcnrVxOJi6AUtxEBYySoYC00aPJKcBiZ';
const shippingCost = 0.00;

let products = [];
let categories = [];
let cart = [];
let currentFilter = 'tutti';
let customerData = {};
let stripe = null;
let selectedProduct = null;
let selectedVariant = null;

const productsContainer = document.getElementById('products');
const cartItemsContainer = document.getElementById('cart-items');
const cartCountEl = document.getElementById('cart-count');
const cartTotalEl = document.getElementById('cart-total');
const cartSidebar = document.getElementById('cart');
const overlay = document.getElementById('overlay');
const filtersContainer = document.getElementById('filters');

// ============================================
// 📦 LOAD DATA
// ============================================

async function loadProducts() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*,categories(name,slug)&order=created_at.desc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    products = await res.json();
    renderProducts();
  } catch (e) {
    productsContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#ef4444;">⚠️ Errore caricamento</div>';
  }
}

async function loadCategories() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=*&order=name`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    categories = await res.json();
    renderFilters();
  } catch (e) { console.error(e); }
}

function renderFilters() {
  filtersContainer.innerHTML = `<button class="filter-btn active" onclick="filterProducts('tutti', this)">Tutti</button>
    ${categories.map(c => `<button class="filter-btn" onclick="filterProducts('${c.slug}', this)">${c.name}</button>`).join('')}`;
}

// ============================================
// 🎨 VARIANTS HELPERS
// ============================================

function hasVariants(product) {
  return product.variants && product.variants.length > 0;
}

function getTotalStock(product) {
  if (hasVariants(product)) {
    return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  }
  return product.stock || 0;
}

function getPriceRange(product) {
  if (hasVariants(product)) {
    const prices = product.variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (minPrice === maxPrice) return `€${minPrice.toFixed(2)}`;
    return `€${minPrice.toFixed(2)} - €${maxPrice.toFixed(2)}`;
  }
  return `€${parseFloat(product.price || 0).toFixed(2)}`;
}

function getAvailableColors(product) {
  if (!hasVariants(product)) return [];
  const colors = [...new Set(product.variants.map(v => v.color))];
  return colors;
}

function getAvailableStorages(product, selectedColor = null) {
  if (!hasVariants(product)) return [];
  let variants = product.variants;
  if (selectedColor) {
    variants = variants.filter(v => v.color === selectedColor);
  }
  const storages = [...new Set(variants.map(v => v.storage))];
  return storages;
}

function findVariant(product, color, storage) {
  if (!hasVariants(product)) return null;
  return product.variants.find(v => v.color === color && v.storage === storage);
}

function isVariantAvailable(product, color, storage) {
  const variant = findVariant(product, color, storage);
  return variant && variant.stock > 0;
}

// ============================================
// 🖼️ RENDER PRODUCTS
// ============================================

function renderProducts() {
  const filtered = currentFilter === 'tutti' ? products : products.filter(p => p.categories?.slug === currentFilter);
  if (!filtered.length) { 
    productsContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;">Nessun prodotto</div>'; 
    return; 
  }
  
  productsContainer.innerHTML = filtered.map(p => {
    const stock = getTotalStock(p);
    const out = stock <= 0;
    const priceDisplay = getPriceRange(p);
    const hasVar = hasVariants(p);
    
    return `
    <div class="card ${out ? 'out-of-stock' : ''}" onclick="openProductModal(${p.id})">
      <div class="card-img" style="${p.image_url ? `background-image:url('${p.image_url}')` : ''}">${!p.image_url ? '📦' : ''}${out ? '<div class="sold-out-badge">ESAURITO</div>' : ''}</div>
      <div class="card-body">
        <div class="card-cat">${p.categories?.name || 'Prodotto'}</div>
        <div class="card-title">${p.name}</div>
        <div class="card-rating">⭐ ${p.rating || '0.0'} ${stock > 0 && stock <= 10 ? `<span class="low-stock">• Solo ${stock}!</span>` : ''}</div>
        <div class="card-footer">
          <div class="card-price">${priceDisplay}</div>
          <button class="add-btn ${out ? 'disabled' : ''}" onclick="event.stopPropagation(); ${hasVar ? `openProductModal(${p.id})` : `addToCart(${p.id})`}">${out ? 'Esaurito' : '+ Aggiungi'}</button>
        </div>
        ${hasVar ? '<div class="has-variants-badge">🎨 Più opzioni disponibili</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function filterProducts(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

// ============================================
// 🛍️ PRODUCT MODAL
// ============================================

function openProductModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  selectedProduct = product;
  selectedVariant = null;
  
  document.getElementById('modal-product-name').textContent = product.name;
  document.getElementById('modal-product-description').textContent = product.description || '';
  document.getElementById('modal-product-rating').textContent = `⭐ ${product.rating || '0.0'}`;
  document.getElementById('modal-product-image').src = product.image_url || 'https://via.placeholder.com/400?text=No+Image';
  
  const hasVar = hasVariants(product);
  
  if (hasVar) {
    renderVariantSelectors(product);
    updatePriceAndStock();
  } else {
    document.getElementById('variant-selectors').innerHTML = '';
    const stock = product.stock || 0;
    document.getElementById('modal-product-price').textContent = `€${parseFloat(product.price).toFixed(2)}`;
    document.getElementById('modal-product-stock').innerHTML = stock > 0 
      ? `<span class="${stock <= 5 ? 'low' : ''}">✓ ${stock} disponibili</span>`
      : '<span class="out">✗ Non disponibile</span>';
    document.getElementById('modal-add-btn').disabled = stock <= 0;
  }
  
  document.getElementById('product-modal').classList.add('show');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('show');
  selectedProduct = null;
  selectedVariant = null;
}

function renderVariantSelectors(product) {
  const colors = getAvailableColors(product);
  const storages = getAvailableStorages(product);
  
  let html = '';
  
  // Colori
  if (colors.length > 0) {
    html += `
      <div class="variant-group">
        <label>Colore:</label>
        <div class="variant-options">
          ${colors.map(color => `
            <div class="variant-option" onclick="selectColor('${color}')" data-color="${color}">
              ${color}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  // Memoria
  if (storages.length > 0) {
    html += `
      <div class="variant-group">
        <label>Memoria:</label>
        <div class="variant-options" id="storage-options">
          ${storages.map(storage => `
            <div class="variant-option" onclick="selectStorage('${storage}')" data-storage="${storage}">
              ${storage}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  document.getElementById('variant-selectors').innerHTML = html;
}

function selectColor(color) {
  if (!selectedProduct) return;
  
  // Aggiorna selezione colore
  document.querySelectorAll('[data-color]').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-color="${color}"]`)?.classList.add('selected');
  
  // Reset storage selection
  document.querySelectorAll('[data-storage]').forEach(el => {
    el.classList.remove('selected', 'disabled');
  });
  
  // Disabilita storage non disponibili per questo colore
  const availableStorages = getAvailableStorages(selectedProduct, color);
  document.querySelectorAll('[data-storage]').forEach(el => {
    const storage = el.getAttribute('data-storage');
    if (!availableStorages.includes(storage) || !isVariantAvailable(selectedProduct, color, storage)) {
      el.classList.add('disabled');
    }
  });
  
  // Reset variant if storage not selected
  if (!selectedVariant || selectedVariant.color !== color) {
    selectedVariant = null;
  }
  
  updatePriceAndStock();
}

function selectStorage(storage) {
  if (!selectedProduct) return;
  
  const selectedColor = document.querySelector('[data-color].selected')?.getAttribute('data-color');
  if (!selectedColor) {
    alert('⚠️ Seleziona prima un colore');
    return;
  }
  
  const variant = findVariant(selectedProduct, selectedColor, storage);
  if (!variant || variant.stock <= 0) return;
  
  // Aggiorna selezione storage
  document.querySelectorAll('[data-storage]').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-storage="${storage}"]`)?.classList.add('selected');
  
  selectedVariant = variant;
  updatePriceAndStock();
}

function updatePriceAndStock() {
  if (!selectedProduct) return;
  
  const priceEl = document.getElementById('modal-product-price');
  const stockEl = document.getElementById('modal-product-stock');
  const addBtn = document.getElementById('modal-add-btn');
  
  if (selectedVariant) {
    const price = selectedVariant.price;
    const stock = selectedVariant.stock;
    
    priceEl.textContent = `€${parseFloat(price).toFixed(2)}`;
    stockEl.innerHTML = stock > 0 
      ? `<span class="${stock <= 5 ? 'low' : ''}">✓ ${stock} disponibili</span>`
      : '<span class="out">✗ Non disponibile</span>';
    addBtn.disabled = stock <= 0;
  } else {
    priceEl.textContent = getPriceRange(selectedProduct);
    stockEl.innerHTML = '<span class="variant-selection-required">⚠️ Seleziona colore e memoria</span>';
    addBtn.disabled = true;
  }
}

function addVariantToCart() {
  if (!selectedProduct) return;
  
  if (hasVariants(selectedProduct)) {
    if (!selectedVariant) {
      alert('⚠️ Seleziona colore e memoria prima di aggiungere al carrello');
      return;
    }
    addToCartWithVariant(selectedProduct, selectedVariant);
  } else {
    addToCart(selectedProduct.id);
  }
  
  closeProductModal();
}

// ============================================
// 🛒 CART
// ============================================

function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p || getTotalStock(p) <= 0) return;
  
  if (hasVariants(p)) {
    openProductModal(id);
    return;
  }
  
  const exist = cart.find(x => x.id === id && !x.variantId);
  if (exist) {
    if (exist.qty >= p.stock) { alert(`Max disponibile: ${p.stock}`); return; }
    exist.qty++;
  } else {
    cart.push({ 
      id: p.id, 
      name: p.name, 
      price: parseFloat(p.price), 
      image_url: p.image_url, 
      qty: 1, 
      maxStock: p.stock 
    });
  }
  updateCart();
}

function addToCartWithVariant(product, variant) {
  const cartId = `${product.id}-${variant.color}-${variant.storage}`;
  const exist = cart.find(x => x.cartId === cartId);
  
  if (exist) {
    if (exist.qty >= variant.stock) { 
      alert(`Max disponibile: ${variant.stock}`); 
      return; 
    }
    exist.qty++;
  } else {
    cart.push({
      id: product.id,
      cartId: cartId,
      name: product.name,
      variantColor: variant.color,
      variantStorage: variant.storage,
      variantSku: variant.sku,
      price: parseFloat(variant.price),
      image_url: product.image_url,
      qty: 1,
      maxStock: variant.stock
    });
  }
  updateCart();
}

function updateCart() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartCountEl.textContent = count;
  cartTotalEl.textContent = `€${total.toFixed(2)}`;
  
  if (!cart.length) {
    cartItemsContainer.innerHTML = '<div class="empty-cart"><span>🛒</span>Carrello vuoto</div>';
  } else {
    cartItemsContainer.innerHTML = cart.map(i => {
      const itemId = i.cartId || i.id;
      const variantInfo = i.variantColor ? `<div class="cart-item-variant">${i.variantColor} • ${i.variantStorage}</div>` : '';
      return `
      <div class="cart-item">
        <div class="cart-item-img" style="${i.image_url ? `background-image:url('${i.image_url}')` : ''}">${!i.image_url ? '📦' : ''}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          ${variantInfo}
          <div class="cart-item-price">€${i.price.toFixed(2)}</div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty('${itemId}',-1)">−</button>
            <span>${i.qty}</span>
            <button class="qty-btn" onclick="changeQty('${itemId}',1)" ${i.qty >= i.maxStock ? 'disabled' : ''}>+</button>
            <button class="remove-btn" onclick="removeItem('${itemId}')">🗑️</button>
          </div>
        </div>
      </div>`}).join('');
  }
  localStorage.setItem('cart', JSON.stringify(cart));
}

function changeQty(itemId, delta) { 
  const i = cart.find(x => (x.cartId || x.id) === itemId); 
  if (i) { 
    if (i.qty + delta > i.maxStock) { alert(`Max: ${i.maxStock}`); return; }
    i.qty = Math.max(1, i.qty + delta); 
    updateCart(); 
  } 
}

function removeItem(itemId) { 
  cart = cart.filter(x => (x.cartId || x.id) !== itemId); 
  updateCart(); 
}

function toggleCart() { 
  cartSidebar.classList.toggle('open'); 
  overlay.classList.toggle('show'); 
}

// ============================================
// 💳 CHECKOUT
// ============================================

function openCheckout() {
  if (!cart.length) { alert('Carrello vuoto!'); return; }
  toggleCart();
  document.getElementById('checkout-modal').classList.add('show');
  goToStep(1);
}

function closeCheckout() { 
  document.getElementById('checkout-modal').classList.remove('show'); 
}

function goToStep(step) {
  document.querySelectorAll('.checkout-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step-${step}`).classList.remove('hidden');
  if (step === 2) { renderOrderSummary(); initStripe(); }
}

function initStripe() {
  if (stripe) return;
  stripe = Stripe(STRIPE_PUBLIC_KEY);
}

function renderOrderSummary() {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('order-summary').innerHTML = cart.map(i => {
    const variantInfo = i.variantColor ? ` (${i.variantColor} - ${i.variantStorage})` : '';
    return `<div class="summary-item"><span>${i.name}${variantInfo} × ${i.qty}</span><span>€${(i.price * i.qty).toFixed(2)}</span></div>`;
  }).join('');
  document.getElementById('summary-subtotal').textContent = `€${sub.toFixed(2)}`;
  document.getElementById('summary-shipping').textContent = `€${shippingCost.toFixed(2)}`;
  document.getElementById('summary-total').textContent = `€${(sub + shippingCost).toFixed(2)}`;
}

async function processPayment() {
  const btn = document.getElementById('pay-button');
  const err = document.getElementById('payment-error');
  btn.textContent = 'Elaborazione...'; 
  btn.disabled = true;
  if (err) err.textContent = '';

  try {
    await verifyStock();
    
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const total = sub + shippingCost;
    const addr = `${customerData.address}, ${customerData.cap} ${customerData.city} (${customerData.province})`;

    const order = await saveOrder({ 
      name: `${customerData.name} ${customerData.surname}`, 
      email: customerData.email, 
      phone: customerData.phone, 
      address: addr, 
      notes: customerData.notes, 
      total, 
      status: 'pending'
    });

    const checkoutRes = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        orderId: order.id,
        items: cart.map(i => {
          const variantInfo = i.variantColor ? ` (${i.variantColor} - ${i.variantStorage})` : '';
          return { name: i.name + variantInfo, price: i.price, quantity: i.qty };
        }),
        shipping: shippingCost,
        customerEmail: customerData.email,
        successUrl: `${window.location.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/index.html`
      })
    });

    if (!checkoutRes.ok) {
      const errorData = await checkoutRes.json();
      throw new Error(errorData.error || 'Errore creazione sessione');
    }

    const { sessionId } = await checkoutRes.json();

    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stripe_session_id: sessionId })
    });

    const result = await stripe.redirectToCheckout({ sessionId });
    if (result.error) throw new Error(result.error.message);

  } catch (e) {
    if (err) err.textContent = e.message || 'Errore pagamento';
    else alert('❌ ' + (e.message || 'Errore'));
    btn.textContent = 'Paga con Stripe 💳'; 
    btn.disabled = false;
  }
}

async function verifyStock() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,stock,variants,name`, { 
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } 
  });
  const prods = await res.json();
  
  for (const item of cart) {
    const p = prods.find(x => x.id === item.id);
    if (!p) throw new Error(`"${item.name}" non più disponibile`);
    
    if (item.variantColor && item.variantStorage) {
      const variant = p.variants?.find(v => v.color === item.variantColor && v.storage === item.variantStorage);
      if (!variant || variant.stock < item.qty) {
        throw new Error(`"${item.name} (${item.variantColor} - ${item.variantStorage})" non disponibile`);
      }
    } else {
      if (p.stock < item.qty) throw new Error(`"${item.name}" non disponibile`);
    }
  }
}

async function saveOrder(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST', 
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ 
      customer_name: data.name, 
      customer_email: data.email, 
      customer_phone: data.phone, 
      customer_address: data.address, 
      notes: data.notes, 
      payment_method: 'stripe',
      total: data.total, 
      status: data.status
    })
  });
  if (!res.ok) throw new Error('Errore salvataggio');
  const [order] = await res.json();
  
  await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
    method: 'POST', 
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cart.map(i => ({ 
      order_id: order.id, 
      product_id: i.id, 
      quantity: i.qty, 
      price: i.price, 
      shipped: false 
    })))
  });
  return order;
}

function showHome() { document.getElementById('hero').style.display = 'block'; }
function showShop() { document.getElementById('hero').style.display = 'none'; document.getElementById('filters').scrollIntoView({ behavior: 'smooth' }); }

// ============================================
// 🚀 INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('cart');
  if (saved) cart = JSON.parse(saved);
  
  productsContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;">⏳ Caricamento...</div>';
  await loadCategories(); 
  await loadProducts();
  
  // Aggiorna cart con stock correnti
  cart = cart.filter(item => { 
    const p = products.find(x => x.id === item.id); 
    if (!p) return false;
    
    if (item.variantColor && item.variantStorage) {
      const variant = p.variants?.find(v => v.color === item.variantColor && v.storage === item.variantStorage);
      if (variant && variant.stock > 0) {
        item.maxStock = variant.stock;
        item.qty = Math.min(item.qty, variant.stock);
        item.price = parseFloat(variant.price);
        return true;
      }
      return false;
    } else {
      if (p.stock > 0) { 
        item.maxStock = p.stock; 
        item.qty = Math.min(item.qty, p.stock); 
        return true; 
      }
      return false;
    }
  });
  
  updateCart();
  
  document.getElementById('shipping-form')?.addEventListener('submit', e => {
    e.preventDefault();
    customerData = { 
      name: document.getElementById('customer-name').value, 
      surname: document.getElementById('customer-surname').value, 
      email: document.getElementById('customer-email').value, 
      phone: document.getElementById('customer-phone').value, 
      address: document.getElementById('customer-address').value, 
      city: document.getElementById('customer-city').value, 
      cap: document.getElementById('customer-cap').value, 
      province: document.getElementById('customer-province').value, 
      notes: document.getElementById('customer-notes').value 
    };
    goToStep(2);
  });
  
  // Close modal on overlay click
  document.getElementById('overlay').addEventListener('click', () => {
    if (document.getElementById('product-modal').classList.contains('show')) {
      closeProductModal();
    }
  });
});
