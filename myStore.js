let allProducts = [];

// Elements
const itemContainer = document.getElementById("itemContainer");
const sellerNameEl = document.getElementById("sellerName");
const sellerLogoEl = document.getElementById("sellerLogo");
const searchInput = document.getElementById("searchInput");
const searchPanel = document.getElementById("searchPanel");
const recentList = document.getElementById("recentSearches");
const clearBtn = document.getElementById("clearHistoryBtn");

const API_BASE = "https://delight-backend--araindaniyalo2.replit.app";

// Recent searches
let recentSearches = JSON.parse(localStorage.getItem("recentSearches")) || [];

// Format price (remove non-digits)
function parsePrice(str) {
  return parseInt(String(str).replace(/[^\d]/g, "")) || 0;
}

// Load data on page load
document.addEventListener("DOMContentLoaded", async () => {
  const sellerPhone = localStorage.getItem("sellerPhone");

  if (!sellerPhone) {
    itemContainer.innerHTML = `<p style="text-align:center;color:#777;grid-column:1/-1;padding:40px 0;">⚠️ Seller not found! Please login.</p>`;
    return;
  }

  try {
    // Fetch seller info
    const storeRes = await fetch(`${API_BASE}/seller/${sellerPhone}`);
    const storeData = await storeRes.json();

    if (storeData.success && storeData.seller) {
      sellerNameEl.textContent = storeData.seller.name || "DELIGHT.PK";
      sellerLogoEl.src = storeData.seller.logo || "lo.png";
    }

    // Fetch products
    const res = await fetch(`${API_BASE}/products/${sellerPhone}`);
    allProducts = await res.json();

    if (!Array.isArray(allProducts) || !allProducts.length) {
      renderProducts([]);
      return;
    }

    // NO SHUFFLE — keep original order (newest first from API)
    renderProducts(allProducts);

  } catch (err) {
    console.error(err);
    itemContainer.innerHTML = `<p style="text-align:center;color:#f44336;grid-column:1/-1;padding:40px 0;">⚠️ Error loading products!</p>`;
  }
});

// Increment view count
async function incrementView(productId) {
  try {
    await fetch(`${API_BASE}/products/${productId}/view`, { method: "POST" });
  } catch (err) {
    console.error("View count error:", err);
  }
}

// Create upload card (always first)
function createUploadCard() {
  const card = document.createElement("a");
  card.href = "Seller Panel.html";
  card.className = "upload-card";
  card.innerHTML = `
    <div class="upload-icon">
      <i class="fas fa-plus"></i>
    </div>
    <span class="upload-label">Upload Product</span>
    <span class="upload-sub">Tap to add new item</span>
  `;
  return card;
}

// Create product card
function createProductCard(item) {
  const card = document.createElement("div");
  card.className = "item-card";

  const basePrice = parsePrice(item.price);
  const discount = parsePrice(item.discount);
  const finalPrice = basePrice - discount;
  const views = item.views || 0;

  card.innerHTML = `
    <div class="views-badge">
      <i class="fas fa-eye"></i>
      <span>${views}</span>
    </div>
    <button class="delete-btn" title="Delete">&times;</button>
    <img src="${item.images?.[0] || 'default.jpg'}" alt="${item.title}" loading="lazy">
    <div class="card-body">
      <h3>${item.title}</h3>
      <div class="price-wrapper">
        ${discount > 0
          ? `<span class="new-price">Rs. ${finalPrice.toLocaleString()}</span>
             <span class="old-price">Rs. ${basePrice.toLocaleString()}</span>`
          : `<span class="new-price">Rs. ${basePrice.toLocaleString()}</span>`
        }
      </div>
    </div>
  `;

  // Click to edit (image, title, price)
  const openEdit = () => {
    incrementView(item.id);
    localStorage.setItem("editItem", JSON.stringify(item));
    window.location.href = "ItemEdit.html";
  };

  card.querySelector("img").onclick = openEdit;
  card.querySelector("h3").onclick = openEdit;
  card.querySelector(".price-wrapper").onclick = openEdit;

  // Delete product
  card.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${item.title}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/products/${item.id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        allProducts = allProducts.filter(p => p.id !== item.id);
        renderProducts(allProducts);
      } else {
        alert("⚠️ Failed to delete product");
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ Error deleting product");
    }
  });

  return card;
}

// Render products — upload card always first, then products (newest at top)
function renderProducts(list) {
  itemContainer.innerHTML = "";

  // 1. Upload card — always first
  itemContainer.appendChild(createUploadCard());

  // 2. Products — no shuffle, original order preserved
  if (!list.length) {
    const msg = document.createElement("div");
    msg.className = "not-found";
    msg.innerHTML = `
      <img src="Delight icons/not-found.png" alt="Not found">
      <h3>No Products Yet</h3>
      <p>Tap "Upload Product" to add your first item.</p>
    `;
    itemContainer.appendChild(msg);
    return;
  }

  list.forEach(item => {
    itemContainer.appendChild(createProductCard(item));
  });
}

// Render recent searches
function renderRecentSearches() {
  recentList.innerHTML = "";

  if (recentSearches.length === 0) {
    recentList.innerHTML = `<li style="color:#999;padding:10px 4px;">No recent searches</li>`;
    return;
  }

  recentSearches.forEach(term => {
    const li = document.createElement("li");
    li.textContent = term;
    li.onclick = () => fillAndSearch(term);
    recentList.appendChild(li);
  });
}

// Search panel — open on focus
searchInput.addEventListener("focus", () => {
  renderRecentSearches();
  searchPanel.classList.add("active");
});

// Close panel on outside click
document.addEventListener("click", (e) => {
  if (!searchPanel.contains(e.target) && e.target !== searchInput) {
    searchPanel.classList.remove("active");
  }
});

// Enter key search
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchItems();
  }
});

// Search function
function searchItems() {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    renderProducts(allProducts);
    return;
  }

  if (!recentSearches.includes(term)) {
    recentSearches.unshift(term);
    if (recentSearches.length > 6) recentSearches.pop();
    localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  }

  renderRecentSearches();
  filterProducts(term);
  searchPanel.classList.remove("active");
}

// Filter products
function filterProducts(term) {
  const matched = allProducts.filter(p =>
    p.title.toLowerCase().includes(term)
  );

  itemContainer.innerHTML = "";
  itemContainer.appendChild(createUploadCard());

  if (!matched.length) {
    const msg = document.createElement("div");
    msg.className = "not-found";
    msg.innerHTML = `
      <img src="Delight icons/not-found.png" alt="Not found">
      <h3>Oops! Item Not Found.</h3>
      <p>Try searching with a different keyword.</p>
    `;
    itemContainer.appendChild(msg);
    return;
  }

  matched.forEach(item => {
    itemContainer.appendChild(createProductCard(item));
  });
}

// Fill search and trigger
function fillAndSearch(term) {
  searchInput.value = term;
  searchItems();
}

// Clear history
clearBtn.addEventListener("click", () => {
  localStorage.removeItem("recentSearches");
  recentSearches = [];
  renderRecentSearches();
});