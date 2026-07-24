/* ==========================================
   AETHER CLIENT ENGINE — SINGLE PAGE APPLICATION
   ========================================== */

const API_BASE = '/api';

const state = {
  user: null,
  token: localStorage.getItem('aether_token') || null,
  activePage: 'feed-page',
  currentFeedFilter: 'all', // all, following
  posts: [],
  profileUsername: null,
  profileUser: null,
  profileStats: null,
  profileIsFollowing: false,
  profileFeedTab: 'posts', // posts, likes
  activeCommentsPostId: null,
  searchQuery: ''
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupComposerUI();
  
  if (state.token) {
    const success = await fetchCurrentUser();
    if (!success) {
      handleLogout();
    }
  }
  
  updateNavigationState();
  
  // Default landing page check
  if (state.user) {
    showPage('feed-page');
  } else {
    // If not authenticated, guest users can see public explore feed
    showPage('feed-page');
  }
});

// Setup click events on Nav bars
function setupNavigation() {
  const mainNav = document.getElementById('main-nav');
  const guestNav = document.getElementById('guest-nav');

  const navHandler = (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    
    // Check compose trigger
    if (btn.id === 'btn-compose-trigger') {
      const textarea = document.getElementById('composer-textarea');
      if (textarea) {
        textarea.focus();
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a subtle animation pulse
        const composer = document.getElementById('post-composer');
        composer.style.boxShadow = '0 0 25px rgba(99, 102, 241, 0.4)';
        setTimeout(() => {
          composer.style.boxShadow = '';
        }, 1000);
      }
      return;
    }

    const targetPage = btn.getAttribute('data-target');
    if (targetPage === 'profile-page' && state.user) {
      viewProfile(state.user.username);
    } else {
      showPage(targetPage);
    }
  };

  mainNav.addEventListener('click', navHandler);
  guestNav.addEventListener('click', navHandler);
  
  // Header filter tabs
  const filterBar = document.getElementById('feed-filter-bar');
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.feed-filter-btn');
    if (!btn) return;
    
    document.querySelectorAll('.feed-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.currentFeedFilter = btn.getAttribute('data-filter');
    loadFeed();
  });
}

function setupComposerUI() {
  const btnToggleImg = document.getElementById('btn-toggle-image');
  const mediaDrawer = document.getElementById('composer-media-drawer');
  const imgInput = document.getElementById('composer-image-url');
  const imgPreview = document.getElementById('composer-image-preview');
  const previewImg = document.getElementById('composer-preview-img');
  const btnClearImg = document.getElementById('btn-clear-image');

  btnToggleImg.addEventListener('click', () => {
    const isHidden = mediaDrawer.style.display === 'none';
    mediaDrawer.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) imgInput.focus();
  });

  imgInput.addEventListener('input', () => {
    const url = imgInput.value.trim();
    if (url) {
      previewImg.src = url;
      imgPreview.style.display = 'block';
    } else {
      imgPreview.style.display = 'none';
    }
  });

  btnClearImg.addEventListener('click', () => {
    imgInput.value = '';
    imgPreview.style.display = 'none';
    previewImg.src = '';
  });
}

// Router simulation
function showPage(pageId) {
  state.activePage = pageId;
  
  // Toggle active class on pages
  document.querySelectorAll('.app-page').forEach(page => {
    if (page.id === pageId) {
      page.classList.add('active-page');
    } else {
      page.classList.remove('active-page');
    }
  });

  // Toggle active class on sidebar buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-target') === pageId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Load appropriate data
  if (pageId === 'feed-page') {
    loadFeed();
  } else if (pageId === 'explore-page') {
    loadDiscoverCreators();
  }
}

