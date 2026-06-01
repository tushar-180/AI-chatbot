import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.SUPABASE_PUBLIC_KEY?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY?.trim();

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

// Internal storage health check (not exported)
(async () => {
    try {
        const { error } = await supabaseAdmin.storage.getBucket('documents');
        if (error) {
            console.warn(`Supabase storage check failed: ${error.message}`);
            return;
        }
        console.log('Supabase storage connection successful');
    } catch (error) {
        console.error('Supabase connection failed:', error);
    }
})();
