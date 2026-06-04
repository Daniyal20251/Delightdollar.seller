// ===== THEME =====
function initTheme() {
  const stored = localStorage.getItem("darkMode");
  // Default to dark mode if no preference stored
  const isDark = stored === null ? true : stored === "true";

  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
    const knob = document.getElementById("themeKnob");
    if (knob) knob.textContent = "🌙";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    const knob = document.getElementById("themeKnob");
    if (knob) knob.textContent = "☀️";
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("darkMode", "false");
    document.getElementById("themeKnob").textContent = "☀️";
    showToast("☀️ Light Mode", "Switched to light theme", "fa-sun");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("darkMode", "true");
    document.getElementById("themeKnob").textContent = "🌙";
    showToast("🌙 Dark Mode", "Switched to dark theme", "fa-moon");
  }
}

initTheme();


const API_BASE = "https://delight-backend--araindaniyalo2.replit.app";
let sellerPlan = null;
let currentDomainStatus = null;
let selectedProductId = null;
let selectedProductData = null;
let sellerProducts = [];
let fakeReviewRating = 5;

// ===== SAFE LOCAL STORAGE HELPERS =====
function getSeller() {
  try {
    const raw = localStorage.getItem("seller");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.phone ? parsed : null;
  } catch (e) {
    console.error("Invalid seller data:", e);
    return null;
  }
}

// ===== LOCAL STORAGE HELPERS FOR DOMAIN =====
function getDomainData() {
  const seller = getSeller();
  if (!seller) return null;
  const key = `domain_${seller.phone}`;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

function saveDomainData(data) {
  const seller = getSeller();
  if (!seller) return;
  const key = `domain_${seller.phone}`;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save domain data:", e);
  }
}


// ===== FETCH FULL PLAN STATUS =====
async function fetchFullPlanStatus() {
  const seller = getSeller();
  if (!seller) return null;

  let planData = null;
  let domainData = null;

  // 1. Fetch plan status with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/plan-status/${seller.phone}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) planData = data;
    }
  } catch (err) {
    console.warn("Plan status fetch error:", err.message);
  }

  // 2. Fetch domain verification status with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/seller/verify-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: seller.phone }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data) domainData = data;
    }
  } catch (err) {
    console.warn("Domain verify fetch error:", err.message);
  }

  // 3. Merge data - PRIORITY: backend data over local
  const merged = {
    ...(planData || {}),
    ...(domainData || {}),
    plan: planData?.plan || 'free',
    isExpired: planData?.isExpired || false,
    adsUnlocked: planData?.adsUnlocked || false,
    customDomain: domainData?.domain || planData?.customDomain || null,
    domainRequestStatus: domainData?.domainRequestStatus || planData?.domainRequestStatus || null,
    domainSetupStatus: domainData?.domainSetupStatus || planData?.domainSetupStatus || 'not_started',
    domainStatus: domainData?.domainStatus || planData?.domainStatus || null,
    domainRequest: domainData?.domain || planData?.customDomain || null,
    domainRejectedReason: domainData?.reason || planData?.domainRejectedReason || null,
  };

  // Save to localStorage for offline fallback
  if (merged.domainRequestStatus && merged.domainRequest) {
    saveDomainData({
      domain: merged.domainRequest,
      status: merged.domainRequestStatus,
      setupStatus: merged.domainSetupStatus,
      domainStatus: merged.domainStatus,
      updatedAt: new Date().toISOString()
    });
  }

  sellerPlan = merged;
  return merged;
}