// Update DOM elements when authentication status changes
function updateNavigationState() {
  const mainNav = document.getElementById('main-nav');
  const guestNav = document.getElementById('guest-nav');
  const stickyProfile = document.getElementById('user-sticky-profile');
  const composer = document.getElementById('post-composer');
  const filterFollowing = document.getElementById('filter-btn-following');
  const suggestionsWidget = document.getElementById('follow-suggestions-widget');

  if (state.user) {
    mainNav.style.display = 'flex';
    guestNav.style.display = 'none';
    composer.style.display = 'block';
    filterFollowing.style.display = 'inline-block';
    suggestionsWidget.style.display = 'block';
    
    // Set composer user avatar
    const initials = getAvatarInitials(state.user.display_name);
    document.getElementById('composer-user-avatar').textContent = initials;
    document.getElementById('composer-user-avatar').style.backgroundColor = state.user.avatar_color || '#6366f1';

    // Sticky user profile bar
    stickyProfile.style.display = 'flex';
    stickyProfile.innerHTML = `
      <div class="user-card-sticky-info" onclick="viewProfile('${state.user.username}')" style="cursor: pointer;">
        <div class="user-avatar" style="background-color: ${state.user.avatar_color}">${initials}</div>
        <div class="user-card-names">
          <span class="user-display-name">${state.user.display_name}</span>
          <span class="user-username-tag">@${state.user.username}</span>
        </div>
      </div>
      <button class="btn-logout" onclick="handleLogout()" title="Log out">
        <i class="fa-solid fa-arrow-right-from-bracket"></i>
      </button>
    `;
    
    fetchSuggestions();
  } else {
    mainNav.style.display = 'none';
    guestNav.style.display = 'flex';
    composer.style.display = 'none';
    filterFollowing.style.display = 'none';
    stickyProfile.style.display = 'none';
    suggestionsWidget.style.display = 'none';
    
    // Switch filter back to all if following was active
    if (state.currentFeedFilter === 'following') {
      state.currentFeedFilter = 'all';
      const btns = document.querySelectorAll('.feed-filter-btn');
      btns.forEach(b => {
        if (b.getAttribute('data-filter') === 'all') b.classList.add('active');
        else b.classList.remove('active');
      });
    }
  }
}

// Switch between Register and Login Tabs
function switchAuthTab(tab) {
  const formLogin = document.getElementById('form-login');
  const formReg = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');
  const errDiv = document.getElementById('auth-error');
  
  errDiv.style.display = 'none';

  if (tab === 'login') {
    formLogin.classList.add('active-form');
    formReg.classList.remove('active-form');
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    formLogin.classList.remove('active-form');
    formReg.classList.add('active-form');
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  }
}

// --- API ACTIONS ---

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

// Get user from token
async function fetchCurrentUser() {
  try {
    const data = await apiRequest('/auth/me');
    state.user = data.user;
    return true;
  } catch (err) {
    console.error('Session check failed:', err);
    return false;
  }
}

// Login
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errDiv = document.getElementById('auth-error');
  errDiv.style.display = 'none';

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);

    // Clear inputs
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';

    updateNavigationState();
    showPage('feed-page');
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.style.display = 'block';
  }
}

// Register
async function handleRegister(e) {
  e.preventDefault();
  const display_name = document.getElementById('reg-display-name').value;
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const errDiv = document.getElementById('auth-error');
  errDiv.style.display = 'none';

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ display_name, username, email, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);

    // Clear inputs
    document.getElementById('reg-display-name').value = '';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';

    updateNavigationState();
    showPage('feed-page');
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.style.display = 'block';
  }
}

// Logout
function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('aether_token');
  updateNavigationState();
  showPage('feed-page');
}

// --- FEED ACTIONS ---

async function loadFeed() {
  const container = document.getElementById('posts-feed-list');
  container.innerHTML = `
    <div class="loading-shimmer-container">
      <div class="shimmer-card"></div>
      <div class="shimmer-card"></div>
    </div>
  `;

  document.getElementById('page-main-title').textContent = 
    state.currentFeedFilter === 'following' ? 'Celestial Circle' : 'Cosmic Feed';

  try {
    const data = await apiRequest(`/posts?feed=${state.currentFeedFilter}`);
    state.posts = data.posts;
    renderPostList(state.posts, 'posts-feed-list');
  } catch (err) {
    container.innerHTML = `<div class="no-posts-message"><i class="fa-solid fa-triangle-exclamation"></i> Error loading feed: ${err.message}</div>`;
  }
}

