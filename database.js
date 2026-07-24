const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'aether.db');
const db = new DatabaseSync(DB_PATH);

function initDatabase() {
  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON;");

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_color TEXT DEFAULT '#6366f1',
      cover_url TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create posts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create likes table (user_id and post_id unique pair)
  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create follows table (follower_id and following_id unique pair)
  db.exec(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, following_id),
      FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Check user count to seed if empty
  const userCountQuery = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = userCountQuery.get().count;

  if (userCount === 0) {
    console.log('Seeding database with default users and posts...');
    
    // Hash of 'password123' precomputed to keep code clean and fast
    const passwordHash = '$2a$10$tZ26f/0f04m1Z4qf09.7Ue8/O9/x.g116lU.r7r/H5Ff4.fB8m1W2';

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, bio, avatar_color, cover_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('sarah_dev', 'sarah@example.com', passwordHash, 'Sarah Chen', 'Senior UX Designer. Building premium interfaces and clean systems. Coffee enthusiast ☕', '#a855f7', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60');
    insertUser.run('alex_graphics', 'alex@example.com', passwordHash, 'Alex Rivers', 'Generative artist & motion designer. Experimenting with creative coding. ✨', '#06b6d4', 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop&q=60');
    insertUser.run('elena_fit', 'elena@example.com', passwordHash, 'Elena Rostova', 'Adventurer, fitness coach, and mountain climber. "Keep pushing the boundaries."', '#ec4899', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=60');
    insertUser.run('marcus_tech', 'marcus@example.com', passwordHash, 'Marcus Vance', 'Fullstack engineer | Node.js, Rust & Docker. Working on the future of web apps.', '#10b981', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=60');

    // Seed posts
    const insertPost = db.prepare(`
      INSERT INTO posts (user_id, content, image_url, created_at)
      VALUES (?, ?, ?, ?)
    `);

    // Sarah's posts (user_id = 1)
    insertPost.run(1, 'Just finished designing the interface for Aether! Used glassmorphism, responsive CSS grid, and modern custom animations. Let me know what you think of the glowing borders!', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=60', '2026-07-24T10:00:00Z');
    insertPost.run(1, 'A visual design is like a joke. If you have to explain it, it is not that good. Keep it simple, modern, and beautiful.', '', '2026-07-24T12:00:00Z');

    // Alex's posts (user_id = 2)
    insertPost.run(2, 'Spent the morning rendering some beautiful gradient meshes. Here is one of my favorites! What color scheme should I try next?', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60', '2026-07-24T11:00:00Z');

    // Elena's posts (user_id = 3)
    insertPost.run(3, 'Woke up at 4:30 AM to catch the sunrise from the peak. Totally worth the climb. 🌄 Never stop exploring.', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60', '2026-07-24T09:30:00Z');

    // Marcus's posts (user_id = 4)
    insertPost.run(4, 'Express + native node:sqlite makes for an insanely fast and zero-config backend. Highly recommend trying out DatabaseSync in Node 22/24 for your lightweight prototype applications.', '', '2026-07-24T13:30:00Z');

    // Seed follows
    const insertFollow = db.prepare(`
      INSERT INTO follows (follower_id, following_id)
      VALUES (?, ?)
    `);
    // Sarah follows Alex and Marcus
    insertFollow.run(1, 2);
    insertFollow.run(1, 4);
    // Alex follows Sarah and Marcus
    insertFollow.run(2, 1);
    insertFollow.run(2, 4);
    // Elena follows Sarah
    insertFollow.run(3, 1);
    // Marcus follows everyone
    insertFollow.run(4, 1);
    insertFollow.run(4, 2);
    insertFollow.run(4, 3);

    // Seed likes
    const insertLike = db.prepare(`
      INSERT INTO likes (post_id, user_id)
      VALUES (?, ?)
    `);
    // Like Sarah's post
    insertLike.run(1, 2);
    insertLike.run(1, 3);
    insertLike.run(1, 4);
    // Like Alex's post
    insertLike.run(3, 1);
    insertLike.run(3, 4);
    // Like Elena's post
    insertLike.run(4, 1);
    insertLike.run(4, 2);

    // Seed comments
    const insertComment = db.prepare(`
      INSERT INTO comments (post_id, user_id, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
    insertComment.run(1, 2, 'Absolutely stunning layout Sarah! Love the dark mode glows.', '2026-07-24T10:15:00Z');
    insertComment.run(1, 4, 'Runs so smoothly. Can confirm the CSS performance is top-tier.', '2026-07-24T10:20:00Z');
    insertComment.run(3, 1, 'Wow, that gradient is hypnotic. Would love to see a green/cyan version!', '2026-07-24T11:05:00Z');
    insertComment.run(4, 1, 'Incredible view, Elena! Which trail did you take?', '2026-07-24T09:45:00Z');
  }

  console.log('Database initialized successfully.');
}

module.exports = {
  db,
  initDatabase
};
