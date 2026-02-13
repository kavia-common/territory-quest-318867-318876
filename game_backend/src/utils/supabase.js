import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  logger.error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY');
  process.exit(1);
}

// PUBLIC_INTERFACE
/**
 * Supabase client instance
 * Used for database operations and calling RPC functions
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    }
  }
);

// PUBLIC_INTERFACE
/**
 * Call a Supabase RPC function
 * @param {string} functionName - Name of the RPC function
 * @param {object} params - Parameters to pass to the function
 * @returns {Promise<object>} - Result from the RPC call
 */
export const callRPC = async (functionName, params = {}) => {
  try {
    const { data, error } = await supabase.rpc(functionName, params);
    
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

export default supabase;