// Render posts to target DOM container
function renderPostList(posts, containerId) {
  const container = document.getElementById(containerId);
  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="no-posts-message">
        <i class="fa-solid fa-wave-square"></i>
        <span>Silence in the ether. No broadcasts found.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = posts.map(post => {
    const initials = getAvatarInitials(post.display_name);
    const hasImage = post.image_url ? true : false;
    const isOwner = state.user && state.user.id === post.user_id;
    const likeClass = post.is_liked ? 'post-action-btn like-btn-active' : 'post-action-btn';

    return `
      <article class="post-card glass-panel" id="post-${post.id}">
        <!-- Post Header -->
        <div class="post-card-header">
          <div class="post-card-author-info">
            <div class="user-avatar" onclick="viewProfile('${post.username}')" style="background-color: ${post.avatar_color}; cursor: pointer; width: 32px; height: 32px; font-size: 11px;">
              ${initials}
            </div>
            <div class="post-card-author-names">
              <span class="post-card-author-name" onclick="viewProfile('${post.username}')">${post.display_name}</span>
              <span class="post-card-author-username">@${post.username}</span>
            </div>
          </div>
          <span class="post-card-date">${formatDate(post.created_at)}</span>
        </div>

        <!-- Post Media Section -->
        ${hasImage ? `
          <div class="post-card-media" onclick="openCommentsModal(${post.id})" style="cursor: pointer;">
            <img src="${post.image_url}" alt="Post Media" loading="lazy">
          </div>
        ` : `
          <div class="post-card-media-fallback" onclick="openCommentsModal(${post.id})" style="cursor: pointer;">
            <p>${highlightTags(post.content)}</p>
          </div>
        `}

        <!-- Post Actions -->
        <div class="post-card-actions">
          <button class="${likeClass}" onclick="likePost(${post.id})">
            <i class="fa-regular fa-heart"></i>
          </button>
          <button class="post-action-btn" onclick="openCommentsModal(${post.id})">
            <i class="fa-regular fa-comment"></i>
          </button>
          <button class="post-action-btn" onclick="sharePost(${post.id})">
            <i class="fa-regular fa-paper-plane"></i>
          </button>
          
          <button class="post-action-btn" onclick="toggleBookmark(this)" style="margin-left: auto;">
            <i class="fa-regular fa-bookmark"></i>
          </button>
          ${isOwner ? `
            <button class="post-action-btn btn-delete" onclick="deletePost(${post.id})" title="Delete broadcast">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          ` : ''}
        </div>

        <!-- Likes Summary -->
        <div class="post-card-likes-count" id="post-likes-count-${post.id}">
          ${post.likes_count} likes
        </div>

        <!-- Post Caption -->
        ${hasImage ? `
          <div class="post-card-caption">
            <span class="post-card-caption-username" onclick="viewProfile('${post.username}')">${post.username}</span>
            <span class="post-card-caption-text">${highlightTags(post.content)}</span>
          </div>
        ` : ''}

        <!-- Comments Summary -->
        ${post.comments_count > 0 ? `
          <div class="post-card-comments-summary">
            <button class="post-card-view-comments-btn" onclick="openCommentsModal(${post.id})">
              View all ${post.comments_count} comments
            </button>
          </div>
        ` : ''}

        <!-- Inline Quick Comment Form -->
        ${state.user ? `
          <form class="post-card-comment-form" onsubmit="submitInlineComment(event, ${post.id})">
            <input type="text" class="post-card-comment-input" placeholder="Add a comment..." required>
            <button type="submit" class="post-card-comment-submit-btn">Post</button>
          </form>
        ` : `
          <div class="post-card-comment-form" style="cursor: pointer;" onclick="showPage('auth-page')">
            <span style="color: var(--text-muted); font-size: 13px;">Sign in to add a comment...</span>
          </div>
        `}
      </article>
    `;
  }).join('');
}

