import type { Context } from "@netlify/edge-functions";

// Password-gate for the private Lab dashboard.
// Uses the SAME access code as the Lab API functions: the SHA256 of the
// code must match LAB_ACCESS_CODE_SHA256 (already set in Netlify).
// One code unlocks both the page and the Lab's data.

const REALM = "Proactive Digital Lab";
const USERNAME = "todd";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function gate(request: Request, context: Context) {
  const expected = Netlify.env.get("LAB_ACCESS_CODE_SHA256") ?? "";

  if (!/^[a-f0-9]{64}$/i.test(expected)) {
    return new Response("The Lab access code is not configured yet.", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }

  const header = request.headers.get("authorization") ?? "";
  let authorized = false;
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      if (sep > 0 && decoded.slice(0, sep) === USERNAME) {
        const code = decoded.slice(sep + 1).replace(/\s/g, "").toUpperCase();
        authorized = (await sha256Hex(code)).toLowerCase() === expected.toLowerCase();
      }
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return new Response("Restricted area. Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${REALM}"`,
        "content-type": "text/plain",
      },
    });
  }

  return context.next();
}

export const config = { path: ["/lab.html", "/lab"] };