// ===== UPDATE UI BASED ON PLAN =====
function updateUIForPlan(plan) {
  const planStatus = document.getElementById('planStatus');
  const premiumBadge = document.getElementById('premiumBadge');
  const domainSection = document.getElementById('domainSection');
  const domainContent = document.getElementById('domainContent');
  const adsLockedOverlay = document.getElementById('adsLockedOverlay');
  const adsUnlockedSection = document.getElementById('adsUnlockedSection');
  const analyticsLockedOverlay = document.getElementById('analyticsLockedOverlay');
  const analyticsUnlockedSection = document.getElementById('analyticsUnlockedSection');
  const fakeReviewsLockedOverlay = document.getElementById('fakeReviewsLockedOverlay');
  const fakeReviewsUnlockedSection = document.getElementById('fakeReviewsUnlockedSection');
  const upgradeBtn = document.getElementById('upgradeBtn');

  // SAFE FALLBACK: agar plan null/undefined ho
  if (!plan || typeof plan !== 'object') {
    planStatus.className = 'plan-status free';
    planStatus.innerHTML = '<i class="fas fa-store"></i> Free Plan Active';
    premiumBadge.style.display = 'none';
    return;
  }

  const isPremiumActive = (plan.plan === 'premium' || plan.plan === 'yearly') && !plan.isExpired;

  if (isPremiumActive) {
    // PREMIUM UI
    planStatus.className = 'plan-status premium';
    const expDate = plan.expiresAt ? new Date(plan.expiresAt).toLocaleDateString() : 'N/A';
    planStatus.innerHTML = `<i class="fas fa-crown"></i> Premium Plan Active <span style="font-size:11px;opacity:0.8">(Expires: ${expDate})</span>`;
    premiumBadge.style.display = 'inline';

    // Domain Section
    domainSection.classList.remove('locked');
    const reqStatus = plan.domainRequestStatus || 'none';
    const setupStatus = plan.domainSetupStatus || 'not_started';
    const domainStatus = plan.domainStatus || null;
    const domain = plan.domainRequest || plan.customDomain || '';

    // PRIORITY CHECK: Active domain (final stage)
    if (domainStatus === 'active' || setupStatus === 'verified') {
      const activeDomain = plan.customDomain || domain;
      domainContent.innerHTML = `
        <div class="domain-status-active">
          <i class="fas fa-check-circle"></i>
          <p style="color: #22c55e; font-weight: 700; margin-top: 8px;">✅ Domain Active</p>
        </div>
        <a class="domain-link" href="https://${activeDomain}" target="_blank">${activeDomain}</a>
        <p class="domain-note">Your store is live on this domain</p>
        <button class="btn-success" onclick="copyDomainLink('${activeDomain}')" style="margin-top:8px;">📋 Copy Domain Link</button>
      `;
    }
    // DNS Pending Verification
    else if (reqStatus === 'approved' && setupStatus === 'pending') {
      domainContent.innerHTML = `
        <div class="domain-status-setup">
          <i class="fas fa-clock"></i>
          <p style="color: #3b82f6; font-weight: 700; margin-top: 8px;">⏳ DNS Verification Pending</p>
          <p class="domain-note" style="margin-top:5px;">Domain: <b>${domain}</b></p>
        </div>
        <p class="domain-note" style="margin-top: 10px;">You have configured DNS. Admin is verifying your settings...</p>
        <button class="btn-domain" onclick="checkDomainStatus()" style="margin-top:8px;">🔄 Check Status</button>
      `;
    }
// Approved but DNS setup not started yet
else if (reqStatus === 'approved' && setupStatus === 'not_started') {
  domainContent.innerHTML = `
    <div class="domain-status-approved">
      <i class="fas fa-check-circle"></i>
      <p style="color: #22c55e; font-weight: 700; margin-top: 8px;">✅ Domain Approved!</p>
      <p class="domain-note" style="margin-top:5px;">Domain: <b>${domain}</b></p>
    </div>

    <div class="domain-instructions" style="margin-top:15px; background: rgba(34, 197, 94, 0.08); border-color: #22c55e;">
      <h5 style="color: #22c55e;"><i class="fas fa-cogs"></i> Setup DNS Records (GoDaddy / Namecheap):</h5>

      <p style="margin: 10px 0 6px; font-weight: 600;">📌 Step 1 — Login to your domain registrar and open DNS Settings</p>

      <p style="margin: 8px 0 4px; font-weight: 600;">🔷 Add 4 A Records (Root Domain <code>@</code>):</p>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:rgba(34,197,94,0.15);">
            <th style="padding:6px 8px; text-align:left;">Type</th>
            <th style="padding:6px 8px; text-align:left;">Name / Host</th>
            <th style="padding:6px 8px; text-align:left;">Value / Points To</th>
            <th style="padding:6px 8px; text-align:left;">TTL</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:5px 8px;">A</td><td>@</td><td><b style="color:#22c55e;">185.199.108.153</b></td><td>auto</td></tr>
          <tr><td style="padding:5px 8px;">A</td><td>@</td><td><b style="color:#22c55e;">185.199.109.153</b></td><td>auto</td></tr>
          <tr><td style="padding:5px 8px;">A</td><td>@</td><td><b style="color:#22c55e;">185.199.110.153</b></td><td>auto</td></tr>
          <tr><td style="padding:5px 8px;">A</td><td>@</td><td><b style="color:#22c55e;">185.199.111.153</b></td><td>auto</td></tr>
        </tbody>
      </table>

      <p style="margin: 12px 0 4px; font-weight: 600;">🔶 Add 1 CNAME Record (www subdomain):</p>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:rgba(34,197,94,0.15);">
            <th style="padding:6px 8px; text-align:left;">Type</th>
            <th style="padding:6px 8px; text-align:left;">Name / Host</th>
            <th style="padding:6px 8px; text-align:left;">Value / Points To</th>
            <th style="padding:6px 8px; text-align:left;">TTL</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:5px 8px;">CNAME</td><td>www</td><td><b style="color:#22c55e;">daniyal20251.github.io</b></td><td>auto</td></tr>
        </tbody>
      </table>

      <p style="margin-top:12px; font-size:13px;">⏱️ DNS changes usually take <b>5–30 minutes</b> to propagate. Once done, click the button below.</p>
    </div>

    <button class="btn-success" onclick="markSetupDone()" style="margin-top:10px;">
      <i class="fas fa-check-double"></i> I Have Configured DNS
    </button>
    <p class="domain-note" style="margin-top:8px;">Admin will verify and activate your domain</p>
  `;
}
    // Pending admin approval
    else if (reqStatus === 'pending' && domain) {
      domainContent.innerHTML = `
        <div class="domain-status-pending">
          <i class="fas fa-clock"></i>
          <p style="color: #f59e0b; font-weight: 700; margin-top: 8px;">⏳ Under Review</p>
          <p class="domain-note" style="margin-top:5px;">Requested: <b>${domain}</b></p>
        </div>
        <p class="domain-note" style="margin-top: 10px;">Admin is reviewing your domain request. Please wait for approval.</p>
        <button class="btn-domain" onclick="checkDomainStatus()" style="margin-top:8px;">🔄 Check Status</button>
      `;
    }
    // Rejected by admin
    else if (reqStatus === 'rejected' && domain) {
      domainContent.innerHTML = `
        <div class="domain-status-rejected">
          <i class="fas fa-times-circle"></i>
          <p style="color: #ef4444; font-weight: 700; margin-top: 8px;">❌ Request Rejected</p>
          <p class="domain-note">${plan.domainRejectedReason || 'Contact admin for details'}</p>
        </div>
        <p class="domain-note" style="margin:10px 0;">You can submit a new request:</p>
        <input type="text" class="domain-input" id="domainInput" placeholder="your-domain.com">
        <button class="btn-domain" onclick="saveDomain()" style="width:100%; padding:10px; font-size:14px;">📝 Submit New Request</button>
      `;
    }
    // No request yet - show form
    else {
      domainContent.innerHTML = `
        <p class="domain-note" style="margin-bottom:10px;">Connect your own domain to your store</p>
        <input type="text" class="domain-input" id="domainInput" placeholder="your-domain.com or shop.yourdomain.com">
        <button class="btn-domain" onclick="saveDomain()" style="width:100%; padding:10px; font-size:14px;">📝 Request Domain</button>
        <p class="domain-note" style="margin-top:10px;">⚠️ Do NOT use delightpk.shop</p>
      `;
    }

    // Ads
    if (adsLockedOverlay) adsLockedOverlay.style.display = 'none';
    if (adsUnlockedSection) adsUnlockedSection.style.display = 'block';

    // Analytics
    if (analyticsLockedOverlay) analyticsLockedOverlay.style.display = 'none';
    if (analyticsUnlockedSection) analyticsUnlockedSection.style.display = 'block';

    // Fake Reviews - UNLOCKED for premium
    if (fakeReviewsLockedOverlay) fakeReviewsLockedOverlay.style.display = 'none';
    if (fakeReviewsUnlockedSection) fakeReviewsUnlockedSection.style.display = 'block';

    // Load products for fake reviews
    loadSellerProducts();

    if (upgradeBtn) upgradeBtn.style.display = 'none';

  } else {
    // FREE or EXPIRED UI
    planStatus.className = plan.isExpired ? 'plan-status expired' : 'plan-status free';
    if (plan.isExpired) {
      planStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Premium Expired - Renew Now';
    } else {
      planStatus.innerHTML = '<i class="fas fa-store"></i> Free Plan Active';
    }
    premiumBadge.style.display = 'none';

    // Domain locked
    domainSection.classList.add('locked');
    domainContent.innerHTML = `
      <p class="domain-note" id="domainNote">🔒 Upgrade to Premium to connect your own domain</p>
    `;

    // Ads locked
    if (adsLockedOverlay) adsLockedOverlay.style.display = 'block';
    if (adsUnlockedSection) adsUnlockedSection.style.display = 'none';

    // Analytics locked
    if (analyticsLockedOverlay) analyticsLockedOverlay.style.display = 'block';
    if (analyticsUnlockedSection) analyticsUnlockedSection.style.display = 'none';

    // Fake Reviews locked
    if (fakeReviewsLockedOverlay) fakeReviewsLockedOverlay.style.display = 'block';
    if (fakeReviewsUnlockedSection) fakeReviewsUnlockedSection.style.display = 'none';

    // Show upgrade
    if (upgradeBtn) upgradeBtn.style.display = 'block';
  }
}

