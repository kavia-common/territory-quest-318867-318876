import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

// Lazy initialization of Supabase client to ensure environment variables are loaded
let supabase = null;

/**
 * Get or create Supabase client instance
 * Uses lazy initialization to ensure environment variables are loaded
 */
const getSupabaseClient = () => {
  if (!supabase) {
    // Validate environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      logger.error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY');
      throw new Error('Missing Supabase configuration');
    }

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: false
        }
      }
    );
  }
  return supabase;
};

// PUBLIC_INTERFACE
/**
 * Supabase client instance
 * Used for database operations and calling RPC functions
 */
const supabaseClient = {
  get client() {
    return getSupabaseClient();
  }
};

// PUBLIC_INTERFACE
/**
 * Call a Supabase RPC function
 * @param {string} functionName - Name of the RPC function
 * @param {object} params - Parameters to pass to the function
 * @returns {Promise<object>} - Result from the RPC call
 */
export const callRPC = async (functionName, params = {}) => {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc(functionName, params);
    
    if (error) {
      logger.error(`RPC call failed for ${functionName}:`, error);
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error(`RPC call error for ${functionName}:`, error);
    throw error;
  }
};

// Export the client getter and a default export for backward compatibility
export { getSupabaseClient };
export default getSupabaseClient;
