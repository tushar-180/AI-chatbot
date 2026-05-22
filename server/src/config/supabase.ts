import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_PUBLIC_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error(
        'Missing Supabase environment variables. ' +
        'Please set SUPABASE_URL, SUPABASE_PUBLIC_KEY, and SUPABASE_SECRET_KEY in your .env file.'
    );
}

// Client for public operations (RLS-enforced) – e.g., in the browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client – bypasses RLS, used for storage operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Internal connection health check (not exported)
(async () => {
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'GET',
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
            },
        });
        if (response.ok) {
            console.log('Supabase connection successful');
        } else {
            console.warn(`Supabase responded with status ${response.status}`);
        }
    } catch (error) {
        console.error('Supabase connection failed:', error);
    }
})();