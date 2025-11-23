// ============================================
// ⚙️ CONFIGURAZIONE
// ============================================
const SUPABASE_URL = 'https://hrjokojbvbmcftmjxihv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyam9rb2pidmJtY2Z0bWp4aWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NjY0NzYsImV4cCI6MjA3OTM0MjQ3Nn0.Lk2_VLJbsfQrtDbGgFq9mCNKKdkdyTdCOhktsYIO1Vg';
const STRIPE_PUBLIC_KEY = 'pk_live_51RMQy2ApBcFhRXHbNhYzC25TFA95DWOeo74P73ufWTLvRAt1zSVqQZNucFKEq8ErJYCcnrVxOJi6AUtxEBYySoYC00aPJKcBiZ';
const shippingCost = 8.00;

let products = [];
let categories = [];
let cart = [];
let currentFilter = 'tutti';
let customerData = {};
let stripe = null;

const productsContainer = document.getElementById('products');
const cartItemsContainer = document.getElementById('cart-items');
const cartCountEl = document.getElementById('cart-count');
const cartTotalEl = document.getElementById('cart-total');
const cartSidebar = document.getElementById('cart');
const overlay = document.getElementById('overlay');
const filtersContainer = document.getElementById('filters');

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=*`, {
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

function renderProducts() {
  const filtered = currentFilter === 'tutti' ? products : products.filter(p => p.categories?.slug === currentFilter);
  if (!filtered.length) { productsContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;">Nessun prodotto</div>'; return; }
  
  productsContainer.innerHTML = filtered.map(p => {
    const stock = p.stock || 0;
    const out = stock <= 0;
    return `
    <div class="card ${out ? 'out-of-stock' : ''}">
      <div class="card-img" style="${p.image_url ? `background-image:url('${p.image_url}')` : ''}">${!p.image_url ? '📦' : ''}${out ? '<div class="sold-out-badge">ESAURITO</div>' : ''}</div>
      <div class="card-body">
        <div class="card-cat">${p.categories?.name || 'Prodotto'}</div>
        <div class="card-title">${p.name}</div>
        <div class="card-rating">★ ${p.rating || '0.0'} ${stock > 0 && stock <= 5 ? `<span class="low-stock">• Solo ${stock}!</span>` : ''}</div>
        <div class="card-footer">
          <div class="card-price">€${parseFloat(p.price).toFixed(2)}</div>
          ${out ? '<button class="add-btn disabled" disabled>Esaurito</button>' : `<button class="add-btn" onclick="addToCart(${p.id})">+ Aggiungi</button>`}
        </div>
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

function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock <= 0) return;
  const exist = cart.find(x => x.id === id);
  if (exist) {
    if (exist.qty >= p.stock) { alert(`Max disponibile: ${p.stock}`); return; }
    exist.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, price: parseFloat(p.price), image_url: p.image_url, qty: 1, maxStock: p.stock });
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
    cartItemsContainer.innerHTML = cart.map(i => `
      <div class="cart-item">
        <div class="cart-item-img" style="${i.image_url ? `background-image:url('${i.image_url}')` : ''}">${!i.image_url ? '📦' : ''}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">€${i.price.toFixed(2)}</div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty(${i.id},-1)">−</button>
            <span>${i.qty}</span>
            <button class="qty-btn" onclick="changeQty(${i.id},1)" ${i.qty >= i.maxStock ? 'disabled' : ''}>+</button>
            <button class="remove-btn" onclick="removeItem(${i.id})">🗑️</button>
          </div>
        </div>
      </div>`).join('');
  }
  localStorage.setItem('cart', JSON.stringify(cart));
}

function changeQty(id, d) { 
  const i = cart.find(x => x.id === id); 
  if (i) { 
    if (i.qty + d > i.maxStock) { alert(`Max: ${i.maxStock}`); return; }
    i.qty = Math.max(1, i.qty + d); 
    updateCart(); 
  } 
}
function removeItem(id) { cart = cart.filter(x => x.id !== id); updateCart(); }
function toggleCart() { cartSidebar.classList.toggle('open'); overlay.classList.toggle('show'); }

function openCheckout() {
  if (!cart.length) { alert('Carrello vuoto!'); return; }
  toggleCart();
  document.getElementById('checkout-modal').classList.add('show');
  goToStep(1);
}
function closeCheckout() { document.getElementById('checkout-modal').classList.remove('show'); }

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
  document.getElementById('order-summary').innerHTML = cart.map(i => `<div class="summary-item"><span>${i.name} × ${i.qty}</span><span>€${(i.price * i.qty).toFixed(2)}</span></div>`).join('');
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
        items: cart.map(i => ({ name: i.name, price: i.price, quantity: i.qty })),
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,stock,name`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
  const prods = await res.json();
  for (const item of cart) {
    const p = prods.find(x => x.id === item.id);
    if (!p || p.stock < item.qty) throw new Error(`"${item.name}" non disponibile`);
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
    body: JSON.stringify(cart.map(i => ({ order_id: order.id, product_id: i.id, quantity: i.qty, price: i.price, shipped: false })))
  });
  return order;
}

function showHome() { document.getElementById('hero').style.display = 'block'; }
function showShop() { document.getElementById('hero').style.display = 'none'; document.getElementById('filters').scrollIntoView({ behavior: 'smooth' }); }

document.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('cart');
  if (saved) cart = JSON.parse(saved);
  productsContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;">⏳ Caricamento...</div>';
  await loadCategories(); 
  await loadProducts();
  cart = cart.filter(item => { const p = products.find(x => x.id === item.id); if (p?.stock > 0) { item.maxStock = p.stock; item.qty = Math.min(item.qty, p.stock); return true; } return false; });
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
});