// ===== CHECK ANALYTICS ACCESS (for nav bar) =====
function checkAnalyticsAccess(event) {
  const seller = getSeller();
  if (!seller) {
    event.preventDefault();
    window.location.href = "login.html";
    return false;
  }

  // Check if premium using latest sellerPlan
  const isPremium = sellerPlan && (sellerPlan.plan === 'premium' || sellerPlan.plan === 'yearly') && !sellerPlan.isExpired;

  if (!isPremium) {
    event.preventDefault();
    showToast("🔒 Premium Feature", "Analytics is only available for Premium users. Upgrade now!", "fa-lock");
    setTimeout(() => {
      window.location.href = "subscription.html";
    }, 1500);
    return false;
  }

  return true;
}

function goToAnalytics() {
  window.location.href = "Analytics.html";
}

// ===== PRODUCTS TOGGLE LIST =====
let productsListOpen = false;

function toggleProductsList() {
  const body = document.getElementById('productsToggleBody');
  const arrow = document.getElementById('productsToggleArrow');
  productsListOpen = !productsListOpen;

  if (productsListOpen) {
    body.classList.add('open');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    body.classList.remove('open');
    arrow.style.transform = 'rotate(0deg)';
  }
}

async function loadSellerProducts() {
  const seller = getSeller();
  if (!seller) return;

  const listContainer = document.getElementById('productsList');
  const countBadge = document.getElementById('productsCount');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/products/${seller.phone}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const products = await res.json();
    sellerProducts = products || [];

    if (countBadge) countBadge.textContent = sellerProducts.length;

    if (!sellerProducts.length) {
      listContainer.innerHTML = `
        <div class="products-empty">
          <i class="fas fa-box-open"></i>
          <p>No products uploaded yet</p>
          <button class="btn-upload-first" onclick="goToSellerPanel()">📤 Upload Your First Product</button>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = sellerProducts.map(p => {
      const title = p.title || 'Untitled Product';
      const image = p.images && p.images.length ? p.images[0] : 'https://via.placeholder.com/60x60?text=No+Image';

      return `
        <div class="product-toggle-item" onclick="selectProductForFakeReview(${p.id}, this)">
          <img src="${image}" alt="${title}" class="product-toggle-img" loading="lazy">
          <div class="product-toggle-info">
            <div class="product-toggle-title">${title}</div>
          </div>
          <div class="product-toggle-select">
            <i class="fas fa-chevron-right"></i>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Load products error:", err);
    listContainer.innerHTML = `
      <div class="products-error">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load products</p>
        <button class="btn-retry" onclick="loadSellerProducts()">🔄 Retry</button>
      </div>
    `;
  }
}

