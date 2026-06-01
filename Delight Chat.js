const API_BASE = "https://delight-backend--araindaniyalo2.replit.app";

// ─── State ───
let currentProduct = null;   // { id, title, imageUrls[], price, discount, ... }
let currentSeller = null;    // from localStorage "seller"
let currentCustomer = null;  // { phone } — backend has no /customer/:phone endpoint
let threadId = null;
let chatMessages = [];
let isLoggedIn = false;
let pollTimer = null;
let lastMsgCount = -1;
let pendingImages = [];

// ─── Helpers ───
// Format phone: "03133196789" → "03133196XXX"
function maskPhone(phone) {
  const p = String(phone || "").trim();
  if (p.length >= 7) return p.slice(0, -3) + "XXX";
  return p;
}

// Generate initials avatar on canvas
function makeInitialsAvatar(text, color) {
  const initials = String(text || "?").toUpperCase().slice(0, 2);
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color || "#ef6c00";
  ctx.fillRect(0, 0, 80, 80);
  ctx.fillStyle = "white";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, 40, 42);
  return canvas.toDataURL();
}

// ─── DOM Ready ───
document.addEventListener("DOMContentLoaded", async function () {

  // 1. Seller auth check
  const seller = JSON.parse(localStorage.getItem("seller") || "null");
  if (!seller || !seller.phone) {
    showLoginModal();
    return;
  }
  currentSeller = seller;
  isLoggedIn = true;

  // 2. Parse URL params
  const urlParams = new URLSearchParams(window.location.search);
  const buyerPhoneParam  = urlParams.get("buyer");
  const productIdParam   = urlParams.get("productId");
  const productTitleParam = urlParams.get("product");
  const threadIdParam    = urlParams.get("thread") || urlParams.get("threadId");

  // 3. Set buyer from URL (backend has no /customer endpoint — buyer is just a phone)
  if (buyerPhoneParam) {
    currentCustomer = { phone: buyerPhoneParam };
  }

  // 4. Set thread ID
  if (threadIdParam) {
    threadId = Number(threadIdParam);
  }

  // 5. Load thread info from backend — this gives us thread + messages
  //    Backend: GET /chat/:threadId → { success, messages[], thread: { buyerPhone, sellerPhone, productId } }
  if (threadId) {
    await loadThreadInfo(threadId);
  }

  // 6. If product not loaded yet, try URL param
  if (!currentProduct && (productIdParam || productTitleParam)) {
    await loadProductById(productIdParam, productTitleParam);
  }

  // 7. If product still not set, try localStorage
  if (!currentProduct) {
    const cached = localStorage.getItem("selectedItem");
    if (cached) {
      try { currentProduct = JSON.parse(cached); } catch(e) {}
    }
  }

  // 8. Update header with buyer info
  updateHeader();

  // 9. Show product bar if product available
  if (currentProduct) showProductBar();

  // 10. If no threadId at all, start a new thread (buyer-initiated flow)
  if (!threadId) {
    await startThread();
  }

  // 11. Render any cached messages, then start polling
  renderMessages();
  startPolling();

  // 12. Mark messages read
  if (threadId && currentSeller) markRead();

  // 13. Input events
  setupInputEvents();
});

// ─── loadThreadInfo ───
// GET /chat/:threadId → { success, count, messages[], thread: { threadId, buyerPhone, sellerPhone, productId } }
async function loadThreadInfo(tid) {
  try {
    const res = await fetch(API_BASE + "/chat/" + tid);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    // Get thread metadata
    const thread = data.thread || {};

    // Set buyer from thread if not already set via URL
    if (!currentCustomer && thread.buyerPhone) {
      currentCustomer = { phone: thread.buyerPhone };
    }

    // Load product from thread's productId if not set
    if (!currentProduct && thread.productId) {
      await loadProductById(String(thread.productId), null);
    }

    // Cache messages
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      chatMessages = data.messages;
      lastMsgCount = data.messages.length;
    }

  } catch (err) {
    console.warn("[loadThreadInfo] Error:", err);
  }
}

