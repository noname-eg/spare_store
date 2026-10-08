import "dotenv/config";
import { hashPassword } from "../server/auth";
import { readSecret } from "./promptSecret";

const username = process.argv[2]?.trim();
if (!username) {
  console.error("Usage: pnpm admin:create <username>");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const password = await readSecret("Password: ");
const confirmation = await readSecret("Confirm password: ");

if (password.length < 8 || password !== confirmation) {
  console.error("Passwords must match and be at least 8 characters.");
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/rest/v1/admin_users`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ username, password_hash: await hashPassword(password), role: "admin", is_active: true }),
});

if (!response.ok) {
  console.error(`Unable to create admin (${response.status}).`);
  process.exit(1);
}

console.log(`Admin ${username} created.`);