function selectProductForFakeReview(productId, element) {
  // Remove active from all
  document.querySelectorAll('.product-toggle-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');

  selectedProductId = productId;
  selectedProductData = sellerProducts.find(p => p.id === productId);

  const panel = document.getElementById('fakeReviewPanel');
  const productInfo = document.getElementById('fakeReviewProductInfo');

  if (selectedProductData) {
    const image = selectedProductData.images && selectedProductData.images.length ? selectedProductData.images[0] : '';

    productInfo.innerHTML = `
      <img src="${image}" alt="${selectedProductData.title}" class="fake-review-product-img">
      <div class="fake-review-product-details">
        <div class="fake-review-product-title">${selectedProductData.title}</div>
        <div class="fake-review-product-id">ID: #${selectedProductData.id}</div>
      </div>
    `;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Load existing fake reviews for this product
    loadFakeReviewsForProduct(productId);
  }
}

// ===== STAR RATING INPUT =====
function initStarRating() {
  const stars = document.querySelectorAll('#starRatingInput i');
  const hiddenInput = document.getElementById('fakeRatingValue');

  stars.forEach(star => {
    star.addEventListener('click', function() {
      const rating = parseInt(this.dataset.rating);
      fakeReviewRating = rating;
      hiddenInput.value = rating;

      stars.forEach((s, index) => {
        if (index < rating) {
          s.classList.remove('far');
          s.classList.add('fas');
          s.style.color = '#f59e0b';
        } else {
          s.classList.remove('fas');
          s.classList.add('far');
          s.style.color = 'var(--text-secondary)';
        }
      });
    });

    star.addEventListener('mouseenter', function() {
      const rating = parseInt(this.dataset.rating);
      stars.forEach((s, index) => {
        if (index < rating) {
          s.style.color = '#f59e0b';
        } else {
          s.style.color = 'var(--text-secondary)';
        }
      });
    });
  });

  document.getElementById('starRatingInput').addEventListener('mouseleave', function() {
    stars.forEach((s, index) => {
      if (index < fakeReviewRating) {
        s.classList.remove('far');
        s.classList.add('fas');
        s.style.color = '#f59e0b';
      } else {
        s.classList.remove('fas');
        s.classList.add('far');
        s.style.color = 'var(--text-secondary)';
      }
    });
  });

  // Set default 5 stars
  stars.forEach((s, index) => {
    if (index < 5) {
      s.classList.remove('far');
      s.classList.add('fas');
      s.style.color = '#f59e0b';
    }
  });
}

