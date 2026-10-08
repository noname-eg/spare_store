import "dotenv/config";
import { resetAdminPassword, MIN_PASSWORD_LENGTH } from "../server/adminPasswordReset";
import { readSecret } from "./promptSecret";

const username = process.argv[2]?.trim();
if (!username) {
  console.error("Usage: pnpm admin:reset-password <username>");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const password = await readSecret(`New password for ${username}: `);
const confirmation = await readSecret("Confirm password: ");

if (password.length < MIN_PASSWORD_LENGTH || password !== confirmation) {
  console.error(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

try {
  const result = await resetAdminPassword({ supabaseUrl, serviceRoleKey, username, password });
  console.log(`Password updated for ${result.username}.`);
  if (!result.revokedSessions) {
    console.warn("Warning: existing sessions could not be revoked. Sign the admin out everywhere else.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
