import { createClient, type SupabaseClient } from
'@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
if (cachedClient) return cachedClient;
const url = 'https://ivwetdptsbgzfypqfkzs.supabase.co';

const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2d2V0ZHB0c2JnemZ5cHFma3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MzY1MTEsImV4cCI6MjA3NzUxMjUxMX0.x92nAyZprFNYrnq-uFo4wxFgCyWHhcdEFWGeKe-oTrg';
if (!url || !anon) return null;
cachedClient = createClient(url, anon, { auth: { storageKey:'practise-pitch-auth' } });
return cachedClient;
}