// ===== FAKE REVIEW IMAGE UPLOAD =====
// Image upload removed per request



// ===== SUBMIT FAKE REVIEW =====
async function submitFakeReview() {
  if (!selectedProductId) {
    showToast("⚠️ Select Product", "Please select a product from the list first", "fa-exclamation-triangle");
    return;
  }

  const buyerName = document.getElementById('fakeBuyerName').value.trim();
  const message = document.getElementById('fakeReviewMessage').value.trim();
  const rating = parseInt(document.getElementById('fakeRatingValue').value) || 5;
  const seller = getSeller();

  if (!buyerName) {
    showToast("⚠️ Missing Name", "Please enter a buyer name", "fa-exclamation-triangle");
    return;
  }

  // Auto-generate unique fake phone
  const fakePhone = '03' + Math.floor(100000000 + Math.random() * 899999999);

  const formData = new FormData();
  formData.append('sellerPhone', seller.phone);
  formData.append('buyerPhone', fakePhone);
  formData.append('buyerName', buyerName);
  formData.append('rating', rating);
  formData.append('message', message);

  try {
    showToast("⏳ Submitting...", "Adding fake review...", "fa-spinner fa-spin");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${API_BASE}/admin/add-fake-review/${selectedProductId}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.success) {
      showToast("✅ Success!", "Fake review added successfully", "fa-check");
      // Clear form
      document.getElementById('fakeBuyerName').value = '';
      document.getElementById('fakeReviewMessage').value = '';
      // Reload reviews
      loadFakeReviewsForProduct(selectedProductId);
    } else {
      showToast("❌ Error", data.message || "Failed to add review", "fa-times");
    }
  } catch (err) {
    console.error("Submit fake review error:", err);
    showToast("❌ Error", "Network error. Please try again.", "fa-times");
  }
}