// Submit post
async function submitPost() {
  const textarea = document.getElementById('composer-textarea');
  const imgInput = document.getElementById('composer-image-url');
  const content = textarea.value.trim();
  const image_url = imgInput.value.trim();

  if (!content) return;

  try {
    const data = await apiRequest('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, image_url })
    });

    // Reset editor
    textarea.value = '';
    imgInput.value = '';
    document.getElementById('composer-image-preview').style.display = 'none';
    document.getElementById('composer-media-drawer').style.display = 'none';

    // Insert post into list dynamically
    state.posts.unshift(data.post);
    loadFeed(); // Refresh feed
  } catch (err) {
    alert(err.message);
  }
}

// Delete Post
async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this broadcast from the archive?')) return;

  try {
    await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
    
    // Remove from state
    state.posts = state.posts.filter(p => p.id !== postId);
    
    // Slide out post card from DOM nicely
    const card = document.getElementById(`post-${postId}`);
    if (card) {
      card.style.transform = 'translateX(-50px)';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
    }
  } catch (err) {
    alert(err.message);
  }
}

// Like Post
async function likePost(postId) {
  if (!state.user) {
    showPage('auth-page');
    return;
  }

  try {
    const data = await apiRequest(`/posts/${postId}/like`, { method: 'POST' });
    
    // Update DOM directly for speed
    const card = document.getElementById(`post-${postId}`);
    if (card) {
      const btn = card.querySelector('.post-card-actions button:first-child');
      const countEl = document.getElementById(`post-likes-count-${postId}`);
      
      if (countEl) {
        countEl.textContent = `${data.likesCount} likes`;
      }
      
      if (data.isLiked) {
        btn.classList.add('like-btn-active');
      } else {
        btn.classList.remove('like-btn-active');
      }
    }
  } catch (err) {
    console.error('Like error:', err);
  }
}

// Submit Comment from the inline field
async function submitInlineComment(e, postId) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector('.post-card-comment-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    const data = await apiRequest(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    input.value = '';
    
    // Update comments count on feed card
    const feedCard = document.getElementById(`post-${postId}`);
    if (feedCard) {
      // Find or create comment summary link
      let summaryDiv = feedCard.querySelector('.post-card-comments-summary');
      if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.className = 'post-card-comments-summary';
        // Insert it right before the form
        feedCard.insertBefore(summaryDiv, feedCard.querySelector('.post-card-comment-form'));
      }
      summaryDiv.innerHTML = `
        <button class="post-card-view-comments-btn" onclick="openCommentsModal(${postId})">
          View all ${data.commentsCount} comments
        </button>
      `;
    }

    // If comments modal is active for this post, append the comment
    if (state.activeCommentsPostId === postId) {
      const commentsList = document.getElementById('comments-list-content');
      if (commentsList.innerText.includes('No responses yet')) {
        commentsList.innerHTML = '';
      }
      const initials = getAvatarInitials(data.comment.display_name);
      const commentHTML = `
        <div class="comment-card" style="animation: fadeIn 0.3s ease;">
          <div class="user-avatar" style="background-color: ${data.comment.avatar_color}; width: 34px; height: 34px; font-size: 12px;">
            ${initials}
          </div>
          <div class="comment-main">
            <div class="comment-header">
              <span class="comment-author-name">${data.comment.display_name}</span>
              <span class="comment-date">just now</span>
            </div>
            <p class="comment-text">${data.comment.content}</p>
          </div>
        </div>
      `;
      commentsList.innerHTML += commentHTML;
      commentsList.scrollTop = commentsList.scrollHeight;
    }
  } catch (err) {
    alert(err.message);
  }
}

// Client side bookmark toggle
function toggleBookmark(btn) {
  const icon = btn.querySelector('i');
  if (icon.classList.contains('fa-regular')) {
    icon.classList.remove('fa-regular');
    icon.classList.add('fa-solid');
    btn.style.color = '#f5f5f5';
  } else {
    icon.classList.remove('fa-solid');
    icon.classList.add('fa-regular');
    btn.style.color = '';
  }
}

