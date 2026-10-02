import type { Context } from "@netlify/edge-functions";

// Password-gate for the private Lab dashboard.
// The password lives in the LAB_PASSWORD environment variable
// (Netlify dashboard > Site configuration > Environment variables),
// never in this repo.

const REALM = "Proactive Digital Lab";
const USERNAME = "todd";

export default async function gate(request: Request, context: Context) {
  const password = Netlify.env.get("LAB_PASSWORD");

  if (!password) {
    return new Response(
      "The Lab is not configured yet. Set the LAB_PASSWORD environment variable in Netlify.",
      { status: 503, headers: { "content-type": "text/plain" } }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  let authorized = false;
  if (header.startsWith("Basic ")) {
    try {
      authorized = atob(header.slice(6)) === `${USERNAME}:${password}`;
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