// ─── loadProductById ───
// Backend: GET /products returns array with { id, title, price, discount, imageUrls[], sellerPhone, ... }
async function loadProductById(productId, productTitle) {
  try {
    const res = await fetch(API_BASE + "/products");
    if (!res.ok) return;
    const products = await res.json();
    const list = Array.isArray(products) ? products : (products.products || []);

    if (productId) {
      currentProduct = list.find(p => String(p.id) === String(productId) || String(p._id) === String(productId));
    }
    if (!currentProduct && productTitle) {
      const q = decodeURIComponent(productTitle).toLowerCase();
      currentProduct = list.find(p => (p.title || "").toLowerCase() === q);
    }
  } catch (err) {
    console.warn("[loadProductById] Error:", err);
  }
}

// ─── Update Header ───
function updateHeader() {
  const nameEl   = document.getElementById("chatSellerName");
  const logoEl   = document.getElementById("chatSellerLogo");
  const statusEl = document.getElementById("chatSellerStatus");

  if (currentCustomer && currentCustomer.phone) {
    // Buyer view: show masked phone as name, online status
    const masked = maskPhone(currentCustomer.phone);
    if (nameEl) nameEl.textContent = masked;
    if (statusEl) statusEl.textContent = "Online";

    // Avatar: start 4 digits of phone as initials
    const start4 = String(currentCustomer.phone).slice(0,4);
    if (logoEl) logoEl.src = makeInitialsAvatar(start4, "#ef6c00");

  } else {
    // Fallback: show seller's own info
    if (nameEl) nameEl.textContent = currentSeller.shopName || currentSeller.name || "Customer";
    if (statusEl) statusEl.textContent = "Chat";
    if (logoEl) {
      const logoUrl = currentSeller.logo || currentSeller.logoUrl || "";
      logoEl.src = logoUrl || makeInitialsAvatar(
        (currentSeller.name || "S").slice(0, 2), "#ef6c00"
      );
    }
  }
}

// ─── Product Bar ───
// Backend product: { id, title, price (string), discount (string), imageUrls[] }
function showProductBar() {
  const bar   = document.getElementById("chatProductBar");
  const img   = document.getElementById("chatProductImg");
  const title = document.getElementById("chatProductTitle");
  const price = document.getElementById("chatProductPrice");
  if (!currentProduct || !bar) return;

  // imageUrls[] is the backend field name
  const imgSrc = (currentProduct.imageUrls && currentProduct.imageUrls[0])
    || currentProduct.images?.[0]
    || currentProduct.image
    || "noimg.png";

  const basePrice = parseInt(String(currentProduct.price  || "0").replace(/[^\d]/g, "")) || 0;
  const disc      = parseInt(String(currentProduct.discount || "0").replace(/[^\d]/g, "")) || 0;
  const finalPrice = basePrice - disc;

  if (img)   img.src             = imgSrc;
  if (title) title.textContent   = currentProduct.title || "Product";
  if (price) price.textContent   = "Rs. " + finalPrice.toLocaleString();
  bar.style.display = "flex";
}

function viewProduct() {
  if (currentProduct) {
    localStorage.setItem("selectedItem", JSON.stringify(currentProduct));
    window.location.href = "itemDetails.html";
  }
}

// ─── Start Thread (buyer-initiated) ───
async function startThread() {
  if (!currentSeller || !currentCustomer) return;
  try {
    const res = await fetch(API_BASE + "/chat/start-thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerPhone: currentCustomer.phone,
        sellerPhone: currentSeller.phone,
        productId: currentProduct ? currentProduct.id : null,
      }),
    });
    const data = await res.json();
    if (data.success) threadId = data.threadId;
  } catch (err) {
    console.error("[startThread]", err);
  }
}

