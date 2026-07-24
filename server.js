const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'aether_secret_key_12345_67890';

// Initialize Database schemas & mock data
initDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// Optional Auth Middleware (for feed queries where guest users can view posts)
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      req.user = null;
    } else {
      req.user = decoded;
    }
    next();
  });
}

// --- AUTH ROUTERS ---

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, display_name } = req.body;
  
  if (!username || !email || !password || !display_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Basic validation
  const usernameClean = username.trim().toLowerCase();
  const emailClean = email.trim().toLowerCase();
  
  if (usernameClean.length < 3 || usernameClean.length > 20) {
    return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
  }

  try {
    // Check if user already exists
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    const existing = checkStmt.get(usernameClean, emailClean);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already registered' });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Pick a random beautiful avatar accent color
    const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#06b6d4', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    // Insert user
    const insertStmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, avatar_color, bio, cover_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Default cover background
    const defaultCover = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=60';
    
    const result = insertStmt.run(usernameClean, emailClean, passwordHash, display_name.trim(), randomColor, 'Hey there! I am using Aether.', defaultCover);
    const userId = result.lastInsertRowid;

    // Generate JWT token
    const token = jwt.sign({ id: userId, username: usernameClean }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: userId,
        username: usernameClean,
        display_name: display_name.trim(),
        avatar_color: randomColor,
        bio: 'Hey there! I am using Aether.',
        cover_url: defaultCover
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const usernameClean = username.trim().toLowerCase();

  try {
    const userStmt = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?');
    const user = userStmt.get(usernameClean, usernameClean);

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        bio: user.bio,
        avatar_color: user.avatar_color,
        cover_url: user.cover_url
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get self info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const userStmt = db.prepare('SELECT id, username, email, display_name, bio, avatar_color, cover_url, created_at FROM users WHERE id = ?');
    const user = userStmt.get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- POSTS ROUTERS ---

// Get feed posts (with comments count and likes count)
app.get('/api/posts', optionalAuthenticateToken, (req, res) => {
  const feedType = req.query.feed || 'all'; // all, following, user, likes
  const targetUsername = req.query.username;
  const currentUserId = req.user ? req.user.id : null;

  try {
    let sql = `
      SELECT p.*, u.display_name, u.username, u.avatar_color,
             (SELECT COUNT(*) FROM likes WHERE likes.post_id = p.id) as likes_count,
             (SELECT COUNT(*) FROM comments WHERE comments.post_id = p.id) as comments_count,
             ? as is_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;
    let params = [];

    // Calculate if liked by current user
    if (currentUserId) {
      sql = sql.replace('? as is_liked', `EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = ${currentUserId}) as is_liked`);
    } else {
      sql = sql.replace('? as is_liked', '0 as is_liked');
    }

    if (feedType === 'following' && currentUserId) {
      sql += ` WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) `;
      params.push(currentUserId);
    } else if (feedType === 'user' && targetUsername) {
      sql += ` WHERE u.username = ? `;
      params.push(targetUsername.trim().toLowerCase());
    } else if (feedType === 'likes' && targetUsername) {
      sql += ` WHERE p.id IN (
        SELECT post_id FROM likes WHERE user_id = (SELECT id FROM users WHERE username = ?)
      ) `;
      params.push(targetUsername.trim().toLowerCase());
    }

    sql += ` ORDER BY p.created_at DESC `;

    const stmt = db.prepare(sql);
    const posts = stmt.all(...params);
    res.json({ posts });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create Post
app.post('/api/posts', authenticateToken, (req, res) => {
  const { content, image_url } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Post content cannot be empty' });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: 'Post content is too long (max 500 characters)' });
  }

  try {
    const insertStmt = db.prepare(`
      INSERT INTO posts (user_id, content, image_url)
      VALUES (?, ?, ?)
    `);
    const result = insertStmt.run(req.user.id, content.trim(), image_url ? image_url.trim() : '');
    const postId = result.lastInsertRowid;

    // Get the newly created post with user details
    const selectStmt = db.prepare(`
      SELECT p.*, u.display_name, u.username, u.avatar_color,
             0 as likes_count, 0 as comments_count, 0 as is_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `);
    const newPost = selectStmt.get(postId);
    res.status(201).json({ message: 'Post created successfully', post: newPost });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Post
app.delete('/api/posts/:id', authenticateToken, (req, res) => {
  const postId = req.params.id;

  try {
    const postStmt = db.prepare('SELECT user_id FROM posts WHERE id = ?');
    const post = postStmt.get(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to delete this post' });
    }

    const deleteStmt = db.prepare('DELETE FROM posts WHERE id = ?');
    deleteStmt.run(postId);

    res.json({ message: 'Post deleted successfully', postId });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle Like
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if post exists
    const postStmt = db.prepare('SELECT id FROM posts WHERE id = ?');
    const post = postStmt.get(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if already liked
    const likeStmt = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?');
    const hasLiked = likeStmt.get(postId, userId);

    let isLiked = false;
    if (hasLiked) {
      // Unlike
      const deleteLike = db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?');
      deleteLike.run(postId, userId);
      isLiked = false;
    } else {
      // Like
      const insertLike = db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)');
      insertLike.run(postId, userId);
      isLiked = true;
    }

    // Get updated like count
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?');
    const likesCount = countStmt.get(postId).count;

    res.json({
      message: isLiked ? 'Post liked' : 'Post unliked',
      isLiked,
      likesCount
    });
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- COMMENTS ROUTERS ---

// Get Comments for Post
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = req.params.id;

  try {
    const commentsStmt = db.prepare(`
      SELECT c.*, u.display_name, u.username, u.avatar_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `);
    const comments = commentsStmt.all(postId);
    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Comment to Post
app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content cannot be empty' });
  }

  if (content.length > 250) {
    return res.status(400).json({ error: 'Comment too long (max 250 characters)' });
  }

  try {
    // Check if post exists
    const postStmt = db.prepare('SELECT id FROM posts WHERE id = ?');
    const post = postStmt.get(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO comments (post_id, user_id, content)
      VALUES (?, ?, ?)
    `);
    const result = insertStmt.run(postId, req.user.id, content.trim());
    const commentId = result.lastInsertRowid;

    // Get full comment details
    const selectStmt = db.prepare(`
      SELECT c.*, u.display_name, u.username, u.avatar_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `);
    const comment = selectStmt.get(commentId);
    
    // Get updated comment count for the post
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ?');
    const commentsCount = countStmt.get(postId).count;

    res.status(201).json({
      message: 'Comment added successfully',
      comment,
      commentsCount
    });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- USERS ROUTERS ---

// Get profile details
app.get('/api/users/profile/:username', optionalAuthenticateToken, (req, res) => {
  const username = req.params.username.trim().toLowerCase();
  const currentUserId = req.user ? req.user.id : null;

  try {
    const userStmt = db.prepare('SELECT id, username, display_name, bio, avatar_color, cover_url, created_at FROM users WHERE username = ?');
    const profileUser = userStmt.get(username);

    if (!profileUser) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Counts
    const postsCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(profileUser.id).count;
    const followersCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(profileUser.id).count;
    const followingCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(profileUser.id).count;

    // Follow status
    let isFollowing = false;
    if (currentUserId && currentUserId !== profileUser.id) {
      const followStmt = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?');
      isFollowing = !!followStmt.get(currentUserId, profileUser.id);
    }

    res.json({
      user: profileUser,
      stats: {
        posts: postsCount,
        followers: followersCount,
        following: followingCount
      },
      isFollowing
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Profile
app.post('/api/users/profile', authenticateToken, (req, res) => {
  const { display_name, bio, avatar_color, cover_url } = req.body;

  if (!display_name || display_name.trim().length === 0) {
    return res.status(400).json({ error: 'Display name cannot be empty' });
  }

  try {
    const updateStmt = db.prepare(`
      UPDATE users 
      SET display_name = ?, bio = ?, avatar_color = ?, cover_url = ?
      WHERE id = ?
    `);
    
    updateStmt.run(
      display_name.trim(),
      bio ? bio.trim() : '',
      avatar_color ? avatar_color.trim() : '#6366f1',
      cover_url ? cover_url.trim() : '',
      req.user.id
    );

    // Fetch updated user
    const selectStmt = db.prepare('SELECT id, username, email, display_name, bio, avatar_color, cover_url FROM users WHERE id = ?');
    const user = selectStmt.get(req.user.id);

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle Follow
app.post('/api/users/profile/:username/follow', authenticateToken, (req, res) => {
  const targetUsername = req.params.username.trim().toLowerCase();
  const currentUserId = req.user.id;

  try {
    // Get target user
    const targetUserStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    const targetUser = targetUserStmt.get(targetUsername);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    // Check if following
    const followStmt = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?');
    const isFollowing = followStmt.get(currentUserId, targetUser.id);

    let followed = false;
    if (isFollowing) {
      // Unfollow
      const deleteFollow = db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?');
      deleteFollow.run(currentUserId, targetUser.id);
      followed = false;
    } else {
      // Follow
      const insertFollow = db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)');
      insertFollow.run(currentUserId, targetUser.id);
      followed = true;
    }

    // Counts
    const followersCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(targetUser.id).count;
    const followingCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(targetUser.id).count;

    res.json({
      message: followed ? 'Followed successfully' : 'Unfollowed successfully',
      isFollowing: followed,
      stats: {
        followers: followersCount,
        following: followingCount
      }
    });
  } catch (err) {
    console.error('Toggle follow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get follow suggestions (users we don't follow, sorted randomly, limit 5)
app.get('/api/users/suggestions', authenticateToken, (req, res) => {
  const currentUserId = req.user.id;

  try {
    const suggestionsStmt = db.prepare(`
      SELECT id, username, display_name, bio, avatar_color 
      FROM users 
      WHERE id != ? 
        AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
      ORDER BY RANDOM()
      LIMIT 4
    `);
    const suggestions = suggestionsStmt.all(currentUserId, currentUserId);
    res.json({ suggestions });
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`✨ Aether Social backend fully online!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
