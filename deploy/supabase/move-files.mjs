// Run on the Mac after move-data.sh. Copies every file in the orbit-attachments bucket,
// keeping the same paths so rows in public.attachments still point at them.
//   OLD_URL=https://<ref>.supabase.co OLD_SERVICE_KEY=... NEW_URL=https://db.example.com NEW_SERVICE_KEY=... \
//   node deploy/supabase/move-files.mjs
import { createClient } from "@supabase/supabase-js";

const BUCKET = "orbit-attachments";
const env = (k) => process.env[k] ?? (() => { throw new Error(`set ${k}`); })();
const opts = { auth: { persistSession: false } };
const oldDb = createClient(env("OLD_URL"), env("OLD_SERVICE_KEY"), opts).storage.from(BUCKET);
const newDb = createClient(env("NEW_URL"), env("NEW_SERVICE_KEY"), opts).storage.from(BUCKET);

async function* walk(prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await oldDb.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) yield { path, type: item.metadata?.mimetype };
      else yield* walk(path); // folder
    }
    if (data.length < 1000) return;
  }
}

let copied = 0;
for await (const { path, type } of walk()) {
  const { data, error } = await oldDb.download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  const up = await newDb.upload(path, data, { contentType: type, upsert: true });
  if (up.error) throw new Error(`upload ${path}: ${up.error.message}`);
  copied++;
}
console.log(`Copied ${copied} files.`);