// ─── Load Messages ───
// GET /chat/:threadId → { success, messages[], thread }
async function loadMessages() {
  if (!threadId) return;
  try {
    const res = await fetch(API_BASE + "/chat/" + threadId);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.messages)) {
      if (data.messages.length !== lastMsgCount) {
        chatMessages = data.messages;
        lastMsgCount = data.messages.length;
        renderMessages();
        markRead();
      }
    }
  } catch (err) {
    console.warn("[loadMessages]", err);
  }
}

// ─── Mark Messages Read ───
async function markRead() {
  if (!threadId || !currentSeller) return;
  try {
    await fetch(API_BASE + "/chat/read/" + threadId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: currentSeller.phone }),
    });
  } catch (e) {}
}

// ─── Polling ───
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, 3000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ─── Render Messages ───
// Backend message fields: { id, orderId, senderType (buyer|seller|admin), senderPhone,
//                           message, images[], isRead, createdAt }
function renderMessages() {
  const container = document.getElementById("chatMessages");
  const welcome   = document.getElementById("chatWelcome");
  if (!container) return;

  if (!chatMessages || chatMessages.length === 0) {
    if (welcome) welcome.style.display = "block";
    return;
  }
  if (welcome) welcome.style.display = "none";

  // Save scroll position — only auto-scroll if already at bottom
  const wasAtBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 60;

  container.innerHTML = "";
  let lastDate = "";

  chatMessages.forEach(function (msg) {

    // ── Date separator ──
    const msgDate = new Date(msg.createdAt).toLocaleDateString();
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const dateDiv = document.createElement("div");
      dateDiv.className = "chat-message system";
      dateDiv.textContent = formatDateLabel(msg.createdAt);
      container.appendChild(dateDiv);
    }

    // ── Determine side ──
    // senderType "seller" → my message → RIGHT (.buyer class)
    // senderType "buyer"  → customer   → LEFT  (.seller class)
    let isMyMessage = false;

    if (msg.senderType === "seller") {
      isMyMessage = true;
    } else if (msg.senderType === "buyer") {
      isMyMessage = false;
    } else {
      // Fallback: phone comparison
      isMyMessage = !!(currentSeller && msg.senderPhone === currentSeller.phone);
    }

    const div = document.createElement("div");
    div.className = "chat-message " + (isMyMessage ? "buyer" : "seller");

    let html = "";

    // Images
    if (msg.images && msg.images.length > 0) {
      html += '<div class="chat-message-images">' +
        msg.images.map(function (imgUrl) {
          const safe = escapeAttr(imgUrl);
          return '<img src="' + safe + '" loading="lazy" onclick="openImageModal(\'' + safe + '\')">';
        }).join("") +
        '</div>';
    }

    // Text
    if (msg.message) {
      html += '<div class="chat-message-text">' + escapeHtml(msg.message) + '</div>';
    }

    // Time + tick
    const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    const tick = isMyMessage
      ? '<span class="chat-read-status" style="color:' + (msg.isRead ? "#4fc3f7" : "inherit") + '">&#10003;&#10003;</span>'
      : "";
    html += '<div class="chat-message-time">' + timeStr + " " + tick + "</div>";

    div.innerHTML = html;
    container.appendChild(div);
  });

  if (wasAtBottom) scrollToBottom();
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str || "").replace(/'/g, "%27").replace(/"/g, "%22");
}

function scrollToBottom() {
  const c = document.getElementById("chatMessages");
  if (c) c.scrollTop = c.scrollHeight;
}