// ===== LOAD FAKE REVIEWS FOR PRODUCT =====
async function loadFakeReviewsForProduct(productId) {
  const listContainer = document.getElementById('fakeReviewsList');
  listContainer.innerHTML = `
    <div class="fake-reviews-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>Loading reviews...</span>
    </div>
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/reviews/${productId}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (!data.success || !data.reviews || !data.reviews.length) {
      listContainer.innerHTML = `
        <div class="empty-fake-reviews">
          <i class="fas fa-comment-slash"></i>
          <p>No fake reviews yet for this product</p>
        </div>
      `;
      return;
    }

    const fakeReviews = data.reviews.filter(r => r.isFake === true);

    if (!fakeReviews.length) {
      listContainer.innerHTML = `
        <div class="empty-fake-reviews">
          <i class="fas fa-comment-slash"></i>
          <p>No fake reviews yet for this product</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = fakeReviews.map(r => {
      const stars = Array(5).fill(0).map((_, i) => 
        i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>'
      ).join('');

      return `
        <div class="fake-review-item">
          <div class="fake-review-item-header">
            <div class="fake-review-item-avatar">${r.buyerName.charAt(0).toUpperCase()}</div>
            <div class="fake-review-item-info">
              <div class="fake-review-item-name">${r.buyerName}</div>
              <div class="fake-review-item-stars">${stars}</div>
            </div>
            <div class="fake-review-item-badge">FAKE</div>
          </div>
          <div class="fake-review-item-message">${r.message || 'No message'}</div>
          <div class="fake-review-item-date">${new Date(r.createdAt).toLocaleDateString()}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Load fake reviews error:", err);
    listContainer.innerHTML = `
      <div class="fake-reviews-error">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load reviews</p>
      </div>
    `;
  }
}

// ===== DOMAIN FUNCTIONS =====
async function saveDomain() {
  const input = document.getElementById('domainInput');
  if (!input) return;

  const domain = input.value.trim().toLowerCase();
  if (!domain || !domain.includes('.')) {
    showToast("⚠️ Invalid Domain", "Please enter a valid domain like: yourstore.com", "fa-exclamation-triangle");
    return;
  }

  if (domain.includes('delightpk.shop') || domain.includes('replit.app') || domain.includes('railway.app')) {
    showToast("❌ Not Allowed", "Use your own domain, not our platform domain", "fa-times");
    return;
  }

  const seller = getSeller();
  if (!seller) {
    showToast("❌ Error", "Please login first", "fa-times");
    return;
  }

  // LOCK immediately in UI
  saveDomainData({
    domain: domain,
    status: 'pending',
    setupStatus: 'not_started',
    requestedAt: new Date().toISOString()
  });

  updateUIForPlan({
    plan: 'premium',
    isExpired: false,
    domainRequestStatus: 'pending',
    domainSetupStatus: 'not_started',
    domainRequest: domain
  });

  showToast("✅ Request Sent", "Domain request submitted. Waiting for admin approval...", "fa-check");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/seller/update-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: seller.phone, domain }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (!data.success) {
      showToast("⚠️ Server Error", data.message || "Saved locally, will sync later", "fa-exclamation-triangle");
    }
  } catch (err) {
    console.error("Backend error:", err);
    showToast("ℹ️ Saved Locally", "Request saved. Will sync when online.", "fa-info-circle");
  }
}

async function checkDomainStatus() {
  const seller = getSeller();
  if (!seller) return;

  showToast("🔄 Checking...", "Fetching latest status from server", "fa-sync");

  const plan = await fetchFullPlanStatus();
  if (plan) {
    updateUIForPlan(plan);

    if (plan.domainRequestStatus === 'approved' && plan.domainSetupStatus === 'not_started') {
      showToast("✅ Approved!", `Your domain ${plan.domainRequest} is approved. Please configure DNS.`, "fa-check");
    } else if (plan.domainRequestStatus === 'approved' && plan.domainSetupStatus === 'pending') {
      showToast("⏳ Pending", "DNS verification in progress. Please wait.", "fa-clock");
    } else if (plan.domainRequestStatus === 'pending') {
      showToast("⏳ Pending", "Still under admin review. Please wait.", "fa-clock");
    } else if (plan.domainRequestStatus === 'rejected') {
      showToast("❌ Rejected", plan.domainRejectedReason || "Domain request rejected", "fa-times");
    } else if (plan.domainStatus === 'active' || plan.domainSetupStatus === 'verified') {
      showToast("✅ Active!", "Your domain is now live!", "fa-check");
    }
  } else {
    const localData = getDomainData();
    if (localData) {
      updateUIForPlan({
        plan: 'premium',
        isExpired: false,
        domainRequestStatus: localData.status,
        domainSetupStatus: localData.setupStatus || 'not_started',
        domainRequest: localData.domain
      });
    }
  }
}

async function markSetupDone() {
  const seller = getSeller();
  const localData = getDomainData();

  const domain = localData?.domain || sellerPlan?.domainRequest || sellerPlan?.customDomain;
  if (!domain) {
    showToast("❌ Error", "No domain found", "fa-times");
    return;
  }

  // Update local status immediately
  saveDomainData({
    domain: domain,
    status: 'approved',
    setupStatus: 'pending',
    setupDoneAt: new Date().toISOString()
  });

  // Update UI immediately
  updateUIForPlan({
    plan: 'premium',
    isExpired: false,
    domainRequestStatus: 'approved',
    domainSetupStatus: 'pending',
    domainRequest: domain
  });

  showToast("✅ Submitted", "Admin will verify your DNS configuration", "fa-check");

  // Call backend
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/seller/mark-setup-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: seller.phone }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.success) {
      showToast("✅ Confirmed", data.message, "fa-check");
    } else {
      showToast("⚠️ Note", data.message, "fa-exclamation-triangle");
    }
  } catch (err) {
    console.error("Backend sync error:", err);
    showToast("⚠️ Sync Issue", "Saved locally. Will retry.", "fa-exclamation-triangle");
  }
}

function copyDomainLink(domain) {
  const link = `https://${domain}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast("✅ Copied!", "Domain link copied to clipboard", "fa-check");
  }).catch(() => {
    showToast("❌ Error", "Could not copy", "fa-times");
  });
}

