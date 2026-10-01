// Fixture: must trigger no-restricted-imports (UI must go through src/data).
import { createClient } from '@supabase/supabase-js';

export const client = createClient;