// ─── Send Message ───
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();

  if (!text && pendingImages.length === 0) return;
  if (!isLoggedIn || !currentSeller) { showLoginModal(); return; }
  if (!threadId) { alert("Chat not ready. Please wait a moment and try again."); return; }

  const btn = document.getElementById("chatSendBtn");
  if (btn) btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("threadId",    threadId);
    formData.append("orderId",     threadId);   // backend accepts either
    formData.append("senderType",  "seller");
    formData.append("senderPhone", currentSeller.phone);
    formData.append("sellerPhone", currentSeller.phone);
    formData.append("message",     text);
    if (currentCustomer) formData.append("buyerPhone", currentCustomer.phone);
    if (currentProduct)  formData.append("productId",  currentProduct.id);

    pendingImages.forEach(function (file) { formData.append("images", file); });

    const res  = await fetch(API_BASE + "/chat/send", { method: "POST", body: formData });
    const data = await res.json();

    if (data.success) {
      input.value = "";
      input.placeholder = "Type a message...";
      pendingImages = [];
      hideAttachMenu();
      await loadMessages();
    } else {
      alert(data.message || "Failed to send message");
    }
  } catch (err) {
    console.error("[sendMessage]", err);
    // Show locally on network error
    addLocalMessage(text);
    input.value = "";
  }

  if (btn) btn.disabled = false;
  input.focus();
}

function addLocalMessage(text) {
  const container = document.getElementById("chatMessages");
  const welcome   = document.getElementById("chatWelcome");
  if (welcome) welcome.style.display = "none";
  const div = document.createElement("div");
  div.className = "chat-message buyer";
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  div.innerHTML = '<div class="chat-message-text">' + escapeHtml(text) + '</div>' +
    '<div class="chat-message-time">' + timeStr + ' <span class="chat-read-status" style="opacity:0.5">&#10003;&#10003;</span></div>';
  container.appendChild(div);
  scrollToBottom();
}

// ─── Input Events ───
function setupInputEvents() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.addEventListener("click", function (e) {
    const menu = document.getElementById("chatAttachMenu");
    const attachBtn = document.querySelector(".chat-attach-btn");
    if (menu && !menu.contains(e.target) && e.target !== attachBtn) {
      menu.style.display = "none";
    }
  });
}

// ─── Attach Menu ───
function toggleAttachMenu() {
  const menu = document.getElementById("chatAttachMenu");
  if (menu) menu.style.display = menu.style.display === "none" ? "flex" : "none";
}
function hideAttachMenu() {
  const menu = document.getElementById("chatAttachMenu");
  if (menu) menu.style.display = "none";
}
function openPhotoPicker() {
  document.getElementById("chatPhotoInput").click();
  hideAttachMenu();
}
function handleChatPhotos(inp) {
  pendingImages = Array.from(inp.files);
  if (pendingImages.length > 0) {
    const el = document.getElementById("chatInput");
    el.placeholder = pendingImages.length + " photo" + (pendingImages.length > 1 ? "s" : "") + " selected — tap send";
    el.focus();
  }
}
function shareProduct() {
  if (!currentProduct) { alert("No product linked to this chat"); return; }
  const base = parseInt(String(currentProduct.price || "0").replace(/[^\d]/g, "")) || 0;
  const disc = parseInt(String(currentProduct.discount || "0").replace(/[^\d]/g, "")) || 0;
  const fp   = base - disc;
  const msg  = "📦 " + currentProduct.title + " — Rs. " + fp.toLocaleString();
  document.getElementById("chatInput").value = msg;
  hideAttachMenu();
  sendMessage();
}

// ─── Login Modal ───
function showLoginModal()  { document.getElementById("chatLoginModal").style.display = "flex"; }
function closeLoginModal() { document.getElementById("chatLoginModal").style.display = "none"; }
function goToLogin()       { window.location.href = "login.html"; }

// ─── Image Modal ───
function openImageModal(src) {
  const modal = document.getElementById("chatImageModal");
  const img   = document.getElementById("chatImageModalImg");
  img.src = src;
  modal.style.display = "flex";
}
function closeImageModal() {
  document.getElementById("chatImageModal").style.display = "none";
}

// ─── Go Back ───
function goBack() {
  stopPolling();
  window.history.back();
}

// ─── Cleanup ───
window.addEventListener("beforeunload", stopPolling);
window.addEventListener("pagehide",     stopPolling);