// ===== EXISTING FUNCTIONS =====
const profileImg = document.getElementById("profile-img");
const plusSign = document.querySelector(".plus-sign");
const storeInput = document.getElementById("storeName");
const fileInput = document.getElementById("file-upload");
const profileContainer = document.getElementById("profilePicContainer");
const deliveryInput = document.getElementById("deliveryInput");
const storeLinkBox = document.getElementById("storeLinkBox");
const storeLink = document.getElementById("storeLink");
const loaderOverlay = document.getElementById("loaderOverlay");
const mainContainer = document.getElementById("mainContainer");
const adsBtnWrapper = document.getElementById("adsBtnWrapper");

profileContainer.addEventListener("click", () => fileInput.click());

const seller = getSeller();
if (!seller) window.location.href = "signup.html";

function checkAdminAccess() {
  if (seller && seller.phone === "03352166725") {
    if (adsBtnWrapper) adsBtnWrapper.style.display = "block";
  }
}

function showToast(title, message, icon = "fa-bell") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <div class="toast-icon"><i class="fas ${icon}"></i></div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 5000);
}

let lastOrderCount = 0;
let checkedOnce = false;
function updateBadge(count) {
  const badge = document.getElementById("orderBadge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";
    if (checkedOnce && count > lastOrderCount) {
      const newOrders = count - lastOrderCount;
      showToast("🛒 New Order" + (newOrders > 1 ? "s" : "") + "!", `${newOrders} new order${newOrders > 1 ? 's' : ''} received.`, "fa-box-open");
    }
  } else {
    badge.style.display = "none";
  }
  lastOrderCount = count;
  checkedOnce = true;
}

// ===== CHAT BADGE =====
let lastChatCount = 0;
let chatCheckedOnce = false;
function updateChatBadge(count) {
  const badge = document.getElementById("chatBadge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";
    if (chatCheckedOnce && count > lastChatCount) {
      const newMsgs = count - lastChatCount;
      showToast("💬 New Message" + (newMsgs > 1 ? "s" : "") + "!", `${newMsgs} new message${newMsgs > 1 ? 's' : ''} received.`, "fa-comments");
    }
  } else {
    badge.style.display = "none";
  }
  lastChatCount = count;
  chatCheckedOnce = true;
}

async function checkUnreadChats() {
  if (!seller) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${API_BASE}/chat/unread/${seller.phone}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data && data.success) {
      updateChatBadge(data.unreadCount || 0);
    }
  } catch (err) { 
    console.error("Chat check failed:", err.message); 
  }
}