// Share post alert
function sharePost(postId) {
  const postUrl = `${window.location.origin}/posts/${postId}`;
  navigator.clipboard.writeText(postUrl).then(() => {
    // Show a quick custom alert / confirmation
    alert('Post link copied to clipboard! Share it with the cosmos.');
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
  });
}


// --- COMMENTS ACTIONS ---

async function openCommentsModal(postId) {
  state.activeCommentsPostId = postId;
  const overlay = document.getElementById('comments-modal');
  overlay.style.display = 'flex';

  // Load post details in the header of comment sheet
  const post = state.posts.find(p => p.id === postId) || 
               (state.profileUser && state.posts.find(p => p.id === postId));
               
  const initials = getAvatarInitials(post.display_name);
  const hasImage = post.image_url ? true : false;
  document.getElementById('comment-source-post-content').innerHTML = `
    <div style="display: flex; gap: 12px; align-items: flex-start; flex-direction: column; width: 100%;">
      <div style="display: flex; gap: 12px; align-items: center; width: 100%;">
        <div class="user-avatar" style="background-color: ${post.avatar_color}; width: 34px; height: 34px; font-size: 12px;">${initials}</div>
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600; font-size: 14px;">${post.display_name}</span>
          <span style="color: var(--text-muted); font-size: 11px;">@${post.username}</span>
        </div>
      </div>
      
      ${hasImage ? `
        <div style="width: 100%; border-radius: var(--radius-md); overflow: hidden; max-height: 250px; margin: 4px 0; border: 1px solid var(--border-color);">
          <img src="${post.image_url}" alt="Post Detail" style="width: 100%; height: auto; display: block; object-fit: cover;">
        </div>
      ` : ''}
      
      <p style="font-size: 13px; line-height: 1.5; color: var(--text-secondary); word-break: break-word;">${highlightTags(post.content)}</p>
    </div>
  `;

  // Render comments list spinner
  const commentsList = document.getElementById('comments-list-content');
  commentsList.innerHTML = `<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading Responses...</div>`;

  // Check auth state for comment form
  const formContainer = document.getElementById('comment-form-container');
  const guestPrompt = document.getElementById('comment-guest-prompt');
  
  if (state.user) {
    formContainer.style.display = 'flex';
    guestPrompt.style.display = 'none';
    const currentInitials = getAvatarInitials(state.user.display_name);
    document.getElementById('comment-user-avatar').textContent = currentInitials;
    document.getElementById('comment-user-avatar').style.backgroundColor = state.user.avatar_color;
  } else {
    formContainer.style.display = 'none';
    guestPrompt.style.display = 'block';
  }

  try {
    const data = await apiRequest(`/posts/${postId}/comments`);
    renderComments(data.comments);
  } catch (err) {
    commentsList.innerHTML = `<div style="color: var(--accent-pink)">Error loading comments: ${err.message}</div>`;
  }
}

