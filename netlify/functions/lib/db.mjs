import { neon } from '@neondatabase/serverless';

let sql;
let tablesReady = false;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is not set. Please add your Neon PostgreSQL connection string in the Netlify dashboard under Site Settings > Environment Variables.'
    );
  }
  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export async function ensureTables(db) {
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      auth0_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255),
      name VARCHAR(255),
      picture TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fly_name VARCHAR(255) NOT NULL,
      fly_type VARCHAR(100),
      fly_best_for TEXT,
      fly_description TEXT,
      fly_image TEXT,
      fly_recipe TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, fly_name)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fly_name VARCHAR(255) NOT NULL,
      fly_type VARCHAR(100),
      fly_best_for TEXT,
      fly_description TEXT,
      fly_image TEXT,
      fly_recipe TEXT,
      quantity INTEGER DEFAULT 1,
      price NUMERIC(10,2) DEFAULT 2.50,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, fly_name)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'pending',
      total_amount NUMERIC(10,2),
      total_flies INTEGER,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      fly_name VARCHAR(255) NOT NULL,
      fly_type VARCHAR(100),
      quantity INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
}

export async function initDb() {
  const db = getDb();
  if (!tablesReady) {
    await ensureTables(db);
    tablesReady = true;
  }
  return db;
}