async function checkNewOrders() {
  if (!seller) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${API_BASE}/seller-orders/${seller.phone}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const orders = await res.json();
    if (!orders || !Array.isArray(orders)) return;
    const pendingCount = orders.filter(o => o.status === "Pending").length;
    updateBadge(pendingCount);
  } catch (err) { 
    console.error("Order check failed:", err.message); 
  }
}

function generateStoreLink() {
  if (!seller) return;
  const phone = seller.phone;
  const link = `https://delightpk.shop/Store.html?phone=${phone}`;
  storeLink.href = link;
  storeLink.innerText = link;
  storeLinkBox.style.display = "block";
}

function copyStoreLink() {
  const link = storeLink.href;
  if (!link) return;

  navigator.clipboard.writeText(link).then(() => {
    showToast("✅ Copied!", "Store link copied to clipboard", "fa-check");
  }).catch(() => {
    const input = document.createElement("input");
    input.value = link;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showToast("✅ Copied!", "Store link copied to clipboard", "fa-check");
  });
}

async function loadSettings() {
  if (!seller) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/settings?phone=${seller.phone}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.logo) { 
      profileImg.src = data.logo; 
      profileImg.style.display = "block"; 
      if (plusSign) plusSign.style.display = "none"; 
    }

    if (data.name) { 
      storeInput.value = data.name; 
      document.getElementById("welcomeText").innerText = "Hello, " + data.name + " 👋"; 
    } else { 
      document.getElementById("welcomeText").innerText = "Hello, " + (seller.name || "Seller") + " 👋"; 
    }

    if (data.delivery) { 
      deliveryInput.value = data.delivery; 
    }

    generateStoreLink();
    await checkNewOrders();
    await checkUnreadChats();
    checkAdminAccess();

    // Load plan with domain data
    const plan = await fetchFullPlanStatus();
    updateUIForPlan(plan);

    // Init star rating
    initStarRating();

  } catch (err) { 
    console.error("Load settings error:", err.message);
    document.getElementById("welcomeText").innerText = "Hello, " + (seller?.name || "Seller") + " 👋";
    updateUIForPlan(null);
  }
}

window.addEventListener("load", async () => {
  await loadSettings();
  loaderOverlay.classList.add("hidden");
  mainContainer.classList.add("loaded");
});

async function updateProfile() {
  if (!seller) {
    showToast("❌ Error", "Please login first", "fa-times");
    return;
  }

  const formData = new FormData();
  formData.append("phone", seller.phone);
  formData.append("name", storeInput.value || "");
  formData.append("delivery", deliveryInput.value || "");

  if (fileInput.files && fileInput.files[0]) {
    formData.append("logo", fileInput.files[0]);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/update-settings`, { 
      method: "POST", 
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (data.success) { 
      document.getElementById("welcomeText").innerText = "Hello, " + (storeInput.value || seller.name || "Seller") + " 👋"; 
      if (data.seller?.logo) {
        profileImg.src = data.seller.logo;
        profileImg.style.display = "block";
        if (plusSign) plusSign.style.display = "none";
      }
      showToast("✅ Success!", "Store updated successfully", "fa-check");
    } else { 
      showToast("⚠️ Error", data.message || "Something went wrong", "fa-exclamation-triangle"); 
    }
  } catch (err) { 
    console.error("Update error:", err.message);
    showToast("⚠️ Error", "Cannot update store. Check connection.", "fa-exclamation-triangle"); 
  }
}

function goToSellerPanel() { window.location.href = "Seller Panel.html"; }
function goToUploadAds() { window.location.href = "Sellers Ads.html"; }
function goToSubscription() { window.location.href = "subscription.html"; }
function goToMyStore() { 
  if (seller) localStorage.setItem("sellerPhone", seller.phone); 
  window.location.href = "myStore.html"; 
}
function goToOrders() { 
  if (seller) localStorage.setItem("sellerOrdersData", JSON.stringify({name: storeInput.value || seller.name, phone: seller.phone})); 
  window.location.href = "sellerOrders.html"; 
}
function logout() { 
  localStorage.removeItem("seller"); 
  window.location.href = "login.html"; 
}

// Order checking interval
setInterval(() => {
  if (seller) {
    checkNewOrders();
    checkUnreadChats();
  }
}, 10000);