function renderComments(comments) {
  const container = document.getElementById('comments-list-content');
  if (!comments || comments.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No responses yet. Be the first to start the thread!</div>`;
    return;
  }

  container.innerHTML = comments.map(comment => {
    const initials = getAvatarInitials(comment.display_name);
    return `
      <div class="comment-card">
        <div class="user-avatar" onclick="viewProfile('${comment.username}'); closeCommentsModal();" style="background-color: ${comment.avatar_color}; cursor: pointer; width: 34px; height: 34px; font-size: 12px;">
          ${initials}
        </div>
        <div class="comment-main">
          <div class="comment-header">
            <span class="comment-author-name" onclick="viewProfile('${comment.username}'); closeCommentsModal();" style="cursor: pointer;">${comment.display_name}</span>
            <span class="comment-date">${formatDate(comment.created_at)}</span>
          </div>
          <p class="comment-text">${comment.content}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function submitComment(e) {
  e.preventDefault();
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    const data = await apiRequest(`/posts/${state.activeCommentsPostId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    input.value = '';
    
    // Update comment list in modal
    const commentsList = document.getElementById('comments-list-content');
    
    // If it was empty state, clear it
    if (commentsList.innerText.includes('No responses yet')) {
      commentsList.innerHTML = '';
    }
    
    const initials = getAvatarInitials(data.comment.display_name);
    const commentHTML = `
      <div class="comment-card" style="animation: fadeIn 0.3s ease;">
        <div class="user-avatar" style="background-color: ${data.comment.avatar_color}; width: 34px; height: 34px; font-size: 12px;">
          ${initials}
        </div>
        <div class="comment-main">
          <div class="comment-header">
            <span class="comment-author-name">${data.comment.display_name}</span>
            <span class="comment-date">just now</span>
          </div>
          <p class="comment-text">${data.comment.content}</p>
        </div>
      </div>
    `;
    commentsList.innerHTML += commentHTML;
    
    // Scroll comment sheet bottom
    commentsList.scrollTop = commentsList.scrollHeight;

    // Update comment count on feed card
    const feedCard = document.getElementById(`post-${state.activeCommentsPostId}`);
    if (feedCard) {
      feedCard.querySelector('.comment-count').textContent = data.commentsCount;
    }
  } catch (err) {
    alert(err.message);
  }
}

function closeCommentsModal(event = null) {
  document.getElementById('comments-modal').style.display = 'none';
  state.activeCommentsPostId = null;
}


// --- PROFILE ACTIONS ---

async function viewProfile(username) {
  state.profileUsername = username;
  state.profileFeedTab = 'posts';
  showPage('profile-page');
  
  const container = document.getElementById('profile-details-wrapper');
  container.innerHTML = `
    <div class="loading-shimmer-container">
      <div class="shimmer-card" style="height: 250px;"></div>
    </div>
  `;
  
  // Render empty placeholder posts list
  document.getElementById('profile-posts-list').innerHTML = '';

  try {
    const data = await apiRequest(`/users/profile/${username}`);
    state.profileUser = data.user;
    state.profileStats = data.stats;
    state.profileIsFollowing = data.isFollowing;
    
    renderProfileHeader();
    loadProfilePosts();
  } catch (err) {
    container.innerHTML = `<div class="no-posts-message"><i class="fa-solid fa-triangle-exclamation"></i> Error loading profile: ${err.message}</div>`;
  }
}

function renderProfileHeader() {
  const container = document.getElementById('profile-details-wrapper');
  const u = state.profileUser;
  const initials = getAvatarInitials(u.display_name);
  const isSelf = state.user && state.user.id === u.id;
  
  let followButtonHTML = '';
  if (state.user) {
    if (isSelf) {
      followButtonHTML = `<button class="btn btn-secondary btn-sm" onclick="openEditProfileModal()"><i class="fa-solid fa-sliders"></i> Edit Profile</button>`;
    } else {
      followButtonHTML = `
        <button class="btn ${state.profileIsFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleFollow('${u.username}')">
          ${state.profileIsFollowing ? 'Following' : 'Follow'}
        </button>
      `;
    }
  }

  container.innerHTML = `
    <div class="profile-instagram-header">
      <div class="profile-instagram-avatar-col">
        <div class="profile-large-avatar" style="background-color: ${u.avatar_color}; width: 110px; height: 110px; font-size: 36px; border: none; border-radius: 50%;">
          ${initials}
        </div>
      </div>
      <div class="profile-instagram-info-col">
        <div class="profile-instagram-row-1">
          <h2 class="profile-instagram-username">@${u.username}</h2>
          <div class="profile-instagram-actions">
            ${followButtonHTML}
          </div>
        </div>
        
        <div class="profile-instagram-row-2">
          <div class="profile-instagram-stat" onclick="switchProfileFeed('posts')"><strong>${state.profileStats.posts}</strong> posts</div>
          <div class="profile-instagram-stat"><strong>${state.profileStats.followers}</strong> followers</div>
          <div class="profile-instagram-stat"><strong>${state.profileStats.following}</strong> following</div>
        </div>
        
        <div class="profile-instagram-row-3">
          <div class="profile-instagram-name">${u.display_name}</div>
          <p class="profile-instagram-bio">${u.bio || 'Silence in the personal archives.'}</p>
        </div>
      </div>
    </div>
  `;
}

async function loadProfilePosts() {
  const container = document.getElementById('profile-posts-list');
  container.innerHTML = `
    <div class="loading-shimmer-container">
      <div class="shimmer-card"></div>
    </div>
  `;

  try {
    const data = await apiRequest(`/posts?feed=${state.profileFeedTab === 'likes' ? 'likes' : 'user'}&username=${state.profileUsername}`);
    state.posts = data.posts;
    renderProfileGrid(state.posts, 'profile-posts-list');
  } catch (err) {
    container.innerHTML = `<div class="no-posts-message">Error loading posts: ${err.message}</div>`;
  }
}

function renderProfileGrid(posts, containerId) {
  const container = document.getElementById(containerId);
  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="no-posts-message">
        <i class="fa-solid fa-camera-retro"></i>
        <span>Silence in the visual ether. No posts found.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="profile-grid">
      ${posts.map(post => {
        const hasImage = post.image_url ? true : false;
        return `
          <div class="profile-grid-item" onclick="openCommentsModal(${post.id})">
            ${hasImage ? `
              <img src="${post.image_url}" alt="Profile Post" loading="lazy">
            ` : `
              <div class="profile-grid-item-fallback">
                ${post.content.length > 60 ? post.content.slice(0, 57) + '...' : post.content}
              </div>
            `}
            <div class="profile-grid-hover-overlay">
              <span class="profile-grid-stat"><i class="fa-solid fa-heart"></i> ${post.likes_count}</span>
              <span class="profile-grid-stat"><i class="fa-solid fa-comment"></i> ${post.comments_count}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function switchProfileFeed(tab) {
  state.profileFeedTab = tab;
  
  const tabPosts = document.getElementById('profile-tab-posts');
  const tabLikes = document.getElementById('profile-tab-likes');
  
  if (tab === 'posts') {
    tabPosts.classList.add('active');
    tabLikes.classList.remove('active');
  } else {
    tabPosts.classList.remove('active');
    tabLikes.classList.add('active');
  }

  loadProfilePosts();
}

async function toggleFollow(username) {
  try {
    const data = await apiRequest(`/users/profile/${username}/follow`, { method: 'POST' });
    state.profileIsFollowing = data.isFollowing;
    state.profileStats.followers = data.stats.followers;
    state.profileStats.following = data.stats.following;
    
    // Rerender header to update counts
    renderProfileHeader();
    fetchSuggestions();
  } catch (err) {
    console.error('Follow error:', err);
  }
}


// --- EDIT PROFILE WIDGETS ---

function openEditProfileModal() {
  if (!state.user) return;
  
  const modal = document.getElementById('edit-profile-modal');
  modal.style.display = 'flex';
  
  document.getElementById('edit-display-name').value = state.user.display_name;
  document.getElementById('edit-bio').value = state.user.bio || '';
  document.getElementById('edit-cover-url').value = state.user.cover_url || '';
  
  // Tick current color
  const radio = document.querySelector(`input[name="avatar-color"][value="${state.user.avatar_color}"]`);
  if (radio) radio.checked = true;
}

function closeEditProfileModal(event = null) {
  document.getElementById('edit-profile-modal').style.display = 'none';
}

async function submitEditProfile(e) {
  e.preventDefault();
  
  const display_name = document.getElementById('edit-display-name').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const cover_url = document.getElementById('edit-cover-url').value.trim();
  const avatar_color = document.querySelector('input[name="avatar-color"]:checked').value;

  try {
    const data = await apiRequest('/users/profile', {
      method: 'POST',
      body: JSON.stringify({ display_name, bio, cover_url, avatar_color })
    });
    
    state.user = data.user;
    closeEditProfileModal();
    
    // Refresh self profile
    viewProfile(state.user.username);
    updateNavigationState();
  } catch (err) {
    alert(err.message);
  }
}


// --- SIDEBAR RECOMMENDATIONS & EXPLORE ---

async function fetchSuggestions() {
  const container = document.getElementById('suggestions-widget-list');
  if (!state.user) return;

  try {
    const data = await apiRequest('/users/suggestions');
    state.suggestions = data.suggestions;
    
    if (!data.suggestions || data.suggestions.length === 0) {
      document.getElementById('follow-suggestions-widget').style.display = 'none';
      return;
    }

    document.getElementById('follow-suggestions-widget').style.display = 'block';
    
    container.innerHTML = data.suggestions.map(s => {
      const initials = getAvatarInitials(s.display_name);
      return `
        <div class="suggestion-item">
          <div class="suggestion-info" onclick="viewProfile('${s.username}')">
            <div class="user-avatar" style="background-color: ${s.avatar_color}; width: 32px; height: 32px; font-size: 11px;">${initials}</div>
            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span class="suggestion-display">${s.display_name}</span>
              <span class="suggestion-username">@${s.username}</span>
            </div>
          </div>
          <button class="btn btn-primary btn-sm btn-glow" onclick="followFromSuggestions('${s.username}')">Signal</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Suggestions error:', err);
  }
}

async function followFromSuggestions(username) {
  try {
    await apiRequest(`/users/profile/${username}/follow`, { method: 'POST' });
    fetchSuggestions(); // Refresh list
    
    // If viewing profile of followed user, refresh
    if (state.activePage === 'profile-page' && state.profileUsername === username) {
      viewProfile(username);
    }
  } catch (err) {
    console.error('Follow error:', err);
  }
}

async function loadDiscoverCreators() {
  const container = document.getElementById('explore-creators-list');
  container.innerHTML = `
    <div class="loading-shimmer-container">
      <div class="shimmer-card"></div>
    </div>
  `;

  try {
    // We will simulate general creators by calling a suggestion endpoint without strict user check or all users
    // Let's just fetch default list of recommendations or mock profiles
    const response = await fetch(`${API_BASE}/posts`); // public posts to find active accounts
    const data = await response.json();
    
    // Extract unique active creators
    const usersMap = new Map();
    data.posts.forEach(p => {
      usersMap.set(p.username, {
        username: p.username,
        display_name: p.display_name,
        avatar_color: p.avatar_color,
        bio: p.username === 'sarah_dev' ? 'Senior UX Designer. Coffee enthusiast ☕' :
             p.username === 'alex_graphics' ? 'Generative artist & motion designer. ✨' :
             p.username === 'elena_fit' ? 'Adventurer, fitness coach.' : 'Fullstack engineer | Node.js, Rust'
      });
    });

    const uniqueUsers = Array.from(usersMap.values());

    container.innerHTML = uniqueUsers.map(u => {
      const initials = getAvatarInitials(u.display_name);
      return `
        <div class="creator-card glass-panel" onclick="viewProfile('${u.username}')" style="cursor:pointer;">
          <div class="creator-avatar" style="background-color: ${u.avatar_color}">${initials}</div>
          <div class="creator-names">
            <span class="creator-display">${u.display_name}</span>
            <span class="creator-handle">@${u.username}</span>
          </div>
          <p class="creator-bio">${u.bio}</p>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="no-posts-message">Error discovering creators.</div>`;
  }
}


// --- UTILITIES & SEARCH ---

function handleSearch(val) {
  state.searchQuery = val.trim().toLowerCase();
  
  if (state.activePage !== 'feed-page') {
    showPage('feed-page');
  }

  const postsFiltered = state.posts.filter(post => 
    post.content.toLowerCase().includes(state.searchQuery) ||
    post.display_name.toLowerCase().includes(state.searchQuery) ||
    post.username.toLowerCase().includes(state.searchQuery)
  );

  renderPostList(postsFiltered, 'posts-feed-list');
}

function insertSearchTag(tag) {
  const searchInput = document.getElementById('search-input');
  searchInput.value = tag;
  handleSearch(tag);
}

// Helpers
function getAvatarInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  
  if (isNaN(diffMs) || diffMs < 0) return 'recently';

  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function highlightTags(content) {
  return content.replace(/#(\w+)/g, '<span style="color: var(--primary-color); font-weight:600; cursor:pointer;" onclick="insertSearchTag(\'#$1\')">#$1</span>');
}
