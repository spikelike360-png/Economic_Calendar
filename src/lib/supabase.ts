import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

// Single-row upsert: table has one row per logical key (we use a fixed id)
export async function sbSave(table: string, id: string, data: unknown): Promise<void> {
  if (!supabase) return;
  await supabase.from(table).upsert({ id, data, updated_at: new Date().toISOString() });
}

export async function sbLoad<T>(table: string, id: string): Promise<T | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).select('data').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data.data as T;
}
